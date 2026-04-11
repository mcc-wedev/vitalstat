/**
 * ═══════════════════════════════════════════════════════════════
 *  ADVANCED STATISTICS ENGINE
 *
 *  Rigorous statistical methods used by the top health analytics
 *  platforms (WHOOP, Oura, Garmin Connect, TrainingPeaks).
 *
 *  All functions are pure (no side effects) and designed to
 *  work on numeric time series from Apple Watch data.
 *
 *  References in comments per function.
 * ═══════════════════════════════════════════════════════════════
 */

/* ───────────────────────────── helpers ────────────────────────── */

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sum(arr: number[]): number {
  let s = 0;
  for (const v of arr) s += v;
  return s;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : sum(arr) / arr.length;
}

function variance(arr: number[], ddof = 1): number {
  if (arr.length <= ddof) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return s / (arr.length - ddof);
}

function stddev(arr: number[], ddof = 1): number {
  return Math.sqrt(variance(arr, ddof));
}

/** Abramowitz & Stegun 26.2.17 normal CDF approximation */
export function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/* ═════════════════════════════════════════════════════════════════
 *  1. MANN–KENDALL TREND TEST (non-parametric)
 *
 *  Tests whether a monotonic trend exists in a time series.
 *  Robust to outliers (unlike OLS), makes no distributional
 *  assumption. Standard in environmental & health statistics.
 *
 *  Reference: Mann 1945, Kendall 1975, Hipel & McLeod 1994
 * ═══════════════════════════════════════════════════════════════ */

export interface MannKendallResult {
  /** Kendall's S statistic */
  s: number;
  /** Kendall's tau, in [-1, 1]. Positive = uptrend, negative = downtrend. */
  tau: number;
  /** Standardized Z statistic */
  z: number;
  /** Two-sided p-value */
  pValue: number;
  /** Sen's slope — median of pairwise slopes, robust estimate of rate-of-change per unit time */
  sensSlope: number;
  /** True if p < 0.05 */
  significant: boolean;
  /** Sample size */
  n: number;
}

export function mannKendall(values: number[]): MannKendallResult | null {
  const n = values.length;
  if (n < 8) return null;

  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff = values[j] - values[i];
      if (diff > 0) s++;
      else if (diff < 0) s--;
    }
  }

  // Variance with tie correction
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let tieAdj = 0;
  for (const c of counts.values()) if (c > 1) tieAdj += c * (c - 1) * (2 * c + 5);
  const varS = (n * (n - 1) * (2 * n + 5) - tieAdj) / 18;

  let z = 0;
  if (varS > 0) {
    if (s > 0) z = (s - 1) / Math.sqrt(varS);
    else if (s < 0) z = (s + 1) / Math.sqrt(varS);
  }

  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  const tau = s / ((n * (n - 1)) / 2);

  // Sen's slope — median of pairwise slopes
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      slopes.push((values[j] - values[i]) / (j - i));
    }
  }
  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  const sensSlope = slopes.length % 2 === 0
    ? (slopes[mid - 1] + slopes[mid]) / 2
    : slopes[mid];

  return { s, tau, z, pValue, sensSlope, significant: pValue < 0.05, n };
}

/* ═════════════════════════════════════════════════════════════════
 *  2. PELT CHANGEPOINT DETECTION (approximate)
 *
 *  Detects points in time where the mean of the series changes.
 *  Uses mean-shift cost with a penalty for extra segments.
 *
 *  This is a simplified O(n²) PELT for short series (< 500 points),
 *  which is all we ever have from Apple Watch (max ~2 years).
 *
 *  Reference: Killick et al. 2012 "Optimal Detection of
 *  Changepoints With a Linear Computational Cost"
 * ═══════════════════════════════════════════════════════════════ */

export interface Changepoint {
  index: number;
  meanBefore: number;
  meanAfter: number;
  magnitude: number; // |meanAfter - meanBefore|
}

export function detectChangepoints(
  values: number[],
  opts: { minSegment?: number; penalty?: number } = {}
): Changepoint[] {
  const n = values.length;
  if (n < 20) return [];

  const minSeg = opts.minSegment ?? Math.max(7, Math.floor(n / 20));
  // BIC-like penalty: 2 * log(n) * variance
  const globalVar = variance(values);
  const penalty = opts.penalty ?? 2 * Math.log(n) * Math.max(globalVar, 1e-6);

  // Cost of a segment [a, b] = SSE around the segment mean
  const prefix = new Array(n + 1).fill(0);
  const prefixSq = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + values[i];
    prefixSq[i + 1] = prefixSq[i] + values[i] * values[i];
  }
  const segmentCost = (a: number, b: number): number => {
    const len = b - a;
    if (len <= 0) return 0;
    const s = prefix[b] - prefix[a];
    const sq = prefixSq[b] - prefixSq[a];
    return sq - (s * s) / len;
  };

  // DP: F[t] = min over prior changepoint s of F[s] + cost(s, t) + penalty
  const F = new Array(n + 1).fill(0);
  const lastCP = new Array(n + 1).fill(0);
  F[0] = -penalty;

  for (let t = minSeg; t <= n; t++) {
    let bestCost = Infinity;
    let bestS = 0;
    for (let s = 0; s <= t - minSeg; s++) {
      const c = F[s] + segmentCost(s, t) + penalty;
      if (c < bestCost) {
        bestCost = c;
        bestS = s;
      }
    }
    F[t] = bestCost;
    lastCP[t] = bestS;
  }

  // Backtrack to find changepoints
  const cps: number[] = [];
  let t = n;
  while (t > 0 && lastCP[t] > 0) {
    cps.unshift(lastCP[t]);
    t = lastCP[t];
  }

  return cps.map((idx) => {
    const before = values.slice(Math.max(0, idx - minSeg), idx);
    const after = values.slice(idx, Math.min(n, idx + minSeg));
    const mb = mean(before);
    const ma = mean(after);
    return { index: idx, meanBefore: mb, meanAfter: ma, magnitude: Math.abs(ma - mb) };
  });
}

/* ═════════════════════════════════════════════════════════════════
 *  3. BANISTER FITNESS–FATIGUE–FORM MODEL
 *
 *  Impulse-response model from sports science. Each training session
 *  creates a fitness boost (long decay ~42d) AND a fatigue hit
 *  (short decay ~7d). Performance (Form) = Fitness − Fatigue.
 *
 *  The athlete is "peaking" when Form is maximally positive.
 *
 *  Reference: Banister 1975, Fitz-Clarke et al. 1991,
 *  TrainingPeaks PMC chart (k1=1, k2=2 default).
 * ═══════════════════════════════════════════════════════════════ */

export interface BanisterPoint {
  day: number;
  load: number;
  fitness: number; // CTL (Chronic Training Load)
  fatigue: number; // ATL (Acute Training Load)
  form: number;    // TSB (Training Stress Balance)
}

export function banister(
  dailyLoad: number[],
  opts: { fitnessTC?: number; fatigueTC?: number } = {}
): BanisterPoint[] {
  const fitnessTC = opts.fitnessTC ?? 42; // CTL time constant (days)
  const fatigueTC = opts.fatigueTC ?? 7;  // ATL time constant (days)
  const kFit = 2 / (fitnessTC + 1);       // EWMA alpha
  const kFat = 2 / (fatigueTC + 1);

  const out: BanisterPoint[] = [];
  let ctl = 0;
  let atl = 0;
  for (let i = 0; i < dailyLoad.length; i++) {
    const l = dailyLoad[i];
    ctl = ctl + kFit * (l - ctl);
    atl = atl + kFat * (l - atl);
    out.push({
      day: i,
      load: l,
      fitness: ctl,
      fatigue: atl,
      form: ctl - atl,
    });
  }
  return out;
}

/** Current "form" interpretation per TrainingPeaks conventions */
export function formState(form: number, fitness: number): {
  label: string;
  tone: "rested" | "optimal" | "productive" | "overreaching";
} {
  // Normalized by fitness to be fitness-level-agnostic
  const ratio = fitness > 0 ? form / fitness : 0;
  if (ratio > 0.1) return { label: "Odihnit — gata de performanta", tone: "rested" };
  if (ratio >= -0.1) return { label: "Echilibru optim", tone: "optimal" };
  if (ratio >= -0.3) return { label: "In progres — loading productiv", tone: "productive" };
  return { label: "Supraantrenament — reduceti volumul", tone: "overreaching" };
}

/* ═════════════════════════════════════════════════════════════════
 *  4. BOOTSTRAP CONFIDENCE INTERVAL (for a mean)
 *
 *  When N is small, the normal-approximation CI is wrong.
 *  Bootstrap resampling gives a distribution-free CI.
 *
 *  Reference: Efron 1979, Efron & Tibshirani 1993
 * ═══════════════════════════════════════════════════════════════ */

export interface BootstrapCI {
  mean: number;
  lower: number;
  upper: number;
  confidence: number;
}

export function bootstrapCI(values: number[], {
  iterations = 1000,
  confidence = 0.95,
}: { iterations?: number; confidence?: number } = {}): BootstrapCI | null {
  const n = values.length;
  if (n < 5) return null;
  const means: number[] = [];
  for (let b = 0; b < iterations; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += values[Math.floor(Math.random() * n)];
    }
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  const lower = means[Math.floor(alpha * iterations)];
  const upper = means[Math.floor((1 - alpha) * iterations)];
  return { mean: mean(values), lower, upper, confidence };
}

/* ═════════════════════════════════════════════════════════════════
 *  5. AUTOCORRELATION
 *
 *  Detects periodicity (weekly gym cycle, shift work, etc.).
 *  Returns ACF at lag 1..maxLag.
 * ═══════════════════════════════════════════════════════════════ */

export function autocorrelation(values: number[], maxLag: number): number[] {
  const n = values.length;
  const m = mean(values);
  const variance0 = values.reduce((s, v) => s + (v - m) * (v - m), 0);
  if (variance0 === 0) return [];
  const out: number[] = [];
  for (let lag = 1; lag <= Math.min(maxLag, n - 1); lag++) {
    let c = 0;
    for (let i = 0; i < n - lag; i++) c += (values[i] - m) * (values[i + lag] - m);
    out.push(c / variance0);
  }
  return out;
}

/** Detect a strong weekly cycle (e.g., gym-rest rhythm) */
export function detectWeeklyCycle(values: number[]): { hasCycle: boolean; strength: number } {
  if (values.length < 21) return { hasCycle: false, strength: 0 };
  const acf = autocorrelation(values, 14);
  const lag7 = Math.abs(acf[6] ?? 0);
  return { hasCycle: lag7 > 0.3, strength: lag7 };
}

/* ═════════════════════════════════════════════════════════════════
 *  6. CENTERED-MOVING-AVERAGE SMOOTHER (for long trajectories)
 *
 *  Simpler and more robust than spline for our needs. Odd window
 *  size → centered average. Used for visualizing 1y+ trends.
 * ═══════════════════════════════════════════════════════════════ */

export function smoothCMA(values: number[], window: number): number[] {
  const n = values.length;
  if (window < 3 || n < window) return [...values];
  const half = Math.floor(window / 2);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    out.push(mean(values.slice(a, b)));
  }
  return out;
}

/* ═════════════════════════════════════════════════════════════════
 *  7. ROBUST Z-SCORE (median + MAD)
 *
 *  Less affected by outliers than mean/std z-score.
 *  Used for anomaly detection.
 *
 *  Reference: Iglewicz & Hoaglin 1993
 * ═══════════════════════════════════════════════════════════════ */

export function robustZ(values: number[], x: number): number {
  if (values.length < 5) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map(v => Math.abs(v - median));
  deviations.sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];
  if (mad === 0) return 0;
  // 0.6745 = Φ⁻¹(0.75), makes MAD consistent with σ under normality
  return (x - median) / (1.4826 * mad);
}

/* ═════════════════════════════════════════════════════════════════
 *  8. TRAINING IMPULSE (TRIMP) — Banister input
 *
 *  Converts daily exercise minutes + average HR into a load score.
 *  When HR isn't available, falls back to minutes × difficulty factor.
 *
 *  Reference: Banister 1975, Morton 1990 (TRIMP formula)
 * ═══════════════════════════════════════════════════════════════ */

export function trimpFromMinutesAndHR(
  minutes: number,
  avgHR: number,
  restingHR: number,
  maxHR: number,
  isMale = true
): number {
  if (minutes <= 0 || avgHR <= restingHR) return 0;
  const hrr = (avgHR - restingHR) / Math.max(1, maxHR - restingHR);
  // Banister weighting factor (Morton 1990)
  const y = clamp(hrr, 0, 1);
  const k = isMale ? 1.92 : 1.67;
  const b = isMale ? 1.67 : 1.92;
  const weight = y * 0.64 * Math.exp(k * y);
  // Use simpler formulation when avg HR is unreliable
  void b;
  return minutes * weight * 10;
}

/** Fallback: minutes-only load (linear) */
export function trimpFromMinutes(minutes: number): number {
  return Math.max(0, minutes);
}

/* ═════════════════════════════════════════════════════════════════
 *  9. CONSISTENCY / STABILITY INDEX (CV)
 *
 *  Coefficient of variation = std / mean. Lower is more consistent.
 *  Used for bedtime regularity, steps consistency, etc.
 * ═══════════════════════════════════════════════════════════════ */

export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (Math.abs(m) < 1e-10) return 0;
  return stddev(values) / Math.abs(m);
}

/* ═════════════════════════════════════════════════════════════════
 *  10. SEASONAL DECOMPOSITION (additive, weekly period)
 *
 *  Breaks series into trend + seasonal (day-of-week) + residual.
 *  Useful for "why is Monday always bad?" insights.
 *
 *  Reference: Cleveland et al. 1990 (STL), simplified.
 * ═══════════════════════════════════════════════════════════════ */

export function dayOfWeekSeasonality(
  values: number[],
  dayOfWeekIdx: number[]  // 0=Sun, 6=Sat for each value
): { dow: number; avg: number; deviation: number }[] {
  if (values.length < 14) return [];
  const overallMean = mean(values);
  const byDow: number[][] = [[], [], [], [], [], [], []];
  for (let i = 0; i < values.length; i++) byDow[dayOfWeekIdx[i]].push(values[i]);
  return byDow.map((arr, dow) => ({
    dow,
    avg: arr.length > 0 ? mean(arr) : overallMean,
    deviation: arr.length > 0 ? mean(arr) - overallMean : 0,
  }));
}
