"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { laggedCorrelation } from "@/lib/stats/correlation";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface CausalLink {
  causeName: string;
  effectName: string;
  lag: number;
  r: number;
  p: number;
  direction: "positive" | "negative";
  narrative: string;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  LAGGED CAUSALITY — surfaces temporal relationships
 *
 *  Runs lagged correlations across meaningful physiologic pairs
 *  (sleep → next-day HRV/RHR, exercise → next-day recovery, etc.)
 *  to find plausible causal chains. Reports only |r| > 0.3 with
 *  p < 0.05 at a positive lag (cause precedes effect).
 *
 *  NOTE: correlation ≠ causation. Narrative uses hedged language
 *  ("precede", "coreleaza cu") not "cauzeaza".
 * ═══════════════════════════════════════════════════════════════
 */

// Build date-aligned series between cause and effect
function alignSeries(
  causeDates: string[],
  causeValues: number[],
  effectDates: string[],
  effectValues: number[],
): { x: number[]; y: number[] } {
  const effMap = new Map<string, number>();
  for (let i = 0; i < effectDates.length; i++) effMap.set(effectDates[i], effectValues[i]);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < causeDates.length; i++) {
    const v = effMap.get(causeDates[i]);
    if (v !== undefined) {
      x.push(causeValues[i]);
      y.push(v);
    }
  }
  return { x, y };
}

export function LaggedCausality({ metrics, sleepNights }: Props) {
  const links = useMemo(() => {
    const out: CausalLink[] = [];

    // Helper to run one directional test
    const test = (
      causeDates: string[],
      causeValues: number[],
      effectDates: string[],
      effectValues: number[],
      causeName: string,
      effectName: string,
      expectNegative: boolean,
      maxLag = 3,
    ) => {
      const { x, y } = alignSeries(causeDates, causeValues, effectDates, effectValues);
      if (x.length < 21) return;
      const results = laggedCorrelation(x, y, maxLag);
      // Keep only positive lags (cause → later effect)
      const positive = results.filter(r => r.lag > 0);
      // Find strongest by absolute r
      positive.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
      const best = positive[0];
      if (!best || Math.abs(best.r) < 0.3 || best.p > 0.05) return;

      const direction: "positive" | "negative" = best.r > 0 ? "positive" : "negative";
      // Narrative — framed as temporal precedence, not causation
      const strength = Math.abs(best.r) > 0.5 ? "puternic" : "moderat";
      const sign = best.r > 0 ? (expectNegative ? "mai multe" : "crescut") : (expectNegative ? "mai putine" : "scazut");
      const lagLabel = best.lag === 1 ? "ziua urmatoare" : `dupa ${best.lag} zile`;
      const narrative = `${causeName} mai mare precede ${sign === "crescut" ? "o crestere" : sign === "scazut" ? "o scadere" : sign} a ${effectName.toLowerCase()} ${lagLabel} (r=${best.r.toFixed(2)}, ${strength}).`;

      out.push({ causeName, effectName, lag: best.lag, r: best.r, p: best.p, direction, narrative });
    };

    // ─── Sleep duration → next-day HRV (expect positive r) ───
    if (sleepNights.length >= 21) {
      const sDates = sleepNights.map(n => n.date);
      const sHours = sleepNights.map(n => n.totalMinutes / 60);
      const sEff = sleepNights.map(n => n.efficiency);
      const sDeep = sleepNights.map(n => n.stages.deep);

      if (metrics.hrv && metrics.hrv.length >= 21) {
        const hrvDates = metrics.hrv.map(d => d.date);
        const hrvVals = metrics.hrv.map(d => d.mean);
        test(sDates, sHours, hrvDates, hrvVals, "Durata somn", "HRV", false);
        test(sDates, sEff, hrvDates, hrvVals, "Eficienta somn", "HRV", false);
        test(sDates, sDeep, hrvDates, hrvVals, "Somn profund", "HRV", false);
      }

      if (metrics.restingHeartRate && metrics.restingHeartRate.length >= 21) {
        const rhrDates = metrics.restingHeartRate.map(d => d.date);
        const rhrVals = metrics.restingHeartRate.map(d => d.mean);
        // Expect: more sleep → lower RHR (negative r is good)
        test(sDates, sHours, rhrDates, rhrVals, "Durata somn", "Puls repaus", true);
      }
    }

    // ─── Exercise → next-day HRV (expect positive for aerobic) ───
    if (metrics.exerciseTime && metrics.exerciseTime.length >= 21 && metrics.hrv && metrics.hrv.length >= 21) {
      const exDates = metrics.exerciseTime.map(d => d.date);
      const exVals = metrics.exerciseTime.map(d => d.sum);
      const hrvDates = metrics.hrv.map(d => d.date);
      const hrvVals = metrics.hrv.map(d => d.mean);
      test(exDates, exVals, hrvDates, hrvVals, "Minute exercitiu", "HRV", false);
    }

    // ─── Steps → next-day RHR ───
    if (metrics.stepCount && metrics.stepCount.length >= 21 && metrics.restingHeartRate && metrics.restingHeartRate.length >= 21) {
      const sDates = metrics.stepCount.map(d => d.date);
      const sVals = metrics.stepCount.map(d => d.sum);
      const rhrDates = metrics.restingHeartRate.map(d => d.date);
      const rhrVals = metrics.restingHeartRate.map(d => d.mean);
      test(sDates, sVals, rhrDates, rhrVals, "Pasi zilnici", "Puls repaus", true);
    }

    // Sort: strongest first
    out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    return out.slice(0, 4);
  }, [metrics, sleepNights]);

  if (links.length === 0) return null;

  return (
    <div className="hh-card animate-in" style={{ minWidth: 0 }}>
      <div className="hh-section-label" style={{ marginBottom: 8 }}>
        <span>Relatii temporale in datele tale</span>
        <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>
          lag 1-3z
        </span>
      </div>
      <p className="hh-footnote" style={{ color: "var(--label-tertiary)", marginBottom: 10, fontSize: 11 }}>
        Corelatii cu decalaj temporal detectate pe istoricul tau. Corelatia nu implica automat cauzalitate, dar indica pattern-uri consistente.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {links.map((link, i) => {
          const isGood =
            (link.effectName === "HRV" && link.direction === "positive") ||
            (link.effectName === "Puls repaus" && link.direction === "negative");
          const color = isGood ? "#34C759" : "#FF9500";
          const magnitude = Math.min(100, (Math.abs(link.r) / 0.7) * 100);

          return (
            <div key={i}>
              <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.4 }}>
                  {link.narrative}
                </span>
              </div>
              <div
                style={{
                  position: "relative",
                  height: 3,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${magnitude}%`,
                    background: color,
                    borderRadius: 999,
                    transition: "width 800ms cubic-bezier(0.16, 1, 0.3, 1)",
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
