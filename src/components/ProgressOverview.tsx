"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG, getDisplayValue } from "@/lib/parser/healthTypes";

interface ProgressOverviewProps {
  /** Always full (unfiltered) dataset — progress is always "this period vs last period" */
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  /** How many days in current period */
  windowDays: number;
  /** Display label for the period */
  periodLabel: string;
}

interface Row {
  key: string;
  label: string;
  unit: string;
  color: string;
  current: number;
  previous: number;
  deltaPct: number;
  deltaAbs: number;
  improved: boolean;
  decimals: number;
}

/**
 * Apple Health–style "Trends" section.
 *
 * Shows 4 key metrics as LARGE numbers with clear week-over-week
 * (or period-over-period) comparisons. This is what the user actually
 * wants to see: "Am progres? Da, pasii au crescut cu 12%."
 */
export function ProgressOverview({ metrics, sleepNights, windowDays, periodLabel }: ProgressOverviewProps) {
  const rows = useMemo<Row[]>(() => {
    const W = Math.max(7, Math.min(windowDays, 90));
    const result: Row[] = [];

    const checks: Array<{ key: string; useSum: boolean }> = [
      { key: "stepCount", useSum: true },
      { key: "hrv", useSum: false },
      { key: "restingHeartRate", useSum: false },
      { key: "exerciseTime", useSum: true },
    ];

    for (const { key } of checks) {
      const data = metrics[key];
      const config = METRIC_CONFIG[key];
      if (!data || data.length < W * 2 || !config) continue;

      const last = data.slice(-W);
      const prev = data.slice(-W * 2, -W);
      if (last.length < 3 || prev.length < 3) continue;

      const avgLast = last.reduce((s, d) => s + getDisplayValue(d, key), 0) / last.length;
      const avgPrev = prev.reduce((s, d) => s + getDisplayValue(d, key), 0) / prev.length;
      if (avgPrev === 0) continue;

      const deltaPct = ((avgLast - avgPrev) / avgPrev) * 100;
      const deltaAbs = avgLast - avgPrev;
      const improved = config.higherIsBetter ? deltaPct > 0 : deltaPct < 0;

      result.push({
        key,
        label: config.label,
        unit: config.unit,
        color: config.color,
        current: avgLast,
        previous: avgPrev,
        deltaPct,
        deltaAbs,
        improved,
        decimals: config.decimals,
      });
    }

    // Sleep row — from sleepNights, not metrics
    if (sleepNights.length >= W * 2) {
      const last = sleepNights.slice(-W);
      const prev = sleepNights.slice(-W * 2, -W);
      if (last.length >= 3 && prev.length >= 3) {
        const avgLast = last.reduce((s, n) => s + n.totalMinutes / 60, 0) / last.length;
        const avgPrev = prev.reduce((s, n) => s + n.totalMinutes / 60, 0) / prev.length;
        if (avgPrev > 0) {
          const deltaPct = ((avgLast - avgPrev) / avgPrev) * 100;
          const deltaAbs = avgLast - avgPrev;
          result.push({
            key: "sleep",
            label: "Somn",
            unit: "h",
            color: "#AF52DE",
            current: avgLast,
            previous: avgPrev,
            deltaPct,
            deltaAbs,
            improved: deltaPct > 0, // more sleep = better (until 9h, but keep simple)
            decimals: 1,
          });
        }
      }
    }

    return result.slice(0, 4);
  }, [metrics, sleepNights, windowDays]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="hh-card animate-in">
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <span
          className="hh-caption"
          style={{
            color: "var(--label-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.045em",
            fontWeight: 500,
          }}
        >
          Progres · medie {periodLabel.toLowerCase()}
        </span>
        <span className="hh-caption" style={{ color: "var(--label-tertiary)" }}>
          vs. perioada anterioara
        </span>
      </div>

      {/* Rows — vertical list, Apple Health summary style */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => {
          const isLast = i === rows.length - 1;
          return (
            <div
              key={r.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 0",
                borderBottom: isLast ? "none" : "0.5px solid rgba(84,84,88,0.3)",
              }}
            >
              {/* Left: colored dot + label */}
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="shrink-0 rounded-full"
                  style={{ width: 10, height: 10, background: r.color }}
                />
                <span className="hh-body" style={{ color: "var(--label-primary)", fontWeight: 500 }}>
                  {r.label}
                </span>
              </div>

              {/* Right: current value + delta */}
              <div style={{ textAlign: "right" }}>
                <div className="hh-mono-num" style={{ fontSize: 22, fontWeight: 700, color: "var(--label-primary)", lineHeight: 1.1 }}>
                  {formatValue(r.current, r.decimals, r.key)}
                  {r.unit && <span className="hh-footnote" style={{ color: "var(--label-secondary)", fontWeight: 500, marginLeft: 3 }}>{r.unit}</span>}
                </div>
                <div
                  className="hh-caption hh-mono-num"
                  style={{
                    color: r.improved ? "var(--success)" : "var(--danger)",
                    fontWeight: 600,
                    marginTop: 1,
                  }}
                >
                  {r.deltaPct > 0 ? "↑" : "↓"} {Math.abs(r.deltaPct).toFixed(0)}%
                  <span style={{ color: "var(--label-tertiary)", marginLeft: 4, fontWeight: 400 }}>
                    ({r.deltaAbs > 0 ? "+" : ""}{formatValue(r.deltaAbs, r.decimals, r.key)}{r.unit && " " + r.unit})
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatValue(val: number, decimals: number, key: string): string {
  // Big integers: use locale separator
  if (key === "stepCount" || Math.abs(val) >= 10000) {
    return Math.round(val).toLocaleString("ro-RO");
  }
  return val.toLocaleString("ro-RO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
