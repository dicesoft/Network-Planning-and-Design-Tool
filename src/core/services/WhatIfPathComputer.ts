/**
 * WhatIfPathComputer - Path computation for What-If analysis
 *
 * Integrates PathFinder with node-type filtering to compute working
 * and protection paths for what-if service simulations.
 * Excludes passive node types (osp-termination) from DWDM paths.
 */

import type { NetworkNode, NetworkEdge, NetworkTopology, NodeType } from '@/types/network';
import type { ServiceType, ModulationType, ProtectionScheme, L1DataRate } from '@/types/service';
import { GraphEngine } from '@/core/graph/GraphEngine';
import { PathFinder, type PathOptions } from '@/core/graph/PathFinder';
import { MODULATION_REACH_LIMITS } from '@/core/services/L1ServiceManager';
import type { CapacityTracker, WhatIfResult } from '@/core/services/CapacityTracker';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for a what-if service simulation
 */
export interface WhatIfServiceConfig {
  sourceNodeId: string;
  destinationNodeId: string;
  serviceType: ServiceType;
  dataRate: L1DataRate;
  modulation?: ModulationType;
  protection: ProtectionScheme;
  channelNumber?: number;
  quantity: number;
}

/**
 * Computed path result with node/edge sequences
 */
export interface ComputedPath {
  nodeIds: string[];
  edgeIds: string[];
  totalDistance: number;
  hopCount: number;
}

/**
 * Full what-if path computation result
 */
export interface WhatIfPathResult {
  config: WhatIfServiceConfig;
  workingPath: ComputedPath | null;
  protectionPath: ComputedPath | null;
  alternativePaths?: ComputedPath[];
  feasible: boolean;
  reason?: string;
  warnings?: string[];
}

/**
 * Virtual capacity state for cumulative batch simulation.
 * Tracks channel additions/removals across batch items so each
 * subsequent item sees the impact of previous ones.
 */
export interface VirtualCapacityState {
  /** Map of edgeId -> set of additionally occupied channel indices */
  additionalChannelsUsed: Map<string, Set<number>>;
  /** Map of edgeId -> set of freed channel indices */
  freedChannels: Map<string, Set<number>>;
}

/** Node types excluded from DWDM path computation (amplifiers are valid transit nodes) */
const EXCLUDED_DWDM_NODE_TYPES: readonly NodeType[] = ['osp-termination'] as const;

// ============================================================================
// WHAT-IF PATH COMPUTER CLASS
// ============================================================================

export class WhatIfPathComputer {
  private getNodes: () => NetworkNode[];
  private getEdges: () => NetworkEdge[];

  constructor(
    getNodes: () => NetworkNode[],
    getEdges: () => NetworkEdge[]
  ) {
    this.getNodes = getNodes;
    this.getEdges = getEdges;
  }

  // ==========================================================================
  // SINGLE SERVICE PATH COMPUTATION
  // ==========================================================================

  /**
   * Compute working and protection paths for a what-if service config.
   * Filters out passive node types from DWDM path computation.
   */
  computePaths(config: WhatIfServiceConfig): WhatIfPathResult {
    const nodes = this.getNodes();
    const edges = this.getEdges();

    // Validate source and destination exist
    const sourceNode = nodes.find((n) => n.id === config.sourceNodeId);
    const destNode = nodes.find((n) => n.id === config.destinationNodeId);

    if (!sourceNode || !destNode) {
      return {
        config,
        workingPath: null,
        protectionPath: null,
        feasible: false,
        reason: 'Source or destination node not found',
      };
    }

    // Build filtered topology (exclude passive node types from intermediate nodes)
    const excludeNodeIds = this.getExcludedNodeIds(nodes, config);
    const pathFinder = this.createPathFinder(nodes, edges);

    // Compute k shortest paths (k=5) to find multiple candidates
    const workingPathOptions: PathOptions = {
      excludeNodes: excludeNodeIds,
    };

    const kResults = pathFinder.kShortestPaths(
      config.sourceNodeId,
      config.destinationNodeId,
      5,
      workingPathOptions
    );

    if (kResults.length === 0) {
      return {
        config,
        workingPath: null,
        protectionPath: null,
        feasible: false,
        reason: 'No working path found between source and destination',
      };
    }

    // Best (shortest) path is the working path
    const workingResult = kResults[0];
    const workingPath: ComputedPath = {
      nodeIds: workingResult.path,
      edgeIds: workingResult.edges,
      totalDistance: workingResult.totalDistance,
      hopCount: workingResult.hopCount,
    };

    // Collect alternative paths (remaining candidates, excluding the working path)
    const alternativePaths: ComputedPath[] = kResults.slice(1).map((r) => ({
      nodeIds: r.path,
      edgeIds: r.edges,
      totalDistance: r.totalDistance,
      hopCount: r.hopCount,
    }));

    // Compute protection path if required (edge-disjoint from working path)
    let protectionPath: ComputedPath | null = null;
    if (config.protection !== 'none') {
      const protectionResult = pathFinder.shortestPath(
        config.sourceNodeId,
        config.destinationNodeId,
        {
          ...workingPathOptions,
          excludeEdges: workingResult.edges,
        }
      );

      if (protectionResult) {
        protectionPath = {
          nodeIds: protectionResult.path,
          edgeIds: protectionResult.edges,
          totalDistance: protectionResult.totalDistance,
          hopCount: protectionResult.hopCount,
        };
      }
    }

    // Modulation reach validation for L1 DWDM services
    const warnings: string[] = [];
    if (config.serviceType === 'l1-dwdm' && config.modulation) {
      const maxReach = MODULATION_REACH_LIMITS[config.modulation];
      if (maxReach !== undefined) {
        // Check working path reach
        if (workingPath.totalDistance > maxReach) {
          return {
            config,
            workingPath: null,
            protectionPath: null,
            feasible: false,
            reason: `Working path distance (${workingPath.totalDistance.toFixed(1)} km) exceeds ${config.modulation} reach limit (${maxReach} km)`,
          };
        }

        // Check protection path reach (warning only, not infeasible)
        if (protectionPath && protectionPath.totalDistance > maxReach) {
          warnings.push(
            `Protection path distance (${protectionPath.totalDistance.toFixed(1)} km) exceeds ${config.modulation} reach limit (${maxReach} km). Protection path is infeasible.`
          );
          protectionPath = null;
        }
      }
    }

    return {
      config,
      workingPath,
      protectionPath,
      alternativePaths: alternativePaths.length > 0 ? alternativePaths : undefined,
      feasible: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // ==========================================================================
  // BATCH SIMULATION WITH VIRTUAL CAPACITY STATE
  // ==========================================================================

  /**
   * Create a fresh virtual capacity state for batch simulation
   */
  createVirtualState(): VirtualCapacityState {
    return {
      additionalChannelsUsed: new Map(),
      freedChannels: new Map(),
    };
  }

  /**
   * Compute paths for a batch of what-if configs, with cumulative
   * capacity tracking across batch items. Each item sees the impact
   * of previous items via VirtualCapacityState.
   */
  computeBatchPaths(
    configs: WhatIfServiceConfig[],
    virtualState?: VirtualCapacityState
  ): WhatIfPathResult[] {
    const state = virtualState ?? this.createVirtualState();
    const results: WhatIfPathResult[] = [];

    for (const config of configs) {
      const result = this.computePaths(config);
      results.push(result);

      // Update virtual state if path is feasible
      if (result.feasible && result.workingPath) {
        this.applyToVirtualState(state, result, config);
      }
    }

    return results;
  }

  /**
   * Compute paths AND run capacity simulation for a batch of configs.
   * Each entry simulates against a single accumulating VirtualCapacityState
   * so per-entry `before` counts reflect prior batch entries' allocations.
   * Single-call replacement for the previous WhatIfAnalysis.tsx walk.
   */
  simulateBatch(
    configs: WhatIfServiceConfig[],
    tracker: Pick<CapacityTracker, 'simulateServiceAdditionWithPath' | 'getNetworkUtilization'>,
    virtualState?: VirtualCapacityState
  ): { paths: WhatIfPathResult[]; simResults: WhatIfResult[] } {
    const state = virtualState ?? this.createVirtualState();
    const paths: WhatIfPathResult[] = [];
    const simResults: WhatIfResult[] = [];

    for (const config of configs) {
      const cp = this.computePaths(config);
      paths.push(cp);

      if (cp.feasible && cp.workingPath) {
        const channelsRequired = this.getChannelsRequired(cp.config);
        const sim = tracker.simulateServiceAdditionWithPath({
          workingPath: cp.workingPath,
          protectionPath: cp.protectionPath,
          channelsRequired,
          quantity: cp.config.quantity,
          virtualState: state,
        });
        simResults.push(sim);

        // Accrue this entry's allocations into the state so subsequent
        // entries observe the cumulative impact.
        const total = channelsRequired * cp.config.quantity;
        const allEdgeIds = new Set<string>([
          ...cp.workingPath.edgeIds,
          ...(cp.protectionPath?.edgeIds ?? []),
        ]);
        for (const edgeId of allEdgeIds) {
          if (!state.additionalChannelsUsed.has(edgeId)) {
            state.additionalChannelsUsed.set(edgeId, new Set());
          }
          const ch = state.additionalChannelsUsed.get(edgeId)!;
          const base = ch.size;
          for (let k = 0; k < total; k++) ch.add(base + k);
        }
      } else {
        const baseline = tracker.getNetworkUtilization();
        simResults.push({
          feasible: false,
          reason: cp.reason || 'No path found',
          affectedEdges: [],
          networkUtilizationBefore: baseline,
          networkUtilizationAfter: baseline,
          networkUtilizationDelta: 0,
          summary: { fullNetworkNetChange: 0, edgesAffected: 0, newBottlenecks: 0 },
        });
      }
    }

    return { paths, simResults };
  }

  /**
   * Get the total number of virtual channels used on an edge,
   * accounting for the cumulative batch state.
   */
  getVirtualChannelsUsed(state: VirtualCapacityState, edgeId: string): number {
    const added = state.additionalChannelsUsed.get(edgeId)?.size ?? 0;
    const freed = state.freedChannels.get(edgeId)?.size ?? 0;
    return added - freed;
  }

  /**
   * Get the set of all edges affected by the virtual state
   */
  getAffectedEdges(state: VirtualCapacityState): string[] {
    const edges = new Set<string>();
    for (const edgeId of state.additionalChannelsUsed.keys()) {
      edges.add(edgeId);
    }
    for (const edgeId of state.freedChannels.keys()) {
      edges.add(edgeId);
    }
    return Array.from(edges);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Get node IDs that should be excluded from path computation.
   * For DWDM services: exclude osp-termination nodes
   * (except the source/destination themselves).
   */
  private getExcludedNodeIds(
    nodes: NetworkNode[],
    config: WhatIfServiceConfig
  ): string[] {
    if (config.serviceType !== 'l1-dwdm') {
      return [];
    }

    return nodes
      .filter(
        (n) =>
          EXCLUDED_DWDM_NODE_TYPES.includes(n.type) &&
          n.id !== config.sourceNodeId &&
          n.id !== config.destinationNodeId
      )
      .map((n) => n.id);
  }

  /**
   * Create a PathFinder from the current topology
   */
  private createPathFinder(
    nodes: NetworkNode[],
    edges: NetworkEdge[]
  ): PathFinder {
    const topology: NetworkTopology = {
      id: 'whatif-analysis',
      name: 'What-If Analysis Topology',
      version: '1.0',
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
      },
      nodes,
      edges,
    };

    const graphEngine = new GraphEngine();
    graphEngine.loadFromTopology(topology);
    return new PathFinder(graphEngine);
  }

  /**
   * Apply a successful what-if result to the virtual capacity state.
   * Marks channels as used on all edges in the working + protection paths.
   */
  private applyToVirtualState(
    state: VirtualCapacityState,
    result: WhatIfPathResult,
    config: WhatIfServiceConfig
  ): void {
    const channelsRequired = this.getChannelsRequired(config);
    const allEdgeIds = new Set<string>();

    if (result.workingPath) {
      for (const eid of result.workingPath.edgeIds) {
        allEdgeIds.add(eid);
      }
    }
    if (result.protectionPath) {
      for (const eid of result.protectionPath.edgeIds) {
        allEdgeIds.add(eid);
      }
    }

    for (const edgeId of allEdgeIds) {
      if (!state.additionalChannelsUsed.has(edgeId)) {
        state.additionalChannelsUsed.set(edgeId, new Set());
      }
      const edgeChannels = state.additionalChannelsUsed.get(edgeId)!;

      // Use sequential virtual channel indices to track count
      const baseIndex = edgeChannels.size;
      for (let i = 0; i < channelsRequired * config.quantity; i++) {
        edgeChannels.add(baseIndex + i);
      }
    }
  }

  /**
   * Determine how many channels a service config requires per edge.
   * L1 DWDM: 1 channel per service (4 for 400G super-channels).
   * L2/L3: 1 channel each, since they ride on L1 underlay services
   * that each consume one DWDM channel.
   */
  getChannelsRequired(config: WhatIfServiceConfig): number {
    if (config.serviceType === 'l1-dwdm') {
      return config.dataRate === '400G' ? 4 : 1;
    }
    // L2/L3 services consume 1 L1 underlay channel each
    return 1;
  }
}
