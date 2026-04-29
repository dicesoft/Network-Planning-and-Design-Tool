/**
 * L1ServiceManager Unit Tests
 *
 * Tests for L1 DWDM service creation, validation, and path computation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  L1ServiceManager,
  createL1ServiceManager,
  MODULATION_REACH_LIMITS,
  type L1TopologyProvider,
  type L1PathFinderProvider,
} from '../L1ServiceManager';
import type { NetworkNode, NetworkEdge, Port } from '@/types/network';
import type { L1ServiceConfig, ServicePathOptions } from '@/types/service';
import type { PathResult } from '../../graph/PathFinder';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock DWDM port
 */
const createMockPort = (
  id: string,
  type: 'dwdm' | 'bw' = 'dwdm',
  status: 'available' | 'used' = 'available'
): Port => ({
  id,
  name: `Port ${id}`,
  type,
  direction: 'bidirectional',
  dataRate: '100G',
  status,
});

/**
 * Create a mock network node
 */
const createMockNode = (
  id: string,
  ports: Port[] = [createMockPort(`${id}-port-1`)]
): NetworkNode => ({
  id,
  name: `Node ${id}`,
  type: 'terminal',
  vendor: 'generic',
  position: { x: 0, y: 0 },
  stacks: [],
  ports,
  metadata: {},
});

/**
 * Create a mock network edge
 */
const createMockEdge = (
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  distance: number = 100,
  srlgCodes: string[] = []
): NetworkEdge => ({
  id,
  name: `Edge ${id}`,
  type: 'fiber',
  source: { nodeId: sourceNodeId, portId: `${sourceNodeId}-port-1` },
  target: { nodeId: targetNodeId, portId: `${targetNodeId}-port-1` },
  properties: {
    distance,
    srlgCodes,
  },
  state: 'active',
  metadata: {},
});

/**
 * Create a mock path result
 */
const createMockPathResult = (
  nodeIds: string[],
  edgeIds: string[],
  totalDistance: number = 100
): PathResult => ({
  path: nodeIds,
  edges: edgeIds,
  totalWeight: totalDistance,
  totalDistance,
  hopCount: nodeIds.length - 1,
});

/**
 * Create a default L1 service config
 */
const createDefaultConfig = (overrides: Partial<L1ServiceConfig> = {}): L1ServiceConfig => ({
  name: 'Test L1 Service',
  sourceNodeId: 'node-A',
  sourcePortId: 'node-A-port-1',
  destinationNodeId: 'node-B',
  destinationPortId: 'node-B-port-1',
  dataRate: '100G',
  modulationType: 'DP-QPSK',
  channelWidth: '50GHz',
  wavelengthMode: 'continuous',
  protectionScheme: 'none',
  restorationEnabled: false,
  pathOptions: {
    mode: 'shortest-path',
    weightAttribute: 'distance',
  } as ServicePathOptions,
  ...overrides,
});

// ============================================================================
// MOCK PROVIDERS
// ============================================================================

describe('L1ServiceManager', () => {
  let nodes: Map<string, NetworkNode>;
  let edges: Map<string, NetworkEdge>;
  let topologyProvider: L1TopologyProvider;
  let pathFinderProvider: L1PathFinderProvider;
  let manager: L1ServiceManager;

  beforeEach(() => {
    // Initialize test topology
    nodes = new Map([
      ['node-A', createMockNode('node-A')],
      ['node-B', createMockNode('node-B')],
      ['node-C', createMockNode('node-C')],
      ['node-D', createMockNode('node-D')],
    ]);

    edges = new Map([
      ['edge-AB', createMockEdge('edge-AB', 'node-A', 'node-B', 100, ['SRLG-1'])],
      ['edge-BC', createMockEdge('edge-BC', 'node-B', 'node-C', 150, ['SRLG-2'])],
      ['edge-AC', createMockEdge('edge-AC', 'node-A', 'node-C', 200, ['SRLG-1'])],
      ['edge-CD', createMockEdge('edge-CD', 'node-C', 'node-D', 100, ['SRLG-3'])],
      ['edge-AD', createMockEdge('edge-AD', 'node-A', 'node-D', 300, ['SRLG-4'])],
    ]);

    // Create topology provider
    topologyProvider = {
      getNode: (id: string) => nodes.get(id),
      getEdge: (id: string) => edges.get(id),
      getNodes: () => Array.from(nodes.values()),
      getEdges: () => Array.from(edges.values()),
    };

    // Create path finder provider
    pathFinderProvider = {
      shortestPath: vi.fn((sourceId, targetId) => {
        // Simple mock: return direct path if edge exists
        const directEdge = Array.from(edges.values()).find(
          (e) =>
            (e.source.nodeId === sourceId && e.target.nodeId === targetId) ||
            (e.target.nodeId === sourceId && e.source.nodeId === targetId)
        );

        if (directEdge) {
          return createMockPathResult(
            [sourceId, targetId],
            [directEdge.id],
            directEdge.properties.distance || 100
          );
        }

        // Try two-hop path via node-B for A->C
        if (sourceId === 'node-A' && targetId === 'node-C') {
          return createMockPathResult(
            ['node-A', 'node-B', 'node-C'],
            ['edge-AB', 'edge-BC'],
            250
          );
        }

        return null;
      }),

      findSRLGDiversePath: vi.fn((sourceId, targetId, referencePath) => {
        // Return a path that avoids SRLGs from reference path
        if (sourceId === 'node-A' && targetId === 'node-B') {
          // If working path uses SRLG-1, return path via node-C (SRLG-2)
          const refSRLGs = new Set<string>();
          referencePath.edges.forEach((edgeId) => {
            const edge = edges.get(edgeId);
            edge?.properties.srlgCodes?.forEach((s) => refSRLGs.add(s));
          });

          if (refSRLGs.has('SRLG-1')) {
            return createMockPathResult(
              ['node-A', 'node-C', 'node-B'],
              ['edge-AC', 'edge-BC'],
              350
            );
          }
        }
        return null;
      }),

      findMinimumSRLGOverlapPath: vi.fn(() => {
        return {
          path: createMockPathResult(['node-A', 'node-D', 'node-C', 'node-B'], ['edge-AD', 'edge-CD', 'edge-BC'], 550),
          sharedSRLGs: [],
          overlapPercent: 0,
        };
      }),
    };

    // Create manager
    manager = createL1ServiceManager(topologyProvider, pathFinderProvider);
  });

  // ==========================================================================
  // BASIC SERVICE CREATION
  // ==========================================================================

  describe('createL1Service - basic', () => {
    it('should create L1 service with valid configuration', () => {
      const config = createDefaultConfig();
      const result = manager.createL1Service(config);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.service).toBeDefined();
      expect(result.service?.name).toBe('Test L1 Service');
      expect(result.service?.type).toBe('l1-dwdm');
      expect(result.service?.status).toBe('planned');
    });

    it('should assign working path correctly', () => {
      const config = createDefaultConfig();
      const result = manager.createL1Service(config);

      expect(result.service?.workingPath).toBeDefined();
      expect(result.service?.workingPath.nodeIds).toContain('node-A');
      expect(result.service?.workingPath.nodeIds).toContain('node-B');
      expect(result.service?.workingPath.edgeIds).toHaveLength(1);
    });

    it('should assign channel number in continuous mode', () => {
      const config = createDefaultConfig({ wavelengthMode: 'continuous' });
      const result = manager.createL1Service(config);

      expect(result.service?.wavelengthMode).toBe('continuous');
      expect(result.service?.workingPath.channelNumber).toBeDefined();
    });

    it('should set correct timestamps', () => {
      const config = createDefaultConfig();
      const result = manager.createL1Service(config);

      expect(result.service?.createdAt).toBeDefined();
      expect(result.service?.modifiedAt).toBeDefined();
      expect(result.service?.createdAt).toBe(result.service?.modifiedAt);
    });
  });

  // ==========================================================================
  // PROTECTION PATH CREATION
  // ==========================================================================

  describe('createL1Service - with protection', () => {
    it('should compute protection path when scheme is not none', () => {
      const config = createDefaultConfig({
        protectionScheme: 'olp',
      });
      const result = manager.createL1Service(config);

      expect(result.success).toBe(true);
      // Protection path should be attempted (may or may not be found)
      if (result.service?.protectionPath) {
        expect(result.service.protectionPath.type).toBe('protection');
      }
    });

    it('should call findSRLGDiversePath for protection', () => {
      const config = createDefaultConfig({
        protectionScheme: 'olp',
      });
      manager.createL1Service(config);

      expect(pathFinderProvider.findSRLGDiversePath).toHaveBeenCalled();
    });

    it('should include SRLG analysis when protection path exists', () => {
      const config = createDefaultConfig({
        protectionScheme: 'sncp',
      });

      // Mock a protection path
      (pathFinderProvider.findSRLGDiversePath as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockPathResult(['node-A', 'node-C', 'node-B'], ['edge-AC', 'edge-BC'], 350)
      );

      const result = manager.createL1Service(config);

      expect(result.srlgAnalysis).toBeDefined();
    });

    it('should add warning when no protection path found', () => {
      (pathFinderProvider.findSRLGDiversePath as ReturnType<typeof vi.fn>).mockReturnValue(null);
      (pathFinderProvider.findMinimumSRLGOverlapPath as ReturnType<typeof vi.fn>).mockReturnValue(null);
      (pathFinderProvider.shortestPath as ReturnType<typeof vi.fn>).mockImplementation(
        (sourceId, targetId, options) => {
          if (options?.excludeEdges?.includes('edge-AB')) {
            return null; // No alternate path
          }
          return createMockPathResult([sourceId, targetId], ['edge-AB'], 100);
        }
      );

      const config = createDefaultConfig({ protectionScheme: 'olp' });
      const result = manager.createL1Service(config);

      expect(result.warnings.some((w) => w.includes('protection path'))).toBe(true);
    });
  });

  // ==========================================================================
  // VALIDATION ERRORS
  // ==========================================================================

  describe('createL1Service - validation errors', () => {
    it('should fail if source node not found', () => {
      const config = createDefaultConfig({ sourceNodeId: 'non-existent' });
      const result = manager.createL1Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Source node not found'))).toBe(true);
    });

    it('should fail if destination node not found', () => {
      const config = createDefaultConfig({ destinationNodeId: 'non-existent' });
      const result = manager.createL1Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Destination node not found'))).toBe(true);
    });

    it('should fail if source and destination are same', () => {
      const config = createDefaultConfig({
        sourceNodeId: 'node-A',
        destinationNodeId: 'node-A',
      });
      const result = manager.createL1Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('different nodes'))).toBe(true);
    });

    it('should fail if source port not found', () => {
      const config = createDefaultConfig({ sourcePortId: 'non-existent-port' });
      const result = manager.createL1Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Source port not found'))).toBe(true);
    });

    it('should fail if source port is not DWDM type', () => {
      // Add node with BW port
      nodes.set('node-X', createMockNode('node-X', [createMockPort('node-X-port-1', 'bw')]));

      const config = createDefaultConfig({
        sourceNodeId: 'node-X',
        sourcePortId: 'node-X-port-1',
      });
      const result = manager.createL1Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('DWDM type'))).toBe(true);
    });

    it('should fail if name is empty', () => {
      const config = createDefaultConfig({ name: '' });
      const result = manager.createL1Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('name is required'))).toBe(true);
    });

    it('should fail if no path exists', () => {
      // Mock no path
      (pathFinderProvider.shortestPath as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const config = createDefaultConfig();
      const result = manager.createL1Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('No path exists'))).toBe(true);
    });

    it('should warn if source port is already used', () => {
      nodes.set('node-A', createMockNode('node-A', [createMockPort('node-A-port-1', 'dwdm', 'used')]));

      const config = createDefaultConfig();
      const result = manager.createL1Service(config);

      // Should succeed but with warning
      expect(result.warnings.some((w) => w.includes('already in use'))).toBe(true);
    });

    it('should fail for invalid channel number', () => {
      const config = createDefaultConfig({ channelNumber: 150 }); // Out of range
      const result = manager.createL1Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Channel number'))).toBe(true);
    });
  });

  // ==========================================================================
  // OPTICAL PARAMETER VALIDATION
  // ==========================================================================

  describe('optical parameter validation', () => {
    it('should warn when distance exceeds modulation reach', () => {
      // Create a very long path
      (pathFinderProvider.shortestPath as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockPathResult(['node-A', 'node-B'], ['edge-AB'], 3000) // 3000 km
      );

      const config = createDefaultConfig({ modulationType: 'DP-QPSK' }); // 2500 km limit
      const result = manager.createL1Service(config);

      expect(result.warnings.some((w) => w.includes('reach limit'))).toBe(true);
    });

    it('should pass for distance within modulation reach', () => {
      const config = createDefaultConfig({
        modulationType: 'DP-16QAM', // 600 km limit
      });
      // Default mock returns 100 km path
      const result = manager.createL1Service(config);

      expect(result.success).toBe(true);
      expect(result.warnings.filter((w) => w.includes('reach limit'))).toHaveLength(0);
    });

    it('should have correct reach limits for all modulation types', () => {
      expect(MODULATION_REACH_LIMITS['DP-QPSK']).toBe(2500);
      expect(MODULATION_REACH_LIMITS['DP-8QAM']).toBe(1200);
      expect(MODULATION_REACH_LIMITS['DP-16QAM']).toBe(600);
      expect(MODULATION_REACH_LIMITS['DP-32QAM']).toBe(250);
      expect(MODULATION_REACH_LIMITS['DP-64QAM']).toBe(120);
    });
  });

  // ==========================================================================
  // WAVELENGTH MODE
  // ==========================================================================

  describe('wavelength modes', () => {
    it('should use continuous mode by default', () => {
      const config = createDefaultConfig();
      const result = manager.createL1Service(config);

      expect(result.service?.wavelengthMode).toBe('continuous');
    });

    it('should create channel assignments in conversion mode', () => {
      const config = createDefaultConfig({ wavelengthMode: 'conversion-allowed' });
      const result = manager.createL1Service(config);

      expect(result.service?.wavelengthMode).toBe('conversion-allowed');
      // Channel assignments should be created instead of single channel
      if (result.service?.workingPath.channelAssignments) {
        expect(result.service.workingPath.channelAssignments.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // CHANNEL AVAILABILITY
  // ==========================================================================

  describe('channel availability', () => {
    it('should include channel availability in result', () => {
      const config = createDefaultConfig();
      const result = manager.createL1Service(config);

      expect(result.channelAvailability).toBeDefined();
      expect(result.channelAvailability?.available).toBe(true);
    });

    it('should use requested channel if available', () => {
      const config = createDefaultConfig({ channelNumber: 42 });
      const result = manager.createL1Service(config);

      expect(result.service?.channelNumber).toBe(42);
    });
  });

  // ==========================================================================
  // SRLG ANALYSIS
  // ==========================================================================

  describe('SRLG analysis', () => {
    it('should analyze SRLG risk for protection path', () => {
      (pathFinderProvider.findSRLGDiversePath as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockPathResult(['node-A', 'node-C', 'node-B'], ['edge-AC', 'edge-BC'], 350)
      );

      const config = createDefaultConfig({ protectionScheme: 'olp' });
      const result = manager.createL1Service(config);

      expect(result.srlgAnalysis).toBeDefined();
      expect(result.srlgAnalysis?.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.srlgAnalysis?.riskScore).toBeLessThanOrEqual(100);
    });

    it('should detect shared SRLGs', () => {
      // Create path with same SRLG
      (pathFinderProvider.shortestPath as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockPathResult(['node-A', 'node-B'], ['edge-AB'], 100)
      );
      (pathFinderProvider.findSRLGDiversePath as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockPathResult(['node-A', 'node-C'], ['edge-AC'], 200) // edge-AC has SRLG-1, same as edge-AB
      );

      const config = createDefaultConfig({ protectionScheme: 'olp' });
      const result = manager.createL1Service(config);

      // Should find shared SRLG-1
      if (result.srlgAnalysis) {
        expect(result.srlgAnalysis.sharedSRLGCodes).toContain('SRLG-1');
      }
    });

    it('should add warnings for SRLG overlap', () => {
      (pathFinderProvider.shortestPath as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockPathResult(['node-A', 'node-B'], ['edge-AB'], 100)
      );
      (pathFinderProvider.findSRLGDiversePath as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockPathResult(['node-A', 'node-C'], ['edge-AC'], 200)
      );

      const config = createDefaultConfig({ protectionScheme: 'sncp' });
      const result = manager.createL1Service(config);

      // Should have warnings about shared SRLGs
      if (result.srlgAnalysis && result.srlgAnalysis.riskScore > 0) {
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // ENDPOINT VALIDATION
  // ==========================================================================

  describe('validateEndpoints', () => {
    it('should validate valid endpoints', () => {
      const result = manager.validateEndpoints(
        'node-A',
        'node-A-port-1',
        'node-B',
        'node-B-port-1'
      );

      expect(result.valid).toBe(true);
      expect(result.messages).toHaveLength(0);
    });

    it('should fail for missing source node', () => {
      const result = manager.validateEndpoints(
        'missing',
        'port-1',
        'node-B',
        'node-B-port-1'
      );

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'NODE_NOT_FOUND')).toBe(true);
    });

    it('should fail for missing destination node', () => {
      const result = manager.validateEndpoints(
        'node-A',
        'node-A-port-1',
        'missing',
        'port-1'
      );

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'NODE_NOT_FOUND')).toBe(true);
    });
  });

  // ==========================================================================
  // SERVICE VALIDATION
  // ==========================================================================

  describe('validateExistingService', () => {
    it('should validate a valid service', () => {
      const config = createDefaultConfig();
      const createResult = manager.createL1Service(config);

      if (createResult.service) {
        const validateResult = manager.validateExistingService(createResult.service);
        expect(validateResult.valid).toBe(true);
      }
    });

    it('should detect invalid edges in working path', () => {
      const config = createDefaultConfig();
      const createResult = manager.createL1Service(config);

      if (createResult.service) {
        // Remove edge from topology
        edges.delete('edge-AB');

        const validateResult = manager.validateExistingService(createResult.service);
        expect(validateResult.valid).toBe(false);
        expect(validateResult.messages.some((m) => m.code === 'PATH_INVALID')).toBe(true);
      }
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION
  // ==========================================================================

  describe('createL1ServiceManager factory', () => {
    it('should create manager instance', () => {
      const newManager = createL1ServiceManager(topologyProvider, pathFinderProvider);
      expect(newManager).toBeInstanceOf(L1ServiceManager);
    });
  });

  // ==========================================================================
  // PATH COMPUTATION
  // ==========================================================================

  describe('computeWorkingPath', () => {
    it('should call pathFinder.shortestPath', () => {
      manager.computeWorkingPath('node-A', 'node-B');
      expect(pathFinderProvider.shortestPath).toHaveBeenCalledWith('node-A', 'node-B', undefined);
    });

    it('should pass options to pathFinder', () => {
      const options = { excludeEdges: ['edge-AB'] };
      manager.computeWorkingPath('node-A', 'node-B', options);
      expect(pathFinderProvider.shortestPath).toHaveBeenCalledWith('node-A', 'node-B', options);
    });
  });

  describe('computeProtectionPath', () => {
    it('should first try fully SRLG-diverse path', () => {
      const workingPath = createMockPathResult(['node-A', 'node-B'], ['edge-AB'], 100);
      manager.computeProtectionPath('node-A', 'node-B', workingPath);

      expect(pathFinderProvider.findSRLGDiversePath).toHaveBeenCalledWith(
        'node-A',
        'node-B',
        workingPath,
        0,
        { excludeEdges: undefined }
      );
    });

    it('should fall back to minimum overlap path', () => {
      (pathFinderProvider.findSRLGDiversePath as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const workingPath = createMockPathResult(['node-A', 'node-B'], ['edge-AB'], 100);
      manager.computeProtectionPath('node-A', 'node-B', workingPath);

      expect(pathFinderProvider.findMinimumSRLGOverlapPath).toHaveBeenCalled();
    });

    it('should fall back to edge-disjoint path as last resort', () => {
      (pathFinderProvider.findSRLGDiversePath as ReturnType<typeof vi.fn>).mockReturnValue(null);
      (pathFinderProvider.findMinimumSRLGOverlapPath as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const workingPath = createMockPathResult(['node-A', 'node-B'], ['edge-AB'], 100);
      manager.computeProtectionPath('node-A', 'node-B', workingPath);

      // Should call shortestPath with edge exclusion
      expect(pathFinderProvider.shortestPath).toHaveBeenLastCalledWith(
        'node-A',
        'node-B',
        expect.objectContaining({
          excludeEdges: expect.arrayContaining(['edge-AB']),
        })
      );
    });
  });

  // ==========================================================================
  // CHANNEL OPERATIONS
  // ==========================================================================

  describe('checkChannelAvailability', () => {
    it('should check channel availability for path', () => {
      const path = {
        id: 'test-path',
        type: 'working' as const,
        nodeIds: ['node-A', 'node-B'],
        edgeIds: ['edge-AB'],
        totalDistance: 100,
        hopCount: 1,
        status: 'computed' as const,
      };

      const result = manager.checkChannelAvailability(path, 'continuous');
      expect(result).toBeDefined();
      expect(result.mode).toBe('continuous');
    });
  });

  describe('getAvailableChannels', () => {
    it('should return available channels for path', () => {
      const path = {
        id: 'test-path',
        type: 'working' as const,
        nodeIds: ['node-A', 'node-B'],
        edgeIds: ['edge-AB'],
        totalDistance: 100,
        hopCount: 1,
        status: 'computed' as const,
      };

      const channels = manager.getAvailableChannels(path);
      expect(Array.isArray(channels)).toBe(true);
    });
  });

  // ==========================================================================
  // SRLG OPERATIONS
  // ==========================================================================

  describe('getSRLGsToAvoid', () => {
    it('should return SRLGs from working path', () => {
      const path = {
        id: 'test-path',
        type: 'working' as const,
        nodeIds: ['node-A', 'node-B'],
        edgeIds: ['edge-AB'], // Has SRLG-1
        totalDistance: 100,
        hopCount: 1,
        status: 'computed' as const,
      };

      const srlgs = manager.getSRLGsToAvoid(path);
      expect(srlgs).toContain('SRLG-1');
    });
  });

  describe('analyzeSRLGRisk', () => {
    it('should return risk analysis between paths', () => {
      const workingPath = {
        id: 'working',
        type: 'working' as const,
        nodeIds: ['node-A', 'node-B'],
        edgeIds: ['edge-AB'],
        totalDistance: 100,
        hopCount: 1,
        status: 'computed' as const,
      };

      const protectionPath = {
        id: 'protection',
        type: 'protection' as const,
        nodeIds: ['node-A', 'node-C'],
        edgeIds: ['edge-AC'],
        totalDistance: 200,
        hopCount: 1,
        status: 'computed' as const,
      };

      const analysis = manager.analyzeSRLGRisk(workingPath, protectionPath);

      expect(analysis).toHaveProperty('sharedSRLGCodes');
      expect(analysis).toHaveProperty('riskScore');
      expect(analysis).toHaveProperty('warnings');
    });
  });
});
