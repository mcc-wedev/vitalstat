"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";
import { meanStd } from "@/lib/stats/zScore";
import { generateSmartInsights, type SmartInsight } from "@/lib/stats/smartInsights";
import { mannKendall } from "@/lib/stats/advanced";
import { LineChart, Line, ResponsiveContainer, ReferenceDot } from "recharts";
import { ShareDailyReport } from "./ShareDailyReport";
import { RecoveryRootCause } from "./RecoveryRootCause";

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
  delta: number;
  deltaPct: number;
  zScore: number;
  status: "green" | "amber" | "red";
  higherIsBetter: boolean;
  sparkline: number[];
  todayIdx: number;
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

function getEnergyColor(score: number): string {
  if (score >= 80) return "#34C759";
  if (score >= 60) return "#30D158";
  if (score >= 40) return "#FF9500";
  return "#FF3B30";
}

function getEnergyLabel(score: number): string {
  if (score >= 80) return "Energie ridicata";
  if (score >= 60) return "Energie buna";
  if (score >= 40) return "Energie moderata";
  if (score >= 20) return "Energie scazuta";
  return "Energie critica";
}

const STATUS_COLORS = {
  green: { bg: "rgba(52,199,89,0.08)", border: "rgba(52,199,89,0.2)", accent: "#34C759" },
  amber: { bg: "rgba(255,149,0,0.08)", border: "rgba(255,149,0,0.2)", accent: "#FF9500" },
  red: { bg: "rgba(255,59,48,0.08)", border: "rgba(255,59,48,0.2)", accent: "#FF3B30" },
};

/* ═══════════════════════════════════════════════════
 *  TRAINING READINESS — "Ce poti face azi"
 *  Based on recovery score + individual components.
 *  Like Garmin Training Readiness / WHOOP Strain Coach.
 * ═══════════════════════════════════════════════════ */

interface TrainingGuidance {
  icon: string;
  label: string;
  color: string;
  activities: string[];
  avoid: string[];
  reason: string;
}

function getTrainingGuidance(
  total: number,
  components: { name: string; score: number; weight: number; available: boolean }[],
): TrainingGuidance {
  const get = (name: string) => components.find(c => c.name === name && c.available)?.score ?? -1;
  const hrvScore = get("HRV");
  const sleepScore = get("Somn");
  const strainScore = get("Efort ieri");
  const trainingScore = get("Balanta antrenament");

  if (total >= 80) {
    const hasGreatSleep = sleepScore >= 80;
    return {
      icon: "🟢", label: "Pregatit pentru efort maxim", color: "#34C759",
      activities: ["Intervale de intensitate mare (HIIT)", "Antrenament de forta greu", "Cardio lung (>60 min)", "Competitie / testare"],
      avoid: [],
      reason: hasGreatSleep
        ? "Somn excelent + recuperare completa. Corpul este pregatit pentru performanta de varf."
        : "Toti indicatorii fiziologici sunt in zona verde. Valorifica aceasta zi.",
    };
  }

  if (total >= 60) {
    const lowHRV = hrvScore >= 0 && hrvScore < 40;
    const highStrain = strainScore >= 0 && strainScore < 40;
    return {
      icon: "🟡", label: "Antrenament moderat", color: "#30D158",
      activities: ["Cardio zona 2 (30-45 min)", "Forta cu volum redus", "Tehnica / mobilitate"],
      avoid: lowHRV
        ? ["Intervale intense — HRV-ul nu s-a recuperat complet"]
        : highStrain
        ? ["Volum mare — efortul de ieri inca se simte"]
        : ["Sesiuni de peste 90 min"],
      reason: lowHRV
        ? "Energie buna, dar sistemul nervos autonom are nevoie de mai mult timp. Pastrati intensitatea sub 75% din pulsul maxim."
        : highStrain
        ? "Recuperare buna general, dar efortul recent necesita o zi mai usoara."
        : "Corp in stare buna. Antrenament productiv la intensitate moderata.",
    };
  }

  if (total >= 40) {
    const poorSleep = sleepScore >= 0 && sleepScore < 40;
    return {
      icon: "🟠", label: "Recuperare activa", color: "#FF9500",
      activities: ["Mers 30-45 min", "Stretching / yoga", "Mobilitate articulara"],
      avoid: ["Antrenament intens", "Forta grea", "Intervale"],
      reason: poorSleep
        ? "Somnul slab a afectat recuperarea. Corpul repara tesuturile in timpul somnului profund — fara somn bun, antrenamentul intens face mai mult rau decat bine."
        : "Mai multi indicatori sunt sub normal. O zi de miscare usoara ajuta la recuperare fara a adauga stres.",
    };
  }

  return {
    icon: "🔴", label: "Odihna prioritara", color: "#FF3B30",
    activities: ["Somn suplimentar (+1-2 ore)", "Plimbare scurta (15-20 min)", "Hidratare si nutritie"],
    avoid: ["Orice efort intens", "Antrenament de forta", "Cardio peste 30 min"],
    reason: "Corpul are nevoie de odihna. Antrenamentul in aceasta stare intarzie recuperarea si creste riscul de accidentare. Prioritati: somn, hidratare, alimentatie.",
  };
}

/* ═══════════════════════════════════════════════════
 *  7-DAY MINI-TRENDS — directia indicatorilor cheie
 * ═══════════════════════════════════════════════════ */

interface MiniTrend {
  label: string;
  direction: "up" | "down" | "flat";
  improving: boolean;
  delta: string;
}

function compute7dayTrends(metrics: Record<string, DailySummary[]>, date: string): MiniTrend[] {
  const trends: MiniTrend[] = [];
  const checks = [
    { key: "restingHeartRate", label: "Puls", field: "mean" as const, higherBetter: false, unit: "bpm" },
    { key: "hrv", label: "HRV", field: "mean" as const, higherBetter: true, unit: "ms" },
    { key: "stepCount", label: "Pasi", field: "sum" as const, higherBetter: true, unit: "" },
  ];

  for (const c of checks) {
    const data = metrics[c.key];
    if (!data || data.length < 10) continue;
    const recent = data.filter(d => d.date <= date).slice(-10);
    if (recent.length < 8) continue;
    const vals = recent.map(d => d[c.field]);
    const mk = mannKendall(vals);
    if (!mk) continue;

    const first = vals[0], last = vals[vals.length - 1];
    const delta = last - first;
    const direction: "up" | "down" | "flat" = Math.abs(mk.tau) < 0.15 ? "flat" : mk.tau > 0 ? "up" : "down";
    const improving = direction === "flat" ? true : (mk.tau > 0) === c.higherBetter;

    trends.push({
      label: c.label,
      direction,
      improving,
      delta: direction === "flat" ? "stabil" : `${delta > 0 ? "+" : ""}${Math.round(delta)} ${c.unit}`,
    });
  }

  return trends;
}

/* ═══════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════════ */

export function DailyReport({ date, metrics, sleepNights }: DailyReportProps) {
  const BASELINE_DAYS = 28;

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

      const last7 = data.filter(d => d.date <= date).slice(-7);
      const sparkline = last7.map(d => {
        const raw = d[field];
        return key === "oxygenSaturation" && raw <= 1 ? raw * 100 : raw;
      });
      const todayIdx = sparkline.length - 1;

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

  const allInsights = useMemo(() => {
    const filtered: Record<string, DailySummary[]> = {};
    for (const [key, data] of Object.entries(metrics)) {
      filtered[key] = data.filter(d => d.date <= date);
    }
    const filteredSleep = sleepNights.filter(n => n.date <= date);
    return generateSmartInsights(filtered, filteredSleep, metrics, sleepNights, 7);
  }, [metrics, sleepNights, date]);

  // Split insights: alerts (critical/warning) vs analysis (info/positive)
  const alerts = useMemo(() => allInsights.filter(i => i.severity === "critical" || i.severity === "warning").slice(0, 3), [allInsights]);
  const analysis = useMemo(() => allInsights.filter(i => i.severity !== "critical" && i.severity !== "warning").slice(0, 4), [allInsights]);

  const guidance = useMemo(() => {
    if (!recovery.hasEnoughData) return null;
    return getTrainingGuidance(recovery.total, recovery.components);
  }, [recovery]);

  const trends = useMemo(() => compute7dayTrends(metrics, date), [metrics, date]);

  const energyColor = getEnergyColor(recovery.total);
  const energyLabel = getEnergyLabel(recovery.total);

  const dayLabel = date === new Date().toISOString().substring(0, 10) ? "Azi"
    : date === new Date(Date.now() - 86400000).toISOString().substring(0, 10) ? "Ieri"
    : new Date(date).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} className="animate-in">
      {/* Header */}
      <div style={{ textAlign: "center", paddingBottom: 4 }}>
        <div className="flex items-center justify-center gap-2">
          <h2 className="hh-headline" style={{ fontSize: 20, fontWeight: 600, color: "var(--label-primary)", textTransform: "capitalize" }}>
            {dayLabel}
          </h2>
          <ShareDailyReport date={date} metrics={metrics} sleepNights={sleepNights} />
        </div>
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", marginTop: 2 }}>{date}</p>
      </div>

      {/* Energy Score — compact Apple card */}
      {recovery.hasEnoughData && (
        <div className="hh-card" style={{ padding: 16 }}>
          <div className="flex items-center gap-4">
            {/* Ring */}
            <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
              <svg width={80} height={80} viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
                <circle cx={40} cy={40} r={32} fill="none" stroke={energyColor} strokeWidth={8} opacity={0.15} />
                <circle
                  cx={40} cy={40} r={32} fill="none"
                  stroke={energyColor} strokeWidth={8} strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 32}
                  strokeDashoffset={2 * Math.PI * 32 * (1 - Math.min(recovery.total, 100) / 100)}
                  style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)", filter: `drop-shadow(0 0 3px ${energyColor}66)` }}
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="hh-mono-num" style={{ fontSize: 26, fontWeight: 700, color: energyColor, lineHeight: 1 }}>
                  {recovery.total}
                </span>
              </div>
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="hh-headline" style={{ color: energyColor, fontWeight: 600, fontSize: 15, marginBottom: 2 }}>
                {energyLabel}
              </p>
              <p className="hh-caption" style={{ color: "var(--label-tertiary)", marginBottom: 8 }}>
                Energie corporala
                {recovery.confidence !== "high" && (
                  <span style={{ marginLeft: 6, color: recovery.confidence === "medium" ? "#FF9500" : "#FF3B30" }}>
                    · {recovery.confidence === "medium" ? "aprox." : "limitat"}
                  </span>
                )}
              </p>

              {/* Top sub-scores */}
              <div className="flex flex-wrap gap-1.5">
                {recovery.components.filter(c => c.available).sort((a, b) => b.weight - a.weight).slice(0, 4).map(c => (
                  <span
                    key={c.name}
                    className="hh-caption-2 hh-mono-num"
                    style={{
                      padding: "2px 7px",
                      borderRadius: 6,
                      background: "rgba(120,120,128,0.12)",
                      color: "var(--label-secondary)",
                      fontWeight: 600,
                      fontSize: 11,
                    }}
                  >
                    {c.name} {c.score}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TRAINING GUIDANCE — "Ce poti face azi" ═══ */}
      {guidance && (
        <div className="hh-card" style={{ padding: 16, borderLeft: `4px solid ${guidance.color}` }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>{guidance.icon}</span>
            <span className="hh-headline" style={{ color: guidance.color, fontWeight: 700, fontSize: 16 }}>
              {guidance.label}
            </span>
          </div>

          <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.5, marginBottom: 10 }}>
            {guidance.reason}
          </p>

          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p className="hh-caption-2" style={{ color: "var(--label-tertiary)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                Recomandat
              </p>
              {guidance.activities.map((a, i) => (
                <p key={i} className="hh-footnote" style={{ color: "var(--label-primary)", lineHeight: 1.6, fontSize: 12 }}>
                  ✓ {a}
                </p>
              ))}
            </div>
            {guidance.avoid.length > 0 && (
              <div style={{ flex: 1 }}>
                <p className="hh-caption-2" style={{ color: "var(--label-tertiary)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                  De evitat
                </p>
                {guidance.avoid.map((a, i) => (
                  <p key={i} className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.6, fontSize: 12 }}>
                    ✗ {a}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ EARLY DETECTION ALERTS ═══ */}
      {alerts.length > 0 && (
        <section>
          <div className="hh-section-label">
            <span>Semnale timpurii</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map(ins => {
              const isCritical = ins.severity === "critical";
              return (
                <div
                  key={ins.id}
                  className="hh-card"
                  style={{
                    padding: "12px 14px",
                    borderLeft: `4px solid ${isCritical ? "#FF3B30" : "#FF9500"}`,
                    background: isCritical ? "rgba(255,59,48,0.06)" : "rgba(255,149,0,0.06)",
                  }}
                >
                  <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{isCritical ? "⚠️" : "⚡"}</span>
                    <p className="hh-subheadline" style={{ color: "var(--label-primary)", fontWeight: 600, fontSize: 13 }}>
                      {ins.title}
                    </p>
                  </div>
                  <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.45, marginLeft: 22 }}>
                    {ins.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Root-cause explainer */}
      <RecoveryRootCause date={date} metrics={metrics} sleepNights={sleepNights} />

      {/* ═══ 7-DAY TRENDS ═══ */}
      {trends.length > 0 && (
        <div className="hh-card" style={{ padding: "12px 16px" }}>
          <p className="hh-caption-2" style={{ color: "var(--label-tertiary)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
            Directia ultimelor 10 zile
          </p>
          <div className="flex items-center justify-between">
            {trends.map(t => {
              const arrow = t.direction === "up" ? "↑" : t.direction === "down" ? "↓" : "→";
              const color = t.direction === "flat" ? "var(--label-tertiary)" : t.improving ? "#34C759" : "#FF3B30";
              return (
                <div key={t.label} style={{ textAlign: "center", flex: 1 }}>
                  <p className="hh-caption-2" style={{ color: "var(--label-tertiary)", marginBottom: 2 }}>{t.label}</p>
                  <p className="hh-mono-num" style={{ color, fontWeight: 700, fontSize: 16 }}>{arrow}</p>
                  <p className="hh-caption-2 hh-mono-num" style={{ color, fontSize: 11 }}>{t.delta}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metric grid — Apple Health card style */}
      <div className="grid grid-cols-2 gap-2.5">
        {snapshots.map(snap => {
          const colors = STATUS_COLORS[snap.status];
          const arrow = snap.deltaPct > 2 ? "↑" : snap.deltaPct < -2 ? "↓" : "→";
          const decimals = METRIC_CONFIG[snap.key]?.decimals ?? 0;

          return (
            <div key={snap.key} className="hh-card" style={{ padding: 12, borderLeft: `3px solid ${colors.accent}` }}>
              <div className="flex items-start justify-between" style={{ marginBottom: 4 }}>
                <span className="hh-caption-2" style={{ color: "var(--label-secondary)", fontWeight: 600 }}>
                  {snap.label}
                </span>
                <span className="hh-caption-2 hh-mono-num" style={{ color: colors.accent, fontWeight: 600 }}>
                  {arrow} {Math.abs(snap.deltaPct).toFixed(0)}%
                </span>
              </div>
              <div style={{ marginBottom: 2 }}>
                <span className="hh-mono-num" style={{ fontSize: 22, fontWeight: 700, color: "var(--label-primary)", lineHeight: 1 }}>
                  {snap.value.toFixed(decimals)}
                </span>
                <span className="hh-caption" style={{ color: "var(--label-tertiary)", marginLeft: 4 }}>{snap.unit}</span>
              </div>
              <p className="hh-caption-2" style={{ color: "var(--label-tertiary)" }}>
                medie 28z: {snap.baseline.toFixed(decimals)} {snap.unit}
              </p>
              {/* Sparkline */}
              <div className="hh-chart" style={{ height: 28, marginTop: 6 }}>
                <ResponsiveContainer width="99%" height="100%">
                  <LineChart data={snap.sparkline.map((v, i) => ({ v, i }))}>
                    <Line type="monotone" dataKey="v" stroke={colors.accent} strokeWidth={1.5} dot={false} />
                    <ReferenceDot x={snap.todayIdx} y={snap.sparkline[snap.todayIdx]} r={3} fill={colors.accent} stroke="none" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}

        {/* Sleep card */}
        {sleepTonight && (() => {
          const colors = STATUS_COLORS[sleepTonight.status];
          return (
            <div className="hh-card" style={{ padding: 12, borderLeft: `3px solid ${colors.accent}` }}>
              <div className="flex items-start justify-between" style={{ marginBottom: 4 }}>
                <span className="hh-caption-2" style={{ color: "var(--label-secondary)", fontWeight: 600 }}>Somn</span>
                <span className="hh-caption-2 hh-mono-num" style={{ color: colors.accent, fontWeight: 600 }}>
                  eff {sleepTonight.effPct}%
                </span>
              </div>
              <div style={{ marginBottom: 2 }}>
                <span className="hh-mono-num" style={{ fontSize: 22, fontWeight: 700, color: "var(--label-primary)", lineHeight: 1 }}>
                  {sleepTonight.hours.toFixed(1)}
                </span>
                <span className="hh-caption" style={{ color: "var(--label-tertiary)", marginLeft: 4 }}>ore</span>
              </div>
              <p className="hh-caption-2" style={{ color: "var(--label-tertiary)" }}>
                medie 28z: {sleepTonight.baseline.toFixed(1)} ore
              </p>
              <div className="flex gap-3" style={{ marginTop: 6 }}>
                <span className="hh-caption-2" style={{ color: sleepTonight.deepPct >= 15 ? "#34C759" : "#FF9500", fontWeight: 600 }}>
                  Deep {sleepTonight.deepPct}%
                </span>
                <span className="hh-caption-2" style={{ color: sleepTonight.remPct >= 20 ? "#34C759" : "#FF9500", fontWeight: 600 }}>
                  REM {sleepTonight.remPct}%
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ═══ ANALYSIS — info/positive insights ═══ */}
      {analysis.length > 0 && (
        <section>
          <div className="hh-section-label">
            <span>Analiza</span>
          </div>
          <div className="hh-card" style={{ padding: 0 }}>
            {analysis.map((ins, i) => {
              const sevColor = ins.severity === "positive" ? "#34C759" : "#5AC8FA";
              return (
                <div
                  key={ins.id}
                  style={{
                    padding: "12px 16px",
                    borderTop: i === 0 ? "none" : "0.5px solid var(--separator)",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0, width: 6, height: 6, borderRadius: "50%",
                      background: sevColor, marginTop: 6,
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="hh-subheadline" style={{ color: "var(--label-primary)", fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                      {ins.title}
                    </p>
                    <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.4 }}>
                      {ins.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
