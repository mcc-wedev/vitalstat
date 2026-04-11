"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";

interface Props {
  date: string;
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface Contribution {
  name: string;
  today: number;
  yesterday: number;
  delta: number;
  weight: number;
  /** Weighted contribution to the total-score delta (in points). */
  weightedDelta: number;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  RECOVERY ROOT-CAUSE EXPLAINER
 *
 *  When the recovery score moves, users want to know WHY.
 *  This component computes today and yesterday's recovery
 *  separately, decomposes the total-score delta into per-component
 *  contributions (weighted), and builds a plain-language narrative:
 *
 *    "Scorul tau a scazut cu 8 puncte fata de ieri. Principalul
 *     vinovat: HRV (-12 puncte). Compensat partial de: Somn (+4)."
 *
 *  Renders nothing if not enough data.
 * ═══════════════════════════════════════════════════════════════
 */
export function RecoveryRootCause({ date, metrics, sleepNights }: Props) {
  const analysis = useMemo(() => {
    const y = new Date(date);
    const yesterday = new Date(y.getTime() - 86400000).toISOString().substring(0, 10);

    const todayRec = calculateRecovery(
      metrics.restingHeartRate || [], metrics.hrv || [], sleepNights, date,
      metrics.exerciseTime, metrics.respiratoryRate, metrics.oxygenSaturation, metrics.wristTemperature,
    );
    const yRec = calculateRecovery(
      metrics.restingHeartRate || [], metrics.hrv || [], sleepNights, yesterday,
      metrics.exerciseTime, metrics.respiratoryRate, metrics.oxygenSaturation, metrics.wristTemperature,
    );

    if (!todayRec.hasEnoughData || !yRec.hasEnoughData) return null;

    const totalDelta = todayRec.total - yRec.total;

    // Build per-component contributions
    const contributions: Contribution[] = [];
    for (const tComp of todayRec.components) {
      if (!tComp.available) continue;
      const yComp = yRec.components.find(c => c.name === tComp.name);
      if (!yComp || !yComp.available) continue;
      const delta = tComp.score - yComp.score;
      // weight is stored as percentage integer in RecoveryScore
      const weightFrac = tComp.weight / 100;
      contributions.push({
        name: tComp.name,
        today: tComp.score,
        yesterday: yComp.score,
        delta,
        weight: tComp.weight,
        weightedDelta: delta * weightFrac,
      });
    }

    // Sort by absolute weighted delta
    const sorted = [...contributions].sort((a, b) => Math.abs(b.weightedDelta) - Math.abs(a.weightedDelta));
    const topMovers = sorted.slice(0, 3);

    // Biggest drag and biggest lift (signed)
    const drags = contributions.filter(c => c.weightedDelta < 0).sort((a, b) => a.weightedDelta - b.weightedDelta);
    const lifts = contributions.filter(c => c.weightedDelta > 0).sort((a, b) => b.weightedDelta - a.weightedDelta);

    return {
      todayTotal: todayRec.total,
      yesterdayTotal: yRec.total,
      totalDelta,
      topMovers,
      topDrag: drags[0] || null,
      topLift: lifts[0] || null,
    };
  }, [date, metrics, sleepNights]);

  if (!analysis) return null;

  const { totalDelta, todayTotal, yesterdayTotal, topDrag, topLift, topMovers } = analysis;
  const deltaColor = totalDelta > 2 ? "#34C759" : totalDelta < -2 ? "#FF3B30" : "var(--label-secondary)";
  const deltaSign = totalDelta > 0 ? "+" : "";

  // Build narrative
  let narrative: string;
  if (Math.abs(totalDelta) < 2) {
    narrative = `Scorul tau este stabil fata de ieri (${yesterdayTotal} → ${todayTotal}). Nu exista schimbari semnificative — semnalele se compenseaza reciproc.`;
  } else if (totalDelta < 0) {
    const dragPart = topDrag
      ? `Principalul vinovat: ${topDrag.name} (${topDrag.delta >= 0 ? "+" : ""}${Math.round(topDrag.delta)} puncte la subscorul personal, contribuie cu ${topDrag.weightedDelta.toFixed(1)} la total).`
      : "";
    const liftPart = topLift && topLift.weightedDelta > 0.5
      ? ` Compensat partial de ${topLift.name} (+${topLift.weightedDelta.toFixed(1)}).`
      : "";
    narrative = `Scorul tau a scazut cu ${Math.abs(totalDelta)} puncte fata de ieri. ${dragPart}${liftPart}`;
  } else {
    const liftPart = topLift
      ? `Principalul contribuitor: ${topLift.name} (${topLift.delta >= 0 ? "+" : ""}${Math.round(topLift.delta)} puncte la subscor, ${topLift.weightedDelta.toFixed(1)} la total).`
      : "";
    const dragPart = topDrag && topDrag.weightedDelta < -0.5
      ? ` Redus usor de ${topDrag.name} (${topDrag.weightedDelta.toFixed(1)}).`
      : "";
    narrative = `Scorul tau a crescut cu ${totalDelta} puncte fata de ieri. ${liftPart}${dragPart}`;
  }

  return (
    <div className="hh-card animate-in" style={{ minWidth: 0 }}>
      <div className="hh-section-label" style={{ marginBottom: 8 }}>
        <span>De ce acest scor azi</span>
        <span style={{ color: deltaColor, textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
          {deltaSign}{totalDelta} vs ieri
        </span>
      </div>

      <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.55, marginBottom: 12 }}>
        {narrative}
      </p>

      {/* Component contribution bars — signed, centered */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {topMovers.map(mover => {
          const isDrag = mover.weightedDelta < 0;
          const magnitude = Math.abs(mover.weightedDelta);
          // Scale: max expected is ~10 points weighted delta
          const barPct = Math.min(100, (magnitude / 10) * 100);
          const color = isDrag ? "#FF3B30" : "#34C759";
          return (
            <div key={mover.name}>
              <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
                <span className="hh-footnote" style={{ color: "var(--label-secondary)" }}>
                  {mover.name}
                </span>
                <span className="hh-footnote hh-mono-num" style={{ color, fontWeight: 600 }}>
                  {mover.weightedDelta > 0 ? "+" : ""}{mover.weightedDelta.toFixed(1)} pct
                </span>
              </div>
              {/* Centered bar: left = drag, right = lift, zero at middle */}
              <div
                style={{
                  position: "relative",
                  height: 4,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 0,
                    height: "100%",
                    width: `${barPct / 2}%`,
                    transform: isDrag ? "translateX(-100%)" : "none",
                    background: color,
                    borderRadius: 999,
                    transition: "width 600ms cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
                {/* Zero line marker */}
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: -2,
                    bottom: -2,
                    width: 1,
                    background: "rgba(255,255,255,0.2)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
