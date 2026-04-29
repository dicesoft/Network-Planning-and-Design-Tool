/**
 * CapacityTracker - Network Capacity Tracking and Analysis
 *
 * Provides comprehensive capacity tracking across the network including:
 * - Edge utilization (channel usage)
 * - Node utilization (port usage)
 * - Lambda/channel mapping per edge
 * - Bottleneck and oversubscription detection
 * - What-if simulation for service addition/removal
 */

import type { NetworkEdge, NetworkNode } from '@/types/network';
import type { Service, L1DWDMService, ServicePath } from '@/types/service';
import { isL1DWDMService } from '@/types/service';
import { ChannelChecker, type ChannelTopologyProvider, DEFAULT_CHANNEL_RANGE } from './ChannelChecker';
import type { VirtualCapacityState, ComputedPath } from './WhatIfPathComputer';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Provider interface for capacity tracking - topology + services
 */
export interface CapacityDataProvider extends ChannelTopologyProvider {
  getNodes: () => NetworkNode[];
  getServices: () => Service[];
}

/**
 * Edge utilization metrics
 */
export interface EdgeUtilization {
  edgeId: string;
  total: number;
  used: number;
  available: number;
  percentage: number;
}

/**
 * Node utilization metrics
 */
export interface NodeUtilization {
  nodeId: string;
  totalPorts: number;
  usedPorts: number;
  availablePorts: number;
  portUtilizationPercent: number;
  dwdmPorts: number;
  dwdmPortsUsed: number;
  bwPorts: number;
  bwPortsUsed: number;
  switchingCapacity?: number;       // Total switching capacity in Gbps (if set on node)
  switchingUtilization?: number;    // Percentage of switching capacity used (0-100)
}

/**
 * Lambda channel status
 */
export type LambdaStatus = 'free' | 'allocated' | 'reserved';

/**
 * Lambda/channel map entry
 */
export interface LambdaMapEntry {
  channelNumber: number;
  status: LambdaStatus;
  serviceId?: string;
  edgeId?: string;
}

/**
 * Lambda usage summary for an edge
 */
export interface LambdaUsage {
  edgeId: string;
  total: number;
  used: number;
  available: number;
  reserved: number;
  fragmentationIndex: number;
}

/**
 * Bottleneck edge info
 */
export interface BottleneckEdge {
  edgeId: string;
  edgeName: string;
  sourceNodeId: string;
  targetNodeId: string;
  utilization: EdgeUtilization;
}

/**
 * Per-edge impact entry for a What-If simulation.
 * Includes raw channel counts (FR-014) alongside the percentage view.
 */
export interface WhatIfEdgeImpact {
  edgeId: string;
  before: EdgeUtilization;
  after: EdgeUtilization;
  /** Percentage delta (after.percentage - before.percentage). */
  delta: number;
  /** Raw used-channel count before the action. */
  usedBefore: number;
  /** Raw used-channel count after the action. */
  usedAfter: number;
  /** Total channels available on the edge (typically 96 for ITU-T C-band). */
  totalChannels: number;
  /** usedAfter - usedBefore. */
  channelDelta: number;
}

/**
 * Aggregated summary metrics returned by the What-If panel.
 * `fullNetworkNetChange` replaces the prior `netUtilChange` label
 * and is rendered with decimal precision when |value| < 1 (FR-012, FR-016).
 */
export interface WhatIfSummary {
  /**
   * Average utilization change across every edge in the network.
   * Sum(utilDelta_e for e in allEdges) / count(allEdges). Stored as an
   * unrounded float; rounding/decimal precision is a display concern.
   */
  fullNetworkNetChange: number;
  /** Number of edges whose utilization changes. */
  edgesAffected: number;
  /** Edges that crossed the 85% utilization threshold as a result of the action. */
  newBottlenecks: number;
}

/**
 * What-if simulation result
 */
export interface WhatIfResult {
  feasible: boolean;
  reason?: string;
  affectedEdges: WhatIfEdgeImpact[];
  networkUtilizationBefore: number;
  networkUtilizationAfter: number;
  /**
   * Average utilization change across every edge in the network — kept as
   * an unrounded float so consumers can render decimal precision when
   * |value| < 1 (FR-012, FR-016). Equivalent to the contract's
   * `WhatIfSummary.fullNetworkNetChange`.
   *
   * @deprecated Prefer `summary.fullNetworkNetChange`. Retained for one
   * release so persisted snapshots / external consumers keep working.
   */
  networkUtilizationDelta: number;
  /**
   * Canonical summary block per `whatif-result.contract.md`. Numerical
   * values match their legacy mirrors (`networkUtilizationDelta`,
   * affected-edge count, bottleneck count) — readers SHOULD prefer
   * `summary.*`; the legacy fields will be removed in a future release.
   */
  summary: WhatIfSummary;
}

// ============================================================================
// CAPACITY TRACKER CLASS
// ============================================================================

export class CapacityTracker {
  private data: CapacityDataProvider;
  private channelChecker: ChannelChecker;

  constructor(data: CapacityDataProvider) {
    this.data = data;
    this.channelChecker = new ChannelChecker(data);
  }

  // ==========================================================================
  // EDGE UTILIZATION
  // ==========================================================================

  /**
   * Get utilization for a single edge
   */
  getEdgeUtilization(edgeId: string): EdgeUtilization {
    const stats = this.channelChecker.getEdgeUtilization(edgeId);
    return {
      edgeId,
      total: stats.total,
      used: stats.used,
      available: stats.available,
      percentage: stats.utilizationPercent,
    };
  }

  /**
   * Get utilization for all edges
   */
  getAllEdgeUtilization(): Map<string, EdgeUtilization> {
    const result = new Map<string, EdgeUtilization>();
    const edges = this.data.getEdges();
    for (const edge of edges) {
      result.set(edge.id, this.getEdgeUtilization(edge.id));
    }
    return result;
  }

  /**
   * Get average network-wide utilization percentage
   */
  getNetworkUtilization(): number {
    const edges = this.data.getEdges();
    if (edges.length === 0) return 0;

    let totalUsed = 0;
    let totalCapacity = 0;

    for (const edge of edges) {
      const util = this.getEdgeUtilization(edge.id);
      totalUsed += util.used;
      totalCapacity += util.total;
    }

    if (totalCapacity === 0) return 0;
    return Math.round((totalUsed / totalCapacity) * 100);
  }

  // ==========================================================================
  // NODE UTILIZATION
  // ==========================================================================

  /**
   * Get utilization for a single node
   */
  getNodeUtilization(nodeId: string): NodeUtilization {
    const node = this.data.getNode(nodeId);
    if (!node) {
      return {
        nodeId,
        totalPorts: 0,
        usedPorts: 0,
        availablePorts: 0,
        portUtilizationPercent: 0,
        dwdmPorts: 0,
        dwdmPortsUsed: 0,
        bwPorts: 0,
        bwPortsUsed: 0,
      };
    }

    const ports = node.ports || [];
    const totalPorts = ports.length;
    const usedPorts = ports.filter((p) => p.status === 'used' || p.connectedEdgeId).length;
    const dwdmPorts = ports.filter((p) => p.type === 'dwdm').length;
    const dwdmPortsUsed = ports.filter((p) => p.type === 'dwdm' && (p.status === 'used' || p.connectedEdgeId)).length;
    const bwPorts = ports.filter((p) => p.type === 'bw').length;
    const bwPortsUsed = ports.filter((p) => p.type === 'bw' && (p.status === 'used' || p.connectedEdgeId)).length;

    // Compute switching capacity utilization if set on the node
    const switchingCapacity = node.switchingCapacity;
    let switchingUtilization: number | undefined;

    if (switchingCapacity !== undefined && switchingCapacity > 0) {
      // Estimate utilization based on used port data rates
      let usedBandwidth = 0;
      for (const port of ports) {
        if (port.status === 'used' || port.connectedEdgeId) {
          const rateStr = port.dataRate;
          const rateNum = parseInt(rateStr.replace('G', ''), 10);
          if (!isNaN(rateNum)) {
            usedBandwidth += rateNum;
          }
        }
      }
      switchingUtilization = Math.min(Math.round((usedBandwidth / switchingCapacity) * 100), 100);
    }

    return {
      nodeId,
      totalPorts,
      usedPorts,
      availablePorts: totalPorts - usedPorts,
      portUtilizationPercent: totalPorts > 0 ? Math.round((usedPorts / totalPorts) * 100) : 0,
      dwdmPorts,
      dwdmPortsUsed,
      bwPorts,
      bwPortsUsed,
      switchingCapacity,
      switchingUtilization,
    };
  }

  /**
   * Get utilization for all nodes
   */
  getAllNodeUtilization(): Map<string, NodeUtilization> {
    const result = new Map<string, NodeUtilization>();
    const nodes = this.data.getNodes();
    for (const node of nodes) {
      result.set(node.id, this.getNodeUtilization(node.id));
    }
    return result;
  }

  // ==========================================================================
  // LAMBDA / CHANNEL ANALYSIS
  // ==========================================================================

  /**
   * Get lambda/channel usage summary for an edge
   */
  getLambdaUsage(edgeId: string): LambdaUsage {
    const lambdaMap = this.getLambdaMap(edgeId);
    const total = lambdaMap.length;
    const used = lambdaMap.filter((l) => l.status === 'allocated').length;
    const reserved = lambdaMap.filter((l) => l.status === 'reserved').length;
    const available = lambdaMap.filter((l) => l.status === 'free').length;

    // Fragmentation index: 1 - (largestContiguousBlock / totalFree)
    const fragmentationIndex = this.computeFragmentationIndex(lambdaMap);

    return {
      edgeId,
      total,
      used,
      available,
      reserved,
      fragmentationIndex,
    };
  }

  /**
   * Get available (free) lambda channel numbers for an edge
   */
  getAvailableLambdas(edgeId: string): number[] {
    return this.channelChecker.getAvailableChannels(edgeId);
  }

  /**
   * Get full lambda/channel allocation map for an edge
   * Returns an array of 96 entries (one per channel) with status and service info
   */
  getLambdaMap(edgeId: string): LambdaMapEntry[] {
    const availableChannels = new Set(this.channelChecker.getAvailableChannels(edgeId));
    const edge = this.data.getEdge(edgeId);
    const services = this.data.getServices();

    // Build a map of channel -> service for this edge
    const channelServiceMap = new Map<number, string>();
    const channelReservedMap = new Set<number>();

    for (const service of services) {
      if (!isL1DWDMService(service)) continue;
      const l1 = service as L1DWDMService;

      // Check if this edge is in any of the service's paths
      const paths = [l1.workingPath, l1.protectionPath].filter(Boolean) as ServicePath[];
      for (const path of paths) {
        if (!path.edgeIds.includes(edgeId)) continue;

        if (path.channelNumber !== undefined) {
          if (path.status === 'allocated' || path.status === 'active') {
            channelServiceMap.set(path.channelNumber, l1.id);
          } else if (path.status === 'computed') {
            channelReservedMap.add(path.channelNumber);
          }
        }

        // Per-edge channel assignments (conversion mode)
        if (path.channelAssignments) {
          for (const assignment of path.channelAssignments) {
            if (assignment.edgeId === edgeId) {
              if (path.status === 'allocated' || path.status === 'active') {
                channelServiceMap.set(assignment.channelNumber, l1.id);
              } else if (path.status === 'computed') {
                channelReservedMap.add(assignment.channelNumber);
              }
            }
          }
        }
      }
    }

    // Also check edge-level channel assignments
    if (edge?.properties.channelAssignment) {
      const { sourceChannels, targetChannels } = edge.properties.channelAssignment;
      for (const alloc of [...sourceChannels, ...targetChannels]) {
        if (alloc.channelNumber !== undefined && alloc.status === 'allocated') {
          // These are ITU-T numbers, but for the map we use user channel numbers
          // The ChannelChecker already converts when computing available channels
        }
      }
    }

    const result: LambdaMapEntry[] = [];
    for (let ch = DEFAULT_CHANNEL_RANGE.min; ch <= DEFAULT_CHANNEL_RANGE.max; ch++) {
      if (channelServiceMap.has(ch)) {
        result.push({
          channelNumber: ch,
          status: 'allocated',
          serviceId: channelServiceMap.get(ch),
          edgeId,
        });
      } else if (channelReservedMap.has(ch)) {
        result.push({
          channelNumber: ch,
          status: 'reserved',
          edgeId,
        });
      } else if (availableChannels.has(ch)) {
        result.push({
          channelNumber: ch,
          status: 'free',
        });
      } else {
        // Used by port spectrum allocations (not tracked to a service)
        result.push({
          channelNumber: ch,
          status: 'allocated',
          edgeId,
        });
      }
    }

    return result;
  }

  // ==========================================================================
  // BOTTLENECK DETECTION
  // ==========================================================================

  /**
   * Find edges above a utilization threshold
   * @param threshold - Utilization percentage threshold (default: 80)
   */
  findBottlenecks(threshold: number = 80): BottleneckEdge[] {
    const edges = this.data.getEdges();
    const bottlenecks: BottleneckEdge[] = [];

    for (const edge of edges) {
      const utilization = this.getEdgeUtilization(edge.id);
      if (utilization.percentage >= threshold) {
        bottlenecks.push({
          edgeId: edge.id,
          edgeName: edge.name,
          sourceNodeId: edge.source.nodeId,
          targetNodeId: edge.target.nodeId,
          utilization,
        });
      }
    }

    // Sort by utilization descending
    bottlenecks.sort((a, b) => b.utilization.percentage - a.utilization.percentage);
    return bottlenecks;
  }

  /**
   * Get edges that are at 100% capacity (fully oversubscribed)
   */
  getOversubscribedEdges(): BottleneckEdge[] {
    return this.findBottlenecks(100);
  }

  // ==========================================================================
  // WHAT-IF SIMULATION
  // ==========================================================================

  /**
   * Build the canonical `WhatIfSummary` for a what-if result.
   * `fullNetworkNetChange` mirrors the legacy `networkUtilizationDelta` value
   * exactly; `newBottlenecks` counts edges that crossed the 85% threshold.
   */
  private buildWhatIfSummary(
    affectedEdges: WhatIfEdgeImpact[],
    fullNetworkNetChange: number
  ): WhatIfSummary {
    let newBottlenecks = 0;
    for (const ae of affectedEdges) {
      if (ae.after.percentage >= 85 && ae.before.percentage < 85) newBottlenecks++;
    }
    return {
      fullNetworkNetChange,
      edgesAffected: affectedEdges.length,
      newBottlenecks,
    };
  }

  /**
   * Simulate the impact of adding a new service
   * Uses the service's working path edges to estimate capacity impact
   */
  simulateServiceAddition(serviceConfig: {
    edgeIds: string[];
    channelsRequired?: number;
  }): WhatIfResult {
    const { edgeIds, channelsRequired = 1 } = serviceConfig;
    const affectedEdges: WhatIfResult['affectedEdges'] = [];
    let feasible = true;
    let reason: string | undefined;

    const networkUtilBefore = this.getNetworkUtilization();

    // Simulate capacity impact on each edge
    let totalDelta = 0;
    for (const edgeId of edgeIds) {
      const before = this.getEdgeUtilization(edgeId);
      const newUsed = before.used + channelsRequired;
      const newAvailable = before.total - newUsed;
      const newPercentage = before.total > 0 ? Math.round((newUsed / before.total) * 100) : 0;

      if (newAvailable < 0) {
        feasible = false;
        reason = `Edge ${edgeId} would exceed capacity (${newUsed}/${before.total} channels)`;
      }

      const after: EdgeUtilization = {
        edgeId,
        total: before.total,
        used: Math.min(newUsed, before.total),
        available: Math.max(newAvailable, 0),
        percentage: Math.min(newPercentage, 100),
      };

      const delta = after.percentage - before.percentage;
      totalDelta += delta;

      affectedEdges.push({
        edgeId,
        before,
        after,
        delta,
        usedBefore: before.used,
        usedAfter: after.used,
        totalChannels: before.total,
        channelDelta: after.used - before.used,
      });
    }

    // Calculate network-wide impact.
    // Average delta is kept as an unrounded float in `networkUtilizationDelta`
    // so the UI can render decimal precision when |value| < 1 (FR-012, FR-016).
    const allEdges = this.data.getEdges();
    const totalEdges = allEdges.length;
    const networkUtilDeltaFloat = totalEdges > 0 ? totalDelta / totalEdges : 0;
    const networkUtilAfter = totalEdges > 0
      ? Math.round(networkUtilBefore + networkUtilDeltaFloat)
      : 0;

    return {
      feasible,
      reason,
      affectedEdges,
      networkUtilizationBefore: networkUtilBefore,
      networkUtilizationAfter: networkUtilAfter,
      networkUtilizationDelta: networkUtilDeltaFloat,
      summary: this.buildWhatIfSummary(affectedEdges, networkUtilDeltaFloat),
    };
  }

  /**
   * Simulate the impact of adding a service using pre-computed paths.
   * Supports cumulative virtual capacity state for batch what-if.
   * This is the new path-aware simulation API; the original
   * simulateServiceAddition({ edgeIds }) is kept for backward compatibility.
   */
  simulateServiceAdditionWithPath(config: {
    workingPath: ComputedPath;
    protectionPath?: ComputedPath | null;
    channelsRequired?: number;
    quantity?: number;
    virtualState?: VirtualCapacityState;
  }): WhatIfResult {
    const {
      workingPath,
      protectionPath,
      channelsRequired = 1,
      quantity = 1,
      virtualState,
    } = config;

    // Collect all unique edge IDs from working + protection paths
    const allEdgeIds = new Set<string>();
    for (const eid of workingPath.edgeIds) allEdgeIds.add(eid);
    if (protectionPath) {
      for (const eid of protectionPath.edgeIds) allEdgeIds.add(eid);
    }

    const totalChannelsNeeded = channelsRequired * quantity;
    const affectedEdges: WhatIfResult['affectedEdges'] = [];
    let feasible = true;
    let reason: string | undefined;

    const networkUtilBefore = this.getNetworkUtilization();

    let totalDelta = 0;
    for (const edgeId of allEdgeIds) {
      const before = this.getEdgeUtilization(edgeId);

      // Account for cumulative virtual state if present
      const virtualOffset = virtualState
        ? this.getVirtualChannelOffset(virtualState, edgeId)
        : 0;

      const effectiveUsedBefore = before.used + virtualOffset;
      const newUsed = effectiveUsedBefore + totalChannelsNeeded;
      const newAvailable = before.total - newUsed;
      const newPercentage = before.total > 0 ? Math.round((newUsed / before.total) * 100) : 0;

      if (newAvailable < 0) {
        feasible = false;
        reason = `Edge ${edgeId} would exceed capacity (${newUsed}/${before.total} channels)`;
      }

      // Construct "before" that includes virtual state offset
      const effectiveBefore: EdgeUtilization = {
        edgeId,
        total: before.total,
        used: effectiveUsedBefore,
        available: Math.max(before.total - effectiveUsedBefore, 0),
        percentage: before.total > 0 ? Math.round((effectiveUsedBefore / before.total) * 100) : 0,
      };

      const after: EdgeUtilization = {
        edgeId,
        total: before.total,
        used: Math.min(newUsed, before.total),
        available: Math.max(newAvailable, 0),
        percentage: Math.min(newPercentage, 100),
      };

      const delta = after.percentage - effectiveBefore.percentage;
      totalDelta += delta;

      affectedEdges.push({
        edgeId,
        before: effectiveBefore,
        after,
        delta,
        usedBefore: effectiveBefore.used,
        usedAfter: after.used,
        totalChannels: effectiveBefore.total,
        channelDelta: after.used - effectiveBefore.used,
      });
    }

    const allEdges = this.data.getEdges();
    const totalEdges = allEdges.length;
    const networkUtilDeltaFloat = totalEdges > 0 ? totalDelta / totalEdges : 0;
    const networkUtilAfter = totalEdges > 0
      ? Math.round(networkUtilBefore + networkUtilDeltaFloat)
      : 0;

    return {
      feasible,
      reason,
      affectedEdges,
      networkUtilizationBefore: networkUtilBefore,
      networkUtilizationAfter: networkUtilAfter,
      networkUtilizationDelta: networkUtilDeltaFloat,
      summary: this.buildWhatIfSummary(affectedEdges, networkUtilDeltaFloat),
    };
  }

  /**
   * Get the net virtual channel offset for an edge from VirtualCapacityState
   */
  private getVirtualChannelOffset(state: VirtualCapacityState, edgeId: string): number {
    const added = state.additionalChannelsUsed.get(edgeId)?.size ?? 0;
    const freed = state.freedChannels.get(edgeId)?.size ?? 0;
    return added - freed;
  }

  /**
   * Simulate the impact of removing a service
   */
  simulateServiceRemoval(serviceId: string): WhatIfResult {
    const services = this.data.getServices();
    const service = services.find((s) => s.id === serviceId);

    if (!service) {
      return {
        feasible: false,
        reason: `Service ${serviceId} not found`,
        affectedEdges: [],
        networkUtilizationBefore: this.getNetworkUtilization(),
        networkUtilizationAfter: this.getNetworkUtilization(),
        networkUtilizationDelta: 0,
        summary: { fullNetworkNetChange: 0, edgesAffected: 0, newBottlenecks: 0 },
      };
    }

    // Get edges affected by this service
    const edgeIds = new Set<string>();
    if (isL1DWDMService(service)) {
      const l1 = service as L1DWDMService;
      for (const eid of l1.workingPath.edgeIds) edgeIds.add(eid);
      if (l1.protectionPath) {
        for (const eid of l1.protectionPath.edgeIds) edgeIds.add(eid);
      }
    }

    const affectedEdges: WhatIfResult['affectedEdges'] = [];
    const networkUtilBefore = this.getNetworkUtilization();
    let totalDelta = 0;

    for (const edgeId of edgeIds) {
      const before = this.getEdgeUtilization(edgeId);
      const channelsFreed = 1; // Each service uses at least 1 channel per edge
      const newUsed = Math.max(before.used - channelsFreed, 0);
      const newAvailable = before.total - newUsed;
      const newPercentage = before.total > 0 ? Math.round((newUsed / before.total) * 100) : 0;

      const after: EdgeUtilization = {
        edgeId,
        total: before.total,
        used: newUsed,
        available: newAvailable,
        percentage: newPercentage,
      };

      const delta = after.percentage - before.percentage;
      totalDelta += delta;

      affectedEdges.push({
        edgeId,
        before,
        after,
        delta,
        usedBefore: before.used,
        usedAfter: after.used,
        totalChannels: before.total,
        channelDelta: after.used - before.used,
      });
    }

    const allEdges = this.data.getEdges();
    const totalEdges = allEdges.length;
    const networkUtilAfter = totalEdges > 0
      ? Math.round(networkUtilBefore + (totalDelta / totalEdges))
      : 0;

    const removalDelta = Math.max(networkUtilAfter, 0) - networkUtilBefore;
    return {
      feasible: true,
      affectedEdges,
      networkUtilizationBefore: networkUtilBefore,
      networkUtilizationAfter: Math.max(networkUtilAfter, 0),
      networkUtilizationDelta: removalDelta,
      summary: this.buildWhatIfSummary(affectedEdges, removalDelta),
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Compute fragmentation index from lambda map
   * 0 = perfectly contiguous free space
   * 1 = maximally fragmented
   */
  private computeFragmentationIndex(lambdaMap: LambdaMapEntry[]): number {
    const freeChannels = lambdaMap.filter((l) => l.status === 'free');
    if (freeChannels.length === 0) return 0; // No free channels → no fragmentation (or fully used)

    // Find largest contiguous block of free channels
    let maxBlock = 0;
    let currentBlock = 0;

    for (const entry of lambdaMap) {
      if (entry.status === 'free') {
        currentBlock++;
        maxBlock = Math.max(maxBlock, currentBlock);
      } else {
        currentBlock = 0;
      }
    }

    if (maxBlock === 0) return 0;
    return parseFloat((1 - maxBlock / freeChannels.length).toFixed(4));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a CapacityTracker instance from store data
 */
export function createCapacityTracker(data: CapacityDataProvider): CapacityTracker {
  return new CapacityTracker(data);
}

/**
 * Create a CapacityDataProvider from the network and service stores
 * This bridges the Zustand stores to the CapacityTracker interface
 */
export function createStoreDataProvider(
  getTopology: () => { nodes: NetworkNode[]; edges: NetworkEdge[] },
  getServices: () => Service[]
): CapacityDataProvider {
  return {
    getNode: (id: string) => getTopology().nodes.find((n) => n.id === id),
    getEdge: (id: string) => getTopology().edges.find((e) => e.id === id),
    getEdges: () => getTopology().edges,
    getNodes: () => getTopology().nodes,
    getServices,
  };
}
