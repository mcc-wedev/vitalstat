"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG, getDisplayValue } from "@/lib/parser/healthTypes";
import { mannKendall, smoothCMA, detectChangepoints } from "@/lib/stats/advanced";

interface Props {
  metricKey: string;
  data: DailySummary[];
  /** Window size (days) — drives how trend is computed and labeled */
  windowDays: number;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  TREND ANALYSIS — Mann-Kendall + Changepoint
 *
 *  Runs a statistically rigorous trend analysis on any metric:
 *   • Mann-Kendall non-parametric test (robust to outliers)
 *   • Sen's slope for rate of change
 *   • PELT changepoint detection for regime shifts
 *   • CMA smoothing for visualization
 *
 *  Adapts interpretation text based on window length.
 * ═══════════════════════════════════════════════════════════════
 */
export function TrendAnalysis({ metricKey, data, windowDays }: Props) {
  const config = METRIC_CONFIG[metricKey];

  const analysis = useMemo(() => {
    if (!data || data.length < 10 || !config) return null;
    const values = data.map(d => getDisplayValue(d, metricKey));
    const smoothWindow = windowDays >= 180 ? 14 : windowDays >= 60 ? 7 : 3;
    const smoothed = smoothCMA(values, smoothWindow);

    const mk = mannKendall(values);
    if (!mk) return null;

    // Sen's slope is per-day (since x = day index). Convert.
    const slopePerMonth = mk.sensSlope * 30;
    const slopePerYear = mk.sensSlope * 365;

    const current = smoothed[smoothed.length - 1];
    const start = smoothed[0];
    const totalChange = current - start;
    const pctChange = start !== 0 ? (totalChange / start) * 100 : 0;

    // Changepoints — only meaningful on longer windows
    const cps = windowDays >= 60
      ? detectChangepoints(smoothed, { minSegment: Math.max(10, Math.floor(values.length / 10)) })
      : [];

    // Interpret direction considering whether higher is better
    const direction: "up" | "down" | "flat" =
      !mk.significant || Math.abs(mk.tau) < 0.1 ? "flat" :
      mk.tau > 0 ? "up" : "down";

    const improving =
      direction === "flat" ? null :
      (direction === "up") === config.higherIsBetter;

    const points = data.map((d, i) => ({
      date: d.date,
      dateShort: d.date.substring(5),
      value: Number(values[i].toFixed(config.decimals)),
      smoothed: Number(smoothed[i].toFixed(config.decimals)),
      cp: cps.some(c => c.index === i) ? values[i] : undefined,
    }));

    return {
      points,
      cps,
      mk,
      slopePerMonth,
      slopePerYear,
      current,
      start,
      totalChange,
      pctChange,
      direction,
      improving,
      config,
    };
  }, [data, metricKey, windowDays, config]);

  if (!analysis) return null;

  const directionColor =
    analysis.improving === true ? "#34C759" :
    analysis.improving === false ? "#FF3B30" : "var(--label-secondary)";

  const directionIcon = analysis.direction === "up" ? "↗" : analysis.direction === "down" ? "↘" : "→";

  const windowLabel = windowDays >= 180 ? "an"
    : windowDays >= 60 ? "trimestru"
    : windowDays >= 21 ? "luna"
    : "saptamana";

  return (
    <div className="hh-card animate-in" style={{ minWidth: 0 }}>
      <div className="hh-section-label" style={{ marginBottom: 8 }}>
        <span>{analysis.config.label}</span>
        <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>
          Mann-Kendall
        </span>
      </div>

      {/* Value + direction */}
      <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
        <div>
          <span className="hh-mono-num" style={{ fontSize: 28, fontWeight: 700, color: "var(--label-primary)" }}>
            {analysis.current.toLocaleString("ro-RO", { maximumFractionDigits: analysis.config.decimals })}
          </span>
          <span className="hh-footnote" style={{ color: "var(--label-secondary)", marginLeft: 4 }}>
            {analysis.config.unit}
          </span>
        </div>
        <span className="hh-body hh-mono-num" style={{ color: directionColor, fontWeight: 600 }}>
          {directionIcon} {analysis.pctChange > 0 ? "+" : ""}{analysis.pctChange.toFixed(1)}%
        </span>
      </div>

      {/* Chart */}
      <div className="hh-chart" style={{ height: 140 }}>
        <ResponsiveContainer width="99%" height="100%">
          <LineChart data={analysis.points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="dateShort"
              tick={{ fill: "rgba(235,235,245,0.35)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "rgba(235,235,245,0.35)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(30,30,32,0.95)",
                border: "0.5px solid rgba(84,84,88,0.35)",
                borderRadius: 10,
                fontSize: 12,
                padding: "8px 12px",
              }}
              labelStyle={{ color: "rgba(235,235,245,0.6)", fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="smoothed"
              stroke={analysis.config.color}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            {analysis.cps.map((cp, i) => (
              <ReferenceLine
                key={i}
                x={analysis.points[cp.index]?.dateShort}
                stroke="rgba(255,149,0,0.4)"
                strokeDasharray="2 4"
                label={{ value: "schimbare", fill: "rgba(255,149,0,0.6)", fontSize: 9, position: "top" }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interpretation */}
      <div style={{ marginTop: 10, padding: 10, background: "var(--surface-2)", borderRadius: 10 }}>
        <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.45 }}>
          {analysis.mk.significant ? (
            <>
              Tendinta <b style={{ color: directionColor }}>
                {analysis.direction === "up" ? "de crestere" : analysis.direction === "down" ? "de scadere" : "stabila"}
              </b> statistic semnificativa
              {" "}(τ={analysis.mk.tau.toFixed(2)}, p={analysis.mk.pValue.toFixed(3)}).
              {" "}
              Rata: <b>{analysis.slopePerMonth > 0 ? "+" : ""}{analysis.slopePerMonth.toFixed(analysis.config.decimals)} {analysis.config.unit}/{windowLabel}</b>.
            </>
          ) : (
            <>Nicio tendinta statistic semnificativa detectata (p={analysis.mk.pValue.toFixed(2)}). Metrica este stabila.</>
          )}
          {analysis.cps.length > 0 && (
            <>
              <br/>
              <b style={{ color: "#FF9500" }}>{analysis.cps.length}</b> schimbare{analysis.cps.length > 1 ? "" : ""} de regim detectata{analysis.cps.length > 1 ? "" : ""}.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
