/**
 * L2/L3 Service Validation Module
 *
 * Provides validation rules for L2 Ethernet and L3 IP service creation
 * and configuration. Validates endpoints, underlay services, capacity,
 * protection configuration, and BFD settings.
 */

import type { NetworkNode } from '@/types/network';
import type {
  L2L3ServiceConfig,
  L1DWDMService,
  L2L3Service,
  Service,
  BFDConfig,
  IPProtectionScheme,
  SharedPortionAnalysis,
  ServiceValidationResult,
  ValidationMessage,
  L1DataRate,
} from '@/types/service';
import { createValidResult, createInvalidResult, isL1DWDMService } from '@/types/service';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Data rate numeric values for comparison
 */
export const DATA_RATE_VALUES: Record<L1DataRate, number> = {
  '10G': 10,
  '25G': 25,
  '100G': 100,
  '200G': 200,
  '400G': 400,
};

/**
 * BFD timing constraints
 */
export const BFD_CONSTRAINTS = {
  minTxInterval: {
    min: 1000, // 1ms minimum (1000 microseconds)
    recommendedMin: 50000, // 50ms recommended minimum
  },
  minRxInterval: {
    min: 1000, // 1ms minimum
    recommendedMin: 50000, // 50ms recommended minimum
  },
  multiplier: {
    min: 1,
    max: 255,
    recommended: 3,
  },
};

/**
 * Shared portion risk thresholds
 */
export const SHARED_PORTION_THRESHOLDS = {
  warning: 30, // 30% overlap triggers warning
  high: 50, // 50% overlap is high risk
  critical: 70, // 70% overlap is critical
};

// ============================================================================
// TOPOLOGY PROVIDER INTERFACE
// ============================================================================

/**
 * Interface for accessing topology data during validation
 */
export interface L2L3ValidationTopologyProvider {
  getNode: (id: string) => NetworkNode | undefined;
}

/**
 * Interface for accessing service data during validation
 */
export interface L2L3ValidationServiceProvider {
  getService: (id: string) => Service | undefined;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate L2/L3 service configuration
 */
export function validateL2L3ServiceConfig(
  config: L2L3ServiceConfig,
  topology: L2L3ValidationTopologyProvider,
  services: L2L3ValidationServiceProvider
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  // Validate name
  const nameResult = validateServiceName(config.name);
  messages.push(...nameResult.messages);

  // Validate endpoints
  const endpointResult = validateEndpoints(
    config.sourceNodeId,
    config.destinationNodeId,
    topology
  );
  messages.push(...endpointResult.messages);

  // Validate underlay service
  if (config.underlayServiceId) {
    const underlayResult = validateUnderlay(
      config.underlayServiceId,
      services,
      config.dataRate
    );
    messages.push(...underlayResult.messages);
  } else if (!config.autoCreateUnderlay) {
    messages.push({
      severity: 'error',
      field: 'underlayServiceId',
      message: 'L1 underlay service required. Select existing or enable auto-create.',
      code: 'UNDERLAY_REQUIRED',
    });
  }

  // Validate protection underlay
  if (config.protectionUnderlayServiceId) {
    const protectionResult = validateProtectionUnderlay(
      config.protectionUnderlayServiceId,
      config.underlayServiceId,
      services,
      config.dataRate
    );
    messages.push(...protectionResult.messages);
  }

  // Validate BFD configuration
  const bfdResult = validateBFDConfig(config.bfdConfig);
  messages.push(...bfdResult.messages);

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
  destNodeId: string,
  topology: L2L3ValidationTopologyProvider
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  // Check source != destination
  if (sourceNodeId === destNodeId) {
    messages.push({
      severity: 'error',
      field: 'destinationNodeId',
      message: 'Source and destination must be different nodes',
      code: 'SAME_ENDPOINT',
    });
  }

  // Check source node exists
  const sourceNode = topology.getNode(sourceNodeId);
  if (!sourceNode) {
    messages.push({
      severity: 'error',
      field: 'sourceNodeId',
      message: 'Source node not found',
      code: 'NODE_NOT_FOUND',
    });
  }

  // Check destination node exists
  const destNode = topology.getNode(destNodeId);
  if (!destNode) {
    messages.push({
      severity: 'error',
      field: 'destinationNodeId',
      message: 'Destination node not found',
      code: 'NODE_NOT_FOUND',
    });
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate underlay service
 */
export function validateUnderlay(
  underlayId: string,
  services: L2L3ValidationServiceProvider,
  requiredDataRate: L1DataRate
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  const underlay = services.getService(underlayId);

  // Check service exists
  if (!underlay) {
    messages.push({
      severity: 'error',
      field: 'underlayServiceId',
      message: `Underlay service ${underlayId} not found`,
      code: 'UNDERLAY_NOT_FOUND',
    });
    return createInvalidResult(messages);
  }

  // Check service is L1 type
  if (!isL1DWDMService(underlay)) {
    messages.push({
      severity: 'error',
      field: 'underlayServiceId',
      message: `Underlay service must be L1 DWDM type (found: ${underlay.type})`,
      code: 'INVALID_UNDERLAY_TYPE',
    });
    return createInvalidResult(messages);
  }

  // Check capacity
  const underlayCapacity = DATA_RATE_VALUES[underlay.dataRate];
  const requiredCapacity = DATA_RATE_VALUES[requiredDataRate];

  if (underlayCapacity < requiredCapacity) {
    messages.push({
      severity: 'error',
      field: 'underlayServiceId',
      message: `Underlay capacity (${underlay.dataRate}) insufficient for required ${requiredDataRate}`,
      code: 'INSUFFICIENT_CAPACITY',
    });
  }

  // Check status
  if (underlay.status !== 'active') {
    messages.push({
      severity: 'warning',
      field: 'underlayServiceId',
      message: `Underlay service is not active (status: ${underlay.status})`,
      code: 'UNDERLAY_NOT_ACTIVE',
    });
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate protection underlay service
 */
export function validateProtectionUnderlay(
  protectionUnderlayId: string,
  workingUnderlayId: string | undefined,
  services: L2L3ValidationServiceProvider,
  requiredDataRate: L1DataRate
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  // Check protection != working
  if (protectionUnderlayId === workingUnderlayId) {
    messages.push({
      severity: 'error',
      field: 'protectionUnderlayServiceId',
      message: 'Protection underlay must be different from working underlay',
      code: 'SAME_UNDERLAY',
    });
    return createInvalidResult(messages);
  }

  const protection = services.getService(protectionUnderlayId);

  // Check service exists
  if (!protection) {
    messages.push({
      severity: 'error',
      field: 'protectionUnderlayServiceId',
      message: `Protection underlay service ${protectionUnderlayId} not found`,
      code: 'PROTECTION_UNDERLAY_NOT_FOUND',
    });
    return createInvalidResult(messages);
  }

  // Check service is L1 type
  if (!isL1DWDMService(protection)) {
    messages.push({
      severity: 'error',
      field: 'protectionUnderlayServiceId',
      message: `Protection underlay must be L1 DWDM type (found: ${protection.type})`,
      code: 'INVALID_PROTECTION_UNDERLAY_TYPE',
    });
    return createInvalidResult(messages);
  }

  // Check capacity
  const protectionCapacity = DATA_RATE_VALUES[protection.dataRate];
  const requiredCapacity = DATA_RATE_VALUES[requiredDataRate];

  if (protectionCapacity < requiredCapacity) {
    messages.push({
      severity: 'error',
      field: 'protectionUnderlayServiceId',
      message: `Protection underlay capacity (${protection.dataRate}) insufficient for required ${requiredDataRate}`,
      code: 'INSUFFICIENT_PROTECTION_CAPACITY',
    });
  }

  // Check status
  if (protection.status !== 'active') {
    messages.push({
      severity: 'warning',
      field: 'protectionUnderlayServiceId',
      message: `Protection underlay service is not active (status: ${protection.status})`,
      code: 'PROTECTION_UNDERLAY_NOT_ACTIVE',
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
export function validateBFDConfig(config: BFDConfig): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  if (!config.enabled) {
    // BFD disabled - no validation needed
    return createValidResult();
  }

  // Validate minTxInterval
  if (config.minTxInterval < BFD_CONSTRAINTS.minTxInterval.min) {
    messages.push({
      severity: 'error',
      field: 'bfdConfig.minTxInterval',
      message: `BFD TX interval must be at least ${BFD_CONSTRAINTS.minTxInterval.min} microseconds (1ms)`,
      code: 'BFD_TX_TOO_LOW',
    });
  } else if (config.minTxInterval < BFD_CONSTRAINTS.minTxInterval.recommendedMin) {
    messages.push({
      severity: 'warning',
      field: 'bfdConfig.minTxInterval',
      message: `BFD TX interval below ${BFD_CONSTRAINTS.minTxInterval.recommendedMin / 1000}ms may cause high CPU usage`,
      code: 'BFD_TX_LOW',
    });
  }

  // Validate minRxInterval
  if (config.minRxInterval < BFD_CONSTRAINTS.minRxInterval.min) {
    messages.push({
      severity: 'error',
      field: 'bfdConfig.minRxInterval',
      message: `BFD RX interval must be at least ${BFD_CONSTRAINTS.minRxInterval.min} microseconds (1ms)`,
      code: 'BFD_RX_TOO_LOW',
    });
  } else if (config.minRxInterval < BFD_CONSTRAINTS.minRxInterval.recommendedMin) {
    messages.push({
      severity: 'warning',
      field: 'bfdConfig.minRxInterval',
      message: `BFD RX interval below ${BFD_CONSTRAINTS.minRxInterval.recommendedMin / 1000}ms may cause high CPU usage`,
      code: 'BFD_RX_LOW',
    });
  }

  // Validate multiplier
  if (config.multiplier < BFD_CONSTRAINTS.multiplier.min) {
    messages.push({
      severity: 'error',
      field: 'bfdConfig.multiplier',
      message: `BFD multiplier must be at least ${BFD_CONSTRAINTS.multiplier.min}`,
      code: 'BFD_MULTIPLIER_TOO_LOW',
    });
  } else if (config.multiplier > BFD_CONSTRAINTS.multiplier.max) {
    messages.push({
      severity: 'error',
      field: 'bfdConfig.multiplier',
      message: `BFD multiplier must be at most ${BFD_CONSTRAINTS.multiplier.max}`,
      code: 'BFD_MULTIPLIER_TOO_HIGH',
    });
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate shared portion analysis
 */
export function validateSharedPortion(
  analysis: SharedPortionAnalysis | undefined
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  if (!analysis) {
    return createValidResult();
  }

  const { sharedPercentage } = analysis;

  if (sharedPercentage >= SHARED_PORTION_THRESHOLDS.critical) {
    messages.push({
      severity: 'error',
      field: 'sharedPortionAnalysis',
      message: `Critical path overlap (${sharedPercentage.toFixed(1)}%) - protection provides minimal redundancy`,
      code: 'SHARED_PORTION_CRITICAL',
    });
  } else if (sharedPercentage >= SHARED_PORTION_THRESHOLDS.high) {
    messages.push({
      severity: 'warning',
      field: 'sharedPortionAnalysis',
      message: `High path overlap (${sharedPercentage.toFixed(1)}%) between working and protection underlays`,
      code: 'SHARED_PORTION_HIGH',
    });
  } else if (sharedPercentage >= SHARED_PORTION_THRESHOLDS.warning) {
    messages.push({
      severity: 'info',
      field: 'sharedPortionAnalysis',
      message: `Moderate path overlap (${sharedPercentage.toFixed(1)}%) between underlays`,
      code: 'SHARED_PORTION_MODERATE',
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
export function validateProtectionScheme(
  scheme: IPProtectionScheme,
  hasProtectionUnderlay: boolean,
  bfdEnabled: boolean
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  switch (scheme) {
    case 'bfd-failover':
      if (!bfdEnabled) {
        messages.push({
          severity: 'warning',
          field: 'protectionScheme',
          message: 'BFD failover protection selected but BFD is not enabled',
          code: 'BFD_NOT_ENABLED',
        });
      }
      if (!hasProtectionUnderlay) {
        messages.push({
          severity: 'warning',
          field: 'protectionScheme',
          message: 'BFD failover selected but no protection underlay configured',
          code: 'NO_PROTECTION_UNDERLAY',
        });
      }
      break;

    case 'ecmp':
    case 'fast-reroute':
      // These schemes work with single underlay
      break;

    case 'none':
      // No protection - valid
      break;
  }

  if (messages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(messages);
}

/**
 * Validate underlay endpoint matching
 */
export function validateUnderlayEndpoints(
  sourceNodeId: string,
  destNodeId: string,
  underlay: L1DWDMService
): ServiceValidationResult {
  const messages: ValidationMessage[] = [];

  // Check if underlay endpoints match (bidirectional)
  const endpointsMatch =
    (underlay.sourceNodeId === sourceNodeId && underlay.destinationNodeId === destNodeId) ||
    (underlay.sourceNodeId === destNodeId && underlay.destinationNodeId === sourceNodeId);

  if (!endpointsMatch) {
    messages.push({
      severity: 'error',
      field: 'underlayServiceId',
      message: `Underlay endpoints (${underlay.sourceNodeId} → ${underlay.destinationNodeId}) do not match L2/L3 service endpoints (${sourceNodeId} → ${destNodeId})`,
      code: 'ENDPOINT_MISMATCH',
    });
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
 * Perform full L2/L3 service validation including all checks
 */
export function validateL2L3ServiceComplete(
  service: L2L3Service,
  workingUnderlay: L1DWDMService | undefined,
  protectionUnderlay: L1DWDMService | undefined,
  topology: L2L3ValidationTopologyProvider
): ServiceValidationResult {
  const allMessages: ValidationMessage[] = [];

  // Validate name
  const nameResult = validateServiceName(service.name);
  allMessages.push(...nameResult.messages);

  // Validate endpoints
  const endpointResult = validateEndpoints(
    service.sourceNodeId,
    service.destinationNodeId,
    topology
  );
  allMessages.push(...endpointResult.messages);

  // Validate working underlay
  if (!workingUnderlay) {
    allMessages.push({
      severity: 'error',
      field: 'underlayServiceId',
      message: 'Working underlay service not found',
      code: 'UNDERLAY_NOT_FOUND',
    });
  } else {
    // Check capacity
    const underlayCapacity = DATA_RATE_VALUES[workingUnderlay.dataRate];
    const requiredCapacity = DATA_RATE_VALUES[service.dataRate];

    if (underlayCapacity < requiredCapacity) {
      allMessages.push({
        severity: 'error',
        field: 'underlayServiceId',
        message: `Underlay capacity (${workingUnderlay.dataRate}) insufficient for required ${service.dataRate}`,
        code: 'INSUFFICIENT_CAPACITY',
      });
    }

    // Check endpoint matching
    const endpointMatchResult = validateUnderlayEndpoints(
      service.sourceNodeId,
      service.destinationNodeId,
      workingUnderlay
    );
    allMessages.push(...endpointMatchResult.messages);

    // Check status
    if (workingUnderlay.status !== 'active') {
      allMessages.push({
        severity: 'warning',
        field: 'underlayServiceId',
        message: `Working underlay is not active (status: ${workingUnderlay.status})`,
        code: 'UNDERLAY_NOT_ACTIVE',
      });
    }
  }

  // Validate protection underlay if present
  if (service.protectionUnderlayServiceId) {
    if (!protectionUnderlay) {
      allMessages.push({
        severity: 'error',
        field: 'protectionUnderlayServiceId',
        message: 'Protection underlay service not found',
        code: 'PROTECTION_UNDERLAY_NOT_FOUND',
      });
    } else {
      // Check endpoint matching
      const protectionEndpointResult = validateUnderlayEndpoints(
        service.sourceNodeId,
        service.destinationNodeId,
        protectionUnderlay
      );
      allMessages.push(...protectionEndpointResult.messages);

      // Check status
      if (protectionUnderlay.status !== 'active') {
        allMessages.push({
          severity: 'warning',
          field: 'protectionUnderlayServiceId',
          message: `Protection underlay is not active (status: ${protectionUnderlay.status})`,
          code: 'PROTECTION_UNDERLAY_NOT_ACTIVE',
        });
      }
    }
  }

  // Validate BFD config
  const bfdResult = validateBFDConfig(service.bfdConfig);
  allMessages.push(...bfdResult.messages);

  // Validate protection scheme
  const schemeResult = validateProtectionScheme(
    service.protectionScheme,
    !!service.protectionUnderlayServiceId,
    service.bfdConfig.enabled
  );
  allMessages.push(...schemeResult.messages);

  // Validate shared portion
  const sharedResult = validateSharedPortion(service.sharedPortionAnalysis);
  allMessages.push(...sharedResult.messages);

  if (allMessages.length === 0) {
    return createValidResult();
  }

  return createInvalidResult(allMessages);
}
