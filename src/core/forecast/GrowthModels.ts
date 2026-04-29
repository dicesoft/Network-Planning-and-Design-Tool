/**
 * GrowthModels — Pure math forecasting functions
 *
 * Three models:
 * - Linear: Least-squares linear regression
 * - Compound Growth: CAGR-based exponential projection
 * - Saturation: Logistic S-curve (approaches capacity asymptotically)
 *
 * All functions are pure math with zero external dependencies.
 */

import type { ForecastInterval } from '@/types/forecast';

// ============================================================================
// HELPERS
// ============================================================================

/** Number of intervals per year for each interval type */
function intervalsPerYear(interval: ForecastInterval): number {
  switch (interval) {
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'yearly': return 1;
  }
}

/** Generate date strings from start date at the given interval */
export function generateDates(
  startDate: string,
  years: number,
  interval: ForecastInterval,
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const totalIntervals = Math.ceil(years * intervalsPerYear(interval));

  for (let i = 0; i <= totalIntervals; i++) {
    const d = new Date(start);
    switch (interval) {
      case 'monthly':
        d.setMonth(d.getMonth() + i);
        break;
      case 'quarterly':
        d.setMonth(d.getMonth() + i * 3);
        break;
      case 'yearly':
        d.setFullYear(d.getFullYear() + i);
        break;
    }
    dates.push(d.toISOString().slice(0, 10));
  }

  return dates;
}

// ============================================================================
// LINEAR FORECAST (Least-Squares Regression)
// ============================================================================

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
}

/**
 * Compute least-squares linear regression on (x, y) data.
 * Returns slope, intercept, and R-squared.
 */
export function linearRegression(
  data: { x: number; y: number }[],
): LinearRegressionResult {
  if (data.length === 0) {
    throw new Error('Cannot perform linear regression on empty dataset');
  }

  if (data.length === 1) {
    // Single point: flat line at that value, R² = 1
    return { slope: 0, intercept: data[0].y, rSquared: 1 };
  }

  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (const { x, y } of data) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) {
    return { slope: 0, intercept: sumY / n, rSquared: 1 };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (const { x, y } of data) {
    const predicted = slope * x + intercept;
    ssTot += (y - yMean) ** 2;
    ssRes += (y - predicted) ** 2;
  }

  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

/**
 * Linear forecast: project future values using least-squares regression.
 *
 * @param historicalData Array of { x, y } data points (x = time index, y = value)
 * @param futureX Array of future x values to project
 * @returns Projected { x, y, confidence } points
 */
export function linearForecast(
  historicalData: { x: number; y: number }[],
  futureX: number[],
): { x: number; y: number; confidence: { lower: number; upper: number } }[] {
  const { slope, intercept } = linearRegression(historicalData);

  // Compute standard error for confidence bands
  const n = historicalData.length;
  let ssRes = 0;
  for (const { x, y } of historicalData) {
    ssRes += (y - (slope * x + intercept)) ** 2;
  }
  const stdError = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  // Use 1.96 * stdError for ~95% confidence interval
  const confidenceMultiplier = 1.96;

  return futureX.map((x) => {
    const y = slope * x + intercept;
    const margin = confidenceMultiplier * stdError;
    return {
      x,
      y: Math.max(0, y),
      confidence: {
        lower: Math.max(0, y - margin),
        upper: y + margin,
      },
    };
  });
}

// ============================================================================
// COMPOUND GROWTH FORECAST (CAGR)
// ============================================================================

/**
 * Compound growth (CAGR) forecast.
 * Projects currentValue forward using: V * (1 + rate)^t
 *
 * @param currentValue Starting value
 * @param growthRate Annual growth rate as decimal (e.g. 0.15 = 15%)
 * @param years Number of years to project
 * @param interval Sampling interval
 * @returns Array of { intervalIndex, value, confidence } points
 */
export function compoundGrowthForecast(
  currentValue: number,
  growthRate: number,
  years: number,
  interval: ForecastInterval,
): { intervalIndex: number; value: number; confidence: { lower: number; upper: number } }[] {
  const ipy = intervalsPerYear(interval);
  const totalIntervals = Math.ceil(years * ipy);
  const ratePerInterval = Math.pow(1 + growthRate, 1 / ipy) - 1;
  const results: { intervalIndex: number; value: number; confidence: { lower: number; upper: number } }[] = [];

  for (let i = 0; i <= totalIntervals; i++) {
    const value = currentValue * Math.pow(1 + ratePerInterval, i);
    // Confidence widens with distance from current time
    const uncertaintyFactor = 0.1 * (i / ipy); // 10% per year
    const margin = value * uncertaintyFactor;
    results.push({
      intervalIndex: i,
      value,
      confidence: {
        lower: Math.max(0, value - margin),
        upper: value + margin,
      },
    });
  }

  return results;
}

// ============================================================================
// SATURATION FORECAST (Logistic S-Curve)
// ============================================================================

/**
 * Saturation (logistic S-curve) forecast.
 * Approaches capacity asymptotically, never exceeds it.
 *
 * Uses the logistic growth formula:
 *   V(t) = K / (1 + ((K - V0) / V0) * e^(-r*t))
 * where:
 *   K = capacity (carrying capacity)
 *   V0 = current value
 *   r = growth rate
 *   t = time in years
 *
 * @param currentValue Starting value
 * @param capacity Maximum capacity (carrying capacity)
 * @param growthRate Annual growth rate as decimal
 * @param years Number of years to project
 * @param interval Sampling interval
 * @returns Array of { intervalIndex, value, confidence } points
 */
export function saturationForecast(
  currentValue: number,
  capacity: number,
  growthRate: number,
  years: number,
  interval: ForecastInterval,
): { intervalIndex: number; value: number; confidence: { lower: number; upper: number } }[] {
  const ipy = intervalsPerYear(interval);
  const totalIntervals = Math.ceil(years * ipy);
  const results: { intervalIndex: number; value: number; confidence: { lower: number; upper: number } }[] = [];

  // Edge case: if current value >= capacity, flat line at capacity
  if (currentValue >= capacity || capacity <= 0) {
    for (let i = 0; i <= totalIntervals; i++) {
      const v = capacity > 0 ? Math.min(currentValue, capacity) : 0;
      results.push({ intervalIndex: i, value: v, confidence: { lower: v, upper: v } });
    }
    return results;
  }

  // Edge case: if current value is 0 or negative, start from a tiny fraction
  const v0 = Math.max(currentValue, capacity * 0.01);

  for (let i = 0; i <= totalIntervals; i++) {
    const t = i / ipy; // time in years
    const expTerm = Math.exp(-growthRate * t);
    const value = capacity / (1 + ((capacity - v0) / v0) * expTerm);

    // Confidence widens with distance
    const uncertaintyFactor = 0.05 * t; // 5% per year
    const margin = value * uncertaintyFactor;

    results.push({
      intervalIndex: i,
      value: Math.min(value, capacity), // Never exceed capacity
      confidence: {
        lower: Math.max(0, value - margin),
        upper: Math.min(capacity, value + margin),
      },
    });
  }

  return results;
}
