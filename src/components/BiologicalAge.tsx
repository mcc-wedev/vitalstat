"use client";

import { useMemo, useState, useEffect } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";
import { trendRegression } from "@/lib/stats/regression";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

const AGE_STORAGE_KEY = "vitalstat-user-age";

// Biological age estimation based on biomarkers
// References:
// - Levine 2018: "An epigenetic biomarker of aging" (phenotypic age)
// - WHOOP Healthspan methodology
// - VO2 Max as strongest predictor of biological age (Kodama 2009)
// - RHR as cardiovascular age marker (Palatini 2006)
// - HRV as autonomic age marker (Voss 2015)
// - Sleep quality and aging (Mander 2017)

export function BiologicalAge({ metrics, sleepNights }: Props) {
  const [userAge, setUserAge] = useState<number | null>(null);
  const [editingAge, setEditingAge] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AGE_STORAGE_KEY);
      if (saved) setUserAge(Number(saved));
    } catch {}
  }, []);

  const saveAge = (age: number) => {
    setUserAge(age);
    setEditingAge(false);
    localStorage.setItem(AGE_STORAGE_KEY, String(age));
  };

  const age = useMemo(() => {
    // We need at least RHR and HRV for a meaningful estimate
    const rhr = metrics.restingHeartRate;
    const hrv = metrics.hrv;
    if (!rhr || rhr.length < 30 || !hrv || hrv.length < 30) return null;

    const { mean: rhrMean } = meanStd(rhr.slice(-30).map(d => d.mean));
    const { mean: hrvMean } = meanStd(hrv.slice(-30).map(d => d.mean));

    // RHR-based age offset (population norms, Palatini 2006)
    // Average RHR by age: 20s=65, 30s=68, 40s=70, 50s=72, 60s=74
    // Each 5 bpm above/below average ≈ ±3 years
    const rhrAgeOffset = (rhrMean - 68) * 0.6; // 68 as middle-age baseline

    // HRV-based age offset (Voss 2015 population norms)
    // Average HRV(SDNN): 20s=60ms, 30s=50ms, 40s=40ms, 50s=33ms, 60s=28ms
    // Each 10ms above/below average ≈ ±4 years
    const hrvAgeOffset = (42 - hrvMean) * 0.4; // 42ms as middle-age baseline

    // VO2 Max offset (Kodama 2009 — strongest predictor)
    let vo2Offset = 0;
    if (metrics.vo2Max?.length >= 7) {
      const { mean: vo2Mean } = meanStd(metrics.vo2Max.slice(-30).map(d => d.mean));
      // Average VO2 Max: 20s=45, 30s=40, 40s=37, 50s=33, 60s=28
      // Each 5 ml/kg/min above/below ≈ ±5 years
      vo2Offset = (38 - vo2Mean) * 1.0; // 38 as middle-age baseline
    }

    // Sleep quality offset (Mander 2017)
    let sleepOffset = 0;
    if (sleepNights.length >= 14) {
      const last14 = sleepNights.slice(-14);
      const avgHours = last14.reduce((s, n) => s + n.totalMinutes / 60, 0) / last14.length;
      const avgEff = last14.reduce((s, n) => s + n.efficiency, 0) / last14.length;
      const totalMin = last14.reduce((s, n) => s + n.totalMinutes, 0);
      const deepPct = totalMin > 0 ? (last14.reduce((s, n) => s + n.stages.deep, 0) / totalMin) * 100 : 0;

      // Good sleep = younger, poor sleep = older
      if (avgHours >= 7 && avgHours <= 9) sleepOffset -= 1;
      else if (avgHours < 6) sleepOffset += 3;
      if (avgEff >= 0.9) sleepOffset -= 0.5;
      else if (avgEff < 0.75) sleepOffset += 2;
      if (deepPct >= 18) sleepOffset -= 1;
      else if (deepPct < 10) sleepOffset += 2;
    }

    // Walking speed offset (Studenski 2011 — mortality predictor)
    let walkOffset = 0;
    if (metrics.walkingSpeed?.length >= 14) {
      const { mean: walkMean } = meanStd(metrics.walkingSpeed.slice(-30).map(d => d.mean));
      const kmh = walkMean * 3.6;
      // Fast walker = younger, slow = older
      if (kmh >= 5) walkOffset = -2;
      else if (kmh >= 4) walkOffset = -1;
      else if (kmh < 3) walkOffset = 3;
    }

    // Activity offset
    let activityOffset = 0;
    if (metrics.stepCount?.length >= 14) {
      const { mean: stepMean } = meanStd(metrics.stepCount.slice(-30).map(d => d.sum));
      if (stepMean >= 10000) activityOffset = -2;
      else if (stepMean >= 7000) activityOffset = -1;
      else if (stepMean < 4000) activityOffset = 3;
    }

    // Use actual chronological age if provided, otherwise can't compute
    if (!userAge) return null;
    const baseAge = userAge;
    const bioAge = Math.round(baseAge + rhrAgeOffset + hrvAgeOffset + vo2Offset + sleepOffset + walkOffset + activityOffset);

    // Pace of aging: are your biomarkers getting better or worse?
    let paceOfAging = "stabil";
    let paceDetail = "";
    if (rhr.length >= 90 && hrv.length >= 90) {
      const rhrReg = trendRegression(rhr.slice(-90).map(d => d.mean));
      const hrvReg = trendRegression(hrv.slice(-90).map(d => d.mean));
      const rhrImproving = rhrReg && rhrReg.significant && rhrReg.slopePerMonth < -0.5;
      const hrvImproving = hrvReg && hrvReg.significant && hrvReg.slopePerMonth > 1;
      const rhrWorsening = rhrReg && rhrReg.significant && rhrReg.slopePerMonth > 0.5;
      const hrvWorsening = hrvReg && hrvReg.significant && hrvReg.slopePerMonth < -1;

      if (rhrImproving || hrvImproving) {
        paceOfAging = "incetineste";
        paceDetail = "Biomarkerii tai se imbunatatesc — imbatranesti mai incet decat media.";
      } else if (rhrWorsening || hrvWorsening) {
        paceOfAging = "accelereaza";
        paceDetail = "Unii biomarkeri se degradeaza. Prioritizeaza somnul, exercitiul si managementul stresului.";
      } else {
        paceDetail = "Biomarkerii tai sunt stabili — continua ce faci.";
      }
    }

    const color = bioAge <= 30 ? "#10b981" : bioAge <= 38 ? "#22d3ee" : bioAge <= 45 ? "#f59e0b" : "#ef4444";

    const factors = [
      rhrAgeOffset !== 0 ? `RHR: ${rhrAgeOffset > 0 ? "+" : ""}${rhrAgeOffset.toFixed(0)} ani` : null,
      hrvAgeOffset !== 0 ? `HRV: ${hrvAgeOffset > 0 ? "+" : ""}${hrvAgeOffset.toFixed(0)} ani` : null,
      vo2Offset !== 0 ? `VO2: ${vo2Offset > 0 ? "+" : ""}${vo2Offset.toFixed(0)} ani` : null,
      sleepOffset !== 0 ? `Somn: ${sleepOffset > 0 ? "+" : ""}${sleepOffset.toFixed(0)} ani` : null,
      walkOffset !== 0 ? `Mers: ${walkOffset > 0 ? "+" : ""}${walkOffset.toFixed(0)} ani` : null,
      activityOffset !== 0 ? `Activitate: ${activityOffset > 0 ? "+" : ""}${activityOffset.toFixed(0)} ani` : null,
    ].filter(Boolean) as string[];

    return { bioAge, color, paceOfAging, paceDetail, factors };
  }, [metrics, sleepNights, userAge]);

  // Need user age first
  if (!userAge) {
    return (
      <div className="glass p-4 animate-in">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)] mb-2">Varsta biologica estimata</h3>
        <p className="text-[10px] text-[var(--muted)] mb-3">Introdu varsta ta cronologica pentru o estimare corecta:</p>
        <div className="flex items-center gap-2">
          <input
            type="number" min={18} max={90} placeholder="ex: 32"
            className="w-20 bg-transparent border border-[var(--glass-border)] rounded px-3 py-1.5 text-sm tabular-nums text-center"
            onKeyDown={e => { if (e.key === "Enter") { const v = Number((e.target as HTMLInputElement).value); if (v >= 18 && v <= 90) saveAge(v); } }}
          />
          <span className="text-[10px] text-[var(--muted)]">ani</span>
          <button
            onClick={() => {
              const input = document.querySelector('input[type="number"][min="18"]') as HTMLInputElement;
              if (input) { const v = Number(input.value); if (v >= 18 && v <= 90) saveAge(v); }
            }}
            className="pill pill-active text-[10px]"
          >Salveaza</button>
        </div>
      </div>
    );
  }

  if (!age) return null;

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Varsta biologica</h3>
          <button onClick={() => setEditingAge(!editingAge)} className="text-[8px] text-[var(--muted)] hover:text-white">
            (cronologica: {userAge} ani {editingAge ? "✕" : "✎"})
          </button>
          {editingAge && (
            <input type="number" min={18} max={90} defaultValue={userAge}
              className="w-12 bg-transparent border-b border-[var(--glass-border)] text-[10px] text-center"
              onKeyDown={e => { if (e.key === "Enter") saveAge(Number((e.target as HTMLInputElement).value)); }}
            />
          )}
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full" style={{
          background: age.paceOfAging === "incetineste" ? "rgba(16,185,129,0.15)" : age.paceOfAging === "accelereaza" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
          color: age.paceOfAging === "incetineste" ? "#10b981" : age.paceOfAging === "accelereaza" ? "#ef4444" : "var(--muted)",
        }}>
          Ritm: {age.paceOfAging}
        </span>
      </div>

      <div className="flex items-center gap-4 mb-3">
        <div className="text-center">
          <span className="text-3xl font-bold tabular-nums" style={{ color: age.color }}>{age.bioAge}</span>
          <div className="text-[9px] text-[var(--muted)]">ani biologici</div>
          {userAge && (
            <div className="text-[10px] font-medium mt-0.5" style={{
              color: age.bioAge < userAge ? "#10b981" : age.bioAge > userAge ? "#ef4444" : "var(--muted)"
            }}>
              {age.bioAge < userAge ? `${userAge - age.bioAge} ani mai tanar` : age.bioAge > userAge ? `${age.bioAge - userAge} ani mai batran` : "Egal cu varsta cronologica"}
            </div>
          )}
        </div>
        <div className="flex-1">
          <p className="text-[11px] text-[var(--muted-strong)] leading-relaxed">{age.paceDetail}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {age.factors.map((f, i) => (
          <span key={i} className="text-[9px] px-2 py-0.5 rounded-full" style={{
            background: f.includes("+") ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
            color: f.includes("+") ? "#ef4444" : "#10b981",
          }}>
            {f}
          </span>
        ))}
      </div>

      <p className="text-[8px] text-[var(--muted)] mt-2 italic">
        Estimare relativa bazata pe RHR, HRV, VO2 Max, somn, viteza de mers si activitate vs norme populationale. Nu e diagnostic medical.
      </p>
    </div>
  );
}
