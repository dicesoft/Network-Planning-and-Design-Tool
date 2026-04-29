/**
 * ChannelChecker - DWDM Channel Availability Analysis
 *
 * Provides methods for checking end-to-end channel availability across paths,
 * supporting both wavelength-continuous and wavelength-conversion modes.
 */

import type { NetworkEdge, NetworkNode, Port } from '@/types/network';
import type {
  WavelengthMode,
  ServicePath,
  ChannelAvailabilityResult,
} from '@/types/service';
import type { ChannelAllocation } from '@/types/spectrum';
import { ituToUserChannel } from '@/core/spectrum/channelConfig';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Topology provider interface for channel queries
 */
export interface ChannelTopologyProvider {
  getNode: (id: string) => NetworkNode | undefined;
  getEdge: (id: string) => NetworkEdge | undefined;
  getEdges: () => NetworkEdge[];
}

/**
 * Result of channel allocation operation
 */
export interface ChannelAllocationResult {
  success: boolean;
  channelNumber?: number;
  allocations?: ChannelAllocation[];
  error?: string;
}

/**
 * Channel exhaustion warning info
 */
export interface ChannelExhaustionWarning {
  edgeId: string;
  availableCount: number;
  totalChannels: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default DWDM channel range (ITU-T C-band, 50 GHz spacing)
 * Channels 1-96 covering 191.35 THz to 196.10 THz
 */
export const DEFAULT_CHANNEL_RANGE = {
  min: 1,
  max: 96,
};

/**
 * Low availability threshold for warnings
 */
export const LOW_AVAILABILITY_THRESHOLD = 5;

// ============================================================================
// CHANNEL CHECKER CLASS
// ============================================================================

/**
 * ChannelChecker handles DWDM channel availability analysis
 */
export class ChannelChecker {
  private topology: ChannelTopologyProvider;

  constructor(topology: ChannelTopologyProvider) {
    this.topology = topology;
  }

  // ==========================================================================
  // CHANNEL AVAILABILITY CHECKING
  // ==========================================================================

  /**
   * Check channel availability across a path
   *
   * @param path - Service path to check
   * @param mode - Wavelength mode (continuous or conversion-allowed)
   * @param requestedChannel - Optional specific channel to check
   * @returns Channel availability result
   */
  checkChannelAvailability(
    path: ServicePath,
    mode: WavelengthMode = 'continuous',
    requestedChannel?: number
  ): ChannelAvailabilityResult {
    const { edgeIds } = path;

    if (edgeIds.length === 0) {
      return {
        available: false,
        mode,
        blockedReason: 'Path has no edges',
      };
    }

    if (mode === 'continuous') {
      return this.checkContinuousAvailability(edgeIds, requestedChannel);
    } else {
      return this.checkConversionAvailability(path, requestedChannel);
    }
  }

  /**
   * Check availability in wavelength-continuous mode
   * Same channel must be free on ALL edges
   */
  private checkContinuousAvailability(
    edgeIds: string[],
    requestedChannel?: number
  ): ChannelAvailabilityResult {
    // Get available channels per edge
    const perEdgeChannels = new Map<string, number[]>();
    const blockedEdges: string[] = [];

    for (const edgeId of edgeIds) {
      const available = this.getAvailableChannels(edgeId);
      perEdgeChannels.set(edgeId, available);

      if (available.length === 0) {
        blockedEdges.push(edgeId);
      }
    }

    // Check for fully blocked edges
    if (blockedEdges.length > 0) {
      return {
        available: false,
        mode: 'continuous',
        blockedEdges,
        blockedReason: `No channels available on ${blockedEdges.length} edge(s)`,
        perEdgeChannels,
      };
    }

    // Find common channels (free on all edges)
    const commonChannels = this.findCommonChannels(edgeIds);

    // Check if requested channel is available
    if (requestedChannel !== undefined) {
      if (commonChannels.includes(requestedChannel)) {
        return {
          available: true,
          mode: 'continuous',
          commonChannels,
          suggestedChannel: requestedChannel,
          perEdgeChannels,
        };
      } else {
        return {
          available: false,
          mode: 'continuous',
          commonChannels,
          blockedReason: `Requested channel ${requestedChannel} is not available on all edges`,
          perEdgeChannels,
        };
      }
    }

    // No common channels available
    if (commonChannels.length === 0) {
      return {
        available: false,
        mode: 'continuous',
        commonChannels: [],
        blockedReason: 'No common channels available across all edges',
        perEdgeChannels,
      };
    }

    // Success - suggest lowest available channel
    return {
      available: true,
      mode: 'continuous',
      commonChannels,
      suggestedChannel: Math.min(...commonChannels),
      perEdgeChannels,
    };
  }

  /**
   * Check availability in wavelength-conversion mode
   * Each edge can use a different channel, conversion happens at nodes
   */
  private checkConversionAvailability(
    path: ServicePath,
    requestedChannel?: number
  ): ChannelAvailabilityResult {
    const { nodeIds, edgeIds } = path;
    const perEdgeChannels = new Map<string, number[]>();
    const blockedEdges: string[] = [];
    const conversionPoints: string[] = [];

    // Get available channels per edge
    for (const edgeId of edgeIds) {
      const available = this.getAvailableChannels(edgeId);
      perEdgeChannels.set(edgeId, available);

      if (available.length === 0) {
        blockedEdges.push(edgeId);
      }
    }

    // Check for fully blocked edges
    if (blockedEdges.length > 0) {
      return {
        available: false,
        mode: 'conversion-allowed',
        blockedEdges,
        blockedReason: `No channels available on ${blockedEdges.length} edge(s)`,
        perEdgeChannels,
      };
    }

    // Check if requested channel is available on all edges
    if (requestedChannel !== undefined) {
      const allHaveChannel = edgeIds.every((edgeId) => {
        const channels = perEdgeChannels.get(edgeId) || [];
        return channels.includes(requestedChannel);
      });

      if (allHaveChannel) {
        return {
          available: true,
          mode: 'conversion-allowed',
          suggestedChannel: requestedChannel,
          perEdgeChannels,
          conversionPoints: [],
        };
      }
    }

    // Identify conversion points (intermediate nodes where channel may change)
    // Check consecutive edges for common channels
    for (let i = 0; i < edgeIds.length - 1; i++) {
      const currEdge = edgeIds[i];
      const nextEdge = edgeIds[i + 1];
      const currChannels = perEdgeChannels.get(currEdge) || [];
      const nextChannels = perEdgeChannels.get(nextEdge) || [];

      // Check if there's at least one common channel
      const hasCommon = currChannels.some((ch) => nextChannels.includes(ch));

      if (!hasCommon) {
        // Conversion needed at intermediate node
        const intermediateNodeId = nodeIds[i + 1];
        if (!conversionPoints.includes(intermediateNodeId)) {
          conversionPoints.push(intermediateNodeId);
        }
      }
    }

    // Find a suggested channel (most commonly available)
    const suggestedChannel = this.findMostCommonChannel(edgeIds, perEdgeChannels);

    return {
      available: true,
      mode: 'conversion-allowed',
      suggestedChannel,
      perEdgeChannels,
      conversionPoints,
    };
  }

  // ==========================================================================
  // CHANNEL QUERIES
  // ==========================================================================

  /**
   * Get available channels on an edge
   *
   * @param edgeId - Edge to check
   * @returns Array of available channel numbers
   */
  getAvailableChannels(edgeId: string): number[] {
    const edge = this.topology.getEdge(edgeId);
    if (!edge) {
      return [];
    }

    // Get ports at both ends
    const sourceNode = this.topology.getNode(edge.source.nodeId);
    const targetNode = this.topology.getNode(edge.target.nodeId);

    if (!sourceNode || !targetNode) {
      return [];
    }

    // Find the ports used by this edge
    const sourcePort = sourceNode.ports?.find(
      (p) => p.id === edge.source.portId || p.connectedEdgeId === edgeId
    );
    const targetPort = targetNode.ports?.find(
      (p) => p.id === edge.target.portId || p.connectedEdgeId === edgeId
    );

    // Get allocated channels at both ports
    const sourceAllocated = this.getAllocatedChannels(sourcePort);
    const targetAllocated = this.getAllocatedChannels(targetPort);

    // Combine allocations
    const allocatedSet = new Set([...sourceAllocated, ...targetAllocated]);

    // Also check edge-level channel assignment
    // Edge channel assignments also store ITU-T channel numbers
    if (edge.properties.channelAssignment) {
      const { sourceChannels, targetChannels } = edge.properties.channelAssignment;
      for (const alloc of [...sourceChannels, ...targetChannels]) {
        if (alloc.channelNumber !== undefined && alloc.status === 'allocated') {
          // Convert ITU-T to user channel number
          const userChannel = ituToUserChannel(alloc.channelNumber, 'fixed-50ghz');
          allocatedSet.add(userChannel);
        }
      }
    }

    // Return channels not in allocated set
    const available: number[] = [];
    for (let ch = DEFAULT_CHANNEL_RANGE.min; ch <= DEFAULT_CHANNEL_RANGE.max; ch++) {
      if (!allocatedSet.has(ch)) {
        available.push(ch);
      }
    }

    return available;
  }

  /**
   * Get allocated channels from a port's spectrum
   * Converts ITU-T channel numbers stored in port spectrum to user channel numbers (1-96)
   */
  private getAllocatedChannels(port: Port | undefined): number[] {
    if (!port || !port.spectrum) {
      return [];
    }

    return port.spectrum.allocations
      .filter(
        (alloc) =>
          alloc.channelNumber !== undefined &&
          (alloc.status === 'allocated' || alloc.status === 'reserved')
      )
      .map((alloc) => {
        // Port spectrum stores ITU-T channel numbers (-35 to 60 for 50GHz grid)
        // Convert to user channel numbers (1-96) for comparison
        const ituChannel = alloc.channelNumber as number;
        return ituToUserChannel(ituChannel, 'fixed-50ghz');
      });
  }

  /**
   * Find channels that are free on all specified edges
   *
   * @param edgeIds - Edge IDs to check
   * @returns Array of channel numbers free on all edges
   */
  findCommonChannels(edgeIds: string[]): number[] {
    if (edgeIds.length === 0) {
      return [];
    }

    // Start with channels from first edge
    let commonSet = new Set(this.getAvailableChannels(edgeIds[0]));

    // Intersect with each subsequent edge
    for (let i = 1; i < edgeIds.length; i++) {
      const edgeChannels = new Set(this.getAvailableChannels(edgeIds[i]));
      commonSet = new Set([...commonSet].filter((ch) => edgeChannels.has(ch)));

      // Early exit if no common channels
      if (commonSet.size === 0) {
        break;
      }
    }

    return Array.from(commonSet).sort((a, b) => a - b);
  }

  /**
   * Find the most commonly available channel across edges
   */
  private findMostCommonChannel(
    edgeIds: string[],
    perEdgeChannels: Map<string, number[]>
  ): number | undefined {
    // Count channel occurrences
    const channelCounts = new Map<number, number>();

    for (const edgeId of edgeIds) {
      const channels = perEdgeChannels.get(edgeId) || [];
      for (const ch of channels) {
        channelCounts.set(ch, (channelCounts.get(ch) || 0) + 1);
      }
    }

    // Find channel with highest count
    let maxCount = 0;
    let bestChannel: number | undefined;

    for (const [channel, count] of channelCounts) {
      if (count > maxCount) {
        maxCount = count;
        bestChannel = channel;
      }
    }

    return bestChannel;
  }

  // ==========================================================================
  // CHANNEL ALLOCATION
  // ==========================================================================

  /**
   * Check if a specific channel can be allocated on a path
   *
   * @param path - Service path
   * @param channelNumber - Channel to allocate
   * @returns Whether allocation is possible
   */
  canAllocateChannel(path: ServicePath, channelNumber: number): boolean {
    const commonChannels = this.findCommonChannels(path.edgeIds);
    return commonChannels.includes(channelNumber);
  }

  /**
   * Get channel exhaustion warnings for a path
   *
   * @param edgeIds - Edge IDs to check
   * @returns Warnings for edges with low availability
   */
  getExhaustionWarnings(edgeIds: string[]): ChannelExhaustionWarning[] {
    const warnings: ChannelExhaustionWarning[] = [];

    for (const edgeId of edgeIds) {
      const available = this.getAvailableChannels(edgeId);
      if (available.length <= LOW_AVAILABILITY_THRESHOLD && available.length > 0) {
        warnings.push({
          edgeId,
          availableCount: available.length,
          totalChannels: DEFAULT_CHANNEL_RANGE.max - DEFAULT_CHANNEL_RANGE.min + 1,
        });
      }
    }

    return warnings;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get channel utilization statistics for an edge
   *
   * @param edgeId - Edge to analyze
   * @returns Utilization stats
   */
  getEdgeUtilization(edgeId: string): {
    total: number;
    used: number;
    available: number;
    utilizationPercent: number;
  } {
    const total = DEFAULT_CHANNEL_RANGE.max - DEFAULT_CHANNEL_RANGE.min + 1;
    const available = this.getAvailableChannels(edgeId).length;
    const used = total - available;

    return {
      total,
      used,
      available,
      utilizationPercent: Math.round((used / total) * 100),
    };
  }

  /**
   * Get channel utilization across all edges
   *
   * @returns Map of edge ID to utilization stats
   */
  getAllEdgeUtilization(): Map<
    string,
    { total: number; used: number; available: number; utilizationPercent: number }
  > {
    const result = new Map<
      string,
      { total: number; used: number; available: number; utilizationPercent: number }
    >();

    for (const edge of this.topology.getEdges()) {
      result.set(edge.id, this.getEdgeUtilization(edge.id));
    }

    return result;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a ChannelChecker instance
 */
export const createChannelChecker = (
  topology: ChannelTopologyProvider
): ChannelChecker => {
  return new ChannelChecker(topology);
};
