/**
 * LambdaAnalyzer - E2E Lambda Availability Analysis Engine
 *
 * Analyzes end-to-end wavelength (lambda) availability across multiple candidate
 * paths between a source and destination node pair. Uses k-shortest path computation
 * combined with per-edge channel availability checking to identify the best path
 * for new L1 DWDM service provisioning.
 *
 * Key capabilities:
 * - K-shortest path enumeration between endpoints
 * - Per-path E2E lambda (channel) availability analysis
 * - Bottleneck edge identification per path
 * - Best-path ranking by available E2E lambda count
 */

import type { NetworkNode, NetworkEdge, NetworkTopology, NodeType } from '@/types/network';
import { GraphEngine } from '@/core/graph/GraphEngine';
import { PathFinder, type PathResult, type PathOptions } from '@/core/graph/PathFinder';
import {
  ChannelChecker,
  DEFAULT_CHANNEL_RANGE,
  type ChannelTopologyProvider,
} from '@/core/services/ChannelChecker';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Per-edge channel availability detail within a path
 */
export interface EdgeChannelDetail {
  edgeId: string;
  availableChannels: number[];
  usedChannels: number[];
  totalChannels: number;
}

/**
 * Lambda availability analysis for a single candidate path
 */
export interface PathLambdaAnalysis {
  /** Index of this path in the k-shortest results (0-based) */
  pathIndex: number;
  /** Ordered node IDs along the path */
  nodeIds: string[];
  /** Ordered edge IDs along the path */
  edgeIds: string[];
  /** Total path distance in km */
  totalDistance: number;
  /** Number of hops (edges) in the path */
  hopCount: number;
  /** E2E available channel numbers (common across all edges in continuous mode) */
  availableLambdas: number[];
  /** Count of E2E available lambdas */
  availableLambdaCount: number;
  /** Per-edge channel availability breakdown */
  perEdgeAvailability: EdgeChannelDetail[];
  /** Edge ID with the fewest available channels (bottleneck), or null if path has no edges */
  bottleneckEdgeId: string | null;
  /** Number of available channels on the bottleneck edge */
  bottleneckAvailableCount: number;
}

/**
 * Complete lambda availability report for a source-destination pair
 */
export interface LambdaAvailabilityReport {
  /** Source node ID */
  sourceNodeId: string;
  /** Destination node ID */
  destinationNodeId: string;
  /** Analysis results for each candidate path */
  paths: PathLambdaAnalysis[];
  /** Path with the most available E2E lambdas, or null if no paths found */
  bestPath: PathLambdaAnalysis | null;
  /** Number of paths that were analyzed */
  totalPathsAnalyzed: number;
  /** Maximum number of E2E lambdas available on any single path */
  maxE2ELambdas: number;
}

/**
 * Regeneration point suggestion
 */
export interface RegenerationPoint {
  /** Node ID where regeneration is suggested */
  nodeId: string;
  /** Node type (router or terminal) */
  nodeType: NodeType;
  /** Position in the path (0-based index into nodeIds) */
  pathPosition: number;
  /** Whether the node has available DWDM ports for regeneration */
  hasDWDMPortsAvailable: boolean;
}

/**
 * Lambda analysis with regeneration information
 */
export interface PathLambdaAnalysisWithRegen extends PathLambdaAnalysis {
  /** Suggested regeneration points along the path */
  regenerationPoints: RegenerationPoint[];
  /** Available lambdas considering regeneration segments */
  availableLambdasWithRegen: number;
  /** Per-segment availability when path is split at regeneration points */
  segments: {
    startNodeId: string;
    endNodeId: string;
    edgeIds: string[];
    availableLambdas: number;
  }[];
}

/**
 * Lambda availability report with regeneration option
 */
export interface LambdaAvailabilityReportWithRegen extends LambdaAvailabilityReport {
  /** Paths reanalyzed considering regeneration */
  pathsWithRegen: PathLambdaAnalysisWithRegen[];
  /** Best path considering regeneration */
  bestPathWithRegen: PathLambdaAnalysisWithRegen | null;
  /** Maximum E2E lambdas available with regeneration */
  maxE2ELambdasWithRegen: number;
}

/** Node types that can serve as regeneration points (OADMs perform OEO regeneration) */
export const REGEN_CAPABLE_NODE_TYPES: readonly NodeType[] = ['router', 'terminal', 'oadm'] as const;

/** Maximum path edge count for regeneration analysis */
export const MAX_REGEN_PATH_EDGES = 15;

// ============================================================================
// LAMBDA ANALYZER CLASS
// ============================================================================

/**
 * LambdaAnalyzer performs E2E lambda availability analysis across candidate paths.
 *
 * It combines PathFinder (for k-shortest path computation) with ChannelChecker
 * (for per-edge channel availability) to produce a comprehensive report of
 * wavelength availability between two endpoints.
 */
export class LambdaAnalyzer {
  private getNodes: () => NetworkNode[];
  private getEdges: () => NetworkEdge[];
  private channelChecker: ChannelChecker;

  constructor(
    getNodes: () => NetworkNode[],
    getEdges: () => NetworkEdge[]
  ) {
    this.getNodes = getNodes;
    this.getEdges = getEdges;

    // Create a ChannelTopologyProvider from the getters
    const provider: ChannelTopologyProvider = {
      getNode: (id: string) => getNodes().find((n) => n.id === id),
      getEdge: (id: string) => getEdges().find((e) => e.id === id),
      getEdges: () => getEdges(),
    };
    this.channelChecker = new ChannelChecker(provider);
  }

  // ==========================================================================
  // MAIN ANALYSIS
  // ==========================================================================

  /**
   * Analyze E2E lambda availability between source and destination.
   *
   * Finds up to k shortest paths and checks channel availability on each one.
   * Returns a report with per-path analysis, bottleneck identification, and
   * the best path ranked by available E2E lambda count.
   *
   * @param sourceNodeId - Source node ID
   * @param destinationNodeId - Destination node ID
   * @param k - Maximum number of candidate paths to evaluate (default: 5)
   * @param pathOptions - Optional path computation constraints
   * @returns Complete lambda availability report
   */
  analyzeE2EAvailability(
    sourceNodeId: string,
    destinationNodeId: string,
    k: number = 5,
    pathOptions?: PathOptions
  ): LambdaAvailabilityReport {
    // Build a fresh GraphEngine and PathFinder from current topology state
    const pathFinder = this.createPathFinder();

    // Find k-shortest paths between source and destination
    const pathResults = pathFinder.kShortestPaths(
      sourceNodeId,
      destinationNodeId,
      k,
      pathOptions
    );

    // Analyze each candidate path
    const analyzedPaths: PathLambdaAnalysis[] = pathResults.map(
      (pathResult, index) => this.analyzePathLambdas(pathResult, index)
    );

    // Determine the best path (most E2E available lambdas)
    const bestPath = this.selectBestPath(analyzedPaths);

    return {
      sourceNodeId,
      destinationNodeId,
      paths: analyzedPaths,
      bestPath,
      totalPathsAnalyzed: analyzedPaths.length,
      maxE2ELambdas: bestPath ? bestPath.availableLambdaCount : 0,
    };
  }

  // ==========================================================================
  // PATH ANALYSIS
  // ==========================================================================

  /**
   * Analyze lambda availability for a single path.
   *
   * Uses ChannelChecker.findCommonChannels for E2E continuous-mode availability,
   * and ChannelChecker.getAvailableChannels for per-edge breakdown.
   *
   * @param pathResult - Path result from PathFinder
   * @param pathIndex - Index of this path in the candidate list
   * @returns Lambda analysis for the path
   */
  private analyzePathLambdas(
    pathResult: PathResult,
    pathIndex: number
  ): PathLambdaAnalysis {
    const { path: nodeIds, edges: edgeIds, totalDistance, hopCount } = pathResult;

    // Handle empty path edge case
    if (edgeIds.length === 0) {
      return {
        pathIndex,
        nodeIds,
        edgeIds,
        totalDistance,
        hopCount,
        availableLambdas: [],
        availableLambdaCount: 0,
        perEdgeAvailability: [],
        bottleneckEdgeId: null,
        bottleneckAvailableCount: 0,
      };
    }

    // Get E2E common available channels (continuous mode: same lambda on all edges)
    const availableLambdas = this.channelChecker.findCommonChannels(edgeIds);

    // Build per-edge availability breakdown
    const totalChannels = DEFAULT_CHANNEL_RANGE.max - DEFAULT_CHANNEL_RANGE.min + 1;
    const perEdgeAvailability: EdgeChannelDetail[] = edgeIds.map((edgeId) => {
      const availableChannels = this.channelChecker.getAvailableChannels(edgeId);
      const usedChannels = this.computeUsedChannels(availableChannels, totalChannels);
      return {
        edgeId,
        availableChannels,
        usedChannels,
        totalChannels,
      };
    });

    // Identify the bottleneck edge (fewest available channels)
    const { bottleneckEdgeId, bottleneckAvailableCount } =
      this.findBottleneck(perEdgeAvailability);

    return {
      pathIndex,
      nodeIds,
      edgeIds,
      totalDistance,
      hopCount,
      availableLambdas,
      availableLambdaCount: availableLambdas.length,
      perEdgeAvailability,
      bottleneckEdgeId,
      bottleneckAvailableCount,
    };
  }

  // ==========================================================================
  // REGENERATION ANALYSIS
  // ==========================================================================

  /**
   * Analyze E2E lambda availability with regeneration consideration.
   *
   * For each candidate path, identifies intermediate nodes that can act as
   * regeneration points (router/terminal with available DWDM ports).
   * Splits the path into segments at regeneration points and computes
   * per-segment lambda availability. The minimum per-segment availability
   * becomes the effective E2E availability with regeneration.
   *
   * @param sourceNodeId - Source node ID
   * @param destinationNodeId - Destination node ID
   * @param minContiguous - Minimum contiguous lambdas required per segment
   * @param k - Maximum number of candidate paths (default: 5)
   * @param pathOptions - Optional path constraints
   */
  analyzeWithRegeneration(
    sourceNodeId: string,
    destinationNodeId: string,
    minContiguous: number = 1,
    k: number = 5,
    pathOptions?: PathOptions
  ): LambdaAvailabilityReportWithRegen {
    const baseReport = this.analyzeE2EAvailability(
      sourceNodeId,
      destinationNodeId,
      k,
      pathOptions
    );

    const nodes = this.getNodes();
    const nodeMap = new Map<string, NetworkNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    const pathsWithRegen: PathLambdaAnalysisWithRegen[] = baseReport.paths.map(
      (pathAnalysis) => this.analyzePathWithRegen(pathAnalysis, nodeMap, minContiguous)
    );

    let bestPathWithRegen: PathLambdaAnalysisWithRegen | null = null;
    let maxE2ELambdasWithRegen = 0;

    for (const pathRegen of pathsWithRegen) {
      if (pathRegen.availableLambdasWithRegen > maxE2ELambdasWithRegen) {
        maxE2ELambdasWithRegen = pathRegen.availableLambdasWithRegen;
        bestPathWithRegen = pathRegen;
      } else if (
        pathRegen.availableLambdasWithRegen === maxE2ELambdasWithRegen &&
        bestPathWithRegen &&
        pathRegen.totalDistance < bestPathWithRegen.totalDistance
      ) {
        bestPathWithRegen = pathRegen;
      }
    }

    return {
      ...baseReport,
      pathsWithRegen,
      bestPathWithRegen,
      maxE2ELambdasWithRegen,
    };
  }

  /**
   * Analyze a single path with regeneration points.
   */
  private analyzePathWithRegen(
    pathAnalysis: PathLambdaAnalysis,
    nodeMap: Map<string, NetworkNode>,
    minContiguous: number
  ): PathLambdaAnalysisWithRegen {
    if (pathAnalysis.edgeIds.length > MAX_REGEN_PATH_EDGES) {
      return {
        ...pathAnalysis,
        regenerationPoints: [],
        availableLambdasWithRegen: pathAnalysis.availableLambdaCount,
        segments: [{
          startNodeId: pathAnalysis.nodeIds[0],
          endNodeId: pathAnalysis.nodeIds[pathAnalysis.nodeIds.length - 1],
          edgeIds: pathAnalysis.edgeIds,
          availableLambdas: pathAnalysis.availableLambdaCount,
        }],
      };
    }

    const regenPoints: RegenerationPoint[] = [];
    for (let i = 1; i < pathAnalysis.nodeIds.length - 1; i++) {
      const nodeId = pathAnalysis.nodeIds[i];
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      if (REGEN_CAPABLE_NODE_TYPES.includes(node.type)) {
        const ports = node.ports || [];
        const dwdmPorts = ports.filter((p) => p.type === 'dwdm');
        const availableDwdmPorts = dwdmPorts.filter(
          (p) => p.status !== 'used' && !p.connectedEdgeId
        );

        regenPoints.push({
          nodeId,
          nodeType: node.type,
          pathPosition: i,
          hasDWDMPortsAvailable: availableDwdmPorts.length > 0,
        });
      }
    }

    // In planning mode, all regen-capable nodes are valid segment break points
    // regardless of current port availability (port status is advisory only)
    if (regenPoints.length === 0) {
      return {
        ...pathAnalysis,
        regenerationPoints: regenPoints,
        availableLambdasWithRegen: pathAnalysis.availableLambdaCount,
        segments: [{
          startNodeId: pathAnalysis.nodeIds[0],
          endNodeId: pathAnalysis.nodeIds[pathAnalysis.nodeIds.length - 1],
          edgeIds: pathAnalysis.edgeIds,
          availableLambdas: pathAnalysis.availableLambdaCount,
        }],
      };
    }

    const segmentBreaks = [0, ...regenPoints.map((rp) => rp.pathPosition), pathAnalysis.nodeIds.length - 1];
    const uniqueBreaks = Array.from(new Set(segmentBreaks)).sort((a, b) => a - b);

    const segments: PathLambdaAnalysisWithRegen['segments'] = [];
    let minSegmentLambdas = Infinity;

    for (let s = 0; s < uniqueBreaks.length - 1; s++) {
      const startIdx = uniqueBreaks[s];
      const endIdx = uniqueBreaks[s + 1];
      const segmentEdgeIds = pathAnalysis.edgeIds.slice(startIdx, endIdx);
      const startNodeId = pathAnalysis.nodeIds[startIdx];
      const endNodeId = pathAnalysis.nodeIds[endIdx];

      const segmentCommon = segmentEdgeIds.length > 0
        ? this.channelChecker.findCommonChannels(segmentEdgeIds)
        : [];

      let effectiveCount = segmentCommon.length;
      if (minContiguous > 1 && segmentCommon.length > 0) {
        effectiveCount = this.countContiguousBlocks(segmentCommon, minContiguous);
      }

      segments.push({
        startNodeId,
        endNodeId,
        edgeIds: segmentEdgeIds,
        availableLambdas: effectiveCount,
      });

      if (effectiveCount < minSegmentLambdas) {
        minSegmentLambdas = effectiveCount;
      }
    }

    const availableLambdasWithRegen = minSegmentLambdas === Infinity ? 0 : minSegmentLambdas;

    return {
      ...pathAnalysis,
      regenerationPoints: regenPoints,
      availableLambdasWithRegen,
      segments,
    };
  }

  /**
   * Count how many channels exist in contiguous blocks of at least `minSize`
   */
  private countContiguousBlocks(channels: number[], minSize: number): number {
    if (channels.length === 0) return 0;

    const sorted = [...channels].sort((a, b) => a - b);
    let count = 0;
    let currentBlockSize = 1;

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        currentBlockSize++;
      } else {
        if (currentBlockSize >= minSize) {
          count += currentBlockSize;
        }
        currentBlockSize = 1;
      }
    }
    if (currentBlockSize >= minSize) {
      count += currentBlockSize;
    }

    return count;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Create a PathFinder instance from the current topology state.
   * Builds a fresh GraphEngine each time to reflect the latest topology.
   */
  private createPathFinder(): PathFinder {
    const nodes = this.getNodes();
    const edges = this.getEdges();

    const topology: NetworkTopology = {
      id: 'lambda-analysis',
      name: 'Lambda Analysis Topology',
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
   * Compute the used channel numbers from available channels and total count.
   * Used channels = all channels minus available channels.
   */
  private computeUsedChannels(
    availableChannels: number[],
    totalChannels: number
  ): number[] {
    const availableSet = new Set(availableChannels);
    const used: number[] = [];
    for (let ch = DEFAULT_CHANNEL_RANGE.min; ch <= DEFAULT_CHANNEL_RANGE.min + totalChannels - 1; ch++) {
      if (!availableSet.has(ch)) {
        used.push(ch);
      }
    }
    return used;
  }

  /**
   * Find the bottleneck edge in a path (edge with fewest available channels).
   */
  private findBottleneck(
    perEdgeAvailability: EdgeChannelDetail[]
  ): { bottleneckEdgeId: string | null; bottleneckAvailableCount: number } {
    if (perEdgeAvailability.length === 0) {
      return { bottleneckEdgeId: null, bottleneckAvailableCount: 0 };
    }

    let bottleneckEdgeId: string | null = null;
    let bottleneckAvailableCount = Infinity;

    for (const edgeDetail of perEdgeAvailability) {
      if (edgeDetail.availableChannels.length < bottleneckAvailableCount) {
        bottleneckAvailableCount = edgeDetail.availableChannels.length;
        bottleneckEdgeId = edgeDetail.edgeId;
      }
    }

    return {
      bottleneckEdgeId,
      bottleneckAvailableCount:
        bottleneckAvailableCount === Infinity ? 0 : bottleneckAvailableCount,
    };
  }

  /**
   * Select the best path from analyzed candidates.
   * Best = most E2E available lambdas. Ties broken by shortest distance.
   */
  private selectBestPath(
    analyzedPaths: PathLambdaAnalysis[]
  ): PathLambdaAnalysis | null {
    if (analyzedPaths.length === 0) {
      return null;
    }

    let best = analyzedPaths[0];

    for (let i = 1; i < analyzedPaths.length; i++) {
      const candidate = analyzedPaths[i];

      // Primary: more E2E lambdas is better
      if (candidate.availableLambdaCount > best.availableLambdaCount) {
        best = candidate;
      } else if (candidate.availableLambdaCount === best.availableLambdaCount) {
        // Tiebreaker: shorter distance wins
        if (candidate.totalDistance < best.totalDistance) {
          best = candidate;
        }
      }
    }

    return best;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a LambdaAnalyzer instance from node and edge getters.
 */
export const createLambdaAnalyzer = (
  getNodes: () => NetworkNode[],
  getEdges: () => NetworkEdge[]
): LambdaAnalyzer => {
  return new LambdaAnalyzer(getNodes, getEdges);
};
