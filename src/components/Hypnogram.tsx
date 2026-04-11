"use client";

import { useMemo, useState } from "react";
import type { SleepNight, SleepStage } from "@/lib/parser/healthTypes";

interface Props {
  sleepNights: SleepNight[];
}

const STAGE_ROWS: { key: SleepStage; label: string; color: string; y: number }[] = [
  { key: "awake", label: "Trezit", color: "#FF3B30", y: 0 },
  { key: "rem",   label: "REM",    color: "#5AC8FA", y: 1 },
  { key: "core",  label: "Core",   color: "#AF52DE", y: 2 },
  { key: "deep",  label: "Deep",   color: "#5856D6", y: 3 },
];

const Y_OF: Record<SleepStage, number> = { awake: 0, rem: 1, core: 2, deep: 3, inBed: 2 };
const COLOR_OF: Record<SleepStage, string> = {
  awake: "#FF3B30",
  rem:   "#5AC8FA",
  core:  "#AF52DE",
  deep:  "#5856D6",
  inBed: "rgba(255,255,255,0.08)",
};

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ""; }
}
function fmtDateRo(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const months = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"];
    const days = ["dum", "lun", "mar", "mie", "joi", "vin", "sam"];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  } catch { return dateStr; }
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  HYPNOGRAM — visualize sleep stages over the night
 *
 *  Stacked rows: Trezit (top) → REM → Core → Deep (bottom).
 *  Uses raw segment data captured during parsing. Older imports
 *  without segments will render nothing.
 *
 *  Default view: most recent night with segments. User can step
 *  through previous nights with arrows.
 * ═══════════════════════════════════════════════════════════════
 */
export function Hypnogram({ sleepNights }: Props) {
  // Nights that actually have segments (post-parser-update imports)
  const nightsWithSegments = useMemo(
    () => sleepNights.filter(n => n.segments && n.segments.length > 0),
    [sleepNights]
  );

  const [idx, setIdx] = useState<number>(Math.max(0, nightsWithSegments.length - 1));

  if (nightsWithSegments.length === 0) {
    return null;
  }

  const safeIdx = Math.min(Math.max(0, idx), nightsWithSegments.length - 1);
  const night = nightsWithSegments[safeIdx];
  const segs = night.segments!;

  // Timeline bounds
  const tStart = new Date(night.bedtime || segs[0].s).getTime();
  const tEnd = new Date(night.wakeTime || segs[segs.length - 1].e).getTime();
  const totalMs = Math.max(1, tEnd - tStart);

  // Count transitions (wakes mid-sleep)
  const wakeEvents = segs.filter(s => s.st === "awake").length;

  // SVG dimensions (scales with container)
  const H = 120;
  const rowH = 22;
  const topPad = 8;

  return (
    <div className="hh-card animate-in" style={{ minWidth: 0 }}>
      <div className="hh-section-label" style={{ marginBottom: 4 }}>
        <span>Hypnogram somn</span>
        <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>
          {fmtDateRo(night.date)}
        </span>
      </div>

      {/* Night selector */}
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIdx(i => Math.max(0, (i === undefined ? nightsWithSegments.length - 1 : i) - 1))}
            disabled={safeIdx === 0}
            className="pill"
            style={{ padding: "4px 10px", fontSize: 12, opacity: safeIdx === 0 ? 0.4 : 1 }}
            aria-label="Noaptea anterioara"
          >
            ‹
          </button>
          <span className="hh-caption" style={{ color: "var(--label-secondary)" }}>
            {safeIdx + 1} / {nightsWithSegments.length}
          </span>
          <button
            type="button"
            onClick={() => setIdx(i => Math.min(nightsWithSegments.length - 1, (i === undefined ? nightsWithSegments.length - 1 : i) + 1))}
            disabled={safeIdx === nightsWithSegments.length - 1}
            className="pill"
            style={{ padding: "4px 10px", fontSize: 12, opacity: safeIdx === nightsWithSegments.length - 1 ? 0.4 : 1 }}
            aria-label="Noaptea urmatoare"
          >
            ›
          </button>
        </div>
        <span className="hh-caption hh-mono-num" style={{ color: "var(--label-secondary)" }}>
          {fmtTime(night.bedtime)} → {fmtTime(night.wakeTime)}
        </span>
      </div>

      {/* Hypnogram SVG */}
      <div className="hh-chart" style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 1000 ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          style={{ display: "block" }}
        >
          {/* Row backgrounds + labels via absolute overlay */}
          {STAGE_ROWS.map((row) => (
            <line
              key={row.key}
              x1={0}
              x2={1000}
              y1={topPad + row.y * rowH + rowH / 2}
              y2={topPad + row.y * rowH + rowH / 2}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          ))}

          {/* Bars — each segment rendered as a rect in its row */}
          {segs.map((seg, i) => {
            const s = (new Date(seg.s).getTime() - tStart) / totalMs;
            const e = (new Date(seg.e).getTime() - tStart) / totalMs;
            const x = Math.max(0, s) * 1000;
            const w = Math.max(1.5, (e - s) * 1000);
            const y = Y_OF[seg.st];
            return (
              <rect
                key={i}
                x={x}
                y={topPad + y * rowH + 4}
                width={w}
                height={rowH - 8}
                fill={COLOR_OF[seg.st]}
                rx={2}
              />
            );
          })}
        </svg>

        {/* Row labels — absolute overlay (independent of viewBox stretch) */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: H,
            pointerEvents: "none",
          }}
        >
          {STAGE_ROWS.map((row) => (
            <div
              key={row.key}
              className="hh-caption-2"
              style={{
                position: "absolute",
                top: topPad + row.y * rowH + 3,
                left: 4,
                color: "var(--label-tertiary)",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {row.label}
            </div>
          ))}
        </div>
      </div>

      {/* Footer stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          marginTop: 12,
          paddingTop: 12,
          borderTop: "0.5px solid var(--separator)",
        }}
      >
        <Stat label="Total" value={`${(night.totalMinutes / 60).toFixed(1)}h`} color="var(--label-primary)" />
        <Stat label="Deep" value={`${Math.round(night.stages.deep)}m`} color="#5856D6" />
        <Stat label="REM" value={`${Math.round(night.stages.rem)}m`} color="#5AC8FA" />
        <Stat label="Treziri" value={`${wakeEvents}`} color={wakeEvents > 5 ? "#FF9500" : "var(--label-primary)"} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="hh-mono-num" style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
      <div className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
