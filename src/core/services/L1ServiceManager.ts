/**
 * L1ServiceManager - L1 DWDM Service Creation and Management
 *
 * Handles the complete lifecycle of L1 (Layer 1) optical DWDM services including:
 * - Path computation (working and protection)
 * - Channel availability checking and allocation
 * - SRLG diversity analysis for protection paths
 * - Wavelength continuity validation
 */

import type { NetworkNode, NetworkEdge } from '@/types/network';
import { FIBER_PROFILE_CONFIGS } from '@/types/network';
import type {
  L1DWDMService,
  L1ServiceConfig,
  ServicePath,
  ServicePathStatus,
  ServiceValidationResult,
  ValidationMessage,
  SRLGRiskAnalysis,
  ChannelAvailabilityResult,
  PathChannelAssignment,
  WavelengthMode,
  ModulationType,
  L1DataRate,
} from '@/types/service';
import { createValidResult, createInvalidResult } from '@/types/service';
import type { PathResult } from '../graph/PathFinder';
import { ChannelChecker, type ChannelTopologyProvider } from './ChannelChecker';
import { SRLGAnalyzer, type SRLGTopologyProvider } from './SRLGAnalyzer';
import { calculateOSNR } from '../optical/OSNREngine';
import type { OSNRResult, SpanInput, TransceiverParams, AmplifierParams } from '../optical/types';
import { DEFAULT_EOL_MARGIN, DEFAULT_CONNECTOR_LOSS } from '../optical/constants';
import { DEFAULT_TRANSCEIVERS } from '@/types/transceiver';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Extended topology provider interface for L1 service operations
 */
export interface L1TopologyProvider extends ChannelTopologyProvider, SRLGTopologyProvider {
  getNode: (id: string) => NetworkNode | undefined;
  getEdge: (id: string) => NetworkEdge | undefined;
  getNodes: () => NetworkNode[];
  getEdges: () => NetworkEdge[];
}

/**
 * Path finder interface for L1 service operations
 */
export interface L1PathFinderProvider {
  shortestPath: (
    sourceId: string,
    targetId: string,
    options?: { excludeEdges?: string[]; excludeNodes?: string[] }
  ) => PathResult | null;
  findSRLGDiversePath: (
    sourceId: string,
    targetId: string,
    referencePath: PathResult,
    maxOverlapPercent?: number,
    options?: { excludeEdges?: string[] }
  ) => PathResult | null;
  findMinimumSRLGOverlapPath: (
    sourceId: string,
    targetId: string,
    referencePath: PathResult,
    options?: { excludeEdges?: string[] }
  ) => { path: PathResult; sharedSRLGs: string[]; overlapPercent: number } | null;
}

/**
 * Result of L1 service creation
 */
export interface L1ServiceCreateResult {
  success: boolean;
  service?: L1DWDMService;
  errors: string[];
  warnings: string[];
  srlgAnalysis?: SRLGRiskAnalysis;
  channelAvailability?: ChannelAvailabilityResult;
  osnrResult?: OSNRResult;
}

/**
 * Modulation reach limits in km
 */
export const MODULATION_REACH_LIMITS: Record<ModulationType, number> = {
  'DP-QPSK': 2500,
  'DP-8QAM': 1200,
  'DP-16QAM': 600,
  'DP-32QAM': 250,
  'DP-64QAM': 120,
};

/**
 * Port data rate numeric values
 */
const DATA_RATE_VALUES: Record<L1DataRate, number> = {
  '10G': 10,
  '25G': 25,
  '100G': 100,
  '200G': 200,
  '400G': 400,
};

// ============================================================================
// L1 SERVICE MANAGER CLASS
// ============================================================================

/**
 * L1ServiceManager handles L1 DWDM service creation and validation
 */
export class L1ServiceManager {
  private topology: L1TopologyProvider;
  private pathFinder: L1PathFinderProvider;
  private channelChecker: ChannelChecker;
  private srlgAnalyzer: SRLGAnalyzer;

  constructor(
    topology: L1TopologyProvider,
    pathFinder: L1PathFinderProvider
  ) {
    this.topology = topology;
    this.pathFinder = pathFinder;
    this.channelChecker = new ChannelChecker(topology);
    this.srlgAnalyzer = new SRLGAnalyzer(topology);
  }

  // ==========================================================================
  // MAIN SERVICE CREATION
  // ==========================================================================

  /**
   * Create a new L1 DWDM service
   *
   * This is the main entry point for L1 service creation. It:
   * 1. Validates endpoints and configuration
   * 2. Computes working path
   * 3. Checks channel availability
   * 4. Computes protection path (if scheme != none)
   * 5. Analyzes SRLG risk between paths
   * 6. Returns service ready for store
   */
  createL1Service(config: L1ServiceConfig): L1ServiceCreateResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Step 1: Validate configuration
    const validation = this.validateL1Config(config);
    // Always collect messages (warnings included even when valid)
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

    // Step 2: Compute working path
    const workingPathResult = this.computeWorkingPath(
      config.sourceNodeId,
      config.destinationNodeId,
      config.pathOptions
    );

    if (!workingPathResult) {
      errors.push('No path exists between source and destination');
      return { success: false, errors, warnings };
    }

    // Convert to ServicePath
    const workingPath = this.pathResultToServicePath(workingPathResult, 'working');

    // Step 3: Check channel availability
    const channelAvailability = this.channelChecker.checkChannelAvailability(
      workingPath,
      config.wavelengthMode,
      config.channelNumber
    );

    if (!channelAvailability.available) {
      errors.push(channelAvailability.blockedReason || 'No channels available on path');
      return { success: false, errors, warnings, channelAvailability };
    }

    // Assign channel to working path
    const assignedChannel = config.channelNumber || channelAvailability.suggestedChannel;
    if (config.wavelengthMode === 'continuous' && assignedChannel) {
      workingPath.channelNumber = assignedChannel;
    } else if (config.wavelengthMode === 'conversion-allowed') {
      workingPath.channelAssignments = this.createChannelAssignments(
        workingPath,
        channelAvailability,
        config.channelNumber
      );
    }
    workingPath.status = 'allocated';

    // Step 4: Compute protection path (if needed)
    let protectionPath: ServicePath | undefined;
    let srlgAnalysis: SRLGRiskAnalysis | undefined;

    if (config.protectionScheme !== 'none') {
      const protectionResult = this.computeProtectionPath(
        config.sourceNodeId,
        config.destinationNodeId,
        workingPathResult,
        config.pathOptions
      );

      if (protectionResult) {
        protectionPath = this.pathResultToServicePath(protectionResult, 'protection');

        // Check channel availability for protection path
        const protectionChannelAvail = this.channelChecker.checkChannelAvailability(
          protectionPath,
          config.wavelengthMode,
          config.channelNumber
        );

        if (protectionChannelAvail.available) {
          if (config.wavelengthMode === 'continuous') {
            protectionPath.channelNumber =
              config.channelNumber || protectionChannelAvail.suggestedChannel;
          } else {
            protectionPath.channelAssignments = this.createChannelAssignments(
              protectionPath,
              protectionChannelAvail,
              config.channelNumber
            );
          }
          protectionPath.status = 'allocated';
        } else {
          warnings.push(
            `Protection path has limited channel availability: ${protectionChannelAvail.blockedReason}`
          );
          protectionPath.status = 'computed';
        }

        // Step 5: Analyze SRLG risk
        srlgAnalysis = this.srlgAnalyzer.comparePaths(workingPath, protectionPath);

        if (srlgAnalysis.riskScore > 0) {
          warnings.push(...srlgAnalysis.warnings);
        }
      } else {
        warnings.push(
          'No protection path found - service will operate without redundancy'
        );
      }
    }

    // Step 6: Validate optical parameters
    const opticalValidation = this.validateOpticalParameters(
      workingPath,
      config.modulationType,
      config.dataRate
    );
    // Always collect optical validation messages (warnings included)
    for (const msg of opticalValidation.messages) {
      if (msg.severity === 'error') {
        errors.push(msg.message);
      } else {
        warnings.push(msg.message);
      }
    }

    if (errors.length > 0) {
      return { success: false, errors, warnings, channelAvailability };
    }

    // Step 7: OSNR calculation (if transceiver specified)
    let osnrResult: OSNRResult | undefined;
    if (config.transceiverTypeId) {
      osnrResult = this.computeOSNR(workingPath, config);
      if (osnrResult) {
        if (!osnrResult.feasible) {
          warnings.push(
            `OSNR infeasible: system margin ${osnrResult.systemMargin.toFixed(1)} dB ` +
            `(GSNR ${osnrResult.finalGSNR.toFixed(1)} dB, required ${osnrResult.requiredOSNR.toFixed(1)} dB + ` +
            `${osnrResult.eolMargin.toFixed(1)} dB EoL)`
          );
        }
        if (osnrResult.warnings) {
          for (const w of osnrResult.warnings) {
            if (!warnings.includes(w)) warnings.push(w);
          }
        }
      }
    }

    // Build service object
    const timestamp = new Date().toISOString();
    const service: L1DWDMService = {
      id: '', // Will be assigned by serviceStore
      name: config.name,
      type: 'l1-dwdm',
      status: 'planned',
      sourceNodeId: config.sourceNodeId,
      sourcePortId: config.sourcePortId,
      destinationNodeId: config.destinationNodeId,
      destinationPortId: config.destinationPortId,
      dataRate: config.dataRate,
      modulationType: config.modulationType,
      channelWidth: config.channelWidth,
      wavelengthMode: config.wavelengthMode,
      channelNumber: workingPath.channelNumber,
      transceiverTypeId: config.transceiverTypeId,
      osnrResult,
      workingPath,
      protectionPath,
      protectionScheme: config.protectionScheme,
      restorationEnabled: config.restorationEnabled,
      srlgAnalysis,
      createdAt: timestamp,
      modifiedAt: timestamp,
      metadata: {},
    };

    return {
      success: true,
      service,
      errors,
      warnings,
      srlgAnalysis,
      channelAvailability,
      osnrResult,
    };
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate L1 service configuration
   */
  validateL1Config(config: L1ServiceConfig): ServiceValidationResult {
    const messages: ValidationMessage[] = [];

    // Validate endpoints
    const endpointResult = this.validateEndpoints(
      config.sourceNodeId,
      config.sourcePortId,
      config.destinationNodeId,
      config.destinationPortId
    );
    messages.push(...endpointResult.messages);

    // Validate name
    if (!config.name || config.name.trim().length === 0) {
      messages.push({
        severity: 'error',
        field: 'name',
        message: 'Service name is required',
        code: 'NAME_REQUIRED',
      });
    }

    // Validate channel number if specified
    if (config.channelNumber !== undefined) {
      if (config.channelNumber < 1 || config.channelNumber > 96) {
        messages.push({
          severity: 'error',
          field: 'channelNumber',
          message: 'Channel number must be between 1 and 96',
          code: 'INVALID_CHANNEL',
        });
      }
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
   * Validate source and destination endpoints
   */
  validateEndpoints(
    sourceNodeId: string,
    sourcePortId: string,
    destNodeId: string,
    destPortId: string
  ): ServiceValidationResult {
    const messages: ValidationMessage[] = [];

    // Same endpoints check
    if (sourceNodeId === destNodeId) {
      messages.push({
        severity: 'error',
        field: 'destinationNodeId',
        message: 'Source and destination must be different nodes',
        code: 'SAME_ENDPOINT',
      });
    }

    // Source node validation
    const sourceNode = this.topology.getNode(sourceNodeId);
    if (!sourceNode) {
      messages.push({
        severity: 'error',
        field: 'sourceNodeId',
        message: 'Source node not found',
        code: 'NODE_NOT_FOUND',
      });
    } else {
      const sourcePort = sourceNode.ports?.find((p) => p.id === sourcePortId);
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

    // Destination node validation
    const destNode = this.topology.getNode(destNodeId);
    if (!destNode) {
      messages.push({
        severity: 'error',
        field: 'destinationNodeId',
        message: 'Destination node not found',
        code: 'NODE_NOT_FOUND',
      });
    } else {
      const destPort = destNode.ports?.find((p) => p.id === destPortId);
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

    if (messages.length === 0) {
      return createValidResult();
    }

    return createInvalidResult(messages);
  }

  /**
   * Validate optical parameters (modulation, distance)
   */
  validateOpticalParameters(
    path: ServicePath,
    modulationType: ModulationType,
    dataRate: L1DataRate
  ): ServiceValidationResult {
    const messages: ValidationMessage[] = [];
    const maxReach = MODULATION_REACH_LIMITS[modulationType];

    // Check distance limit
    if (path.totalDistance > maxReach) {
      messages.push({
        severity: 'warning',
        field: 'modulationType',
        message: `Path distance (${path.totalDistance.toFixed(1)} km) exceeds ${modulationType} reach limit (${maxReach} km). Consider using a lower-order modulation.`,
        code: 'DISTANCE_EXCEEDS_REACH',
      });
    }

    // Validate port data rate compatibility
    // This is a simplified check - real implementation would check actual port capabilities
    const dataRateValue = DATA_RATE_VALUES[dataRate];
    if (dataRateValue > 400) {
      messages.push({
        severity: 'error',
        field: 'dataRate',
        message: 'Data rate exceeds maximum supported rate',
        code: 'INVALID_DATA_RATE',
      });
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
   * Compute working path between endpoints
   */
  computeWorkingPath(
    sourceNodeId: string,
    destinationNodeId: string,
    options?: { excludeEdges?: string[]; excludeNodes?: string[] }
  ): PathResult | null {
    return this.pathFinder.shortestPath(sourceNodeId, destinationNodeId, options);
  }

  /**
   * Compute protection path that is SRLG-diverse from working path
   */
  computeProtectionPath(
    sourceNodeId: string,
    destinationNodeId: string,
    workingPath: PathResult,
    options?: { excludeEdges?: string[]; excludeNodes?: string[]; maxSRLGOverlap?: number }
  ): PathResult | null {
    // First try to find a fully SRLG-diverse path
    const diversePath = this.pathFinder.findSRLGDiversePath(
      sourceNodeId,
      destinationNodeId,
      workingPath,
      0, // 0% overlap = fully diverse
      { excludeEdges: options?.excludeEdges }
    );

    if (diversePath) {
      return diversePath;
    }

    // If no fully diverse path exists, find minimum overlap path
    const maxOverlap = options?.maxSRLGOverlap ?? 50; // Default 50% max overlap
    const minOverlapResult = this.pathFinder.findMinimumSRLGOverlapPath(
      sourceNodeId,
      destinationNodeId,
      workingPath,
      { excludeEdges: options?.excludeEdges }
    );

    if (minOverlapResult && minOverlapResult.overlapPercent <= maxOverlap) {
      return minOverlapResult.path;
    }

    // Fallback: try edge-disjoint path (avoids working path edges)
    const excludeEdges = [
      ...(options?.excludeEdges || []),
      ...workingPath.edges,
    ];

    return this.pathFinder.shortestPath(sourceNodeId, destinationNodeId, {
      ...options,
      excludeEdges,
    });
  }

  // ==========================================================================
  // CHANNEL OPERATIONS
  // ==========================================================================

  /**
   * Check if channel is available across entire path
   */
  checkChannelAvailability(
    path: ServicePath,
    mode: WavelengthMode,
    requestedChannel?: number
  ): ChannelAvailabilityResult {
    return this.channelChecker.checkChannelAvailability(path, mode, requestedChannel);
  }

  /**
   * Get available channels for a path
   */
  getAvailableChannels(path: ServicePath): number[] {
    return this.channelChecker.findCommonChannels(path.edgeIds);
  }

  /**
   * Create per-edge channel assignments for conversion mode
   */
  private createChannelAssignments(
    path: ServicePath,
    availability: ChannelAvailabilityResult,
    preferredChannel?: number
  ): PathChannelAssignment[] {
    const assignments: PathChannelAssignment[] = [];

    for (let i = 0; i < path.edgeIds.length; i++) {
      const edgeId = path.edgeIds[i];
      const edge = this.topology.getEdge(edgeId);
      if (!edge) continue;

      // Get available channels for this edge
      const edgeChannels = availability.perEdgeChannels?.get(edgeId) || [];

      // Prefer the requested channel if available, otherwise use first available
      let channelNumber = preferredChannel;
      if (!channelNumber || !edgeChannels.includes(channelNumber)) {
        channelNumber = edgeChannels[0];
      }

      if (channelNumber) {
        assignments.push({
          edgeId,
          channelNumber,
          sourcePortId: edge.source.portId || '',
          targetPortId: edge.target.portId || '',
        });
      }
    }

    return assignments;
  }

  // ==========================================================================
  // SRLG ANALYSIS
  // ==========================================================================

  /**
   * Analyze SRLG risk between working and protection paths
   */
  analyzeSRLGRisk(
    workingPath: ServicePath,
    protectionPath: ServicePath
  ): SRLGRiskAnalysis {
    return this.srlgAnalyzer.comparePaths(workingPath, protectionPath);
  }

  /**
   * Get SRLGs to avoid based on working path
   */
  getSRLGsToAvoid(workingPath: ServicePath): string[] {
    return this.srlgAnalyzer.getSRLGsToAvoid(workingPath);
  }

  // ==========================================================================
  // OSNR CALCULATION
  // ==========================================================================

  /**
   * Compute OSNR for a service path using transceiver parameters
   */
  private computeOSNR(
    path: ServicePath,
    config: L1ServiceConfig,
  ): OSNRResult | undefined {
    if (!config.transceiverTypeId) return undefined;

    // Find transceiver
    const transceiver = DEFAULT_TRANSCEIVERS.find((t) => t.id === config.transceiverTypeId);
    if (!transceiver) return undefined;

    // Find modulation info
    const modInfo = transceiver.supportedModulations.find(
      (m) => m.modulation === config.modulationType
    );
    if (!modInfo) return undefined;

    // Build spans from path edges
    const spans: SpanInput[] = [];
    const amps: AmplifierParams[] = [];

    for (let i = 0; i < path.edgeIds.length; i++) {
      const edge = this.topology.getEdge(path.edgeIds[i]);
      if (!edge) continue;

      const fiberParams = edge.properties?.fiberProfile;
      const profileType = fiberParams?.profileType || 'G.652.D';
      const fiberProfile = FIBER_PROFILE_CONFIGS[profileType] || FIBER_PROFILE_CONFIGS['G.652.D'];

      spans.push({
        length: edge.properties?.distance || 50,
        attenuation: fiberParams?.attenuationOverride ?? fiberProfile.attenuation,
        chromaticDispersion: fiberParams?.chromaticDispersionOverride ?? fiberProfile.chromaticDispersion,
        connectorCount: 2,
        connectorLoss: DEFAULT_CONNECTOR_LOSS,
      });

      // Check for amplifier nodes along the path
      const targetNode = this.topology.getNode(edge.target.nodeId);
      if (targetNode?.type === 'amplifier') {
        amps.push({
          id: targetNode.id,
          type: 'edfa',
          gain: edge.properties?.distance ? edge.properties.distance * 0.2 + 1 : 17,
          noiseFigure: 5.5,
          afterSpanIndex: i,
        });
      }
    }

    if (spans.length === 0) return undefined;

    const transceiverParams: TransceiverParams = {
      launchPower: transceiver.launchPower,
      txOSNR: transceiver.txOSNR,
      requiredOSNR: modInfo.requiredOSNR,
      receiverSensitivity: transceiver.receiverSensitivity,
      baudRate: transceiver.baudRate,
    };

    try {
      return calculateOSNR(spans, transceiverParams, amps, DEFAULT_EOL_MARGIN);
    } catch {
      return undefined;
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Convert PathResult to ServicePath
   */
  private pathResultToServicePath(
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

  /**
   * Validate an existing L1 service (for re-validation after topology changes)
   */
  validateExistingService(service: L1DWDMService): ServiceValidationResult {
    const messages: ValidationMessage[] = [];

    // Check endpoints still exist
    const endpointResult = this.validateEndpoints(
      service.sourceNodeId,
      service.sourcePortId,
      service.destinationNodeId,
      service.destinationPortId
    );
    messages.push(...endpointResult.messages);

    // Check working path still valid
    for (const edgeId of service.workingPath.edgeIds) {
      const edge = this.topology.getEdge(edgeId);
      if (!edge) {
        messages.push({
          severity: 'error',
          field: 'workingPath',
          message: `Edge ${edgeId} in working path no longer exists`,
          code: 'PATH_INVALID',
        });
      }
    }

    // Check protection path if present
    if (service.protectionPath) {
      for (const edgeId of service.protectionPath.edgeIds) {
        const edge = this.topology.getEdge(edgeId);
        if (!edge) {
          messages.push({
            severity: 'warning',
            field: 'protectionPath',
            message: `Edge ${edgeId} in protection path no longer exists`,
            code: 'PROTECTION_PATH_INVALID',
          });
        }
      }
    }

    if (messages.length === 0) {
      return createValidResult();
    }

    return createInvalidResult(messages);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an L1ServiceManager instance
 */
export const createL1ServiceManager = (
  topology: L1TopologyProvider,
  pathFinder: L1PathFinderProvider
): L1ServiceManager => {
  return new L1ServiceManager(topology, pathFinder);
};
