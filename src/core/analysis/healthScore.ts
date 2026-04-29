/**
 * Shared health score utilities used by both NetworkSummaryReport
 * and NetworkHealthCheck to ensure consistent scoring and display.
 */

export interface HealthScoreInput {
  connectedComponents: number;
  avgDegree: number;
  protectionPct: number;
  srlgPct: number;
  nodeCount: number;
}

export interface HealthScoreResult {
  score: number;
  label: string;
}

/**
 * Compute a static network health score (0-100) based on
 * connectivity, redundancy, protection coverage, and SRLG coverage.
 *
 * Used in the "Network Summary Report" as a "Static Health Score".
 */
export function computeStaticHealthScore(input: HealthScoreInput): HealthScoreResult {
  const { connectedComponents, avgDegree, protectionPct, srlgPct, nodeCount } = input;

  if (nodeCount === 0) return { score: 0, label: 'N/A' };

  // Connectivity score (0-25): 1 component = 25, more = lower
  const connectivityScore =
    connectedComponents === 1 ? 25 : Math.max(0, 25 - (connectedComponents - 1) * 8);

  // Degree score (0-25): avg degree >= 3 is excellent
  const degreeScore = Math.min(25, (avgDegree / 3) * 25);

  // Protection score (0-25): % of services with protection
  const protScore = (protectionPct / 100) * 25;

  // SRLG score (0-25): % of edges with SRLG codes
  const srlgScore = (srlgPct / 100) * 25;

  const score = Math.round(connectivityScore + degreeScore + protScore + srlgScore);

  return { score: Math.min(100, score), label: getHealthLabel(score) };
}

/**
 * Get a human-readable label for a health score.
 */
export function getHealthLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Poor';
  return 'Critical';
}

/**
 * Get the theme color class for a health score.
 * Uses the standard color scale: 0-40 danger, 40-70 warning, 70-100 success.
 */
export function getHealthColor(score: number): string {
  if (score >= 70) return 'text-success';
  if (score >= 40) return 'text-warning';
  return 'text-danger';
}

/**
 * Get the border color CSS variable for a health score.
 */
export function getHealthBorderColor(score: number): string {
  if (score >= 70) return 'var(--color-success)';
  if (score >= 40) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

/**
 * Get the Tailwind border color class for a health score.
 */
export function getHealthBorderClass(score: number): string {
  if (score >= 70) return 'border-success/30';
  if (score >= 40) return 'border-warning/30';
  return 'border-danger/30';
}
