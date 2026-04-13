"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { discoverCorrelations, type CorrelationPair } from "@/lib/stats/correlationDiscovery";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

export function CorrelationDiscovery({ metrics, sleepNights }: Props) {
  const pairs = useMemo(
    () => discoverCorrelations(metrics, sleepNights),
    [metrics, sleepNights],
  );

  if (pairs.length === 0) return null;

  return (
    <section>
      <div className="hh-section-label">
        <span>Corelatii personale</span>
        <span className="hh-footnote" style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>
          auto-descoperite
        </span>
      </div>
      <div className="hh-card" style={{ minWidth: 0, padding: 0 }}>
        {pairs.map((pair, i) => (
          <PairRow key={`${pair.metricA}-${pair.metricB}-${pair.lag}`} pair={pair} index={i} />
        ))}
      </div>
    </section>
  );
}

function PairRow({ pair, index }: { pair: CorrelationPair; index: number }) {
  const absR = Math.abs(pair.r);
  const barColor = pair.r > 0 ? "#34C759" : "#FF9500";
  const barWidth = Math.round(absR * 100);

  return (
    <div style={{
      padding: "14px 16px",
      borderTop: index > 0 ? "0.5px solid var(--separator)" : "none",
    }}>
      {/* Header: metrics + badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span className="hh-footnote" style={{ fontWeight: 600 }}>
          {pair.labelA} → {pair.labelB}
        </span>
        {pair.lag > 0 && (
          <span style={{
            fontSize: 10, padding: "2px 6px", borderRadius: 4,
            background: "rgba(0,122,255,0.15)", color: "#007AFF",
          }}>
            lag {pair.lag}d
          </span>
        )}
        <span style={{
          fontSize: 10, padding: "2px 6px", borderRadius: 4,
          background: pair.strength === "strong" ? "rgba(52,199,89,0.15)" : "rgba(255,149,0,0.15)",
          color: pair.strength === "strong" ? "#34C759" : "#FF9500",
        }}>
          {pair.strength === "strong" ? "puternica" : "moderata"}
        </span>
      </div>

      {/* Correlation bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{
          flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden",
        }}>
          <div style={{
            width: `${barWidth}%`, height: "100%", background: barColor, borderRadius: 3,
            transition: "width 0.3s ease",
          }} />
        </div>
        <span className="hh-mono-num" style={{
          fontSize: 13, fontWeight: 700, color: barColor, minWidth: 42, textAlign: "right",
        }}>
          r={pair.r.toFixed(2)}
        </span>
      </div>

      {/* Interpretation */}
      <p className="hh-footnote" style={{ color: "var(--label-tertiary)", lineHeight: 1.4, margin: 0 }}>
        {pair.interpretation}
      </p>
    </div>
  );
}
