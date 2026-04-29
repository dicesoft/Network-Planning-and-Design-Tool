/**
 * DWDM Channel Validation Functions
 * Validates channel allocations, slot ranges, and spectral continuity
 */

import type {
  PortSpectrum,
  ChannelAllocation,
  EdgeChannelAssignment,
  ChannelGridType,
} from '@/types/spectrum';
import {
  getChannelRange,
  getSlotRange,
  isValidChannelNumber,
  isValidSlotNumber,
} from '@/core/spectrum/channelConfig';

/**
 * Validation result interface
 */
export interface ChannelValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Create a passing validation result
 */
function pass(): ChannelValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

/**
 * Create a failing validation result
 */
function fail(errors: string[], warnings: string[] = []): ChannelValidationResult {
  return { valid: false, errors, warnings };
}

/**
 * Validate that a channel number is available (not already allocated)
 */
export function validateChannelAvailability(
  spectrum: PortSpectrum,
  channelNumber: number
): ChannelValidationResult {
  // Check if grid type supports channel numbers
  if (spectrum.gridType === 'flex-grid') {
    return fail(['Channel numbers are not used for flex-grid. Use slot ranges instead.']);
  }

  // Validate channel number is in valid range
  if (!isValidChannelNumber(channelNumber, spectrum.gridType)) {
    const range = getChannelRange(spectrum.gridType);
    return fail([
      `Channel ${channelNumber} is outside valid range (${range.min} to ${range.max}) for ${spectrum.gridType} grid.`,
    ]);
  }

  // Check if already allocated
  const existingAllocation = spectrum.allocations.find(
    (a) => a.channelNumber === channelNumber && a.status !== 'free'
  );

  if (existingAllocation) {
    const label = existingAllocation.label || existingAllocation.edgeId || 'unknown';
    return fail([`Channel ${channelNumber} is already allocated to: ${label}`]);
  }

  return pass();
}

/**
 * Validate multiple channels are all available
 */
export function validateMultipleChannelsAvailability(
  spectrum: PortSpectrum,
  channelNumbers: number[]
): ChannelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const ch of channelNumbers) {
    const result = validateChannelAvailability(spectrum, ch);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate flex-grid slot range (no overlap with existing allocations)
 */
export function validateFlexGridSlots(
  spectrum: PortSpectrum,
  startSlot: number,
  endSlot: number
): ChannelValidationResult {
  // Must be flex-grid
  if (spectrum.gridType !== 'flex-grid') {
    return fail(['Slot ranges are only valid for flex-grid. Use channel numbers for fixed grids.']);
  }

  // Validate slot order
  if (startSlot > endSlot) {
    return fail([`Start slot (${startSlot}) must be less than or equal to end slot (${endSlot}).`]);
  }

  // Validate slots are in valid range
  const slotRange = getSlotRange();
  if (!isValidSlotNumber(startSlot) || !isValidSlotNumber(endSlot)) {
    return fail([
      `Slot range [${startSlot}, ${endSlot}] is outside valid range (${slotRange.min} to ${slotRange.max}).`,
    ]);
  }

  // Check for overlaps with existing allocations
  for (const allocation of spectrum.allocations) {
    if (allocation.slotRange && allocation.status !== 'free') {
      const existingStart = allocation.slotRange.startSlot;
      const existingEnd = allocation.slotRange.endSlot;

      // Check for overlap
      if (startSlot <= existingEnd && endSlot >= existingStart) {
        const label = allocation.label || allocation.edgeId || 'unknown';
        return fail([
          `Slot range [${startSlot}, ${endSlot}] overlaps with existing allocation [${existingStart}, ${existingEnd}] (${label}).`,
        ]);
      }
    }
  }

  return pass();
}

/**
 * Validate guard band between flex-grid allocations
 * Guard band is typically 1-2 slots (12.5-25 GHz) between allocations
 */
export function validateGuardBand(
  spectrum: PortSpectrum,
  startSlot: number,
  endSlot: number,
  guardBandSlots: number = 1
): ChannelValidationResult {
  if (spectrum.gridType !== 'flex-grid') {
    return pass(); // Guard bands only apply to flex-grid
  }

  const warnings: string[] = [];

  for (const allocation of spectrum.allocations) {
    if (allocation.slotRange && allocation.status !== 'free') {
      const existingStart = allocation.slotRange.startSlot;
      const existingEnd = allocation.slotRange.endSlot;

      // Check if guard band is violated (adjacent without proper spacing)
      const gapBefore = startSlot - existingEnd - 1;
      const gapAfter = existingStart - endSlot - 1;

      if (
        (gapBefore >= 0 && gapBefore < guardBandSlots) ||
        (gapAfter >= 0 && gapAfter < guardBandSlots)
      ) {
        const label = allocation.label || allocation.edgeId || 'unknown';
        warnings.push(
          `Guard band of ${guardBandSlots} slot(s) recommended between [${startSlot}, ${endSlot}] and [${existingStart}, ${existingEnd}] (${label}).`
        );
      }
    }
  }

  return { valid: true, errors: [], warnings };
}

/**
 * Validate edge channel assignment
 * Ensures both source and target ports can accommodate the assignment
 */
export function validateEdgeChannelAssignment(
  sourceSpectrum: PortSpectrum | null,
  targetSpectrum: PortSpectrum | null,
  assignment: EdgeChannelAssignment
): ChannelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate source channels
  if (sourceSpectrum && assignment.sourceChannels.length > 0) {
    for (const ch of assignment.sourceChannels) {
      if (ch.channelNumber !== undefined) {
        const result = validateChannelAvailability(sourceSpectrum, ch.channelNumber);
        errors.push(...result.errors.map((e) => `Source port: ${e}`));
      }
      if (ch.slotRange) {
        const result = validateFlexGridSlots(
          sourceSpectrum,
          ch.slotRange.startSlot,
          ch.slotRange.endSlot
        );
        errors.push(...result.errors.map((e) => `Source port: ${e}`));
      }
    }
  }

  // Validate target channels
  if (targetSpectrum && assignment.targetChannels.length > 0) {
    for (const ch of assignment.targetChannels) {
      if (ch.channelNumber !== undefined) {
        const result = validateChannelAvailability(targetSpectrum, ch.channelNumber);
        errors.push(...result.errors.map((e) => `Target port: ${e}`));
      }
      if (ch.slotRange) {
        const result = validateFlexGridSlots(
          targetSpectrum,
          ch.slotRange.startSlot,
          ch.slotRange.endSlot
        );
        errors.push(...result.errors.map((e) => `Target port: ${e}`));
      }
    }
  }

  // Validate express connection (same wavelength end-to-end)
  if (assignment.isExpress) {
    const expressResult = validateSpectralContinuity(
      assignment.sourceChannels,
      assignment.targetChannels
    );
    if (!expressResult.valid) {
      errors.push(...expressResult.errors);
    }
    warnings.push(...expressResult.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check spectral continuity for express connections
 * Express connections must use the same wavelength/channel at both ends
 */
export function validateSpectralContinuity(
  sourceChannels: ChannelAllocation[],
  targetChannels: ChannelAllocation[]
): ChannelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // For express connections, source and target should have matching channels
  if (sourceChannels.length !== targetChannels.length) {
    warnings.push(
      `Express connection has mismatched channel counts: source (${sourceChannels.length}) vs target (${targetChannels.length}).`
    );
  }

  // Check for matching channel numbers (for fixed grid)
  const sourceChNumbers = sourceChannels
    .filter((c) => c.channelNumber !== undefined)
    .map((c) => c.channelNumber!);
  const targetChNumbers = targetChannels
    .filter((c) => c.channelNumber !== undefined)
    .map((c) => c.channelNumber!);

  for (const srcCh of sourceChNumbers) {
    if (!targetChNumbers.includes(srcCh)) {
      errors.push(
        `Express connection requires channel ${srcCh} at both ends, but target does not have it.`
      );
    }
  }

  // Check for matching slot ranges (for flex-grid)
  const sourceSlotRanges = sourceChannels.filter((c) => c.slotRange !== undefined);
  const targetSlotRanges = targetChannels.filter((c) => c.slotRange !== undefined);

  for (const srcSlot of sourceSlotRanges) {
    const matchingTarget = targetSlotRanges.find(
      (t) =>
        t.slotRange?.startSlot === srcSlot.slotRange?.startSlot &&
        t.slotRange?.endSlot === srcSlot.slotRange?.endSlot
    );
    if (!matchingTarget) {
      errors.push(
        `Express connection requires slot range [${srcSlot.slotRange?.startSlot}, ${srcSlot.slotRange?.endSlot}] at both ends.`
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
 * Validate grid type compatibility between two ports
 */
export function validateGridTypeCompatibility(
  sourceGridType: ChannelGridType,
  targetGridType: ChannelGridType
): ChannelValidationResult {
  if (sourceGridType !== targetGridType) {
    return fail([
      `Grid type mismatch: source (${sourceGridType}) vs target (${targetGridType}). Both ports must use the same grid type.`,
    ]);
  }
  return pass();
}

/**
 * Get a summary of spectrum utilization
 */
export function getSpectrumUtilization(spectrum: PortSpectrum): {
  totalChannels: number;
  allocatedChannels: number;
  freeChannels: number;
  utilizationPercent: number;
} {
  if (spectrum.gridType === 'flex-grid') {
    const slotRange = getSlotRange();
    const totalSlots = slotRange.count;

    let allocatedSlots = 0;
    for (const allocation of spectrum.allocations) {
      if (allocation.slotRange && allocation.status !== 'free') {
        allocatedSlots += allocation.slotRange.endSlot - allocation.slotRange.startSlot + 1;
      }
    }

    return {
      totalChannels: totalSlots,
      allocatedChannels: allocatedSlots,
      freeChannels: totalSlots - allocatedSlots,
      utilizationPercent: Math.round((allocatedSlots / totalSlots) * 100),
    };
  } else {
    const range = getChannelRange(spectrum.gridType);
    const totalChannels = range.count;
    const allocatedChannels = spectrum.allocations.filter(
      (a) => a.channelNumber !== undefined && a.status !== 'free'
    ).length;

    return {
      totalChannels,
      allocatedChannels,
      freeChannels: totalChannels - allocatedChannels,
      utilizationPercent: Math.round((allocatedChannels / totalChannels) * 100),
    };
  }
}
