import { describe, it, expect } from 'vitest';
import {
  computeStaticHealthScore,
  getHealthLabel,
  getHealthColor,
  getHealthBorderColor,
  getHealthBorderClass,
} from '../healthScore';

describe('computeStaticHealthScore', () => {
  it('returns N/A for empty network', () => {
    const result = computeStaticHealthScore({
      connectedComponents: 0,
      avgDegree: 0,
      protectionPct: 0,
      srlgPct: 0,
      nodeCount: 0,
    });
    expect(result.score).toBe(0);
    expect(result.label).toBe('N/A');
  });

  it('returns Excellent for fully connected, high-degree, fully protected network', () => {
    const result = computeStaticHealthScore({
      connectedComponents: 1,
      avgDegree: 3,
      protectionPct: 100,
      srlgPct: 100,
      nodeCount: 10,
    });
    expect(result.score).toBe(100);
    expect(result.label).toBe('Excellent');
  });

  it('returns lower score for fragmented network', () => {
    const result = computeStaticHealthScore({
      connectedComponents: 4,
      avgDegree: 1,
      protectionPct: 0,
      srlgPct: 0,
      nodeCount: 10,
    });
    expect(result.score).toBeLessThan(20);
    expect(result.label).toBe('Critical');
  });

  it('penalizes multiple connected components', () => {
    const single = computeStaticHealthScore({
      connectedComponents: 1,
      avgDegree: 2,
      protectionPct: 50,
      srlgPct: 50,
      nodeCount: 10,
    });
    const multi = computeStaticHealthScore({
      connectedComponents: 3,
      avgDegree: 2,
      protectionPct: 50,
      srlgPct: 50,
      nodeCount: 10,
    });
    expect(single.score).toBeGreaterThan(multi.score);
  });

  it('caps score at 100', () => {
    const result = computeStaticHealthScore({
      connectedComponents: 1,
      avgDegree: 10,
      protectionPct: 100,
      srlgPct: 100,
      nodeCount: 10,
    });
    expect(result.score).toBe(100);
  });
});

describe('getHealthLabel', () => {
  it('returns correct labels for score ranges', () => {
    expect(getHealthLabel(90)).toBe('Excellent');
    expect(getHealthLabel(80)).toBe('Excellent');
    expect(getHealthLabel(70)).toBe('Good');
    expect(getHealthLabel(50)).toBe('Fair');
    expect(getHealthLabel(30)).toBe('Poor');
    expect(getHealthLabel(10)).toBe('Critical');
  });
});

describe('getHealthColor', () => {
  it('returns success for high scores', () => {
    expect(getHealthColor(80)).toBe('text-success');
    expect(getHealthColor(70)).toBe('text-success');
  });

  it('returns warning for medium scores', () => {
    expect(getHealthColor(50)).toBe('text-warning');
    expect(getHealthColor(40)).toBe('text-warning');
  });

  it('returns danger for low scores', () => {
    expect(getHealthColor(30)).toBe('text-danger');
    expect(getHealthColor(0)).toBe('text-danger');
  });
});

describe('getHealthBorderColor', () => {
  it('returns correct CSS variable per range', () => {
    expect(getHealthBorderColor(80)).toBe('var(--color-success)');
    expect(getHealthBorderColor(50)).toBe('var(--color-warning)');
    expect(getHealthBorderColor(20)).toBe('var(--color-danger)');
  });
});

describe('getHealthBorderClass', () => {
  it('returns correct Tailwind class per range', () => {
    expect(getHealthBorderClass(80)).toBe('border-success/30');
    expect(getHealthBorderClass(50)).toBe('border-warning/30');
    expect(getHealthBorderClass(20)).toBe('border-danger/30');
  });
});
