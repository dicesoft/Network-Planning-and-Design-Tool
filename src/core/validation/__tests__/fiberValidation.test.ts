import { describe, it, expect } from 'vitest';
import {
  getEffectiveFiberParams,
  calculateTotalAttenuation,
  calculateChromaticDispersion,
  calculatePMD,
  calculateSpanTotals,
  validateFiberParameters,
  validateSRLGCode,
  isDuplicateSRLGCode,
  formatSRLGCode,
  getFiberProfile,
  getFiberProfileTypes,
  getFiberProfileLabel,
} from '../fiberValidation';
import { FiberParameters, FIBER_PROFILE_CONFIGS } from '@/types/network';

describe('fiberValidation', () => {
  describe('getEffectiveFiberParams', () => {
    it('returns profile defaults when no overrides', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
      };

      const effective = getEffectiveFiberParams(params);

      expect(effective.attenuation).toBe(0.20);
      expect(effective.chromaticDispersion).toBe(17);
      expect(effective.pmd).toBe(0.1);
      expect(effective.effectiveArea).toBe(80);
    });

    it('applies attenuation override', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
        attenuationOverride: 0.25,
      };

      const effective = getEffectiveFiberParams(params);

      expect(effective.attenuation).toBe(0.25);
      expect(effective.chromaticDispersion).toBe(17); // default
    });

    it('applies all overrides', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
        attenuationOverride: 0.22,
        chromaticDispersionOverride: 16,
        pmdOverride: 0.15,
        effectiveAreaOverride: 85,
        nonLinearIndexOverride: 3e-20,
      };

      const effective = getEffectiveFiberParams(params);

      expect(effective.attenuation).toBe(0.22);
      expect(effective.chromaticDispersion).toBe(16);
      expect(effective.pmd).toBe(0.15);
      expect(effective.effectiveArea).toBe(85);
      expect(effective.nonLinearIndex).toBe(3e-20);
    });

    it('uses different profile defaults', () => {
      const params: FiberParameters = {
        profileType: 'G.654.E',
      };

      const effective = getEffectiveFiberParams(params);

      expect(effective.attenuation).toBe(0.17);
      expect(effective.chromaticDispersion).toBe(20);
      expect(effective.effectiveArea).toBe(125);
    });
  });

  describe('calculateTotalAttenuation', () => {
    it('calculates correctly for standard fiber', () => {
      expect(calculateTotalAttenuation(0.20, 100)).toBe(20);
    });

    it('calculates for zero distance', () => {
      expect(calculateTotalAttenuation(0.20, 0)).toBe(0);
    });

    it('calculates for long-haul fiber', () => {
      expect(calculateTotalAttenuation(0.17, 500)).toBeCloseTo(85);
    });
  });

  describe('calculateChromaticDispersion', () => {
    it('calculates correctly for standard fiber', () => {
      expect(calculateChromaticDispersion(17, 100)).toBe(1700);
    });

    it('calculates for NZDSF fiber', () => {
      expect(calculateChromaticDispersion(4.5, 100)).toBe(450);
    });
  });

  describe('calculatePMD', () => {
    it('calculates correctly with sqrt accumulation', () => {
      // PMD = coefficient * sqrt(distance)
      expect(calculatePMD(0.1, 100)).toBeCloseTo(1.0);
    });

    it('calculates for 400km span', () => {
      // 0.1 * sqrt(400) = 0.1 * 20 = 2.0 ps
      expect(calculatePMD(0.1, 400)).toBeCloseTo(2.0);
    });

    it('calculates for zero distance', () => {
      expect(calculatePMD(0.1, 0)).toBe(0);
    });
  });

  describe('calculateSpanTotals', () => {
    it('calculates all totals for a span', () => {
      const params = {
        attenuation: 0.20,
        chromaticDispersion: 17,
        pmd: 0.1,
        effectiveArea: 80,
        nonLinearIndex: 2.6e-20,
      };

      const totals = calculateSpanTotals(params, 100);

      expect(totals.totalAttenuation).toBe(20);
      expect(totals.totalChromaticDispersion).toBe(1700);
      expect(totals.totalPMD).toBeCloseTo(1.0);
    });
  });

  describe('validateFiberParameters', () => {
    it('validates correct parameters', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
      };

      const result = validateFiberParameters(params);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects negative attenuation', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
        attenuationOverride: -0.1,
      };

      const result = validateFiberParameters(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Attenuation cannot be negative');
    });

    it('rejects excessive attenuation', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
        attenuationOverride: 1.5,
      };

      const result = validateFiberParameters(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Attenuation exceeds maximum typical value (1.0 dB/km)');
    });

    it('warns on high attenuation', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
        attenuationOverride: 0.5, // 2.5x the standard
      };

      const result = validateFiberParameters(params);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('rejects negative PMD', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
        pmdOverride: -0.05,
      };

      const result = validateFiberParameters(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('PMD coefficient cannot be negative');
    });

    it('warns on high PMD', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
        pmdOverride: 0.6,
      };

      const result = validateFiberParameters(params);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('PMD coefficient exceeds typical modern fiber values');
    });

    it('rejects small effective area', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
        effectiveAreaOverride: 10,
      };

      const result = validateFiberParameters(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Effective area too small (minimum ~20 μm²)');
    });

    it('rejects negative non-linear index', () => {
      const params: FiberParameters = {
        profileType: 'G.652.D',
        nonLinearIndexOverride: -1e-20,
      };

      const result = validateFiberParameters(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Non-linear index cannot be negative');
    });
  });

  describe('validateSRLGCode', () => {
    it('validates correct SRLG code', () => {
      const result = validateSRLGCode('DUCT-A1');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates code with underscores', () => {
      const result = validateSRLGCode('CABLE_NYC_001');

      expect(result.valid).toBe(true);
    });

    it('validates alphanumeric code', () => {
      const result = validateSRLGCode('SRLG001');

      expect(result.valid).toBe(true);
    });

    it('rejects empty code', () => {
      const result = validateSRLGCode('');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SRLG code cannot be empty');
    });

    it('rejects whitespace-only code', () => {
      const result = validateSRLGCode('   ');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SRLG code cannot be empty');
    });

    it('rejects code starting with non-alphanumeric', () => {
      const result = validateSRLGCode('-DUCT');

      expect(result.valid).toBe(false);
    });

    it('rejects code with special characters', () => {
      const result = validateSRLGCode('DUCT@NYC');

      expect(result.valid).toBe(false);
    });

    it('rejects very long code', () => {
      const longCode = 'A'.repeat(51);
      const result = validateSRLGCode(longCode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SRLG code too long (max 50 characters)');
    });
  });

  describe('isDuplicateSRLGCode', () => {
    it('detects exact duplicate', () => {
      const existing = ['DUCT-A1', 'CABLE-B2'];

      expect(isDuplicateSRLGCode('DUCT-A1', existing)).toBe(true);
    });

    it('detects case-insensitive duplicate', () => {
      const existing = ['DUCT-A1', 'CABLE-B2'];

      expect(isDuplicateSRLGCode('duct-a1', existing)).toBe(true);
      expect(isDuplicateSRLGCode('Duct-A1', existing)).toBe(true);
    });

    it('returns false for non-duplicate', () => {
      const existing = ['DUCT-A1', 'CABLE-B2'];

      expect(isDuplicateSRLGCode('DUCT-A2', existing)).toBe(false);
    });

    it('handles empty list', () => {
      expect(isDuplicateSRLGCode('DUCT-A1', [])).toBe(false);
    });
  });

  describe('formatSRLGCode', () => {
    it('converts to uppercase', () => {
      expect(formatSRLGCode('duct-a1')).toBe('DUCT-A1');
    });

    it('trims whitespace', () => {
      expect(formatSRLGCode('  DUCT-A1  ')).toBe('DUCT-A1');
    });
  });

  describe('getFiberProfile', () => {
    it('returns correct profile config', () => {
      const profile = getFiberProfile('G.652.D');

      expect(profile.label).toBe('ITU-T G.652.D');
      expect(profile.attenuation).toBe(0.20);
    });

    it('returns G.654.E profile', () => {
      const profile = getFiberProfile('G.654.E');

      expect(profile.label).toBe('ITU-T G.654.E');
      expect(profile.attenuation).toBe(0.17);
    });
  });

  describe('getFiberProfileTypes', () => {
    it('returns all profile types', () => {
      const types = getFiberProfileTypes();

      expect(types).toContain('G.652.D');
      expect(types).toContain('G.654.E');
      expect(types).toContain('G.655');
      expect(types).toContain('G.657.A1');
      expect(types).toContain('custom');
      expect(types).toHaveLength(5);
    });
  });

  describe('getFiberProfileLabel', () => {
    it('returns correct label', () => {
      expect(getFiberProfileLabel('G.652.D')).toBe('ITU-T G.652.D');
      expect(getFiberProfileLabel('custom')).toBe('Custom Profile');
    });
  });

  describe('FIBER_PROFILE_CONFIGS', () => {
    it('has all expected profiles', () => {
      expect(FIBER_PROFILE_CONFIGS['G.652.D']).toBeDefined();
      expect(FIBER_PROFILE_CONFIGS['G.654.E']).toBeDefined();
      expect(FIBER_PROFILE_CONFIGS['G.655']).toBeDefined();
      expect(FIBER_PROFILE_CONFIGS['G.657.A1']).toBeDefined();
      expect(FIBER_PROFILE_CONFIGS['custom']).toBeDefined();
    });

    it('G.655 has low dispersion for DWDM', () => {
      const g655 = FIBER_PROFILE_CONFIGS['G.655'];
      expect(g655.chromaticDispersion).toBeLessThan(10);
    });

    it('G.654.E has lowest attenuation', () => {
      const g654e = FIBER_PROFILE_CONFIGS['G.654.E'];
      const g652d = FIBER_PROFILE_CONFIGS['G.652.D'];
      expect(g654e.attenuation).toBeLessThan(g652d.attenuation);
    });
  });
});
