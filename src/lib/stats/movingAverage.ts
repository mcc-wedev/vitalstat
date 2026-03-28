/**
 * Simple Moving Average
 */
export function sma(data: number[], window: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < window - 1) return null;
    const slice = data.slice(i - window + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/**
 * Exponential Moving Average
 */
export function ema(data: number[], alpha: number): number[] {
  if (data.length === 0) return [];
  const result = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

/**
 * LOESS (Locally Estimated Scatterplot Smoothing)
 * Simplified implementation using weighted linear regression
 */
export function loess(
  xValues: number[],
  yValues: number[],
  bandwidth = 0.3
): number[] {
  const n = xValues.length;
  if (n === 0) return [];

  const span = Math.max(Math.floor(bandwidth * n), 3);
  const result: number[] = [];

  for (let i = 0; i < n; i++) {
    // Find distances to all points
    const distances = xValues.map((x, j) => ({
      dist: Math.abs(x - xValues[i]),
      x: x,
      y: yValues[j],
    }));

    // Sort by distance and take nearest `span` points
    distances.sort((a, b) => a.dist - b.dist);
    const neighbors = distances.slice(0, span);
    const maxDist = neighbors[neighbors.length - 1].dist || 1;

    // Tricube weight function
    const weights = neighbors.map((d) => {
      const u = d.dist / (maxDist * 1.001);
      return Math.pow(1 - Math.pow(u, 3), 3);
    });

    // Weighted linear regression
    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
    for (let j = 0; j < neighbors.length; j++) {
      const w = weights[j];
      const x = neighbors[j].x;
      const y = neighbors[j].y;
      sumW += w;
      sumWX += w * x;
      sumWY += w * y;
      sumWXX += w * x * x;
      sumWXY += w * x * y;
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    if (Math.abs(denom) < 1e-10) {
      result.push(sumWY / sumW);
    } else {
      const b = (sumW * sumWXY - sumWX * sumWY) / denom;
      const a = (sumWY - b * sumWX) / sumW;
      result.push(a + b * xValues[i]);
    }
  }

  return result;
}
