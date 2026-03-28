"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";
import { trendRegression } from "@/lib/stats/regression";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface TrendAlert {
  metric: string;
  label: string;
  direction: "up" | "down";
  days: number;
  severity: "warning" | "alert";
  message: string;
  detail: string;
}

const MONITORED = [
  { key: "restingHeartRate", label: "Pulsul in repaus", field: "mean" as const, badDirection: "up" as const },
  { key: "hrv", label: "HRV", field: "mean" as const, badDirection: "down" as const },
  { key: "oxygenSaturation", label: "SpO2", field: "mean" as const, badDirection: "down" as const },
  { key: "stepCount", label: "Pasii zilnici", field: "sum" as const, badDirection: "down" as const },
  { key: "vo2Max", label: "VO2 Max", field: "mean" as const, badDirection: "down" as const },
];

function countConsecutiveTrend(values: number[], direction: "up" | "down"): number {
  // Count consecutive days where 3-day SMA is moving in direction
  let count = 0;
  for (let i = values.length - 1; i >= 3; i--) {
    const sma3now = (values[i] + values[i - 1] + values[i - 2]) / 3;
    const sma3prev = (values[i - 1] + values[i - 2] + values[i - 3]) / 3;
    const moving = direction === "up" ? sma3now > sma3prev : sma3now < sma3prev;
    if (moving) count++;
    else break;
  }
  return count;
}

export function TrendAlerts({ metrics, sleepNights }: Props) {
  const alerts = useMemo(() => {
    const result: TrendAlert[] = [];

    for (const { key, label, field, badDirection } of MONITORED) {
      const data = metrics[key];
      if (!data || data.length < 21) continue;

      const last21 = data.slice(-21);
      const values = last21.map(d => d[field]);
      const consecutiveDays = countConsecutiveTrend(values, badDirection);

      if (consecutiveDays >= 7) {
        const reg = trendRegression(values.slice(-consecutiveDays));
        const startVal = values[values.length - consecutiveDays];
        const endVal = values[values.length - 1];
        const changePct = startVal > 0 ? ((endVal - startVal) / startVal * 100) : 0;

        const severity = consecutiveDays >= 12 ? "alert" as const : "warning" as const;

        result.push({
          metric: key, label,
          direction: badDirection,
          days: consecutiveDays,
          severity,
          message: `${label} ${badDirection === "up" ? "creste" : "scade"} de ${consecutiveDays} zile consecutiv`,
          detail: `De la ${startVal.toFixed(METRIC_CONFIG[key]?.decimals ?? 0)} la ${endVal.toFixed(METRIC_CONFIG[key]?.decimals ?? 0)} ${METRIC_CONFIG[key]?.unit || ""} (${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%). ${reg?.significant ? `Trend confirmat statistic (R²=${reg.r2.toFixed(2)}).` : ""} ${severity === "alert" ? "Necesita atentie imediata." : "Monitorizeaza in continuare."}`,
        });
      }
    }

    // Sleep trend
    if (sleepNights.length >= 21) {
      const last21 = sleepNights.slice(-21);
      const durations = last21.map(n => n.totalMinutes / 60);
      const downDays = countConsecutiveTrend(durations, "down");
      if (downDays >= 7) {
        const start = durations[durations.length - downDays];
        const end = durations[durations.length - 1];
        result.push({
          metric: "sleep", label: "Durata somnului",
          direction: "down", days: downDays,
          severity: downDays >= 10 ? "alert" : "warning",
          message: `Durata somnului scade de ${downDays} zile`,
          detail: `De la ${start.toFixed(1)}h la ${end.toFixed(1)}h. Datoria de somn se acumuleaza exponential dupa 5+ zile de deficit.`,
        });
      }
    }

    return result.sort((a, b) => b.days - a.days);
  }, [metrics, sleepNights]);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 animate-in">
      {alerts.map(alert => (
        <div key={alert.metric} className="p-3 rounded-xl border" style={{
          background: alert.severity === "alert" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.06)",
          borderColor: alert.severity === "alert" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
        }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">{alert.severity === "alert" ? "🔴" : "🟡"}</span>
            <span className="text-xs font-semibold" style={{
              color: alert.severity === "alert" ? "#ef4444" : "#f59e0b"
            }}>{alert.message}</span>
          </div>
          <p className="text-[10px] text-[var(--muted-strong)] leading-relaxed ml-6">{alert.detail}</p>
        </div>
      ))}
    </div>
  );
}
