"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { banister, formState } from "@/lib/stats/advanced";

interface Props {
  exerciseData?: DailySummary[];
  activeEnergyData?: DailySummary[];
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  FITNESS / FATIGUE / FORM CHART — Banister Impulse-Response Model
 *
 *  This is the same chart TrainingPeaks (used by pro cyclists) and
 *  WHOOP show internally. Three curves:
 *
 *   • FITNESS (CTL) — Chronic Training Load, 42-day EWMA of training.
 *     Long-term conditioning. Grows slowly, stays elevated.
 *   • FATIGUE (ATL) — Acute Training Load, 7-day EWMA of training.
 *     Short-term fatigue accumulated from recent sessions.
 *   • FORM (TSB) — Training Stress Balance = Fitness − Fatigue.
 *     Positive = fresh, ready to perform.
 *     Negative = overloaded, needs recovery.
 *
 *  Reference: Banister 1975, Fitz-Clarke et al. 1991, TrainingPeaks.
 * ═══════════════════════════════════════════════════════════════
 */
export function FitnessFatigueChart({ exerciseData, activeEnergyData }: Props) {
  const chart = useMemo(() => {
    // Prefer active energy (kcal) as load — more volume-sensitive than minutes.
    // Fall back to exercise minutes * 5 (rough kcal equivalent).
    const source = (activeEnergyData && activeEnergyData.length >= 30)
      ? activeEnergyData.map(d => ({ date: d.date, load: d.sum }))
      : (exerciseData && exerciseData.length >= 30)
        ? exerciseData.map(d => ({ date: d.date, load: d.sum * 5 }))
        : null;

    if (!source) return null;

    // Normalize by dividing by ~40 so numbers look like TSS (TrainingPeaks convention)
    const scaleFactor = 40;
    const sorted = [...source].sort((a, b) => a.date.localeCompare(b.date));
    const loads = sorted.map(d => d.load / scaleFactor);
    const bn = banister(loads);

    const points = bn.map((b, i) => ({
      date: sorted[i].date,
      dateShort: sorted[i].date.substring(5),
      fitness: Number(b.fitness.toFixed(1)),
      fatigue: Number(b.fatigue.toFixed(1)),
      form: Number(b.form.toFixed(1)),
    }));

    const last = bn[bn.length - 1];
    const state = formState(last.form, last.fitness);

    // Recent peak fitness date
    const last90 = bn.slice(-90);
    let peakIdx = 0;
    for (let i = 1; i < last90.length; i++) {
      if (last90[i].fitness > last90[peakIdx].fitness) peakIdx = i;
    }
    const peakOffset = last90.length - 1 - peakIdx;

    return {
      points: points.slice(-120), // show last 120 days
      state,
      currentFitness: last.fitness,
      currentFatigue: last.fatigue,
      currentForm: last.form,
      peakOffsetDays: peakOffset,
    };
  }, [exerciseData, activeEnergyData]);

  if (!chart) {
    return (
      <div className="hh-card">
        <div className="hh-section-label" style={{ marginBottom: 8 }}>
          <span>Fitness / Forma</span>
        </div>
        <p className="hh-footnote" style={{ color: "var(--label-tertiary)" }}>
          Necesare minim 30 zile de date de activitate.
        </p>
      </div>
    );
  }

  const formColor =
    chart.state.tone === "rested" ? "#34C759" :
    chart.state.tone === "optimal" ? "#007AFF" :
    chart.state.tone === "productive" ? "#FF9500" : "#FF3B30";

  return (
    <div className="hh-card animate-in" style={{ minWidth: 0 }}>
      <div className="hh-section-label" style={{ marginBottom: 8 }}>
        <span>Fitness · Fatigue · Forma</span>
        <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>
          model Banister
        </span>
      </div>

      {/* Current state pill */}
      <div style={{ marginBottom: 12 }}>
        <span className="hh-caption-2" style={{
          display: "inline-block",
          padding: "4px 10px",
          borderRadius: 999,
          background: `${formColor}22`,
          color: formColor,
          fontWeight: 700,
        }}>
          {chart.state.label.toUpperCase()}
        </span>
      </div>

      {/* Three numbers */}
      <div className="grid grid-cols-3 gap-2" style={{ marginBottom: 14 }}>
        <div>
          <p className="hh-caption-2" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Fitness</p>
          <p className="hh-mono-num" style={{ fontSize: 20, fontWeight: 700, color: "#34C759" }}>{chart.currentFitness.toFixed(0)}</p>
        </div>
        <div>
          <p className="hh-caption-2" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Fatigue</p>
          <p className="hh-mono-num" style={{ fontSize: 20, fontWeight: 700, color: "#FF9500" }}>{chart.currentFatigue.toFixed(0)}</p>
        </div>
        <div>
          <p className="hh-caption-2" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Forma</p>
          <p className="hh-mono-num" style={{ fontSize: 20, fontWeight: 700, color: formColor }}>
            {chart.currentForm > 0 ? "+" : ""}{chart.currentForm.toFixed(0)}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="hh-chart" style={{ height: 200 }}>
        <ResponsiveContainer width="99%" height="100%">
          <LineChart data={chart.points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="dateShort"
              tick={{ fill: "rgba(235,235,245,0.35)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "rgba(235,235,245,0.35)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 4" />
            <Tooltip
              contentStyle={{
                background: "rgba(30,30,32,0.95)",
                border: "0.5px solid rgba(84,84,88,0.35)",
                borderRadius: 10,
                fontSize: 12,
                padding: "8px 12px",
              }}
              labelStyle={{ color: "rgba(235,235,245,0.6)", fontSize: 11 }}
            />
            <Line type="monotone" dataKey="fitness" stroke="#34C759" strokeWidth={2} dot={false} isAnimationActive={false} name="Fitness" />
            <Line type="monotone" dataKey="fatigue" stroke="#FF9500" strokeWidth={2} dot={false} isAnimationActive={false} name="Fatigue" />
            <Line type="monotone" dataKey="form" stroke={formColor} strokeWidth={2.5} dot={false} isAnimationActive={false} name="Forma" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginTop: 10, lineHeight: 1.45 }}>
        Fitness = conditie pe termen lung (42z). Fatigue = oboseala pe termen scurt (7z). Forma = fitness − fatigue. Forma pozitiva &gt; 10 = momentul ideal pentru performanta. Forma &lt; −30 = risc de supraantrenament.
      </p>
    </div>
  );
}
