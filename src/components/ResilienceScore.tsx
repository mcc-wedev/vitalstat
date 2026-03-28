"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

// Oura Resilience: 14-day rolling balance of stress load vs recovery capacity
// Three contributors: daytime recovery, nighttime recovery, stress tolerance
export function ResilienceScore({ metrics, sleepNights }: Props) {
  const resilience = useMemo(() => {
    const hrv = metrics.hrv;
    const rhr = metrics.restingHeartRate;
    if (!hrv || hrv.length < 42 || !rhr || rhr.length < 42) return null;

    // 14-day window vs 90-day baseline (Oura methodology)
    const hrv14 = hrv.slice(-14).map(d => d.mean);
    const hrv90 = hrv.slice(-90).map(d => d.mean);
    const rhr14 = rhr.slice(-14).map(d => d.mean);
    const rhr90 = rhr.slice(-90).map(d => d.mean);

    const { mean: hrvRecent } = meanStd(hrv14);
    const { mean: hrvBase, std: hrvStd } = meanStd(hrv90);
    const { mean: rhrRecent } = meanStd(rhr14);
    const { mean: rhrBase, std: rhrStd } = meanStd(rhr90);

    // Component 1: HRV Trend (is your HRV stable or improving over 14 days?)
    const hrvZ = hrvStd > 0 ? (hrvRecent - hrvBase) / hrvStd : 0;
    const hrvTrend = Math.min(100, Math.max(0, 50 + hrvZ * 20));

    // Component 2: RHR Stability (is your RHR not drifting up?)
    const rhrZ = rhrStd > 0 ? (rhrRecent - rhrBase) / rhrStd : 0;
    const rhrStability = Math.min(100, Math.max(0, 50 - rhrZ * 20));

    // Component 3: Sleep Consistency (are you sleeping enough consistently?)
    let sleepConsistency = 50;
    const sleep14 = sleepNights.slice(-14);
    if (sleep14.length >= 10) {
      const durations = sleep14.map(n => n.totalMinutes / 60);
      const { mean: sAvg, std: sStd } = meanStd(durations);
      const cv = sAvg > 0 ? sStd / sAvg : 1;
      sleepConsistency = sAvg >= 7 ? (cv < 0.1 ? 95 : cv < 0.15 ? 80 : cv < 0.2 ? 65 : 50) : 30;
    }

    // Component 4: HRV Variability (healthy variability = good resilience)
    const { std: hrvDailyStd } = meanStd(hrv14);
    const hrvCV = hrvRecent > 0 ? (hrvDailyStd / hrvRecent) * 100 : 0;
    // Optimal CV: 8-15% (Plews 2013). Too low = overreaching, too high = unstable
    const hrvVariability = hrvCV >= 8 && hrvCV <= 15 ? 90
      : hrvCV >= 5 && hrvCV <= 20 ? 70
      : hrvCV < 5 ? 40 : 50;

    const score = Math.round(hrvTrend * 0.35 + rhrStability * 0.25 + sleepConsistency * 0.25 + hrvVariability * 0.15);

    // Level
    const level = score >= 80 ? "Exceptional" : score >= 65 ? "Solid" : score >= 50 ? "Adecvat" : score >= 35 ? "Fragil" : "Vulnerabil";
    const color = score >= 80 ? "#10b981" : score >= 65 ? "#22d3ee" : score >= 50 ? "#f59e0b" : score >= 35 ? "#f97316" : "#ef4444";

    const description = score >= 80
      ? "Corpul tau gestioneaza excelent stresul fiziologic. Adaptabilitate ridicata pe termen mediu."
      : score >= 65
        ? "Buna toleranta la stres. Metricile sunt stabile si in zona optima."
        : score >= 50
          ? "Rezilienta medie. Unii indicatori fluctueaza — monitorizat."
          : score >= 35
            ? "Rezilienta scazuta. Corpul se lupta sa se adapteze. Reduce stresul si prioritizeaza recuperarea."
            : "Rezilienta critica. Risc de burnout fiziologic. Pauza imediata de la efort intens.";

    return { score, level, color, description, hrvTrend: Math.round(hrvTrend), rhrStability: Math.round(rhrStability), sleepConsistency: Math.round(sleepConsistency), hrvVariability: Math.round(hrvVariability) };
  }, [metrics, sleepNights]);

  if (!resilience) return null;

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Rezilienta (14 zile)</h3>
        <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{
          background: `${resilience.color}15`,
          color: resilience.color,
        }}>
          {resilience.level}
        </span>
      </div>

      <div className="flex items-center gap-4 mb-3">
        <span className="text-3xl font-bold tabular-nums" style={{ color: resilience.color }}>{resilience.score}</span>
        <p className="text-[11px] text-[var(--muted-strong)] leading-relaxed flex-1">{resilience.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "HRV Trend", score: resilience.hrvTrend, desc: "Tendinta HRV pe 14z" },
          { label: "RHR Stabilitate", score: resilience.rhrStability, desc: "Puls stabil vs baseline" },
          { label: "Somn Consistent", score: resilience.sleepConsistency, desc: "Consistenta pe 14 nopti" },
          { label: "Variabilitate HRV", score: resilience.hrvVariability, desc: "Adaptabilitate zilnica" },
        ].map(item => (
          <div key={item.label} className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="flex justify-between text-[9px] mb-1">
              <span className="text-[var(--muted)]">{item.label}</span>
              <span className="font-medium tabular-nums">{item.score}</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="h-full rounded-full" style={{
                width: `${item.score}%`,
                background: item.score >= 70 ? "#10b981" : item.score >= 50 ? "#f59e0b" : "#ef4444",
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
