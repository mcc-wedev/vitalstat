"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";
import { calculateRecovery } from "@/lib/stats/recovery";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  targetDate?: string;
}

export function RecoveryPrediction({ metrics, sleepNights, targetDate }: Props) {
  const prediction = useMemo(() => {
    const hrv = metrics.hrv;
    const rhr = metrics.restingHeartRate;
    if (!hrv || hrv.length < 30 || !rhr || rhr.length < 30) return null;

    const latestDate = targetDate || [...hrv.map(d => d.date), ...rhr.map(d => d.date)].sort().pop() || "";
    const recovery = calculateRecovery(rhr, hrv, sleepNights, latestDate, metrics.exerciseTime, metrics.respiratoryRate, metrics.oxygenSaturation, metrics.wristTemperature);

    if (!recovery.hasEnoughData || recovery.total >= 75) return null; // Already recovered

    // Analyze historical recovery patterns:
    // How many days does it typically take to go from current level back to 75+?
    const dates = [...new Set([...hrv.map(d => d.date), ...rhr.map(d => d.date)])].sort();

    // Compute recent recovery scores
    const recentScores: { date: string; score: number }[] = [];
    for (const date of dates.slice(-30)) {
      const r = calculateRecovery(rhr, hrv, sleepNights, date, metrics.exerciseTime, metrics.respiratoryRate, metrics.oxygenSaturation, metrics.wristTemperature);
      if (r.hasEnoughData) recentScores.push({ date, score: r.total });
    }

    if (recentScores.length < 14) return null;

    // Find historical dips and how long recovery took
    const recoveryTimes: number[] = [];
    for (let i = 0; i < recentScores.length - 1; i++) {
      if (recentScores[i].score < 60) {
        // Find next day at 75+
        for (let j = i + 1; j < recentScores.length; j++) {
          if (recentScores[j].score >= 75) {
            recoveryTimes.push(j - i);
            break;
          }
        }
      }
    }

    // Estimate days to recovery
    let estimatedDays: number;
    if (recoveryTimes.length >= 2) {
      const { mean } = meanStd(recoveryTimes);
      estimatedDays = Math.round(mean);
    } else {
      // Default based on current score
      estimatedDays = recovery.total < 30 ? 3 : recovery.total < 50 ? 2 : 1;
    }

    const recoveryDate = new Date();
    recoveryDate.setDate(recoveryDate.getDate() + estimatedDays);
    const dayName = recoveryDate.toLocaleDateString("ro-RO", { weekday: "long" });

    const tips = recovery.total < 40
      ? "Prioriteaza: 9+ ore somn, hidratare, zero alcool, zero antrenament intens."
      : recovery.total < 60
        ? "Recomandare: 8+ ore somn, activitate usoara, evita stresul."
        : "Aproape acolo — o noapte buna de somn ar trebui sa fie suficienta.";

    return {
      currentScore: recovery.total,
      estimatedDays,
      dayName,
      tips,
      basedOnHistory: recoveryTimes.length >= 2,
    };
  }, [metrics, sleepNights]);

  if (!prediction) return null;

  const color = prediction.currentScore < 40 ? "#ef4444" : prediction.currentScore < 60 ? "#f59e0b" : "#22d3ee";

  return (
    <div className="p-3 rounded-xl border animate-in" style={{
      background: `${color}08`,
      borderColor: `${color}20`,
    }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm">🔮</span>
        <span className="text-xs font-semibold" style={{ color }}>
          Recuperare completa estimata: {prediction.dayName}
        </span>
      </div>
      <p className="text-[10px] text-[var(--muted-strong)] ml-6 leading-relaxed">
        Scor actual: {prediction.currentScore}/100. {prediction.basedOnHistory ? "Bazat pe tiparele tale istorice" : "Estimare generala"}, vei ajunge la 75+ in ~{prediction.estimatedDays} {prediction.estimatedDays === 1 ? "zi" : "zile"}. {prediction.tips}
      </p>
    </div>
  );
}
