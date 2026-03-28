import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { meanStd } from "./zScore";

export interface RecoveryScore {
  total: number; // 0-100
  rhrScore: number; // 0-100
  hrvScore: number; // 0-100
  sleepScore: number; // 0-100
  hasEnoughData: boolean;
  message?: string;
}

const WEIGHTS = {
  rhr: 0.3,
  hrv: 0.4,
  sleep: 0.3,
};

/**
 * Recovery score for a given day based on personal baselines
 * Requires minimum 14 days of prior data for meaningful baselines
 */
export function calculateRecovery(
  rhrHistory: DailySummary[],
  hrvHistory: DailySummary[],
  sleepHistory: SleepNight[],
  targetDate: string
): RecoveryScore {
  // Need at least 14 days
  const minDays = 14;
  const rhrBefore = rhrHistory.filter((d) => d.date < targetDate);
  const hrvBefore = hrvHistory.filter((d) => d.date < targetDate);
  const sleepBefore = sleepHistory.filter((d) => d.date < targetDate);

  if (rhrBefore.length < minDays || hrvBefore.length < minDays) {
    return {
      total: 0,
      rhrScore: 0,
      hrvScore: 0,
      sleepScore: 0,
      hasEnoughData: false,
      message: `Need at least ${minDays} days of data (have ${Math.min(rhrBefore.length, hrvBefore.length)})`,
    };
  }

  // Get today's values
  const todayRHR = rhrHistory.find((d) => d.date === targetDate);
  const todayHRV = hrvHistory.find((d) => d.date === targetDate);
  const todaySleep = sleepHistory.find((d) => d.date === targetDate);

  // RHR Score: lower deviation from baseline = better
  // Use last 30 days for baseline
  const rhrBaseline = meanStd(rhrBefore.slice(-30).map((d) => d.mean));
  let rhrScore = 50; // default if no data today
  if (todayRHR && rhrBaseline.std > 0) {
    const z = (todayRHR.mean - rhrBaseline.mean) / rhrBaseline.std;
    // Higher RHR = worse recovery, so invert
    rhrScore = clamp(100 - Math.abs(z) * 25 - (z > 0 ? z * 10 : 0), 0, 100);
  }

  // HRV Score: higher = better, deviation below baseline = bad
  const hrvBaseline = meanStd(hrvBefore.slice(-30).map((d) => d.mean));
  let hrvScore = 50;
  if (todayHRV && hrvBaseline.std > 0) {
    const z = (todayHRV.mean - hrvBaseline.mean) / hrvBaseline.std;
    // Positive z = above baseline = good, negative = bad
    hrvScore = clamp(50 + z * 25, 0, 100);
  }

  // Sleep Score: efficiency * duration factor * deep sleep bonus
  let sleepScore = 50;
  if (todaySleep) {
    const efficiencyScore = todaySleep.efficiency * 100;
    // Duration: optimal 7-9h, penalize outside
    const hours = todaySleep.totalMinutes / 60;
    const durationFactor = hours >= 7 && hours <= 9
      ? 1
      : hours < 7
        ? hours / 7
        : Math.max(0.7, 1 - (hours - 9) * 0.1);
    // Deep sleep: should be ~15-20% of total
    const deepPct = todaySleep.stages.deep / Math.max(todaySleep.totalMinutes, 1);
    const deepBonus = deepPct >= 0.15 ? 10 : deepPct >= 0.10 ? 5 : 0;

    sleepScore = clamp(efficiencyScore * durationFactor + deepBonus, 0, 100);
  } else if (sleepBefore.length < minDays) {
    sleepScore = 50; // neutral if no sleep data
  }

  const total = Math.round(
    WEIGHTS.rhr * rhrScore +
    WEIGHTS.hrv * hrvScore +
    WEIGHTS.sleep * sleepScore
  );

  return {
    total: clamp(total, 0, 100),
    rhrScore: Math.round(rhrScore),
    hrvScore: Math.round(hrvScore),
    sleepScore: Math.round(sleepScore),
    hasEnoughData: true,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
