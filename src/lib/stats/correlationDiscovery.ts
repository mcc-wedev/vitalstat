/**
 * Correlation Discovery — auto-scan all metric pairs.
 * Predictive Readiness — simple model for tomorrow's readiness.
 */

import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { METRIC_CONFIG } from "../parser/healthTypes";
import { pearson, pearsonPValue } from "./correlation";

// ── Correlation Discovery ──

export interface CorrelationPair {
  metricA: string;
  labelA: string;
  metricB: string;
  labelB: string;
  r: number;
  p: number;
  n: number;
  lag: number;
  interpretation: string;
  strength: "strong" | "moderate";
}

const SCAN_KEYS = [
  "hrv", "restingHeartRate", "stepCount", "exerciseTime",
  "oxygenSaturation", "respiratoryRate",
];

export function discoverCorrelations(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
): CorrelationPair[] {
  const maps: Record<string, Map<string, number>> = {};
  for (const key of SCAN_KEYS) {
    const data = metrics[key];
    if (!data || data.length < 14) continue;
    maps[key] = new Map(data.map(d => [d.date, key === "stepCount" || key === "exerciseTime" ? d.sum : d.mean]));
  }

  if (sleepNights.length >= 14) {
    maps["sleepDuration"] = new Map(sleepNights.map(n => [n.date, n.totalMinutes / 60]));
    maps["sleepEfficiency"] = new Map(sleepNights.map(n => [n.date, n.efficiency * 100]));
  }

  const keys = Object.keys(maps);
  const results: CorrelationPair[] = [];

  // Same-day correlations
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const pair = computePair(keys[i], keys[j], maps[keys[i]], maps[keys[j]], 0);
      if (pair) results.push(pair);
    }
  }

  // Lag-1: yesterday's A → today's B
  const lagPairs = [
    ["sleepDuration", "hrv"], ["sleepDuration", "restingHeartRate"],
    ["exerciseTime", "hrv"], ["exerciseTime", "restingHeartRate"],
    ["sleepEfficiency", "hrv"],
  ];
  for (const [a, b] of lagPairs) {
    if (!maps[a] || !maps[b]) continue;
    const pair = computePair(a, b, maps[a], maps[b], 1);
    if (pair) results.push(pair);
  }

  results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return results.slice(0, 8);
}

function computePair(
  keyA: string, keyB: string,
  mapA: Map<string, number>, mapB: Map<string, number>,
  lag: number,
): CorrelationPair | null {
  const x: number[] = [];
  const y: number[] = [];

  for (const [date, val] of mapA) {
    const target = lag === 0 ? date : nextDay(date);
    const yVal = mapB.get(target);
    if (yVal !== undefined) { x.push(val); y.push(yVal); }
  }

  if (x.length < 14) return null;
  const r = pearson(x, y);
  const p = pearsonPValue(r, x.length);
  if (p > 0.05) return null;

  const absR = Math.abs(r);
  if (absR < 0.3) return null; // skip weak

  const strength: "strong" | "moderate" = absR >= 0.5 ? "strong" : "moderate";
  const lA = getLabel(keyA);
  const lB = getLabel(keyB);
  const dir = r > 0 ? "creste" : "scade";
  const lagTxt = lag > 0 ? " a doua zi" : "";

  return {
    metricA: keyA, labelA: lA, metricB: keyB, labelB: lB,
    r, p, n: x.length, lag, strength,
    interpretation: `Cand ${lA} e mai mare, ${lB}${lagTxt} ${dir} (r=${r.toFixed(2)}, n=${x.length}).`,
  };
}

function getLabel(key: string): string {
  if (key === "sleepDuration") return "Durata somn";
  if (key === "sleepEfficiency") return "Eficienta somn";
  return METRIC_CONFIG[key]?.label || key;
}

function nextDay(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().substring(0, 10);
}

// ── Predictive Readiness ──

export interface PredictedReadiness {
  score: number;
  confidence: "high" | "medium" | "low";
  factors: { label: string; value: string; impact: "positive" | "negative" | "neutral" }[];
  narrative: string;
}

export function predictReadiness(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
): PredictedReadiness | null {
  const hrvData = metrics.hrv;
  const rhrData = metrics.restingHeartRate;
  if (!hrvData || !rhrData || hrvData.length < 14 || rhrData.length < 14) return null;

  const hrvSorted = [...hrvData].sort((a, b) => a.date.localeCompare(b.date));
  const rhrSorted = [...rhrData].sort((a, b) => a.date.localeCompare(b.date));

  const hrvBaseline = avg(hrvSorted.slice(-14).map(d => d.mean));
  const rhrBaseline = avg(rhrSorted.slice(-14).map(d => d.mean));
  const latestHrv = hrvSorted[hrvSorted.length - 1].mean;
  const latestRhr = rhrSorted[rhrSorted.length - 1].mean;

  const sleepSorted = [...sleepNights].sort((a, b) => a.date.localeCompare(b.date));
  const lastSleep = sleepSorted.length > 0 ? sleepSorted[sleepSorted.length - 1] : null;
  const sleepH = lastSleep ? lastSleep.totalMinutes / 60 : 7;

  const exSorted = metrics.exerciseTime
    ? [...metrics.exerciseTime].sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const lastEx = exSorted.length > 0 ? exSorted[exSorted.length - 1].sum : 0;

  const factors: PredictedReadiness["factors"] = [];
  let score = 50;

  // HRV (40%)
  const hrvDev = (latestHrv - hrvBaseline) / (hrvBaseline || 1);
  score += hrvDev * 40;
  factors.push({
    label: "HRV", value: `${Math.round(latestHrv)} ms`,
    impact: hrvDev > 0.05 ? "positive" : hrvDev < -0.05 ? "negative" : "neutral",
  });

  // RHR (25%, inverted)
  const rhrDev = (rhrBaseline - latestRhr) / (rhrBaseline || 1);
  score += rhrDev * 25;
  factors.push({
    label: "Puls repaus", value: `${Math.round(latestRhr)} bpm`,
    impact: rhrDev > 0.02 ? "positive" : rhrDev < -0.02 ? "negative" : "neutral",
  });

  // Sleep (20%)
  const sleepFactor = sleepH >= 7.5 ? 1 : sleepH >= 7 ? 0.5 : sleepH >= 6 ? 0 : -0.5;
  score += sleepFactor * 20;
  factors.push({
    label: "Somn", value: `${sleepH.toFixed(1)}h`,
    impact: sleepFactor > 0 ? "positive" : sleepFactor < 0 ? "negative" : "neutral",
  });

  // Exercise (15%)
  const exFactor = lastEx > 60 ? -0.3 : lastEx > 30 ? 0.2 : lastEx > 0 ? 0.1 : -0.1;
  score += exFactor * 15;
  factors.push({
    label: "Exercitiu ieri", value: `${Math.round(lastEx)} min`,
    impact: exFactor > 0 ? "positive" : exFactor < 0 ? "negative" : "neutral",
  });

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Confidence
  const lastDate = hrvSorted[hrvSorted.length - 1].date;
  const today = new Date().toISOString().substring(0, 10);
  const daysDiff = (new Date(today).getTime() - new Date(lastDate).getTime()) / 86400000;
  const confidence: PredictedReadiness["confidence"] = daysDiff <= 1 ? "high" : daysDiff <= 3 ? "medium" : "low";

  const pos = factors.filter(f => f.impact === "positive");
  const neg = factors.filter(f => f.impact === "negative");
  let narrative = `Readiness estimat maine: ${score}/100.`;
  if (pos.length > 0) narrative += ` Forte: ${pos.map(f => f.label.toLowerCase()).join(", ")}.`;
  if (neg.length > 0) narrative += ` De imbunatatit: ${neg.map(f => f.label.toLowerCase()).join(", ")}.`;

  return { score, confidence, factors, narrative };
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}
