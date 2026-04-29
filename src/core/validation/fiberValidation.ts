/**
 * Fiber Parameter Validation and Calculations
 *
 * Provides utilities for validating fiber parameters, calculating
 * span totals, and managing SRLG codes.
 */

import {
  FiberProfileType,
  FiberProfile,
  FiberParameters,
  FIBER_PROFILE_CONFIGS,
} from '@/types/network';

/**
 * Result of fiber parameter validation
 */
export interface FiberValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Effective fiber parameters with all values resolved
 */
export interface EffectiveFiberParams {
  attenuation: number;
  chromaticDispersion: number;
  pmd: number;
  effectiveArea: number;
  nonLinearIndex: number;
}

/**
 * Span calculation results based on distance
 */
export interface SpanCalculations {
  totalAttenuation: number;        // dB
  totalChromaticDispersion: number; // ps/nm
  totalPMD: number;                // ps
}

/**
 * Get effective fiber parameters by applying overrides to profile defaults
 */
export function getEffectiveFiberParams(params: FiberParameters): EffectiveFiberParams {
  const profile = FIBER_PROFILE_CONFIGS[params.profileType];

  return {
    attenuation: params.attenuationOverride ?? profile.attenuation,
    chromaticDispersion: params.chromaticDispersionOverride ?? profile.chromaticDispersion,
    pmd: params.pmdOverride ?? profile.pmd,
    effectiveArea: params.effectiveAreaOverride ?? profile.effectiveArea ?? 80,
    nonLinearIndex: params.nonLinearIndexOverride ?? profile.nonLinearIndex ?? 2.6e-20,
  };
}

/**
 * Get the fiber profile configuration
 */
export function getFiberProfile(profileType: FiberProfileType): FiberProfile {
  return FIBER_PROFILE_CONFIGS[profileType];
}

/**
 * Calculate total attenuation for a span
 * @param attenuation - dB/km
 * @param distance - km
 * @returns Total attenuation in dB
 */
export function calculateTotalAttenuation(attenuation: number, distance: number): number {
  return attenuation * distance;
}

/**
 * Calculate total chromatic dispersion for a span
 * @param cd - ps/(nm·km)
 * @param distance - km
 * @returns Total CD in ps/nm
 */
export function calculateChromaticDispersion(cd: number, distance: number): number {
  return cd * distance;
}

/**
 * Calculate total PMD for a span
 * PMD accumulates as square root of distance
 * @param pmd - ps/√km (PMD coefficient)
 * @param distance - km
 * @returns Total PMD in ps
 */
export function calculatePMD(pmd: number, distance: number): number {
  return pmd * Math.sqrt(distance);
}

/**
 * Calculate all span totals
 */
export function calculateSpanTotals(params: EffectiveFiberParams, distance: number): SpanCalculations {
  return {
    totalAttenuation: calculateTotalAttenuation(params.attenuation, distance),
    totalChromaticDispersion: calculateChromaticDispersion(params.chromaticDispersion, distance),
    totalPMD: calculatePMD(params.pmd, distance),
  };
}

/**
 * Validate fiber parameters
 */
export function validateFiberParameters(params: FiberParameters): FiberValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const profile = FIBER_PROFILE_CONFIGS[params.profileType];

  // Validate attenuation override
  if (params.attenuationOverride !== undefined) {
    if (params.attenuationOverride < 0) {
      errors.push('Attenuation cannot be negative');
    } else if (params.attenuationOverride > 1.0) {
      errors.push('Attenuation exceeds maximum typical value (1.0 dB/km)');
    } else if (params.attenuationOverride > profile.attenuation * 2) {
      warnings.push(`Attenuation significantly higher than ${profile.label} standard`);
    }
  }

  // Validate chromatic dispersion override
  if (params.chromaticDispersionOverride !== undefined) {
    if (params.chromaticDispersionOverride < -10) {
      warnings.push('Negative chromatic dispersion is unusual for standard fibers');
    } else if (params.chromaticDispersionOverride > 25) {
      warnings.push('Chromatic dispersion exceeds typical values');
    }
  }

  // Validate PMD override
  if (params.pmdOverride !== undefined) {
    if (params.pmdOverride < 0) {
      errors.push('PMD coefficient cannot be negative');
    } else if (params.pmdOverride > 0.5) {
      warnings.push('PMD coefficient exceeds typical modern fiber values');
    }
  }

  // Validate effective area override
  if (params.effectiveAreaOverride !== undefined) {
    if (params.effectiveAreaOverride < 20) {
      errors.push('Effective area too small (minimum ~20 μm²)');
    } else if (params.effectiveAreaOverride > 200) {
      warnings.push('Effective area exceeds typical values');
    }
  }

  // Validate non-linear index override
  if (params.nonLinearIndexOverride !== undefined) {
    if (params.nonLinearIndexOverride < 0) {
      errors.push('Non-linear index cannot be negative');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * SRLG code format validation
 * Valid formats: alphanumeric with optional hyphens/underscores
 * Examples: SRLG-001, CABLE_A1, DUCT-NYC-01
 */
export function validateSRLGCode(code: string): FiberValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = code.trim();

  if (trimmed.length === 0) {
    errors.push('SRLG code cannot be empty');
  } else if (trimmed.length > 50) {
    errors.push('SRLG code too long (max 50 characters)');
  } else if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(trimmed)) {
    errors.push('SRLG code must start with alphanumeric and contain only letters, numbers, hyphens, and underscores');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if an SRLG code already exists in a list (case-insensitive)
 */
export function isDuplicateSRLGCode(code: string, existingCodes: string[]): boolean {
  const normalized = code.trim().toLowerCase();
  return existingCodes.some(c => c.toLowerCase() === normalized);
}

/**
 * Format SRLG code to uppercase
 */
export function formatSRLGCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Get all fiber profile types for selection UI
 */
export function getFiberProfileTypes(): FiberProfileType[] {
  return Object.keys(FIBER_PROFILE_CONFIGS) as FiberProfileType[];
}

/**
 * Get profile label for display
 */
export function getFiberProfileLabel(profileType: FiberProfileType): string {
  return FIBER_PROFILE_CONFIGS[profileType].label;
}
