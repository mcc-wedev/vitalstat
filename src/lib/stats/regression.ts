/**
 * Simple linear regression: y = a + bx
 * Returns slope, intercept, R², p-value, and standard error
 */
export interface RegressionResult {
  slope: number;
  intercept: number;
  r2: number;
  r: number;
  pValue: number;
  n: number;
  slopePerDay: number; // slope normalized per day
  slopePerWeek: number;
  slopePerMonth: number;
  significant: boolean; // p < 0.05
}

export function linearRegression(
  xValues: number[],
  yValues: number[]
): RegressionResult | null {
  const n = xValues.length;
  if (n < 7) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xValues[i];
    sumY += yValues[i];
    sumXY += xValues[i] * yValues[i];
    sumX2 += xValues[i] * xValues[i];
    sumY2 += yValues[i] * yValues[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const ssRes = yValues.reduce((sum, y, i) => {
    const pred = intercept + slope * xValues[i];
    return sum + (y - pred) ** 2;
  }, 0);
  const meanY = sumY / n;
  const ssTot = yValues.reduce((sum, y) => sum + (y - meanY) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const r = Math.sqrt(r2) * (slope >= 0 ? 1 : -1);

  // P-value for slope (t-test)
  const se = Math.sqrt(ssRes / (n - 2));
  const seSlope = se / Math.sqrt(sumX2 - sumX * sumX / n);
  const tStat = seSlope > 0 ? Math.abs(slope / seSlope) : 0;
  const df = n - 2;
  const pValue = tDistPValue(tStat, df);

  return {
    slope,
    intercept,
    r2,
    r,
    pValue,
    n,
    slopePerDay: slope,
    slopePerWeek: slope * 7,
    slopePerMonth: slope * 30,
    significant: pValue < 0.05,
  };
}

/**
 * Run regression on DailySummary data
 * x = day index (0, 1, 2, ...), y = metric value
 */
export function trendRegression(
  values: number[]
): RegressionResult | null {
  const x = values.map((_, i) => i);
  return linearRegression(x, values);
}

// Two-tailed p-value from t-distribution (approximation)
function tDistPValue(t: number, df: number): number {
  if (df <= 0) return 1;
  const x = df / (df + t * t);
  // Regularized incomplete beta function approximation
  const a = df / 2;
  const b = 0.5;
  // Simple approximation using normal for large df
  if (df > 30) {
    const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + t * t / (2 * df));
    return 2 * (1 - normalCDF(Math.abs(z)));
  }
  // For small df, use rough approximation
  const z = t * Math.sqrt(df / (df + t * t));
  return 2 * (1 - normalCDF(Math.abs(z)));
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}
