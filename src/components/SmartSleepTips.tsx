"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface SleepTip {
  icon: string;
  title: string;
  body: string;
  impact: string;
  source: "date personale" | "stiinta somnului";
}

export function SmartSleepTips({ metrics, sleepNights }: Props) {
  const tips = useMemo(() => {
    if (sleepNights.length < 30) return [];
    const result: SleepTip[] = [];

    // Analyze bedtime → sleep quality correlation
    const earlyBed: SleepNight[] = [];
    const lateBed: SleepNight[] = [];
    for (const n of sleepNights.slice(-60)) {
      const bedH = new Date(n.bedtime).getHours();
      const adjH = bedH < 12 ? bedH + 24 : bedH;
      if (adjH <= 23) earlyBed.push(n);
      else lateBed.push(n);
    }

    if (earlyBed.length >= 10 && lateBed.length >= 10) {
      const { mean: earlyDeep } = meanStd(earlyBed.map(n => n.totalMinutes > 0 ? (n.stages.deep / n.totalMinutes) * 100 : 0));
      const { mean: lateDeep } = meanStd(lateBed.map(n => n.totalMinutes > 0 ? (n.stages.deep / n.totalMinutes) * 100 : 0));
      const diff = earlyDeep - lateDeep;
      if (diff > 3) {
        result.push({
          icon: "🌙", title: "Culca-te inainte de 23:00",
          body: `Cand te culci inainte de 23:00, somnul tau profund creste cu ${diff.toFixed(0)}% fata de noptile in care te culci mai tarziu.`,
          impact: `+${diff.toFixed(0)}% somn profund`,
          source: "date personale",
        });
      }
    }

    // Exercise timing → sleep
    if (metrics.exerciseTime && metrics.exerciseTime.length >= 30) {
      const exMap = new Map(metrics.exerciseTime.map(d => [d.date, d.sum]));
      const highEx: number[] = [], lowEx: number[] = [];
      for (const n of sleepNights.slice(-60)) {
        const ex = exMap.get(n.date) || 0;
        if (ex >= 30) highEx.push(n.efficiency * 100);
        else lowEx.push(n.efficiency * 100);
      }

      if (highEx.length >= 10 && lowEx.length >= 10) {
        const { mean: hAvg } = meanStd(highEx);
        const { mean: lAvg } = meanStd(lowEx);
        if (hAvg - lAvg > 2) {
          result.push({
            icon: "🏃", title: "Exercitiul iti imbunatateste somnul",
            body: `In zilele cu 30+ min exercitiu, eficienta somnului tau e cu ${(hAvg - lAvg).toFixed(0)}% mai mare.`,
            impact: `+${(hAvg - lAvg).toFixed(0)}% eficienta`,
            source: "date personale",
          });
        }
      }
    }

    // Weekend vs weekday sleep
    const weekdayNights = sleepNights.slice(-60).filter(n => { const d = new Date(n.date).getDay(); return d >= 1 && d <= 4; });
    const weekendNights = sleepNights.slice(-60).filter(n => { const d = new Date(n.date).getDay(); return d === 0 || d === 5 || d === 6; });
    if (weekdayNights.length >= 10 && weekendNights.length >= 5) {
      const { mean: wkD } = meanStd(weekdayNights.map(n => n.totalMinutes / 60));
      const { mean: weD } = meanStd(weekendNights.map(n => n.totalMinutes / 60));
      const diff = Math.abs(weD - wkD);
      if (diff > 0.75) {
        result.push({
          icon: "📅", title: "Pastreaza acelasi program si in weekend",
          body: `Dormi cu ${(diff * 60).toFixed(0)} minute ${weD > wkD ? "mai mult" : "mai putin"} in weekend. Aceasta inconsistenta (social jet lag) perturba ritmul circadian.`,
          impact: `±${(diff * 60).toFixed(0)} min variatie`,
          source: "date personale",
        });
      }
    }

    // General science-based tips (always show if no personal data tips)
    if (result.length < 2) {
      result.push({
        icon: "🌡️", title: "Temperatura camerei: 18-19°C",
        body: "Studiile arata ca temperatura optima pentru somn profund e 18-19°C. Corpul trebuie sa scada temperatura cu ~1°C pentru a initia somnul.",
        impact: "Somn profund +20-30%",
        source: "stiinta somnului",
      });
    }
    if (result.length < 3) {
      result.push({
        icon: "📵", title: "Fara ecrane 45 min inainte de culcare",
        body: "Lumina albastra suprima melatonina cu pana la 50%. Inlocuieste cu citit, stretching sau meditatie.",
        impact: "Latenta somn -15 min",
        source: "stiinta somnului",
      });
    }

    return result.slice(0, 4);
  }, [metrics, sleepNights]);

  if (tips.length === 0) return null;

  return (
    <div className="glass p-4 animate-in">
      <h3 className="text-xs font-semibold text-[var(--muted-strong)] mb-3">Sfaturi inteligente pentru somn</h3>
      <div className="space-y-2.5">
        {tips.map((tip, i) => (
          <div key={i} className="flex gap-2.5">
            <span className="text-base shrink-0">{tip.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium">{tip.title}</span>
                <span className="text-[8px] px-1.5 py-0.5 rounded-full shrink-0" style={{
                  background: tip.source === "date personale" ? "rgba(16,185,129,0.12)" : "rgba(59,130,246,0.12)",
                  color: tip.source === "date personale" ? "#10b981" : "#3b82f6",
                }}>
                  {tip.source}
                </span>
              </div>
              <p className="text-[10px] text-[var(--muted-strong)] mt-0.5 leading-relaxed">{tip.body}</p>
              <p className="text-[9px] text-[var(--accent)] mt-0.5">Impact estimat: {tip.impact}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
