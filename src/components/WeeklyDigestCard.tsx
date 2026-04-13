"use client";

import { useMemo, useState } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { generateWeeklyDigest } from "@/lib/stats/weeklyDigest";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

export function WeeklyDigestCard({ metrics, sleepNights }: Props) {
  const digest = useMemo(
    () => generateWeeklyDigest(metrics, sleepNights),
    [metrics, sleepNights],
  );
  const [expanded, setExpanded] = useState(false);

  if (!digest) return null;

  return (
    <section>
      <div className="hh-section-label">
        <span>Raport saptamanal</span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="hh-footnote"
          style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}
        >
          {expanded ? "Ascunde" : "Detalii"}
        </button>
      </div>
      <div className="hh-card" style={{ minWidth: 0, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{digest.headline}</div>
          <div className="hh-footnote" style={{ color: "var(--label-tertiary)" }}>{digest.periodLabel}</div>
        </div>

        {/* Key stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {digest.stats.map(s => (
            <div key={s.label} style={{
              background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px",
            }}>
              <div className="hh-footnote" style={{ color: "var(--label-tertiary)", marginBottom: 2 }}>{s.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span className="hh-mono-num" style={{ fontWeight: 600, fontSize: 15 }}>{s.value}</span>
                <span className="hh-mono-num hh-footnote" style={{ color: s.deltaColor, fontWeight: 600 }}>{s.delta}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Sleep summary */}
        {digest.sleepSummary && (
          <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginBottom: 8 }}>
            😴 {digest.sleepSummary}
          </p>
        )}

        {expanded && (
          <>
            {/* Highlights */}
            {digest.highlights.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div className="hh-footnote" style={{ color: "#34C759", fontWeight: 600, marginBottom: 4 }}>Puncte forte</div>
                {digest.highlights.map((h, i) => (
                  <div key={i} className="hh-footnote" style={{ color: "var(--label-secondary)", padding: "2px 0" }}>
                    ✓ {h}
                  </div>
                ))}
              </div>
            )}

            {/* Lowlights */}
            {digest.lowlights.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div className="hh-footnote" style={{ color: "#FF9500", fontWeight: 600, marginBottom: 4 }}>De imbunatatit</div>
                {digest.lowlights.map((l, i) => (
                  <div key={i} className="hh-footnote" style={{ color: "var(--label-secondary)", padding: "2px 0" }}>
                    △ {l}
                  </div>
                ))}
              </div>
            )}

            {/* Narrative */}
            <div style={{
              background: "var(--surface-2)", borderRadius: 10, padding: 12, marginTop: 8,
            }}>
              <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.5, margin: 0 }}>
                {digest.narrative}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
