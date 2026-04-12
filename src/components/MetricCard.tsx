"use client";

import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG, CATEGORIES, getDisplayValue } from "@/lib/parser/healthTypes";

interface MetricCardProps {
  metricKey: string;
  data: DailySummary[];
  onClick?: () => void;
}

/**
 * Apple Health favorite card — pixel-accurate clone.
 *
 *   ┌─────────────────────┐
 *   │ ❤️ Puls in repaus    │  ← category icon + label (13px, category color)
 *   │                     │
 *   │ 58                  │  ← value (28px bold)
 *   │ bpm                 │  ← unit (13px secondary)
 *   │                     │
 *   │ ~~~sparkline~~~~    │  ← 40px area chart, no axis, gradient fill
 *   └─────────────────────┘
 */
export function MetricCard({ metricKey, data, onClick }: MetricCardProps) {
  const config = METRIC_CONFIG[metricKey];

  const { latest, sparkData } = useMemo(() => {
    if (!data || data.length === 0)
      return { latest: null, sparkData: [] };

    const latestVal = getDisplayValue(data[data.length - 1], metricKey);
    const sparkData = data.slice(-30).map(d => ({ v: getDisplayValue(d, metricKey) }));
    return { latest: latestVal, sparkData };
  }, [data, metricKey]);

  if (!config || latest === null) return null;

  const gradId = `spark-${metricKey}`;
  const catIcon = CATEGORIES[config.category]?.icon;

  return (
    <div
      onClick={onClick}
      className="hh-card hh-card-tappable animate-in"
      style={{
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 120,
      }}
    >
      {/* Category icon + label */}
      <div
        className="flex items-center gap-1.5"
        style={{ marginBottom: 8 }}
      >
        {catIcon && (
          <span style={{ fontSize: 14, lineHeight: 1 }}>{catIcon}</span>
        )}
        <span
          className="hh-footnote"
          style={{ color: config.color, fontWeight: 600 }}
        >
          {config.label}
        </span>
      </div>

      {/* Value + unit */}
      <div style={{ marginBottom: "auto" }}>
        <span
          className="hh-mono-num"
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "var(--label-primary)",
            lineHeight: 1.1,
            display: "block",
          }}
        >
          {formatValue(latest, config.decimals)}
        </span>
        {config.unit && (
          <span
            className="hh-footnote"
            style={{ color: "var(--label-secondary)", fontWeight: 400, marginTop: 1, display: "block" }}
          >
            {config.unit}
          </span>
        )}
      </div>

      {/* Sparkline — no axes, no tooltip, just shape + gradient */}
      {sparkData.length > 3 && (
        <div className="hh-chart" style={{ height: 40, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={config.color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={config.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={config.color}
                strokeWidth={1.5}
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
