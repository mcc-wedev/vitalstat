/**
 * ═══════════════════════════════════════════════════════════════
 *  POPULATION NORMS — Age × Sex tables for biomarkers
 *
 *  Each norm maps an individual value to a percentile within
 *  the population of the same age decade and sex. This is what
 *  Garmin, WHOOP, and Apple Fitness+ use internally (albeit with
 *  proprietary tables). All tables here come from published
 *  peer-reviewed literature — citations inline.
 *
 *  Returned value is always a percentile in [0, 100], where
 *  higher = "better than more of your peers" (already inverted
 *  for metrics where lower is healthier, like RHR).
 * ═══════════════════════════════════════════════════════════════
 */

export type Sex = "male" | "female";

/** Lookup the age decade bracket (20s, 30s, …, 70s+) */
function ageBracket(age: number): number {
  if (age < 20) return 20;
  if (age >= 70) return 70;
  return Math.floor(age / 10) * 10;
}

/** Convert a value + quantile anchors into a percentile via linear interp */
function valueToPercentile(
  value: number,
  anchors: { q: number; v: number }[],  // sorted by q
  higherIsBetter: boolean
): number {
  const sorted = [...anchors].sort((a, b) => a.q - b.q);
  // Clamp extremes
  if (value <= sorted[0].v) return higherIsBetter ? sorted[0].q : 100 - sorted[0].q;
  const last = sorted[sorted.length - 1];
  if (value >= last.v) return higherIsBetter ? last.q : 100 - last.q;
  // Interpolate
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (value >= a.v && value <= b.v) {
      const t = (value - a.v) / (b.v - a.v);
      const q = a.q + t * (b.q - a.q);
      return higherIsBetter ? q : 100 - q;
    }
  }
  return 50;
}

/* ═════════════════════════════════════════════════════════════════
 *  RESTING HEART RATE — bpm
 *
 *  Source: Nauman et al. 2011 (HUNT Study, n=50,088) &
 *  Palatini & Julius 1997. Percentiles reflect "lower is better"
 *  because low RHR = better cardiovascular conditioning.
 * ═══════════════════════════════════════════════════════════════ */

type AgeRHRTable = Record<number, { q: number; v: number }[]>;

const RHR_MALE: AgeRHRTable = {
  20: [{ q: 5, v: 49 }, { q: 25, v: 56 }, { q: 50, v: 62 }, { q: 75, v: 68 }, { q: 95, v: 78 }],
  30: [{ q: 5, v: 50 }, { q: 25, v: 57 }, { q: 50, v: 63 }, { q: 75, v: 69 }, { q: 95, v: 79 }],
  40: [{ q: 5, v: 51 }, { q: 25, v: 58 }, { q: 50, v: 64 }, { q: 75, v: 71 }, { q: 95, v: 81 }],
  50: [{ q: 5, v: 52 }, { q: 25, v: 60 }, { q: 50, v: 66 }, { q: 75, v: 73 }, { q: 95, v: 83 }],
  60: [{ q: 5, v: 53 }, { q: 25, v: 60 }, { q: 50, v: 67 }, { q: 75, v: 74 }, { q: 95, v: 85 }],
  70: [{ q: 5, v: 54 }, { q: 25, v: 61 }, { q: 50, v: 68 }, { q: 75, v: 75 }, { q: 95, v: 86 }],
};

const RHR_FEMALE: AgeRHRTable = {
  20: [{ q: 5, v: 54 }, { q: 25, v: 61 }, { q: 50, v: 67 }, { q: 75, v: 74 }, { q: 95, v: 83 }],
  30: [{ q: 5, v: 54 }, { q: 25, v: 62 }, { q: 50, v: 68 }, { q: 75, v: 75 }, { q: 95, v: 85 }],
  40: [{ q: 5, v: 55 }, { q: 25, v: 63 }, { q: 50, v: 69 }, { q: 75, v: 76 }, { q: 95, v: 86 }],
  50: [{ q: 5, v: 56 }, { q: 25, v: 64 }, { q: 50, v: 70 }, { q: 75, v: 77 }, { q: 95, v: 87 }],
  60: [{ q: 5, v: 56 }, { q: 25, v: 64 }, { q: 50, v: 70 }, { q: 75, v: 77 }, { q: 95, v: 88 }],
  70: [{ q: 5, v: 57 }, { q: 25, v: 65 }, { q: 50, v: 71 }, { q: 75, v: 78 }, { q: 95, v: 88 }],
};

export function rhrPercentile(rhr: number, age: number, sex: Sex): number {
  const table = sex === "male" ? RHR_MALE : RHR_FEMALE;
  const anchors = table[ageBracket(age)];
  // "Lower is better" — invert quantile
  return valueToPercentile(rhr, anchors, false);
}

/* ═════════════════════════════════════════════════════════════════
 *  HRV (SDNN) — ms
 *
 *  Apple Watch reports SDNN. Norms from:
 *    Umetani et al. 1998 (Task Force standards, n=260)
 *    Voss et al. 2015 (n=1906, age 25-74)
 *
 *  HRV decays ~0.5ms per year from age 25. Higher = better.
 * ═══════════════════════════════════════════════════════════════ */

const HRV_MALE: AgeRHRTable = {
  20: [{ q: 5, v: 30 }, { q: 25, v: 45 }, { q: 50, v: 62 }, { q: 75, v: 82 }, { q: 95, v: 110 }],
  30: [{ q: 5, v: 26 }, { q: 25, v: 40 }, { q: 50, v: 55 }, { q: 75, v: 73 }, { q: 95, v: 98 }],
  40: [{ q: 5, v: 22 }, { q: 25, v: 33 }, { q: 50, v: 46 }, { q: 75, v: 62 }, { q: 95, v: 85 }],
  50: [{ q: 5, v: 18 }, { q: 25, v: 28 }, { q: 50, v: 39 }, { q: 75, v: 52 }, { q: 95, v: 72 }],
  60: [{ q: 5, v: 15 }, { q: 25, v: 23 }, { q: 50, v: 32 }, { q: 75, v: 43 }, { q: 95, v: 60 }],
  70: [{ q: 5, v: 12 }, { q: 25, v: 19 }, { q: 50, v: 27 }, { q: 75, v: 36 }, { q: 95, v: 50 }],
};

const HRV_FEMALE: AgeRHRTable = {
  // Women ~5-10ms lower SDNN on average (Umetani 1998)
  20: [{ q: 5, v: 26 }, { q: 25, v: 40 }, { q: 50, v: 55 }, { q: 75, v: 73 }, { q: 95, v: 98 }],
  30: [{ q: 5, v: 22 }, { q: 25, v: 35 }, { q: 50, v: 48 }, { q: 75, v: 64 }, { q: 95, v: 87 }],
  40: [{ q: 5, v: 19 }, { q: 25, v: 29 }, { q: 50, v: 40 }, { q: 75, v: 55 }, { q: 95, v: 75 }],
  50: [{ q: 5, v: 16 }, { q: 25, v: 25 }, { q: 50, v: 34 }, { q: 75, v: 46 }, { q: 95, v: 63 }],
  60: [{ q: 5, v: 13 }, { q: 25, v: 21 }, { q: 50, v: 28 }, { q: 75, v: 38 }, { q: 95, v: 53 }],
  70: [{ q: 5, v: 11 }, { q: 25, v: 17 }, { q: 50, v: 24 }, { q: 75, v: 32 }, { q: 95, v: 45 }],
};

export function hrvPercentile(hrv: number, age: number, sex: Sex): number {
  const table = sex === "male" ? HRV_MALE : HRV_FEMALE;
  const anchors = table[ageBracket(age)];
  return valueToPercentile(hrv, anchors, true);
}

/* ═════════════════════════════════════════════════════════════════
 *  VO2 MAX — mL/kg/min
 *
 *  Source: ACSM's Guidelines for Exercise Testing & Prescription
 *  (11th ed.) + Kodama et al. 2009 meta-analysis (JAMA).
 *  STRONGEST predictor of all-cause mortality.
 * ═══════════════════════════════════════════════════════════════ */

const VO2_MALE: AgeRHRTable = {
  20: [{ q: 5, v: 34 }, { q: 25, v: 42 }, { q: 50, v: 48 }, { q: 75, v: 54 }, { q: 95, v: 61 }],
  30: [{ q: 5, v: 31 }, { q: 25, v: 38 }, { q: 50, v: 44 }, { q: 75, v: 50 }, { q: 95, v: 57 }],
  40: [{ q: 5, v: 28 }, { q: 25, v: 35 }, { q: 50, v: 41 }, { q: 75, v: 47 }, { q: 95, v: 53 }],
  50: [{ q: 5, v: 25 }, { q: 25, v: 32 }, { q: 50, v: 37 }, { q: 75, v: 43 }, { q: 95, v: 49 }],
  60: [{ q: 5, v: 22 }, { q: 25, v: 28 }, { q: 50, v: 33 }, { q: 75, v: 38 }, { q: 95, v: 44 }],
  70: [{ q: 5, v: 19 }, { q: 25, v: 24 }, { q: 50, v: 29 }, { q: 75, v: 34 }, { q: 95, v: 40 }],
};

const VO2_FEMALE: AgeRHRTable = {
  20: [{ q: 5, v: 27 }, { q: 25, v: 33 }, { q: 50, v: 38 }, { q: 75, v: 43 }, { q: 95, v: 49 }],
  30: [{ q: 5, v: 25 }, { q: 25, v: 31 }, { q: 50, v: 35 }, { q: 75, v: 40 }, { q: 95, v: 46 }],
  40: [{ q: 5, v: 23 }, { q: 25, v: 28 }, { q: 50, v: 33 }, { q: 75, v: 37 }, { q: 95, v: 43 }],
  50: [{ q: 5, v: 20 }, { q: 25, v: 26 }, { q: 50, v: 30 }, { q: 75, v: 34 }, { q: 95, v: 40 }],
  60: [{ q: 5, v: 18 }, { q: 25, v: 23 }, { q: 50, v: 27 }, { q: 75, v: 31 }, { q: 95, v: 36 }],
  70: [{ q: 5, v: 16 }, { q: 25, v: 20 }, { q: 50, v: 24 }, { q: 75, v: 28 }, { q: 95, v: 32 }],
};

export function vo2MaxPercentile(vo2: number, age: number, sex: Sex): number {
  const table = sex === "male" ? VO2_MALE : VO2_FEMALE;
  const anchors = table[ageBracket(age)];
  return valueToPercentile(vo2, anchors, true);
}

/** Map VO2 Max percentile to ACSM fitness category */
export function vo2MaxCategory(percentile: number): string {
  if (percentile >= 90) return "Exceptional";
  if (percentile >= 70) return "Excelent";
  if (percentile >= 40) return "Bun";
  if (percentile >= 20) return "Mediu";
  return "Scazut";
}

/* ═════════════════════════════════════════════════════════════════
 *  WALKING SPEED — m/s
 *
 *  Source: Studenski et al. 2011 (JAMA) "Gait Speed and Survival
 *  in Older Adults", n=34,485. Predictor of 10-year survival.
 *  Bohannon 1997 age norms for younger cohorts.
 * ═══════════════════════════════════════════════════════════════ */

const WALK_MALE: AgeRHRTable = {
  20: [{ q: 5, v: 1.10 }, { q: 25, v: 1.28 }, { q: 50, v: 1.39 }, { q: 75, v: 1.51 }, { q: 95, v: 1.67 }],
  30: [{ q: 5, v: 1.08 }, { q: 25, v: 1.26 }, { q: 50, v: 1.37 }, { q: 75, v: 1.48 }, { q: 95, v: 1.64 }],
  40: [{ q: 5, v: 1.05 }, { q: 25, v: 1.22 }, { q: 50, v: 1.34 }, { q: 75, v: 1.44 }, { q: 95, v: 1.60 }],
  50: [{ q: 5, v: 1.00 }, { q: 25, v: 1.18 }, { q: 50, v: 1.30 }, { q: 75, v: 1.40 }, { q: 95, v: 1.55 }],
  60: [{ q: 5, v: 0.92 }, { q: 25, v: 1.10 }, { q: 50, v: 1.23 }, { q: 75, v: 1.34 }, { q: 95, v: 1.50 }],
  70: [{ q: 5, v: 0.80 }, { q: 25, v: 0.98 }, { q: 50, v: 1.13 }, { q: 75, v: 1.25 }, { q: 95, v: 1.43 }],
};

const WALK_FEMALE: AgeRHRTable = {
  20: [{ q: 5, v: 1.05 }, { q: 25, v: 1.23 }, { q: 50, v: 1.34 }, { q: 75, v: 1.45 }, { q: 95, v: 1.60 }],
  30: [{ q: 5, v: 1.02 }, { q: 25, v: 1.21 }, { q: 50, v: 1.32 }, { q: 75, v: 1.43 }, { q: 95, v: 1.58 }],
  40: [{ q: 5, v: 1.00 }, { q: 25, v: 1.18 }, { q: 50, v: 1.29 }, { q: 75, v: 1.40 }, { q: 95, v: 1.55 }],
  50: [{ q: 5, v: 0.95 }, { q: 25, v: 1.12 }, { q: 50, v: 1.24 }, { q: 75, v: 1.35 }, { q: 95, v: 1.50 }],
  60: [{ q: 5, v: 0.86 }, { q: 25, v: 1.03 }, { q: 50, v: 1.15 }, { q: 75, v: 1.27 }, { q: 95, v: 1.43 }],
  70: [{ q: 5, v: 0.72 }, { q: 25, v: 0.89 }, { q: 50, v: 1.02 }, { q: 75, v: 1.14 }, { q: 95, v: 1.30 }],
};

export function walkingSpeedPercentile(speedMs: number, age: number, sex: Sex): number {
  const table = sex === "male" ? WALK_MALE : WALK_FEMALE;
  const anchors = table[ageBracket(age)];
  return valueToPercentile(speedMs, anchors, true);
}

/* ═════════════════════════════════════════════════════════════════
 *  PREDICTED MAX HEART RATE (for TRIMP)
 *
 *  Tanaka 2001 formula: HRmax = 208 − 0.7 × age
 *  More accurate than the classic 220−age (Fox 1971).
 * ═══════════════════════════════════════════════════════════════ */

export function predictedMaxHR(age: number): number {
  return 208 - 0.7 * age;
}

/* ═════════════════════════════════════════════════════════════════
 *  COMPOSITE: PERCENTILE → "YEARS OFFSET"
 *
 *  Converts a percentile into a "biological age offset" using the
 *  known decay rate of that biomarker with age.
 *
 *  Concept: if you're in the 80th percentile for your age, your
 *  biomarker value matches the 50th percentile of someone ~8 years
 *  younger. The mapping is calibrated per-biomarker from the rate
 *  of change across age decades.
 * ═══════════════════════════════════════════════════════════════ */

export function percentileToYearsOffset(percentile: number, maxOffset: number): number {
  // Map 0-100 percentile → ±maxOffset years (linear, centered at 50)
  // 90th percentile ≈ −maxOffset × 0.8 years
  // 10th percentile ≈ +maxOffset × 0.8 years
  const centered = (50 - percentile) / 50; // -1 to +1
  return centered * maxOffset;
}

/* ═════════════════════════════════════════════════════════════════
 *  MAX RECOMMENDED WEIGHTS per biomarker (evidence strength)
 *
 *  Based on effect sizes from published mortality studies.
 *  Used in BiologicalAge calculation.
 * ═══════════════════════════════════════════════════════════════ */

export const BIOMARKER_MAX_OFFSET: Record<string, number> = {
  vo2Max: 12,      // Kodama 2009: strongest single predictor
  hrv: 8,          // Voss 2015
  rhr: 6,          // Jensen 2013 (HUNT)
  walkingSpeed: 7, // Studenski 2011
  sleep: 5,        // Mander 2017
  activity: 5,     // Lee 2019 (JAMA pasi)
};
