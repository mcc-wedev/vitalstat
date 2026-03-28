"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface MonthStat {
  label: string;
  thisMonth: string;
  lastMonth: string;
  change: string;
  improved: boolean | null; // null = neutral
  icon: string;
}

export function MonthlyRecap({ metrics, sleepNights }: Props) {
  const recap = useMemo(() => {
    const stats: MonthStat[] = [];
    const highlights: string[] = [];
    const now = new Date();
    const monthName = now.toLocaleDateString("ro-RO", { month: "long" });

    // Helper
    const compare = (key: string, label: string, icon: string, useSum: boolean, higherBetter: boolean, unit: string, decimals = 0) => {
      const data = metrics[key];
      if (!data || data.length < 45) return;
      const last30 = data.slice(-30).map(d => useSum ? d.sum : d.mean);
      const prev30 = data.slice(-60, -30).map(d => useSum ? d.sum : d.mean);
      if (prev30.length < 14) return;

      const { mean: tm } = meanStd(last30);
      const { mean: lm } = meanStd(prev30);
      if (lm === 0) return;

      const pct = ((tm - lm) / lm) * 100;
      const improved = higherBetter ? pct > 2 : pct < -2;
      const worsened = higherBetter ? pct < -2 : pct > 2;

      stats.push({
        label, icon,
        thisMonth: tm.toFixed(decimals) + " " + unit,
        lastMonth: lm.toFixed(decimals) + " " + unit,
        change: `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`,
        improved: Math.abs(pct) < 3 ? null : improved,
      });

      if (improved && Math.abs(pct) > 5) highlights.push(`${icon} ${label} s-a imbunatatit cu ${Math.abs(pct).toFixed(0)}%`);
      if (worsened && Math.abs(pct) > 5) highlights.push(`${icon} ${label} a scazut cu ${Math.abs(pct).toFixed(0)}% — atentie`);
    };

    compare("restingHeartRate", "Puls repaus", "❤️", false, false, "bpm", 0);
    compare("hrv", "HRV", "💜", false, true, "ms", 0);
    compare("stepCount", "Pasi/zi", "🚶", true, true, "", 0);
    compare("exerciseTime", "Exercitiu/zi", "🏋️", true, true, "min", 0);
    compare("activeEnergy", "Calorii active/zi", "🔥", true, true, "kcal", 0);
    compare("vo2Max", "VO2 Max", "🫁", false, true, "", 1);

    // Sleep
    if (sleepNights.length >= 45) {
      const tm = sleepNights.slice(-30).map(n => n.totalMinutes / 60);
      const lm = sleepNights.slice(-60, -30).map(n => n.totalMinutes / 60);
      if (lm.length >= 14) {
        const { mean: tAvg } = meanStd(tm);
        const { mean: lAvg } = meanStd(lm);
        const pct = ((tAvg - lAvg) / lAvg) * 100;
        stats.push({
          label: "Somn", icon: "🌙",
          thisMonth: tAvg.toFixed(1) + "h",
          lastMonth: lAvg.toFixed(1) + "h",
          change: `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`,
          improved: Math.abs(pct) < 3 ? null : pct > 0,
        });
      }
    }

    if (stats.length < 3) return null;

    // Overall verdict
    const improvements = stats.filter(s => s.improved === true).length;
    const declines = stats.filter(s => s.improved === false).length;
    const verdict = improvements > declines + 1
      ? { text: "Luna excelenta! Majoritatea indicatorilor in crestere.", color: "#10b981" }
      : improvements >= declines
        ? { text: "Luna echilibrata. Mici fluctuatii, dar fara declinuri majore.", color: "#22d3ee" }
        : { text: "Luna provocatoare. Mai multi indicatori in scadere — atentie la recuperare.", color: "#f59e0b" };

    return { stats, highlights, monthName, verdict };
  }, [metrics, sleepNights]);

  if (!recap) return null;

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Recap {recap.monthName}</h3>
        <span className="text-[9px] px-2 py-0.5 rounded-full" style={{
          background: `${recap.verdict.color}15`,
          color: recap.verdict.color,
        }}>
          vs luna anterioara
        </span>
      </div>

      <p className="text-[11px] mb-3" style={{ color: recap.verdict.color }}>{recap.verdict.text}</p>

      {/* Stats table */}
      <div className="space-y-1.5 mb-3">
        {recap.stats.map(s => (
          <div key={s.label} className="flex items-center justify-between text-[11px] py-1 border-b border-[rgba(255,255,255,0.04)]">
            <span className="text-[var(--muted-strong)]">{s.icon} {s.label}</span>
            <div className="flex items-center gap-3">
              <span className="text-[var(--muted)] tabular-nums text-[10px]">{s.lastMonth}</span>
              <span className="text-[var(--muted)]">→</span>
              <span className="font-medium tabular-nums">{s.thisMonth}</span>
              <span className="text-[10px] font-medium tabular-nums min-w-[36px] text-right" style={{
                color: s.improved === true ? "#10b981" : s.improved === false ? "#ef4444" : "var(--muted)",
              }}>
                {s.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Highlights */}
      {recap.highlights.length > 0 && (
        <div className="space-y-1">
          {recap.highlights.map((h, i) => (
            <p key={i} className="text-[10px] text-[var(--muted-strong)]">{h}</p>
          ))}
        </div>
      )}
    </div>
  );
}
