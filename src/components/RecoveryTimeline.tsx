"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, ReferenceLine } from "recharts";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";
import { sma } from "@/lib/stats/movingAverage";

interface Props {
  rhrData: DailySummary[];
  hrvData: DailySummary[];
  sleepData: SleepNight[];
  exerciseData?: DailySummary[];
  respData?: DailySummary[];
  spo2Data?: DailySummary[];
}

export function RecoveryTimeline({ rhrData, hrvData, sleepData, exerciseData, respData, spo2Data }: Props) {
  const data = useMemo(() => {
    // Get all unique dates that have at least RHR + HRV
    const rhrDates = new Set(rhrData.map(d => d.date));
    const hrvDates = new Set(hrvData.map(d => d.date));
    const allDates = [...rhrDates].filter(d => hrvDates.has(d)).sort();

    // Skip first 14 days (baseline needed)
    const scoreDates = allDates.slice(14);

    const scores = scoreDates.map(date => {
      const r = calculateRecovery(rhrData, hrvData, sleepData, date, exerciseData, respData, spo2Data);
      return { date, score: r.hasEnoughData ? r.total : null };
    }).filter(d => d.score !== null) as { date: string; score: number }[];

    if (scores.length < 7) return [];

    // Add 7-day SMA
    const rawScores = scores.map(d => d.score);
    const smoothed = sma(rawScores, 7);

    return scores.map((d, i) => ({
      date: d.date,
      score: d.score,
      avg7: smoothed[i] !== null ? Math.round(smoothed[i]!) : null,
      label: d.date.substring(5), // MM-DD
    }));
  }, [rhrData, hrvData, sleepData, exerciseData, respData, spo2Data]);

  if (data.length < 7) return null;

  const getColor = (score: number) =>
    score >= 80 ? "#10b981" : score >= 60 ? "#22d3ee" : score >= 40 ? "#f59e0b" : "#ef4444";

  const latestScore = data[data.length - 1]?.score ?? 0;
  const latestAvg = data[data.length - 1]?.avg7 ?? 0;

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Evolutie Recovery Score</h3>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-[var(--muted)]">Azi: <span className="font-medium" style={{ color: getColor(latestScore) }}>{latestScore}</span></span>
          <span className="text-[var(--muted)]">Medie 7z: <span className="font-medium">{latestAvg}</span></span>
        </div>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} tickLine={false} axisLine={false} width={30} />
            <Tooltip
              contentStyle={{ background: "rgba(10,10,15,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((v: any, name: any) => [String(v), name === "score" ? "Zilnic" : "Medie 7z"]) as any}
            />
            <ReferenceLine y={60} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
            <ReferenceLine y={80} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="score" fill="url(#scoreGrad)" stroke="none" />
            <Line type="monotone" dataKey="score" stroke="rgba(255,255,255,0.15)" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="avg7" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-center gap-4 mt-2 text-[9px] text-[var(--muted)]">
        <span className="flex items-center gap-1"><span className="w-3 h-px inline-block" style={{ background: "rgba(255,255,255,0.15)" }} /> zilnic</span>
        <span className="flex items-center gap-1"><span className="w-3 h-px inline-block bg-[#10b981]" /> medie 7z</span>
      </div>
    </div>
  );
}
