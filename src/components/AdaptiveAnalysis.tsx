"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { getDisplayValue } from "@/lib/parser/healthTypes";
import { mannKendall, coefficientOfVariation, bootstrapCI, detectWeeklyCycle } from "@/lib/stats/advanced";
import { TrendAnalysis } from "./TrendAnalysis";
import { FitnessFatigueChart } from "./FitnessFatigueChart";
import { Vo2MaxTrajectory } from "./Vo2MaxTrajectory";

interface Props {
  metrics: Record<string, DailySummary[]>;    // filtered to selected period
  sleepNights: SleepNight[];                  // filtered to selected period
  allMetrics: Record<string, DailySummary[]>; // full dataset for baselines
  allSleep: SleepNight[];
  windowDays: number;
  periodLabel: string;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  ADAPTIVE ANALYSIS — Renders different sections per window size
 *
 *  7-14 days  → ACUTE: recent volatility, ACWR, daily deltas
 *  14-60 days → TREND: weekly trends, consistency, training load
 *  60-180 days → PROGRESSION: Fitness/Fatigue/Form, trend tests,
 *                 personal records, changepoint detection
 *  180+ days   → LONGEVITY: VO2 Max trajectory, year-over-year,
 *                 long-term trend significance
 * ═══════════════════════════════════════════════════════════════
 */
export function AdaptiveAnalysis({ metrics, sleepNights, allMetrics, allSleep, windowDays, periodLabel }: Props) {
  // Determine which sections to show
  const mode: "acute" | "trend" | "progression" | "longevity" =
    windowDays <= 14 ? "acute" :
    windowDays <= 60 ? "trend" :
    windowDays <= 180 ? "progression" :
    "longevity";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {mode === "acute" && <AcuteSection metrics={metrics} sleepNights={sleepNights} allMetrics={allMetrics} allSleep={allSleep} periodLabel={periodLabel} />}
      {mode === "trend" && <TrendSection metrics={metrics} sleepNights={sleepNights} allMetrics={allMetrics} allSleep={allSleep} windowDays={windowDays} periodLabel={periodLabel} />}
      {mode === "progression" && <ProgressionSection metrics={metrics} sleepNights={sleepNights} allMetrics={allMetrics} allSleep={allSleep} windowDays={windowDays} periodLabel={periodLabel} />}
      {mode === "longevity" && <LongevitySection metrics={metrics} sleepNights={sleepNights} allMetrics={allMetrics} allSleep={allSleep} windowDays={windowDays} periodLabel={periodLabel} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 *  ACUTE (7-14 days)
 *  Focus: recent state, daily volatility, training load
 * ═══════════════════════════════════════════════════════════════ */
function AcuteSection({ metrics, sleepNights, periodLabel }: {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  periodLabel: string;
}) {
  const volatility = useMemo(() => {
    const out: { label: string; cv: number; color: string; interpretation: string }[] = [];
    const checks: { key: string; label: string; color: string }[] = [
      { key: "hrv", label: "HRV", color: "#FF2D55" },
      { key: "restingHeartRate", label: "Puls repaus", color: "#FF3B30" },
      { key: "respiratoryRate", label: "Respiratie", color: "#5AC8FA" },
    ];
    for (const { key, label, color } of checks) {
      const d = metrics[key];
      if (!d || d.length < 5) continue;
      const vals = d.map(x => x.mean).filter(v => v > 0);
      if (vals.length < 5) continue;
      const cv = coefficientOfVariation(vals) * 100;
      // Interpretation — lower CV = more stable = better
      let interpretation = "variabilitate normala";
      if (cv < 4) interpretation = "foarte stabila";
      else if (cv < 8) interpretation = "stabila";
      else if (cv < 14) interpretation = "moderata";
      else interpretation = "ridicata — posibil stres";
      out.push({ label, cv, color, interpretation });
    }
    return out;
  }, [metrics]);

  return (
    <>
      <section>
        <div className="hh-section-label">
          <span>Stabilitate fiziologica · {periodLabel}</span>
          <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>CV</span>
        </div>
        {volatility.length > 0 ? (
          <div className="hh-card" style={{ minWidth: 0 }}>
            <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginBottom: 12 }}>
              Cat de constante sunt semnele tale vitale? Variabilitate mai mica = homeostazie mai buna.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {volatility.map(v => (
                <div key={v.label} className="flex items-center justify-between" style={{ gap: 12 }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: v.color }} />
                    <span className="hh-body" style={{ color: "var(--label-primary)" }}>{v.label}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="hh-mono-num" style={{ fontSize: 15, fontWeight: 700, color: "var(--label-primary)" }}>
                      {v.cv.toFixed(1)}%
                    </span>
                    <p className="hh-caption-2" style={{ color: "var(--label-tertiary)" }}>{v.interpretation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="hh-footnote" style={{ color: "var(--label-tertiary)" }}>Necesare cel putin 5 zile de date.</p>
        )}
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
 *  TREND (14-60 days)
 *  Focus: weekly deltas, weekly cycles, bootstrapped means
 * ═══════════════════════════════════════════════════════════════ */
function TrendSection({ metrics, sleepNights, windowDays, periodLabel }: {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  windowDays: number;
  periodLabel: string;
}) {
  const weeklyCycle = useMemo(() => {
    const d = metrics.stepCount;
    if (!d || d.length < 21) return null;
    const cycle = detectWeeklyCycle(d.map(x => x.sum));
    return cycle.hasCycle ? cycle : null;
  }, [metrics]);

  const bootstrap = useMemo(() => {
    const out: { label: string; mean: number; lower: number; upper: number; unit: string; color: string }[] = [];
    const checks: { key: string; label: string; unit: string; color: string; useSum: boolean }[] = [
      { key: "restingHeartRate", label: "Puls repaus", unit: "bpm", color: "#FF3B30", useSum: false },
      { key: "hrv", label: "HRV", unit: "ms", color: "#FF2D55", useSum: false },
      { key: "stepCount", label: "Pasi", unit: "", color: "#FF9500", useSum: true },
    ];
    for (const c of checks) {
      const d = metrics[c.key];
      if (!d || d.length < 7) continue;
      const vals = d.map(x => c.useSum ? x.sum : x.mean).filter(v => v > 0);
      if (vals.length < 7) continue;
      const ci = bootstrapCI(vals, { iterations: 500 });
      if (ci) out.push({ label: c.label, mean: ci.mean, lower: ci.lower, upper: ci.upper, unit: c.unit, color: c.color });
    }
    return out;
  }, [metrics]);

  return (
    <>
      <section>
        <div className="hh-section-label">
          <span>Media zilnica cu interval de incredere · {periodLabel}</span>
          <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>IC 95%</span>
        </div>
        {bootstrap.length > 0 && (
          <div className="hh-card" style={{ minWidth: 0 }}>
            <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginBottom: 12 }}>
              Intervalul de incredere 95% iti spune cat de siguri suntem pe media calculata. Interval ingust = date consistente.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {bootstrap.map(b => (
                <div key={b.label}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                    <span className="hh-body" style={{ color: "var(--label-primary)" }}>{b.label}</span>
                    <span className="hh-mono-num" style={{ fontSize: 16, fontWeight: 700, color: "var(--label-primary)" }}>
                      {b.mean.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} {b.unit}
                    </span>
                  </div>
                  <p className="hh-caption-2" style={{ color: "var(--label-tertiary)" }}>
                    IC 95%: {b.lower.toLocaleString("ro-RO", { maximumFractionDigits: 0 })}–{b.upper.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} {b.unit}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="hh-section-label">
          <span>Tendinte · {periodLabel}</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {metrics.restingHeartRate && metrics.restingHeartRate.length >= 10 && (
            <TrendAnalysis metricKey="restingHeartRate" data={metrics.restingHeartRate} windowDays={windowDays} />
          )}
          {metrics.hrv && metrics.hrv.length >= 10 && (
            <TrendAnalysis metricKey="hrv" data={metrics.hrv} windowDays={windowDays} />
          )}
        </div>
      </section>

      {weeklyCycle && (
        <section>
          <div className="hh-section-label"><span>Ritm saptamanal detectat</span></div>
          <div className="hh-card">
            <p className="hh-subheadline" style={{ color: "var(--label-primary)", marginBottom: 4 }}>
              Pasii tai urmeaza un ritm saptamanal clar
            </p>
            <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.45 }}>
              Autocorelatia la lag 7 zile este <b>{(weeklyCycle.strength * 100).toFixed(0)}%</b>. Inseamna ca zilele tale active si zilele de odihna se repeta consistent. Tipic pentru program de antrenament structurat.
            </p>
          </div>
        </section>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
 *  PROGRESSION (60-180 days)
 *  Focus: Fitness/Fatigue, statistically validated trends,
 *         changepoint detection, peak detection
 * ═══════════════════════════════════════════════════════════════ */
function ProgressionSection({ metrics, sleepNights, allMetrics, allSleep, windowDays, periodLabel }: {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  windowDays: number;
  periodLabel: string;
}) {
  const personalRecords = useMemo(() => {
    const out: { label: string; value: number; date: string; unit: string; color: string }[] = [];
    const checks: { key: string; label: string; unit: string; color: string; useMax: boolean; useSum: boolean }[] = [
      { key: "stepCount", label: "Record pasi intr-o zi", unit: "", color: "#FF9500", useMax: true, useSum: true },
      { key: "vo2Max", label: "VO2 Max maxim", unit: "mL/kg/min", color: "#FF9500", useMax: true, useSum: false },
      { key: "activeEnergy", label: "Calorii active maxim", unit: "kcal", color: "#FF9500", useMax: true, useSum: true },
      { key: "exerciseTime", label: "Exercitiu maxim", unit: "min", color: "#34C759", useMax: true, useSum: true },
    ];
    for (const c of checks) {
      const d = metrics[c.key];
      if (!d || d.length < 10) continue;
      let best = -Infinity;
      let bestDate = "";
      for (const x of d) {
        const v = c.useSum ? x.sum : x.mean;
        if (v > best) { best = v; bestDate = x.date; }
      }
      if (best > 0) {
        out.push({ label: c.label, value: best, date: bestDate, unit: c.unit, color: c.color });
      }
    }
    // RHR min, HRV max (lower/higher is better)
    if (metrics.restingHeartRate && metrics.restingHeartRate.length >= 10) {
      const d = metrics.restingHeartRate;
      let best = Infinity, bestDate = "";
      for (const x of d) if (x.mean > 30 && x.mean < best) { best = x.mean; bestDate = x.date; }
      if (best < Infinity) out.push({ label: "Puls repaus minim", value: best, date: bestDate, unit: "bpm", color: "#FF3B30" });
    }
    if (metrics.hrv && metrics.hrv.length >= 10) {
      const d = metrics.hrv;
      let best = 0, bestDate = "";
      for (const x of d) if (x.mean > best) { best = x.mean; bestDate = x.date; }
      if (best > 0) out.push({ label: "HRV maxim", value: best, date: bestDate, unit: "ms", color: "#FF2D55" });
    }
    return out;
  }, [metrics]);

  return (
    <>
      {/* Fitness / Fatigue / Form chart — hero of this section */}
      <section>
        <FitnessFatigueChart
          exerciseData={allMetrics.exerciseTime}
          activeEnergyData={allMetrics.activeEnergy}
        />
      </section>

      {/* Trend analysis with changepoints */}
      <section>
        <div className="hh-section-label">
          <span>Tendinte validate statistic · {periodLabel}</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {metrics.restingHeartRate && metrics.restingHeartRate.length >= 30 && (
            <TrendAnalysis metricKey="restingHeartRate" data={metrics.restingHeartRate} windowDays={windowDays} />
          )}
          {metrics.hrv && metrics.hrv.length >= 30 && (
            <TrendAnalysis metricKey="hrv" data={metrics.hrv} windowDays={windowDays} />
          )}
          {metrics.stepCount && metrics.stepCount.length >= 30 && (
            <TrendAnalysis metricKey="stepCount" data={metrics.stepCount} windowDays={windowDays} />
          )}
          {metrics.exerciseTime && metrics.exerciseTime.length >= 30 && (
            <TrendAnalysis metricKey="exerciseTime" data={metrics.exerciseTime} windowDays={windowDays} />
          )}
        </div>
      </section>

      {/* Personal records */}
      {personalRecords.length > 0 && (
        <section>
          <div className="hh-section-label"><span>Recorduri personale · {periodLabel}</span></div>
          <div className="hh-card" style={{ minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {personalRecords.map(r => (
                <div key={r.label} className="flex items-center justify-between" style={{ padding: "6px 0", borderBottom: "0.5px solid rgba(84,84,88,0.3)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: r.color }} />
                    <div className="min-w-0">
                      <p className="hh-body" style={{ color: "var(--label-primary)" }}>{r.label}</p>
                      <p className="hh-caption-2" style={{ color: "var(--label-tertiary)" }}>{r.date}</p>
                    </div>
                  </div>
                  <span className="hh-mono-num" style={{ fontSize: 17, fontWeight: 700, color: "var(--label-primary)" }}>
                    {r.value.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}
                    {r.unit && <span className="hh-footnote" style={{ color: "var(--label-secondary)", marginLeft: 3 }}>{r.unit}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
 *  LONGEVITY (180+ days)
 *  Focus: VO2 trajectory, aging pace, year-over-year, biological age
 * ═══════════════════════════════════════════════════════════════ */
function LongevitySection({ metrics, sleepNights, allMetrics, windowDays, periodLabel }: {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  windowDays: number;
  periodLabel: string;
}) {
  // Year-over-year comparison
  const yoy = useMemo(() => {
    const out: { label: string; current: number; prior: number; delta: number; pct: number; unit: string; higherBetter: boolean; color: string }[] = [];
    const oneYear = 365;
    const today = new Date();
    const checks: { key: string; label: string; unit: string; useSum: boolean; higherBetter: boolean; color: string }[] = [
      { key: "restingHeartRate", label: "Puls repaus", unit: "bpm", useSum: false, higherBetter: false, color: "#FF3B30" },
      { key: "hrv", label: "HRV", unit: "ms", useSum: false, higherBetter: true, color: "#FF2D55" },
      { key: "vo2Max", label: "VO2 Max", unit: "mL/kg/min", useSum: false, higherBetter: true, color: "#FF9500" },
      { key: "stepCount", label: "Pasi/zi", unit: "", useSum: true, higherBetter: true, color: "#FF9500" },
    ];
    for (const c of checks) {
      const d = metrics[c.key];
      if (!d || d.length < 60) continue;
      const sorted = [...d].sort((a, b) => a.date.localeCompare(b.date));
      const latest = new Date(sorted[sorted.length - 1].date);
      const priorCutoff = new Date(latest.getTime() - oneYear * 86400000);
      const recent = sorted.filter(x => new Date(x.date) > new Date(latest.getTime() - 30 * 86400000));
      const prior = sorted.filter(x => {
        const dt = new Date(x.date);
        return dt >= new Date(priorCutoff.getTime() - 15 * 86400000) && dt <= new Date(priorCutoff.getTime() + 15 * 86400000);
      });
      if (recent.length < 5 || prior.length < 5) continue;
      const currentAvg = recent.reduce((s, x) => s + (c.useSum ? x.sum : x.mean), 0) / recent.length;
      const priorAvg = prior.reduce((s, x) => s + (c.useSum ? x.sum : x.mean), 0) / prior.length;
      if (priorAvg === 0) continue;
      const delta = currentAvg - priorAvg;
      const pct = (delta / priorAvg) * 100;
      out.push({ label: c.label, current: currentAvg, prior: priorAvg, delta, pct, unit: c.unit, higherBetter: c.higherBetter, color: c.color });
    }
    return out;
  }, [metrics]);

  return (
    <>
      {/* VO2 Max trajectory hero */}
      {allMetrics.vo2Max && allMetrics.vo2Max.length >= 10 && (
        <section>
          <Vo2MaxTrajectory data={allMetrics.vo2Max} />
        </section>
      )}

      {/* Year-over-year */}
      {yoy.length > 0 && (
        <section>
          <div className="hh-section-label">
            <span>Comparatie an-la-an</span>
            <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>ultimele 30z vs acum 1 an</span>
          </div>
          <div className="hh-card" style={{ minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {yoy.map(y => {
                const improved = (y.pct > 0) === y.higherBetter;
                return (
                  <div key={y.label} className="flex items-center justify-between" style={{ padding: "6px 0", borderBottom: "0.5px solid rgba(84,84,88,0.3)" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: y.color }} />
                      <span className="hh-body" style={{ color: "var(--label-primary)" }}>{y.label}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div>
                        <span className="hh-mono-num" style={{ fontSize: 17, fontWeight: 700, color: "var(--label-primary)" }}>
                          {y.current.toLocaleString("ro-RO", { maximumFractionDigits: 0 })}
                        </span>
                        {y.unit && <span className="hh-footnote" style={{ color: "var(--label-secondary)", marginLeft: 3 }}>{y.unit}</span>}
                      </div>
                      <p className="hh-caption-2 hh-mono-num" style={{ color: improved ? "#34C759" : "#FF3B30", fontWeight: 600 }}>
                        {y.pct > 0 ? "↑" : "↓"} {Math.abs(y.pct).toFixed(0)}% vs {y.prior.toLocaleString("ro-RO", { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Long-term trend charts */}
      <section>
        <div className="hh-section-label">
          <span>Traiectorii pe termen lung · {periodLabel}</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {metrics.restingHeartRate && metrics.restingHeartRate.length >= 60 && (
            <TrendAnalysis metricKey="restingHeartRate" data={metrics.restingHeartRate} windowDays={windowDays} />
          )}
          {metrics.hrv && metrics.hrv.length >= 60 && (
            <TrendAnalysis metricKey="hrv" data={metrics.hrv} windowDays={windowDays} />
          )}
        </div>
      </section>

      {/* Fitness/Fatigue still useful at long windows */}
      <section>
        <FitnessFatigueChart
          exerciseData={allMetrics.exerciseTime}
          activeEnergyData={allMetrics.activeEnergy}
        />
      </section>
    </>
  );
}
