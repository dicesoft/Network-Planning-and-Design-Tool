import { describe, it, expect } from 'vitest';
import { validateDefragMoves } from '../DefragWizardExport';
import type { DefragMove } from '@/core/services/DefragmentationEngine';
import type { Service, L1DWDMService, ServicePath } from '@/types/service';

// ============================================================================
// MOCK FACTORIES
// ============================================================================

const createMockPath = (overrides: Partial<ServicePath> = {}): ServicePath => ({
  id: 'path-1',
  type: 'working',
  nodeIds: ['node-1', 'node-2'],
  edgeIds: ['edge-1'],
  totalDistance: 100,
  hopCount: 1,
  status: 'active',
  ...overrides,
});

const createMockL1Service = (overrides: Partial<L1DWDMService> = {}): L1DWDMService => ({
  id: 'L1-001',
  name: 'Test L1 Service',
  type: 'l1-dwdm',
  status: 'planned',
  sourceNodeId: 'node-1',
  sourcePortId: 'port-1',
  destinationNodeId: 'node-2',
  destinationPortId: 'port-1',
  dataRate: '100G',
  modulationType: 'DP-QPSK',
  channelWidth: '50GHz',
  wavelengthMode: 'continuous',
  channelNumber: 1,
  workingPath: createMockPath({ channelNumber: 1 }),
  protectionScheme: 'none',
  restorationEnabled: false,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  metadata: {},
  ...overrides,
});

// ============================================================================
// TESTS
// ============================================================================

describe('validateDefragMoves', () => {
  describe('synthetic ID handling', () => {
    it('should allow moves with synthetic service IDs (port-level allocations)', () => {
      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'edge-1:ch10', fromChannel: 10, toChannel: 1 },
        { edgeId: 'edge-1', serviceId: 'edge-1:ch50', fromChannel: 50, toChannel: 2 },
      ];

      const result = validateDefragMoves(moves, []);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.blockedMoves).toHaveLength(0);
      expect(result.allowedMoves).toHaveLength(2);
    });

    it('should allow mix of synthetic and real service IDs', () => {
      const services: Service[] = [
        createMockL1Service({ id: 'L1-001', status: 'planned' }),
      ];

      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'edge-1:ch10', fromChannel: 10, toChannel: 1 },
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 20, toChannel: 2 },
      ];

      const result = validateDefragMoves(moves, services);

      expect(result.valid).toBe(true);
      expect(result.allowedMoves).toHaveLength(2);
      expect(result.blockedMoves).toHaveLength(0);
    });

    it('should still reject unknown real service IDs alongside valid synthetic IDs', () => {
      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'edge-1:ch10', fromChannel: 10, toChannel: 1 },
        { edgeId: 'edge-1', serviceId: 'L1-999', fromChannel: 20, toChannel: 2 },
      ];

      const result = validateDefragMoves(moves, []);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('L1-999');
      expect(result.allowedMoves).toHaveLength(1);
      expect(result.blockedMoves).toHaveLength(1);
    });
  });

  describe('real service ID validation', () => {
    it('should block moves for nonexistent services', () => {
      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-999', fromChannel: 10, toChannel: 1 },
      ];

      const result = validateDefragMoves(moves, []);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.blockedMoves).toHaveLength(1);
      expect(result.allowedMoves).toHaveLength(0);
    });

    it('should allow moves for planned services', () => {
      const services: Service[] = [
        createMockL1Service({ id: 'L1-001', status: 'planned' }),
      ];

      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 10, toChannel: 1 },
      ];

      const result = validateDefragMoves(moves, services);

      expect(result.valid).toBe(true);
      expect(result.allowedMoves).toHaveLength(1);
    });

    it('should block active unprotected services', () => {
      const services: Service[] = [
        createMockL1Service({ id: 'L1-001', status: 'active', protectionScheme: 'none' }),
      ];

      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 10, toChannel: 1 },
      ];

      const result = validateDefragMoves(moves, services);

      expect(result.valid).toBe(false);
      expect(result.blockedMoves).toHaveLength(1);
      expect(result.errors[0]).toContain('active without protection');
    });

    it('should warn but allow active protected services', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          name: 'Protected Service',
          status: 'active',
          protectionScheme: 'olp',
        }),
      ];

      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 10, toChannel: 1 },
      ];

      const result = validateDefragMoves(moves, services);

      expect(result.valid).toBe(true);
      expect(result.allowedMoves).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('active with protection');
    });
  });

  describe('conflicting target channels', () => {
    it('should detect conflicting target channels on the same edge', () => {
      const services: Service[] = [
        createMockL1Service({ id: 'L1-001', status: 'planned' }),
        createMockL1Service({ id: 'L1-002', name: 'Service 2', status: 'planned' }),
      ];

      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 10, toChannel: 5 },
        { edgeId: 'edge-1', serviceId: 'L1-002', fromChannel: 20, toChannel: 5 },
      ];

      const result = validateDefragMoves(moves, services);

      expect(result.errors.some((e) => e.includes('Conflicting moves'))).toBe(true);
    });
  });

  describe('empty moves', () => {
    it('should return valid result for empty moves array', () => {
      const result = validateDefragMoves([], []);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.allowedMoves).toHaveLength(0);
      expect(result.blockedMoves).toHaveLength(0);
    });
  });
});
