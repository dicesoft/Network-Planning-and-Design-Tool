/**
 * Format a percentage delta value for display per FR-012 / FR-016.
 *
 * Rules:
 * - exact 0 → neutral marker (no sign, em-dash) so users distinguish "no change"
 *   from a tiny rounded-down delta.
 * - |value| < 1 → up to 3 fraction digits, sign always shown (+/−).
 * - |value| ≥ 1 → integer, sign always shown (+/−).
 *
 * The "%" suffix is appended in all non-zero cases.
 *
 * @example
 *   formatPercentDelta(0)        // '—'
 *   formatPercentDelta(0.174)    // '+0.174%'
 *   formatPercentDelta(-0.001)   // '−0.001%'
 *   formatPercentDelta(2)        // '+2%'
 *   formatPercentDelta(-5.4)     // '−5%'
 */
export function formatPercentDelta(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return '—';
  }
  const abs = Math.abs(value);
  const formatter =
    abs < 1
      ? new Intl.NumberFormat('en-US', { signDisplay: 'always', maximumFractionDigits: 3 })
      : new Intl.NumberFormat('en-US', { signDisplay: 'always', maximumFractionDigits: 0 });
  return `${formatter.format(value)}%`;
}
