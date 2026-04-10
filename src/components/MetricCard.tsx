"use client";

import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG, getDisplayValue } from "@/lib/parser/healthTypes";

interface MetricCardProps {
  metricKey: string;
  data: DailySummary[];
  onClick?: () => void;
}

/**
 * Apple Health–style metric card.
 *
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │ ● CATEGORY LABEL         Today  │  ← footnote, colored dot
 *   │                                 │
 *   │ 72 bpm             ↓ 3%         │  ← title-1 number + unit
 *   │                                 │
 *   │ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  │  ← sparkline (area)
 *   └─────────────────────────────────┘
 */
export function MetricCard({ metricKey, data, onClick }: MetricCardProps) {
  const config = METRIC_CONFIG[metricKey];

  const { latest, trend, trendPct, sparkData } = useMemo(() => {
    if (!data || data.length === 0)
      return { latest: null, trend: "stable" as const, trendPct: 0, sparkData: [] };

    const latestVal = getDisplayValue(data[data.length - 1], metricKey);

    // Trend: last 7 days vs previous 7 days (only when enough data)
    const last7 = data.slice(-7);
    const prev7 = data.slice(-14, -7);
    let trend: "up" | "down" | "stable" = "stable";
    let trendPct = 0;

    if (last7.length >= 3 && prev7.length >= 3) {
      const avgLast = last7.reduce((s, d) => s + getDisplayValue(d, metricKey), 0) / last7.length;
      const avgPrev = prev7.reduce((s, d) => s + getDisplayValue(d, metricKey), 0) / prev7.length;
      if (avgPrev > 0) {
        trendPct = ((avgLast - avgPrev) / avgPrev) * 100;
        if (Math.abs(trendPct) > 2) trend = trendPct > 0 ? "up" : "down";
      }
    }

    // Sparkline: up to last 30 points
    const sparkData = data.slice(-30).map(d => ({ v: getDisplayValue(d, metricKey) }));
    return { latest: latestVal, trend, trendPct, sparkData };
  }, [data, metricKey]);

  if (!config || latest === null) return null;

  const trendIsGood =
    trend === "stable" ||
    (trend === "up" && config.higherIsBetter) ||
    (trend === "down" && !config.higherIsBetter);

  const trendColor = trend === "stable"
    ? "var(--label-tertiary)"
    : trendIsGood
      ? "var(--success)"
      : "var(--danger)";

  const gradId = `spark-${metricKey}`;

  return (
    <div
      onClick={onClick}
      className="hh-card hh-card-tappable animate-in"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      {/* Top row: category label with colored dot */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: config.color }}
          />
          <span
            className="hh-caption truncate"
            style={{ color: "var(--label-secondary)", fontWeight: 500 }}
          >
            {config.label}
          </span>
        </div>
        {trend !== "stable" && (
          <span
            className="hh-caption-2 hh-mono-num shrink-0 ml-2"
            style={{ color: trendColor }}
          >
            {trend === "up" ? "↑" : "↓"} {Math.abs(trendPct).toFixed(0)}%
          </span>
        )}
      </div>

      {/* Main value */}
      <div className="flex items-baseline gap-1 mb-3">
        <span
          className="hh-mono-num"
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "var(--label-primary)",
            lineHeight: 1,
          }}
        >
          {formatValue(latest, config.decimals)}
        </span>
        {config.unit && (
          <span
            className="hh-footnote"
            style={{ color: "var(--label-secondary)", fontWeight: 500 }}
          >
            {config.unit}
          </span>
        )}
      </div>

      {/* Sparkline */}
      {sparkData.length > 3 && (
        <div className="hh-chart" style={{ height: 32 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={config.color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={config.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={config.color}
                strokeWidth={1.8}
                fill={`url(#${gradId})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function formatValue(val: number, decimals: number): string {
  if (Math.abs(val) >= 10000) {
    return val.toLocaleString("ro-RO", { maximumFractionDigits: 0 });
  }
  return val.toLocaleString("ro-RO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
