/**
 * Port Validation Utilities
 * Validates port connections and properties for optical network management
 */

import { Port, PortType, PORT_CONSTRAINTS } from '@/types';

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Creates a successful validation result
 */
const success = (): ValidationResult => ({
  valid: true,
  errors: [],
  warnings: [],
});

/**
 * Creates a failed validation result
 */
const failure = (errors: string[], warnings: string[] = []): ValidationResult => ({
  valid: false,
  errors,
  warnings,
});

/**
 * Validates a port connection between two ports
 * @param sourcePort - Source port
 * @param targetPort - Target port
 * @param distance - Optional distance in km
 * @returns ValidationResult
 */
export function validatePortConnection(
  sourcePort: Port,
  targetPort: Port,
  distance?: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check port type compatibility - B/W and DWDM are strictly incompatible
  if (sourcePort.type !== targetPort.type) {
    errors.push(
      `Port type mismatch: ${PORT_CONSTRAINTS[sourcePort.type].label} cannot connect to ${PORT_CONSTRAINTS[targetPort.type].label}`
    );
  }

  // Check port availability
  if (sourcePort.status === 'used') {
    errors.push(`Source port "${sourcePort.name}" is already in use`);
  }

  if (targetPort.status === 'used') {
    errors.push(`Target port "${targetPort.name}" is already in use`);
  }

  // Check distance constraints if distance is provided
  if (distance !== undefined && sourcePort.type === targetPort.type) {
    const maxDistance = PORT_CONSTRAINTS[sourcePort.type].maxDistance;
    if (distance > maxDistance) {
      errors.push(
        `Distance ${distance} km exceeds maximum ${maxDistance} km for ${PORT_CONSTRAINTS[sourcePort.type].label} ports`
      );
    }
  }

  if (errors.length > 0) {
    return failure(errors, warnings);
  }

  return { valid: true, errors: [], warnings };
}

/**
 * Validates distance against port type constraint
 * @param portType - The port type (bw or dwdm)
 * @param distance - Distance in km
 * @returns ValidationResult with distance validation
 */
export function validateDistance(
  portType: PortType,
  distance: number
): ValidationResult {
  const constraint = PORT_CONSTRAINTS[portType];

  if (distance > constraint.maxDistance) {
    return failure([
      `Distance ${distance} km exceeds maximum ${constraint.maxDistance} km for ${constraint.label} ports`
    ]);
  }

  if (distance < 0) {
    return failure(['Distance cannot be negative']);
  }

  return success();
}

/**
 * Validates port properties
 * @param port - Port to validate
 * @returns ValidationResult
 */
export function validatePort(port: Partial<Port> & { type: PortType }): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name is required
  if (!port.name || port.name.trim() === '') {
    errors.push('Port name is required');
  }

  // Validate channels based on port type
  if (port.channels !== undefined) {
    const maxChannels = PORT_CONSTRAINTS[port.type].maxChannels;

    if (port.channels < 1) {
      errors.push('Channels must be at least 1');
    } else if (port.channels > maxChannels) {
      errors.push(
        `${PORT_CONSTRAINTS[port.type].label} ports support maximum ${maxChannels} channel(s), got ${port.channels}`
      );
    }
  }

  if (errors.length > 0) {
    return failure(errors, warnings);
  }

  return success();
}

/**
 * Validates if two port types are compatible for connection
 * @param sourceType - Source port type
 * @param targetType - Target port type
 * @returns true if compatible
 */
export function arePortTypesCompatible(sourceType: PortType, targetType: PortType): boolean {
  // B/W and DWDM are strictly incompatible
  return sourceType === targetType;
}

/**
 * Gets the maximum distance allowed for a given port type
 * @param portType - Port type
 * @returns Maximum distance in km
 */
export function getMaxDistance(portType: PortType): number {
  return PORT_CONSTRAINTS[portType].maxDistance;
}

/**
 * Gets the maximum channels allowed for a given port type
 * @param portType - Port type
 * @returns Maximum number of channels
 */
export function getMaxChannels(portType: PortType): number {
  return PORT_CONSTRAINTS[portType].maxChannels;
}

/**
 * Checks if a connection's distance is within limits for both endpoint port types
 * @param sourcePortType - Source port type
 * @param targetPortType - Target port type
 * @param distance - Connection distance in km
 * @returns ValidationResult
 */
export function validateConnectionDistance(
  sourcePortType: PortType,
  targetPortType: PortType,
  distance: number
): ValidationResult {
  if (!arePortTypesCompatible(sourcePortType, targetPortType)) {
    return failure(['Port types are not compatible']);
  }

  return validateDistance(sourcePortType, distance);
}
