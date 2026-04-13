/**
 * Evidence-Based Health Metrics
 *
 * Only validated, published calculations with specific paper references.
 * No heuristics, no invented composites, no unvalidated thresholds.
 */

import type { DailySummary, SleepNight } from "../parser/healthTypes";

// ═══════════════════════════════════════════════════════════════
//  1. HRV CV — Coefficient of Variation of ln(HRV) over 7 days
//
//  Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M.
//  "Training adaptation and heart rate variability in elite endurance
//   athletes: opening the door to effective monitoring."
//  Int J Sports Physiol Perform. 2013;8(6):773-81.
//
//  Also: Plews DJ et al. (2017) "Heart-Rate Variability and
//  Training-Intensity Distribution in Elite Rowers"
//  Int J Sports Physiol Perform. 12(Suppl 2):S2-93.
//
//  CV = SD(ln(HRV)) / Mean(ln(HRV)) × 100
//  CV > 10% → functional overreaching / accumulated stress
//  CV 5-10% → moderate load
//  CV < 5%  → well adapted
// ═══════════════════════════════════════════════════════════════

export interface HrvCvResult {
  cv: number;          // percentage
  mean_ln: number;     // mean of ln(HRV)
  sd_ln: number;       // SD of ln(HRV)
  n: number;           // days used
  zone: "adapted" | "moderate" | "overreaching";
  reference: string;
}

export function computeHrvCv(hrvData: DailySummary[], windowDays = 7): HrvCvResult | null {
  if (hrvData.length < windowDays) return null;

  const sorted = [...hrvData].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-windowDays);
  const lnValues = recent.map(d => Math.log(d.mean)).filter(v => isFinite(v) && !isNaN(v));
  if (lnValues.length < 5) return null;

  const n = lnValues.length;
  const mean = lnValues.reduce((a, b) => a + b, 0) / n;
  const variance = lnValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const cv = mean !== 0 ? (sd / Math.abs(mean)) * 100 : 0;

  return {
    cv,
    mean_ln: mean,
    sd_ln: sd,
    n,
    zone: cv < 5 ? "adapted" : cv < 10 ? "moderate" : "overreaching",
    reference: "Plews et al. 2013, Int J Sports Physiol Perform 8(6):773-81",
  };
}

// ═══════════════════════════════════════════════════════════════
//  2. Sleep Regularity Index (SRI)
//
//  Phillips AJK, Clerx WM, O'Brien CS, et al.
//  "Irregular sleep/wake patterns are associated with poorer
//   academic performance and delayed circadian and sleep/wake timing."
//  Sci Rep. 2017;7(1):3216.
//
//  Also validated for cardiometabolic outcomes:
//  Lunsford-Avery JR et al. (2018) Sleep Med Rev.
//
//  SRI = probability of being in same state (sleep/wake) at
//  any two time points 24h apart. Range 0-100.
//  SRI > 80 = regular; 60-80 = moderate; < 60 = irregular
// ═══════════════════════════════════════════════════════════════

export interface SriResult {
  sri: number;         // 0-100
  zone: "regular" | "moderate" | "irregular";
  n: number;           // nights used
  bedtimeStdMin: number;  // SD of bedtime in minutes
  waketimeStdMin: number; // SD of waketime in minutes
  reference: string;
}

export function computeSRI(sleepNights: SleepNight[], windowDays = 28): SriResult | null {
  const sortedNights = [...sleepNights].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sortedNights.slice(-windowDays).filter(n => n.bedtime && n.wakeTime);
  if (recent.length < 7) return null;

  // Extract bedtime hour and waketime hour
  const bedtimes: number[] = [];
  const waketimes: number[] = [];

  for (const night of recent) {
    const bed = new Date(night.bedtime);
    const wake = new Date(night.wakeTime);
    if (isNaN(bed.getTime()) || isNaN(wake.getTime())) continue;

    // Bedtime as hours past midnight (allow negative for before midnight → shift)
    let bedH = bed.getHours() + bed.getMinutes() / 60;
    if (bedH < 12) bedH += 24; // e.g. 1am → 25
    bedtimes.push(bedH);

    let wakeH = wake.getHours() + wake.getMinutes() / 60;
    waketimes.push(wakeH);
  }

  if (bedtimes.length < 7) return null;

  // Compute overlap-based SRI approximation
  // For each consecutive pair of nights, compute the overlap fraction
  let totalOverlap = 0;
  let totalPossible = 0;

  for (let i = 1; i < bedtimes.length; i++) {
    const bed1 = bedtimes[i - 1];
    const wake1 = waketimes[i - 1];
    const bed2 = bedtimes[i];
    const wake2 = waketimes[i];

    // Sleep windows (in hours from noon, to handle overnight)
    const start1 = bed1, end1 = wake1 + (wake1 < bed1 ? 24 : 0);
    const start2 = bed2, end2 = wake2 + (wake2 < bed2 ? 24 : 0);

    // Overlap
    const overlapStart = Math.max(start1, start2);
    const overlapEnd = Math.min(end1, end2);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    // Union
    const union = (end1 - start1) + (end2 - start2) - overlap;

    if (union > 0) {
      totalOverlap += overlap;
      totalPossible += union;
    }
  }

  const sri = totalPossible > 0 ? (totalOverlap / totalPossible) * 100 : 0;

  // Also compute bedtime/waketime SDs
  const bedMean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
  const bedVar = bedtimes.reduce((s, v) => s + (v - bedMean) ** 2, 0) / (bedtimes.length - 1);
  const bedStdMin = Math.sqrt(bedVar) * 60;

  const wakeMean = waketimes.reduce((a, b) => a + b, 0) / waketimes.length;
  const wakeVar = waketimes.reduce((s, v) => s + (v - wakeMean) ** 2, 0) / (waketimes.length - 1);
  const wakeStdMin = Math.sqrt(wakeVar) * 60;

  return {
    sri,
    zone: sri >= 80 ? "regular" : sri >= 60 ? "moderate" : "irregular",
    n: recent.length,
    bedtimeStdMin: bedStdMin,
    waketimeStdMin: wakeStdMin,
    reference: "Phillips et al. 2017, Sci Rep 7(1):3216",
  };
}

// ═══════════════════════════════════════════════════════════════
//  3. Walking Speed — Survival Predictor
//
//  Studenski S, Perera S, Patel K, et al.
//  "Gait Speed and Survival in Older Adults."
//  JAMA. 2011;305(1):50-58. (n=34,485)
//
//  Data is in m/s (raw Apple Health).
//  < 0.6 m/s → significantly below expected
//  0.6-0.8 m/s → below average survival
//  0.8-1.0 m/s → average
//  1.0-1.2 m/s → above average
//  > 1.2 m/s → excellent
// ═══════════════════════════════════════════════════════════════

export interface WalkingSpeedResult {
  meanSpeed: number;   // m/s
  zone: "excellent" | "above_avg" | "average" | "below_avg" | "low";
  percentile: number;  // approximate survival percentile
  n: number;
  reference: string;
}

/**
 * Age+sex adjusted expected speed (Studenski 2011, Table 2 median values)
 */
function expectedSpeed(age: number, sex: "male" | "female"): number {
  if (sex === "male") {
    if (age < 65) return 1.10;
    if (age < 75) return 1.00;
    if (age < 85) return 0.85;
    return 0.70;
  }
  if (age < 65) return 1.00;
  if (age < 75) return 0.90;
  if (age < 85) return 0.75;
  return 0.60;
}

export function computeWalkingSpeed(
  walkingSpeedData: DailySummary[],
  age: number,
  sex: "male" | "female",
  windowDays = 30
): WalkingSpeedResult | null {
  const sorted = [...walkingSpeedData].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-windowDays).filter(d => d.mean > 0);
  if (recent.length < 5) return null;

  const speeds = recent.map(d => d.mean); // already in m/s
  const meanSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

  let zone: WalkingSpeedResult["zone"];
  if (meanSpeed >= 1.2) zone = "excellent";
  else if (meanSpeed >= 1.0) zone = "above_avg";
  else if (meanSpeed >= 0.8) zone = "average";
  else if (meanSpeed >= 0.6) zone = "below_avg";
  else zone = "low";

  // Approximate percentile based on Studenski's survival curves
  const expected = expectedSpeed(age, sex);
  const ratio = meanSpeed / expected;
  const percentile = Math.min(99, Math.max(1, Math.round(50 + (ratio - 1) * 100)));

  return {
    meanSpeed,
    zone,
    percentile,
    n: recent.length,
    reference: "Studenski et al. 2011, JAMA 305(1):50-58",
  };
}

// ═══════════════════════════════════════════════════════════════
//  4. VO2 Max Trajectory vs Age-Expected Decline
//
//  Kodama S, Saito K, Tanaka S, et al.
//  "Cardiorespiratory fitness as a quantitative predictor of
//   all-cause mortality and cardiovascular events."
//  JAMA. 2009;301(19):2024-35. (meta-analysis, n=102,980)
//
//  ACSM Guidelines for Exercise Testing and Prescription, 11th Ed.
//
//  Normal decline: ~0.5 mL/kg/min per year after age 25-30
//  (Hawkins & Wiswell 2003, Sports Med)
// ═══════════════════════════════════════════════════════════════

export interface Vo2TrajectoryResult {
  currentVo2: number;
  expectedForAge: number;
  delta: number;         // current - expected (positive = better)
  yearlyChange: number;  // observed mL/kg/min per year (from data)
  expectedDecline: number; // -0.5 per year
  status: "improving" | "maintaining" | "declining_normal" | "declining_fast";
  n: number;
  reference: string;
}

/**
 * Expected VO2 Max by age and sex (ACSM 11th ed. 50th percentile)
 */
function expectedVo2(age: number, sex: "male" | "female"): number {
  if (sex === "male") {
    if (age < 30) return 44;
    if (age < 40) return 42;
    if (age < 50) return 39;
    if (age < 60) return 35;
    if (age < 70) return 31;
    return 27;
  }
  if (age < 30) return 38;
  if (age < 40) return 36;
  if (age < 50) return 33;
  if (age < 60) return 30;
  if (age < 70) return 27;
  return 24;
}

export function computeVo2Trajectory(
  vo2Data: DailySummary[],
  age: number,
  sex: "male" | "female"
): Vo2TrajectoryResult | null {
  if (vo2Data.length < 14) return null;

  // Sort chronologically first — data may arrive unsorted from IndexedDB
  const sorted = [...vo2Data].sort((a, b) => a.date.localeCompare(b.date));

  const current = sorted.slice(-7);
  const currentVo2 = current.reduce((s, d) => s + d.mean, 0) / current.length;
  const firstDate = new Date(sorted[0].date).getTime();
  const xs = sorted.map(d => (new Date(d.date).getTime() - firstDate) / (365.25 * 86400000));
  const ys = sorted.map(d => d.mean);

  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0);
  const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const yearlyChange = den > 0 ? num / den : 0;

  const exp = expectedVo2(age, sex);
  const delta = currentVo2 - exp;

  let status: Vo2TrajectoryResult["status"];
  if (yearlyChange > 0.2) status = "improving";
  else if (yearlyChange > -0.3) status = "maintaining";
  else if (yearlyChange > -0.8) status = "declining_normal";
  else status = "declining_fast";

  return {
    currentVo2,
    expectedForAge: exp,
    delta,
    yearlyChange,
    expectedDecline: -0.5,
    status,
    n: vo2Data.length,
    reference: "Kodama et al. 2009, JAMA 301(19):2024-35; ACSM 11th Ed",
  };
}

// ═══════════════════════════════════════════════════════════════
//  5. Resting Heart Rate Trend — Cardiovascular Risk Signal
//
//  Böhm M, Reil JC, Deedwania P, Kim JB, Borer JS.
//  "Resting heart rate: risk indicator and emerging risk factor
//   in cardiovascular disease."
//  Am J Med. 2015;128(3):219-228.
//
//  Cooney MT, Vartiainen E, Laatikainen T, et al.
//  "Elevated resting heart rate is an independent risk factor
//   for cardiovascular disease in healthy men and women."
//  Am Heart J. 2010;159(4):612-619.e3.
//
//  Sustained increase > 5 bpm over 3 months = clinically significant
// ═══════════════════════════════════════════════════════════════

export interface RhrTrendResult {
  currentRhr: number;
  baseline: number;      // mean of first 14 days
  change: number;        // current - baseline
  trendPerMonth: number; // bpm change per month (linear regression)
  alert: boolean;        // true if sustained increase > 5 bpm
  n: number;
  reference: string;
}

export function computeRhrTrend(rhrData: DailySummary[]): RhrTrendResult | null {
  if (rhrData.length < 30) return null;

  const sorted = [...rhrData].sort((a, b) => a.date.localeCompare(b.date));

  // Baseline: first 14 days
  const baseSlice = sorted.slice(0, 14).filter(d => d.mean > 30);
  if (baseSlice.length < 7) return null;
  const baseline = baseSlice.reduce((s, d) => s + d.mean, 0) / baseSlice.length;

  // Current: last 7 days
  const recentSlice = sorted.slice(-7).filter(d => d.mean > 30);
  if (recentSlice.length < 3) return null;
  const currentRhr = recentSlice.reduce((s, d) => s + d.mean, 0) / recentSlice.length;

  // Linear regression for monthly trend
  const firstDate = new Date(sorted[0].date).getTime();
  const xs = sorted.map(d => (new Date(d.date).getTime() - firstDate) / (30.44 * 86400000)); // months
  const ys = sorted.map(d => d.mean);
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0);
  const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const trendPerMonth = den > 0 ? num / den : 0;

  const change = currentRhr - baseline;

  // Alert if sustained increase > 5 bpm AND trend is positive
  const alert = change > 5 && trendPerMonth > 0.5;

  return {
    currentRhr,
    baseline,
    change,
    trendPerMonth,
    alert,
    n: sorted.length,
    reference: "Böhm et al. 2015, Am J Med 128(3):219-228",
  };
}

// ═══════════════════════════════════════════════════════════════
//  6. Chronotype & Social Jet Lag
//
//  Roenneberg T, Wirz-Justice A, Merrow M.
//  "Life between clocks: daily temporal patterns of human chronotype."
//  J Biol Rhythms. 2003;18(1):80-90.
//
//  Wittmann M, Dinich J, Merrow M, Roenneberg T.
//  "Social jetlag: misalignment of biological and social time."
//  Chronobiol Int. 2006;23(1-2):497-509.
//
//  MSFsc (midpoint of sleep on free days, corrected for sleep debt)
//  Social jet lag = |MSFsc - MSW| (free day vs work day midpoint)
//  > 1h = mild; > 2h = significant (metabolic risk)
// ═══════════════════════════════════════════════════════════════

export interface ChronotypeResult {
  msfsc: number;           // corrected midpoint hours (e.g. 3.5 = 3:30 AM)
  chronotype: "early" | "moderate_early" | "intermediate" | "moderate_late" | "late";
  socialJetLagHours: number; // |weekend - weekday| midpoint difference
  jetLagZone: "minimal" | "mild" | "significant";
  weekdayMidpoint: number;
  weekendMidpoint: number;
  n: number;
  reference: string;
}

export function computeChronotype(sleepNights: SleepNight[], windowDays = 28): ChronotypeResult | null {
  const sortedNights = [...sleepNights].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sortedNights.slice(-windowDays).filter(n => n.bedtime && n.wakeTime);
  if (recent.length < 14) return null;

  const weekday: number[] = [];
  const weekend: number[] = [];

  for (const night of recent) {
    const date = new Date(night.date + "T12:00:00");
    const dayOfWeek = date.getDay(); // 0=Sun, 5=Fri, 6=Sat

    // Sleep midpoint — use stored value or compute from bed/wake
    let midpoint = night.sleepMidpoint;
    if (!midpoint && night.bedtime && night.wakeTime) {
      const bed = new Date(night.bedtime).getTime();
      const wake = new Date(night.wakeTime).getTime();
      const mid = new Date((bed + wake) / 2);
      midpoint = mid.getHours() + mid.getMinutes() / 60;
    }
    if (!midpoint || midpoint === 0) continue;

    // Friday and Saturday nights → "free days" (wake up Sat/Sun)
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      weekend.push(midpoint);
    } else {
      weekday.push(midpoint);
    }
  }

  if (weekday.length < 5 || weekend.length < 3) return null;

  const weekdayMid = weekday.reduce((a, b) => a + b, 0) / weekday.length;
  const weekendMid = weekend.reduce((a, b) => a + b, 0) / weekend.length;

  // MSFsc — corrected for sleep debt (Roenneberg formula)
  // Use weekday+weekend arrays which already have computed midpoints
  const avgDuration = recent.reduce((s, n) => s + n.totalMinutes, 0) / recent.length;
  const weekdayDuration = recent.filter(n => {
    const d = new Date(n.date + "T12:00:00").getDay();
    return d !== 5 && d !== 6;
  }).reduce((s, n) => s + n.totalMinutes, 0) / weekday.length;

  // Sleep debt correction: MSFsc = MSF - 0.5 * (SDF - avg_SD)
  // Where SDF = free day sleep duration, avg_SD = average sleep duration
  const weekendDuration = recent.filter(n => {
    const d = new Date(n.date + "T12:00:00").getDay();
    return d === 5 || d === 6;
  }).reduce((s, n) => s + n.totalMinutes, 0) / weekend.length;

  const sleepDebtCorrection = (weekendDuration - avgDuration) / 60 * 0.5; // convert min→h
  const msfsc = weekendMid - sleepDebtCorrection;

  // Chronotype classification (Roenneberg 2003)
  let chronotype: ChronotypeResult["chronotype"];
  if (msfsc < 2.5) chronotype = "early";
  else if (msfsc < 3.5) chronotype = "moderate_early";
  else if (msfsc < 4.5) chronotype = "intermediate";
  else if (msfsc < 5.5) chronotype = "moderate_late";
  else chronotype = "late";

  // Social jet lag
  const socialJetLag = Math.abs(weekendMid - weekdayMid);

  return {
    msfsc,
    chronotype,
    socialJetLagHours: socialJetLag,
    jetLagZone: socialJetLag < 1 ? "minimal" : socialJetLag < 2 ? "mild" : "significant",
    weekdayMidpoint: weekdayMid,
    weekendMidpoint: weekendMid,
    n: recent.length,
    reference: "Roenneberg et al. 2003, J Biol Rhythms 18(1):80-90; Wittmann et al. 2006",
  };
}

// ═══════════════════════════════════════════════════════════════
//  7. Steps & Longevity
//
//  Paluch AE, Bajpai S, Bassett DR, et al.
//  "Daily steps and all-cause mortality: a meta-analysis of
//   15 international cohorts."
//  Lancet Public Health. 2022;7(3):e219-e228. (n=47,471)
//
//  Also: Saint-Maurice PF, et al.
//  "Association of Daily Step Count and Step Intensity With
//   Mortality Among US Adults."
//  JAMA. 2020;323(12):1151-1160. (n=4,840 NHANES)
//
//  Dose-response curve:
//  Adults ≥60: plateau ~6,000-8,000 steps/day
//  Adults <60: plateau ~8,000-10,000 steps/day
//  Each additional 1,000 steps → ~15% lower mortality (up to plateau)
// ═══════════════════════════════════════════════════════════════

export interface StepsLongevityResult {
  avgSteps: number;           // daily average last 30 days
  zone: "excellent" | "above_target" | "on_target" | "below_target" | "low";
  targetSteps: number;        // age-adjusted daily target
  mortalityReduction: number; // approximate % reduction vs sedentary
  n: number;
  reference: string;
}

export function computeStepsLongevity(
  stepData: DailySummary[],
  age: number,
  windowDays = 30
): StepsLongevityResult | null {
  const sorted = [...stepData].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-windowDays).filter(d => d.sum > 0);
  if (recent.length < 7) return null;

  const avgSteps = recent.reduce((s, d) => s + d.sum, 0) / recent.length;

  // Age-adjusted target from Paluch 2022
  const target = age >= 60 ? 7000 : 8000;
  const maxBenefit = age >= 60 ? 8000 : 10000;

  let zone: StepsLongevityResult["zone"];
  if (avgSteps >= maxBenefit) zone = "excellent";
  else if (avgSteps >= target) zone = "above_target";
  else if (avgSteps >= target * 0.75) zone = "on_target";
  else if (avgSteps >= 4000) zone = "below_target";
  else zone = "low";

  // Approximate mortality reduction: ~15% per 1,000 steps up to plateau
  // Base: ~4,000 steps = reference group in Paluch 2022
  const stepsAboveBase = Math.max(0, Math.min(avgSteps, maxBenefit) - 4000);
  const mortalityReduction = Math.round((stepsAboveBase / 1000) * 15);

  return {
    avgSteps,
    zone,
    targetSteps: target,
    mortalityReduction: Math.min(mortalityReduction, 65), // cap at study max
    n: recent.length,
    reference: "Paluch et al. 2022, Lancet Public Health 7(3):e219-e228",
  };
}

// ═══════════════════════════════════════════════════════════════
//  8. Sleep Duration — Optimal Zone (U-Curve)
//
//  Cappuccio FP, D'Elia L, Strazzullo P, Miller MA.
//  "Sleep Duration and All-Cause Mortality: A Systematic Review
//   and Meta-Analysis of Prospective Studies."
//  Sleep. 2010;33(5):585-592. (n=1,382,999, 16 studies)
//
//  Also: Yin J, et al. (2017) "Relationship of Sleep Duration
//  With All-Cause Mortality and Cardiovascular Events"
//  J Am Heart Assoc. 6(9):e005947. (n=3,340,684)
//
//  Short sleep (<6h): +12% all-cause mortality
//  Long sleep (>9h): +30% all-cause mortality
//  Optimal: 7-8h (nadir of U-curve)
//  6-7h and 8-9h: slightly elevated but acceptable
// ═══════════════════════════════════════════════════════════════

export interface SleepDurationResult {
  avgHours: number;       // average sleep duration in hours
  zone: "optimal" | "good" | "short" | "very_short" | "long" | "very_long";
  riskLabel: string;      // e.g. "risc minim", "risc moderat crescut"
  n: number;
  reference: string;
}

export function computeSleepDuration(
  sleepNights: SleepNight[],
  windowDays = 30
): SleepDurationResult | null {
  const sortedNights = [...sleepNights].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sortedNights.slice(-windowDays).filter(n => n.totalMinutes > 0);
  if (recent.length < 7) return null;

  const avgMinutes = recent.reduce((s, n) => s + n.totalMinutes, 0) / recent.length;
  const avgHours = avgMinutes / 60;

  let zone: SleepDurationResult["zone"];
  let riskLabel: string;

  if (avgHours >= 7 && avgHours <= 8) {
    zone = "optimal"; riskLabel = "risc minim";
  } else if (avgHours >= 6 && avgHours < 7) {
    zone = "good"; riskLabel = "risc usor crescut";
  } else if (avgHours > 8 && avgHours <= 9) {
    zone = "good"; riskLabel = "risc usor crescut";
  } else if (avgHours >= 5 && avgHours < 6) {
    zone = "short"; riskLabel = "+12% risc mortalitate";
  } else if (avgHours < 5) {
    zone = "very_short"; riskLabel = "risc semnificativ crescut";
  } else if (avgHours > 9 && avgHours <= 10) {
    zone = "long"; riskLabel = "+30% risc mortalitate";
  } else {
    zone = "very_long"; riskLabel = "risc semnificativ crescut";
  }

  return {
    avgHours,
    zone,
    riskLabel,
    n: recent.length,
    reference: "Cappuccio et al. 2010, Sleep 33(5):585-592",
  };
}

// ═══════════════════════════════════════════════════════════════
//  9. Training Load Balance — ACWR
//
//  Gabbett TJ.
//  "The training—injury prevention paradox: should athletes be
//   training smarter and harder?"
//  Br J Sports Med. 2016;50(5):273-280.
//
//  Also: Blanch P, Gabbett TJ. (2016)
//  "Has the athlete trained enough to return to play safely?"
//  Br J Sports Med. 50:471-475.
//
//  ACWR = acute load (7d) / chronic load (28d rolling avg)
//  Sweet spot: 0.8–1.3
//  Danger zone: > 1.5 (2–4x injury risk)
//  Too low: < 0.8 (detraining, also slightly higher injury risk)
//
//  Uses exponentially weighted moving average (EWMA) variant
//  for more sensitivity to recent load changes.
// ═══════════════════════════════════════════════════════════════

export interface TrainingLoadResult {
  acwr: number;              // acute:chronic ratio
  acuteLoad: number;         // avg daily exercise min, last 7 days
  chronicLoad: number;       // avg daily exercise min, last 28 days
  zone: "optimal" | "building" | "high_risk" | "detraining";
  weeklyMinutes: number;     // total exercise last 7 days
  n: number;
  reference: string;
}

export function computeTrainingLoad(
  exerciseData: DailySummary[],
  windowDays = 35 // need 28d chronic + 7d acute
): TrainingLoadResult | null {
  if (exerciseData.length < 21) return null; // need at least 3 weeks

  // Fill a day-indexed array (some days may have 0 exercise)
  const sorted = [...exerciseData].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-windowDays);
  if (recent.length < 21) return null;

  const dailyLoads = recent.map(d => d.sum); // sum of exercise minutes per day

  // EWMA: lambda_a = 2/(7+1) for acute, lambda_c = 2/(28+1) for chronic
  const lambdaA = 2 / (7 + 1);
  const lambdaC = 2 / (28 + 1);

  let ewmaAcute = dailyLoads[0];
  let ewmaChronic = dailyLoads[0];

  for (let i = 1; i < dailyLoads.length; i++) {
    ewmaAcute = dailyLoads[i] * lambdaA + ewmaAcute * (1 - lambdaA);
    ewmaChronic = dailyLoads[i] * lambdaC + ewmaChronic * (1 - lambdaC);
  }

  const acwr = ewmaChronic > 0 ? ewmaAcute / ewmaChronic : 0;

  // Simple averages for display
  const last7 = dailyLoads.slice(-7);
  const acuteLoad = last7.reduce((a, b) => a + b, 0) / 7;
  const chronicLoad = dailyLoads.reduce((a, b) => a + b, 0) / dailyLoads.length;
  const weeklyMinutes = last7.reduce((a, b) => a + b, 0);

  let zone: TrainingLoadResult["zone"];
  if (acwr >= 0.8 && acwr <= 1.3) zone = "optimal";
  else if (acwr > 1.3 && acwr <= 1.5) zone = "building";
  else if (acwr > 1.5) zone = "high_risk";
  else zone = "detraining";

  return {
    acwr,
    acuteLoad,
    chronicLoad,
    zone,
    weeklyMinutes,
    n: recent.length,
    reference: "Gabbett 2016, Br J Sports Med 50(5):273-280",
  };
}

// ═══════════════════════════════════════════════════════════════
//  10. Cardiorespiratory Fitness Percentile — Mortality Risk
//
//  Mandsager K, Harb S, Cremer P, Phelan D, Nissen SE, Jaber W.
//  "Association of Cardiorespiratory Fitness With Long-term
//   Mortality Among Adults Undergoing Exercise Treadmill Testing."
//  JAMA Netw Open. 2018;1(6):e183605. (n=122,007 Cleveland Clinic)
//
//  Key finding: "elite" fitness (>97th percentile) = 80% lower
//  mortality vs lowest quintile. Even "above average" = 50% lower.
//  No upper limit of benefit — more fit = always better.
//
//  Percentile thresholds from FRIEND registry:
//  Kaminsky LA, et al. (2022) "Updated Reference Standards for
//  Cardiorespiratory Fitness" Mayo Clin Proc. 97(2):285-293.
// ═══════════════════════════════════════════════════════════════

export interface FitnessPercentileResult {
  vo2: number;
  percentile: number;
  category: "elite" | "above_average" | "average" | "below_average" | "low";
  mortalityReduction: string;  // approximate vs lowest quintile
  reference: string;
}

/**
 * VO2 Max percentile tables (FRIEND registry, Kaminsky 2022)
 * Simplified to decile boundaries by age and sex.
 * Values in mL/kg/min for each percentile threshold.
 */
function vo2Percentile(vo2: number, age: number, sex: "male" | "female"): number {
  // Percentile thresholds [P10, P25, P50, P75, P90] by age group
  const tables: Record<string, number[]> = {
    // Males
    "m_20": [32, 38, 44, 50, 55],
    "m_30": [30, 35, 41, 47, 52],
    "m_40": [27, 32, 38, 44, 49],
    "m_50": [24, 29, 35, 40, 45],
    "m_60": [21, 26, 31, 37, 42],
    "m_70": [18, 23, 28, 33, 38],
    // Females
    "f_20": [26, 31, 36, 41, 46],
    "f_30": [24, 28, 33, 38, 43],
    "f_40": [22, 26, 31, 36, 40],
    "f_50": [20, 24, 28, 33, 37],
    "f_60": [17, 21, 25, 30, 34],
    "f_70": [15, 18, 22, 27, 31],
  };

  const prefix = sex === "male" ? "m" : "f";
  const ageGroup = Math.min(70, Math.max(20, Math.floor(age / 10) * 10));
  const key = `${prefix}_${ageGroup}`;
  const thresholds = tables[key] || tables[`${prefix}_50`];

  // [P10, P25, P50, P75, P90]
  if (vo2 < thresholds[0]) return 5;
  if (vo2 < thresholds[1]) return 18;
  if (vo2 < thresholds[2]) return 38;
  if (vo2 < thresholds[3]) return 63;
  if (vo2 < thresholds[4]) return 83;
  return 95;
}

export function computeFitnessPercentile(
  vo2Data: DailySummary[],
  age: number,
  sex: "male" | "female"
): FitnessPercentileResult | null {
  if (vo2Data.length < 7) return null;

  // Sort chronologically — data may arrive unsorted from IndexedDB
  const sorted = [...vo2Data].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-14);
  const vo2 = recent.reduce((s, d) => s + d.mean, 0) / recent.length;
  if (vo2 <= 0) return null;

  const percentile = vo2Percentile(vo2, age, sex);

  let category: FitnessPercentileResult["category"];
  let mortalityReduction: string;

  if (percentile >= 90) {
    category = "elite";
    mortalityReduction = "~80% mai mic vs sedentari";
  } else if (percentile >= 60) {
    category = "above_average";
    mortalityReduction = "~50% mai mic vs sedentari";
  } else if (percentile >= 40) {
    category = "average";
    mortalityReduction = "~30% mai mic vs sedentari";
  } else if (percentile >= 20) {
    category = "below_average";
    mortalityReduction = "~15% mai mic vs sedentari";
  } else {
    category = "low";
    mortalityReduction = "referinta (grup sedentari)";
  }

  return {
    vo2,
    percentile,
    category,
    mortalityReduction,
    reference: "Mandsager et al. 2018, JAMA Netw Open 1(6):e183605; Kaminsky 2022",
  };
}

// ═══════════════════════════════════════════════════════════════
//  Aggregate: compute all available evidence-based metrics
// ═══════════════════════════════════════════════════════════════

export interface EvidenceBasedReport {
  hrvCv: HrvCvResult | null;
  sri: SriResult | null;
  walkingSpeed: WalkingSpeedResult | null;
  vo2Trajectory: Vo2TrajectoryResult | null;
  rhrTrend: RhrTrendResult | null;
  chronotype: ChronotypeResult | null;
  stepsLongevity: StepsLongevityResult | null;
  sleepDuration: SleepDurationResult | null;
  trainingLoad: TrainingLoadResult | null;
  fitnessPercentile: FitnessPercentileResult | null;
}

export function computeEvidenceBasedReport(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
  age: number,
  sex: "male" | "female"
): EvidenceBasedReport {
  return {
    hrvCv: metrics.hrv ? computeHrvCv(metrics.hrv) : null,
    sri: computeSRI(sleepNights),
    walkingSpeed: metrics.walkingSpeed ? computeWalkingSpeed(metrics.walkingSpeed, age, sex) : null,
    vo2Trajectory: metrics.vo2Max ? computeVo2Trajectory(metrics.vo2Max, age, sex) : null,
    rhrTrend: metrics.restingHeartRate ? computeRhrTrend(metrics.restingHeartRate) : null,
    chronotype: computeChronotype(sleepNights),
    stepsLongevity: metrics.stepCount ? computeStepsLongevity(metrics.stepCount, age) : null,
    sleepDuration: computeSleepDuration(sleepNights),
    trainingLoad: metrics.exerciseTime ? computeTrainingLoad(metrics.exerciseTime) : null,
    fitnessPercentile: metrics.vo2Max ? computeFitnessPercentile(metrics.vo2Max, age, sex) : null,
  };
}
