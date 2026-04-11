"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area } from "recharts";
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
  tempData?: DailySummary[];
}

export function RecoveryTimeline({ rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData }: Props) {
  const data = useMemo(() => {
    const rhrDates = new Set(rhrData.map(d => d.date));
    const hrvDates = new Set(hrvData.map(d => d.date));
    const allDates = [...rhrDates].filter(d => hrvDates.has(d)).sort();

    const scoreDates = allDates.slice(14);

    const scores = scoreDates.map(date => {
      const r = calculateRecovery(rhrData, hrvData, sleepData, date, exerciseData, respData, spo2Data, tempData);
      return { date, score: r.hasEnoughData ? r.total : null };
    }).filter(d => d.score !== null) as { date: string; score: number }[];

    if (scores.length < 7) return [];

    const rawScores = scores.map(d => d.score);
    const smoothed = sma(rawScores, 7);

    return scores.map((d, i) => ({
      date: d.date,
      score: d.score,
      avg7: smoothed[i] !== null ? Math.round(smoothed[i]!) : null,
      label: d.date.substring(5),
    }));
  }, [rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData]);

  if (data.length < 7) return null;

  const latestScore = data[data.length - 1]?.score ?? 0;
  const latestAvg = data[data.length - 1]?.avg7 ?? 0;

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[17px] font-normal text-white">Evolutie Recovery Score</h3>
        <div className="flex items-center gap-3 text-[13px]" style={{ color: "rgba(235,235,245,0.3)" }}>
          <span>Azi: <span className="font-medium text-white">{latestScore}</span></span>
          <span>Medie 7z: <span className="font-medium text-white">{latestAvg}</span></span>
        </div>
      </div>

      <div className="hh-chart h-52 sm:h-64">
        <ResponsiveContainer width="99%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34C759" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#34C759" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "rgba(235,235,245,0.3)" }}
              tickLine={false} axisLine={false}
              interval="preserveStartEnd" minTickGap={35}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "rgba(235,235,245,0.3)" }}
              tickLine={false} axisLine={false} width={32}
            />
            <Tooltip
              contentStyle={{
                background: "#1C1C1E",
                border: "none",
                borderRadius: 12,
                fontSize: 13,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((v: any, name: any) => [String(v), name === "score" ? "Zilnic" : "Medie 7z"]) as any}
            />
            <Area type="monotone" dataKey="avg7" fill="url(#scoreGrad)" stroke="none" />
            <Line type="monotone" dataKey="score" stroke="rgba(255,255,255,0.12)" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="avg7" stroke="#34C759" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
