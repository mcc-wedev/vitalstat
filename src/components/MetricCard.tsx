"use client";

import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
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

  return (
    <div
      onClick={onClick}
      className="metric-card"
      style={{ ["--card-accent" as string]: config.color }}
    >
      {/* Top color line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-40"
        style={{ background: `linear-gradient(90deg, transparent, ${config.color}, transparent)` }}
      />

      <div className="flex items-start justify-between mb-1.5">
        <span className="text-[10px] sm:text-[11px] text-[var(--muted)] uppercase tracking-wider font-medium leading-tight">
          {config.label}
        </span>
        <span
          className={`text-[10px] sm:text-xs font-semibold tabular-nums shrink-0 ml-1 ${
            trend === "stable" ? "text-[var(--muted)]"
              : trendIsGood ? "text-[#10b981]" : "text-[#ef4444]"
          }`}
        >
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          {Math.abs(trendPct).toFixed(0)}%
        </span>
      </div>

      <div className="flex items-end gap-1 mb-2">
        <span className="text-xl sm:text-2xl font-bold tabular-nums leading-none">
          {latest.toFixed(config.decimals)}
        </span>
        {config.unit && (
          <span className="text-[9px] sm:text-[10px] text-[var(--muted)] mb-0.5">{config.unit}</span>
        )}
      </div>

      {sparkData.length > 3 && (
        <div className="h-8 sm:h-10 w-full opacity-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={config.color}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
