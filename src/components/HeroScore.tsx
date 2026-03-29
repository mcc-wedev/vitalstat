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
  if (score >= 80) return "Recuperare excelenta. Zi optima pentru antrenament intens.";
  if (score >= 60) return "Recuperare buna. Antrenament moderat recomandat.";
  if (score >= 40) return "Recuperare medie. Evita efortul intens.";
  if (score >= 20) return "Recuperare slaba. Prioritizeaza odihna si somnul.";
  return "Recuperare critica. Odihna completa necesara.";
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

export function HeroScore({ rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData, targetDate }: HeroScoreProps & { targetDate?: string }) {
  const recovery = useMemo(() => {
    // If targetDate is provided, use it; otherwise find the latest date in the data
    let date = targetDate;
    if (!date) {
      const allDates = [...rhrData.map(d => d.date), ...hrvData.map(d => d.date)];
      date = allDates.sort().pop() || "";
    }
    return calculateRecovery(rhrData, hrvData, sleepData, date, exerciseData, respData, spo2Data, tempData);
  }, [rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData, targetDate]);

  if (!recovery.hasEnoughData) {
    return (
      <div className="glass p-6 text-center">
        <p className="text-[var(--muted-strong)] text-sm">{recovery.message}</p>
      </div>
    );
  }

  const score = recovery.total;
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const message = getScoreMessage(score);
  const activeComponents = recovery.components.filter(c => c.available);

  const size = 140;
  const strokeWidth = 9;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const progress = (score / 100) * arcLength;

  return (
    <div className="glass p-4 sm:p-5 animate-in">
      <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5">
        {/* Gauge — responsive */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform rotate-[135deg]">
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeLinecap="round"
            />
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={color} strokeWidth={strokeWidth}
              strokeDasharray={`${progress} ${circumference}`}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tabular-nums" style={{ color }}>{score}</span>
            <span className="text-[10px] mt-0.5" style={{ color: `${color}90` }}>{label}</span>
          </div>
        </div>

        {/* Details — compact */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-semibold">Scor Recuperare</h2>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{
              background: recovery.confidence === "high" ? "rgba(16,185,129,0.15)" : recovery.confidence === "medium" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
              color: recovery.confidence === "high" ? "#10b981" : recovery.confidence === "medium" ? "#f59e0b" : "#ef4444",
            }}>
              {recovery.confidence === "high" ? "precizie inalta" : recovery.confidence === "medium" ? "precizie medie" : "date limitate"}
            </span>
          </div>
          <p className="text-xs text-[var(--muted-strong)] mb-3">{message}</p>

          <div className="space-y-2">
            {activeComponents.map((comp) => (
              <div key={comp.name}>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-[var(--muted)]">{comp.name} ({comp.weight}%)</span>
                  <span className="tabular-nums font-medium">{comp.score}</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${comp.score}%`,
                      background: `linear-gradient(90deg, ${COMPONENT_COLORS[comp.name] || "#888"}60, ${COMPONENT_COLORS[comp.name] || "#888"})`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
