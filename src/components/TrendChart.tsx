"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Scatter,
} from "recharts";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";
import { sma } from "@/lib/stats/movingAverage";
import { zScores, isAnomaly } from "@/lib/stats/zScore";
import { rollingCI } from "@/lib/stats/confidenceInterval";

interface TrendChartProps {
  metricKey: string;
  data: DailySummary[];
  days?: number;
}

export function TrendChart({ metricKey, data, days = 90 }: TrendChartProps) {
  const config = METRIC_CONFIG[metricKey];

  const chartData = useMemo(() => {
    const sliced = data.slice(-days);
    if (sliced.length < 3) return [];

    const values = sliced.map((d) => d.mean);
    const sma7 = sma(values, 7);
    const zs = zScores(values, 30);
    const cis = rollingCI(values, 30);

    return sliced.map((d, i) => ({
      date: d.date,
      dateShort: d.date.substring(5), // MM-DD
      value: Number(d.mean.toFixed(config?.decimals ?? 1)),
      sma7: sma7[i] !== null ? Number(sma7[i]!.toFixed(config?.decimals ?? 1)) : undefined,
      ciLower: cis[i]?.lower,
      ciUpper: cis[i]?.upper,
      ciRange: cis[i] ? [cis[i]!.lower, cis[i]!.upper] : undefined,
      anomaly: isAnomaly(zs[i]) ? d.mean : undefined,
      z: zs[i],
    }));
  }, [data, days, config]);

  if (!config || chartData.length < 3) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6 text-center text-muted">
        Insuficiente date pentru trendul {config?.label || metricKey}
      </div>
    );
  }

  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">
          {config.label}
          <span className="text-muted ml-2 font-normal">
            {config.unit} · last {days}d
          </span>
        </h3>
        <div className="flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded bg-muted/50 inline-block" /> zilnic
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded inline-block" style={{ background: config.color }} /> medie 7z
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded inline-block bg-accent/20" /> 95% CI
          </span>
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <XAxis
              dataKey="dateShort"
              tick={{ fill: "#737373", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "#737373", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#999" }}
              formatter={(val, name) => {
                const labels: Record<string, string> = {
                  value: "Value",
                  sma7: "7d Avg",
                  anomaly: "Anomaly",
                };
                return [Number(val).toFixed(config.decimals), labels[String(name)] || String(name)];
              }}
            />

            {/* CI band */}
            <Area
              dataKey="ciRange"
              stroke="none"
              fill="#10b981"
              fillOpacity={0.08}
              isAnimationActive={false}
            />

            {/* Daily values */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#525252"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />

            {/* 7-day SMA */}
            <Line
              type="monotone"
              dataKey="sma7"
              stroke={config.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />

            {/* Anomaly dots */}
            <Scatter
              dataKey="anomaly"
              fill="#ef4444"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
