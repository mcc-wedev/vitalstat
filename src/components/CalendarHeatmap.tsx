"use client";

import { useMemo, useState } from "react";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";

interface Props {
  metrics: Record<string, DailySummary[]>;
}

const HEATMAP_METRICS = [
  "stepCount", "exerciseTime", "activeEnergy", "restingHeartRate", "hrv",
];

export function CalendarHeatmap({ metrics }: Props) {
  const availableKeys = useMemo(() => HEATMAP_METRICS.filter(k => metrics[k]?.length >= 30), [metrics]);
  const [selectedKey, setSelectedKey] = useState(availableKeys[0] || "stepCount");

  const data = useMemo(() => {
    const d = metrics[selectedKey];
    if (!d || d.length < 7) return { cells: [], months: [] };

    const cfg = METRIC_CONFIG[selectedKey];
    const vals = d.map(x => cfg?.aggregation === "sum" ? x.sum : x.mean);
    const { mean, std } = meanStd(vals);

    // Build week grid (last 90 days)
    const last90 = d.slice(-90);
    const cells = last90.map(item => {
      const v = cfg?.aggregation === "sum" ? item.sum : item.mean;
      const z = std > 0 ? (v - mean) / std : 0;
      // Map z-score to intensity 0-4
      let level: number;
      const higher = cfg?.higherIsBetter ?? true;
      const effectiveZ = higher ? z : -z;
      if (effectiveZ >= 1.5) level = 4;
      else if (effectiveZ >= 0.5) level = 3;
      else if (effectiveZ >= -0.5) level = 2;
      else if (effectiveZ >= -1.5) level = 1;
      else level = 0;

      return {
        date: item.date,
        value: v,
        level,
        dow: new Date(item.date).getDay(),
        label: new Date(item.date).toLocaleDateString("ro-RO", { day: "numeric", month: "short" }),
      };
    });

    // Months for labels
    const months: { label: string; col: number }[] = [];
    let lastMonth = "";
    cells.forEach((c, i) => {
      const m = new Date(c.date).toLocaleDateString("ro-RO", { month: "short" });
      if (m !== lastMonth) {
        months.push({ label: m, col: Math.floor(i / 7) });
        lastMonth = m;
      }
    });

    return { cells, months };
  }, [metrics, selectedKey]);

  if (availableKeys.length === 0) return null;

  const COLORS = ["rgba(255,255,255,0.04)", "rgba(16,185,129,0.15)", "rgba(16,185,129,0.3)", "rgba(16,185,129,0.5)", "rgba(16,185,129,0.75)"];

  // Arrange cells into weeks (columns)
  const weeks: typeof data.cells[] = [];
  let week: typeof data.cells = [];
  data.cells.forEach((cell, i) => {
    week.push(cell);
    if (cell.dow === 6 || i === data.cells.length - 1) {
      weeks.push(week);
      week = [];
    }
  });

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Calendar activitate</h3>
        <select
          value={selectedKey}
          onChange={e => setSelectedKey(e.target.value)}
          className="text-[10px] bg-transparent border border-[var(--glass-border)] rounded px-2 py-1 text-[var(--muted-strong)]"
        >
          {availableKeys.map(k => (
            <option key={k} value={k} className="bg-[#0a0a0f]">{METRIC_CONFIG[k]?.label || k}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
        <div className="inline-flex gap-[2px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[2px]">
              {week.map(cell => (
                <div
                  key={cell.date}
                  className="w-[10px] h-[10px] sm:w-3 sm:h-3 rounded-[2px]"
                  style={{ background: COLORS[cell.level] }}
                  title={`${cell.label}: ${cell.value.toFixed(0)} ${METRIC_CONFIG[selectedKey]?.unit || ""}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1 text-[8px] text-[var(--muted)]">
          <span>Mai putin</span>
          {COLORS.map((c, i) => <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />)}
          <span>Mai mult</span>
        </div>
      </div>
    </div>
  );
}
