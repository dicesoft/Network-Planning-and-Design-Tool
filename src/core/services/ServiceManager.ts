/**
 * ServiceManager - Base service management functionality
 *
 * Provides core operations for creating, validating, and managing
 * L1 (DWDM) and L2/L3 (IP) network services.
 */

import {
  Service,
  L1DWDMService,
  L2L3Service,
  ServicePath,
  ServicePathOptions,
  SRLGRiskAnalysis,
  L1DataRate,
  L1ServiceConfig,
  L2L3ServiceConfig,
  ServiceValidationResult,
  ValidationMessage,
  DEFAULT_PATH_OPTIONS,
  createValidResult,
  createInvalidResult,
  isL1DWDMService,
  isL2L3Service,
} from '@/types/service';
import type { ServicePathStatus } from '@/types/service';
import type { NetworkNode, NetworkEdge } from '@/types/network';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Network topology provider interface
 * Allows ServiceManager to query network topology without direct store coupling
 */
export interface TopologyProvider {
  getNode: (id: string) => NetworkNode | undefined;
  getEdge: (id: string) => NetworkEdge | undefined;
  getNodes: () => NetworkNode[];
  getEdges: () => NetworkEdge[];
  getConnectedEdges: (nodeId: string) => NetworkEdge[];
}

/**
 * Service store provider interface
 * Allows ServiceManager to query/update services without direct store coupling
 */
export interface ServiceProvider {
  getService: (id: string) => Service | undefined;
  getServices: () => Service[];
  getL1ServicesForEndpoints: (
    sourceNodeId: string,
    destinationNodeId: string,
    minDataRate?: L1DataRate
  ) => L1DWDMService[];
  getDependentServices: (serviceId: string) => L2L3Service[];
}

/**
 * Path computation result from PathFinder
 */
export interface PathResult {
  path: string[];
  edges: string[];
  totalWeight: number;
  totalDistance: number;
  hopCount: number;
  warnings?: { type: string; message: string }[];
}

/**
 * Path finder provider interface
 */
export interface PathFinderProvider {
  shortestPath: (
    sourceId: string,
    targetId: string,
    options?: Partial<ServicePathOptions>
  ) => PathResult | null;
  kShortestPaths: (
    sourceId: string,
    targetId: string,
    k: number,
    options?: Partial<ServicePathOptions>
  ) => PathResult[];
  findEdgeDisjointPaths: (
    sourceId: string,
    targetId: string,
    options?: { algorithm?: 'greedy' | 'max-flow' }
  ) => PathResult[];
}

// ============================================================================
// DATA RATE UTILITIES
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
 * Compare data rates - returns true if available >= required
 */
export const isDataRateSufficient = (
  available: L1DataRate,
  required: L1DataRate
): boolean => {
  return DATA_RATE_VALUES[available] >= DATA_RATE_VALUES[required];
};

/**
 * Get numeric value from data rate
 */
export const getDataRateValue = (rate: L1DataRate): number => {
  return DATA_RATE_VALUES[rate];
};

// ============================================================================
// SERVICE MANAGER CLASS
// ============================================================================

/**
 * ServiceManager handles service lifecycle operations
 */
export class ServiceManager {
  private topology: TopologyProvider;
  private services: ServiceProvider;
  private pathFinder?: PathFinderProvider;

  constructor(
    topology: TopologyProvider,
    services: ServiceProvider,
    pathFinder?: PathFinderProvider
  ) {
    this.topology = topology;
    this.services = services;
    this.pathFinder = pathFinder;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate L1 DWDM service configuration
   */
  validateL1Service(config: L1ServiceConfig): ServiceValidationResult {
    const messages: ValidationMessage[] = [];

    // Validate endpoints exist
    const sourceNode = this.topology.getNode(config.sourceNodeId);
    const destNode = this.topology.getNode(config.destinationNodeId);

    if (!sourceNode) {
      messages.push({
        severity: 'error',
        field: 'sourceNodeId',
        message: 'Source node not found',
        code: 'NODE_NOT_FOUND',
      });
    }

    if (!destNode) {
      messages.push({
        severity: 'error',
        field: 'destinationNodeId',
        message: 'Destination node not found',
        code: 'NODE_NOT_FOUND',
      });
    }

    // Validate source != destination
    if (config.sourceNodeId === config.destinationNodeId) {
      messages.push({
        severity: 'error',
        field: 'destinationNodeId',
        message: 'Source and destination must be different nodes',
        code: 'SAME_ENDPOINT',
      });
    }

    // Validate ports exist and are DWDM type
    if (sourceNode) {
      const sourcePort = sourceNode.ports?.find((p) => p.id === config.sourcePortId);
      if (!sourcePort) {
        messages.push({
          severity: 'error',
          field: 'sourcePortId',
          message: 'Source port not found on node',
          code: 'PORT_NOT_FOUND',
        });
      } else if (sourcePort.type !== 'dwdm') {
        messages.push({
          severity: 'error',
          field: 'sourcePortId',
          message: 'Source port must be DWDM type for L1 service',
          code: 'INVALID_PORT_TYPE',
        });
      } else if (sourcePort.status === 'used') {
        messages.push({
          severity: 'warning',
          field: 'sourcePortId',
          message: 'Source port is already in use',
          code: 'PORT_IN_USE',
        });
      }
    }

    if (destNode) {
      const destPort = destNode.ports?.find((p) => p.id === config.destinationPortId);
      if (!destPort) {
        messages.push({
          severity: 'error',
          field: 'destinationPortId',
          message: 'Destination port not found on node',
          code: 'PORT_NOT_FOUND',
        });
      } else if (destPort.type !== 'dwdm') {
        messages.push({
          severity: 'error',
          field: 'destinationPortId',
          message: 'Destination port must be DWDM type for L1 service',
          code: 'INVALID_PORT_TYPE',
        });
      } else if (destPort.status === 'used') {
        messages.push({
          severity: 'warning',
          field: 'destinationPortId',
          message: 'Destination port is already in use',
          code: 'PORT_IN_USE',
        });
      }
    }

    // Validate name is provided
    if (!config.name || config.name.trim().length === 0) {
      messages.push({
        severity: 'error',
        field: 'name',
        message: 'Service name is required',
        code: 'NAME_REQUIRED',
      });
    }

    // Validate protection scheme consistency
    if (config.protectionScheme === 'wson-restoration' && !config.restorationEnabled) {
      messages.push({
        severity: 'warning',
        field: 'restorationEnabled',
        message: 'WSON restoration scheme selected but restoration not enabled',
        code: 'RESTORATION_MISMATCH',
      });
    }

    if (messages.length === 0) {
      return createValidResult();
    }

    return createInvalidResult(messages);
  }

  /**
   * Validate L2/L3 service configuration
   */
  validateL2L3Service(config: L2L3ServiceConfig): ServiceValidationResult {
    const messages: ValidationMessage[] = [];

    // Validate endpoints exist
    const sourceNode = this.topology.getNode(config.sourceNodeId);
    const destNode = this.topology.getNode(config.destinationNodeId);

    if (!sourceNode) {
      messages.push({
        severity: 'error',
        field: 'sourceNodeId',
        message: 'Source node not found',
        code: 'NODE_NOT_FOUND',
      });
    }

    if (!destNode) {
      messages.push({
        severity: 'error',
        field: 'destinationNodeId',
        message: 'Destination node not found',
        code: 'NODE_NOT_FOUND',
      });
    }

    // Validate source != destination
    if (config.sourceNodeId === config.destinationNodeId) {
      messages.push({
        severity: 'error',
        field: 'destinationNodeId',
        message: 'Source and destination must be different nodes',
        code: 'SAME_ENDPOINT',
      });
    }

    // Validate name
    if (!config.name || config.name.trim().length === 0) {
      messages.push({
        severity: 'error',
        field: 'name',
        message: 'Service name is required',
        code: 'NAME_REQUIRED',
      });
    }

    // Validate underlay service if specified
    if (config.underlayServiceId) {
      const underlay = this.services.getService(config.underlayServiceId);
      if (!underlay) {
        messages.push({
          severity: 'error',
          field: 'underlayServiceId',
          message: 'Specified L1 underlay service not found',
          code: 'UNDERLAY_NOT_FOUND',
        });
      } else if (!isL1DWDMService(underlay)) {
        messages.push({
          severity: 'error',
          field: 'underlayServiceId',
          message: 'Underlay service must be L1 DWDM type',
          code: 'INVALID_UNDERLAY_TYPE',
        });
      } else {
        // Check capacity
        if (!isDataRateSufficient(underlay.dataRate, config.dataRate)) {
          messages.push({
            severity: 'error',
            field: 'dataRate',
            message: `L1 underlay capacity (${underlay.dataRate}) insufficient for required ${config.dataRate}`,
            code: 'INSUFFICIENT_CAPACITY',
          });
        }

        // Check status
        if (underlay.status !== 'active') {
          messages.push({
            severity: 'warning',
            field: 'underlayServiceId',
            message: `L1 underlay service is not active (status: ${underlay.status})`,
            code: 'UNDERLAY_NOT_ACTIVE',
          });
        }
      }
    } else if (!config.autoCreateUnderlay) {
      // No underlay specified and auto-create disabled
      messages.push({
        severity: 'error',
        field: 'underlayServiceId',
        message: 'L1 underlay service required. Select existing or enable auto-create.',
        code: 'UNDERLAY_REQUIRED',
      });
    }

    // Validate protection underlay if specified
    if (config.protectionUnderlayServiceId) {
      if (config.protectionUnderlayServiceId === config.underlayServiceId) {
        messages.push({
          severity: 'error',
          field: 'protectionUnderlayServiceId',
          message: 'Protection underlay must be different from working underlay',
          code: 'SAME_UNDERLAY',
        });
      }

      const protectionUnderlay = this.services.getService(config.protectionUnderlayServiceId);
      if (!protectionUnderlay) {
        messages.push({
          severity: 'error',
          field: 'protectionUnderlayServiceId',
          message: 'Specified protection L1 underlay service not found',
          code: 'PROTECTION_UNDERLAY_NOT_FOUND',
        });
      } else if (!isL1DWDMService(protectionUnderlay)) {
        messages.push({
          severity: 'error',
          field: 'protectionUnderlayServiceId',
          message: 'Protection underlay service must be L1 DWDM type',
          code: 'INVALID_PROTECTION_UNDERLAY_TYPE',
        });
      }
    }

    // Validate BFD config
    if (config.bfdConfig.enabled) {
      if (config.bfdConfig.minTxInterval < 1000) {
        messages.push({
          severity: 'warning',
          field: 'bfdConfig.minTxInterval',
          message: 'BFD TX interval below 1ms may cause high CPU usage',
          code: 'BFD_TX_TOO_LOW',
        });
      }
      if (config.bfdConfig.multiplier < 1 || config.bfdConfig.multiplier > 255) {
        messages.push({
          severity: 'error',
          field: 'bfdConfig.multiplier',
          message: 'BFD multiplier must be between 1 and 255',
          code: 'BFD_MULTIPLIER_INVALID',
        });
      }
    }

    if (messages.length === 0) {
      return createValidResult();
    }

    return createInvalidResult(messages);
  }

  // ==========================================================================
  // PATH COMPUTATION
  // ==========================================================================

  /**
   * Compute a working path between endpoints
   */
  computeWorkingPath(
    sourceNodeId: string,
    destinationNodeId: string,
    options: ServicePathOptions = DEFAULT_PATH_OPTIONS
  ): ServicePath | null {
    if (!this.pathFinder) {
      throw new Error('PathFinder not configured');
    }

    let pathResult: PathResult | null = null;

    switch (options.mode) {
      case 'shortest-path':
        pathResult = this.pathFinder.shortestPath(sourceNodeId, destinationNodeId, {
          weightAttribute: options.weightAttribute,
          excludeNodes: options.excludeNodes,
          excludeEdges: options.excludeEdges,
          maxHops: options.maxHops,
        });
        break;

      case 'k-shortest': {
        const paths = this.pathFinder.kShortestPaths(
          sourceNodeId,
          destinationNodeId,
          options.k || 1,
          {
            weightAttribute: options.weightAttribute,
            excludeNodes: options.excludeNodes,
            excludeEdges: options.excludeEdges,
          }
        );
        pathResult = paths[0] || null;
        break;
      }

      case 'edge-disjoint': {
        const disjointPaths = this.pathFinder.findEdgeDisjointPaths(
          sourceNodeId,
          destinationNodeId,
          { algorithm: 'greedy' }
        );
        pathResult = disjointPaths[0] || null;
        break;
      }

      case 'manual':
        // Manual mode - path should be provided externally
        return null;

      case 'srlg-diverse':
        // SRLG-diverse requires a reference path - use shortest as fallback
        pathResult = this.pathFinder.shortestPath(sourceNodeId, destinationNodeId, {
          weightAttribute: options.weightAttribute,
        });
        break;

      default:
        pathResult = this.pathFinder.shortestPath(sourceNodeId, destinationNodeId);
    }

    if (!pathResult) {
      return null;
    }

    return this.convertToServicePath(pathResult, 'working');
  }

  /**
   * Compute a protection path that avoids the working path
   */
  computeProtectionPath(
    sourceNodeId: string,
    destinationNodeId: string,
    workingPath: ServicePath,
    options: ServicePathOptions = DEFAULT_PATH_OPTIONS
  ): ServicePath | null {
    if (!this.pathFinder) {
      throw new Error('PathFinder not configured');
    }

    // Exclude edges from working path
    const excludeEdges = [
      ...(options.excludeEdges || []),
      ...workingPath.edgeIds,
    ];

    // Get SRLG codes from working path edges to exclude
    // Note: SRLG-aware path computation will be fully implemented in Phase 2
    // Currently collecting SRLGs for future use
    this.getPathSRLGs(workingPath.edgeIds); // workingSRLGs collected for SRLG-aware computation

    // Try edge-disjoint first
    const disjointPaths = this.pathFinder.findEdgeDisjointPaths(
      sourceNodeId,
      destinationNodeId,
      { algorithm: 'greedy' }
    );

    // Find a path that doesn't overlap with working path
    for (const pathResult of disjointPaths) {
      const hasOverlap = pathResult.edges.some((e) =>
        workingPath.edgeIds.includes(e)
      );
      if (!hasOverlap) {
        return this.convertToServicePath(pathResult, 'protection');
      }
    }

    // Fallback: compute with edge exclusion
    const pathResult = this.pathFinder.shortestPath(sourceNodeId, destinationNodeId, {
      weightAttribute: options.weightAttribute,
      excludeEdges,
    });

    if (!pathResult) {
      return null;
    }

    return this.convertToServicePath(pathResult, 'protection');
  }

  /**
   * Convert PathResult to ServicePath
   */
  private convertToServicePath(
    result: PathResult,
    type: 'working' | 'protection' | 'restoration'
  ): ServicePath {
    return {
      id: crypto.randomUUID(),
      type,
      nodeIds: result.path,
      edgeIds: result.edges,
      totalDistance: result.totalDistance,
      hopCount: result.hopCount,
      status: 'computed' as ServicePathStatus,
    };
  }

  // ==========================================================================
  // SRLG ANALYSIS
  // ==========================================================================

  /**
   * Get all SRLG codes for a set of edges
   */
  getPathSRLGs(edgeIds: string[]): string[] {
    const srlgs = new Set<string>();

    for (const edgeId of edgeIds) {
      const edge = this.topology.getEdge(edgeId);
      if (edge?.properties.srlgCodes) {
        for (const srlg of edge.properties.srlgCodes) {
          srlgs.add(srlg);
        }
      }
    }

    return Array.from(srlgs);
  }

  /**
   * Analyze SRLG risk between working and protection paths
   */
  analyzeSRLGRisk(
    workingPath: ServicePath,
    protectionPath: ServicePath
  ): SRLGRiskAnalysis {
    const workingSRLGs = new Set(this.getPathSRLGs(workingPath.edgeIds));
    const protectionSRLGs = new Set(this.getPathSRLGs(protectionPath.edgeIds));

    // Find shared SRLGs
    const sharedSRLGCodes: string[] = [];
    for (const srlg of workingSRLGs) {
      if (protectionSRLGs.has(srlg)) {
        sharedSRLGCodes.push(srlg);
      }
    }

    // Find edges with shared SRLGs
    const sharedEdgeIds: string[] = [];
    let sharedDistanceKm = 0;

    for (const edgeId of protectionPath.edgeIds) {
      const edge = this.topology.getEdge(edgeId);
      if (!edge) continue;

      const edgeSRLGs = edge.properties.srlgCodes || [];
      const hasSharedSRLG = edgeSRLGs.some((srlg) => sharedSRLGCodes.includes(srlg));

      if (hasSharedSRLG) {
        sharedEdgeIds.push(edgeId);
        sharedDistanceKm += edge.properties.distance || 0;
      }
    }

    // Calculate risk score
    const totalProtectionDistance = protectionPath.totalDistance || 1;
    const riskScore = Math.min(
      100,
      Math.round((sharedDistanceKm / totalProtectionDistance) * 100)
    );

    // Generate warnings
    const warnings: string[] = [];

    if (sharedSRLGCodes.length > 0) {
      warnings.push(
        `Protection path shares ${sharedSRLGCodes.length} SRLG(s) with working path: ${sharedSRLGCodes.join(', ')}`
      );
    }

    if (riskScore >= 50) {
      warnings.push(
        `High risk: ${riskScore}% of protection path (${sharedDistanceKm.toFixed(1)} km) shares SRLGs with working path`
      );
    } else if (riskScore > 0) {
      warnings.push(
        `Partial risk: ${riskScore}% of protection path (${sharedDistanceKm.toFixed(1)} km) shares SRLGs with working path`
      );
    }

    if (sharedEdgeIds.length > 0) {
      warnings.push(`Affected edges: ${sharedEdgeIds.join(', ')}`);
    }

    return {
      sharedSRLGCodes,
      sharedEdgeIds,
      sharedDistanceKm,
      riskScore,
      warnings,
    };
  }

  // ==========================================================================
  // L1 SERVICE OPERATIONS
  // ==========================================================================

  /**
   * Find compatible L1 services for L2/L3 underlay
   */
  findCompatibleL1Services(
    sourceNodeId: string,
    destinationNodeId: string,
    minDataRate: L1DataRate
  ): L1DWDMService[] {
    return this.services.getL1ServicesForEndpoints(
      sourceNodeId,
      destinationNodeId,
      minDataRate
    );
  }

  // ==========================================================================
  // DEPENDENCY MANAGEMENT
  // ==========================================================================

  /**
   * Get all L2/L3 services that depend on a given L1 service
   */
  getDependentServices(l1ServiceId: string): L2L3Service[] {
    return this.services.getDependentServices(l1ServiceId);
  }

  /**
   * Check if a service can be safely deleted
   */
  canDeleteService(serviceId: string): { canDelete: boolean; blockers: string[] } {
    const service = this.services.getService(serviceId);

    if (!service) {
      return { canDelete: false, blockers: ['Service not found'] };
    }

    // L2/L3 services have no dependents
    if (isL2L3Service(service)) {
      return { canDelete: true, blockers: [] };
    }

    // Check for dependent L2/L3 services
    const dependents = this.getDependentServices(serviceId);

    if (dependents.length > 0) {
      return {
        canDelete: false,
        blockers: dependents.map(
          (d) => `${d.type} service "${d.name}" (${d.id}) depends on this L1 service`
        ),
      };
    }

    return { canDelete: true, blockers: [] };
  }

  /**
   * Get all services that use a specific node
   */
  getServicesUsingNode(nodeId: string): Service[] {
    return this.services.getServices().filter((service) => {
      if (service.sourceNodeId === nodeId || service.destinationNodeId === nodeId) {
        return true;
      }

      if (isL1DWDMService(service)) {
        if (service.workingPath.nodeIds.includes(nodeId)) return true;
        if (service.protectionPath?.nodeIds.includes(nodeId)) return true;
      }

      return false;
    });
  }

  /**
   * Get all services that use a specific edge
   */
  getServicesUsingEdge(edgeId: string): Service[] {
    return this.services.getServices().filter((service) => {
      if (isL1DWDMService(service)) {
        if (service.workingPath.edgeIds.includes(edgeId)) return true;
        if (service.protectionPath?.edgeIds.includes(edgeId)) return true;
      }

      return false;
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a ServiceManager instance with providers
 */
export const createServiceManager = (
  topology: TopologyProvider,
  services: ServiceProvider,
  pathFinder?: PathFinderProvider
): ServiceManager => {
  return new ServiceManager(topology, services, pathFinder);
};
