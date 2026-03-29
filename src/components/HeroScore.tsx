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
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#22d3ee";
  if (score >= 40) return "#f59e0b";
  if (score >= 20) return "#f97316";
  return "#ef4444";
}

function getScoreMessage(score: number): string {
  if (score >= 80) return "Corpul tau e pregatit pentru antrenament intens";
  if (score >= 60) return "Esti in forma buna — antrenament moderat recomandat";
  if (score >= 40) return "Evita efortul intens, concentreaza-te pe recuperare";
  if (score >= 20) return "Ai nevoie de odihna azi — prioritizeaza somnul";
  return "Odihna completa necesara — asculta-ti corpul";
}

const COMPONENT_COLORS: Record<string, string> = {
  "HRV": "#8b5cf6",
  "Puls repaus": "#ef4444",
  "Somn": "#3b82f6",
  "Balanta antrenament": "#f59e0b",
  "Efort ieri": "#f97316",
  "Rata respiratorie": "#06b6d4",
  "SpO2": "#10b981",
  "Temperatura": "#ec4899",
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
        <p className="text-[var(--muted-strong)] text-sm">{recovery.message}</p>
      </div>
    );
  }

  const score = recovery.total;
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const message = getScoreMessage(score);
  const activeComponents = recovery.components.filter(c => c.available);

  // Larger gauge on mobile (160px), even larger on desktop
  const size = 160;
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const progress = (score / 100) * arcLength;

  return (
    <div className="card-premium p-5 sm:p-6 animate-scale-in relative overflow-hidden">
      {/* Always stack vertically */}
      <div className="flex flex-col items-center">
        {/* Date context */}
        {recoveryDate && (
          <p className="text-[11px] text-[var(--foreground-muted)] mb-4 tracking-wide uppercase font-medium">
            {formatDateRo(recoveryDate)}
          </p>
        )}

        {/* Gauge with glow */}
        <div className="relative mb-4">
          {/* Radial glow behind gauge */}
          <div
            className="hero-glow"
            style={{ background: `radial-gradient(circle, ${color}30 0%, transparent 70%)` }}
          />
          <div className="relative z-10" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform rotate-[135deg]">
              <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeWidth}
                strokeDasharray={`${arcLength} ${circumference}`}
                strokeLinecap="round"
              />
              <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none" stroke={color} strokeWidth={strokeWidth}
                strokeDasharray={`${progress} ${circumference}`}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 12px ${color}50)` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl sm:text-5xl font-bold tabular-nums animate-count-up" style={{ color, letterSpacing: "-0.03em" }}>
                {score}
              </span>
            </div>
          </div>
        </div>

        {/* Score label — large */}
        <h2 className="text-lg sm:text-xl font-bold mb-1" style={{ color }}>
          {label}
        </h2>

        {/* Message */}
        <p className="text-sm text-[var(--muted-strong)] text-center mb-5 max-w-[280px] leading-relaxed">
          {message}
        </p>

        {/* Confidence badge */}
        <div className="mb-5">
          <span className="text-[9px] px-2 py-1 rounded-full font-medium" style={{
            background: recovery.confidence === "high" ? "rgba(16,185,129,0.12)" : recovery.confidence === "medium" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)",
            color: recovery.confidence === "high" ? "#10b981" : recovery.confidence === "medium" ? "#f59e0b" : "#ef4444",
          }}>
            {recovery.confidence === "high" ? "Precizie inalta" : recovery.confidence === "medium" ? "Precizie medie" : "Date limitate"}
          </span>
        </div>

        {/* Component breakdown — horizontal pills */}
        <div className="w-full">
          <div className="flex flex-wrap justify-center gap-2">
            {activeComponents.map((comp) => (
              <div
                key={comp.name}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px]"
                style={{
                  background: `${COMPONENT_COLORS[comp.name] || "#888"}12`,
                  border: `1px solid ${COMPONENT_COLORS[comp.name] || "#888"}25`,
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: COMPONENT_COLORS[comp.name] || "#888" }}
                />
                <span className="text-[var(--foreground-secondary)] font-medium">{comp.name}</span>
                <span className="tabular-nums font-bold" style={{ color: COMPONENT_COLORS[comp.name] || "#888" }}>
                  {comp.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
