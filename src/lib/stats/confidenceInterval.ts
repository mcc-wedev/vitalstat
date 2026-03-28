/**
 * T-distribution critical values for 95% CI (two-tailed)
 * For df > 30, approximates to ~1.96
 */
function tCritical(df: number): number {
  if (df <= 0) return 1.96;
  // Lookup for small sample sizes
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042,
  };
  if (table[df]) return table[df];
  // Find nearest
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (df >= keys[i] && df <= keys[i + 1]) {
      const ratio = (df - keys[i]) / (keys[i + 1] - keys[i]);
      return table[keys[i]] * (1 - ratio) + table[keys[i + 1]] * ratio;
    }
  }
  return 1.96;
}

export interface CIResult {
  mean: number;
  lower: number;
  upper: number;
  marginOfError: number;
  n: number;
}

/**
 * Calculate 95% confidence interval for a sample
 */
export function confidenceInterval95(values: number[]): CIResult | null {
  const n = values.length;
  if (n < 2) return null;

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  const t = tCritical(n - 1);
  const moe = t * se;

  return {
    mean,
    lower: mean - moe,
    upper: mean + moe,
    marginOfError: moe,
    n,
  };
}

/**
 * Rolling confidence interval: at each point, compute CI for trailing window
 */
export function rollingCI(
  values: number[],
  windowSize = 30
): (CIResult | null)[] {
  return values.map((_, i) => {
    if (i < windowSize - 1) return null;
    const window = values.slice(i - windowSize + 1, i + 1);
    return confidenceInterval95(window);
  });
}
