import { describe, it, expect } from 'vitest';
import {
  linearRegression,
  linearForecast,
  compoundGrowthForecast,
  saturationForecast,
  generateDates,
} from '../GrowthModels';

describe('GrowthModels', () => {
  // ==========================================================================
  // generateDates
  // ==========================================================================
  describe('generateDates', () => {
    it('generates monthly dates for 1 year', () => {
      const dates = generateDates('2026-01-01', 1, 'monthly');
      expect(dates.length).toBe(13); // 0..12 inclusive
      expect(dates[0]).toBe('2026-01-01');
      expect(dates[12]).toBe('2027-01-01');
    });

    it('generates quarterly dates for 2 years', () => {
      const dates = generateDates('2026-01-01', 2, 'quarterly');
      expect(dates.length).toBe(9); // 0..8 inclusive
      expect(dates[0]).toBe('2026-01-01');
      expect(dates[4]).toBe('2027-01-01');
    });

    it('generates yearly dates for 3 years', () => {
      const dates = generateDates('2026-01-01', 3, 'yearly');
      expect(dates.length).toBe(4); // 0..3 inclusive
      expect(dates[0]).toBe('2026-01-01');
      expect(dates[3]).toBe('2029-01-01');
    });
  });

  // ==========================================================================
  // linearRegression
  // ==========================================================================
  describe('linearRegression', () => {
    it('computes correct slope and intercept for known dataset', () => {
      // y = 2x + 1: points (0,1), (1,3), (2,5), (3,7)
      const data = [
        { x: 0, y: 1 },
        { x: 1, y: 3 },
        { x: 2, y: 5 },
        { x: 3, y: 7 },
      ];
      const result = linearRegression(data);
      expect(result.slope).toBeCloseTo(2, 5);
      expect(result.intercept).toBeCloseTo(1, 5);
      expect(result.rSquared).toBeCloseTo(1, 5);
    });

    it('returns flat line for single data point', () => {
      const result = linearRegression([{ x: 5, y: 42 }]);
      expect(result.slope).toBe(0);
      expect(result.intercept).toBe(42);
      expect(result.rSquared).toBe(1);
    });

    it('throws error for empty dataset', () => {
      expect(() => linearRegression([])).toThrow('Cannot perform linear regression on empty dataset');
    });

    it('handles noisy data and produces reasonable R-squared', () => {
      const data = [
        { x: 0, y: 2 },
        { x: 1, y: 4.1 },
        { x: 2, y: 5.9 },
        { x: 3, y: 8.2 },
        { x: 4, y: 9.8 },
      ];
      const result = linearRegression(data);
      expect(result.slope).toBeGreaterThan(1.5);
      expect(result.slope).toBeLessThan(2.5);
      expect(result.rSquared).toBeGreaterThan(0.95);
    });
  });

  // ==========================================================================
  // linearForecast
  // ==========================================================================
  describe('linearForecast', () => {
    it('projects future values using regression', () => {
      const data = [
        { x: 0, y: 10 },
        { x: 1, y: 20 },
        { x: 2, y: 30 },
      ];
      const projected = linearForecast(data, [3, 4, 5]);
      expect(projected[0].y).toBeCloseTo(40, 0);
      expect(projected[1].y).toBeCloseTo(50, 0);
      expect(projected[2].y).toBeCloseTo(60, 0);
    });

    it('includes confidence intervals', () => {
      const data = [
        { x: 0, y: 10 },
        { x: 1, y: 20 },
        { x: 2, y: 30 },
      ];
      const projected = linearForecast(data, [5]);
      expect(projected[0].confidence.lower).toBeLessThanOrEqual(projected[0].y);
      expect(projected[0].confidence.upper).toBeGreaterThanOrEqual(projected[0].y);
    });

    it('clamps values to non-negative', () => {
      const data = [
        { x: 0, y: 5 },
        { x: 1, y: 3 },
        { x: 2, y: 1 },
      ];
      // Declining line: y = -2x + 5, at x=10 would be -15 but clamped to 0
      const projected = linearForecast(data, [10]);
      expect(projected[0].y).toBe(0);
    });
  });

  // ==========================================================================
  // compoundGrowthForecast
  // ==========================================================================
  describe('compoundGrowthForecast', () => {
    it('matches CAGR formula exactly for yearly interval', () => {
      const result = compoundGrowthForecast(100, 0.10, 3, 'yearly');
      // After 1 year: 100 * 1.10 = 110
      // After 2 years: 100 * 1.10^2 = 121
      // After 3 years: 100 * 1.10^3 = 133.1
      expect(result.length).toBe(4); // 0, 1, 2, 3
      expect(result[0].value).toBeCloseTo(100, 0);
      expect(result[1].value).toBeCloseTo(110, 0);
      expect(result[2].value).toBeCloseTo(121, 0);
      expect(result[3].value).toBeCloseTo(133.1, 0);
    });

    it('generates correct number of intervals for monthly', () => {
      const result = compoundGrowthForecast(50, 0.12, 2, 'monthly');
      // 2 years * 12 months + 1 (start) = 25
      expect(result.length).toBe(25);
    });

    it('generates correct number of intervals for quarterly', () => {
      const result = compoundGrowthForecast(50, 0.12, 2, 'quarterly');
      // 2 years * 4 quarters + 1 (start) = 9
      expect(result.length).toBe(9);
    });

    it('first point equals current value', () => {
      const result = compoundGrowthForecast(42, 0.2, 1, 'yearly');
      expect(result[0].value).toBeCloseTo(42);
    });

    it('confidence bands widen over time', () => {
      const result = compoundGrowthForecast(100, 0.1, 5, 'yearly');
      const firstMargin = result[1].confidence.upper - result[1].confidence.lower;
      const lastMargin = result[5].confidence.upper - result[5].confidence.lower;
      expect(lastMargin).toBeGreaterThan(firstMargin);
    });
  });

  // ==========================================================================
  // saturationForecast
  // ==========================================================================
  describe('saturationForecast', () => {
    it('approaches capacity asymptotically', () => {
      const result = saturationForecast(10, 100, 1.0, 10, 'yearly');
      // After many years, should approach but not exceed 100
      const lastValue = result[result.length - 1].value;
      expect(lastValue).toBeGreaterThan(90);
      expect(lastValue).toBeLessThanOrEqual(100);
    });

    it('never exceeds capacity', () => {
      const result = saturationForecast(50, 100, 2.0, 20, 'yearly');
      for (const point of result) {
        expect(point.value).toBeLessThanOrEqual(100);
      }
    });

    it('first point approximately equals current value', () => {
      const result = saturationForecast(30, 100, 0.5, 5, 'yearly');
      expect(result[0].value).toBeCloseTo(30, 0);
    });

    it('handles current value at capacity (flat line)', () => {
      const result = saturationForecast(100, 100, 0.5, 3, 'yearly');
      for (const point of result) {
        expect(point.value).toBe(100);
      }
    });

    it('handles zero current value', () => {
      const result = saturationForecast(0, 100, 0.5, 3, 'yearly');
      // Should start from a small fraction and grow
      expect(result[0].value).toBeGreaterThanOrEqual(0);
      expect(result[result.length - 1].value).toBeGreaterThan(result[0].value);
    });

    it('handles zero capacity', () => {
      const result = saturationForecast(50, 0, 0.5, 3, 'yearly');
      for (const point of result) {
        expect(point.value).toBe(0);
      }
    });
  });
});
