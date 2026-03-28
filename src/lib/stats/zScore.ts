/**
 * Calculate z-score for each value relative to a rolling window baseline
 */
export function zScores(
  values: number[],
  windowSize = 30
): (number | null)[] {
  return values.map((val, i) => {
    if (i < windowSize - 1) return null;
    const window = values.slice(i - windowSize + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance =
      window.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      (window.length - 1);
    const stddev = Math.sqrt(variance);
    if (stddev < 1e-10) return 0;
    return (val - mean) / stddev;
  });
}

/**
 * Check if a value is an anomaly (|z| > threshold)
 */
export function isAnomaly(z: number | null, threshold = 2): boolean {
  return z !== null && Math.abs(z) > threshold;
}

/**
 * Calculate mean and stddev for an array
 */
export function meanStd(values: number[]): { mean: number; std: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1 || 1);
  return { mean, std: Math.sqrt(variance) };
}
