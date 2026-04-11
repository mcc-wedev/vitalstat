"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface Pattern {
  name: string;
  unit: string;
  topAvg: number;
  bottomAvg: number;
  delta: number;
  deltaPct: number;
  direction: "higher" | "lower";
  /** Plain-language recommendation. */
  recommendation: string;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  BEST DAY PREDICTOR
 *
 *  Stratifies historical days into top-quartile vs bottom-quartile
 *  recovery scores, then compares the LIFESTYLE inputs of the day
 *  BEFORE each bucket. Surfaces the biggest differentiators as
 *  actionable patterns:
 *
 *    "Nopti cu somn >=7.4h preced cele mai bune zile (vs 6.1h pe
 *     zilele slabe — diferenta 22%)"
 *
 *  Uses quartile stratification instead of full multivariate
 *  regression because it's more interpretable for end users, and
 *  doesn't require solving for covariances in a small sample.
 * ═══════════════════════════════════════════════════════════════
 */
export function BestDayPredictor({ metrics, sleepNights }: Props) {
  const patterns = useMemo(() => {
    // Step 1: compute recovery per historical date (need 30+ valid days)
    const validDates = new Set<string>();
    const rhr = metrics.restingHeartRate || [];
    const hrv = metrics.hrv || [];
    for (const d of rhr) validDates.add(d.date);

    const recoveries: { date: string; total: number }[] = [];
    for (const date of validDates) {
      const rec = calculateRecovery(
        rhr, hrv, sleepNights, date,
        metrics.exerciseTime, metrics.respiratoryRate, metrics.oxygenSaturation, metrics.wristTemperature,
      );
      if (rec.hasEnoughData) {
        recoveries.push({ date, total: rec.total });
      }
    }

    if (recoveries.length < 30) return [];

    // Step 2: quartile split
    const sorted = [...recoveries].sort((a, b) => a.total - b.total);
    const qSize = Math.floor(sorted.length / 4);
    const bottom = new Set(sorted.slice(0, qSize).map(r => r.date));
    const top = new Set(sorted.slice(-qSize).map(r => r.date));

    // Step 3: for each lifestyle variable, compute mean on day-BEFORE top/bottom
    // Day-before = previous calendar date
    const shiftDate = (d: string) => {
      const t = new Date(d).getTime() - 86400000;
      return new Date(t).toISOString().substring(0, 10);
    };
    const topPrev = new Set(Array.from(top).map(shiftDate));
    const bottomPrev = new Set(Array.from(bottom).map(shiftDate));

    const out: Pattern[] = [];

    // Helper to compute both buckets' means for a numeric series keyed by date
    const compareBuckets = (
      dateKeyValues: { date: string; value: number }[],
      name: string,
      unit: string,
      higherIsBetter: boolean,
    ) => {
      const topVals = dateKeyValues.filter(d => topPrev.has(d.date)).map(d => d.value);
      const bottomVals = dateKeyValues.filter(d => bottomPrev.has(d.date)).map(d => d.value);
      if (topVals.length < 5 || bottomVals.length < 5) return;

      const topAvg = topVals.reduce((a, b) => a + b, 0) / topVals.length;
      const bottomAvg = bottomVals.reduce((a, b) => a + b, 0) / bottomVals.length;
      const delta = topAvg - bottomAvg;
      const deltaPct = bottomAvg !== 0 ? (delta / bottomAvg) * 100 : 0;
      if (Math.abs(deltaPct) < 5) return; // require meaningful difference

      const direction: "higher" | "lower" = delta > 0 ? "higher" : "lower";
      const beneficial = (direction === "higher" && higherIsBetter) || (direction === "lower" && !higherIsBetter);
      if (!beneficial) return; // we only surface actionable positive patterns

      const rec = buildRecommendation(name, direction, topAvg, bottomAvg, unit);
      out.push({ name, unit, topAvg, bottomAvg, delta, deltaPct, direction, recommendation: rec });
    };

    // Sleep hours
    if (sleepNights.length >= 20) {
      compareBuckets(
        sleepNights.map(n => ({ date: n.date, value: n.totalMinutes / 60 })),
        "Durata somn", "h", true,
      );
      compareBuckets(
        sleepNights.map(n => ({ date: n.date, value: n.efficiency * 100 })),
        "Eficienta somn", "%", true,
      );
      compareBuckets(
        sleepNights.map(n => ({ date: n.date, value: n.stages.deep })),
        "Somn profund", "min", true,
      );
      compareBuckets(
        sleepNights.map(n => ({ date: n.date, value: n.stages.rem })),
        "Somn REM", "min", true,
      );
    }
    // Exercise minutes
    if (metrics.exerciseTime && metrics.exerciseTime.length >= 20) {
      compareBuckets(
        metrics.exerciseTime.map(d => ({ date: d.date, value: d.sum })),
        "Minute exercitiu", "min", true,
      );
    }
    // Steps
    if (metrics.stepCount && metrics.stepCount.length >= 20) {
      compareBuckets(
        metrics.stepCount.map(d => ({ date: d.date, value: d.sum })),
        "Pasi", "", true,
      );
    }

    // Sort by absolute delta%, keep top 3
    out.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
    return out.slice(0, 3);
  }, [metrics, sleepNights]);

  if (patterns.length === 0) return null;

  return (
    <div className="hh-card animate-in" style={{ minWidth: 0 }}>
      <div className="hh-section-label" style={{ marginBottom: 8 }}>
        <span>Tiparul celor mai bune zile ale tale</span>
        <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>
          top vs bottom 25%
        </span>
      </div>
      <p className="hh-footnote" style={{ color: "var(--label-tertiary)", marginBottom: 12, fontSize: 11 }}>
        Compara inputurile din ziua precedenta zilelor cu recovery in top 25% vs bottom 25% din istoric. Pattern-uri bazate pe datele tale, nu pe medii generale.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {patterns.map((p, i) => (
          <div key={i}>
            <div className="hh-footnote" style={{ color: "var(--label-primary)", fontWeight: 600, marginBottom: 4 }}>
              {p.recommendation}
            </div>
            <div className="flex items-center gap-2" style={{ fontSize: 10, color: "var(--label-secondary)" }}>
              <span className="hh-mono-num">
                top: <strong style={{ color: "#34C759" }}>{formatValue(p.topAvg, p.unit)}</strong>
              </span>
              <span style={{ color: "var(--label-tertiary)" }}>·</span>
              <span className="hh-mono-num">
                bottom: <strong style={{ color: "#FF3B30" }}>{formatValue(p.bottomAvg, p.unit)}</strong>
              </span>
              <span style={{ color: "var(--label-tertiary)" }}>·</span>
              <span className="hh-mono-num" style={{ color: p.deltaPct > 0 ? "#34C759" : "#FF3B30" }}>
                {p.deltaPct > 0 ? "+" : ""}{p.deltaPct.toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatValue(v: number, unit: string): string {
  if (unit === "h") return `${v.toFixed(1)}h`;
  if (unit === "%") return `${Math.round(v)}%`;
  if (unit === "min") return `${Math.round(v)}m`;
  if (v >= 1000) return v.toLocaleString("ro-RO", { maximumFractionDigits: 0 });
  return v.toFixed(0);
}

function buildRecommendation(
  name: string,
  direction: "higher" | "lower",
  topAvg: number,
  bottomAvg: number,
  unit: string,
): string {
  const topStr = formatValue(topAvg, unit);
  const verb = direction === "higher" ? "peste" : "sub";
  return `${name} ${verb} ${topStr} precede cele mai bune zile (vs ${formatValue(bottomAvg, unit)} pe cele slabe)`;
}
