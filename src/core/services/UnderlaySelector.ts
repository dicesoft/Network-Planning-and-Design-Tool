/**
 * UnderlaySelector - L1 Underlay Selection for L2/L3 Services
 *
 * Provides intelligent selection of L1 DWDM services to use as transport
 * underlays for L2 Ethernet and L3 IP services.
 */

import type { NetworkNode, NetworkEdge } from '@/types/network';
import type {
  Service,
  L1DWDMService,
  L1DataRate,
  ServiceStatus,
} from '@/types/service';
import { isL1DWDMService } from '@/types/service';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Topology provider interface for underlay selection
 */
export interface UnderlayTopologyProvider {
  getNode: (id: string) => NetworkNode | undefined;
  getEdge: (id: string) => NetworkEdge | undefined;
}

/**
 * Service provider interface for underlay selection
 */
export interface UnderlayServiceProvider {
  getService: (id: string) => Service | undefined;
  getServices: () => Service[];
  getL1ServicesForEndpoints: (
    sourceNodeId: string,
    destinationNodeId: string,
    minDataRate?: L1DataRate
  ) => L1DWDMService[];
}

/**
 * Result of underlay selection
 */
export interface UnderlaySelectionResult {
  selected: L1DWDMService | null;
  candidates: L1DWDMService[];
  reason: string;
  warnings: string[];
}

/**
 * Underlay utilization information
 */
export interface UnderlayUtilization {
  underlayId: string;
  dataRate: L1DataRate;
  usedBy: string[]; // Service IDs using this underlay
  totalCapacityGbps: number;
  usedCapacityGbps: number;
  availableCapacityGbps: number;
  availableCapacity: boolean; // True if there's remaining capacity
  utilizationPercent: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Data rate numeric values for comparison
 */
const DATA_RATE_VALUES: Record<L1DataRate, number> = {
  '10G': 10,
  '25G': 25,
  '100G': 100,
  '200G': 200,
  '400G': 400,
};

/**
 * Preferred service statuses for underlay selection (in order of preference)
 */
const PREFERRED_STATUSES: ServiceStatus[] = ['active', 'provisioning', 'planned'];

// ============================================================================
// UNDERLAY SELECTOR CLASS
// ============================================================================

/**
 * UnderlaySelector provides methods for selecting L1 underlays for L2/L3 services
 */
export class UnderlaySelector {
  private services: UnderlayServiceProvider;
  private topology: UnderlayTopologyProvider;

  constructor(
    services: UnderlayServiceProvider,
    topology: UnderlayTopologyProvider
  ) {
    this.services = services;
    this.topology = topology;
  }

  // ==========================================================================
  // MAIN SELECTION METHODS
  // ==========================================================================

  /**
   * Find all compatible L1 underlays for given endpoints and capacity
   *
   * Filters to underlays that:
   * 1. Connect the specified endpoints
   * 2. Have sufficient total capacity for the required rate
   * 3. Have available capacity (not fully utilized by existing L2/L3 services)
   */
  findCompatibleUnderlays(
    sourceNodeId: string,
    destNodeId: string,
    minDataRate: L1DataRate
  ): L1DWDMService[] {
    // Get L1 services that connect these endpoints
    const candidates = this.services.getL1ServicesForEndpoints(
      sourceNodeId,
      destNodeId,
      minDataRate
    );

    const requiredGbps = DATA_RATE_VALUES[minDataRate];

    // Filter by capacity AND available capacity
    return candidates.filter((service) => {
      // Check total capacity is sufficient
      if (!this.hasCapacity(service.dataRate, minDataRate)) {
        return false;
      }

      // Check available capacity (considering existing utilization)
      const utilization = this.getUnderlayUtilization(service.id);
      if (!utilization) return false;

      // Ensure there's enough remaining capacity for the required rate
      return utilization.availableCapacityGbps >= requiredGbps;
    });
  }

  /**
   * Select the best underlay for L2/L3 service
   *
   * Selection criteria (in order):
   * 1. Active status preferred
   * 2. Sufficient capacity
   * 3. Lowest utilization (most headroom)
   * 4. Shortest working path
   */
  selectBestUnderlay(
    sourceNodeId: string,
    destNodeId: string,
    minDataRate: L1DataRate
  ): UnderlaySelectionResult {
    const warnings: string[] = [];

    // Validate endpoints exist
    const sourceNode = this.topology.getNode(sourceNodeId);
    const destNode = this.topology.getNode(destNodeId);

    if (!sourceNode) {
      return {
        selected: null,
        candidates: [],
        reason: 'Source node not found',
        warnings,
      };
    }

    if (!destNode) {
      return {
        selected: null,
        candidates: [],
        reason: 'Destination node not found',
        warnings,
      };
    }

    // Find compatible underlays
    const candidates = this.findCompatibleUnderlays(
      sourceNodeId,
      destNodeId,
      minDataRate
    );

    if (candidates.length === 0) {
      return {
        selected: null,
        candidates: [],
        reason: `No L1 services connect ${sourceNodeId} to ${destNodeId} with minimum ${minDataRate} capacity`,
        warnings,
      };
    }

    // Sort by preference
    const sorted = this.sortByPreference(candidates);

    // Check status of selected
    const selected = sorted[0];
    if (selected.status !== 'active') {
      warnings.push(
        `Selected underlay ${selected.id} is not active (status: ${selected.status})`
      );
    }

    return {
      selected,
      candidates: sorted,
      reason: `Selected ${selected.id} (${selected.dataRate}, ${selected.status})`,
      warnings,
    };
  }

  /**
   * Select a diverse underlay (different from working underlay)
   *
   * Used for protection underlay selection. Tries to find an underlay
   * with minimal path overlap to maximize redundancy.
   */
  selectDiverseUnderlay(
    sourceNodeId: string,
    destNodeId: string,
    minDataRate: L1DataRate,
    excludeUnderlayId: string
  ): UnderlaySelectionResult {
    const warnings: string[] = [];

    // Find compatible underlays excluding the working underlay
    const candidates = this.findCompatibleUnderlays(
      sourceNodeId,
      destNodeId,
      minDataRate
    ).filter((s) => s.id !== excludeUnderlayId);

    if (candidates.length === 0) {
      return {
        selected: null,
        candidates: [],
        reason: `No diverse L1 services available (excluding ${excludeUnderlayId})`,
        warnings,
      };
    }

    // Get the working underlay for diversity comparison
    const workingUnderlay = this.services.getService(excludeUnderlayId);
    if (!workingUnderlay || !isL1DWDMService(workingUnderlay)) {
      // Just select best from remaining candidates
      return this.selectFromCandidates(candidates, warnings);
    }

    // Sort by diversity (minimal edge overlap with working underlay)
    const sortedByDiversity = this.sortByDiversity(candidates, workingUnderlay);

    // Check overlap of selected
    const selected = sortedByDiversity[0];
    const overlap = this.calculateEdgeOverlap(selected, workingUnderlay);

    if (overlap > 0.5) {
      warnings.push(
        `Protection underlay ${selected.id} has ${(overlap * 100).toFixed(0)}% edge overlap with working underlay`
      );
    }

    if (selected.status !== 'active') {
      warnings.push(
        `Selected protection underlay ${selected.id} is not active (status: ${selected.status})`
      );
    }

    return {
      selected,
      candidates: sortedByDiversity,
      reason: `Selected diverse underlay ${selected.id} (${(1 - overlap) * 100}% edge diversity)`,
      warnings,
    };
  }

  // ==========================================================================
  // VALIDATION METHODS
  // ==========================================================================

  /**
   * Check if an underlay can accommodate required capacity
   */
  canAccommodate(underlayId: string, requiredDataRate: L1DataRate): boolean {
    const service = this.services.getService(underlayId);

    if (!service || !isL1DWDMService(service)) {
      return false;
    }

    return this.hasCapacity(service.dataRate, requiredDataRate);
  }

  /**
   * Validate that a specific underlay is suitable
   */
  validateUnderlay(
    underlayId: string,
    sourceNodeId: string,
    destNodeId: string,
    requiredDataRate: L1DataRate
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const service = this.services.getService(underlayId);

    // Check service exists
    if (!service) {
      errors.push(`Underlay service ${underlayId} not found`);
      return { valid: false, errors, warnings };
    }

    // Check service is L1 type
    if (!isL1DWDMService(service)) {
      errors.push(`Service ${underlayId} is not an L1 DWDM service (type: ${service.type})`);
      return { valid: false, errors, warnings };
    }

    // Check endpoints match (bidirectional)
    const endpointsMatch =
      (service.sourceNodeId === sourceNodeId && service.destinationNodeId === destNodeId) ||
      (service.sourceNodeId === destNodeId && service.destinationNodeId === sourceNodeId);

    if (!endpointsMatch) {
      errors.push(
        `Underlay ${underlayId} endpoints (${service.sourceNodeId} → ${service.destinationNodeId}) do not match required endpoints (${sourceNodeId} → ${destNodeId})`
      );
    }

    // Check capacity
    if (!this.hasCapacity(service.dataRate, requiredDataRate)) {
      errors.push(
        `Underlay ${underlayId} capacity (${service.dataRate}) insufficient for required ${requiredDataRate}`
      );
    }

    // Check available capacity (considering existing utilization)
    const utilization = this.getUnderlayUtilization(underlayId);
    if (utilization) {
      const requiredGbps = DATA_RATE_VALUES[requiredDataRate];
      if (utilization.availableCapacityGbps < requiredGbps) {
        errors.push(
          `Underlay ${underlayId} has insufficient available capacity. ` +
          `Required: ${requiredGbps}G, Available: ${utilization.availableCapacityGbps}G ` +
          `(used by ${utilization.usedBy.length} service(s): ${utilization.usedBy.join(', ') || 'none'})`
        );
      } else if (utilization.usedBy.length > 0) {
        // Warn if underlay is already partially used
        warnings.push(
          `Underlay is already used by ${utilization.usedBy.length} service(s). ` +
          `Utilization: ${utilization.utilizationPercent.toFixed(0)}%`
        );
      }
    }

    // Check status (warning if not active)
    if (service.status !== 'active') {
      warnings.push(
        `Underlay ${underlayId} is not active (status: ${service.status})`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==========================================================================
  // UTILIZATION METHODS
  // ==========================================================================

  /**
   * Get utilization information for an underlay
   *
   * Calculates how much of the underlay's capacity is already used by
   * existing L2/L3 services. An underlay can support multiple L2/L3 services
   * as long as their combined data rate doesn't exceed the L1 capacity.
   */
  getUnderlayUtilization(underlayId: string): UnderlayUtilization | null {
    const service = this.services.getService(underlayId);

    if (!service || !isL1DWDMService(service)) {
      return null;
    }

    // Find all L2/L3 services using this underlay
    const allServices = this.services.getServices();
    const dependentServices = allServices
      .filter((s) => {
        if (isL1DWDMService(s)) return false;
        // Check if L2/L3 service uses this underlay
        const l2l3 = s as { underlayServiceId?: string; protectionUnderlayServiceId?: string; dataRate?: L1DataRate };
        return (
          l2l3.underlayServiceId === underlayId ||
          l2l3.protectionUnderlayServiceId === underlayId
        );
      });

    const usedBy = dependentServices.map((s) => s.id);

    // Calculate total used capacity
    let usedCapacityGbps = 0;
    for (const depService of dependentServices) {
      const l2l3 = depService as { dataRate?: L1DataRate };
      if (l2l3.dataRate) {
        usedCapacityGbps += DATA_RATE_VALUES[l2l3.dataRate];
      }
    }

    const totalCapacityGbps = DATA_RATE_VALUES[service.dataRate];
    const availableCapacityGbps = Math.max(0, totalCapacityGbps - usedCapacityGbps);
    const utilizationPercent = totalCapacityGbps > 0 ? (usedCapacityGbps / totalCapacityGbps) * 100 : 0;

    return {
      underlayId,
      dataRate: service.dataRate,
      usedBy,
      totalCapacityGbps,
      usedCapacityGbps,
      availableCapacityGbps,
      availableCapacity: availableCapacityGbps > 0,
      utilizationPercent,
    };
  }

  /**
   * Get all available underlays with utilization info
   *
   * Returns all L1 services connecting the endpoints, regardless of utilization,
   * with full utilization information attached. This allows the UI to show
   * all options with capacity information.
   */
  getAvailableUnderlays(
    sourceNodeId: string,
    destNodeId: string
  ): Array<L1DWDMService & { utilization: UnderlayUtilization }> {
    // Get ALL L1 services for these endpoints (not filtered by available capacity)
    const candidates = this.services.getL1ServicesForEndpoints(
      sourceNodeId,
      destNodeId,
      '10G'
    );

    return candidates.map((service) => {
      const utilization = this.getUnderlayUtilization(service.id);
      const totalCapacityGbps = DATA_RATE_VALUES[service.dataRate];

      return {
        ...service,
        utilization: utilization || {
          underlayId: service.id,
          dataRate: service.dataRate,
          usedBy: [],
          totalCapacityGbps,
          usedCapacityGbps: 0,
          availableCapacityGbps: totalCapacityGbps,
          availableCapacity: true,
          utilizationPercent: 0,
        },
      };
    });
  }

  /**
   * Check if a specific underlay can accommodate a new service with given data rate
   */
  canAccommodateNewService(underlayId: string, requiredDataRate: L1DataRate): boolean {
    const utilization = this.getUnderlayUtilization(underlayId);
    if (!utilization) return false;

    const requiredGbps = DATA_RATE_VALUES[requiredDataRate];
    return utilization.availableCapacityGbps >= requiredGbps;
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Check if available data rate is sufficient for required rate
   */
  private hasCapacity(available: L1DataRate, required: L1DataRate): boolean {
    return DATA_RATE_VALUES[available] >= DATA_RATE_VALUES[required];
  }

  /**
   * Sort candidates by preference (status, capacity, path length)
   */
  private sortByPreference(candidates: L1DWDMService[]): L1DWDMService[] {
    return [...candidates].sort((a, b) => {
      // 1. Status preference
      const aStatusIdx = PREFERRED_STATUSES.indexOf(a.status);
      const bStatusIdx = PREFERRED_STATUSES.indexOf(b.status);
      const aStatus = aStatusIdx >= 0 ? aStatusIdx : PREFERRED_STATUSES.length;
      const bStatus = bStatusIdx >= 0 ? bStatusIdx : PREFERRED_STATUSES.length;

      if (aStatus !== bStatus) {
        return aStatus - bStatus;
      }

      // 2. Higher capacity preferred (more headroom)
      const aCapacity = DATA_RATE_VALUES[a.dataRate];
      const bCapacity = DATA_RATE_VALUES[b.dataRate];
      if (aCapacity !== bCapacity) {
        return bCapacity - aCapacity; // Descending
      }

      // 3. Shorter path preferred
      const aHops = a.workingPath.hopCount;
      const bHops = b.workingPath.hopCount;
      return aHops - bHops;
    });
  }

  /**
   * Sort candidates by diversity from reference underlay
   */
  private sortByDiversity(
    candidates: L1DWDMService[],
    reference: L1DWDMService
  ): L1DWDMService[] {
    return [...candidates].sort((a, b) => {
      // Sort by edge overlap (ascending - less overlap is better)
      const aOverlap = this.calculateEdgeOverlap(a, reference);
      const bOverlap = this.calculateEdgeOverlap(b, reference);

      if (aOverlap !== bOverlap) {
        return aOverlap - bOverlap;
      }

      // Then by status
      const aStatusIdx = PREFERRED_STATUSES.indexOf(a.status);
      const bStatusIdx = PREFERRED_STATUSES.indexOf(b.status);
      const aStatus = aStatusIdx >= 0 ? aStatusIdx : PREFERRED_STATUSES.length;
      const bStatus = bStatusIdx >= 0 ? bStatusIdx : PREFERRED_STATUSES.length;

      return aStatus - bStatus;
    });
  }

  /**
   * Calculate edge overlap between two services
   */
  private calculateEdgeOverlap(service: L1DWDMService, reference: L1DWDMService): number {
    const serviceEdges = new Set(service.workingPath.edgeIds);
    const referenceEdges = new Set(reference.workingPath.edgeIds);

    let sharedCount = 0;
    for (const edge of serviceEdges) {
      if (referenceEdges.has(edge)) {
        sharedCount++;
      }
    }

    // Return overlap as fraction of the smaller path
    const minEdgeCount = Math.min(serviceEdges.size, referenceEdges.size);
    return minEdgeCount > 0 ? sharedCount / minEdgeCount : 0;
  }

  /**
   * Select best from candidate list with warnings
   */
  private selectFromCandidates(
    candidates: L1DWDMService[],
    warnings: string[]
  ): UnderlaySelectionResult {
    const sorted = this.sortByPreference(candidates);
    const selected = sorted[0];

    if (selected.status !== 'active') {
      warnings.push(
        `Selected underlay ${selected.id} is not active (status: ${selected.status})`
      );
    }

    return {
      selected,
      candidates: sorted,
      reason: `Selected ${selected.id} (${selected.dataRate}, ${selected.status})`,
      warnings,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an UnderlaySelector instance
 */
export const createUnderlaySelector = (
  services: UnderlayServiceProvider,
  topology: UnderlayTopologyProvider
): UnderlaySelector => {
  return new UnderlaySelector(services, topology);
};
