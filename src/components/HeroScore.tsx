"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";

interface HeroScoreProps {
  rhrData: DailySummary[];
  hrvData: DailySummary[];
  sleepData: SleepNight[];
  exerciseData?: DailySummary[];
  respData?: DailySummary[];
  spo2Data?: DailySummary[];
  tempData?: DailySummary[];
  periodDates?: string[];
  periodLabel?: string;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Energie ridicata";
  if (score >= 60) return "Energie buna";
  if (score >= 40) return "Energie moderata";
  if (score >= 20) return "Energie scazuta";
  return "Energie critica";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#34C759";
  if (score >= 60) return "#30D158";
  if (score >= 40) return "#FF9500";
  return "#FF3B30";
}

/**
 * Recovery ring gauge — single circular ring (Apple-style).
 * Renders as SVG arc with rounded linecap and subtle glow.
 */
function RecoveryRing({ score, color, size = 100 }: { score: number; color: string; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      {/* Background track */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={0.15}
      />
      {/* Progress arc */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{
          transition: "stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)",
          filter: `drop-shadow(0 0 4px ${color}66)`,
        }}
      />
    </svg>
  );
}

export function HeroScore({
  rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData,
  periodDates, periodLabel,
}: HeroScoreProps) {
  const result = useMemo(() => {
    let dates = periodDates && periodDates.length > 0
      ? [...new Set(periodDates)].sort()
      : [];

    if (dates.length === 0) {
      const allDates = [...rhrData.map(d => d.date), ...hrvData.map(d => d.date)];
      const last = [...new Set(allDates)].sort().pop();
      if (last) dates = [last];
    }

    if (dates.length === 0) return null;

    const recoveries = dates
      .map(date => calculateRecovery(rhrData, hrvData, sleepData, date, exerciseData, respData, spo2Data, tempData))
      .filter(r => r.hasEnoughData);

    if (recoveries.length === 0) {
      const latest = [...new Set([...rhrData.map(d => d.date), ...hrvData.map(d => d.date)])].sort().pop();
      if (latest) {
        const rec = calculateRecovery(rhrData, hrvData, sleepData, latest, exerciseData, respData, spo2Data, tempData);
        if (rec.hasEnoughData) return { score: rec.total, components: rec.components.filter(c => c.available), confidence: rec.confidence, dateCount: 1 };
      }
      return null;
    }

    const avgScore = Math.round(recoveries.reduce((s, r) => s + r.total, 0) / recoveries.length);

    const compMap: Record<string, number[]> = {};
    for (const rec of recoveries) {
      for (const c of rec.components) {
        if (!c.available) continue;
        (compMap[c.name] ??= []).push(c.score);
      }
    }
    const avgComps = Object.entries(compMap).map(([name, scores]) => ({
      name,
      score: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
    }));

    return {
      score: avgScore,
      components: avgComps,
      confidence: recoveries.some(r => r.confidence === "low") ? "low" : recoveries.some(r => r.confidence === "medium") ? "medium" : "high",
      dateCount: recoveries.length,
    };
  }, [rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData, periodDates]);

  if (!result) {
    return (
      <div className="hh-card animate-in">
        <p className="hh-footnote" style={{ color: "var(--label-secondary)" }}>
          Energie corporala — date insuficiente (minim 14 zile).
        </p>
      </div>
    );
  }

  const { score, components, confidence, dateCount } = result;
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const isAverage = dateCount > 1;

  // Show top 4 sub-scores as compact badges
  const topComps = components.sort((a, b) => b.score - a.score).slice(0, 4);

  return (
    <div className="hh-card animate-scale-in" style={{ padding: 20 }}>
      <div className="flex items-center gap-4">
        {/* Ring gauge */}
        <div style={{ position: "relative", width: 100, height: 100, flexShrink: 0 }}>
          <RecoveryRing score={score} color={color} size={100} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="hh-mono-num"
              style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em" }}
            >
              {score}
            </span>
          </div>
        </div>

        {/* Text side */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="hh-headline" style={{ color: "var(--label-primary)", marginBottom: 2 }}>
            {label}
          </p>
          <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginBottom: 8 }}>
            {isAverage && periodLabel
              ? `Medie ${periodLabel.toLowerCase()}`
              : "Energie corporala"}
            {confidence !== "high" && (
              <span style={{ marginLeft: 6, color: confidence === "medium" ? "#FF9500" : "#FF3B30" }}>
                · {confidence === "medium" ? "aprox." : "limitat"}
              </span>
            )}
          </p>

          {/* Sub-score badges */}
          <div className="flex flex-wrap gap-1.5">
            {topComps.map(c => (
              <span
                key={c.name}
                className="hh-caption-2 hh-mono-num"
                style={{
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "rgba(120,120,128,0.12)",
                  color: "var(--label-secondary)",
                  fontWeight: 600,
                }}
              >
                {c.name} {c.score}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
