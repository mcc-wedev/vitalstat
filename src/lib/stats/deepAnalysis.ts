/**
 * Deep Cross-Metric Analysis
 *
 * Advanced insights that combine multiple health signals.
 * Each analysis uses validated physiological relationships.
 */

import type { DailySummary, SleepNight } from "../parser/healthTypes";

// ═══════════════════════════════════════════════════════════════
//  Utility: align two metric arrays by date
// ═══════════════════════════════════════════════════════════════

interface DayPair { date: string; a: number; b: number }

function alignByDate(
  dataA: DailySummary[],
  dataB: DailySummary[],
  field: "mean" | "sum" = "mean"
): DayPair[] {
  const mapB = new Map(dataB.map(d => [d.date, field === "sum" ? d.sum : d.mean]));
  return dataA
    .filter(d => mapB.has(d.date))
    .map(d => ({ date: d.date, a: field === "sum" ? d.sum : d.mean, b: mapB.get(d.date)! }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

function alignMetricWithSleep(
  data: DailySummary[],
  sleep: SleepNight[],
  sleepField: (n: SleepNight) => number
): { date: string; metric: number; sleep: number }[] {
  const sleepMap = new Map(sleep.map(n => [n.date, sleepField(n)]));
  return data
    .filter(d => sleepMap.has(d.date) && sleepMap.get(d.date)! > 0)
    .map(d => ({ date: d.date, metric: d.mean, sleep: sleepMap.get(d.date)! }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 7) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den > 0 ? num / den : 0;
}

function movingAvg(values: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
//  1. Autonomic Balance — HRV vs RHR Cross-Correlation
//
//  Buchheit M. "Monitoring training status with HR measures:
//  do all roads lead to Rome?" Front Physiol. 2014;5:73.
//
//  When HRV↓ AND RHR↑ simultaneously = sympathetic overdrive
//  When HRV↑ AND RHR↓ = parasympathetic recovery dominance
//  Divergence (one moves, other doesn't) = mixed signal
// ═══════════════════════════════════════════════════════════════

export interface AutonomicBalanceResult {
  correlation: number;        // Pearson r between HRV and RHR (expected negative)
  status: "balanced" | "sympathetic" | "parasympathetic" | "divergent";
  hrvTrend7d: number;         // 7-day HRV trend (positive = improving)
  rhrTrend7d: number;         // 7-day RHR trend (positive = worsening)
  description: string;
  n: number;
}

export function analyzeAutonomicBalance(
  hrvData: DailySummary[],
  rhrData: DailySummary[]
): AutonomicBalanceResult | null {
  const pairs = alignByDate(hrvData, rhrData);
  if (pairs.length < 14) return null;

  const recent = pairs.slice(-30);
  const r = pearsonR(recent.map(p => p.a), recent.map(p => p.b));

  // 7-day trends
  const last7 = recent.slice(-7);
  const prev7 = recent.slice(-14, -7);
  if (last7.length < 5 || prev7.length < 5) return null;

  const hrvNow = last7.reduce((s, p) => s + p.a, 0) / last7.length;
  const hrvPrev = prev7.reduce((s, p) => s + p.a, 0) / prev7.length;
  const rhrNow = last7.reduce((s, p) => s + p.b, 0) / last7.length;
  const rhrPrev = prev7.reduce((s, p) => s + p.b, 0) / prev7.length;

  const hrvTrend = hrvNow - hrvPrev;
  const rhrTrend = rhrNow - rhrPrev;

  let status: AutonomicBalanceResult["status"];
  let description: string;

  if (hrvTrend > 2 && rhrTrend < -1) {
    status = "parasympathetic";
    description = "Sistemul nervos parasimpatic (recuperare) e dominant. HRV creste si pulsul scade — corpul se recupereaza activ. Cel mai bun moment pentru antrenament intens.";
  } else if (hrvTrend < -2 && rhrTrend > 1) {
    status = "sympathetic";
    description = "Sistemul nervos simpatic (stres) e dominant. HRV scade si pulsul creste — semn de stres acumulat, oboseala sau boala la inceput. Corpul cere odihna.";
  } else if (Math.abs(hrvTrend) < 2 && Math.abs(rhrTrend) < 1) {
    status = "balanced";
    description = "Echilibru autonom stabil. HRV si pulsul sunt constante — corpul e intr-o stare de echilibru. Poti continua ritmul actual.";
  } else {
    status = "divergent";
    description = "Semnale mixte — unul din indicatori se misca fara celalalt. Poate fi tranzitie intre faze de stres si recuperare, sau reactie la schimbari recente (somn, alcool, boala).";
  }

  return {
    correlation: r,
    status,
    hrvTrend7d: hrvTrend,
    rhrTrend7d: rhrTrend,
    description,
    n: recent.length,
  };
}

// ═══════════════════════════════════════════════════════════════
//  2. Readiness Score — Multi-Signal Composite
//
//  Combines deviation from personal baseline across:
//  - HRV (most important — 40% weight)
//  - RHR (25% weight)
//  - Sleep quality (20% weight)
//  - SpO2 (15% weight)
//
//  Based on the principle from Plews et al. (2013) that
//  individual baseline deviation is more meaningful than
//  absolute values.
// ═══════════════════════════════════════════════════════════════

export interface ReadinessResult {
  score: number;              // 0-100
  zone: "primed" | "good" | "moderate" | "low" | "depleted";
  components: {
    hrv: { value: number; baseline: number; score: number };
    rhr: { value: number; baseline: number; score: number };
    sleep: { value: number; baseline: number; score: number };
    spo2?: { value: number; baseline: number; score: number };
  };
  description: string;
}

function baselineAndCurrent(data: DailySummary[], field: "mean" | "sum" = "mean"): { baseline: number; current: number } | null {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 14) return null;
  const vals = sorted.map(d => field === "sum" ? d.sum : d.mean).filter(v => v > 0);
  if (vals.length < 14) return null;
  const baseline = vals.slice(0, -7).reduce((a, b) => a + b, 0) / (vals.length - 7);
  const current = vals.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, vals.slice(-7).length);
  return { baseline, current };
}

export function computeReadiness(
  hrvData: DailySummary[],
  rhrData: DailySummary[],
  sleepNights: SleepNight[],
  spo2Data?: DailySummary[]
): ReadinessResult | null {
  const hrv = baselineAndCurrent(hrvData);
  const rhr = baselineAndCurrent(rhrData);
  if (!hrv || !rhr) return null;

  // HRV score: higher = better. Score based on % above/below baseline
  const hrvPct = hrv.baseline > 0 ? (hrv.current - hrv.baseline) / hrv.baseline : 0;
  const hrvScore = Math.max(0, Math.min(100, 50 + hrvPct * 200)); // ±25% = 0-100

  // RHR score: lower = better. Inverted.
  const rhrPct = rhr.baseline > 0 ? (rhr.current - rhr.baseline) / rhr.baseline : 0;
  const rhrScore = Math.max(0, Math.min(100, 50 - rhrPct * 200));

  // Sleep score: based on last 7 nights efficiency and duration
  const sortedSleep = [...sleepNights].sort((a, b) => a.date.localeCompare(b.date));
  const recentSleep = sortedSleep.slice(-7).filter(n => n.totalMinutes > 0);
  const sleepBaseline = sortedSleep.slice(0, -7).filter(n => n.totalMinutes > 0);

  let sleepScore = 50;
  let sleepCurrent = 0, sleepBase = 0;
  if (recentSleep.length >= 3 && sleepBaseline.length >= 7) {
    sleepCurrent = recentSleep.reduce((s, n) => s + n.totalMinutes, 0) / recentSleep.length;
    sleepBase = sleepBaseline.reduce((s, n) => s + n.totalMinutes, 0) / sleepBaseline.length;
    const sleepPct = sleepBase > 0 ? (sleepCurrent - sleepBase) / sleepBase : 0;
    // Also factor in efficiency
    const effNow = recentSleep.reduce((s, n) => s + n.efficiency, 0) / recentSleep.length;
    const effBonus = effNow > 0.85 ? 10 : effNow > 0.75 ? 0 : -10;
    sleepScore = Math.max(0, Math.min(100, 50 + sleepPct * 150 + effBonus));
  }

  // SpO2 score (optional)
  let spo2Score: number | undefined;
  let spo2Current = 0, spo2Base = 0;
  if (spo2Data) {
    const spo2 = baselineAndCurrent(spo2Data);
    if (spo2) {
      spo2Current = spo2.current;
      spo2Base = spo2.baseline;
      // SpO2 above 95% (0.95) = good. Below 93% = concerning.
      const val = spo2.current <= 1 ? spo2.current * 100 : spo2.current;
      spo2Score = val >= 97 ? 95 : val >= 95 ? 75 : val >= 93 ? 40 : 15;
    }
  }

  // Weighted composite
  const weights = spo2Score !== undefined
    ? { hrv: 0.40, rhr: 0.25, sleep: 0.20, spo2: 0.15 }
    : { hrv: 0.45, rhr: 0.30, sleep: 0.25, spo2: 0 };

  const score = Math.round(
    hrvScore * weights.hrv +
    rhrScore * weights.rhr +
    sleepScore * weights.sleep +
    (spo2Score || 0) * weights.spo2
  );

  let zone: ReadinessResult["zone"];
  let description: string;
  if (score >= 80) {
    zone = "primed";
    description = "Corpul e la varf — toate semnalele arata recuperare completa. Zi ideala pentru efort maxim sau competitie.";
  } else if (score >= 65) {
    zone = "good";
    description = "Recuperare buna. Poti antrena normal, corpul raspunde bine la stimuli.";
  } else if (score >= 45) {
    zone = "moderate";
    description = "Recuperare partiala. Antrenament usor e OK, dar evita efortul maximal — corpul inca proceseaza stresul acumulat.";
  } else if (score >= 25) {
    zone = "low";
    description = "Semnale de oboseala pe mai multi indicatori. Prioritizeaza odihna, hidratarea si somnul de calitate.";
  } else {
    zone = "depleted";
    description = "Nivel scazut pe toate fronturile. Corpul are nevoie urgenta de recuperare — posibil boala, stres sever sau deficit de somn acumulat.";
  }

  return {
    score,
    zone,
    components: {
      hrv: { value: hrv.current, baseline: hrv.baseline, score: Math.round(hrvScore) },
      rhr: { value: rhr.current, baseline: rhr.baseline, score: Math.round(rhrScore) },
      sleep: { value: sleepCurrent, baseline: sleepBase, score: Math.round(sleepScore) },
      ...(spo2Score !== undefined ? {
        spo2: { value: spo2Current, baseline: spo2Base, score: Math.round(spo2Score) },
      } : {}),
    },
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
//  3. Overtraining Detector
//
//  Meeusen R, Duclos M, Foster C, et al. "Prevention,
//  diagnosis, and treatment of the overtraining syndrome."
//  Med Sci Sports Exerc. 2013;45(1):186-205. (ECSS/ACSM)
//
//  Signal: exercise volume rising + HRV falling over 7+ days
//  = functional overreaching → needs 1-2 weeks recovery
// ═══════════════════════════════════════════════════════════════

export interface OvertrainingResult {
  risk: "none" | "watch" | "warning" | "high";
  exerciseTrend: number;     // change in weekly minutes
  hrvTrend: number;          // change in 7d HRV avg
  rhrTrend: number;          // change in 7d RHR avg
  daysSuppressed: number;    // consecutive days HRV below baseline
  description: string;
}

export function detectOvertraining(
  hrvData: DailySummary[],
  rhrData: DailySummary[],
  exerciseData: DailySummary[]
): OvertrainingResult | null {
  const sorted = {
    hrv: [...hrvData].sort((a, b) => a.date.localeCompare(b.date)),
    rhr: [...rhrData].sort((a, b) => a.date.localeCompare(b.date)),
    ex: [...exerciseData].sort((a, b) => a.date.localeCompare(b.date)),
  };
  if (sorted.hrv.length < 21 || sorted.ex.length < 21) return null;

  // HRV baseline (first 14 days) vs last 7 days
  const hrvBase = sorted.hrv.slice(0, 14).reduce((s, d) => s + d.mean, 0) / 14;
  const hrvRecent = sorted.hrv.slice(-7);
  const hrvNow = hrvRecent.reduce((s, d) => s + d.mean, 0) / hrvRecent.length;
  const hrvPrev = sorted.hrv.slice(-14, -7).reduce((s, d) => s + d.mean, 0) / Math.min(7, sorted.hrv.slice(-14, -7).length);

  // RHR trend
  const rhrRecent = sorted.rhr.slice(-7);
  const rhrPrev = sorted.rhr.slice(-14, -7);
  const rhrNow = rhrRecent.length > 0 ? rhrRecent.reduce((s, d) => s + d.mean, 0) / rhrRecent.length : 0;
  const rhrPrevAvg = rhrPrev.length > 0 ? rhrPrev.reduce((s, d) => s + d.mean, 0) / rhrPrev.length : 0;

  // Exercise trend (weekly totals)
  const exRecent = sorted.ex.slice(-7).reduce((s, d) => s + d.sum, 0);
  const exPrev = sorted.ex.slice(-14, -7).reduce((s, d) => s + d.sum, 0);

  // Count consecutive days HRV below baseline
  let daysSuppressed = 0;
  for (let i = sorted.hrv.length - 1; i >= 0; i--) {
    if (sorted.hrv[i].mean < hrvBase * 0.9) daysSuppressed++;
    else break;
  }

  const hrvTrend = hrvNow - hrvPrev;
  const rhrTrend = rhrNow - rhrPrevAvg;
  const exTrend = exRecent - exPrev;

  let risk: OvertrainingResult["risk"];
  let description: string;

  if (hrvTrend < -5 && exTrend > 30 && daysSuppressed >= 5) {
    risk = "high";
    description = `HRV-ul a scazut cu ${Math.abs(hrvTrend).toFixed(0)} ms in ultima saptamana, in timp ce volumul de antrenament a crescut cu ${exTrend.toFixed(0)} min. HRV e sub baseline de ${daysSuppressed} zile consecutive. Semne clare de suprasolicitare functionala — ai nevoie de 7-14 zile de recuperare activa.`;
  } else if ((hrvTrend < -3 && exTrend > 20) || daysSuppressed >= 4) {
    risk = "warning";
    description = `HRV scade (${hrvTrend.toFixed(1)} ms) si antrenezi mai mult (+${Math.max(0, exTrend).toFixed(0)} min). E un pattern de pre-overreaching. Reduce volumul cu 30-40% saptamana asta si monitorizeaza.`;
  } else if (hrvTrend < -2 || daysSuppressed >= 3) {
    risk = "watch";
    description = `HRV e in scadere usoara (${hrvTrend.toFixed(1)} ms). Inca nu e periculos, dar daca continua 3-4 zile, ia o pauza. Corpul trimite primele semnale.`;
  } else {
    risk = "none";
    description = "Nicio semnal de supraantrenament. HRV raspunde normal la volumul de exercitiu curent.";
  }

  return {
    risk,
    exerciseTrend: exTrend,
    hrvTrend,
    rhrTrend,
    daysSuppressed,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
//  4. Sleep → HRV Impact (Lag Correlation)
//
//  Hynynen E, Uusitalo A, Konttinen N, Rusko H.
//  "Heart rate variability during night sleep and after
//  awakening in overtrained athletes."
//  Med Sci Sports Exerc. 2006;38(2):313-7.
//
//  Measures how last night's sleep quality affects
//  next-day HRV. Personal sensitivity coefficient.
// ═══════════════════════════════════════════════════════════════

export interface SleepHrvImpactResult {
  correlation: number;         // r between sleep duration and next-day HRV
  efficiencyCorrelation: number; // r between sleep efficiency and next-day HRV
  sensitivity: "high" | "moderate" | "low";
  avgHrvAfterGoodSleep: number;
  avgHrvAfterPoorSleep: number;
  difference: number;          // ms difference
  description: string;
  n: number;
}

export function analyzeSleepHrvImpact(
  hrvData: DailySummary[],
  sleepNights: SleepNight[]
): SleepHrvImpactResult | null {
  const hrvMap = new Map(hrvData.map(d => [d.date, d.mean]));
  const sortedSleep = [...sleepNights]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(n => n.totalMinutes > 0);

  if (sortedSleep.length < 14) return null;

  // Pair each night with next-day HRV
  const pairs: { duration: number; efficiency: number; nextHrv: number }[] = [];
  for (const night of sortedSleep) {
    // Next day = date + 1
    const nextDate = new Date(night.date + "T12:00:00");
    nextDate.setDate(nextDate.getDate() + 1);
    const nextKey = nextDate.toISOString().substring(0, 10);
    const nextHrv = hrvMap.get(nextKey);
    if (nextHrv && nextHrv > 0) {
      pairs.push({
        duration: night.totalMinutes / 60,
        efficiency: night.efficiency > 1 ? night.efficiency / 100 : night.efficiency,
        nextHrv,
      });
    }
  }

  if (pairs.length < 10) return null;

  // Correlations
  const durCorr = pearsonR(pairs.map(p => p.duration), pairs.map(p => p.nextHrv));
  const effCorr = pearsonR(pairs.map(p => p.efficiency), pairs.map(p => p.nextHrv));

  // Split into good/poor sleep nights
  const medianDuration = [...pairs.map(p => p.duration)].sort((a, b) => a - b)[Math.floor(pairs.length / 2)];
  const goodSleep = pairs.filter(p => p.duration >= medianDuration);
  const poorSleep = pairs.filter(p => p.duration < medianDuration);

  const avgGood = goodSleep.reduce((s, p) => s + p.nextHrv, 0) / goodSleep.length;
  const avgPoor = poorSleep.reduce((s, p) => s + p.nextHrv, 0) / poorSleep.length;
  const diff = avgGood - avgPoor;

  const maxCorr = Math.max(Math.abs(durCorr), Math.abs(effCorr));
  let sensitivity: SleepHrvImpactResult["sensitivity"];
  if (maxCorr > 0.4) sensitivity = "high";
  else if (maxCorr > 0.2) sensitivity = "moderate";
  else sensitivity = "low";

  let description: string;
  if (sensitivity === "high") {
    description = `Somnul tau are impact mare asupra HRV-ului. Dupa nopti bune (>${(medianDuration * 60).toFixed(0)} min), HRV-ul de a doua zi e in medie ${avgGood.toFixed(0)} ms. Dupa nopti slabe, scade la ${avgPoor.toFixed(0)} ms — o diferenta de ${diff.toFixed(0)} ms. Investitia in somn iti aduce cele mai mari castiguri.`;
  } else if (sensitivity === "moderate") {
    description = `Somnul afecteaza moderat HRV-ul tau. Diferenta intre nopti bune si slabe e de ~${diff.toFixed(0)} ms. Somnul conteaza, dar nu e singurul factor — stresul si exercitiul joaca si ele rol.`;
  } else {
    description = `HRV-ul tau e relativ stabil indiferent de cat dormi. Diferenta e doar ${diff.toFixed(0)} ms. Asta poate insemna ca somnul tau e constant (bun sau rau), sau ca alti factori (stres, exercitiu) au impact mai mare.`;
  }

  return {
    correlation: durCorr,
    efficiencyCorrelation: effCorr,
    sensitivity,
    avgHrvAfterGoodSleep: avgGood,
    avgHrvAfterPoorSleep: avgPoor,
    difference: diff,
    description,
    n: pairs.length,
  };
}

// ═══════════════════════════════════════════════════════════════
//  5. Weekly Rhythm — Day-of-Week Pattern Analysis
//
//  Identifies personal autonomic patterns across the week.
//  Which days you're most/least recovered.
// ═══════════════════════════════════════════════════════════════

export interface WeeklyRhythmResult {
  dayScores: { day: string; hrv: number; rhr: number; steps: number; exercise: number }[];
  bestDay: string;
  worstDay: string;
  weekendEffect: number;   // HRV difference weekend vs weekday (ms)
  description: string;
}

const DAY_NAMES = ["Duminica", "Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata"];
const DAY_SHORT = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sam"];

export function analyzeWeeklyRhythm(
  hrvData: DailySummary[],
  rhrData: DailySummary[],
  stepData: DailySummary[],
  exerciseData: DailySummary[]
): WeeklyRhythmResult | null {
  if (hrvData.length < 21) return null;

  // Bucket by day of week
  const buckets: Record<number, { hrv: number[]; rhr: number[]; steps: number[]; exercise: number[] }> = {};
  for (let i = 0; i < 7; i++) buckets[i] = { hrv: [], rhr: [], steps: [], exercise: [] };

  const addToBucket = (data: DailySummary[], key: "hrv" | "rhr" | "steps" | "exercise", field: "mean" | "sum") => {
    for (const d of data) {
      const dow = new Date(d.date + "T12:00:00").getDay();
      buckets[dow][key].push(field === "sum" ? d.sum : d.mean);
    }
  };

  addToBucket(hrvData, "hrv", "mean");
  addToBucket(rhrData, "rhr", "mean");
  addToBucket(stepData, "steps", "sum");
  addToBucket(exerciseData, "exercise", "sum");

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const dayScores = Array.from({ length: 7 }, (_, i) => ({
    day: DAY_SHORT[i],
    hrv: Math.round(avg(buckets[i].hrv)),
    rhr: Math.round(avg(buckets[i].rhr)),
    steps: Math.round(avg(buckets[i].steps)),
    exercise: Math.round(avg(buckets[i].exercise)),
  }));

  // Find best/worst HRV days
  const hrvByDay = dayScores.filter(d => d.hrv > 0);
  if (hrvByDay.length < 5) return null;

  const sorted = [...hrvByDay].sort((a, b) => b.hrv - a.hrv);
  const bestDay = sorted[0].day;
  const worstDay = sorted[sorted.length - 1].day;

  // Weekend effect
  const weekdayHrv = [1, 2, 3, 4, 5].map(i => avg(buckets[i].hrv)).filter(v => v > 0);
  const weekendHrv = [0, 6].map(i => avg(buckets[i].hrv)).filter(v => v > 0);
  const weekendEffect = weekendHrv.length > 0 && weekdayHrv.length > 0
    ? avg(weekendHrv) - avg(weekdayHrv)
    : 0;

  let description = `Cel mai recuperat esti ${DAY_NAMES[DAY_SHORT.indexOf(bestDay)].toLowerCase()} (HRV: ${sorted[0].hrv} ms) si cel mai obosit ${DAY_NAMES[DAY_SHORT.indexOf(worstDay)].toLowerCase()} (HRV: ${sorted[sorted.length - 1].hrv} ms).`;

  if (weekendEffect > 3) {
    description += ` In weekend, HRV-ul creste cu ~${weekendEffect.toFixed(0)} ms — semnul ca munca/programul de saptamana iti genereaza stres pe care corpul il compenseaza in weekend.`;
  } else if (weekendEffect < -3) {
    description += ` Interesant: HRV-ul scade in weekend cu ~${Math.abs(weekendEffect).toFixed(0)} ms. Posibil din cauza alcoolului, somnului neregulat sau activitatilor intense de weekend.`;
  } else {
    description += ` HRV-ul e similar in weekend si saptamana — ritmul tau e consistent.`;
  }

  return {
    dayScores,
    bestDay,
    worstDay,
    weekendEffect,
    description,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Aggregate: compute all deep analyses
// ═══════════════════════════════════════════════════════════════

export interface DeepAnalysisReport {
  autonomicBalance: AutonomicBalanceResult | null;
  readiness: ReadinessResult | null;
  overtraining: OvertrainingResult | null;
  sleepHrvImpact: SleepHrvImpactResult | null;
  weeklyRhythm: WeeklyRhythmResult | null;
}

export function computeDeepAnalysis(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[]
): DeepAnalysisReport {
  const hrv = metrics.hrv || [];
  const rhr = metrics.restingHeartRate || [];
  const steps = metrics.stepCount || [];
  const exercise = metrics.exerciseTime || [];
  const spo2 = metrics.oxygenSaturation;

  return {
    autonomicBalance: hrv.length > 0 && rhr.length > 0 ? analyzeAutonomicBalance(hrv, rhr) : null,
    readiness: hrv.length > 0 && rhr.length > 0 ? computeReadiness(hrv, rhr, sleepNights, spo2) : null,
    overtraining: hrv.length > 0 && exercise.length > 0 ? detectOvertraining(hrv, rhr, exercise) : null,
    sleepHrvImpact: hrv.length > 0 && sleepNights.length > 0 ? analyzeSleepHrvImpact(hrv, sleepNights) : null,
    weeklyRhythm: hrv.length > 0 ? analyzeWeeklyRhythm(hrv, rhr, steps, exercise) : null,
  };
}
