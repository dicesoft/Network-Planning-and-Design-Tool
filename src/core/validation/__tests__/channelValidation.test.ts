import { describe, it, expect } from 'vitest';
import type { PortSpectrum, ChannelAllocation, EdgeChannelAssignment } from '@/types/spectrum';
import {
  validateChannelAvailability,
  validateMultipleChannelsAvailability,
  validateFlexGridSlots,
  validateGuardBand,
  validateEdgeChannelAssignment,
  validateSpectralContinuity,
  validateGridTypeCompatibility,
  getSpectrumUtilization,
} from '../channelValidation';

describe('channelValidation', () => {
  // Helper to create test spectrum
  const createSpectrum = (
    gridType: 'fixed-100ghz' | 'fixed-50ghz' | 'flex-grid',
    allocations: ChannelAllocation[] = []
  ): PortSpectrum => ({
    gridType,
    allocations,
  });

  const createAllocation = (
    channelNumber?: number,
    slotRange?: { startSlot: number; endSlot: number },
    status: 'free' | 'allocated' | 'reserved' = 'allocated'
  ): ChannelAllocation => ({
    id: crypto.randomUUID(),
    channelNumber,
    slotRange,
    status,
  });

  describe('validateChannelAvailability', () => {
    it('should pass for available channel', () => {
      const spectrum = createSpectrum('fixed-100ghz');
      const result = validateChannelAvailability(spectrum, 0);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for already allocated channel', () => {
      const spectrum = createSpectrum('fixed-100ghz', [createAllocation(0)]);
      const result = validateChannelAvailability(spectrum, 0);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('already allocated');
    });

    it('should fail for out-of-range channel', () => {
      const spectrum = createSpectrum('fixed-100ghz');
      const result = validateChannelAvailability(spectrum, 1000);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('outside valid range');
    });

    it('should fail when using channel numbers with flex-grid', () => {
      const spectrum = createSpectrum('flex-grid');
      const result = validateChannelAvailability(spectrum, 0);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not used for flex-grid');
    });

    it('should pass for free status allocations', () => {
      const spectrum = createSpectrum('fixed-100ghz', [
        createAllocation(0, undefined, 'free'),
      ]);
      const result = validateChannelAvailability(spectrum, 0);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateMultipleChannelsAvailability', () => {
    it('should pass when all channels are available', () => {
      const spectrum = createSpectrum('fixed-100ghz');
      const result = validateMultipleChannelsAvailability(spectrum, [0, 1, 2]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when any channel is unavailable', () => {
      const spectrum = createSpectrum('fixed-100ghz', [createAllocation(1)]);
      const result = validateMultipleChannelsAvailability(spectrum, [0, 1, 2]);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateFlexGridSlots', () => {
    it('should pass for available slot range', () => {
      const spectrum = createSpectrum('flex-grid');
      const result = validateFlexGridSlots(spectrum, 0, 4);
      expect(result.valid).toBe(true);
    });

    it('should fail when not using flex-grid', () => {
      const spectrum = createSpectrum('fixed-100ghz');
      const result = validateFlexGridSlots(spectrum, 0, 4);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('only valid for flex-grid');
    });

    it('should fail when start > end', () => {
      const spectrum = createSpectrum('flex-grid');
      const result = validateFlexGridSlots(spectrum, 4, 0);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be less than');
    });

    it('should fail for overlapping slot ranges', () => {
      const spectrum = createSpectrum('flex-grid', [
        createAllocation(undefined, { startSlot: 0, endSlot: 4 }),
      ]);
      const result = validateFlexGridSlots(spectrum, 2, 6);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('overlaps');
    });

    it('should pass for non-overlapping ranges', () => {
      const spectrum = createSpectrum('flex-grid', [
        createAllocation(undefined, { startSlot: 0, endSlot: 4 }),
      ]);
      const result = validateFlexGridSlots(spectrum, 5, 10);
      expect(result.valid).toBe(true);
    });

    it('should fail for out-of-range slots', () => {
      const spectrum = createSpectrum('flex-grid');
      const result = validateFlexGridSlots(spectrum, -10000, 10000);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('outside valid range');
    });
  });

  describe('validateGuardBand', () => {
    it('should pass when not flex-grid', () => {
      const spectrum = createSpectrum('fixed-100ghz');
      const result = validateGuardBand(spectrum, 0, 4);
      expect(result.valid).toBe(true);
    });

    it('should warn when guard band is violated', () => {
      const spectrum = createSpectrum('flex-grid', [
        createAllocation(undefined, { startSlot: 0, endSlot: 4 }),
      ]);
      // Adjacent range with no guard band
      const result = validateGuardBand(spectrum, 5, 10, 1);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should not warn when guard band is respected', () => {
      const spectrum = createSpectrum('flex-grid', [
        createAllocation(undefined, { startSlot: 0, endSlot: 4 }),
      ]);
      // Range with guard band
      const result = validateGuardBand(spectrum, 6, 10, 1);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('validateEdgeChannelAssignment', () => {
    it('should pass for valid assignment with available channels', () => {
      const sourceSpectrum = createSpectrum('fixed-100ghz');
      const targetSpectrum = createSpectrum('fixed-100ghz');
      const assignment: EdgeChannelAssignment = {
        sourceChannels: [createAllocation(0, undefined, 'allocated')],
        targetChannels: [createAllocation(0, undefined, 'allocated')],
        isExpress: true,
      };

      const result = validateEdgeChannelAssignment(
        sourceSpectrum,
        targetSpectrum,
        assignment
      );
      expect(result.valid).toBe(true);
    });

    it('should fail when source channel is already allocated', () => {
      const sourceSpectrum = createSpectrum('fixed-100ghz', [createAllocation(0)]);
      const targetSpectrum = createSpectrum('fixed-100ghz');
      const assignment: EdgeChannelAssignment = {
        sourceChannels: [createAllocation(0, undefined, 'allocated')],
        targetChannels: [createAllocation(0, undefined, 'allocated')],
        isExpress: true,
      };

      const result = validateEdgeChannelAssignment(
        sourceSpectrum,
        targetSpectrum,
        assignment
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Source port'))).toBe(true);
    });

    it('should fail when target channel is already allocated', () => {
      const sourceSpectrum = createSpectrum('fixed-100ghz');
      const targetSpectrum = createSpectrum('fixed-100ghz', [createAllocation(0)]);
      const assignment: EdgeChannelAssignment = {
        sourceChannels: [createAllocation(0, undefined, 'allocated')],
        targetChannels: [createAllocation(0, undefined, 'allocated')],
        isExpress: true,
      };

      const result = validateEdgeChannelAssignment(
        sourceSpectrum,
        targetSpectrum,
        assignment
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Target port'))).toBe(true);
    });
  });

  describe('validateSpectralContinuity', () => {
    it('should pass when source and target have matching channels', () => {
      const sourceChannels = [createAllocation(0)];
      const targetChannels = [createAllocation(0)];
      const result = validateSpectralContinuity(sourceChannels, targetChannels);
      expect(result.valid).toBe(true);
    });

    it('should fail when express channels do not match', () => {
      const sourceChannels = [createAllocation(0)];
      const targetChannels = [createAllocation(1)];
      const result = validateSpectralContinuity(sourceChannels, targetChannels);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('requires channel');
    });

    it('should warn when channel counts mismatch', () => {
      const sourceChannels = [createAllocation(0), createAllocation(1)];
      const targetChannels = [createAllocation(0)];
      const result = validateSpectralContinuity(sourceChannels, targetChannels);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should validate flex-grid slot range continuity', () => {
      const sourceChannels = [createAllocation(undefined, { startSlot: 0, endSlot: 4 })];
      const targetChannels = [createAllocation(undefined, { startSlot: 0, endSlot: 4 })];
      const result = validateSpectralContinuity(sourceChannels, targetChannels);
      expect(result.valid).toBe(true);
    });

    it('should fail when slot ranges do not match', () => {
      const sourceChannels = [createAllocation(undefined, { startSlot: 0, endSlot: 4 })];
      const targetChannels = [createAllocation(undefined, { startSlot: 5, endSlot: 9 })];
      const result = validateSpectralContinuity(sourceChannels, targetChannels);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateGridTypeCompatibility', () => {
    it('should pass for matching grid types', () => {
      const result = validateGridTypeCompatibility('fixed-100ghz', 'fixed-100ghz');
      expect(result.valid).toBe(true);
    });

    it('should fail for mismatched grid types', () => {
      const result = validateGridTypeCompatibility('fixed-100ghz', 'fixed-50ghz');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('mismatch');
    });
  });

  describe('getSpectrumUtilization', () => {
    it('should return 0% utilization for empty spectrum', () => {
      const spectrum = createSpectrum('fixed-100ghz');
      const util = getSpectrumUtilization(spectrum);
      expect(util.allocatedChannels).toBe(0);
      expect(util.utilizationPercent).toBe(0);
    });

    it('should calculate utilization for allocated channels', () => {
      const spectrum = createSpectrum('fixed-100ghz', [
        createAllocation(0),
        createAllocation(1),
        createAllocation(2),
      ]);
      const util = getSpectrumUtilization(spectrum);
      expect(util.allocatedChannels).toBe(3);
      expect(util.freeChannels).toBe(util.totalChannels - 3);
      expect(util.utilizationPercent).toBeGreaterThan(0);
    });

    it('should calculate utilization for flex-grid slot ranges', () => {
      const spectrum = createSpectrum('flex-grid', [
        createAllocation(undefined, { startSlot: 0, endSlot: 9 }),
      ]);
      const util = getSpectrumUtilization(spectrum);
      expect(util.allocatedChannels).toBe(10); // 10 slots
      expect(util.utilizationPercent).toBeGreaterThan(0);
    });

    it('should not count free status allocations', () => {
      const spectrum = createSpectrum('fixed-100ghz', [
        createAllocation(0, undefined, 'free'),
      ]);
      const util = getSpectrumUtilization(spectrum);
      expect(util.allocatedChannels).toBe(0);
    });
  });
});
