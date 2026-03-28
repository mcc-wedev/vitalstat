"use client";

import { useMemo, useState } from "react";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";

interface Props {
  metrics: Record<string, DailySummary[]>;
}

// Population norms by age group (from published studies)
// RHR: Palatini 2006, Ostchega 2011 (NHANES)
// HRV (RMSSD): Nunan 2010, Voss 2015
// VO2 Max: Kodama 2009, ACSM Guidelines 2021
// Steps: Tudor-Locke 2011
const NORMS: Record<string, { label: string; unit: string; ranges: Record<string, { p25: number; p50: number; p75: number; p90: number }> }> = {
  restingHeartRate: {
    label: "Puls in repaus", unit: "bpm",
    ranges: {
      "20-29": { p25: 57, p50: 64, p75: 71, p90: 78 },
      "30-39": { p25: 58, p50: 65, p75: 73, p90: 80 },
      "40-49": { p25: 59, p50: 66, p75: 74, p90: 81 },
      "50-59": { p25: 60, p50: 68, p75: 76, p90: 83 },
      "60+": { p25: 58, p50: 67, p75: 76, p90: 84 },
    },
  },
  hrv: {
    label: "HRV (RMSSD)", unit: "ms",
    ranges: {
      "20-29": { p25: 30, p50: 42, p75: 60, p90: 80 },
      "30-39": { p25: 24, p50: 35, p75: 50, p90: 68 },
      "40-49": { p25: 18, p50: 28, p75: 42, p90: 58 },
      "50-59": { p25: 14, p50: 22, p75: 35, p90: 48 },
      "60+": { p25: 10, p50: 18, p75: 28, p90: 40 },
    },
  },
  vo2Max: {
    label: "VO2 Max", unit: "ml/kg/min",
    ranges: {
      "20-29": { p25: 35, p50: 40, p75: 47, p90: 53 },
      "30-39": { p25: 32, p50: 37, p75: 44, p90: 50 },
      "40-49": { p25: 29, p50: 35, p75: 41, p90: 47 },
      "50-59": { p25: 26, p50: 32, p75: 38, p90: 44 },
      "60+": { p25: 22, p50: 28, p75: 34, p90: 40 },
    },
  },
  stepCount: {
    label: "Pasi zilnici", unit: "pasi",
    ranges: {
      "20-29": { p25: 5500, p50: 7500, p75: 10000, p90: 13000 },
      "30-39": { p25: 5000, p50: 7000, p75: 9500, p90: 12000 },
      "40-49": { p25: 4500, p50: 6500, p75: 9000, p90: 11500 },
      "50-59": { p25: 4000, p50: 6000, p75: 8500, p90: 11000 },
      "60+": { p25: 3000, p50: 5000, p75: 7000, p90: 9500 },
    },
  },
};

const AGE_GROUPS = ["20-29", "30-39", "40-49", "50-59", "60+"];

export function AgeBenchmark({ metrics }: Props) {
  const [ageGroup, setAgeGroup] = useState("30-39");

  const benchmarks = useMemo(() => {
    const results: { key: string; label: string; unit: string; value: number; percentile: number; rank: string; color: string }[] = [];

    for (const [key, norm] of Object.entries(NORMS)) {
      const data = metrics[key];
      if (!data || data.length < 7) continue;

      const cfg = norm;
      const range = cfg.ranges[ageGroup];
      if (!range) continue;

      const last30 = data.slice(-30);
      const values = last30.map(d => key === "stepCount" ? d.sum : d.mean);
      const { mean: avg } = meanStd(values);

      // Calculate approximate percentile
      let percentile: number;
      const inverted = key === "restingHeartRate"; // lower is better

      if (inverted) {
        if (avg <= range.p25) percentile = 85;
        else if (avg <= range.p50) percentile = 62;
        else if (avg <= range.p75) percentile = 37;
        else if (avg <= range.p90) percentile = 15;
        else percentile = 5;
      } else {
        if (avg >= range.p90) percentile = 92;
        else if (avg >= range.p75) percentile = 80;
        else if (avg >= range.p50) percentile = 55;
        else if (avg >= range.p25) percentile = 30;
        else percentile = 12;
      }

      const rank = percentile >= 80 ? "Excelent" : percentile >= 60 ? "Peste medie" : percentile >= 40 ? "Mediu" : percentile >= 20 ? "Sub medie" : "Scazut";
      const color = percentile >= 80 ? "#10b981" : percentile >= 60 ? "#22d3ee" : percentile >= 40 ? "#f59e0b" : "#ef4444";

      results.push({
        key, label: cfg.label, unit: cfg.unit,
        value: Math.round(avg * (key === "stepCount" ? 1 : 10)) / (key === "stepCount" ? 1 : 10),
        percentile, rank, color,
      });
    }

    return results;
  }, [metrics, ageGroup]);

  if (benchmarks.length === 0) return null;

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Benchmark pe varsta</h3>
        <select
          value={ageGroup}
          onChange={e => setAgeGroup(e.target.value)}
          className="text-[10px] bg-transparent border border-[var(--glass-border)] rounded px-2 py-1 text-[var(--muted-strong)]"
        >
          {AGE_GROUPS.map(g => (
            <option key={g} value={g} className="bg-[#0a0a0f]">{g} ani</option>
          ))}
        </select>
      </div>

      <div className="space-y-2.5">
        {benchmarks.map(b => (
          <div key={b.key}>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-[var(--muted-strong)]">{b.label}: <span className="font-medium">{b.value} {b.unit}</span></span>
              <span className="font-medium" style={{ color: b.color }}>Top {100 - b.percentile}% — {b.rank}</span>
            </div>
            <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="absolute h-full rounded-full transition-all duration-500" style={{
                width: `${b.percentile}%`,
                background: `linear-gradient(90deg, ${b.color}60, ${b.color})`,
              }} />
              {/* Marker for p50 */}
              <div className="absolute h-full w-px bg-white/20" style={{ left: "50%" }} />
            </div>
          </div>
        ))}
      </div>

      <p className="text-[8px] text-[var(--muted)] mt-3 italic">
        Norme: Palatini 2006, Nunan 2010, Voss 2015, Kodama 2009, Tudor-Locke 2011, ACSM 2021.
      </p>
    </div>
  );
}
