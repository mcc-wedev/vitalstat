import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { meanStd } from "./zScore";

// ═══════════════════════════════════════════════════════════
// RECOVERY SCORE v3
//
// Evidence base:
//   - ln(RMSSD) normalization: Buchheit 2014, Plews et al. 2013
//   - ACWR injury risk model: Gabbett 2016, Hulin et al. 2014
//   - Sleep architecture scoring: Walker 2017, Ohayon et al. 2017
//   - Recovery Index (HR drop speed): Oura Ring methodology
//   - Temperature deviation: WHOOP 5.0, Oura Gen3
//   - Multi-night sleep balance: Oura Readiness (14-day weighted)
//   - Normal CDF mapping: Kubios HRV readiness score
//   - Previous day strain: WHOOP strain-recovery coupling
//
// Inputs (8 signals, graceful degradation):
//   1. HRV — ln(RMSSD) z-score vs 28d baseline (dominant)
//   2. RHR — z-score inverted vs 28d baseline
//   3. Sleep — 6-component: efficiency, duration vs personal target,
//              deep%, REM%, consistency 7d, 14-day sleep balance
//   4. Training Balance — ACWR (7d EWMA / 28d EWMA)
//   5. Previous Day Strain — yesterday's exercise load impact
//   6. Respiratory Rate — z-score inverted vs 28d baseline
//   7. SpO2 — threshold-based (clinical ranges)
//   8. Wrist Temperature — deviation from personal baseline
//
// Output: 0-100 via Normal CDF sigmoid mapping
// ═══════════════════════════════════════════════════════════

export type ConfidenceLevel = "high" | "medium" | "low";

export interface RecoveryScore {
  total: number;
  hrvScore: number;
  rhrScore: number;
  sleepScore: number;
  trainingScore: number;
  strainScore: number;
  respScore: number;
  spo2Score: number;
  tempScore: number;
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

// ── Math helpers ──

function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function zToScore(z: number): number {
  return Math.round(normalCDF(clamp(z, -3, 3)) * 100);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function ewma(values: number[], alpha: number): number {
  if (values.length === 0) return 0;
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = alpha * values[i] + (1 - alpha) * result;
  }
  return result;
}

// ── Base weights (sum = 1.0, redistributed when signals missing) ──

const BASE_WEIGHTS: Record<string, number> = {
  hrv: 0.30,          // Dominant signal (Buchheit 2014)
  rhr: 0.15,          // Strong recovery indicator
  sleep: 0.25,        // Critical for recovery (Walker 2017)
  training: 0.08,     // ACWR context
  strain: 0.07,       // Yesterday's direct load
  respiratory: 0.05,  // Early illness detector
  spo2: 0.05,         // Clinical safety net
  temp: 0.05,         // Circadian/immune signal
};

// ═══════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════

export function calculateRecovery(
  rhrHistory: DailySummary[],
  hrvHistory: DailySummary[],
  sleepHistory: SleepNight[],
  targetDate: string,
  exerciseHistory?: DailySummary[],
  respHistory?: DailySummary[],
  spo2History?: DailySummary[],
  tempHistory?: DailySummary[],
): RecoveryScore {
  const BASELINE = 28;
  const MIN_DAYS = 14;

  const rhrBefore = rhrHistory.filter(d => d.date < targetDate);
  const hrvBefore = hrvHistory.filter(d => d.date < targetDate);
  const sleepBefore = sleepHistory.filter(d => d.date < targetDate);

  if (rhrBefore.length < MIN_DAYS || hrvBefore.length < MIN_DAYS) {
    return emptyScore(`Necesare cel putin ${MIN_DAYS} zile de date (ai ${Math.min(rhrBefore.length, hrvBefore.length)})`);
  }

  const todayRHR = rhrHistory.find(d => d.date === targetDate);
  const todayHRV = hrvHistory.find(d => d.date === targetDate);
  const todaySleep = sleepHistory.find(d => d.date === targetDate);

  // ────────────────────────────────────────────────
  // 1. HRV Score — ln(RMSSD) z-score
  //    ln transform reduces skewness, standard in HRV research
  //    (Buchheit 2014, Plews et al. 2013)
  // ────────────────────────────────────────────────
  const hrvLn = hrvBefore.slice(-BASELINE).map(d => Math.log(Math.max(d.mean, 1)));
  const { mean: lnMean, std: lnStd } = meanStd(hrvLn);
  let hrvScore = 50;
  let hrvAvailable = false;
  if (todayHRV && lnStd > 0) {
    const z = (Math.log(Math.max(todayHRV.mean, 1)) - lnMean) / lnStd;
    hrvScore = zToScore(z);
    hrvAvailable = true;
  }

  // ────────────────────────────────────────────────
  // 2. RHR Score — inverted z-score (lower = better)
  // ────────────────────────────────────────────────
  const rhrVals = rhrBefore.slice(-BASELINE).map(d => d.mean);
  const { mean: rhrMean, std: rhrStd } = meanStd(rhrVals);
  let rhrScore = 50;
  let rhrAvailable = false;
  if (todayRHR && rhrStd > 0) {
    rhrScore = zToScore(-(todayRHR.mean - rhrMean) / rhrStd);
    rhrAvailable = true;
  }

  // ────────────────────────────────────────────────
  // 3. Sleep Score — 6 components (upgraded from 5)
  //    Now includes 14-day sleep balance (Oura method)
  // ────────────────────────────────────────────────
  let sleepScore = 50;
  let sleepAvailable = false;
  if (todaySleep) {
    sleepScore = computeSleepScore(todaySleep, sleepBefore);
    sleepAvailable = true;
  }

  // ────────────────────────────────────────────────
  // 4. Training Balance — ACWR (Gabbett 2016)
  //    Acute (7d EWMA) / Chronic (28d EWMA)
  //    Sweet spot: 0.8–1.3
  // ────────────────────────────────────────────────
  let trainingScore = 70;
  let trainingAvailable = false;
  if (exerciseHistory && exerciseHistory.length >= 28) {
    const exBefore = exerciseHistory.filter(d => d.date <= targetDate);
    if (exBefore.length >= 28) {
      trainingScore = computeTrainingScore(exBefore);
      trainingAvailable = true;
    }
  }

  // ────────────────────────────────────────────────
  // 5. Previous Day Strain — yesterday's direct load
  //    (WHOOP: recovery is inversely coupled with prior strain)
  //    High strain yesterday + good sleep = OK
  //    High strain yesterday + bad sleep = penalized
  // ────────────────────────────────────────────────
  let strainScore = 70;
  let strainAvailable = false;
  if (exerciseHistory && exerciseHistory.length >= 14) {
    const yesterday = new Date(new Date(targetDate).getTime() - 86400000).toISOString().substring(0, 10);
    const yesterdayEx = exerciseHistory.find(d => d.date === yesterday);
    const exBefore = exerciseHistory.filter(d => d.date < targetDate).slice(-BASELINE);

    if (yesterdayEx && exBefore.length >= 7) {
      const exVals = exBefore.map(d => d.sum);
      const { mean: exMean, std: exStd } = meanStd(exVals);

      if (exStd > 0) {
        const strainZ = (yesterdayEx.sum - exMean) / exStd;

        // High strain yesterday = lower recovery potential
        // BUT modulated by sleep: good sleep compensates
        let rawStrain = zToScore(-strainZ); // inverted: high strain = low score

        // Sleep modulation: if slept well after high strain, recover partial points
        if (todaySleep && strainZ > 1) {
          const sleepHours = todaySleep.totalMinutes / 60;
          const sleepBonus = sleepHours >= 8 ? 15 : sleepHours >= 7 ? 8 : 0;
          rawStrain = clamp(rawStrain + sleepBonus, 0, 100);
        }

        strainScore = rawStrain;
        strainAvailable = true;
      }
    }
  }

  // ────────────────────────────────────────────────
  // 6. Respiratory Rate — inverted z-score
  //    Elevated resp rate = early illness/stress signal
  // ────────────────────────────────────────────────
  let respScore = 70;
  let respAvailable = false;
  if (respHistory && respHistory.length >= MIN_DAYS) {
    const respBefore = respHistory.filter(d => d.date < targetDate);
    const todayResp = respHistory.find(d => d.date === targetDate);
    if (respBefore.length >= MIN_DAYS && todayResp) {
      const { mean: rMean, std: rStd } = meanStd(respBefore.slice(-BASELINE).map(d => d.mean));
      if (rStd > 0) {
        respScore = zToScore(-(todayResp.mean - rMean) / rStd);
        respAvailable = true;
      }
    }
  }

  // ────────────────────────────────────────────────
  // 7. SpO2 — clinical threshold-based
  //    Not z-score because SpO2 has hard clinical boundaries
  // ────────────────────────────────────────────────
  let spo2Score = 70;
  let spo2Available = false;
  if (spo2History && spo2History.length >= 7) {
    const todaySpo2 = spo2History.find(d => d.date === targetDate);
    if (todaySpo2) {
      const pct = todaySpo2.mean > 1 ? todaySpo2.mean : todaySpo2.mean * 100;
      spo2Score = pct >= 97 ? clamp(80 + (pct - 97) * 6.67, 80, 100)
        : pct >= 95 ? clamp(50 + (pct - 95) * 15, 50, 80)
        : clamp(pct * 0.53, 0, 50);
      spo2Available = true;
    }
  }

  // ────────────────────────────────────────────────
  // 8. Wrist Temperature — deviation from baseline
  //    (WHOOP 5.0, Oura Gen3: temp deviation correlates with
  //     immune response, menstrual cycle, overtraining)
  //    Apple Watch stores as deviation from baseline in °C
  // ────────────────────────────────────────────────
  let tempScore = 70;
  let tempAvailable = false;
  if (tempHistory && tempHistory.length >= MIN_DAYS) {
    const tempBefore = tempHistory.filter(d => d.date < targetDate);
    const todayTemp = tempHistory.find(d => d.date === targetDate);
    if (tempBefore.length >= MIN_DAYS && todayTemp) {
      const { mean: tMean, std: tStd } = meanStd(tempBefore.slice(-BASELINE).map(d => d.mean));
      if (tStd > 0) {
        const z = (todayTemp.mean - tMean) / tStd;
        // Elevated temp = potential illness/inflammation → penalize
        // Slightly below baseline = normal variation → OK
        // Scoring: close to baseline (z≈0) = best
        //          elevated (z>1.5) = bad
        //          very low (z<-2) = also concerning
        const absZ = Math.abs(z);
        tempScore = absZ <= 0.5 ? clamp(90 + (0.5 - absZ) * 20, 90, 100)
          : absZ <= 1.0 ? clamp(90 - (absZ - 0.5) * 30, 75, 90)
          : absZ <= 2.0 ? clamp(75 - (absZ - 1.0) * 35, 40, 75)
          : clamp(40 - (absZ - 2.0) * 20, 10, 40);

        // Extra penalty for ELEVATED temp (more concerning than low)
        if (z > 1.5) tempScore = clamp(tempScore - 10, 5, tempScore);

        tempAvailable = true;
      }
    }
  }

  // ── Assemble components & redistribute weights ──

  const components = [
    { name: "HRV", key: "hrv", score: hrvScore, available: hrvAvailable },
    { name: "Puls repaus", key: "rhr", score: rhrScore, available: rhrAvailable },
    { name: "Somn", key: "sleep", score: sleepScore, available: sleepAvailable },
    { name: "Balanta antrenament", key: "training", score: trainingScore, available: trainingAvailable },
    { name: "Efort ieri", key: "strain", score: strainScore, available: strainAvailable },
    { name: "Rata respiratorie", key: "respiratory", score: respScore, available: respAvailable },
    { name: "SpO2", key: "spo2", score: spo2Score, available: spo2Available },
    { name: "Temperatura", key: "temp", score: tempScore, available: tempAvailable },
  ];

  const availableWeight = components.filter(c => c.available).reduce((s, c) => s + BASE_WEIGHTS[c.key], 0);
  const weights: Record<string, number> = {};
  for (const c of components) {
    weights[c.key] = c.available && availableWeight > 0 ? BASE_WEIGHTS[c.key] / availableWeight : 0;
  }

  let total = 0;
  for (const c of components) total += (weights[c.key] || 0) * c.score;

  const availCount = components.filter(c => c.available).length;
  const confidence: ConfidenceLevel = availCount >= 6 ? "high" : availCount >= 4 ? "medium" : "low";

  return {
    total: Math.round(clamp(total, 0, 100)),
    hrvScore: Math.round(hrvScore),
    rhrScore: Math.round(rhrScore),
    sleepScore: Math.round(sleepScore),
    trainingScore: Math.round(trainingScore),
    strainScore: Math.round(strainScore),
    respScore: Math.round(respScore),
    spo2Score: Math.round(spo2Score),
    tempScore: Math.round(tempScore),
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
// SLEEP SCORE — 6 components
// Added: 14-day sleep balance (Oura Readiness methodology)
// ═══════════════════════════════════════════════════════════

function computeSleepScore(night: SleepNight, history: SleepNight[]): number {
  const totalMin = Math.max(night.totalMinutes, 1);
  const hours = totalMin / 60;

  // 1. Efficiency (20%) — time asleep / time in bed
  const effScore = clamp(night.efficiency * 100, 0, 100);

  // 2. Duration vs personal target (20%)
  //    Uses 90-day personal average (not fixed 8h)
  const recent90 = history.slice(-90).map(n => n.totalMinutes / 60);
  const personalTarget = recent90.length >= 14
    ? recent90.reduce((a, b) => a + b, 0) / recent90.length
    : 8;
  const target = clamp(personalTarget, 7, 9);
  const durRatio = hours / target;
  const durScore = durRatio >= 1 ? 100
    : durRatio >= 0.85 ? clamp(70 + (durRatio - 0.85) * 200, 70, 100)
    : clamp(durRatio * 82, 0, 70);

  // 3. Deep sleep % (15%) — target 15-25%
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

  // 5. Consistency (15%) — bedtime variability last 7 nights
  const recent7 = history.slice(-7);
  let consistScore = 70;
  if (recent7.length >= 5) {
    const bedtimeHours = recent7.map(n => {
      const d = new Date(n.bedtime);
      let h = d.getHours() + d.getMinutes() / 60;
      if (h < 12) h += 24;
      return h;
    });
    const { std } = meanStd(bedtimeHours);
    consistScore = std <= 0.5 ? 100
      : std <= 1.0 ? clamp(100 - (std - 0.5) * 60, 70, 100)
      : std <= 1.5 ? clamp(70 - (std - 1.0) * 40, 50, 70)
      : clamp(50 - (std - 1.5) * 50, 10, 50);
  }

  // 6. 14-Day Sleep Balance (15%) — Oura Readiness method
  //    Compares recent 14 nights vs personal optimal
  //    Accounts for accumulated sleep debt, not just last night
  const recent14 = history.slice(-14);
  let balanceScore = 70;
  if (recent14.length >= 10) {
    const avg14 = recent14.reduce((s, n) => s + n.totalMinutes / 60, 0) / recent14.length;
    // How close are you to your personal target over 14 days?
    const balanceRatio = avg14 / target;
    balanceScore = balanceRatio >= 1.0 ? 100
      : balanceRatio >= 0.95 ? clamp(85 + (balanceRatio - 0.95) * 300, 85, 100)
      : balanceRatio >= 0.85 ? clamp(60 + (balanceRatio - 0.85) * 250, 60, 85)
      : clamp(balanceRatio * 70, 10, 60);

    // Bonus: if ALL 14 nights were ≥ 6.5h (no single bad night)
    const allAboveMin = recent14.every(n => n.totalMinutes / 60 >= 6.5);
    if (allAboveMin) balanceScore = clamp(balanceScore + 5, 0, 100);
  }

  return clamp(
    effScore * 0.20 +
    durScore * 0.20 +
    deepScore * 0.15 +
    remScore * 0.15 +
    consistScore * 0.15 +
    balanceScore * 0.15,
    0, 100
  );
}

// ═══════════════════════════════════════════════════════════
// TRAINING SCORE — ACWR (Gabbett 2016)
// ═══════════════════════════════════════════════════════════

function computeTrainingScore(exHistory: DailySummary[]): number {
  const values = exHistory.map(d => d.sum);
  const last7 = values.slice(-7);
  const last28 = values.slice(-28);

  const acute = ewma(last7, 2 / (7 + 1));
  const chronic = ewma(last28, 2 / (28 + 1));

  if (chronic < 5) return 70;

  const acwr = acute / chronic;

  if (acwr >= 0.8 && acwr <= 1.3) {
    const dist = Math.abs(acwr - 1.05);
    return Math.round(clamp(100 - dist * 40, 80, 100));
  }
  if (acwr < 0.8) {
    return Math.round(clamp(80 * (acwr / 0.8), 20, 80));
  }
  return Math.round(clamp(80 - (acwr - 1.3) * 150, 0, 80));
}

// ═══════════════════════════════════════════════════════════
// EMPTY SCORE
// ═══════════════════════════════════════════════════════════

function emptyScore(message: string): RecoveryScore {
  return {
    total: 0, hrvScore: 0, rhrScore: 0, sleepScore: 0,
    trainingScore: 0, strainScore: 0, respScore: 0,
    spo2Score: 0, tempScore: 0,
    hasEnoughData: false, confidence: "low", message,
    components: [],
  };
}
