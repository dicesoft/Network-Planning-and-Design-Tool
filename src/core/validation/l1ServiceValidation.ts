/**
 * L1 Service Validation Module
 *
 * Provides validation rules for L1 DWDM service creation and configuration.
 * Rules cover endpoint validation, path validation, channel availability,
 * and optical parameter constraints.
 */

import type { NetworkNode, NetworkEdge } from '@/types/network';
import type {
  L1ServiceConfig,
  ServicePath,
  ServiceValidationResult,
  ValidationMessage,
  ModulationType,
  L1DataRate,
  WavelengthMode,
} from '@/types/service';
import { createValidResult, createInvalidResult } from '@/types/service';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Modulation type reach limits in kilometers
 * Based on typical optical performance with standard EDFA amplification
 */
export const MODULATION_REACH_KM: Record<ModulationType, number> = {
  'DP-QPSK': 2500,    // Long-haul, highest reach
  'DP-8QAM': 1200,    // Regional
  'DP-16QAM': 600,    // Metro
  'DP-32QAM': 250,    // Short-reach
  'DP-64QAM': 120,    // Very short, highest spectral efficiency
};

/**
 * Data rate to baud rate mapping (approximate)
 */
export const DATA_RATE_TO_BAUD: Record<L1DataRate, Record<ModulationType, number>> = {
  '10G': {
    'DP-QPSK': 5,
    'DP-8QAM': 3.3,
    'DP-16QAM': 2.5,
    'DP-32QAM': 2,
    'DP-64QAM': 1.67,
  },
  '25G': {
    'DP-QPSK': 12.5,
    'DP-8QAM': 8.33,
    'DP-16QAM': 6.25,
    'DP-32QAM': 5,
    'DP-64QAM': 4.17,
  },
  '100G': {
    'DP-QPSK': 50,
    'DP-8QAM': 33.3,
    'DP-16QAM': 25,
    'DP-32QAM': 20,
    'DP-64QAM': 16.67,
  },
  '200G': {
    'DP-QPSK': 100,
    'DP-8QAM': 66.6,
    'DP-16QAM': 50,
    'DP-32QAM': 40,
    'DP-64QAM': 33.3,
  },
  '400G': {
    'DP-QPSK': 200,
    'DP-8QAM': 133.3,
    'DP-16QAM': 100,
    'DP-32QAM': 80,
    'DP-64QAM': 66.6,
  },
};

/**
 * Port data rate numeric values for comparison
 */
export const DATA_RATE_VALUES: Record<L1DataRate, number> = {
  '10G': 10,
  '25G': 25,
  '100G': 100,
  '200G': 200,
  '400G': 400,
};

/**
 * DWDM channel range (ITU-T C-band)
 */
export const CHANNEL_RANGE = {
  min: 1,
  max: 96,
};

// ============================================================================
// TOPOLOGY PROVIDER INTERFACE
// ============================================================================

/**
 * Interface for accessing topology data during validation
 */
export interface L1ValidationTopologyProvider {
  getNode: (id: string) => NetworkNode | undefined;
  getEdge: (id: string) => NetworkEdge | undefined;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate L1 service configuration
 */
export function validateL1ServiceConfig(
  config: L1ServiceConfig,
  topology: L1ValidationTopologyProvider
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  // Validate name
  const nameResult = validateServiceName(config.name);
  messages.push(...nameResult.messages);

  // Validate endpoints
  const endpointResult = validateEndpoints(
    config.sourceNodeId,
    config.sourcePortId,
    config.destinationNodeId,
    config.destinationPortId,
    topology
  );
  messages.push(...endpointResult.messages);

  // Validate channel number if specified
  if (config.channelNumber !== undefined) {
    const channelResult = validateChannelNumber(config.channelNumber);
    messages.push(...channelResult.messages);
  }

  // Validate protection scheme consistency
  const protectionResult = validateProtectionConfig(
    config.protectionScheme,
    config.restorationEnabled
  );
  messages.push(...protectionResult.messages);

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate service name
 */
export function validateServiceName(name: string): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  if (!name || name.trim().length === 0) {
    messages.push({
      severity: 'error',
      field: 'name',
      message: 'Service name is required',
      code: 'NAME_REQUIRED',
    });
  } else if (name.length > 100) {
    messages.push({
      severity: 'warning',
      field: 'name',
      message: 'Service name is very long (>100 characters)',
      code: 'NAME_TOO_LONG',
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
export function validateEndpoints(
  sourceNodeId: string,
  sourcePortId: string,
  destNodeId: string,
  destPortId: string,
  topology: L1ValidationTopologyProvider
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
  const sourceNode = topology.getNode(sourceNodeId);
  if (!sourceNode) {
    messages.push({
      severity: 'error',
      field: 'sourceNodeId',
      message: 'Source node not found',
      code: 'NODE_NOT_FOUND',
    });
  } else {
    const sourcePortResult = validateDWDMPort(sourceNode, sourcePortId, 'source');
    messages.push(...sourcePortResult.messages);
  }

  // Destination node validation
  const destNode = topology.getNode(destNodeId);
  if (!destNode) {
    messages.push({
      severity: 'error',
      field: 'destinationNodeId',
      message: 'Destination node not found',
      code: 'NODE_NOT_FOUND',
    });
  } else {
    const destPortResult = validateDWDMPort(destNode, destPortId, 'destination');
    messages.push(...destPortResult.messages);
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate that a port exists and is DWDM type
 */
export function validateDWDMPort(
  node: NetworkNode,
  portId: string,
  endpointType: 'source' | 'destination'
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];
  const fieldPrefix = endpointType === 'source' ? 'source' : 'destination';

  const port = node.ports?.find((p) => p.id === portId);

  if (!port) {
    messages.push({
      severity: 'error',
      field: `${fieldPrefix}PortId`,
      message: `${endpointType.charAt(0).toUpperCase() + endpointType.slice(1)} port not found on node`,
      code: 'PORT_NOT_FOUND',
    });
  } else {
    // Check port type
    if (port.type !== 'dwdm') {
      messages.push({
        severity: 'error',
        field: `${fieldPrefix}PortId`,
        message: `${endpointType.charAt(0).toUpperCase() + endpointType.slice(1)} port must be DWDM type for L1 service`,
        code: 'INVALID_PORT_TYPE',
      });
    }

    // Check port status
    if (port.status === 'used') {
      messages.push({
        severity: 'warning',
        field: `${fieldPrefix}PortId`,
        message: `${endpointType.charAt(0).toUpperCase() + endpointType.slice(1)} port is already in use`,
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
 * Validate DWDM channel number
 */
export function validateChannelNumber(channelNumber: number): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  if (channelNumber < CHANNEL_RANGE.min || channelNumber > CHANNEL_RANGE.max) {
    messages.push({
      severity: 'error',
      field: 'channelNumber',
      message: `Channel number must be between ${CHANNEL_RANGE.min} and ${CHANNEL_RANGE.max}`,
      code: 'INVALID_CHANNEL',
    });
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate protection scheme configuration
 */
export function validateProtectionConfig(
  protectionScheme: string,
  restorationEnabled: boolean
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  if (protectionScheme === 'wson-restoration' && !restorationEnabled) {
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
 * Validate path exists and is physically valid
 */
export function validatePath(
  path: ServicePath | null,
  pathType: 'working' | 'protection',
  topology: L1ValidationTopologyProvider
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  if (!path) {
    const severity = pathType === 'working' ? 'error' : 'warning';
    messages.push({
      severity,
      field: `${pathType}Path`,
      message: `No ${pathType} path found between endpoints`,
      code: 'NO_PATH',
    });
  } else {
    // Validate all edges in path exist
    for (const edgeId of path.edgeIds) {
      const edge = topology.getEdge(edgeId);
      if (!edge) {
        messages.push({
          severity: 'error',
          field: `${pathType}Path`,
          message: `Edge ${edgeId} in ${pathType} path does not exist`,
          code: 'EDGE_NOT_FOUND',
        });
      } else if (edge.state === 'failed') {
        messages.push({
          severity: 'error',
          field: `${pathType}Path`,
          message: `Edge ${edgeId} in ${pathType} path is in failed state`,
          code: 'EDGE_FAILED',
        });
      }
    }
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate modulation type against path distance
 */
export function validateModulationReach(
  path: ServicePath,
  modulationType: ModulationType
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];
  const maxReach = MODULATION_REACH_KM[modulationType];

  if (path.totalDistance > maxReach) {
    messages.push({
      severity: 'warning',
      field: 'modulationType',
      message: `Path distance (${path.totalDistance.toFixed(1)} km) exceeds ${modulationType} reach limit (${maxReach} km). Signal quality may be degraded.`,
      code: 'DISTANCE_EXCEEDS_REACH',
    });
  }

  // Also warn if distance is close to limit (>80%)
  if (path.totalDistance > maxReach * 0.8 && path.totalDistance <= maxReach) {
    messages.push({
      severity: 'info',
      field: 'modulationType',
      message: `Path distance (${path.totalDistance.toFixed(1)} km) is close to ${modulationType} reach limit (${maxReach} km)`,
      code: 'DISTANCE_NEAR_LIMIT',
    });
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate channel availability for a path
 */
export function validateChannelAvailability(
  available: boolean,
  mode: WavelengthMode,
  blockedReason?: string,
  blockedEdges?: string[]
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  if (!available) {
    if (mode === 'continuous') {
      messages.push({
        severity: 'error',
        field: 'channelNumber',
        message: blockedReason || 'No common channel available across all edges',
        code: 'NO_CHANNEL_CONTINUOUS',
      });
    } else {
      messages.push({
        severity: 'error',
        field: 'channelNumber',
        message: blockedReason || 'No channels available on one or more edges',
        code: 'NO_CHANNEL_CONVERSION',
      });
    }

    if (blockedEdges && blockedEdges.length > 0) {
      messages.push({
        severity: 'info',
        field: 'channelNumber',
        message: `Blocked edges: ${blockedEdges.join(', ')}`,
        code: 'BLOCKED_EDGES',
      });
    }
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate port data rate against service requirements
 */
export function validatePortCapacity(
  portDataRate: L1DataRate | undefined,
  requiredDataRate: L1DataRate,
  endpointType: 'source' | 'destination'
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  if (!portDataRate) {
    messages.push({
      severity: 'warning',
      field: `${endpointType}PortId`,
      message: `${endpointType.charAt(0).toUpperCase() + endpointType.slice(1)} port data rate not specified`,
      code: 'PORT_RATE_UNKNOWN',
    });
  } else {
    const portValue = DATA_RATE_VALUES[portDataRate];
    const requiredValue = DATA_RATE_VALUES[requiredDataRate];

    if (portValue < requiredValue) {
      messages.push({
        severity: 'error',
        field: `${endpointType}PortId`,
        message: `${endpointType.charAt(0).toUpperCase() + endpointType.slice(1)} port capacity (${portDataRate}) is insufficient for required ${requiredDataRate}`,
        code: 'INSUFFICIENT_CAPACITY',
      });
    }
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate SRLG diversity between working and protection paths
 */
export function validateSRLGDiversity(
  sharedSRLGCount: number,
  riskScore: number,
  maxAcceptableRisk: number = 30
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  if (sharedSRLGCount > 0) {
    if (riskScore >= 70) {
      messages.push({
        severity: 'error',
        field: 'protectionPath',
        message: `Critical SRLG overlap (${riskScore}% risk) - protection path provides minimal redundancy`,
        code: 'SRLG_CRITICAL',
      });
    } else if (riskScore >= maxAcceptableRisk) {
      messages.push({
        severity: 'warning',
        field: 'protectionPath',
        message: `High SRLG overlap (${riskScore}% risk, ${sharedSRLGCount} shared SRLGs) - consider alternative routing`,
        code: 'SRLG_HIGH_OVERLAP',
      });
    } else if (sharedSRLGCount > 0) {
      messages.push({
        severity: 'info',
        field: 'protectionPath',
        message: `Partial SRLG overlap (${riskScore}% risk, ${sharedSRLGCount} shared SRLGs)`,
        code: 'SRLG_PARTIAL_OVERLAP',
      });
    }
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

// ============================================================================
// AGGREGATE VALIDATION
// ============================================================================

/**
 * Perform full L1 service validation including all checks
 */
export function validateL1ServiceComplete(
  config: L1ServiceConfig,
  workingPath: ServicePath | null,
  protectionPath: ServicePath | null,
  channelAvailable: boolean,
  srlgRiskScore: number,
  sharedSRLGCount: number,
  topology: L1ValidationTopologyProvider
): ServiceValidationResult {
  const allMessages: ValidationMessage[] = [];

  // Config validation
  const configResult = validateL1ServiceConfig(config, topology);
  allMessages.push(...configResult.messages);

  // Working path validation
  if (workingPath) {
    const pathResult = validatePath(workingPath, 'working', topology);
    allMessages.push(...pathResult.messages);

    // Modulation reach
    const reachResult = validateModulationReach(workingPath, config.modulationType);
    allMessages.push(...reachResult.messages);
  } else {
    allMessages.push({
      severity: 'error',
      field: 'workingPath',
      message: 'Working path is required',
      code: 'NO_WORKING_PATH',
    });
  }

  // Channel availability
  const channelResult = validateChannelAvailability(channelAvailable, config.wavelengthMode);
  allMessages.push(...channelResult.messages);

  // Protection path (if protection enabled)
  if (config.protectionScheme !== 'none') {
    const protectionResult = validatePath(protectionPath, 'protection', topology);
    allMessages.push(...protectionResult.messages);

    // SRLG diversity
    if (protectionPath) {
      const srlgResult = validateSRLGDiversity(sharedSRLGCount, srlgRiskScore);
      allMessages.push(...srlgResult.messages);
    }
  }

  if (allMessages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(allMessages);
}
