"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";
import { meanStd } from "@/lib/stats/zScore";
import { generateInsights } from "@/lib/stats/insights";
import { LineChart, Line, ResponsiveContainer, ReferenceDot } from "recharts";
import { ShareDailyReport } from "./ShareDailyReport";

interface DailyReportProps {
  date: string; // "YYYY-MM-DD"
  metrics: Record<string, DailySummary[]>;      // ALL data (unfiltered)
  sleepNights: SleepNight[];                     // ALL data (unfiltered)
}

interface MetricSnapshot {
  key: string;
  label: string;
  unit: string;
  value: number;
  baseline: number;
  delta: number;       // absolute difference
  deltaPct: number;    // percentage difference
  zScore: number;
  status: "green" | "amber" | "red";
  higherIsBetter: boolean;
  sparkline: number[];
  todayIdx: number;    // index of today in sparkline
}

const DAILY_METRICS = [
  { key: "restingHeartRate", field: "mean" as const },
  { key: "hrv", field: "mean" as const },
  { key: "oxygenSaturation", field: "mean" as const },
  { key: "stepCount", field: "sum" as const },
  { key: "activeEnergy", field: "sum" as const },
  { key: "exerciseTime", field: "sum" as const },
  { key: "respiratoryRate", field: "mean" as const },
  { key: "walkingSpeed", field: "mean" as const },
];

function getStatus(z: number, higherIsBetter: boolean): "green" | "amber" | "red" {
  const effectiveZ = higherIsBetter ? z : -z;
  if (effectiveZ > -1) return "green";
  if (effectiveZ > -2) return "amber";
  return "red";
}

const STATUS_COLORS = {
  green: { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)", text: "#10b981" },
  amber: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#f59e0b" },
  red: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
};

export function DailyReport({ date, metrics, sleepNights }: DailyReportProps) {
  const BASELINE_DAYS = 28;

  // Compute recovery score using ALL data
  const recovery = useMemo(() => {
    return calculateRecovery(
      metrics.restingHeartRate || [],
      metrics.hrv || [],
      sleepNights,
      date,
      metrics.exerciseTime,
      metrics.respiratoryRate,
      metrics.oxygenSaturation,
      metrics.wristTemperature,
    );
  }, [metrics, sleepNights, date]);

  // Compute metric snapshots
  const snapshots = useMemo(() => {
    const result: MetricSnapshot[] = [];

    for (const { key, field } of DAILY_METRICS) {
      const data = metrics[key];
      const config = METRIC_CONFIG[key];
      if (!data || !config || data.length < 14) continue;

      const todayData = data.find(d => d.date === date);
      if (!todayData) continue;

      const value = todayData[field];
      const before = data.filter(d => d.date < date).slice(-BASELINE_DAYS);
      if (before.length < 7) continue;

      const baselineValues = before.map(d => d[field]);
      const { mean: baseline, std } = meanStd(baselineValues);
      const z = std > 0 ? (value - baseline) / std : 0;
      const delta = value - baseline;
      const deltaPct = baseline > 0 ? (delta / baseline) * 100 : 0;

      // Sparkline: last 7 days of data
      const last7 = data.filter(d => d.date <= date).slice(-7);
      const sparkline = last7.map(d => d[field]);
      const todayIdx = sparkline.length - 1;

      // Format value for SpO2 — Apple stores as 0.0-1.0, display as %
      // Use >50 threshold (not >1) to safely distinguish formats
      let displayValue = value;
      if (key === "oxygenSaturation" && value <= 50) displayValue = value * 100;
      let displayBaseline = baseline;
      if (key === "oxygenSaturation" && baseline <= 50) displayBaseline = baseline * 100;

      result.push({
        key,
        label: config.label,
        unit: config.unit,
        value: displayValue,
        baseline: displayBaseline,
        delta: key === "oxygenSaturation" && Math.abs(delta) < 1 ? delta * 100 : delta,
        deltaPct,
        zScore: z,
        status: getStatus(z, config.higherIsBetter),
        higherIsBetter: config.higherIsBetter,
        sparkline,
        todayIdx,
      });
    }

    return result;
  }, [metrics, date]);

  // Sleep snapshot for today
  const sleepTonight = useMemo(() => {
    const night = sleepNights.find(n => n.date === date);
    if (!night) return null;
    const before = sleepNights.filter(n => n.date < date).slice(-BASELINE_DAYS);
    if (before.length < 7) return null;

    const durations = before.map(n => n.totalMinutes / 60);
    const { mean: baseline, std } = meanStd(durations);
    const hours = night.totalMinutes / 60;
    const z = std > 0 ? (hours - baseline) / std : 0;
    const effPct = Math.round(night.efficiency * 100);
    const deepPct = night.totalMinutes > 0 ? Math.round((night.stages.deep / night.totalMinutes) * 100) : 0;
    const remPct = night.totalMinutes > 0 ? Math.round((night.stages.rem / night.totalMinutes) * 100) : 0;

    return { hours, baseline, z, effPct, deepPct, remPct, status: getStatus(z, true) as "green" | "amber" | "red" };
  }, [sleepNights, date]);

  // Top insights for this date
  const topInsights = useMemo(() => {
    // Filter metrics to only include data up to target date
    const filtered: Record<string, DailySummary[]> = {};
    for (const [key, data] of Object.entries(metrics)) {
      filtered[key] = data.filter(d => d.date <= date);
    }
    const filteredSleep = sleepNights.filter(n => n.date <= date);
    return generateInsights(filtered, filteredSleep).slice(0, 3);
  }, [metrics, sleepNights, date]);

  const scoreColor = recovery.total >= 80 ? "#10b981" : recovery.total >= 60 ? "#22d3ee" : recovery.total >= 40 ? "#f59e0b" : recovery.total >= 20 ? "#f97316" : "#ef4444";
  const scoreLabel = recovery.total >= 80 ? "Excelent" : recovery.total >= 60 ? "Bun" : recovery.total >= 40 ? "Mediu" : recovery.total >= 20 ? "Slab" : "Critic";

  const dayLabel = date === new Date().toISOString().substring(0, 10) ? "Azi"
    : date === new Date(Date.now() - 86400000).toISOString().substring(0, 10) ? "Ieri"
    : new Date(date).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-4 animate-in">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-lg font-semibold capitalize">{dayLabel}</h2>
        <p className="text-xs text-[var(--muted)]">{date}</p>
        <div className="mt-3 flex justify-center">
          <ShareDailyReport date={date} metrics={metrics} sleepNights={sleepNights} />
        </div>
      </div>

      {/* Recovery Score — compact horizontal */}
      {recovery.hasEnoughData && (
        <div className="glass p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-4xl font-bold tabular-nums" style={{ color: scoreColor }}>{recovery.total}</span>
              <div>
                <div className="text-xs font-medium" style={{ color: scoreColor }}>{scoreLabel}</div>
                <div className="text-[10px] text-[var(--muted)]">Recuperare</div>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-3 gap-2">
              {recovery.components.filter(c => c.available).slice(0, 3).map(comp => (
                <div key={comp.name} className="text-center">
                  <div className="text-xs font-medium tabular-nums">{comp.score}</div>
                  <div className="h-1 rounded-full mt-0.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${comp.score}%`,
                      background: comp.score >= 70 ? "#10b981" : comp.score >= 40 ? "#f59e0b" : "#ef4444",
                    }} />
                  </div>
                  <div className="text-[9px] text-[var(--muted)] mt-0.5 truncate">{comp.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Metric cards grid — traffic light */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {snapshots.map(snap => {
          const colors = STATUS_COLORS[snap.status];
          const arrow = snap.deltaPct > 2 ? "↑" : snap.deltaPct < -2 ? "↓" : "→";
          const isGood = (snap.deltaPct > 0 && snap.higherIsBetter) || (snap.deltaPct < 0 && !snap.higherIsBetter);
          const decimals = METRIC_CONFIG[snap.key]?.decimals ?? 0;

          return (
            <div key={snap.key} className="rounded-xl p-3 border" style={{
              background: colors.bg,
              borderColor: colors.border,
            }}>
              <div className="flex items-start justify-between mb-1">
                <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">{snap.label}</span>
                <span className="text-[10px] font-medium" style={{ color: isGood ? "#10b981" : snap.status === "green" ? "var(--muted)" : colors.text }}>
                  {arrow} {Math.abs(snap.deltaPct).toFixed(0)}%
                </span>
              </div>
              <div className="text-xl font-bold tabular-nums">{snap.value.toFixed(decimals)}<span className="text-[10px] text-[var(--muted)] ml-1">{snap.unit}</span></div>
              <div className="text-[9px] text-[var(--muted)] mt-0.5">medie 28z: {snap.baseline.toFixed(decimals)} {snap.unit}</div>
              {/* Mini sparkline */}
              <div className="hh-chart h-6 mt-1">
                <ResponsiveContainer width="99%" height="100%">
                  <LineChart data={snap.sparkline.map((v, i) => ({ v, i }))}>
                    <Line type="monotone" dataKey="v" stroke={colors.text} strokeWidth={1.5} dot={false} />
                    <ReferenceDot x={snap.todayIdx} y={snap.sparkline[snap.todayIdx]} r={3} fill={colors.text} stroke="none" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}

        {/* Sleep card */}
        {sleepTonight && (
          <div className="rounded-xl p-3 border" style={{
            background: STATUS_COLORS[sleepTonight.status].bg,
            borderColor: STATUS_COLORS[sleepTonight.status].border,
          }}>
            <div className="flex items-start justify-between mb-1">
              <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Somn</span>
              <span className="text-[10px] font-medium" style={{ color: STATUS_COLORS[sleepTonight.status].text }}>
                eff {sleepTonight.effPct}%
              </span>
            </div>
            <div className="text-xl font-bold tabular-nums">{sleepTonight.hours.toFixed(1)}<span className="text-[10px] text-[var(--muted)] ml-1">ore</span></div>
            <div className="text-[9px] text-[var(--muted)] mt-0.5">medie 28z: {sleepTonight.baseline.toFixed(1)} ore</div>
            <div className="flex gap-2 mt-1.5 text-[9px]">
              <span style={{ color: sleepTonight.deepPct >= 15 ? "#10b981" : "#f59e0b" }}>Deep {sleepTonight.deepPct}%</span>
              <span style={{ color: sleepTonight.remPct >= 20 ? "#10b981" : "#f59e0b" }}>REM {sleepTonight.remPct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Top insights */}
      {topInsights.length > 0 && (
        <div className="glass p-4">
          <h3 className="text-xs font-semibold mb-3 text-[var(--muted-strong)]">Ce spun datele</h3>
          <div className="space-y-3">
            {topInsights.map(insight => {
              const icon = insight.severity === "alert" ? "🔴" : insight.severity === "warning" ? "🟡" : insight.severity === "good" ? "🟢" : "🔵";
              return (
                <div key={insight.id}>
                  <div className="text-xs font-medium">{icon} {insight.title}</div>
                  <p className="text-[11px] text-[var(--muted-strong)] mt-0.5 leading-relaxed">{insight.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
