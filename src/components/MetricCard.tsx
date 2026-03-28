"use client";

import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";

interface MetricCardProps {
  metricKey: string;
  data: DailySummary[];
  onClick?: () => void;
}

export function MetricCard({ metricKey, data, onClick }: MetricCardProps) {
  const config = METRIC_CONFIG[metricKey];

  const { latest, trend, trendPct, sparkData } = useMemo(() => {
    if (data.length === 0)
      return { latest: null, trend: "stable" as const, trendPct: 0, sparkData: [] };

    const last30 = data.slice(-30);
    const latest = last30[last30.length - 1];

    // 7-day trend: compare last 7 avg vs previous 7 avg
    const last7 = last30.slice(-7);
    const prev7 = last30.slice(-14, -7);

    let trend: "up" | "down" | "stable" = "stable";
    let trendPct = 0;

    if (last7.length >= 3 && prev7.length >= 3) {
      const avgLast = last7.reduce((s, d) => s + d.mean, 0) / last7.length;
      const avgPrev = prev7.reduce((s, d) => s + d.mean, 0) / prev7.length;
      if (avgPrev > 0) {
        trendPct = ((avgLast - avgPrev) / avgPrev) * 100;
        if (Math.abs(trendPct) > 2) {
          trend = trendPct > 0 ? "up" : "down";
        }
      }
    }

    const sparkData = last30.map((d) => ({ v: d.mean }));

    return { latest, trend, trendPct, sparkData };
  }, [data]);

  if (!config || !latest) return null;

  // Determine if trend direction is "good" or "bad"
  const trendIsGood =
    trend === "stable" ||
    (trend === "up" && config.higherIsBetter) ||
    (trend === "down" && !config.higherIsBetter);

  return (
    <div
      onClick={onClick}
      className="bg-card border border-card-border rounded-xl p-4 hover:border-muted transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-muted uppercase tracking-wider">
          {config.label}
        </span>
        <span
          className={`text-xs font-medium ${
            trend === "stable"
              ? "text-muted"
              : trendIsGood
                ? "text-accent"
                : "text-danger"
          }`}
        >
          {trend === "up" && "↑"}
          {trend === "down" && "↓"}
          {trend === "stable" && "→"}
          {Math.abs(trendPct).toFixed(1)}%
        </span>
      </div>

      <div className="flex items-end gap-2 mb-3">
        <span className="text-2xl font-bold tabular-nums">
          {latest.mean.toFixed(config.decimals)}
        </span>
        <span className="text-xs text-muted mb-0.5">{config.unit}</span>
      </div>

      {sparkData.length > 3 && (
        <div className="h-8 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={config.color}
                strokeWidth={1.5}
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
