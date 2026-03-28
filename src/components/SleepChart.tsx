"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";

interface SleepChartProps {
  data: SleepNight[];
  days?: number;
}

export function SleepChart({ data, days = 30 }: SleepChartProps) {
  const { chartData, stats } = useMemo(() => {
    const sliced = data.slice(-days);
    if (sliced.length === 0) return { chartData: [], stats: null };

    const chartData = sliced.map((d) => ({
      date: d.date.substring(5),
      deep: d.stages.deep / 60,
      core: d.stages.core / 60,
      rem: d.stages.rem / 60,
      awake: d.stages.awake / 60,
      total: d.totalMinutes / 60,
      efficiency: Math.round(d.efficiency * 100),
    }));

    // Compute sleep stats
    const efficiencies = sliced.map((d) => d.efficiency * 100);
    const durations = sliced.map((d) => d.totalMinutes / 60);
    const midpoints = sliced.map((d) => d.sleepMidpoint);

    // Social jet lag: weekday vs weekend midpoint difference
    const weekdayMid: number[] = [];
    const weekendMid: number[] = [];
    sliced.forEach((d) => {
      const dow = new Date(d.date).getDay();
      if (dow === 0 || dow === 5 || dow === 6) {
        weekendMid.push(d.sleepMidpoint);
      } else {
        weekdayMid.push(d.sleepMidpoint);
      }
    });

    const avgWeekdayMid =
      weekdayMid.length > 0
        ? weekdayMid.reduce((a, b) => a + b, 0) / weekdayMid.length
        : 0;
    const avgWeekendMid =
      weekendMid.length > 0
        ? weekendMid.reduce((a, b) => a + b, 0) / weekendMid.length
        : 0;

    const { mean: avgDuration } = meanStd(durations);
    const { mean: avgEfficiency } = meanStd(efficiencies);
    const { std: midpointStd } = meanStd(midpoints);
    const socialJetLag = Math.abs(avgWeekendMid - avgWeekdayMid);

    // Deep sleep percentage
    const totalDeep = sliced.reduce((s, d) => s + d.stages.deep, 0);
    const totalSleep = sliced.reduce((s, d) => s + d.totalMinutes, 0);
    const deepPct = totalSleep > 0 ? (totalDeep / totalSleep) * 100 : 0;

    return {
      chartData,
      stats: {
        avgDuration: avgDuration.toFixed(1),
        avgEfficiency: avgEfficiency.toFixed(0),
        regularity: midpointStd.toFixed(1),
        socialJetLag: socialJetLag.toFixed(1),
        deepPct: deepPct.toFixed(0),
      },
    };
  }, [data, days]);

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6 text-center text-muted">
        Nu sunt date de somn disponibile
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Durata medie", value: `${stats.avgDuration}h`, good: Number(stats.avgDuration) >= 7 },
            { label: "Eficienta", value: `${stats.avgEfficiency}%`, good: Number(stats.avgEfficiency) >= 85 },
            { label: "Somn profund", value: `${stats.deepPct}%`, good: Number(stats.deepPct) >= 15 },
            { label: "Regularitate", value: `±${stats.regularity}h`, good: Number(stats.regularity) < 1 },
            { label: "Jet lag social", value: `${stats.socialJetLag}h`, good: Number(stats.socialJetLag) < 1 },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-card-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted mb-1">{s.label}</p>
              <p className={`text-lg font-bold ${s.good ? "text-accent" : "text-warning"}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Stacked bar chart */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <h3 className="text-sm font-medium mb-4">
          Stadii somn
          <span className="text-muted ml-2 font-normal">ultimele {days}z</span>
        </h3>

        <div className="flex gap-4 text-xs text-muted mb-3">
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded bg-blue-900 inline-block" /> Profund
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded bg-blue-500 inline-block" /> Usor
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded bg-purple-500 inline-block" /> REM
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded bg-red-400/50 inline-block" /> Treaz
          </span>
        </div>

        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: "#737373", fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#737373", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={30}
                label={{ value: "hours", angle: -90, position: "insideLeft", style: { fill: "#525252", fontSize: 10 } }}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(val, name) => [
                  `${Number(val).toFixed(1)}h`,
                  String(name).charAt(0).toUpperCase() + String(name).slice(1),
                ]}
              />
              <ReferenceLine y={7} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
              <ReferenceLine y={9} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Bar dataKey="deep" stackId="sleep" fill="#1e3a5f" radius={[0, 0, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="core" stackId="sleep" fill="#3b82f6" isAnimationActive={false} />
              <Bar dataKey="rem" stackId="sleep" fill="#a855f7" isAnimationActive={false} />
              <Bar dataKey="awake" stackId="sleep" fill="#f87171" fillOpacity={0.4} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
