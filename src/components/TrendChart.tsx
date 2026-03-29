"use client";

import { useMemo } from "react";
import {
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
} from "recharts";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG, getDisplayValue } from "@/lib/parser/healthTypes";
import { sma } from "@/lib/stats/movingAverage";
import { zScores, isAnomaly } from "@/lib/stats/zScore";

interface TrendChartProps {
  metricKey: string;
  data: DailySummary[];
}

export function TrendChart({ metricKey, data }: TrendChartProps) {
  const config = METRIC_CONFIG[metricKey];

  const chartData = useMemo(() => {
    if (!data || data.length < 3) return [];

    const values = data.map(d => getDisplayValue(d, metricKey));
    const sma7 = sma(values, 7);
    const zs = zScores(values, 30);

    return data.map((d, i) => ({
      date: d.date,
      dateShort: d.date.substring(5),
      value: Number(values[i].toFixed(config?.decimals ?? 1)),
      sma7: sma7[i] !== null ? Number(sma7[i]!.toFixed(config?.decimals ?? 1)) : undefined,
      anomaly: isAnomaly(zs[i]) ? values[i] : undefined,
    }));
  }, [data, metricKey, config]);

  if (!config || chartData.length < 3) {
    return (
      <div className="glass p-6 text-center" style={{ color: "rgba(235,235,245,0.3)" }}>
        Insuficiente date pentru {config?.label || metricKey}
      </div>
    );
  }

  return (
    <div className="glass p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: config.color }} />
          <h3 className="text-[17px] font-normal text-white">
            {config.label}
          </h3>
          <span className="text-[13px]" style={{ color: "rgba(235,235,245,0.3)" }}>
            {chartData.length}z
          </span>
        </div>
      </div>

      <div className="h-56 sm:h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id={`fill-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={config.color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={config.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="dateShort"
              tick={{ fill: "rgba(235,235,245,0.3)", fontSize: 11 }}
              tickLine={false} axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "rgba(235,235,245,0.3)", fontSize: 11 }}
              tickLine={false} axisLine={false} width={38}
            />
            <Tooltip
              contentStyle={{
                background: "#1C1C1E",
                border: "none",
                borderRadius: "12px",
                fontSize: "13px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}
              labelStyle={{ color: "rgba(235,235,245,0.6)" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((val: any, name: any) => {
                const labels: Record<string, string> = { value: "Valoare", sma7: "Medie 7z", anomaly: "Anomalie" };
                return [Number(val).toFixed(config.decimals), labels[String(name)] || String(name)];
              }) as any}
            />
            {/* Gradient fill area using sma7 */}
            <Area
              type="monotone"
              dataKey="sma7"
              stroke="none"
              fill={`url(#fill-${metricKey})`}
              isAnimationActive={false}
            />
            {/* 7-day SMA — thick category colored line */}
            <Line
              type="monotone"
              dataKey="sma7"
              stroke={config.color}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            {/* Daily value — subtle thin line */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
            {/* Anomalies */}
            <Scatter dataKey="anomaly" fill="#FF3B30" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
