"use client";

import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";
import { useMemo } from "react";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface GradeItem {
  category: string;
  icon: string;
  grade: string;
  gradeColor: string;
  score: number;
  detail: string;
}

function getGrade(score: number): { grade: string; color: string } {
  if (score >= 90) return { grade: "A+", color: "#10b981" };
  if (score >= 80) return { grade: "A", color: "#10b981" };
  if (score >= 70) return { grade: "B", color: "#22d3ee" };
  if (score >= 60) return { grade: "C", color: "#f59e0b" };
  if (score >= 40) return { grade: "D", color: "#f97316" };
  return { grade: "F", color: "#ef4444" };
}

export function WeeklyDigest({ metrics, sleepNights }: Props) {
  const digest = useMemo(() => {
    const grades: GradeItem[] = [];
    const wins: string[] = [];
    const improvements: string[] = [];

    // ── Sleep ──
    const last7sleep = sleepNights.slice(-7);
    if (last7sleep.length >= 5) {
      const durations = last7sleep.map(n => n.totalMinutes / 60);
      const { mean: avg } = meanStd(durations);
      const effAvg = last7sleep.reduce((s, n) => s + n.efficiency, 0) / last7sleep.length * 100;
      const sleepScore = Math.min(100, (avg / 8) * 50 + (effAvg / 100) * 50);
      const g = getGrade(sleepScore);
      grades.push({ category: "Somn", icon: "🌙", grade: g.grade, gradeColor: g.color, score: Math.round(sleepScore),
        detail: `${avg.toFixed(1)}h medie, ${effAvg.toFixed(0)}% eficienta` });
      if (avg >= 7.5) wins.push(`Durata medie de somn excelenta: ${avg.toFixed(1)}h`);
      if (avg < 6.5) improvements.push("Creste durata somnului la cel putin 7h");
      if (effAvg < 80) improvements.push("Eficienta somnului sub 80% — evita ecranele inainte de culcare");
    }

    // ── Activity ──
    const steps = metrics.stepCount;
    const ex = metrics.exerciseTime;
    if (steps?.length >= 7) {
      const last7 = steps.slice(-7).map(d => d.sum);
      const { mean: avgSteps } = meanStd(last7);
      const weekEx = ex ? ex.slice(-7).reduce((s, d) => s + d.sum, 0) : 0;
      const stepsScore = Math.min(100, (avgSteps / 8000) * 60 + (weekEx / 150) * 40);
      const g = getGrade(stepsScore);
      grades.push({ category: "Activitate", icon: "🏃", grade: g.grade, gradeColor: g.color, score: Math.round(stepsScore),
        detail: `${avgSteps.toFixed(0)} pasi/zi, ${weekEx.toFixed(0)} min exercitiu` });
      if (avgSteps >= 10000) wins.push(`Peste 10,000 pasi/zi in medie!`);
      if (weekEx >= 150) wins.push(`Tinta OMS de 150 min/sapt atinsa: ${weekEx.toFixed(0)} min`);
      if (avgSteps < 5000) improvements.push("Sub 5,000 pasi/zi — adauga o plimbare zilnica");
      if (weekEx < 150) improvements.push(`Exercitiu ${weekEx.toFixed(0)}/150 min — mai ai de adaugat`);
    }

    // ── Cardio ──
    const rhr = metrics.restingHeartRate;
    const hrv = metrics.hrv;
    if (rhr?.length >= 14 && hrv?.length >= 14) {
      const rhr7 = rhr.slice(-7).map(d => d.mean);
      const rhrPrev = rhr.slice(-14, -7).map(d => d.mean);
      const hrv7 = hrv.slice(-7).map(d => d.mean);
      const hrvPrev = hrv.slice(-14, -7).map(d => d.mean);
      const { mean: rhrNow } = meanStd(rhr7);
      const { mean: rhrLast } = meanStd(rhrPrev);
      const { mean: hrvNow } = meanStd(hrv7);
      const { mean: hrvLast } = meanStd(hrvPrev);

      const rhrImproved = rhrNow < rhrLast;
      const hrvImproved = hrvNow > hrvLast;
      const cardioScore = (rhrImproved ? 50 : 30) + (hrvImproved ? 50 : 30);
      const g = getGrade(Math.min(100, cardioScore));
      grades.push({ category: "Cardiovascular", icon: "❤️", grade: g.grade, gradeColor: g.color, score: Math.min(100, Math.round(cardioScore)),
        detail: `RHR ${rhrNow.toFixed(0)} bpm, HRV ${hrvNow.toFixed(0)} ms` });
      if (rhrImproved) wins.push(`Puls in repaus in scadere: ${rhrNow.toFixed(0)} vs ${rhrLast.toFixed(0)} bpm`);
      if (hrvImproved) wins.push(`HRV in crestere: ${hrvNow.toFixed(0)} vs ${hrvLast.toFixed(0)} ms`);
      if (!rhrImproved && rhrNow - rhrLast > 3) improvements.push("Pulsul in repaus creste — verifica stresul si somnul");
      if (!hrvImproved && hrvLast - hrvNow > 5) improvements.push("HRV in scadere — ia in considerare o saptamana mai usoara");
    }

    // ── Overall ──
    const overallScore = grades.length > 0 ? Math.round(grades.reduce((s, g) => s + g.score, 0) / grades.length) : 0;
    const overallGrade = getGrade(overallScore);

    return { grades, wins: wins.slice(0, 3), improvements: improvements.slice(0, 3), overallScore, overallGrade };
  }, [metrics, sleepNights]);

  if (digest.grades.length === 0) return null;

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Raport saptamanal</h3>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold" style={{ color: digest.overallGrade.color }}>{digest.overallGrade.grade}</span>
          <span className="text-[10px] text-[var(--muted)]">{digest.overallScore}/100</span>
        </div>
      </div>

      {/* Grade cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {digest.grades.map(g => (
          <div key={g.category} className="rounded-lg p-2.5 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="text-lg">{g.icon}</div>
            <div className="text-xl font-bold mt-0.5" style={{ color: g.gradeColor }}>{g.grade}</div>
            <div className="text-[9px] text-[var(--muted)] mt-0.5">{g.category}</div>
            <div className="text-[8px] text-[var(--muted)] mt-0.5">{g.detail}</div>
          </div>
        ))}
      </div>

      {/* Wins */}
      {digest.wins.length > 0 && (
        <div className="mb-3">
          <h4 className="text-[10px] font-semibold text-emerald-400 mb-1.5">Realizari</h4>
          {digest.wins.map((w, i) => (
            <p key={i} className="text-[11px] text-[var(--muted-strong)] mb-1">✅ {w}</p>
          ))}
        </div>
      )}

      {/* Improvements */}
      {digest.improvements.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-amber-400 mb-1.5">De imbunatatit</h4>
          {digest.improvements.map((imp, i) => (
            <p key={i} className="text-[11px] text-[var(--muted-strong)] mb-1">⚡ {imp}</p>
          ))}
        </div>
      )}
    </div>
  );
}
