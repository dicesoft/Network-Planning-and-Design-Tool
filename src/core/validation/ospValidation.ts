/**
 * OSP Termination Validation Module
 *
 * Provides validation for OSP (Outside Plant) termination node properties
 * including insertion loss, reflectance, splitter configuration, and port mappings.
 */

import {
  OSPTerminationType,
  OSPTerminationProperties,
  SplitterConfig,
  PortMapping,
  Port,
  SPLITTER_LOSS_TABLE,
} from '@/types';

/**
 * Validation result structure
 */
export interface OSPValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Typical insertion loss ranges by OSP termination type
 */
export const INSERTION_LOSS_RANGES: Record<
  OSPTerminationType,
  { min: number; max: number; warning: number }
> = {
  'splice-closure': { min: 0.01, max: 0.5, warning: 0.15 },
  'fdf': { min: 0.1, max: 2.0, warning: 1.5 },
  'patch-panel': { min: 0.1, max: 1.5, warning: 1.0 },
  'handhole': { min: 0.01, max: 1.0, warning: 0.75 },
  'manhole': { min: 0.01, max: 1.0, warning: 0.75 },
  'splitter': { min: 3.0, max: 25.0, warning: 22.0 },
  'generic': { min: 0.01, max: 5.0, warning: 2.0 },
};

/**
 * Reflectance validation ranges (dB, negative values)
 */
export const REFLECTANCE_RANGE = {
  min: -70, // Best (lowest reflection)
  max: -20, // Worst (highest reflection)
  warningThreshold: -40, // Warn if worse than this
};

/**
 * Validates OSP termination properties
 */
export function validateOSPProperties(
  props: OSPTerminationProperties
): OSPValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate termination type
  if (!props.terminationType) {
    errors.push('Termination type is required');
  }

  // Validate insertion loss
  const lossValidation = validateInsertionLoss(
    props.terminationType,
    props.insertionLoss
  );
  if (!lossValidation.valid) {
    errors.push(lossValidation.error!);
  } else if (lossValidation.warning) {
    warnings.push(lossValidation.warning);
  }

  // Validate reflectance if provided
  if (props.reflectance !== undefined) {
    const reflectanceValidation = validateReflectance(props.reflectance);
    if (!reflectanceValidation.valid) {
      errors.push(reflectanceValidation.error!);
    } else if (reflectanceValidation.warning) {
      warnings.push(reflectanceValidation.warning);
    }
  }

  // Validate splitter config if type is splitter
  if (props.terminationType === 'splitter') {
    if (!props.splitterConfig) {
      errors.push('Splitter configuration is required for splitter type');
    } else {
      const splitterValidation = validateSplitterConfig(props.splitterConfig);
      errors.push(...splitterValidation.errors);
      warnings.push(...splitterValidation.warnings);
    }
  }

  // Validate fiber count if provided
  if (props.fiberCount !== undefined) {
    if (props.fiberCount < 1) {
      errors.push('Fiber count must be at least 1');
    } else if (props.fiberCount > 288) {
      warnings.push('Fiber count exceeds typical maximum (288)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates insertion loss for a given OSP termination type
 */
export function validateInsertionLoss(
  terminationType: OSPTerminationType,
  insertionLoss: number
): { valid: boolean; error?: string; warning?: string } {
  if (insertionLoss < 0) {
    return { valid: false, error: 'Insertion loss cannot be negative' };
  }

  const range = INSERTION_LOSS_RANGES[terminationType];
  if (!range) {
    return { valid: true }; // Unknown type, allow any positive value
  }

  if (insertionLoss < range.min) {
    return {
      valid: true,
      warning: `Insertion loss (${insertionLoss} dB) is unusually low for ${terminationType}`,
    };
  }

  if (insertionLoss > range.max) {
    return {
      valid: false,
      error: `Insertion loss (${insertionLoss} dB) exceeds maximum for ${terminationType} (${range.max} dB)`,
    };
  }

  if (insertionLoss > range.warning) {
    return {
      valid: true,
      warning: `Insertion loss (${insertionLoss} dB) is higher than typical for ${terminationType}`,
    };
  }

  return { valid: true };
}

/**
 * Validates reflectance value
 */
export function validateReflectance(
  reflectance: number
): { valid: boolean; error?: string; warning?: string } {
  if (reflectance > 0) {
    return { valid: false, error: 'Reflectance must be a negative value (in dB)' };
  }

  if (reflectance < REFLECTANCE_RANGE.min) {
    return {
      valid: true,
      warning: `Reflectance (${reflectance} dB) is unusually low (excellent)`,
    };
  }

  if (reflectance > REFLECTANCE_RANGE.max) {
    return {
      valid: false,
      error: `Reflectance (${reflectance} dB) exceeds acceptable threshold (${REFLECTANCE_RANGE.max} dB)`,
    };
  }

  if (reflectance > REFLECTANCE_RANGE.warningThreshold) {
    return {
      valid: true,
      warning: `Reflectance (${reflectance} dB) is worse than recommended (${REFLECTANCE_RANGE.warningThreshold} dB)`,
    };
  }

  return { valid: true };
}

/**
 * Validates splitter configuration
 */
export function validateSplitterConfig(
  config: SplitterConfig
): OSPValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate split ratio
  const validRatios = Object.keys(SPLITTER_LOSS_TABLE);
  if (!validRatios.includes(config.splitRatio)) {
    errors.push(`Invalid split ratio: ${config.splitRatio}`);
  }

  // Validate splitter loss
  if (config.splitterLoss < 0) {
    errors.push('Splitter loss cannot be negative');
  }

  // Check if loss matches expected for ratio
  const expectedLoss = SPLITTER_LOSS_TABLE[config.splitRatio];
  if (expectedLoss !== undefined) {
    const deviation = Math.abs(config.splitterLoss - expectedLoss);
    if (deviation > 3) {
      warnings.push(
        `Splitter loss (${config.splitterLoss} dB) deviates significantly from typical value (${expectedLoss} dB) for ${config.splitRatio}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates port mappings for an OSP node
 */
export function validatePortMappings(
  mappings: PortMapping[],
  ports: Port[],
  isSplitter: boolean = false
): OSPValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const portMap = new Map(ports.map((p) => [p.id, p]));
  const usedOutputs = new Set<string>();

  for (const mapping of mappings) {
    // Check input port exists
    const inputPort = portMap.get(mapping.inputPortId);
    if (!inputPort) {
      errors.push(`Invalid input port ID: ${mapping.inputPortId}`);
      continue;
    }

    // Check output ports
    if (mapping.outputPortIds.length === 0) {
      warnings.push(`Input port ${inputPort.name} has no output mappings`);
      continue;
    }

    for (const outputId of mapping.outputPortIds) {
      const outputPort = portMap.get(outputId);
      if (!outputPort) {
        errors.push(`Invalid output port ID: ${outputId}`);
        continue;
      }

      // Check port type compatibility
      if (inputPort.type !== outputPort.type) {
        errors.push(
          `Port type mismatch: ${inputPort.name} (${inputPort.type}) cannot map to ${outputPort.name} (${outputPort.type})`
        );
      }

      // Check for duplicate output mappings (non-splitter only)
      if (!isSplitter && usedOutputs.has(outputId)) {
        errors.push(`Output port ${outputPort.name} is mapped multiple times`);
      }
      usedOutputs.add(outputId);
    }

    // For non-splitter, ensure 1:1 mapping
    if (!isSplitter && mapping.outputPortIds.length > 1) {
      errors.push(
        `Non-splitter OSP node cannot have 1:N mapping (${inputPort.name} has ${mapping.outputPortIds.length} outputs)`
      );
    }
  }

  // Check for unmapped input ports (warning only)
  const mappedInputs = new Set(mappings.map((m) => m.inputPortId));
  const inputPorts = ports.filter((p) => p.name.toLowerCase().includes('in'));
  for (const port of inputPorts) {
    if (!mappedInputs.has(port.id)) {
      warnings.push(`Input port ${port.name} is not mapped`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Calculates total insertion loss for a path through multiple OSP nodes
 */
export function calculateOSPPathLoss(
  ospNodes: { properties: OSPTerminationProperties }[]
): number {
  return ospNodes.reduce((total, node) => total + node.properties.insertionLoss, 0);
}

/**
 * Validates that total OSP loss in a path doesn't exceed amplifier budget
 */
export function validatePathOSPLoss(
  totalOSPLoss: number,
  amplifierBudget: number = 25 // Typical EDFA gain
): { valid: boolean; warning?: string } {
  if (totalOSPLoss > amplifierBudget) {
    return {
      valid: false,
      warning: `Total OSP insertion loss (${totalOSPLoss.toFixed(2)} dB) exceeds typical amplifier budget (${amplifierBudget} dB)`,
    };
  }

  if (totalOSPLoss > amplifierBudget * 0.8) {
    return {
      valid: true,
      warning: `Total OSP insertion loss (${totalOSPLoss.toFixed(2)} dB) is approaching amplifier budget limit`,
    };
  }

  return { valid: true };
}
