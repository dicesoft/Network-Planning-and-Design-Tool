/**
 * ExhaustiveSimulator - Combinatorial Multi-Failure Simulation Engine
 *
 * Generates all combinations of 1/2/3 edge failures + 0/1/2 node failures,
 * runs FailureSimulator for each, and produces lightweight summaries.
 *
 * Hard cap: 50,000 scenarios. Warn above 10,000.
 * Progress callbacks every 50 scenarios.
 * AbortController support for cancellation.
 */

import type { NetworkNode, NetworkEdge } from '@/types/network';
import type { Service } from '@/types/service';
import type {
  ExhaustiveConfig,
  ExhaustiveScenarioSummary,
} from '@/types/simulation';
import { FailureSimulator } from './FailureSimulator';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Hard cap on maximum scenarios to prevent runaway computation */
export const MAX_SCENARIOS = 50_000;

/** Threshold above which a warning should be shown to the user */
export const WARN_SCENARIOS = 10_000;

/** Progress callback interval (every N scenarios) */
const PROGRESS_INTERVAL = 50;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate all k-combinations of an array.
 * Returns an array of arrays, each containing k elements.
 */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  if (k === arr.length) return [arr.slice()];

  const result: T[][] = [];

  function recurse(start: number, combo: T[]) {
    if (combo.length === k) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      recurse(i + 1, combo);
      combo.pop();
    }
  }

  recurse(0, []);
  return result;
}

/**
 * Calculate C(n, k) — binomial coefficient.
 * Returns 0 if k > n.
 */
export function binomial(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  // Use the smaller k for efficiency
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

/**
 * Estimate the total number of scenarios for given config.
 * Sum of C(E, e) * C(N, n) for each edge/node failure count combination.
 */
export function estimateScenarioCount(
  edgeCount: number,
  nodeCount: number,
  config: ExhaustiveConfig
): number {
  let total = 0;

  for (let e = 1; e <= config.maxEdgeFailures; e++) {
    for (let n = 0; n <= config.maxNodeFailures; n++) {
      total += binomial(edgeCount, e) * Math.max(1, binomial(nodeCount, n));
    }
  }

  // Also add edge-only scenarios (node failures = 0)
  // Already included above since n starts at 0 and binomial(nodeCount, 0) = 1

  // Add node-only scenarios if maxEdgeFailures is 0 but maxNodeFailures > 0
  if (config.maxEdgeFailures === 0) {
    for (let n = 1; n <= config.maxNodeFailures; n++) {
      total += binomial(nodeCount, n);
    }
  }

  return total;
}

/**
 * Format estimated time based on scenario count.
 * Assumes ~25 scenarios/second on average hardware.
 */
export function estimateTime(scenarioCount: number): string {
  const seconds = Math.ceil(scenarioCount / 25);
  if (seconds < 60) return `~${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes}m`;
}

// ============================================================================
// SCENARIO GENERATOR
// ============================================================================

export interface FailureScenario {
  edgeIds: string[];
  nodeIds: string[];
}

/**
 * Generate all failure scenarios for a given config.
 * Returns an array of { edgeIds, nodeIds } to simulate.
 */
export function generateScenarios(
  edgeIds: string[],
  nodeIds: string[],
  config: ExhaustiveConfig
): FailureScenario[] {
  const scenarios: FailureScenario[] = [];

  // Generate edge failure combinations (1..maxEdgeFailures)
  const edgeCombos: string[][] = [];
  for (let e = Math.max(1, config.maxEdgeFailures === 0 ? 1 : 1); e <= config.maxEdgeFailures; e++) {
    edgeCombos.push(...combinations(edgeIds, e));
  }

  // If maxEdgeFailures is 0, we only have node-only scenarios
  if (config.maxEdgeFailures === 0 && config.maxNodeFailures > 0) {
    for (let n = 1; n <= config.maxNodeFailures; n++) {
      for (const nodeCombination of combinations(nodeIds, n)) {
        scenarios.push({ edgeIds: [], nodeIds: nodeCombination });
        if (scenarios.length >= MAX_SCENARIOS) return scenarios;
      }
    }
    return scenarios;
  }

  // Generate node failure combinations (0..maxNodeFailures)
  const nodeCombos: string[][] = [[]]; // always include "no node failures"
  for (let n = 1; n <= config.maxNodeFailures; n++) {
    nodeCombos.push(...combinations(nodeIds, n));
  }

  // Cross-product edge combos x node combos
  for (const edgeCombo of edgeCombos) {
    for (const nodeCombo of nodeCombos) {
      scenarios.push({ edgeIds: edgeCombo, nodeIds: nodeCombo });
      if (scenarios.length >= MAX_SCENARIOS) return scenarios;
    }
  }

  return scenarios;
}

// ============================================================================
// PROGRESS CALLBACK TYPE
// ============================================================================

export interface ExhaustiveProgressCallback {
  (completed: number, total: number, currentLabel: string): void;
}

// ============================================================================
// EXHAUSTIVE SIMULATOR
// ============================================================================

export class ExhaustiveSimulator {
  private simulator: FailureSimulator;

  constructor(
    getNodes: () => NetworkNode[],
    private getEdges: () => NetworkEdge[],
    getServices: () => Service[]
  ) {
    this.simulator = new FailureSimulator(getNodes, getEdges, getServices);
  }

  /**
   * Run all scenarios synchronously (used by the async runner in batches).
   * Processes a batch of scenarios and returns summaries.
   */
  simulateBatch(
    scenarios: FailureScenario[],
    startIndex: number,
    onProgress?: ExhaustiveProgressCallback,
    totalScenarios?: number
  ): ExhaustiveScenarioSummary[] {
    const summaries: ExhaustiveScenarioSummary[] = [];

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      const globalIndex = startIndex + i;

      const result = this.simulator.simulate(scenario.edgeIds, scenario.nodeIds);

      const atRiskCount = result.affectedServices.filter(
        (s) => s.status === 'at-risk'
      ).length;

      const temporaryOutageCount = result.affectedServices.filter(
        (s) => s.status === 'temporary-outage'
      ).length;

      summaries.push({
        scenarioId: `S-${String(globalIndex + 1).padStart(4, '0')}`,
        failedEdgeIds: scenario.edgeIds,
        failedNodeIds: scenario.nodeIds,
        survivabilityScore: result.survivabilityScore,
        downCount: result.downServices.length,
        survivedCount: result.survivedServices.length,
        atRiskCount,
        temporaryOutageCount,
        affectedCount: result.affectedServices.length,
        bandwidthAffected: result.totalBandwidthAffected,
      });

      // Progress callback every PROGRESS_INTERVAL scenarios
      if (onProgress && (globalIndex + 1) % PROGRESS_INTERVAL === 0) {
        const label = formatScenarioLabel(scenario);
        onProgress(globalIndex + 1, totalScenarios ?? scenarios.length, label);
      }
    }

    return summaries;
  }

  /**
   * Re-run a single scenario to get full detail (for expand-on-demand).
   */
  rerunScenario(failedEdgeIds: string[], failedNodeIds: string[]) {
    return this.simulator.simulate(failedEdgeIds, failedNodeIds);
  }

  /**
   * Get edge IDs from the topology (for scenario generation).
   */
  getEdgeIds(): string[] {
    return this.getEdges().map((e) => e.id);
  }
}

// ============================================================================
// LABEL FORMATTING
// ============================================================================

function formatScenarioLabel(scenario: FailureScenario): string {
  const parts: string[] = [];
  if (scenario.edgeIds.length > 0) {
    parts.push(`Edges: ${scenario.edgeIds.join(', ')}`);
  }
  if (scenario.nodeIds.length > 0) {
    parts.push(`Nodes: ${scenario.nodeIds.join(', ')}`);
  }
  return parts.join(' + ') || 'No failures';
}
