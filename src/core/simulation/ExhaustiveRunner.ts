/**
 * ExhaustiveRunner - Async Iterator Runner with requestIdleCallback Batching
 *
 * Runs exhaustive simulation scenarios in batches, yielding to the main thread
 * every 50 scenarios via requestIdleCallback. Supports AbortController for
 * cancellation.
 *
 * Upgrade path: If profiling shows >5s main-thread blocking, this can be
 * migrated to a Web Worker. The async iterator interface remains the same;
 * only the batching mechanism changes (postMessage instead of rIC).
 */

import type { NetworkNode, NetworkEdge } from '@/types/network';
import type { Service } from '@/types/service';
import type {
  ExhaustiveConfig,
  ExhaustiveScenarioSummary,
  ExhaustiveResults,
} from '@/types/simulation';
import {
  ExhaustiveSimulator,
  generateScenarios,
  type FailureScenario,
} from './ExhaustiveSimulator';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Number of scenarios to process per batch before yielding to main thread */
const BATCH_SIZE = 50;

// ============================================================================
// TYPES
// ============================================================================

export interface ExhaustiveRunnerCallbacks {
  /** Called every BATCH_SIZE scenarios with progress info */
  onProgress: (completed: number, total: number, currentLabel: string) => void;
  /** Called when simulation completes successfully */
  onComplete: (results: ExhaustiveResults) => void;
  /** Called when simulation is aborted */
  onAbort: () => void;
  /** Called on error */
  onError: (error: Error) => void;
}

// ============================================================================
// YIELD TO MAIN THREAD
// ============================================================================

/**
 * Yield to the main thread using requestIdleCallback (with setTimeout fallback).
 * Returns a promise that resolves when the browser is idle.
 */
function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 100 });
    } else {
      // Fallback for environments without requestIdleCallback
      setTimeout(resolve, 0);
    }
  });
}

// ============================================================================
// RUNNER
// ============================================================================

/**
 * Run an exhaustive simulation with async batching.
 * Yields to the main thread every BATCH_SIZE scenarios.
 *
 * @param config - Exhaustive simulation configuration
 * @param getNodes - Getter for network nodes
 * @param getEdges - Getter for network edges
 * @param getServices - Getter for services
 * @param callbacks - Progress, completion, abort, and error callbacks
 * @param signal - AbortSignal for cancellation
 */
export async function runExhaustiveSimulation(
  config: ExhaustiveConfig,
  getNodes: () => NetworkNode[],
  getEdges: () => NetworkEdge[],
  getServices: () => Service[],
  callbacks: ExhaustiveRunnerCallbacks,
  signal: AbortSignal
): Promise<void> {
  const startTime = Date.now();

  try {
    // Create simulator
    const simulator = new ExhaustiveSimulator(getNodes, getEdges, getServices);

    // Generate all scenarios
    const edges = getEdges();
    const nodes = getNodes();
    const edgeIds = edges.map((e) => e.id);
    const nodeIds = nodes.map((n) => n.id);

    const scenarios: FailureScenario[] = generateScenarios(edgeIds, nodeIds, config);
    const total = scenarios.length;

    if (total === 0) {
      callbacks.onComplete({
        scenarios: [],
        config,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        bestScore: 100,
        worstScore: 100,
        avgScore: 100,
      });
      return;
    }

    // Process in batches
    const allSummaries: ExhaustiveScenarioSummary[] = [];
    let completed = 0;

    for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
      // Check for abort before each batch
      if (signal.aborted) {
        callbacks.onAbort();
        return;
      }

      const batchEnd = Math.min(batchStart + BATCH_SIZE, total);
      const batchScenarios = scenarios.slice(batchStart, batchEnd);

      // Run the batch synchronously
      const batchSummaries = simulator.simulateBatch(
        batchScenarios,
        batchStart,
        undefined, // no per-scenario progress within batch
        total
      );

      allSummaries.push(...batchSummaries);
      completed = batchEnd;

      // Report progress
      const lastScenario = batchScenarios[batchScenarios.length - 1];
      const label = formatLabel(lastScenario);
      callbacks.onProgress(completed, total, label);

      // Yield to main thread between batches
      if (batchEnd < total) {
        await yieldToMainThread();
      }
    }

    // Check abort one final time
    if (signal.aborted) {
      callbacks.onAbort();
      return;
    }

    // Compute aggregate stats in a single pass
    let bestScore = 0;
    let worstScore = 100;
    let totalScore = 0;

    for (const summary of allSummaries) {
      if (summary.survivabilityScore > bestScore) {
        bestScore = summary.survivabilityScore;
      }
      if (summary.survivabilityScore < worstScore) {
        worstScore = summary.survivabilityScore;
      }
      totalScore += summary.survivabilityScore;
    }

    const avgScore = allSummaries.length > 0
      ? Math.round(totalScore / allSummaries.length)
      : 100;

    callbacks.onComplete({
      scenarios: allSummaries,
      config,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      bestScore,
      worstScore,
      avgScore,
    });
  } catch (error) {
    if (signal.aborted) {
      callbacks.onAbort();
    } else {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function formatLabel(scenario: FailureScenario): string {
  const parts: string[] = [];
  if (scenario.edgeIds.length > 0) {
    parts.push(`Edges: ${scenario.edgeIds.join(', ')}`);
  }
  if (scenario.nodeIds.length > 0) {
    parts.push(`Nodes: ${scenario.nodeIds.join(', ')}`);
  }
  return parts.join(' + ') || 'No failures';
}
