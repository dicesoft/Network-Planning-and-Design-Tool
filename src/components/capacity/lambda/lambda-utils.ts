/**
 * Shared helpers for lambda availability UI components.
 *
 * Thresholds are tuned for a 96-channel C-band system:
 *   - red (danger):  < 10 free channels  (~90%+ utilized)
 *   - yellow (warning): 10-30 free channels (~69-90% utilized)
 *   - green (success): > 30 free channels  (< 69% utilized)
 */

/** Return a Tailwind text-color class based on free-channel count. */
export function getLambdaCountColor(count: number): string {
  if (count > 30) return 'text-success';
  if (count >= 10) return 'text-warning';
  return 'text-danger';
}

/** Return a Tailwind bg-color class (10% opacity) based on free-channel count. */
export function getLambdaCountBg(count: number): string {
  if (count > 30) return 'bg-success/10';
  if (count >= 10) return 'bg-warning/10';
  return 'bg-danger/10';
}
