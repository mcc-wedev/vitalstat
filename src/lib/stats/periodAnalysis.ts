/**
 * ═══════════════════════════════════════════════════════��═══════
 *  PERIOD ANALYSIS ENGINE
 *
 *  Deep self-understanding for 30z/90z/6L/1A periods.
 *  Produces: averages, best/worst days, patterns, training,
 *  morning quality, self-signals, Q-over-Q comparisons.
 *
 *  All text output is in Romanian, clear and narrative.
 * ═════════════════════════════════════════════════════��═════════
 */

import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { METRIC_CONFIG, getDisplayValue } from "../parser/healthTypes";
import { calculateRecovery, type RecoveryScore } from "./recovery";
import { mannKendall } from "./advanced";
import { dayOfWeekSeasonality, detectWeeklyCycle } from "./advanced";
import { pearson } from "./correlation";
import { meanStd } from "./zScore";

// ── Types ──

export interface MetricAverage {
  key: string;
  label: string;
  unit: string;
  current: number;
  previous: number;
  deltaAbs: number;
  deltaPct: number;
  trend: "up" | "down" | "stable";
  trendSignificant: boolean;
  narrative: string;
}

export interface DayHighlight {
  date: string;
  dayLabel: string;
  recoveryScore: number;
  keyFactor: string;
  keyValue: string;
}

export interface PatternSummary {
  sleepAvg: number;
  hrvAvg: number;
  rhrAvg: number;
  exercisePrevDay: number;
  narrative: string;
}

export interface QuarterDelta {
  key: string;
  label: string;
  unit: string;
  quarters: number[];
  trend: "improving" | "declining" | "stable";
}

export interface TrainingPattern {
  weeklyAvgMinutes: number;
  peakDay: string;
  lowDay: string;
  dayDistribution: { day: string; avg: number }[];
  recoveryImpact: string;
}

export interface MorningAnalysis {
  goodPct: number;
  neutralPct: number;
  difficultPct: number;
  topFactor: string;
  narrative: string;
}

export interface SelfSignal {
  icon: string;
  title: string;
  narrative: string;
}

export interface PeriodReport {
  averages: MetricAverage[];
  bestDays: DayHighlight[];
  worstDays: DayHighlight[];
  goodDayPattern: PatternSummary | null;
  badDayPattern: PatternSummary | null;
  quarterComparison: QuarterDelta[] | null;
  trainingPatterns: TrainingPattern | null;
  morningQuality: MorningAnalysis | null;
  selfSignals: SelfSignal[];
}

// ── Helpers ──

const DOW_RO = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sam"];
const DOW_RO_FULL = ["duminica", "luni", "marti", "miercuri", "joi", "vineri", "sambata"];

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function formatDate(d: string): string {
  const dt = new Date(d);
  return `${dt.getDate()} ${["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"][dt.getMonth()]}`;
}

function prevDay(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().substring(0, 10);
}

function roundRo(n: number, d: number): string {
  return n.toLocaleString("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Main Entry ──

const CORE_METRICS = [
  "restingHeartRate", "hrv", "stepCount", "exerciseTime",
  "oxygenSaturation", "respiratoryRate",
];

export function generatePeriodReport(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
  allMetrics: Record<string, DailySummary[]>,
  allSleep: SleepNight[],
  windowDays: number,
): PeriodReport {
  const averages = computeAverages(metrics, allMetrics, windowDays);
  const { bestDays, worstDays, dailyRecovery } = findBestWorstDays(metrics, sleepNights, allMetrics, allSleep);
  const goodDayPattern = analyzePattern(dailyRecovery, metrics, sleepNights, true);
  const badDayPattern = analyzePattern(dailyRecovery, metrics, sleepNights, false);
  const quarterComparison = windowDays >= 90 ? compareQuarters(metrics, windowDays) : null;
  const trainingPatterns = analyzeTraining(metrics, dailyRecovery);
  const morningQuality = analyzeMorningQuality(metrics, sleepNights);
  const selfSignals = generateSelfSignals(metrics, sleepNights, allMetrics, allSleep, windowDays, dailyRecovery);

  return {
    averages,
    bestDays,
    worstDays,
    goodDayPattern,
    badDayPattern,
    quarterComparison,
    trainingPatterns,
    morningQuality,
    selfSignals,
  };
}

// ══════════════��═══════════════════════════════════���════════════
//  2a. AVERAGES + OBSERVATIONS
// ═══════════════════════════════════════════════════════════════

function computeAverages(
  metrics: Record<string, DailySummary[]>,
  allMetrics: Record<string, DailySummary[]>,
  windowDays: number,
): MetricAverage[] {
  const result: MetricAverage[] = [];

  for (const key of CORE_METRICS) {
    const data = metrics[key];
    const allData = allMetrics[key];
    const cfg = METRIC_CONFIG[key];
    if (!data || !cfg || data.length < 7) continue;

    // Current period values (use getDisplayValue for unit conversion)
    const currentValues = data.map(d => getDisplayValue(d, key));
    const currentAvg = avg(currentValues);

    // Previous period (same length, immediately before)
    const allSorted = (allData || data).slice().sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = data[0]?.date;
    const prevData = allSorted.filter(d => d.date < firstDate).slice(-windowDays);
    const prevValues = prevData.map(d => getDisplayValue(d, key));
    const prevAvg = prevValues.length >= 7 ? avg(prevValues) : currentAvg;

    const deltaAbs = currentAvg - prevAvg;
    const deltaPct = prevAvg !== 0 ? (deltaAbs / prevAvg) * 100 : 0;

    // Mann-Kendall trend
    const mk = currentValues.length >= 10 ? mannKendall(currentValues) : null;
    const trend: "up" | "down" | "stable" = mk
      ? (mk.tau > 0.1 ? "up" : mk.tau < -0.1 ? "down" : "stable")
      : "stable";
    const trendSignificant = mk?.significant ?? false;

    // Narrative
    const trendText = trend === "up" ? "crescatoare" : trend === "down" ? "descrescatoare" : "stabila";
    const deltaSign = deltaPct > 0 ? "+" : "";
    const sigText = trendSignificant ? "" : " (nesemnificativa statistic)";

    let narrative = `${cfg.label}: media ${roundRo(currentAvg, cfg.decimals)} ${cfg.unit}`;
    if (prevValues.length >= 7) {
      narrative += `, ${deltaSign}${roundRo(deltaPct, 1)}% fata de perioada anterioara`;
    }
    narrative += `. Tendinta ${trendText}${sigText}.`;

    result.push({
      key, label: cfg.label, unit: cfg.unit,
      current: currentAvg, previous: prevAvg,
      deltaAbs, deltaPct,
      trend, trendSignificant,
      narrative,
    });
  }

  // Sleep average
  const sleepInPeriod = allMetrics; // We'll compute from metrics directly
  // (sleep handled separately in morning quality)

  return result;
}

// ═════════════════════════════════════════════════════���═════════
//  2b. BEST / WORST DAYS
// ═══════════════════════════════════════════════════════════════

interface DailyRecoveryEntry {
  date: string;
  recovery: RecoveryScore;
}

function findBestWorstDays(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
  allMetrics: Record<string, DailySummary[]>,
  allSleep: SleepNight[],
): { bestDays: DayHighlight[]; worstDays: DayHighlight[]; dailyRecovery: DailyRecoveryEntry[] } {
  // Get all unique dates in the period
  const dates = new Set<string>();
  for (const arr of Object.values(metrics)) {
    for (const d of arr) dates.add(d.date);
  }
  const sortedDates = [...dates].sort();

  // Calculate recovery for each day (using full data for baselines)
  const dailyRecovery: DailyRecoveryEntry[] = [];
  for (const date of sortedDates) {
    const rec = calculateRecovery(
      allMetrics.restingHeartRate || [],
      allMetrics.hrv || [],
      allSleep,
      date,
      allMetrics.exerciseTime,
      allMetrics.respiratoryRate,
      allMetrics.oxygenSaturation,
      allMetrics.wristTemperature,
    );
    if (rec.hasEnoughData) {
      dailyRecovery.push({ date, recovery: rec });
    }
  }

  if (dailyRecovery.length < 5) {
    return { bestDays: [], worstDays: [], dailyRecovery };
  }

  const sorted = [...dailyRecovery].sort((a, b) => b.recovery.total - a.recovery.total);
  const best3 = sorted.slice(0, 3);
  const worst3 = sorted.slice(-3).reverse();

  const toHighlight = (entry: DailyRecoveryEntry): DayHighlight => {
    const dt = new Date(entry.date);
    const dayLabel = `${DOW_RO[dt.getDay()]} ${formatDate(entry.date)}`;

    // Find the dominant factor
    const comps = entry.recovery.components.filter(c => c.available).sort((a, b) => {
      // Sort by deviation from 50 (neutral), weighted
      return Math.abs(b.score - 50) * b.weight - Math.abs(a.score - 50) * a.weight;
    });
    const top = comps[0];
    const keyFactor = top?.name || "";
    const keyValue = top ? `${top.score}/100` : "";

    return { date: entry.date, dayLabel, recoveryScore: entry.recovery.total, keyFactor, keyValue };
  };

  return {
    bestDays: best3.map(toHighlight),
    worstDays: worst3.map(toHighlight),
    dailyRecovery,
  };
}

// ═══════════════════════════════════════════════════════════════
//  2c. PATTERN ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzePattern(
  dailyRecovery: DailyRecoveryEntry[],
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
  good: boolean,
): PatternSummary | null {
  if (dailyRecovery.length < 10) return null;

  const sorted = [...dailyRecovery].sort((a, b) => b.recovery.total - a.recovery.total);
  const threshold = good
    ? sorted[Math.floor(sorted.length * 0.25)]?.recovery.total ?? 70
    : sorted[Math.floor(sorted.length * 0.75)]?.recovery.total ?? 40;

  const targetDays = dailyRecovery.filter(d =>
    good ? d.recovery.total >= threshold : d.recovery.total <= threshold
  );

  if (targetDays.length < 3) return null;

  const targetDates = new Set(targetDays.map(d => d.date));

  // Sleep for these days
  const sleepVals = sleepNights
    .filter(n => targetDates.has(n.date))
    .map(n => n.totalMinutes / 60);
  const sleepAvg = sleepVals.length > 0 ? avg(sleepVals) : 0;

  // HRV for these days
  const hrvData = metrics.hrv || [];
  const hrvVals = hrvData.filter(d => targetDates.has(d.date)).map(d => d.mean);
  const hrvAvg = hrvVals.length > 0 ? avg(hrvVals) : 0;

  // RHR for these days
  const rhrData = metrics.restingHeartRate || [];
  const rhrVals = rhrData.filter(d => targetDates.has(d.date)).map(d => d.mean);
  const rhrAvg = rhrVals.length > 0 ? avg(rhrVals) : 0;

  // Exercise previous day
  const exData = metrics.exerciseTime || [];
  const exMap = new Map(exData.map(d => [d.date, d.sum]));
  const prevDayEx = targetDays
    .map(d => exMap.get(prevDay(d.date)))
    .filter((v): v is number => v !== undefined);
  const exercisePrevDay = prevDayEx.length > 0 ? avg(prevDayEx) : 0;

  const label = good ? "bune" : "dificile";
  const parts: string[] = [];
  if (sleepAvg > 0) parts.push(`somn ${roundRo(sleepAvg, 1)}h`);
  if (hrvAvg > 0) parts.push(`HRV ${roundRo(hrvAvg, 0)} ms`);
  if (rhrAvg > 0) parts.push(`puls ${roundRo(rhrAvg, 0)} bpm`);
  if (exercisePrevDay > 0) parts.push(`exercitiu ziua anterioara: ${roundRo(exercisePrevDay, 0)} min`);

  const narrative = `In zilele ${label}: ${parts.join(", ")}.`;

  return { sleepAvg, hrvAvg, rhrAvg, exercisePrevDay, narrative };
}

// ═══════════════════════════════════════════════════════════════
//  2d. QUARTER-OVER-QUARTER
// ═══════════════════════════════════════════════════════════════

function compareQuarters(
  metrics: Record<string, DailySummary[]>,
  windowDays: number,
): QuarterDelta[] {
  const numQ = windowDays >= 360 ? 4 : windowDays >= 180 ? 3 : 2;
  const result: QuarterDelta[] = [];

  for (const key of CORE_METRICS) {
    const data = metrics[key];
    const cfg = METRIC_CONFIG[key];
    if (!data || !cfg || data.length < numQ * 7) continue;

    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    const qSize = Math.floor(sorted.length / numQ);
    const quarters: number[] = [];

    for (let q = 0; q < numQ; q++) {
      const slice = sorted.slice(q * qSize, (q + 1) * qSize);
      quarters.push(avg(slice.map(d => getDisplayValue(d, key))));
    }

    // Determine trend
    const first = quarters[0];
    const last = quarters[quarters.length - 1];
    const delta = last - first;
    const improving = cfg.higherIsBetter ? delta > 0 : delta < 0;
    const magnitude = Math.abs(delta / (first || 1)) * 100;
    const trend: "improving" | "declining" | "stable" =
      magnitude < 2 ? "stable" : improving ? "improving" : "declining";

    result.push({ key, label: cfg.label, unit: cfg.unit, quarters, trend });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
//  2e. TRAINING PATTERNS
// ═══════════════════════════════════════════════════════════════

function analyzeTraining(
  metrics: Record<string, DailySummary[]>,
  dailyRecovery: DailyRecoveryEntry[],
): TrainingPattern | null {
  const exData = metrics.exerciseTime;
  if (!exData || exData.length < 14) return null;

  // Weekly average
  const totalMin = exData.reduce((s, d) => s + d.sum, 0);
  const weeks = Math.max(1, exData.length / 7);
  const weeklyAvgMinutes = totalMin / weeks;

  // Day-of-week distribution
  const dowIdx = exData.map(d => new Date(d.date).getDay());
  const seasonality = dayOfWeekSeasonality(exData.map(d => d.sum), dowIdx);
  const dayDist = seasonality.map(s => ({
    day: DOW_RO[s.dow],
    avg: s.avg,
  }));

  const peakDow = seasonality.reduce((a, b) => b.avg > a.avg ? b : a, seasonality[0]);
  const lowDow = seasonality.reduce((a, b) => b.avg < a.avg ? b : a, seasonality[0]);
  const peakDay = DOW_RO_FULL[peakDow.dow];
  const lowDay = DOW_RO_FULL[lowDow.dow];

  // Exercise → next-day recovery correlation
  let recoveryImpact = "";
  if (dailyRecovery.length >= 14) {
    const recMap = new Map(dailyRecovery.map(d => [d.date, d.recovery.total]));
    const exMap = new Map(exData.map(d => [d.date, d.sum]));

    const highExDays = exData.filter(d => d.sum > 45);
    const lowExDays = exData.filter(d => d.sum <= 15);

    const nextDayRec = (days: DailySummary[]) => {
      const recs: number[] = [];
      for (const d of days) {
        const next = new Date(d.date);
        next.setDate(next.getDate() + 1);
        const nextDate = next.toISOString().substring(0, 10);
        const r = recMap.get(nextDate);
        if (r !== undefined) recs.push(r);
      }
      return recs;
    };

    const highRecs = nextDayRec(highExDays);
    const lowRecs = nextDayRec(lowExDays);

    if (highRecs.length >= 3 && lowRecs.length >= 3) {
      const highAvg = avg(highRecs);
      const lowAvg = avg(lowRecs);
      const diff = Math.round(lowAvg - highAvg);
      if (diff > 3) {
        recoveryImpact = `Dupa zilele cu exercitiu intens (>45 min), recuperarea scade cu ${diff} puncte fata de zilele usoare.`;
      } else if (diff < -3) {
        recoveryImpact = `Exercitiul moderat iti imbunatateste recuperarea a doua zi cu ${Math.abs(diff)} puncte.`;
      } else {
        recoveryImpact = `Recuperarea ta nu e afectata semnificativ de volumul de exercitiu — semn de adaptare buna.`;
      }
    }
  }

  return {
    weeklyAvgMinutes,
    peakDay,
    lowDay,
    dayDistribution: dayDist,
    recoveryImpact,
  };
}

// ═══════════════════════════════════════════════════════════════
//  2f. MORNING QUALITY
// ═══════════════════════════════════════════════════════════════

function analyzeMorningQuality(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
): MorningAnalysis | null {
  if (sleepNights.length < 14) return null;

  const rhrData = metrics.restingHeartRate || [];
  const hrvData = metrics.hrv || [];
  const rhrMap = new Map(rhrData.map(d => [d.date, d.mean]));
  const hrvMap = new Map(hrvData.map(d => [d.date, d.mean]));

  // Personal medians
  const rhrVals = rhrData.map(d => d.mean).sort((a, b) => a - b);
  const hrvVals = hrvData.map(d => d.mean).sort((a, b) => a - b);
  const rhrMedian = rhrVals.length > 0 ? rhrVals[Math.floor(rhrVals.length / 2)] : Infinity;
  const hrvMedian = hrvVals.length > 0 ? hrvVals[Math.floor(hrvVals.length / 2)] : 0;

  let good = 0, neutral = 0, difficult = 0;
  const morningScores: { date: string; score: number; sleepH: number }[] = [];

  for (const night of sleepNights) {
    let score = 0;
    const rhr = rhrMap.get(night.date);
    const hrv = hrvMap.get(night.date);

    if (rhr !== undefined && rhr < rhrMedian) score++;
    if (hrv !== undefined && hrv > hrvMedian) score++;
    if (night.efficiency > 0.85) score++;
    const deepPct = night.totalMinutes > 0 ? (night.stages.deep / night.totalMinutes) * 100 : 0;
    if (deepPct > 15) score++;

    if (score >= 3) good++;
    else if (score >= 2) neutral++;
    else difficult++;

    morningScores.push({ date: night.date, score, sleepH: night.totalMinutes / 60 });
  }

  const total = good + neutral + difficult;
  if (total === 0) return null;

  const goodPct = Math.round((good / total) * 100);
  const neutralPct = Math.round((neutral / total) * 100);
  const difficultPct = Math.round((difficult / total) * 100);

  // Find top factor: correlate morning score with sleep duration, efficiency, deep%
  const scores = morningScores.map(m => m.score);
  const sleepHours = morningScores.map(m => m.sleepH);
  const efficiencies = sleepNights.slice(0, morningScores.length).map(n => n.efficiency);

  const rSleep = scores.length >= 5 ? pearson(scores, sleepHours) : 0;
  const rEff = scores.length >= 5 && efficiencies.length === scores.length ? pearson(scores, efficiencies) : 0;

  let topFactor = "calitatea somnului";
  if (Math.abs(rSleep) > Math.abs(rEff)) {
    topFactor = `durata somnului (r=${roundRo(rSleep, 2)})`;
  } else if (Math.abs(rEff) > 0.3) {
    topFactor = `eficienta somnului (r=${roundRo(rEff, 2)})`;
  }

  // Build narrative
  let narrative = `${goodPct}% din diminetile tale sunt bune, ${neutralPct}% neutre, ${difficultPct}% dificile.`;
  narrative += ` Factorul principal: ${topFactor}.`;

  if (rSleep > 0.3) {
    // Find threshold where mornings become good
    const goodMornings = morningScores.filter(m => m.score >= 3);
    const badMornings = morningScores.filter(m => m.score <= 1);
    const goodSleep = goodMornings.length > 0 ? avg(goodMornings.map(m => m.sleepH)) : 0;
    const badSleep = badMornings.length > 0 ? avg(badMornings.map(m => m.sleepH)) : 0;
    if (goodSleep > 0 && badSleep > 0) {
      narrative += ` In diminetile bune dormi in medie ${roundRo(goodSleep, 1)}h vs ${roundRo(badSleep, 1)}h in cele dificile.`;
    }
  }

  return { goodPct, neutralPct, difficultPct, topFactor, narrative };
}

// ═══════════════════════════════════════════════════════════════
//  2g. SELF-UNDERSTANDING SIGNALS
// ═══════════════════════════════════════════════════════════════

function generateSelfSignals(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
  allMetrics: Record<string, DailySummary[]>,
  allSleep: SleepNight[],
  windowDays: number,
  dailyRecovery: DailyRecoveryEntry[],
): SelfSignal[] {
  const signals: SelfSignal[] = [];

  // 1. Natural Rhythm
  const hrvData = metrics.hrv;
  if (hrvData && hrvData.length >= 21) {
    const dowIdx = hrvData.map(d => new Date(d.date).getDay());
    const seasonality = dayOfWeekSeasonality(hrvData.map(d => d.mean), dowIdx);
    const cycle = detectWeeklyCycle(hrvData.map(d => d.mean));

    const best = seasonality.reduce((a, b) => b.avg > a.avg ? b : a, seasonality[0]);
    const worst = seasonality.reduce((a, b) => b.avg < a.avg ? b : a, seasonality[0]);

    if (cycle.hasCycle || Math.abs(best.deviation) > 2) {
      signals.push({
        icon: "🔄",
        title: "Ritmul tau saptamanal",
        narrative: `HRV-ul tau e cel mai ridicat ${DOW_RO_FULL[best.dow]} (${roundRo(best.avg, 0)} ms) si cel mai scazut ${DOW_RO_FULL[worst.dow]} (${roundRo(worst.avg, 0)} ms). ${cycle.hasCycle ? "Corpul tau urmeaza un ciclu clar de 7 zile." : "Pattern partial — fara ciclu rigid."}`,
      });
    }
  }

  // 2. Recovery Capacity
  if (dailyRecovery.length >= 21) {
    const lowDays = dailyRecovery.filter(d => d.recovery.total < 50);
    if (lowDays.length >= 2) {
      const recoveryTimes: number[] = [];
      const recMap = new Map(dailyRecovery.map(d => [d.date, d.recovery.total]));
      const allDates = dailyRecovery.map(d => d.date).sort();

      for (const low of lowDays) {
        const idx = allDates.indexOf(low.date);
        let daysToRecover = 0;
        for (let i = idx + 1; i < allDates.length; i++) {
          daysToRecover++;
          const r = recMap.get(allDates[i]);
          if (r !== undefined && r >= 70) break;
          if (daysToRecover >= 7) break;
        }
        if (daysToRecover > 0 && daysToRecover < 7) {
          recoveryTimes.push(daysToRecover);
        }
      }

      if (recoveryTimes.length >= 2) {
        const avgRecovery = avg(recoveryTimes);
        signals.push({
          icon: "⏱",
          title: "Capacitate de recuperare",
          narrative: `Dupa zilele dificile (sub 50 puncte), revii in medie in ${roundRo(avgRecovery, 1)} zile. ${avgRecovery <= 2 ? "Recuperare rapida — semn excelent de fitness." : avgRecovery <= 3 ? "Recuperare normala." : "Recuperare lenta — ar ajuta mai mult somn si hidratare."}`,
        });
      }
    }
  }

  // 3. Sleep Threshold
  if (sleepNights.length >= 21 && hrvData && hrvData.length >= 21) {
    const hrvMap = new Map(hrvData.map(d => [d.date, d.mean]));
    const pairs: { sleepH: number; hrv: number }[] = [];

    for (const night of sleepNights) {
      const h = hrvMap.get(night.date);
      if (h !== undefined) {
        pairs.push({ sleepH: night.totalMinutes / 60, hrv: h });
      }
    }

    if (pairs.length >= 14) {
      const r = pearson(pairs.map(p => p.sleepH), pairs.map(p => p.hrv));

      if (r > 0.2) {
        // Find sleep threshold via bucket analysis
        const under6 = pairs.filter(p => p.sleepH < 6.5);
        const over7 = pairs.filter(p => p.sleepH >= 7);
        const hrvUnder = under6.length >= 3 ? avg(under6.map(p => p.hrv)) : 0;
        const hrvOver = over7.length >= 3 ? avg(over7.map(p => p.hrv)) : 0;

        if (hrvUnder > 0 && hrvOver > 0) {
          const diff = Math.round(((hrvOver - hrvUnder) / hrvUnder) * 100);
          signals.push({
            icon: "😴",
            title: "Pragul tau de somn",
            narrative: `Cand dormi peste 7h, HRV-ul tau e cu ${diff}% mai mare decat sub 6.5h (${roundRo(hrvOver, 0)} vs ${roundRo(hrvUnder, 0)} ms). Somnul e cel mai puternic factor de recuperare.`,
          });
        }
      }
    }
  }

  // 4. Stress Episodes
  if (dailyRecovery.length >= 14) {
    const rhrData = metrics.restingHeartRate || [];
    const rhrMap = new Map(rhrData.map(d => [d.date, d.mean]));
    const hrvMap2 = new Map((metrics.hrv || []).map(d => [d.date, d.mean]));

    const { mean: rhrMean, std: rhrStd } = rhrData.length >= 7 ? meanStd(rhrData.map(d => d.mean)) : { mean: 0, std: 0 };
    const { mean: hrvMean, std: hrvStd } = hrvData && hrvData.length >= 7 ? meanStd(hrvData.map(d => d.mean)) : { mean: 0, std: 0 };

    if (rhrStd > 0 && hrvStd > 0) {
      let episodes = 0;
      let currentEp = 0;
      const epLengths: number[] = [];

      const dates = dailyRecovery.map(d => d.date).sort();
      for (const date of dates) {
        const rhr = rhrMap.get(date);
        const hrv = hrvMap2.get(date);
        const sleep = sleepNights.find(n => n.date === date);
        const sleepLow = sleep ? sleep.totalMinutes < 360 : false;
        const rhrHigh = rhr !== undefined ? rhr > rhrMean + rhrStd : false;
        const hrvLow = hrv !== undefined ? hrv < hrvMean - hrvStd : false;

        const stressSignals = [rhrHigh, hrvLow, sleepLow].filter(Boolean).length;
        if (stressSignals >= 2) {
          currentEp++;
        } else {
          if (currentEp > 0) {
            episodes++;
            epLengths.push(currentEp);
          }
          currentEp = 0;
        }
      }
      if (currentEp > 0) { episodes++; epLengths.push(currentEp); }

      if (episodes >= 1) {
        const avgLen = avg(epLengths);
        signals.push({
          icon: "🧠",
          title: "Episoade de stres",
          narrative: `Ai avut ${episodes} ${episodes === 1 ? "episod" : "episoade"} de stres detectat (convergenta: puls crescut + HRV scazut + somn scurt), durata medie ${roundRo(avgLen, 1)} zile. ${episodes <= 2 ? "Frecventa normala." : "Frecventa crescuta — ia in calcul tehnici de relaxare."}`,
        });
      }
    }
  }

  // 5. Seasonality (6L/1A only)
  if (windowDays >= 180 && hrvData && hrvData.length >= 60) {
    const byMonth: Map<number, number[]> = new Map();
    for (const d of hrvData) {
      const month = new Date(d.date).getMonth();
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month)!.push(d.mean);
    }

    if (byMonth.size >= 4) {
      const monthAvgs = [...byMonth.entries()]
        .map(([m, vals]) => ({ month: m, avg: avg(vals) }))
        .sort((a, b) => b.avg - a.avg);

      const best = monthAvgs[0];
      const worst = monthAvgs[monthAvgs.length - 1];
      const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
      const diffPct = worst.avg > 0 ? Math.round(((best.avg - worst.avg) / worst.avg) * 100) : 0;

      if (diffPct > 5) {
        signals.push({
          icon: "📅",
          title: "Sezonalitate",
          narrative: `HRV-ul tau e cel mai ridicat in ${MONTHS[best.month]} (${roundRo(best.avg, 0)} ms) si cel mai scazut in ${MONTHS[worst.month]} (${roundRo(worst.avg, 0)} ms), o diferenta de ${diffPct}%.`,
        });
      }
    }
  }

  // 6. Aging Trend (1A only)
  if (windowDays >= 360) {
    const trendMetrics: { key: string; label: string; unit: string; better: "up" | "down" }[] = [
      { key: "hrv", label: "HRV", unit: "ms", better: "up" },
      { key: "restingHeartRate", label: "Puls repaus", unit: "bpm", better: "down" },
    ];

    for (const tm of trendMetrics) {
      const data = metrics[tm.key];
      if (!data || data.length < 90) continue;

      const values = data.map(d => d.mean);
      const mk = mannKendall(values);
      if (!mk || !mk.significant) continue;

      // Convert sensSlope (per-observation) to per-year using actual data density
      const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
      const spanDays = (new Date(sorted[sorted.length - 1].date).getTime() - new Date(sorted[0].date).getTime()) / 86400000;
      const obsPerYear = spanDays > 0 ? (data.length / spanDays) * 365 : 365;
      const yearDelta = mk.sensSlope * obsPerYear;
      const improving = tm.better === "up" ? yearDelta > 0 : yearDelta < 0;

      signals.push({
        icon: improving ? "🌱" : "📉",
        title: `Tendinta ${tm.label} pe 1 an`,
        narrative: `${tm.label}-ul tau a ${yearDelta > 0 ? "crescut" : "scazut"} cu ${roundRo(Math.abs(yearDelta), 1)} ${tm.unit} pe an. ${improving ? "Directie excelenta — corpul tau se imbunatateste." : "Directie nefavorabila — merita investigat cauzele."}`,
      });
    }
  }

  return signals.slice(0, 6);
}
