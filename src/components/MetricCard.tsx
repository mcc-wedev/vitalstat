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

  const { latest, trend, trendPct, sparkData, trendLabel, avg } = useMemo(() => {
    if (!data || data.length === 0)
      return { latest: null, trend: "stable" as const, trendPct: 0, sparkData: [], trendLabel: "", avg: null };

    const latestVal = getDisplayValue(data[data.length - 1], metricKey);

    const n = data.length;
    let trend: "up" | "down" | "stable" = "stable";
    let trendPct = 0;
    let trendLabel = "";
    let avg: number | null = null;

    if (n >= 4) {
      const halfLen = Math.min(Math.floor(n / 2), 14);
      const recentHalf = data.slice(-halfLen);
      const prevHalf = data.slice(-(halfLen * 2), -halfLen);

      if (recentHalf.length >= 2 && prevHalf.length >= 2) {
        const avgRecent = recentHalf.reduce((s, d) => s + getDisplayValue(d, metricKey), 0) / recentHalf.length;
        const avgPrev = prevHalf.reduce((s, d) => s + getDisplayValue(d, metricKey), 0) / prevHalf.length;
        if (avgPrev > 0) {
          trendPct = ((avgRecent - avgPrev) / avgPrev) * 100;
          if (Math.abs(trendPct) > 2) trend = trendPct > 0 ? "up" : "down";
        }
        trendLabel = `vs ${halfLen}z ant.`;
      }
    } else if (n === 1) {
      trendLabel = "azi";
    } else {
      trendLabel = `${n}z`;
    }

    // Calculate rolling average for last 28 days (or all data if less)
    const avgWindow = data.slice(-28);
    if (avgWindow.length >= 3) {
      avg = avgWindow.reduce((s, d) => s + getDisplayValue(d, metricKey), 0) / avgWindow.length;
    }

    const sparkData = data.map(d => ({ v: getDisplayValue(d, metricKey) }));
    return { latest: latestVal, trend, trendPct, sparkData, trendLabel, avg };
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
    >
      {/* Category color dot + label */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: config.color }}
        />
        <span
          className="text-[13px] font-normal leading-tight"
          style={{ color: "rgba(235,235,245,0.6)" }}
        >
          {config.label}
        </span>
      </div>

      {/* Large bold value */}
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-[28px] font-bold tabular-nums leading-none">
          {latest.toFixed(config.decimals)}
        </span>
        {config.unit && (
          <span
            className="text-[15px] font-normal"
            style={{ color: "rgba(235,235,245,0.6)" }}
          >
            {config.unit}
          </span>
        )}
      </div>

      {/* Average + trend as footnote */}
      <div className="flex items-center gap-2 mb-3">
        {avg !== null && (
          <span
            className="text-[13px]"
            style={{ color: "rgba(235,235,245,0.3)" }}
          >
            medie 28z: {avg.toFixed(config.decimals)}
          </span>
        )}
        {trend !== "stable" && (
          <span
            className="text-[13px] tabular-nums"
            style={{ color: trendIsGood ? "#34C759" : "#FF3B30" }}
          >
            {trend === "up" ? "+" : ""}{trendPct.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Sparkline with category color */}
      {sparkData.length > 3 && (
        <div className="h-10 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={config.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={config.color} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={config.color}
                strokeWidth={2}
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
