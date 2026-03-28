import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { meanStd } from "./zScore";

// ═══════════════════════════════════════════════════════════
// RECOVERY SCORE v2
// Based on: Buchheit 2014, Plews 2013, WHOOP/Oura methodology
// Inputs: HRV (ln-RMSSD), RHR, Sleep (5-component), Training Load (ACWR),
//         Respiratory Rate, SpO2
// Output: 0-100 via Normal CDF mapping
// ═══════════════════════════════════════════════════════════

export type ConfidenceLevel = "high" | "medium" | "low";

export interface RecoveryScore {
  total: number;           // 0-100 final score
  hrvScore: number;        // 0-100
  rhrScore: number;        // 0-100
  sleepScore: number;      // 0-100
  trainingScore: number;   // 0-100
  respScore: number;       // 0-100
  spo2Score: number;       // 0-100
  hasEnoughData: boolean;
  confidence: ConfidenceLevel;
  message?: string;
  components: {
    name: string;
    score: number;
    weight: number;
    available: boolean;
  }[];
}

// Normal CDF approximation (Abramowitz & Stegun)
function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// Z-score → 0-100 via CDF (bell curve mapping)
function zToScore(z: number): number {
  // Clamp extreme z-scores to avoid 0/100 plateaus
  const clamped = clamp(z, -3, 3);
  return Math.round(normalCDF(clamped) * 100);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// Exponentially weighted moving average
function ewma(values: number[], alpha: number): number {
  if (values.length === 0) return 0;
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = alpha * values[i] + (1 - alpha) * result;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// BASE WEIGHTS (redistributed when components missing)
// ═══════════════════════════════════════════════════════════

const BASE_WEIGHTS: Record<string, number> = {
  hrv: 0.35,
  rhr: 0.20,
  sleep: 0.25,
  training: 0.10,
  respiratory: 0.05,
  spo2: 0.05,
};

/**
 * Recovery Score v2 — industry-grade algorithm
 *
 * Uses ln(RMSSD) normalization for HRV (Buchheit 2014),
 * 28-day rolling baseline (Oura/WHOOP standard),
 * ACWR for training load context (Gabbett 2016),
 * Normal CDF mapping for 0-100 output.
 */
export function calculateRecovery(
  rhrHistory: DailySummary[],
  hrvHistory: DailySummary[],
  sleepHistory: SleepNight[],
  targetDate: string,
  // Optional additional inputs
  exerciseHistory?: DailySummary[],
  respHistory?: DailySummary[],
  spo2History?: DailySummary[],
): RecoveryScore {
  const BASELINE_DAYS = 28;
  const MIN_DAYS = 14;

  // Split data: before target date (for baseline) and on target date
  const rhrBefore = rhrHistory.filter(d => d.date < targetDate);
  const hrvBefore = hrvHistory.filter(d => d.date < targetDate);
  const sleepBefore = sleepHistory.filter(d => d.date < targetDate);

  // Minimum data check
  if (rhrBefore.length < MIN_DAYS || hrvBefore.length < MIN_DAYS) {
    return emptyScore(`Necesare cel putin ${MIN_DAYS} zile de date (ai ${Math.min(rhrBefore.length, hrvBefore.length)})`);
  }

  // Today's values
  const todayRHR = rhrHistory.find(d => d.date === targetDate);
  const todayHRV = hrvHistory.find(d => d.date === targetDate);
  const todaySleep = sleepHistory.find(d => d.date === targetDate);

  // ── HRV Score (ln-RMSSD normalization) ──
  // ln transform reduces skewness, making z-scores more reliable (Buchheit 2014)
  const hrvLnValues = hrvBefore.slice(-BASELINE_DAYS).map(d => Math.log(Math.max(d.mean, 1)));
  const { mean: lnMean, std: lnStd } = meanStd(hrvLnValues);
  let hrvScore = 50;
  let hrvAvailable = false;
  if (todayHRV && lnStd > 0) {
    const lnToday = Math.log(Math.max(todayHRV.mean, 1));
    const z = (lnToday - lnMean) / lnStd;
    hrvScore = zToScore(z);
    hrvAvailable = true;
  }

  // ── RHR Score (inverted — lower is better) ──
  const rhrValues = rhrBefore.slice(-BASELINE_DAYS).map(d => d.mean);
  const { mean: rhrMean, std: rhrStd } = meanStd(rhrValues);
  let rhrScore = 50;
  let rhrAvailable = false;
  if (todayRHR && rhrStd > 0) {
    const z = (todayRHR.mean - rhrMean) / rhrStd;
    // Invert: lower RHR = higher score
    rhrScore = zToScore(-z);
    rhrAvailable = true;
  }

  // ── Sleep Score (5 components) ──
  let sleepScore = 50;
  let sleepAvailable = false;
  if (todaySleep) {
    sleepScore = computeSleepScore(todaySleep, sleepBefore);
    sleepAvailable = true;
  }

  // ── Training Balance (ACWR — Gabbett 2016) ──
  let trainingScore = 70; // neutral default
  let trainingAvailable = false;
  if (exerciseHistory && exerciseHistory.length >= 28) {
    const exBefore = exerciseHistory.filter(d => d.date <= targetDate);
    if (exBefore.length >= 28) {
      trainingScore = computeTrainingScore(exBefore);
      trainingAvailable = true;
    }
  }

  // ── Respiratory Rate Score ──
  let respScore = 70;
  let respAvailable = false;
  if (respHistory && respHistory.length >= MIN_DAYS) {
    const respBefore = respHistory.filter(d => d.date < targetDate);
    const todayResp = respHistory.find(d => d.date === targetDate);
    if (respBefore.length >= MIN_DAYS && todayResp) {
      const { mean: rMean, std: rStd } = meanStd(respBefore.slice(-BASELINE_DAYS).map(d => d.mean));
      if (rStd > 0) {
        const z = (todayResp.mean - rMean) / rStd;
        // Higher resp rate = worse (inverted)
        respScore = zToScore(-z);
        respAvailable = true;
      }
    }
  }

  // ── SpO2 Score ──
  let spo2Score = 70;
  let spo2Available = false;
  if (spo2History && spo2History.length >= 7) {
    const todaySpo2 = spo2History.find(d => d.date === targetDate);
    if (todaySpo2) {
      const pct = todaySpo2.mean > 1 ? todaySpo2.mean : todaySpo2.mean * 100;
      // Simple threshold-based: 97+ = 90-100, 95-97 = 60-90, <95 = 0-60
      spo2Score = pct >= 97 ? clamp(80 + (pct - 97) * 6.67, 80, 100)
        : pct >= 95 ? clamp(50 + (pct - 95) * 15, 50, 80)
        : clamp(pct * 0.53, 0, 50);
      spo2Available = true;
    }
  }

  // ── Redistribute weights for missing components ──
  const components = [
    { name: "HRV", key: "hrv", score: hrvScore, available: hrvAvailable },
    { name: "Puls repaus", key: "rhr", score: rhrScore, available: rhrAvailable },
    { name: "Somn", key: "sleep", score: sleepScore, available: sleepAvailable },
    { name: "Balanta antrenament", key: "training", score: trainingScore, available: trainingAvailable },
    { name: "Rata respiratorie", key: "respiratory", score: respScore, available: respAvailable },
    { name: "SpO2", key: "spo2", score: spo2Score, available: spo2Available },
  ];

  // Calculate effective weights (redistribute missing weight proportionally)
  const availableWeight = components.filter(c => c.available).reduce((s, c) => s + BASE_WEIGHTS[c.key], 0);
  const weights: Record<string, number> = {};

  for (const c of components) {
    if (c.available && availableWeight > 0) {
      weights[c.key] = BASE_WEIGHTS[c.key] / availableWeight; // normalize to sum=1
    } else {
      weights[c.key] = 0;
    }
  }

  // Compute final score
  let total = 0;
  for (const c of components) {
    total += (weights[c.key] || 0) * c.score;
  }

  // Confidence level
  const availCount = components.filter(c => c.available).length;
  const confidence: ConfidenceLevel = availCount >= 5 ? "high" : availCount >= 3 ? "medium" : "low";

  return {
    total: Math.round(clamp(total, 0, 100)),
    hrvScore: Math.round(hrvScore),
    rhrScore: Math.round(rhrScore),
    sleepScore: Math.round(sleepScore),
    trainingScore: Math.round(trainingScore),
    respScore: Math.round(respScore),
    spo2Score: Math.round(spo2Score),
    hasEnoughData: true,
    confidence,
    components: components.map(c => ({
      name: c.name,
      score: Math.round(c.score),
      weight: Math.round((weights[c.key] || 0) * 100),
      available: c.available,
    })),
  };
}

// ═══════════════════════════════════════════════════════════
// SLEEP SCORE — 5 components
// ═══════════════════════════════════════════════════════════

function computeSleepScore(night: SleepNight, history: SleepNight[]): number {
  const totalMin = Math.max(night.totalMinutes, 1);
  const hours = totalMin / 60;

  // 1. Efficiency (25%) — how much time in bed is actually sleep
  const effScore = clamp(night.efficiency * 100, 0, 100);

  // 2. Duration vs personal target (25%)
  // Use 90-day personal average as target (not fixed 8h)
  const recent90 = history.slice(-90).map(n => n.totalMinutes / 60);
  const personalTarget = recent90.length >= 14
    ? recent90.reduce((a, b) => a + b, 0) / recent90.length
    : 8; // fallback
  const target = clamp(personalTarget, 7, 9); // sane bounds
  const durRatio = hours / target;
  const durScore = durRatio >= 1 ? 100
    : durRatio >= 0.85 ? clamp(70 + (durRatio - 0.85) * 200, 70, 100)
    : clamp(durRatio * 82, 0, 70);

  // 3. Deep sleep % (20%) — target 15-25% of total
  const deepPct = (night.stages.deep / totalMin) * 100;
  const deepScore = deepPct >= 20 ? 100
    : deepPct >= 15 ? clamp(75 + (deepPct - 15) * 5, 75, 100)
    : deepPct >= 10 ? clamp(50 + (deepPct - 10) * 5, 50, 75)
    : clamp(deepPct * 5, 0, 50);

  // 4. REM % (15%) — target 20-25%
  const remPct = (night.stages.rem / totalMin) * 100;
  const remScore = remPct >= 22 ? 100
    : remPct >= 18 ? clamp(75 + (remPct - 18) * 6.25, 75, 100)
    : remPct >= 12 ? clamp(45 + (remPct - 12) * 5, 45, 75)
    : clamp(remPct * 3.75, 0, 45);

  // 5. Consistency (15%) — bedtime variability over last 7 nights
  const recent7 = history.slice(-7);
  let consistScore = 70; // default
  if (recent7.length >= 5) {
    const bedtimeHours = recent7.map(n => {
      const d = new Date(n.bedtime);
      let h = d.getHours() + d.getMinutes() / 60;
      if (h < 12) h += 24; // normalize past midnight
      return h;
    });
    const { std } = meanStd(bedtimeHours);
    // std < 0.5h = perfect, > 2h = bad
    consistScore = std <= 0.5 ? 100
      : std <= 1.0 ? clamp(100 - (std - 0.5) * 60, 70, 100)
      : std <= 1.5 ? clamp(70 - (std - 1.0) * 40, 50, 70)
      : clamp(50 - (std - 1.5) * 50, 10, 50);
  }

  return clamp(
    effScore * 0.25 + durScore * 0.25 + deepScore * 0.20 + remScore * 0.15 + consistScore * 0.15,
    0, 100
  );
}

// ═══════════════════════════════════════════════════════════
// TRAINING SCORE — Acute:Chronic Workload Ratio (ACWR)
// Based on Gabbett 2016 — sweet spot 0.8-1.3
// ═══════════════════════════════════════════════════════════

function computeTrainingScore(exHistory: DailySummary[]): number {
  const values = exHistory.map(d => d.sum); // exercise minutes per day

  // EWMA approach (Gabbett 2016)
  // Acute: 7-day EWMA (alpha = 2/(7+1) = 0.25)
  // Chronic: 28-day EWMA (alpha = 2/(28+1) ≈ 0.069)
  const last7 = values.slice(-7);
  const last28 = values.slice(-28);

  const acute = ewma(last7, 2 / (7 + 1));
  const chronic = ewma(last28, 2 / (28 + 1));

  if (chronic < 5) return 70; // insufficient training history

  const acwr = acute / chronic;

  // Scoring: sweet spot 0.8-1.3 = high score
  // Below 0.6 = detraining risk, above 1.5 = injury risk
  if (acwr >= 0.8 && acwr <= 1.3) {
    // Sweet spot — score 80-100
    const center = 1.05; // optimal center
    const dist = Math.abs(acwr - center);
    return Math.round(clamp(100 - dist * 40, 80, 100));
  }
  if (acwr < 0.8) {
    // Underloading — gradual decrease
    return Math.round(clamp(80 * (acwr / 0.8), 20, 80));
  }
  // Overloading (>1.3) — steeper penalty
  return Math.round(clamp(80 - (acwr - 1.3) * 150, 0, 80));
}

// ═══════════════════════════════════════════════════════════
// EMPTY SCORE HELPER
// ═══════════════════════════════════════════════════════════

function emptyScore(message: string): RecoveryScore {
  return {
    total: 0, hrvScore: 0, rhrScore: 0, sleepScore: 0,
    trainingScore: 0, respScore: 0, spo2Score: 0,
    hasEnoughData: false, confidence: "low", message,
    components: [],
  };
}
