"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface StabilityItem {
  label: string;
  score: number; // 60-100
  grade: string; // A+ to F
  cv: number;    // coefficient of variation %
  color: string;
  detail: string;
}

function cvToGrade(cv: number, inverted = false): { score: number; grade: string; color: string } {
  // Lower CV = more stable = better score (for most metrics)
  // inverted = true for metrics where variability is healthy (like HRV)
  const effective = inverted ? Math.max(5, 20 - cv) : cv;

  if (effective <= 5) return { score: 95, grade: "A+", color: "#10b981" };
  if (effective <= 8) return { score: 88, grade: "A", color: "#10b981" };
  if (effective <= 12) return { score: 78, grade: "B", color: "#22d3ee" };
  if (effective <= 18) return { score: 68, grade: "C", color: "#f59e0b" };
  if (effective <= 25) return { score: 55, grade: "D", color: "#f97316" };
  return { score: 40, grade: "F", color: "#ef4444" };
}

export function StabilityScores({ metrics, sleepNights }: Props) {
  const items = useMemo(() => {
    const result: StabilityItem[] = [];

    // Sleep duration stability
    if (sleepNights.length >= 14) {
      const last14 = sleepNights.slice(-14).map(n => n.totalMinutes / 60);
      const { mean, std } = meanStd(last14);
      const cv = mean > 0 ? (std / mean) * 100 : 0;
      const g = cvToGrade(cv);
      result.push({
        label: "Consistenta somn",
        score: g.score, grade: g.grade, cv, color: g.color,
        detail: `${mean.toFixed(1)}h ± ${(std * 60).toFixed(0)} min`,
      });
    }

    // Step count stability
    if (metrics.stepCount?.length >= 14) {
      const last14 = metrics.stepCount.slice(-14).map(d => d.sum);
      const { mean, std } = meanStd(last14);
      const cv = mean > 0 ? (std / mean) * 100 : 0;
      const g = cvToGrade(cv);
      result.push({
        label: "Consistenta pasi",
        score: g.score, grade: g.grade, cv, color: g.color,
        detail: `${mean.toFixed(0)} ± ${std.toFixed(0)} pasi/zi`,
      });
    }

    // RHR stability
    if (metrics.restingHeartRate?.length >= 14) {
      const last14 = metrics.restingHeartRate.slice(-14).map(d => d.mean);
      const { mean, std } = meanStd(last14);
      const cv = mean > 0 ? (std / mean) * 100 : 0;
      const g = cvToGrade(cv);
      result.push({
        label: "Stabilitate RHR",
        score: g.score, grade: g.grade, cv, color: g.color,
        detail: `${mean.toFixed(0)} ± ${std.toFixed(1)} bpm`,
      });
    }

    // HRV stability (here, SOME variability is healthy: 8-15% CV optimal)
    if (metrics.hrv?.length >= 14) {
      const last14 = metrics.hrv.slice(-14).map(d => d.mean);
      const { mean, std } = meanStd(last14);
      const cv = mean > 0 ? (std / mean) * 100 : 0;
      // Optimal HRV CV: 8-15% (Plews 2013)
      const score = cv >= 8 && cv <= 15 ? 92 : cv >= 5 && cv <= 20 ? 75 : cv < 5 ? 50 : 55;
      const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D";
      const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
      result.push({
        label: "Variabilitate HRV",
        score, grade, cv, color,
        detail: `CV ${cv.toFixed(0)}% (optim: 8-15%)`,
      });
    }

    // Bedtime consistency
    if (sleepNights.length >= 14) {
      const last14 = sleepNights.slice(-14).map(n => {
        const d = new Date(n.bedtime);
        let h = d.getHours() + d.getMinutes() / 60;
        if (h < 12) h += 24;
        return h;
      });
      const { std } = meanStd(last14);
      const stdMin = std * 60;
      const score = stdMin <= 20 ? 95 : stdMin <= 30 ? 85 : stdMin <= 45 ? 72 : stdMin <= 60 ? 58 : 40;
      const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
      const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
      result.push({
        label: "Ora de culcare",
        score, grade, cv: 0, color,
        detail: `± ${stdMin.toFixed(0)} min variatie`,
      });
    }

    return result;
  }, [metrics, sleepNights]);

  if (items.length === 0) return null;

  const avgScore = Math.round(items.reduce((s, i) => s + i.score, 0) / items.length);

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Scoruri de consistenta</h3>
        <span className="text-[10px] text-[var(--muted)]">Medie: {avgScore}/100</span>
      </div>
      <p className="text-[9px] text-[var(--muted)] mb-3">Cat de consistent esti — nu doar media, ci variabilitatea zilnica.</p>

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-sm font-bold w-7 text-center" style={{ color: item.color }}>{item.grade}</span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-[var(--muted-strong)]">{item.label}</span>
                <span className="text-[var(--muted)] tabular-nums">{item.detail}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${item.score}%`, background: item.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
