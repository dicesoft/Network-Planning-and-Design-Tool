import { describe, it, expect } from 'vitest';
import {
  validateOSPProperties,
  validateInsertionLoss,
  validateReflectance,
  validateSplitterConfig,
  validatePortMappings,
  calculateOSPPathLoss,
  validatePathOSPLoss,
} from '../ospValidation';
import { OSPTerminationProperties, SplitterConfig, Port, PortMapping } from '@/types';

describe('ospValidation', () => {
  describe('validateOSPProperties', () => {
    it('should validate valid splice-closure properties', () => {
      const props: OSPTerminationProperties = {
        terminationType: 'splice-closure',
        insertionLoss: 0.1,
        isWeatherproof: true,
      };

      const result = validateOSPProperties(props);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid splitter properties', () => {
      const props: OSPTerminationProperties = {
        terminationType: 'splitter',
        insertionLoss: 3.5,
        splitterConfig: {
          splitRatio: '1:2',
          splitterLoss: 3.5,
        },
      };

      const result = validateOSPProperties(props);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error when splitter has no config', () => {
      const props: OSPTerminationProperties = {
        terminationType: 'splitter',
        insertionLoss: 3.5,
      };

      const result = validateOSPProperties(props);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Splitter configuration is required for splitter type');
    });

    it('should warn on high insertion loss', () => {
      const props: OSPTerminationProperties = {
        terminationType: 'splice-closure',
        insertionLoss: 0.2,
      };

      const result = validateOSPProperties(props);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('higher than typical'))).toBe(true);
    });

    it('should validate fiber count', () => {
      const props: OSPTerminationProperties = {
        terminationType: 'generic',
        insertionLoss: 0.3,
        fiberCount: 0,
      };

      const result = validateOSPProperties(props);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Fiber count must be at least 1');
    });

    it('should warn on excessive fiber count', () => {
      const props: OSPTerminationProperties = {
        terminationType: 'generic',
        insertionLoss: 0.3,
        fiberCount: 500,
      };

      const result = validateOSPProperties(props);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('exceeds typical maximum'))).toBe(true);
    });
  });

  describe('validateInsertionLoss', () => {
    it('should reject negative insertion loss', () => {
      const result = validateInsertionLoss('splice-closure', -0.1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be negative');
    });

    it('should accept valid insertion loss for splice-closure', () => {
      const result = validateInsertionLoss('splice-closure', 0.05);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should warn on unusually low insertion loss', () => {
      const result = validateInsertionLoss('patch-panel', 0.05);
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('unusually low');
    });

    it('should error on excessive insertion loss', () => {
      const result = validateInsertionLoss('splice-closure', 1.0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });
  });

  describe('validateReflectance', () => {
    it('should reject positive reflectance', () => {
      const result = validateReflectance(5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a negative value');
    });

    it('should accept valid reflectance', () => {
      const result = validateReflectance(-50);
      expect(result.valid).toBe(true);
    });

    it('should warn on poor reflectance', () => {
      const result = validateReflectance(-35);
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('worse than recommended');
    });

    it('should error on unacceptable reflectance', () => {
      const result = validateReflectance(-15);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds acceptable threshold');
    });
  });

  describe('validateSplitterConfig', () => {
    it('should validate correct splitter config', () => {
      const config: SplitterConfig = {
        splitRatio: '1:8',
        splitterLoss: 10.5,
      };

      const result = validateSplitterConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn on significant loss deviation', () => {
      const config: SplitterConfig = {
        splitRatio: '1:8',
        splitterLoss: 15, // Expected is 10.5
      };

      const result = validateSplitterConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('deviates significantly'))).toBe(true);
    });

    it('should reject negative splitter loss', () => {
      const config: SplitterConfig = {
        splitRatio: '1:4',
        splitterLoss: -1,
      };

      const result = validateSplitterConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Splitter loss cannot be negative');
    });
  });

  describe('validatePortMappings', () => {
    const mockPorts: Port[] = [
      { id: 'bw-in', name: 'BW-In', type: 'bw', dataRate: '10G', channels: 1, status: 'available' },
      { id: 'bw-out', name: 'BW-Out', type: 'bw', dataRate: '10G', channels: 1, status: 'available' },
      { id: 'dwdm-in', name: 'DWDM-In', type: 'dwdm', dataRate: '100G', channels: 96, status: 'available' },
      { id: 'dwdm-out', name: 'DWDM-Out', type: 'dwdm', dataRate: '100G', channels: 96, status: 'available' },
    ];

    it('should validate correct 1:1 mappings', () => {
      const mappings: PortMapping[] = [
        { inputPortId: 'bw-in', outputPortIds: ['bw-out'] },
        { inputPortId: 'dwdm-in', outputPortIds: ['dwdm-out'] },
      ];

      const result = validatePortMappings(mappings, mockPorts, false);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on port type mismatch', () => {
      const mappings: PortMapping[] = [
        { inputPortId: 'bw-in', outputPortIds: ['dwdm-out'] },
      ];

      const result = validatePortMappings(mappings, mockPorts, false);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Port type mismatch'))).toBe(true);
    });

    it('should error on invalid port ID', () => {
      const mappings: PortMapping[] = [
        { inputPortId: 'invalid-port', outputPortIds: ['bw-out'] },
      ];

      const result = validatePortMappings(mappings, mockPorts, false);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid input port ID'))).toBe(true);
    });

    it('should error on 1:N mapping for non-splitter', () => {
      const mappings: PortMapping[] = [
        { inputPortId: 'dwdm-in', outputPortIds: ['dwdm-out', 'bw-out'] },
      ];

      const result = validatePortMappings(mappings, mockPorts, false);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot have 1:N mapping'))).toBe(true);
    });

    it('should allow 1:N mapping for splitter', () => {
      const splitterPorts: Port[] = [
        { id: 'in', name: 'In', type: 'dwdm', dataRate: '100G', channels: 96, status: 'available' },
        { id: 'out-1', name: 'Out-1', type: 'dwdm', dataRate: '100G', channels: 96, status: 'available' },
        { id: 'out-2', name: 'Out-2', type: 'dwdm', dataRate: '100G', channels: 96, status: 'available' },
      ];

      const mappings: PortMapping[] = [
        { inputPortId: 'in', outputPortIds: ['out-1', 'out-2'] },
      ];

      const result = validatePortMappings(mappings, splitterPorts, true);
      expect(result.valid).toBe(true);
    });

    it('should warn on unmapped input ports', () => {
      const mappings: PortMapping[] = [
        { inputPortId: 'bw-in', outputPortIds: ['bw-out'] },
        // dwdm-in not mapped
      ];

      const result = validatePortMappings(mappings, mockPorts, false);
      expect(result.warnings.some(w => w.includes('DWDM-In') && w.includes('not mapped'))).toBe(true);
    });
  });

  describe('calculateOSPPathLoss', () => {
    it('should sum insertion losses correctly', () => {
      const ospNodes = [
        { properties: { terminationType: 'splice-closure' as const, insertionLoss: 0.1 } },
        { properties: { terminationType: 'patch-panel' as const, insertionLoss: 0.5 } },
        { properties: { terminationType: 'splice-closure' as const, insertionLoss: 0.1 } },
      ];

      const totalLoss = calculateOSPPathLoss(ospNodes);
      expect(totalLoss).toBeCloseTo(0.7, 2);
    });

    it('should return 0 for empty array', () => {
      const totalLoss = calculateOSPPathLoss([]);
      expect(totalLoss).toBe(0);
    });
  });

  describe('validatePathOSPLoss', () => {
    it('should pass for loss within budget', () => {
      const result = validatePathOSPLoss(10, 25);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('should warn when approaching budget', () => {
      const result = validatePathOSPLoss(22, 25);
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('approaching');
    });

    it('should fail when exceeding budget', () => {
      const result = validatePathOSPLoss(30, 25);
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('exceeds');
    });
  });
});
