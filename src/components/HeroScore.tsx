"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { calculateRecovery, type RecoveryScore as RecoveryResult } from "@/lib/stats/recovery";

interface HeroScoreProps {
  rhrData: DailySummary[];
  hrvData: DailySummary[];
  sleepData: SleepNight[];
  exerciseData?: DailySummary[];
  respData?: DailySummary[];
  spo2Data?: DailySummary[];
  tempData?: DailySummary[];
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excelent";
  if (score >= 60) return "Bun";
  if (score >= 40) return "Mediu";
  if (score >= 20) return "Slab";
  return "Critic";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#34C759";
  if (score >= 60) return "#007AFF";
  if (score >= 40) return "#FF9500";
  if (score >= 20) return "#FF3B30";
  return "#FF3B30";
}

function getScoreMessage(score: number): string {
  if (score >= 80) return "Corpul tau e pregatit pentru antrenament intens";
  if (score >= 60) return "Esti in forma buna — antrenament moderat recomandat";
  if (score >= 40) return "Evita efortul intens, concentreaza-te pe recuperare";
  if (score >= 20) return "Ai nevoie de odihna azi — prioritizeaza somnul";
  return "Odihna completa necesara — asculta-ti corpul";
}

const COMPONENT_COLORS: Record<string, string> = {
  "HRV": "#FF2D55",
  "Puls repaus": "#FF3B30",
  "Somn": "#AF52DE",
  "Balanta antrenament": "#FF9500",
  "Efort ieri": "#FF9500",
  "Rata respiratorie": "#5AC8FA",
  "SpO2": "#34C759",
  "Temperatura": "#FF9500",
};

function formatDateRo(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const months = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
    const days = ["Duminica", "Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata"];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
}

export function HeroScore({ rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData, targetDate }: HeroScoreProps & { targetDate?: string }) {
  const recovery = useMemo(() => {
    let date = targetDate;
    if (!date) {
      const allDates = [...rhrData.map(d => d.date), ...hrvData.map(d => d.date)];
      date = allDates.sort().pop() || "";
    }
    return calculateRecovery(rhrData, hrvData, sleepData, date, exerciseData, respData, spo2Data, tempData);
  }, [rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData, targetDate]);

  const recoveryDate = useMemo(() => {
    if (targetDate) return targetDate;
    const allDates = [...rhrData.map(d => d.date), ...hrvData.map(d => d.date)];
    return allDates.sort().pop() || "";
  }, [targetDate, rhrData, hrvData]);

  if (!recovery.hasEnoughData) {
    return (
      <div className="glass p-8 text-center">
        <p style={{ color: "rgba(235,235,245,0.6)" }} className="text-[15px]">{recovery.message}</p>
      </div>
    );
  }

  const score = recovery.total;
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const message = getScoreMessage(score);
  const activeComponents = recovery.components.filter(c => c.available);

  return (
    <div className="card-premium p-5 sm:p-6 animate-scale-in">
      {/* Date */}
      {recoveryDate && (
        <p
          className="text-[13px] mb-4"
          style={{ color: "rgba(235,235,245,0.3)" }}
        >
          {formatDateRo(recoveryDate)}
        </p>
      )}

      {/* Large score number */}
      <div className="flex items-baseline gap-3 mb-2">
        <span
          className="text-[36px] font-bold tabular-nums leading-none"
          style={{ color }}
        >
          {score}
        </span>
        <span
          className="text-[22px] font-bold"
          style={{ color }}
        >
          {label}
        </span>
      </div>

      {/* Message */}
      <p
        className="text-[15px] mb-5 leading-relaxed"
        style={{ color: "rgba(235,235,245,0.6)" }}
      >
        {message}
      </p>

      {/* Confidence */}
      <div className="mb-5">
        <span
          className="text-[11px] px-2.5 py-1 rounded-full font-medium"
          style={{
            background: recovery.confidence === "high" ? "rgba(52,199,89,0.15)" : recovery.confidence === "medium" ? "rgba(255,149,0,0.15)" : "rgba(255,59,48,0.15)",
            color: recovery.confidence === "high" ? "#34C759" : recovery.confidence === "medium" ? "#FF9500" : "#FF3B30",
          }}
        >
          {recovery.confidence === "high" ? "Precizie inalta" : recovery.confidence === "medium" ? "Precizie medie" : "Date limitate"}
        </span>
      </div>

      {/* Component progress bars — Apple Activity style */}
      <div className="space-y-3">
        {activeComponents.map((comp) => {
          const barColor = COMPONENT_COLORS[comp.name] || "#007AFF";
          return (
            <div key={comp.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-normal" style={{ color: "rgba(235,235,245,0.6)" }}>
                  {comp.name}
                </span>
                <span
                  className="text-[13px] font-bold tabular-nums"
                  style={{ color: barColor }}
                >
                  {comp.score}
                </span>
              </div>
              <div className="h-[6px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(comp.score, 100)}%`,
                    background: barColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
