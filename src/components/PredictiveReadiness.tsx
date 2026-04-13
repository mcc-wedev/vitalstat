"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { predictReadiness } from "@/lib/stats/correlationDiscovery";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

const ZONE_COLORS: Record<string, { main: string; bg: string }> = {
  high: { main: "#34C759", bg: "rgba(52,199,89,0.12)" },
  mid: { main: "#FF9500", bg: "rgba(255,149,0,0.12)" },
  low: { main: "#FF3B30", bg: "rgba(255,59,48,0.12)" },
};

export function PredictiveReadiness({ metrics, sleepNights }: Props) {
  const prediction = useMemo(
    () => predictReadiness(metrics, sleepNights),
    [metrics, sleepNights],
  );

  if (!prediction) return null;

  const zone = prediction.score >= 70 ? "high" : prediction.score >= 45 ? "mid" : "low";
  const c = ZONE_COLORS[zone];

  return (
    <section>
      <div className="hh-section-label">
        <span>Predictie maine</span>
        <span className="hh-footnote" style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>
          incredere {prediction.confidence === "high" ? "ridicata" : prediction.confidence === "medium" ? "medie" : "scazuta"}
        </span>
      </div>
      <div className="hh-card" style={{ minWidth: 0 }}>
        {/* Score ring */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <div style={{ position: "relative", width: 72, height: 72 }}>
            <svg width={72} height={72} viewBox="0 0 72 72">
              <circle cx={36} cy={36} r={30} fill="none" stroke="var(--surface-2)" strokeWidth={6} />
              <circle
                cx={36} cy={36} r={30} fill="none"
                stroke={c.main}
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={`${(prediction.score / 100) * 188.5} 188.5`}
                transform="rotate(-90 36 36)"
                style={{ filter: `drop-shadow(0 0 4px ${c.main})` }}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column",
            }}>
              <span className="hh-mono-num" style={{ fontSize: 22, fontWeight: 700, color: c.main }}>{prediction.score}</span>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {prediction.score >= 70 ? "Zi buna in perspectiva" : prediction.score >= 45 ? "Zi moderata" : "Posibil oboseala"}
            </div>
            <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.4, margin: 0 }}>
              {prediction.narrative}
            </p>
          </div>
        </div>

        {/* Factors */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {prediction.factors.map(f => {
            const impactColor = f.impact === "positive" ? "#34C759" : f.impact === "negative" ? "#FF3B30" : "var(--label-tertiary)";
            const impactIcon = f.impact === "positive" ? "↑" : f.impact === "negative" ? "↓" : "→";
            return (
              <div key={f.label} style={{
                background: "var(--surface-2)", borderRadius: 10, padding: "8px 12px",
              }}>
                <div className="hh-footnote" style={{ color: "var(--label-tertiary)", marginBottom: 2 }}>{f.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span className="hh-mono-num" style={{ fontWeight: 600, fontSize: 14 }}>{f.value}</span>
                  <span style={{ color: impactColor, fontWeight: 600, fontSize: 12 }}>{impactIcon}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
