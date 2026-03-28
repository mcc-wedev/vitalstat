"use client";

import { useMemo } from "react";
import {
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
import { METRIC_CONFIG, getDisplayValue } from "@/lib/parser/healthTypes";
import { sma } from "@/lib/stats/movingAverage";
import { zScores, isAnomaly } from "@/lib/stats/zScore";
import { rollingCI } from "@/lib/stats/confidenceInterval";

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
    const cis = rollingCI(values, 30);

    return data.map((d, i) => ({
      date: d.date,
      dateShort: d.date.substring(5),
      value: Number(values[i].toFixed(config?.decimals ?? 1)),
      sma7: sma7[i] !== null ? Number(sma7[i]!.toFixed(config?.decimals ?? 1)) : undefined,
      ciRange: cis[i] ? [cis[i]!.lower, cis[i]!.upper] : undefined,
      anomaly: isAnomaly(zs[i]) ? values[i] : undefined,
    }));
  }, [data, metricKey, config]);

  if (!config || chartData.length < 3) {
    return (
      <div className="glass p-6 text-center text-[var(--muted)]">
        Insuficiente date pentru {config?.label || metricKey}
      </div>
    );
  }

  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">
          {config.label}
          <span className="text-[var(--muted)] ml-2 font-normal text-xs">
            {config.unit} · {chartData.length}z
          </span>
        </h3>
        <div className="flex gap-3 text-[10px] text-[var(--muted)]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-px inline-block" style={{ background: "rgba(255,255,255,0.2)" }} /> zilnic
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-px inline-block" style={{ background: config.color }} /> medie 7z
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded inline-block" style={{ background: `${config.color}15` }} /> 95% CI
          </span>
        </div>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <XAxis
              dataKey="dateShort"
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              tickLine={false} axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              tickLine={false} axisLine={false} width={40}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(10,10,20,0.95)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                fontSize: "12px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}
              labelStyle={{ color: "rgba(255,255,255,0.5)" }}
              formatter={(val, name) => {
                const labels: Record<string, string> = { value: "Valoare", sma7: "Medie 7z", anomaly: "Anomalie" };
                return [Number(val).toFixed(config.decimals), labels[String(name)] || String(name)];
              }}
            />
            <Area dataKey="ciRange" stroke="none" fill={config.color} fillOpacity={0.06} isAnimationActive={false} />
            <Line type="monotone" dataKey="value" stroke="rgba(255,255,255,0.15)" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="sma7" stroke={config.color} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Scatter dataKey="anomaly" fill="#ef4444" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
