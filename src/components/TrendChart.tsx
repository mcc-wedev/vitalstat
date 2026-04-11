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

  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    const vals = chartData.map(d => d.value);
    const latest = vals[vals.length - 1];
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { latest, avg, min, max };
  }, [chartData]);

  if (!config || chartData.length < 3 || !stats) {
    return (
      <div className="hh-card">
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", textAlign: "center" }}>
          Insuficiente date pentru {config?.label || metricKey}
        </p>
      </div>
    );
  }

  return (
    <div className="hh-card animate-in">
      {/* Header: colored dot + label, then mean/range */}
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: config.color }} />
          <span className="hh-headline truncate" style={{ color: "var(--label-primary)" }}>
            {config.label}
          </span>
        </div>
        <span className="hh-footnote shrink-0 ml-2" style={{ color: "var(--label-tertiary)" }}>
          {chartData.length} zile
        </span>
      </div>

      {/* Summary stats row — Apple Health "Range" card style */}
      <div className="flex items-baseline gap-3" style={{ marginBottom: 12 }}>
        <div>
          <span className="hh-mono-num" style={{ fontSize: 28, fontWeight: 700, color: "var(--label-primary)" }}>
            {stats.latest.toLocaleString("ro-RO", { maximumFractionDigits: config.decimals })}
          </span>
          {config.unit && (
            <span className="hh-footnote" style={{ color: "var(--label-secondary)", marginLeft: 4 }}>
              {config.unit}
            </span>
          )}
        </div>
        <div className="hh-footnote" style={{ color: "var(--label-tertiary)" }}>
          Medie: {stats.avg.toLocaleString("ro-RO", { maximumFractionDigits: config.decimals })}
          {" · "}
          Min: {stats.min.toLocaleString("ro-RO", { maximumFractionDigits: config.decimals })}
          {" · "}
          Max: {stats.max.toLocaleString("ro-RO", { maximumFractionDigits: config.decimals })}
        </div>
      </div>

      {/* Chart */}
      <div className="hh-chart" style={{ height: 180 }}>
        <ResponsiveContainer width="99%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`fill-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={config.color} stopOpacity={0.24} />
                <stop offset="100%" stopColor={config.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="dateShort"
              tick={{ fill: "rgba(235,235,245,0.35)", fontSize: 11, fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={48}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "rgba(235,235,245,0.35)", fontSize: 11, fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(30,30,32,0.95)",
                backdropFilter: "blur(20px)",
                border: "0.5px solid rgba(84,84,88,0.35)",
                borderRadius: 10,
                fontSize: 12,
                padding: "8px 12px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}
              labelStyle={{ color: "rgba(235,235,245,0.6)", fontSize: 11 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((val: any, name: any) => {
                const labels: Record<string, string> = { value: "Azi", sma7: "Medie 7z", anomaly: "Anomalie" };
                return [Number(val).toFixed(config.decimals) + (config.unit ? ` ${config.unit}` : ""), labels[String(name)] || String(name)];
              }) as any}
            />
            <Area
              type="monotone"
              dataKey="sma7"
              stroke="none"
              fill={`url(#fill-${metricKey})`}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="sma7"
              stroke={config.color}
              strokeWidth={2.2}
              dot={false}
              isAnimationActive={false}
            />
            <Scatter dataKey="anomaly" fill="#FF3B30" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
