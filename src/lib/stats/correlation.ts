/**
 * Pearson correlation coefficient
 */
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );
  if (Math.abs(den) < 1e-10) return 0;
  return num / den;
}

/**
 * P-value approximation for Pearson r (two-tailed)
 * Uses t-distribution approximation
 */
export function pearsonPValue(r: number, n: number): number {
  if (n < 3) return 1;
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const df = n - 2;
  // Approximation using normal distribution for large df
  if (df > 30) {
    return 2 * (1 - normalCDF(Math.abs(t)));
  }
  // For small df, rough approximation
  return 2 * (1 - normalCDF(Math.abs(t) * Math.sqrt(df / (df + t * t))));
}

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Lagged correlation: correlate x[t] with y[t + lag]
 */
export function laggedCorrelation(
  x: number[],
  y: number[],
  maxLag = 7
): { lag: number; r: number; p: number }[] {
  const results: { lag: number; r: number; p: number }[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const xSlice: number[] = [];
    const ySlice: number[] = [];
    for (let i = 0; i < x.length; i++) {
      const j = i + lag;
      if (j >= 0 && j < y.length) {
        xSlice.push(x[i]);
        ySlice.push(y[j]);
      }
    }
    const r = pearson(xSlice, ySlice);
    const p = pearsonPValue(r, xSlice.length);
    results.push({ lag, r, p });
  }
  return results;
}
