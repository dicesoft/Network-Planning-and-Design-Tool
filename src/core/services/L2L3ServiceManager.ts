/**
 * L2L3ServiceManager - L2/L3 IP Service Creation and Management
 *
 * Handles the complete lifecycle of L2 Ethernet and L3 IP services including:
 * - Underlay selection (automatic or manual)
 * - Capacity validation
 * - Protection underlay configuration
 * - BFD configuration
 * - Shared portion analysis between underlays
 */

import type { NetworkNode, NetworkEdge } from '@/types/network';
import type {
  Service,
  L1DWDMService,
  L2L3Service,
  L2L3ServiceConfig,
  BFDConfig,
  IPProtectionScheme,
  SharedPortionAnalysis,
  ServiceValidationResult,
  ValidationMessage,
  L1DataRate,
} from '@/types/service';
import {
  createValidResult,
  createInvalidResult,
  isL1DWDMService,
  DEFAULT_BFD_CONFIG,
} from '@/types/service';
import {
  UnderlaySelector,
  type UnderlayServiceProvider,
  type UnderlayTopologyProvider,
} from './UnderlaySelector';
import {
  validateL2L3ServiceConfig,
  validateBFDConfig,
  validateSharedPortion,
  type L2L3ValidationTopologyProvider,
  type L2L3ValidationServiceProvider,
} from '../validation/l2l3ServiceValidation';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Extended topology provider interface for L2/L3 service operations
 */
export interface L2L3TopologyProvider
  extends UnderlayTopologyProvider,
    L2L3ValidationTopologyProvider {
  getNode: (id: string) => NetworkNode | undefined;
  getEdge: (id: string) => NetworkEdge | undefined;
  getNodes: () => NetworkNode[];
  getEdges: () => NetworkEdge[];
}

/**
 * Extended service provider interface for L2/L3 service operations
 */
export interface L2L3ServiceProvider
  extends UnderlayServiceProvider,
    L2L3ValidationServiceProvider {
  getService: (id: string) => Service | undefined;
  getServices: () => Service[];
  getL1ServicesForEndpoints: (
    sourceNodeId: string,
    destinationNodeId: string,
    minDataRate?: L1DataRate
  ) => L1DWDMService[];
}

/**
 * Result of L2/L3 service creation
 */
export interface L2L3ServiceCreateResult {
  success: boolean;
  service?: L2L3Service;
  errors: string[];
  warnings: string[];
  sharedPortionAnalysis?: SharedPortionAnalysis;
  selectedUnderlay?: L1DWDMService;
  selectedProtectionUnderlay?: L1DWDMService;
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

// ============================================================================
// L2/L3 SERVICE MANAGER CLASS
// ============================================================================

/**
 * L2L3ServiceManager handles L2 Ethernet and L3 IP service creation and validation
 */
export class L2L3ServiceManager {
  private topology: L2L3TopologyProvider;
  private services: L2L3ServiceProvider;
  private underlaySelector: UnderlaySelector;

  constructor(
    topology: L2L3TopologyProvider,
    services: L2L3ServiceProvider,
    underlaySelector?: UnderlaySelector
  ) {
    this.topology = topology;
    this.services = services;
    this.underlaySelector = underlaySelector || new UnderlaySelector(services, topology);
  }

  // ==========================================================================
  // MAIN SERVICE CREATION
  // ==========================================================================

  /**
   * Create a new L2/L3 service
   *
   * This is the main entry point for L2/L3 service creation. It:
   * 1. Validates configuration
   * 2. Selects/validates working underlay L1 service
   * 3. Selects/validates protection underlay (if protection enabled)
   * 4. Analyzes shared portion between underlays
   * 5. Returns service ready for store
   */
  createL2L3Service(config: L2L3ServiceConfig): L2L3ServiceCreateResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Step 1: Validate configuration
    const validation = this.validateConfig(config);
    for (const msg of validation.messages) {
      if (msg.severity === 'error') {
        errors.push(msg.message);
      } else {
        warnings.push(msg.message);
      }
    }

    if (errors.length > 0) {
      return { success: false, errors, warnings };
    }

    // Step 2: Select/validate working underlay
    let workingUnderlay: L1DWDMService | undefined;

    if (config.underlayServiceId) {
      // Manual selection - validate the specified underlay
      const underlayResult = this.validateUnderlay(
        config.underlayServiceId,
        config.dataRate,
        config.sourceNodeId,
        config.destinationNodeId
      );

      for (const msg of underlayResult.messages) {
        if (msg.severity === 'error') {
          errors.push(msg.message);
        } else {
          warnings.push(msg.message);
        }
      }

      if (errors.length > 0) {
        return { success: false, errors, warnings };
      }

      workingUnderlay = this.services.getService(config.underlayServiceId) as L1DWDMService;
    } else {
      // Auto-select working underlay
      const selectionResult = this.underlaySelector.selectBestUnderlay(
        config.sourceNodeId,
        config.destinationNodeId,
        config.dataRate
      );

      if (!selectionResult.selected) {
        errors.push(selectionResult.reason);
        return { success: false, errors, warnings };
      }

      workingUnderlay = selectionResult.selected;
      warnings.push(...selectionResult.warnings);
    }

    // Step 3: Select/validate protection underlay (if needed)
    let protectionUnderlay: L1DWDMService | undefined;
    let sharedPortionAnalysis: SharedPortionAnalysis | undefined;

    if (this.needsProtectionUnderlay(config.protectionScheme)) {
      if (config.protectionUnderlayServiceId) {
        // Manual selection - validate
        const protectionResult = this.validateUnderlay(
          config.protectionUnderlayServiceId,
          config.dataRate,
          config.sourceNodeId,
          config.destinationNodeId
        );

        for (const msg of protectionResult.messages) {
          if (msg.severity === 'error') {
            errors.push(msg.message);
          } else {
            warnings.push(msg.message);
          }
        }

        // Check not same as working
        if (config.protectionUnderlayServiceId === workingUnderlay.id) {
          errors.push('Protection underlay must be different from working underlay');
        }

        if (errors.length > 0) {
          return { success: false, errors, warnings, selectedUnderlay: workingUnderlay };
        }

        protectionUnderlay = this.services.getService(
          config.protectionUnderlayServiceId
        ) as L1DWDMService;
      } else {
        // Auto-select diverse protection underlay
        const protectionSelectionResult = this.underlaySelector.selectDiverseUnderlay(
          config.sourceNodeId,
          config.destinationNodeId,
          config.dataRate,
          workingUnderlay.id
        );

        if (protectionSelectionResult.selected) {
          protectionUnderlay = protectionSelectionResult.selected;
          warnings.push(...protectionSelectionResult.warnings);
        } else {
          warnings.push(
            `No protection underlay available: ${protectionSelectionResult.reason}. Service will operate without protection redundancy.`
          );
        }
      }

      // Step 4: Analyze shared portion between underlays
      if (protectionUnderlay) {
        sharedPortionAnalysis = this.analyzeSharedPortion(
          workingUnderlay,
          protectionUnderlay
        );

        // Validate shared portion
        const sharedResult = validateSharedPortion(sharedPortionAnalysis);
        for (const msg of sharedResult.messages) {
          if (msg.severity === 'error') {
            errors.push(msg.message);
          } else {
            warnings.push(msg.message);
          }
        }
      }
    }

    // Step 5: Validate BFD configuration
    const bfdConfig = this.resolveBFDConfig(config.bfdConfig, config.protectionScheme);
    const bfdResult = validateBFDConfig(bfdConfig);
    for (const msg of bfdResult.messages) {
      if (msg.severity === 'error') {
        errors.push(msg.message);
      } else {
        warnings.push(msg.message);
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        errors,
        warnings,
        selectedUnderlay: workingUnderlay,
        selectedProtectionUnderlay: protectionUnderlay,
        sharedPortionAnalysis,
      };
    }

    // Build service object
    const timestamp = new Date().toISOString();
    const service: L2L3Service = {
      id: '', // Will be assigned by serviceStore
      name: config.name,
      type: config.type,
      status: 'planned',
      sourceNodeId: config.sourceNodeId,
      sourcePortId: config.sourcePortId,
      destinationNodeId: config.destinationNodeId,
      destinationPortId: config.destinationPortId,
      dataRate: config.dataRate,
      underlayServiceId: workingUnderlay.id,
      underlayAutoCreated: !config.underlayServiceId,
      protectionScheme: config.protectionScheme,
      protectionUnderlayServiceId: protectionUnderlay?.id,
      bfdConfig,
      sharedPortionAnalysis,
      createdAt: timestamp,
      modifiedAt: timestamp,
      metadata: {},
    };

    return {
      success: true,
      service,
      errors,
      warnings,
      sharedPortionAnalysis,
      selectedUnderlay: workingUnderlay,
      selectedProtectionUnderlay: protectionUnderlay,
    };
  }

  // ==========================================================================
  // UNDERLAY OPERATIONS
  // ==========================================================================

  /**
   * Select a working underlay for an L2/L3 service
   */
  selectUnderlay(
    sourceNodeId: string,
    destNodeId: string,
    dataRate: L1DataRate,
    manualUnderlayId?: string
  ): L1DWDMService | null {
    if (manualUnderlayId) {
      const service = this.services.getService(manualUnderlayId);
      if (service && isL1DWDMService(service)) {
        return service;
      }
      return null;
    }

    const result = this.underlaySelector.selectBestUnderlay(
      sourceNodeId,
      destNodeId,
      dataRate
    );

    return result.selected;
  }

  /**
   * Select a protection underlay that is diverse from the working underlay
   */
  selectProtectionUnderlay(
    sourceNodeId: string,
    destNodeId: string,
    dataRate: L1DataRate,
    workingUnderlayId: string
  ): L1DWDMService | null {
    const result = this.underlaySelector.selectDiverseUnderlay(
      sourceNodeId,
      destNodeId,
      dataRate,
      workingUnderlayId
    );

    return result.selected;
  }

  /**
   * Get all available underlays for endpoints
   */
  getAvailableUnderlays(
    sourceNodeId: string,
    destNodeId: string,
    minDataRate?: L1DataRate
  ): L1DWDMService[] {
    return this.underlaySelector.findCompatibleUnderlays(
      sourceNodeId,
      destNodeId,
      minDataRate || '10G'
    );
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  /**
   * Analyze shared portion between working and protection underlays
   */
  analyzeSharedPortion(
    workingUnderlay: L1DWDMService,
    protectionUnderlay: L1DWDMService
  ): SharedPortionAnalysis {
    const workingEdges = new Set(workingUnderlay.workingPath.edgeIds);
    const protectionEdges = new Set(protectionUnderlay.workingPath.edgeIds);

    // Find shared edges
    const sharedEdgeIds: string[] = [];
    let sharedDistanceKm = 0;

    for (const edgeId of workingEdges) {
      if (protectionEdges.has(edgeId)) {
        sharedEdgeIds.push(edgeId);

        // Get edge distance
        const edge = this.topology.getEdge(edgeId);
        if (edge?.properties.distance) {
          sharedDistanceKm += edge.properties.distance;
        }
      }
    }

    // Calculate total distance of the shorter path
    const workingDistance = workingUnderlay.workingPath.totalDistance || 1;
    const protectionDistance = protectionUnderlay.workingPath.totalDistance || 1;
    const minDistance = Math.min(workingDistance, protectionDistance);

    // Calculate shared percentage
    const sharedPercentage = (sharedDistanceKm / minDistance) * 100;

    return {
      sharedEdgeIds,
      sharedDistanceKm,
      sharedPercentage: Math.min(100, sharedPercentage),
    };
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate L2/L3 service configuration
   */
  validateConfig(config: L2L3ServiceConfig): ServiceValidationResult {
    return validateL2L3ServiceConfig(config, this.topology, this.services);
  }

  /**
   * Validate a specific underlay for an L2/L3 service
   */
  validateUnderlay(
    underlayId: string,
    requiredDataRate: L1DataRate,
    sourceNodeId?: string,
    destNodeId?: string
  ): ServiceValidationResult {
    const messages: ValidationMessage[] = [];

    const underlayValidation = this.underlaySelector.validateUnderlay(
      underlayId,
      sourceNodeId || '',
      destNodeId || '',
      requiredDataRate
    );

    for (const error of underlayValidation.errors) {
      messages.push({
        severity: 'error',
        field: 'underlayServiceId',
        message: error,
        code: 'UNDERLAY_INVALID',
      });
    }

    for (const warning of underlayValidation.warnings) {
      messages.push({
        severity: 'warning',
        field: 'underlayServiceId',
        message: warning,
        code: 'UNDERLAY_WARNING',
      });
    }

    if (messages.length === 0) {
      return createValidResult();
    }

    return createInvalidResult(messages);
  }

  /**
   * Validate BFD configuration
   */
  validateBFD(config: BFDConfig): ServiceValidationResult {
    return validateBFDConfig(config);
  }

  /**
   * Check if an existing L2/L3 service is still valid
   */
  validateExistingService(service: L2L3Service): ServiceValidationResult {
    const messages: ValidationMessage[] = [];

    // Check endpoints still exist
    const sourceNode = this.topology.getNode(service.sourceNodeId);
    const destNode = this.topology.getNode(service.destinationNodeId);

    if (!sourceNode) {
      messages.push({
        severity: 'error',
        field: 'sourceNodeId',
        message: `Source node ${service.sourceNodeId} no longer exists`,
        code: 'NODE_NOT_FOUND',
      });
    }

    if (!destNode) {
      messages.push({
        severity: 'error',
        field: 'destinationNodeId',
        message: `Destination node ${service.destinationNodeId} no longer exists`,
        code: 'NODE_NOT_FOUND',
      });
    }

    // Check working underlay still exists and is valid
    const workingUnderlay = this.services.getService(service.underlayServiceId);

    if (!workingUnderlay) {
      messages.push({
        severity: 'error',
        field: 'underlayServiceId',
        message: `Working underlay ${service.underlayServiceId} no longer exists`,
        code: 'UNDERLAY_NOT_FOUND',
      });
    } else if (!isL1DWDMService(workingUnderlay)) {
      messages.push({
        severity: 'error',
        field: 'underlayServiceId',
        message: `Working underlay ${service.underlayServiceId} is no longer an L1 service`,
        code: 'UNDERLAY_TYPE_CHANGED',
      });
    } else {
      // Check capacity still sufficient
      const underlayCapacity = DATA_RATE_VALUES[workingUnderlay.dataRate];
      const requiredCapacity = DATA_RATE_VALUES[service.dataRate];

      if (underlayCapacity < requiredCapacity) {
        messages.push({
          severity: 'error',
          field: 'underlayServiceId',
          message: `Working underlay capacity (${workingUnderlay.dataRate}) no longer sufficient for ${service.dataRate}`,
          code: 'INSUFFICIENT_CAPACITY',
        });
      }

      // Check status
      if (workingUnderlay.status === 'failed' || workingUnderlay.status === 'decommissioned') {
        messages.push({
          severity: 'error',
          field: 'underlayServiceId',
          message: `Working underlay is ${workingUnderlay.status}`,
          code: 'UNDERLAY_UNAVAILABLE',
        });
      }
    }

    // Check protection underlay if present
    if (service.protectionUnderlayServiceId) {
      const protectionUnderlay = this.services.getService(service.protectionUnderlayServiceId);

      if (!protectionUnderlay) {
        messages.push({
          severity: 'warning',
          field: 'protectionUnderlayServiceId',
          message: `Protection underlay ${service.protectionUnderlayServiceId} no longer exists`,
          code: 'PROTECTION_UNDERLAY_NOT_FOUND',
        });
      } else if (isL1DWDMService(protectionUnderlay)) {
        if (
          protectionUnderlay.status === 'failed' ||
          protectionUnderlay.status === 'decommissioned'
        ) {
          messages.push({
            severity: 'warning',
            field: 'protectionUnderlayServiceId',
            message: `Protection underlay is ${protectionUnderlay.status}`,
            code: 'PROTECTION_UNDERLAY_UNAVAILABLE',
          });
        }
      }
    }

    if (messages.length === 0) {
      return createValidResult();
    }

    return createInvalidResult(messages);
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Check if protection scheme requires a protection underlay
   */
  private needsProtectionUnderlay(scheme: IPProtectionScheme): boolean {
    return scheme === 'bfd-failover';
  }

  /**
   * Resolve BFD config with defaults
   */
  private resolveBFDConfig(
    config: BFDConfig,
    protectionScheme: IPProtectionScheme
  ): BFDConfig {
    // If protection scheme is BFD failover, enable BFD by default
    if (protectionScheme === 'bfd-failover' && !config.enabled) {
      return {
        ...DEFAULT_BFD_CONFIG,
        ...config,
        enabled: true,
      };
    }

    return {
      ...DEFAULT_BFD_CONFIG,
      ...config,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an L2L3ServiceManager instance
 */
export const createL2L3ServiceManager = (
  topology: L2L3TopologyProvider,
  services: L2L3ServiceProvider,
  underlaySelector?: UnderlaySelector
): L2L3ServiceManager => {
  return new L2L3ServiceManager(topology, services, underlaySelector);
};
