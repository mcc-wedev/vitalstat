"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";

interface HeroScoreProps {
  rhrData: DailySummary[];
  hrvData: DailySummary[];
  sleepData: SleepNight[];
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

function getScoreMessage(score: number, recovery: ReturnType<typeof calculateRecovery>): string {
  if (!recovery.hasEnoughData) return recovery.message || "";
  if (score >= 80) return "Recuperare excelenta. Zi optima pentru antrenament intens.";
  if (score >= 60) return "Recuperare buna. Poti antrena moderat.";
  if (score >= 40) return "Recuperare medie. Evita antrenamentul intens.";
  if (score >= 20) return "Recuperare slaba. Prioritizeaza odihna si somnul.";
  return "Recuperare critica. Corpul tau are nevoie de odihna completa.";
}

export function HeroScore({ rhrData, hrvData, sleepData }: HeroScoreProps) {
  const recovery = useMemo(() => {
    const allDates = [...rhrData.map(d => d.date), ...hrvData.map(d => d.date)];
    const latestDate = allDates.sort().pop() || "";
    return calculateRecovery(rhrData, hrvData, sleepData, latestDate);
  }, [rhrData, hrvData, sleepData]);

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
  const message = getScoreMessage(score, recovery);

  const size = 180;
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75; // 270 degrees
  const progress = (score / 100) * arcLength;

  return (
    <div className="glass p-6 animate-in">
      <div className="flex items-center gap-8">
        {/* Gauge */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform rotate-[135deg]">
            {/* Background arc */}
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeLinecap="round"
            />
            {/* Progress arc */}
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={color} strokeWidth={strokeWidth}
              strokeDasharray={`${progress} ${circumference}`}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold tabular-nums" style={{ color }}>{score}</span>
            <span className="text-xs mt-0.5" style={{ color: `${color}90` }}>{label}</span>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold mb-1">Scor Recuperare</h2>
          <p className="text-sm text-[var(--muted-strong)] mb-4">{message}</p>

          <div className="space-y-3">
            {[
              { label: "HRV", score: recovery.hrvScore, weight: "40%", color: "#8b5cf6" },
              { label: "Puls repaus", score: recovery.rhrScore, weight: "30%", color: "#ef4444" },
              { label: "Somn", score: recovery.sleepScore, weight: "30%", color: "#3b82f6" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[var(--muted)]">{item.label} ({item.weight})</span>
                  <span className="tabular-nums font-medium">{item.score}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${item.score}%`,
                      background: `linear-gradient(90deg, ${item.color}60, ${item.color})`,
                      boxShadow: `0 0 8px ${item.color}30`,
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
