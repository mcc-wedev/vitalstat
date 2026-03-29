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

export function MetricCard({ metricKey, data, onClick }: MetricCardProps) {
  const config = METRIC_CONFIG[metricKey];

  const { latest, trend, trendPct, sparkData } = useMemo(() => {
    if (!data || data.length === 0)
      return { latest: null, trend: "stable" as const, trendPct: 0, sparkData: [] };

    const last30 = data.slice(-30);
    const latestVal = getDisplayValue(last30[last30.length - 1], metricKey);

    const last7 = last30.slice(-7);
    const prev7 = last30.slice(-14, -7);
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

    const sparkData = last30.map(d => ({ v: getDisplayValue(d, metricKey) }));
    return { latest: latestVal, trend, trendPct, sparkData };
  }, [data, metricKey]);

  if (!config || latest === null) return null;

  const trendIsGood =
    trend === "stable" ||
    (trend === "up" && config.higherIsBetter) ||
    (trend === "down" && !config.higherIsBetter);

  const trendColor = trend === "stable" ? "var(--muted)" : trendIsGood ? "#10b981" : "#ef4444";

  return (
    <div
      onClick={onClick}
      className="metric-card"
      style={{ ["--card-accent" as string]: config.color }}
    >
      {/* Top color accent line — always visible */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${config.color}, transparent)`, opacity: 0.5 }}
      />

      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] sm:text-[11px] text-[var(--muted)] uppercase tracking-wider font-medium leading-tight">
          {config.label}
        </span>
      </div>

      <div className="flex items-end gap-2 mb-1">
        <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-none animate-count-up">
          {latest.toFixed(config.decimals)}
        </span>
        {config.unit && (
          <span className="text-[10px] sm:text-[11px] text-[var(--muted)] mb-0.5">{config.unit}</span>
        )}
      </div>

      {/* Trend arrow — prominent */}
      <div className="flex items-center gap-1 mb-3">
        <span
          className="text-sm font-bold"
          style={{ color: trendColor }}
        >
          {trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192"}
        </span>
        <span
          className="text-xs font-semibold tabular-nums"
          style={{ color: trendColor }}
        >
          {Math.abs(trendPct).toFixed(0)}%
        </span>
        <span className="text-[9px] text-[var(--foreground-muted)]">vs 7d ant.</span>
      </div>

      {/* Sparkline with area fill */}
      {sparkData.length > 3 && (
        <div className="h-10 sm:h-12 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={config.color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={config.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={config.color}
                strokeWidth={1.5}
                fill={`url(#grad-${metricKey})`}
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
