"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { generateRecommendations, type Recommendation } from "@/lib/stats/recommendations";
import { computeReadiness } from "@/lib/stats/deepAnalysis";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

const PRIORITY_COLORS = {
  high: { bg: "rgba(255,59,48,0.12)", border: "rgba(255,59,48,0.3)", dot: "#FF3B30" },
  medium: { bg: "rgba(255,149,0,0.12)", border: "rgba(255,149,0,0.3)", dot: "#FF9500" },
  low: { bg: "rgba(52,199,89,0.12)", border: "rgba(52,199,89,0.3)", dot: "#34C759" },
};

export function Recommendations({ metrics, sleepNights }: Props) {
  const recs = useMemo(() => {
    const readiness = computeReadiness(
      metrics.hrv || [], metrics.restingHeartRate || [],
      sleepNights, metrics.oxygenSaturation,
    );
    return generateRecommendations(metrics, sleepNights, readiness);
  }, [metrics, sleepNights]);

  if (recs.length === 0) return null;

  return (
    <section>
      <div className="hh-section-label">
        <span>Recomandari personalizate</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {recs.map((rec, i) => (
          <RecCard key={i} rec={rec} />
        ))}
      </div>
    </section>
  );
}

function RecCard({ rec }: { rec: Recommendation }) {
  const c = PRIORITY_COLORS[rec.priority];
  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 14,
        padding: "14px 16px",
        backdropFilter: "blur(20px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{rec.icon}</span>
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{rec.title}</span>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", background: c.dot,
          boxShadow: `0 0 6px ${c.dot}`,
        }} />
      </div>
      <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.5, margin: 0 }}>
        {rec.body}
      </p>
    </div>
  );
}
