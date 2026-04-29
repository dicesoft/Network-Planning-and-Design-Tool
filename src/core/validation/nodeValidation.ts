/**
 * Node Validation Module
 *
 * Provides validation for network node properties including location metadata.
 */

import { NodeLocation, NetworkNode } from '@/types';

/**
 * Validation result structure
 */
export interface NodeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Coordinate validation ranges
 */
export const COORDINATE_RANGES = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
};

/**
 * Validates node location metadata
 */
export function validateNodeLocation(location: NodeLocation): NodeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate latitude
  if (location.latitude !== undefined) {
    if (
      location.latitude < COORDINATE_RANGES.latitude.min ||
      location.latitude > COORDINATE_RANGES.latitude.max
    ) {
      errors.push(
        `Latitude must be between ${COORDINATE_RANGES.latitude.min} and ${COORDINATE_RANGES.latitude.max}`
      );
    }
  }

  // Validate longitude
  if (location.longitude !== undefined) {
    if (
      location.longitude < COORDINATE_RANGES.longitude.min ||
      location.longitude > COORDINATE_RANGES.longitude.max
    ) {
      errors.push(
        `Longitude must be between ${COORDINATE_RANGES.longitude.min} and ${COORDINATE_RANGES.longitude.max}`
      );
    }
  }

  // Warn if only one coordinate is provided
  if (
    (location.latitude !== undefined && location.longitude === undefined) ||
    (location.latitude === undefined && location.longitude !== undefined)
  ) {
    warnings.push('Both latitude and longitude should be provided for complete coordinates');
  }

  // Validate address length
  if (location.address && location.address.length > 500) {
    warnings.push('Address is unusually long (>500 characters)');
  }

  // Validate building name length
  if (location.building && location.building.length > 200) {
    warnings.push('Building name is unusually long (>200 characters)');
  }

  // Validate floor format (warn on unusual values)
  if (location.floor) {
    const floorNum = parseInt(location.floor, 10);
    if (!isNaN(floorNum) && (floorNum > 200 || floorNum < -20)) {
      warnings.push(`Floor number (${location.floor}) seems unusual`);
    }
  }

  // Validate installation type
  const validInstallationTypes = ['indoor', 'outdoor', 'underground', 'aerial'];
  if (
    location.installationType &&
    !validInstallationTypes.includes(location.installationType)
  ) {
    errors.push(`Invalid installation type: ${location.installationType}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates that a node name is not empty and follows conventions
 */
export function validateNodeName(name: string): NodeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push('Node name is required');
  } else {
    if (name.length > 100) {
      warnings.push('Node name is unusually long (>100 characters)');
    }

    if (name.length < 2) {
      warnings.push('Node name is very short');
    }

    // Check for special characters that might cause issues
    if (/[<>:"/\\|?*]/.test(name)) {
      warnings.push('Node name contains special characters that may cause issues');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates node position is within reasonable bounds
 */
export function validateNodePosition(
  position: { x: number; y: number },
  canvasBounds?: { minX: number; maxX: number; minY: number; maxY: number }
): NodeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (isNaN(position.x) || isNaN(position.y)) {
    errors.push('Node position coordinates must be valid numbers');
    return { valid: false, errors, warnings };
  }

  // Default canvas bounds if not provided
  const bounds = canvasBounds || {
    minX: -10000,
    maxX: 10000,
    minY: -10000,
    maxY: 10000,
  };

  if (
    position.x < bounds.minX ||
    position.x > bounds.maxX ||
    position.y < bounds.minY ||
    position.y > bounds.maxY
  ) {
    warnings.push('Node position is outside typical canvas bounds');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a complete network node
 */
export function validateNetworkNode(node: NetworkNode): NodeValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Validate name
  const nameValidation = validateNodeName(node.name);
  allErrors.push(...nameValidation.errors);
  allWarnings.push(...nameValidation.warnings);

  // Validate position
  const positionValidation = validateNodePosition(node.position);
  allErrors.push(...positionValidation.errors);
  allWarnings.push(...positionValidation.warnings);

  // Validate location if provided
  if (node.location) {
    const locationValidation = validateNodeLocation(node.location);
    allErrors.push(...locationValidation.errors);
    allWarnings.push(...locationValidation.warnings);
  }

  // Validate ID format
  if (!node.id || node.id.trim().length === 0) {
    allErrors.push('Node ID is required');
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Calculates distance between two nodes using their location coordinates
 * Returns distance in kilometers using Haversine formula
 */
export function calculateGeoDistance(
  location1: NodeLocation,
  location2: NodeLocation
): number | null {
  if (
    location1.latitude === undefined ||
    location1.longitude === undefined ||
    location2.latitude === undefined ||
    location2.longitude === undefined
  ) {
    return null;
  }

  const R = 6371; // Earth's radius in km
  const dLat = toRad(location2.latitude - location1.latitude);
  const dLon = toRad(location2.longitude - location1.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(location1.latitude)) *
      Math.cos(toRad(location2.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Checks if two nodes are at the same geographic location
 */
export function areNodesColocated(
  location1: NodeLocation,
  location2: NodeLocation,
  toleranceKm: number = 0.1 // 100 meters default
): boolean {
  const distance = calculateGeoDistance(location1, location2);
  return distance !== null && distance <= toleranceKm;
}
