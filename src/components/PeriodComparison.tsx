"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG, getDisplayValue } from "@/lib/parser/healthTypes";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  windowDays: number;
  periodLabel: string;
}

interface CompRow {
  label: string;
  unit: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number;
  improving: boolean;
}

const COMPARE_KEYS = [
  "restingHeartRate", "hrv", "stepCount", "exerciseTime",
  "oxygenSaturation", "respiratoryRate",
];

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

export function PeriodComparison({ metrics, allMetrics, sleepNights, allSleep, windowDays, periodLabel }: Props) {
  const rows = useMemo(() => {
    const result: CompRow[] = [];

    for (const key of COMPARE_KEYS) {
      const data = metrics[key];
      const allData = allMetrics[key];
      const cfg = METRIC_CONFIG[key];
      if (!data || !cfg || data.length < 5) continue;

      const curVals = data.map(d => getDisplayValue(d, key));
      const curAvg = avg(curVals);

      const sorted = (allData || data).slice().sort((a, b) => a.date.localeCompare(b.date));
      const firstDate = data[0]?.date;
      const prevData = sorted.filter(d => d.date < firstDate).slice(-windowDays);
      if (prevData.length < 5) continue;

      const prevAvg = avg(prevData.map(d => getDisplayValue(d, key)));
      const delta = curAvg - prevAvg;
      const deltaPct = prevAvg !== 0 ? (delta / prevAvg) * 100 : 0;
      const improving = cfg.higherIsBetter ? delta > 0 : delta < 0;

      result.push({ label: cfg.label, unit: cfg.unit, current: curAvg, previous: prevAvg, delta, deltaPct, improving });
    }

    // Sleep
    if (sleepNights.length >= 5 && allSleep.length > sleepNights.length) {
      const curAvgH = avg(sleepNights.map(n => n.totalMinutes / 60));
      const sleepSorted = [...allSleep].sort((a, b) => a.date.localeCompare(b.date));
      const firstSleepDate = sleepNights[0]?.date;
      const prevSleep = sleepSorted.filter(n => n.date < firstSleepDate).slice(-windowDays);
      if (prevSleep.length >= 5) {
        const prevAvgH = avg(prevSleep.map(n => n.totalMinutes / 60));
        const delta = curAvgH - prevAvgH;
        const deltaPct = prevAvgH !== 0 ? (delta / prevAvgH) * 100 : 0;
        result.push({ label: "Somn", unit: "h", current: curAvgH, previous: prevAvgH, delta, deltaPct, improving: delta > 0 });
      }
    }

    return result;
  }, [metrics, allMetrics, sleepNights, allSleep, windowDays]);

  if (rows.length < 3) return null;

  const improvements = rows.filter(r => r.improving && Math.abs(r.deltaPct) >= 2);
  const declines = rows.filter(r => !r.improving && Math.abs(r.deltaPct) >= 2);

  return (
    <section>
      <div className="hh-section-label">
        <span>Comparatie: {periodLabel} vs anterior</span>
      </div>
      <div className="hh-card" style={{ minWidth: 0, padding: 0 }}>
        {/* Table header */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 70px 70px 60px",
          padding: "10px 16px", borderBottom: "0.5px solid var(--separator)",
        }}>
          <span className="hh-footnote" style={{ color: "var(--label-tertiary)", fontWeight: 500 }}>Metrica</span>
          <span className="hh-footnote" style={{ color: "var(--label-tertiary)", fontWeight: 500, textAlign: "right" }}>Acum</span>
          <span className="hh-footnote" style={{ color: "var(--label-tertiary)", fontWeight: 500, textAlign: "right" }}>Inainte</span>
          <span className="hh-footnote" style={{ color: "var(--label-tertiary)", fontWeight: 500, textAlign: "right" }}>Delta</span>
        </div>

        {rows.map(row => {
          const deltaColor = Math.abs(row.deltaPct) < 2
            ? "var(--label-tertiary)"
            : row.improving ? "#34C759" : "#FF3B30";
          const dec = row.unit === "h" ? 1 : row.label === "Pasi" ? 0 : row.unit === "%" ? 1 : 0;
          const fmt = (v: number) => v.toLocaleString("ro-RO", { minimumFractionDigits: dec, maximumFractionDigits: dec });

          return (
            <div key={row.label} style={{
              display: "grid", gridTemplateColumns: "1fr 70px 70px 60px",
              padding: "10px 16px", borderBottom: "0.5px solid var(--separator)",
              alignItems: "center",
            }}>
              <div>
                <span className="hh-footnote" style={{ fontWeight: 500 }}>{row.label}</span>
                <span className="hh-footnote" style={{ color: "var(--label-tertiary)", marginLeft: 4 }}>{row.unit}</span>
              </div>
              <span className="hh-mono-num hh-footnote" style={{ textAlign: "right", fontWeight: 600 }}>
                {fmt(row.current)}
              </span>
              <span className="hh-mono-num hh-footnote" style={{ textAlign: "right", color: "var(--label-tertiary)" }}>
                {fmt(row.previous)}
              </span>
              <span className="hh-mono-num hh-footnote" style={{ textAlign: "right", fontWeight: 600, color: deltaColor }}>
                {row.deltaPct > 0 ? "+" : ""}{row.deltaPct.toFixed(1)}%
              </span>
            </div>
          );
        })}

        {/* Summary footer */}
        <div style={{ padding: "12px 16px" }}>
          {improvements.length > 0 && (
            <p className="hh-footnote" style={{ color: "#34C759", margin: "0 0 4px" }}>
              ↑ Imbunatatiri: {improvements.map(r => r.label).join(", ")}
            </p>
          )}
          {declines.length > 0 && (
            <p className="hh-footnote" style={{ color: "#FF3B30", margin: 0 }}>
              ↓ De urmarit: {declines.map(r => r.label).join(", ")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
