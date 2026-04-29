/**
 * DefragmentationEngine - Lambda Spectrum Defragmentation Analysis
 *
 * Analyzes spectrum fragmentation across edges and plans defragmentation
 * strategies to maximize contiguous free spectrum blocks.
 */

import type { NetworkEdge, NetworkNode } from '@/types/network';
import type { Service } from '@/types/service';
import { isL1DWDMService } from '@/types/service';
import { CapacityTracker, createStoreDataProvider, type LambdaMapEntry } from './CapacityTracker';

type ServiceStatusForRisk = 'planned' | 'provisioning' | 'active' | 'failed' | 'maintenance' | 'decommissioned';

// ============================================================================
// TYPES
// ============================================================================

export interface EdgeFragmentation {
  edgeId: string;
  edgeName: string;
  fragmentationIndex: number; // 0 = perfect, 1 = max fragmented
  totalChannels: number;
  usedChannels: number;
  freeChannels: number;
  largestContiguousBlock: number;
  fragments: FragmentBlock[];
}

export interface FragmentBlock {
  startChannel: number;
  endChannel: number;
  size: number;
  status: 'free' | 'allocated' | 'reserved';
}

export type DefragStrategy = 'minimal_moves' | 'maximize_contiguous' | 'balance_spectrum';

export type DefragRiskLevel = 'low' | 'medium' | 'high';

export interface DefragMove {
  edgeId: string;
  serviceId: string;
  fromChannel: number;
  toChannel: number;
  risk?: DefragRiskLevel;
  riskReason?: string;
  estimatedDowntime?: number; // seconds
}

export type DefragNoMoveReason = 'no-fragmentation' | 'single-allocation' | 'no-allocations';

export interface DefragPlan {
  id: string;
  strategy: DefragStrategy;
  targetEdgeIds: string[];
  /** Subset of targetEdgeIds that actually had moves planned (not skipped due to cap). */
  processedEdgeIds: string[];
  /** True iff the global maxMoves cap was reached and one or more target edges were skipped. */
  truncated: boolean;
  /** Effective cap used for this run. Clamped to [1, 5000]. */
  maxMoves: number;
  moves: DefragMove[];
  /** When moves is empty, explains why no defragmentation is needed */
  reason?: DefragNoMoveReason;
  beforeMetrics: { avgFragmentation: number; worstFragmentation: number };
  afterMetrics: { avgFragmentation: number; worstFragmentation: number };
  estimatedImpact: {
    servicesAffected: number;
    totalMoves: number;
    estimatedDowntime: number; // total seconds
    riskSummary: { low: number; medium: number; high: number };
  };
}

/** Hard ceiling per spec FR-005 / contracts/defrag-plan.contract.md. */
export const DEFRAG_MAX_MOVES_CEILING = 5000;
/** Default `maxMoves` when not specified by the caller (FR-005). */
export const DEFRAG_DEFAULT_MAX_MOVES = 1000;

export interface NetworkFragmentationSummary {
  averageFragmentation: number;
  worstEdgeId: string | null;
  worstFragmentation: number;
  totalEdges: number;
  fragmentedEdges: number; // edges with fragmentationIndex > 0.3
  edgeFragmentations: EdgeFragmentation[];
}

// ============================================================================
// DEFRAGMENTATION ENGINE
// ============================================================================

export class DefragmentationEngine {
  private tracker: CapacityTracker;

  constructor(
    getNodes: () => NetworkNode[],
    private getEdges: () => NetworkEdge[],
    private getServices: () => Service[]
  ) {
    const provider = createStoreDataProvider(
      () => ({ nodes: getNodes(), edges: getEdges() }),
      getServices
    );
    this.tracker = new CapacityTracker(provider);
  }

  analyzeFragmentation(): NetworkFragmentationSummary {
    const edges = this.getEdges();
    const edgeFragmentations: EdgeFragmentation[] = [];

    let worstEdgeId: string | null = null;
    let worstFragmentation = 0;
    let totalFragmentation = 0;
    let fragmentedCount = 0;

    for (const edge of edges) {
      const ef = this.getEdgeFragmentation(edge.id);
      edgeFragmentations.push(ef);

      totalFragmentation += ef.fragmentationIndex;
      if (ef.fragmentationIndex > worstFragmentation) {
        worstFragmentation = ef.fragmentationIndex;
        worstEdgeId = edge.id;
      }
      if (ef.fragmentationIndex > 0.3) {
        fragmentedCount++;
      }
    }

    edgeFragmentations.sort((a, b) => b.fragmentationIndex - a.fragmentationIndex);

    return {
      averageFragmentation: edges.length > 0 ? Math.round((totalFragmentation / edges.length) * 100) / 100 : 0,
      worstEdgeId,
      worstFragmentation: Math.round(worstFragmentation * 100) / 100,
      totalEdges: edges.length,
      fragmentedEdges: fragmentedCount,
      edgeFragmentations,
    };
  }

  getEdgeFragmentation(edgeId: string): EdgeFragmentation {
    const edge = this.getEdges().find((e) => e.id === edgeId);
    const lambdaMap = this.tracker.getLambdaMap(edgeId);
    const lambdaUsage = this.tracker.getLambdaUsage(edgeId);

    const fragments = this.computeFragments(lambdaMap);
    const freeFragments = fragments.filter((f) => f.status === 'free');
    const largestContiguous = freeFragments.length > 0
      ? Math.max(...freeFragments.map((f) => f.size))
      : 0;

    return {
      edgeId,
      edgeName: edge?.name || edgeId,
      fragmentationIndex: lambdaUsage.fragmentationIndex,
      totalChannels: lambdaUsage.total,
      usedChannels: lambdaUsage.used,
      freeChannels: lambdaUsage.available,
      largestContiguousBlock: largestContiguous,
      fragments,
    };
  }

  planDefragmentation(options: {
    strategy: DefragStrategy;
    targetEdgeIds?: string[];
    maxMoves?: number;
  }): DefragPlan {
    const { strategy } = options;
    const requestedMaxMoves = options.maxMoves ?? DEFRAG_DEFAULT_MAX_MOVES;
    // Defensive clamp per contracts/defrag-plan.contract.md (FR-005).
    const maxMoves = Math.max(1, Math.min(DEFRAG_MAX_MOVES_CEILING, Math.floor(requestedMaxMoves)));
    const targetEdgeIds = options.targetEdgeIds || this.getEdges().map((e) => e.id);

    const beforeMetrics = this.computeMetrics(targetEdgeIds);
    const moves: DefragMove[] = [];
    const processedEdgeIds: string[] = [];
    let truncated = false;

    for (const edgeId of targetEdgeIds) {
      if (moves.length >= maxMoves) {
        truncated = true;
        break;
      }
      const lambdaMap = this.tracker.getLambdaMap(edgeId);
      const edgeMoves = this.planEdgeDefrag(edgeId, lambdaMap, strategy);
      const remaining = maxMoves - moves.length;
      if (edgeMoves.length > remaining) {
        moves.push(...edgeMoves.slice(0, remaining));
        processedEdgeIds.push(edgeId);
        truncated = true;
        break;
      }
      moves.push(...edgeMoves);
      processedEdgeIds.push(edgeId);
    }

    const limitedMoves = moves.slice(0, maxMoves);

    // Assess risk for each move
    const assessedMoves = this.assessMovesRisk(limitedMoves);

    // Compute accurate after-metrics by applying moves to cloned lambda maps
    const afterMetrics = this.computeAccurateAfterMetrics(targetEdgeIds, assessedMoves);

    const affectedServiceIds = new Set(assessedMoves.map((m: DefragMove) => m.serviceId));
    const riskSummary: Record<DefragRiskLevel, number> = { low: 0, medium: 0, high: 0 };
    let totalDowntime = 0;
    for (const m of assessedMoves) {
      const riskKey: DefragRiskLevel = m.risk ?? 'low';
      riskSummary[riskKey]++;
      totalDowntime += m.estimatedDowntime ?? 0;
    }

    // Determine reason when no moves produced
    let reason: DefragNoMoveReason | undefined;
    if (assessedMoves.length === 0) {
      reason = this.determineNoMoveReason(targetEdgeIds);
    }

    return {
      id: crypto.randomUUID(),
      strategy,
      targetEdgeIds,
      processedEdgeIds,
      truncated,
      maxMoves,
      moves: assessedMoves,
      reason,
      beforeMetrics,
      afterMetrics,
      estimatedImpact: {
        servicesAffected: affectedServiceIds.size,
        totalMoves: assessedMoves.length,
        estimatedDowntime: totalDowntime,
        riskSummary,
      },
    };
  }

  private computeFragments(lambdaMap: LambdaMapEntry[]): FragmentBlock[] {
    if (lambdaMap.length === 0) return [];

    const fragments: FragmentBlock[] = [];
    let currentStatus = lambdaMap[0].status;
    let startChannel = lambdaMap[0].channelNumber;
    let count = 1;

    for (let i = 1; i < lambdaMap.length; i++) {
      if (lambdaMap[i].status === currentStatus) {
        count++;
      } else {
        fragments.push({
          startChannel,
          endChannel: startChannel + count - 1,
          size: count,
          status: currentStatus,
        });
        currentStatus = lambdaMap[i].status;
        startChannel = lambdaMap[i].channelNumber;
        count = 1;
      }
    }
    fragments.push({
      startChannel,
      endChannel: startChannel + count - 1,
      size: count,
      status: currentStatus,
    });

    return fragments;
  }

  private planEdgeDefrag(
    edgeId: string,
    lambdaMap: LambdaMapEntry[],
    strategy: DefragStrategy
  ): DefragMove[] {
    const moves: DefragMove[] = [];
    // Include both allocated and reserved channels; accept channels without serviceId
    const occupied = lambdaMap.filter((l) => l.status === 'allocated' || l.status === 'reserved');

    if (strategy === 'minimal_moves') {
      // Greedy gap-fill: scan left-to-right, close gaps between
      // consecutive occupied channels by sliding right-side allocations
      // left. Unlike full compaction (maximize_contiguous), this does NOT
      // shift the first occupied block to channel 1, producing fewer
      // total moves while still eliminating internal fragmentation.
      const sorted = occupied
        .map((e) => ({
          ch: e.channelNumber,
          serviceId: e.serviceId || `${edgeId}:ch${e.channelNumber}`,
        }))
        .sort((a, b) => a.ch - b.ch);

      if (sorted.length <= 1) return moves;

      // The first allocation stays in place; each subsequent one
      // targets the channel immediately after its predecessor's
      // final position.
      let nextTarget = sorted[0].ch + 1;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].ch !== nextTarget) {
          moves.push({
            edgeId,
            serviceId: sorted[i].serviceId,
            fromChannel: sorted[i].ch,
            toChannel: nextTarget,
          });
        }
        nextTarget++;
      }
    } else if (strategy === 'maximize_contiguous') {
      // Compact all allocations to the beginning of the spectrum
      let targetChannel = 1;
      for (const entry of occupied) {
        const serviceId = entry.serviceId || `${edgeId}:ch${entry.channelNumber}`;
        if (entry.channelNumber !== targetChannel) {
          moves.push({
            edgeId,
            serviceId,
            fromChannel: entry.channelNumber,
            toChannel: targetChannel,
          });
        }
        targetChannel++;
      }
    } else {
      // balance_spectrum: spread evenly across spectrum
      const totalChannels = lambdaMap.length;
      const step = occupied.length > 1 ? Math.floor(totalChannels / occupied.length) : 1;
      occupied.forEach((entry, idx) => {
        const serviceId = entry.serviceId || `${edgeId}:ch${entry.channelNumber}`;
        const targetCh = 1 + idx * step;
        if (entry.channelNumber !== targetCh) {
          moves.push({
            edgeId,
            serviceId,
            fromChannel: entry.channelNumber,
            toChannel: targetCh,
          });
        }
      });
    }

    // Filter out no-op moves
    return moves.filter((m) => m.fromChannel !== m.toChannel);
  }

  private computeMetrics(edgeIds: string[]): { avgFragmentation: number; worstFragmentation: number } {
    let total = 0;
    let worst = 0;
    for (const edgeId of edgeIds) {
      const usage = this.tracker.getLambdaUsage(edgeId);
      total += usage.fragmentationIndex;
      if (usage.fragmentationIndex > worst) worst = usage.fragmentationIndex;
    }
    return {
      avgFragmentation: edgeIds.length > 0 ? Math.round((total / edgeIds.length) * 100) / 100 : 0,
      worstFragmentation: Math.round(worst * 100) / 100,
    };
  }

  /**
   * Compute accurate after-metrics by applying moves to cloned lambda maps
   */
  computeAccurateAfterMetrics(
    edgeIds: string[],
    moves: DefragMove[]
  ): { avgFragmentation: number; worstFragmentation: number } {
    if (moves.length === 0) return this.computeMetrics(edgeIds);

    // Group moves by edge
    const movesByEdge = new Map<string, DefragMove[]>();
    for (const m of moves) {
      const arr = movesByEdge.get(m.edgeId) || [];
      arr.push(m);
      movesByEdge.set(m.edgeId, arr);
    }

    let total = 0;
    let worst = 0;

    for (const edgeId of edgeIds) {
      const edgeMoves = movesByEdge.get(edgeId);
      if (!edgeMoves || edgeMoves.length === 0) {
        // No moves on this edge, use original fragmentation
        const usage = this.tracker.getLambdaUsage(edgeId);
        total += usage.fragmentationIndex;
        if (usage.fragmentationIndex > worst) worst = usage.fragmentationIndex;
        continue;
      }

      // Clone lambda map and apply moves
      const clonedMap = this.cloneLambdaMap(edgeId);
      this.applyMovesToMap(clonedMap, edgeMoves);

      // Recompute fragmentation from cloned map
      const fragIndex = this.computeFragmentationFromMap(clonedMap);
      total += fragIndex;
      if (fragIndex > worst) worst = fragIndex;
    }

    return {
      avgFragmentation: edgeIds.length > 0 ? Math.round((total / edgeIds.length) * 100) / 100 : 0,
      worstFragmentation: Math.round(worst * 100) / 100,
    };
  }

  /**
   * Clone the lambda map for an edge (for simulation)
   */
  cloneLambdaMap(edgeId: string): LambdaMapEntry[] {
    return this.tracker.getLambdaMap(edgeId).map((entry) => ({ ...entry }));
  }

  /**
   * Apply defrag moves to a cloned lambda map
   */
  private applyMovesToMap(map: LambdaMapEntry[], moves: DefragMove[]): void {
    for (const move of moves) {
      const fromEntry = map.find((e) => e.channelNumber === move.fromChannel);
      const toEntry = map.find((e) => e.channelNumber === move.toChannel);
      if (fromEntry && toEntry) {
        // Move the allocation
        toEntry.status = fromEntry.status;
        toEntry.serviceId = fromEntry.serviceId;
        fromEntry.status = 'free';
        fromEntry.serviceId = undefined;
      }
    }
  }

  /**
   * Compute fragmentation index from a lambda map
   */
  private computeFragmentationFromMap(map: LambdaMapEntry[]): number {
    const used = map.filter((e) => e.status !== 'free').length;
    const total = map.length;
    const available = total - used;

    if (used === 0 || available === 0) return 0;

    // Count free blocks
    let freeBlocks = 0;
    let inFreeBlock = false;
    let largestFree = 0;
    let currentFreeSize = 0;

    for (const entry of map) {
      if (entry.status === 'free') {
        if (!inFreeBlock) {
          freeBlocks++;
          inFreeBlock = true;
          currentFreeSize = 0;
        }
        currentFreeSize++;
      } else {
        if (inFreeBlock) {
          if (currentFreeSize > largestFree) largestFree = currentFreeSize;
          inFreeBlock = false;
        }
      }
    }
    if (inFreeBlock && currentFreeSize > largestFree) largestFree = currentFreeSize;

    if (freeBlocks <= 1) return 0;
    // Fragmentation = 1 - (largest contiguous free / total free)
    return Math.round((1 - largestFree / available) * 100) / 100;
  }

  /**
   * Risk assessment for defrag moves
   *
   * Risk criteria:
   * - Low: move <= 10 channels AND service is inactive/planned
   * - Medium: move > 10 channels OR active service with protection OR cross-edge coordination
   * - High: active service without protection OR 3+ edge coordination required
   */
  assessMovesRisk(moves: DefragMove[]): DefragMove[] {
    const services = this.getServices();
    const serviceMap = new Map<string, Service>();
    for (const svc of services) {
      serviceMap.set(svc.id, svc);
    }

    // Count how many edges each service needs coordination across
    const serviceEdgeCount = new Map<string, Set<string>>();
    for (const m of moves) {
      const set = serviceEdgeCount.get(m.serviceId) || new Set();
      set.add(m.edgeId);
      serviceEdgeCount.set(m.serviceId, set);
    }

    return moves.map((move) => {
      const service = serviceMap.get(move.serviceId);
      // Synthetic identifiers (edge:ch format) indicate port-level allocations without a service
      const isSyntheticId = move.serviceId.includes(':ch');
      const channelDelta = Math.abs(move.fromChannel - move.toChannel);
      const edgeCount = serviceEdgeCount.get(move.serviceId)?.size || 1;
      const status: ServiceStatusForRisk = (service?.status as ServiceStatusForRisk) || 'planned';
      const isActive = status === 'active';
      const isInactiveOrPlanned = status === 'planned' || status === 'decommissioned' || status === 'maintenance';
      const hasProtection = service && isL1DWDMService(service) && service.protectionScheme !== 'none';

      let risk: DefragRiskLevel;
      let riskReason: string;

      if (isSyntheticId) {
        // Port-level allocation or reservation without a service — always low risk
        risk = 'low';
        riskReason = 'Reservation/port-level allocation, no service impact';
      } else if (isActive && !hasProtection) {
        risk = 'high';
        riskReason = 'Active service without protection';
      } else if (edgeCount >= 3) {
        risk = 'high';
        riskReason = `Requires coordination across ${edgeCount} edges`;
      } else if (channelDelta > 10) {
        risk = 'medium';
        riskReason = `Large channel shift (${channelDelta} channels)`;
      } else if (isActive && hasProtection) {
        risk = 'medium';
        riskReason = 'Active service (protected)';
      } else if (edgeCount === 2) {
        risk = 'medium';
        riskReason = 'Cross-edge coordination required';
      } else if (isInactiveOrPlanned && channelDelta <= 10) {
        risk = 'low';
        riskReason = 'Inactive/planned service, small move';
      } else {
        risk = 'low';
        riskReason = 'Minimal impact';
      }

      // Estimated downtime: Low = 0s, Medium = 30s per move, High = 120s per move
      const downtimePerMove = risk === 'high' ? 120 : risk === 'medium' ? 30 : 0;

      return {
        ...move,
        risk,
        riskReason,
        estimatedDowntime: downtimePerMove,
      };
    });
  }

  /** Determine reason when no defrag moves are proposed */
  private determineNoMoveReason(edgeIds: string[]): DefragNoMoveReason {
    let totalOccupied = 0;
    let maxOccupiedOnEdge = 0;

    for (const edgeId of edgeIds) {
      const lambdaMap = this.tracker.getLambdaMap(edgeId);
      const occupied = lambdaMap.filter((l) => l.status === 'allocated' || l.status === 'reserved').length;
      totalOccupied += occupied;
      if (occupied > maxOccupiedOnEdge) maxOccupiedOnEdge = occupied;
    }

    if (totalOccupied === 0) return 'no-allocations';
    if (maxOccupiedOnEdge <= 1) return 'single-allocation';
    return 'no-fragmentation';
  }

  /** Expose tracker for external use (e.g., lambda maps in wizard) */
  getTracker(): CapacityTracker {
    return this.tracker;
  }
}
