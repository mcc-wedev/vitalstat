"use client";

import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { calculateRecovery, type RecoveryScore as RecoveryResult } from "@/lib/stats/recovery";

interface RecoveryScoreProps {
  rhrData: DailySummary[];
  hrvData: DailySummary[];
  sleepData: SleepNight[];
}

function ScoreGauge({ score, size = 160 }: { score: number; size?: number }) {
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const color =
    score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#262626"
          strokeWidth={8}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-bold" style={{ color }}>
          {score}
        </div>
        <div className="text-xs text-muted">/ 100</div>
      </div>
    </div>
  );
}

export function RecoveryScoreDisplay({ rhrData, hrvData, sleepData }: RecoveryScoreProps) {
  const { today, history } = useMemo(() => {
    if (rhrData.length === 0 && hrvData.length === 0) {
      return { today: null, history: [] };
    }

    // Get latest date from any available data
    const allDates = [
      ...rhrData.map((d) => d.date),
      ...hrvData.map((d) => d.date),
    ];
    const latestDate = allDates.sort().pop() || "";

    const today = calculateRecovery(rhrData, hrvData, sleepData, latestDate);

    // Compute history (last 30 days)
    const history: { date: string; score: number }[] = [];
    const last30 = rhrData.slice(-30);
    for (const day of last30) {
      const r = calculateRecovery(rhrData, hrvData, sleepData, day.date);
      if (r.hasEnoughData) {
        history.push({ date: day.date.substring(5), score: r.total });
      }
    }

    return { today, history };
  }, [rhrData, hrvData, sleepData]);

  if (!today) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6 text-center text-muted">
        Nu sunt date de puls sau HRV pentru scorul de recuperare
      </div>
    );
  }

  if (!today.hasEnoughData) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6 text-center">
        <p className="text-muted mb-2">Scor Recuperare</p>
        <p className="text-foreground">{today.message}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-card-border rounded-xl p-6">
      <h3 className="text-sm font-medium mb-4">Scor Recuperare</h3>

      <div className="flex items-center gap-8">
        <ScoreGauge score={today.total} />

        <div className="flex-1 space-y-3">
          {[
            { label: "HRV", score: today.hrvScore, weight: "40%" },
            { label: "Puls repaus", score: today.rhrScore, weight: "30%" },
            { label: "Somn", score: today.sleepScore, weight: "30%" },
          ].map((item) => (
            <div key={item.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted">
                  {item.label} ({item.weight})
                </span>
                <span>{item.score}</span>
              </div>
              <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${item.score}%`,
                    background:
                      item.score >= 70
                        ? "#10b981"
                        : item.score >= 40
                          ? "#f59e0b"
                          : "#ef4444",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 30-day recovery trend */}
      {history.length > 7 && (
        <div className="mt-6">
          <p className="text-xs text-muted mb-2">Trend 30 zile</p>
          <div className="h-16">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="date" hide />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(v) => [`${v}`, "Score"]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
