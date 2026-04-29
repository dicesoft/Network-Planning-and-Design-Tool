import { describe, it, expect } from 'vitest';
import { formatPercentDelta } from '../format-percent';

describe('formatPercentDelta', () => {
  it('renders neutral marker for exact zero', () => {
    expect(formatPercentDelta(0)).toBe('—');
    expect(formatPercentDelta(-0)).toBe('—');
  });

  it('renders neutral marker for non-finite values', () => {
    expect(formatPercentDelta(Number.NaN)).toBe('—');
    expect(formatPercentDelta(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatPercentDelta(Number.NEGATIVE_INFINITY)).toBe('—');
  });

  it('renders sub-1 absolute values with up to 3 fraction digits and explicit sign', () => {
    expect(formatPercentDelta(0.174)).toBe('+0.174%');
    // Intl.NumberFormat may emit U+2212 MINUS SIGN or ASCII '-' depending on ICU
    // bundled with the runtime; accept either.
    expect(formatPercentDelta(-0.001)).toMatch(/^[−-]0\.001%$/);
    expect(formatPercentDelta(0.13)).toBe('+0.13%');
  });

  it('renders >=1 absolute values as integers with explicit sign', () => {
    expect(formatPercentDelta(2)).toBe('+2%');
    expect(formatPercentDelta(-5)).toMatch(/^[−-]5%$/);
    // 5.4 rounds to 5 with maximumFractionDigits: 0.
    expect(formatPercentDelta(5.4)).toBe('+5%');
    expect(formatPercentDelta(99.6)).toBe('+100%');
  });

  it('switches formatters at the |value| = 1 boundary', () => {
    expect(formatPercentDelta(0.999)).toBe('+0.999%');
    expect(formatPercentDelta(1)).toBe('+1%');
  });
});
