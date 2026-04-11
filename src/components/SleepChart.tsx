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
    <div className="space-y-3 animate-in">
      {/* Summary stats — Apple Health summary card */}
      {stats && (
        <div className="hh-card">
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#AF52DE" }} />
            <span className="hh-caption" style={{
              color: "var(--label-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.045em",
              fontWeight: 500,
            }}>
              Rezumat somn · ultimele {chartData.length} nopti
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {[
              { label: "Durata", value: `${stats.avgDuration}h`, good: Number(stats.avgDuration) >= 7 },
              { label: "Eficienta", value: `${stats.avgEfficiency}%`, good: Number(stats.avgEfficiency) >= 85 },
              { label: "Profund", value: `${stats.deepPct}%`, good: Number(stats.deepPct) >= 15 },
              { label: "Regularitate", value: `\u00b1${stats.regularity}h`, good: Number(stats.regularity) < 1 },
              { label: "Jet lag", value: `${stats.socialJetLag}h`, good: Number(stats.socialJetLag) < 1 },
            ].map((s) => (
              <div key={s.label}>
                <p className="hh-caption-2" style={{ color: "var(--label-tertiary)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  {s.label}
                </p>
                <p className="hh-mono-num" style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: s.good ? "var(--success)" : "var(--warning)",
                  lineHeight: 1.1,
                }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stacked bar chart */}
      <div className="hh-card">
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#AF52DE" }} />
            <span className="hh-headline truncate" style={{ color: "var(--label-primary)" }}>
              Stadii somn
            </span>
          </div>
          <div className="flex gap-2 sm:gap-3 shrink-0">
            <LegendDot color="#5E35B1" label="Profund" />
            <LegendDot color="#AF52DE" label="Usor" />
            <LegendDot color="#CE93D8" label="REM" />
          </div>
        </div>

        <div className="hh-chart" style={{ height: 200 }}>
          <ResponsiveContainer width="99%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: "rgba(235,235,245,0.35)", fontSize: 11, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: "rgba(235,235,245,0.35)", fontSize: 11, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(30,30,32,0.95)",
                  backdropFilter: "blur(20px)",
                  border: "0.5px solid rgba(84,84,88,0.35)",
                  borderRadius: 10,
                  fontSize: 12,
                  padding: "8px 12px",
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
              <Bar dataKey="awake" stackId="sleep" fill="#FF3B30" fillOpacity={0.4} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="hh-caption-2 flex items-center gap-1" style={{ color: "var(--label-tertiary)" }}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
