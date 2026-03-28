"use client";

import { useState, useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";
import { pearson } from "@/lib/stats/correlation";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface Prediction {
  metric: string;
  label: string;
  unit: string;
  currentBaseline: number;
  predicted: number;
  change: number;
  confidence: "inalta" | "medie" | "scazuta";
}

export function WhatIfSimulator({ metrics, sleepNights }: Props) {
  const [sleepHours, setSleepHours] = useState(7.5);
  const [exerciseMin, setExerciseMin] = useState(30);
  const [scenario, setScenario] = useState<"custom" | "rest" | "intense" | "perfect">("custom");

  const presets = {
    rest: { sleep: 9, exercise: 0, label: "Zi de odihna" },
    intense: { sleep: 7, exercise: 90, label: "Antrenament intens" },
    perfect: { sleep: 8.5, exercise: 45, label: "Zi ideala" },
  };

  const applyPreset = (key: "rest" | "intense" | "perfect") => {
    setScenario(key);
    setSleepHours(presets[key].sleep);
    setExerciseMin(presets[key].exercise);
  };

  const predictions = useMemo(() => {
    const results: Prediction[] = [];
    const hrv = metrics.hrv;
    const rhr = metrics.restingHeartRate;
    if (!hrv || hrv.length < 30 || !rhr || rhr.length < 30 || sleepNights.length < 30) return results;

    // Build paired data for regression: sleep[t] → HRV[t+1], exercise[t] → RHR[t+1]
    const sleepMap = new Map(sleepNights.map(n => [n.date, n.totalMinutes / 60]));
    const hrvMap = new Map(hrv.map(d => [d.date, d.mean]));
    const rhrMap = new Map(rhr.map(d => [d.date, d.mean]));
    const exMap = metrics.exerciseTime ? new Map(metrics.exerciseTime.map(d => [d.date, d.sum])) : new Map();
    const dates = [...hrvMap.keys()].sort();

    // Sleep → HRV (next day)
    const sleepVals: number[] = [], hrvNextVals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const s = sleepMap.get(dates[i - 1]);
      const h = hrvMap.get(dates[i]);
      if (s !== undefined && h !== undefined) { sleepVals.push(s); hrvNextVals.push(h); }
    }

    if (sleepVals.length >= 20) {
      const r = pearson(sleepVals, hrvNextVals);
      const { mean: sAvg, std: sStd } = meanStd(sleepVals);
      const { mean: hAvg, std: hStd } = meanStd(hrvNextVals);

      if (sStd > 0 && hStd > 0) {
        // Linear prediction: predicted = hAvg + r * (hStd/sStd) * (sleepHours - sAvg)
        const slope = r * (hStd / sStd);
        const predicted = hAvg + slope * (sleepHours - sAvg);
        const change = predicted - hAvg;

        results.push({
          metric: "hrv", label: "HRV maine", unit: "ms",
          currentBaseline: Math.round(hAvg),
          predicted: Math.round(predicted),
          change: Math.round(change),
          confidence: Math.abs(r) > 0.4 ? "inalta" : Math.abs(r) > 0.2 ? "medie" : "scazuta",
        });
      }
    }

    // Exercise → RHR (next day)
    const exVals: number[] = [], rhrNextVals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const e = exMap.get(dates[i - 1]);
      const rh = rhrMap.get(dates[i]);
      if (e !== undefined && rh !== undefined) { exVals.push(e); rhrNextVals.push(rh); }
    }

    if (exVals.length >= 20) {
      const r = pearson(exVals, rhrNextVals);
      const { mean: eAvg, std: eStd } = meanStd(exVals);
      const { mean: rAvg, std: rStd } = meanStd(rhrNextVals);

      if (eStd > 0 && rStd > 0) {
        const slope = r * (rStd / eStd);
        const predicted = rAvg + slope * (exerciseMin - eAvg);
        const change = predicted - rAvg;

        results.push({
          metric: "rhr", label: "Puls repaus maine", unit: "bpm",
          currentBaseline: Math.round(rAvg),
          predicted: Math.round(predicted),
          change: Math.round(change),
          confidence: Math.abs(r) > 0.4 ? "inalta" : Math.abs(r) > 0.2 ? "medie" : "scazuta",
        });
      }
    }

    // Sleep → Sleep efficiency (same night)
    if (sleepNights.length >= 30) {
      const durs = sleepNights.slice(-60).map(n => n.totalMinutes / 60);
      const effs = sleepNights.slice(-60).map(n => n.efficiency * 100);
      if (durs.length >= 20) {
        const r = pearson(durs, effs);
        const { mean: dAvg, std: dStd } = meanStd(durs);
        const { mean: eAvg, std: eStd } = meanStd(effs);
        if (dStd > 0 && eStd > 0) {
          const slope = r * (eStd / dStd);
          const predicted = Math.min(100, Math.max(50, eAvg + slope * (sleepHours - dAvg)));
          results.push({
            metric: "efficiency", label: "Eficienta somn", unit: "%",
            currentBaseline: Math.round(eAvg),
            predicted: Math.round(predicted),
            change: Math.round(predicted - eAvg),
            confidence: Math.abs(r) > 0.3 ? "medie" : "scazuta",
          });
        }
      }
    }

    return results;
  }, [metrics, sleepNights, sleepHours, exerciseMin]);

  return (
    <div className="glass p-4 animate-in">
      <h3 className="text-xs font-semibold text-[var(--muted-strong)] mb-3">Simulator "Ce-ar fi daca..."</h3>
      <p className="text-[9px] text-[var(--muted)] mb-3">Predictii personalizate bazate pe corelatiile din datele tale.</p>

      {/* Presets */}
      <div className="flex gap-2 mb-3">
        {(["rest", "intense", "perfect"] as const).map(key => (
          <button key={key} onClick={() => applyPreset(key)}
            className={`pill text-[10px] ${scenario === key ? "pill-active" : ""}`}>
            {presets[key].label}
          </button>
        ))}
      </div>

      {/* Sliders */}
      <div className="space-y-3 mb-4">
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-[var(--muted)]">Somn azi noapte</span>
            <span className="font-medium tabular-nums">{sleepHours.toFixed(1)}h</span>
          </div>
          <input type="range" min={4} max={10} step={0.5} value={sleepHours}
            onChange={e => { setSleepHours(Number(e.target.value)); setScenario("custom"); }}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ background: `linear-gradient(90deg, #ef4444 0%, #f59e0b 30%, #10b981 60%, #10b981 80%, #22d3ee 100%)` }}
          />
        </div>
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-[var(--muted)]">Exercitiu azi</span>
            <span className="font-medium tabular-nums">{exerciseMin} min</span>
          </div>
          <input type="range" min={0} max={120} step={5} value={exerciseMin}
            onChange={e => { setExerciseMin(Number(e.target.value)); setScenario("custom"); }}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ background: `linear-gradient(90deg, #3b82f6 0%, #10b981 40%, #f59e0b 70%, #ef4444 100%)` }}
          />
        </div>
      </div>

      {/* Predictions */}
      {predictions.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-[10px] font-semibold text-[var(--muted-strong)]">Predictii pentru maine:</h4>
          {predictions.map(p => (
            <div key={p.metric} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div>
                <span className="text-[11px] font-medium">{p.label}</span>
                <span className="text-[8px] text-[var(--muted)] ml-1">(precizie {p.confidence})</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold tabular-nums">{p.predicted}</span>
                <span className="text-[9px] text-[var(--muted)] ml-0.5">{p.unit}</span>
                <span className="text-[10px] ml-2 font-medium" style={{
                  color: (p.metric === "rhr" ? p.change < 0 : p.change > 0) ? "#10b981" : p.change === 0 ? "var(--muted)" : "#ef4444"
                }}>
                  {p.change > 0 ? "+" : ""}{p.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-[var(--muted)] text-center py-2">Necesare 30+ zile de date pentru predictii.</p>
      )}
    </div>
  );
}
