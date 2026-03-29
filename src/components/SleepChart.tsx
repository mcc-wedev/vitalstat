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

    const efficiencies = sliced.map((d) => d.efficiency * 100);
    const durations = sliced.map((d) => d.totalMinutes / 60);

    const weekdayMid: number[] = [];
    const weekendMid: number[] = [];
    sliced.forEach((d) => {
      const dow = new Date(d.date).getDay();
      if (dow === 0 || dow === 5 || dow === 6) weekendMid.push(d.sleepMidpoint);
      else weekdayMid.push(d.sleepMidpoint);
    });

    const avgWeekdayMid = weekdayMid.length > 0 ? weekdayMid.reduce((a, b) => a + b, 0) / weekdayMid.length : 0;
    const avgWeekendMid = weekendMid.length > 0 ? weekendMid.reduce((a, b) => a + b, 0) / weekendMid.length : 0;

    const { mean: avgDuration } = meanStd(durations);
    const { mean: avgEfficiency } = meanStd(efficiencies);
    const midpoints = sliced.map(d => d.sleepMidpoint);
    const { std: midpointStd } = meanStd(midpoints);
    const socialJetLag = Math.abs(avgWeekendMid - avgWeekdayMid);

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
      <div className="glass p-6 text-center" style={{ color: "rgba(235,235,245,0.3)" }}>
        Nu sunt date de somn disponibile
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { label: "Durata medie", value: `${stats.avgDuration}h`, good: Number(stats.avgDuration) >= 7 },
            { label: "Eficienta", value: `${stats.avgEfficiency}%`, good: Number(stats.avgEfficiency) >= 85 },
            { label: "Somn profund", value: `${stats.deepPct}%`, good: Number(stats.deepPct) >= 15 },
            { label: "Regularitate", value: `\u00b1${stats.regularity}h`, good: Number(stats.regularity) < 1 },
            { label: "Jet lag social", value: `${stats.socialJetLag}h`, good: Number(stats.socialJetLag) < 1 },
          ].map((s) => (
            <div key={s.label} className="glass p-3 text-center">
              <p className="text-[11px] mb-1" style={{ color: "rgba(235,235,245,0.3)" }}>{s.label}</p>
              <p className="text-[22px] font-bold" style={{ color: s.good ? "#34C759" : "#FF9500" }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Stacked bar chart — purple theme */}
      <div className="glass p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "#AF52DE" }} />
            <h3 className="text-[17px] font-normal text-white">
              Stadii somn
            </h3>
            <span className="text-[13px]" style={{ color: "rgba(235,235,245,0.3)" }}>
              ultimele {chartData.length}z
            </span>
          </div>
          <div className="flex gap-2 sm:gap-3 text-[11px]" style={{ color: "rgba(235,235,245,0.3)" }}>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2 rounded inline-block" style={{ background: "#5E35B1" }} /> Profund</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2 rounded inline-block" style={{ background: "#AF52DE" }} /> Usor</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2 rounded inline-block" style={{ background: "#CE93D8" }} /> REM</span>
            <span className="hidden sm:flex items-center gap-1"><span className="w-2.5 h-2 rounded inline-block" style={{ background: "#FF3B30", opacity: 0.5 }} /> Treaz</span>
          </div>
        </div>

        <div className="h-52 sm:h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: "rgba(235,235,245,0.3)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={35}
              />
              <YAxis
                tick={{ fill: "rgba(235,235,245,0.3)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  background: "#1C1C1E",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "13px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((val: any, name: any) => {
                  const labels: Record<string, string> = { deep: "Profund", core: "Usor", rem: "REM", awake: "Treaz" };
                  return [`${Number(val).toFixed(1)}h`, labels[String(name)] || String(name)];
                }) as any}
              />
              <ReferenceLine y={7} stroke="rgba(235,235,245,0.1)" strokeDasharray="4 4" />
              <ReferenceLine y={9} stroke="rgba(235,235,245,0.1)" strokeDasharray="4 4" />
              <Bar dataKey="deep" stackId="sleep" fill="#5E35B1" radius={[0, 0, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="core" stackId="sleep" fill="#AF52DE" isAnimationActive={false} />
              <Bar dataKey="rem" stackId="sleep" fill="#CE93D8" isAnimationActive={false} />
              <Bar dataKey="awake" stackId="sleep" fill="#FF3B30" fillOpacity={0.4} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
