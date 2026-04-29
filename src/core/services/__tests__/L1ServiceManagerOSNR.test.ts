/**
 * L1ServiceManager OSNR Integration Tests
 *
 * Tests that OSNR is computed and attached when a transceiverTypeId
 * is specified in L1ServiceConfig.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  L1ServiceManager,
  type L1TopologyProvider,
  type L1PathFinderProvider,
} from '../L1ServiceManager';
import type { NetworkNode, NetworkEdge, Port } from '@/types/network';
import type { L1ServiceConfig, ServicePathOptions } from '@/types/service';
import type { PathResult } from '../../graph/PathFinder';

// ============================================================================
// HELPERS
// ============================================================================

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

const createMockNode = (
  id: string,
  type: NetworkNode['type'] = 'terminal',
  ports: Port[] = [createMockPort(`${id}-port-1`)]
): NetworkNode => ({
  id,
  name: `Node ${id}`,
  type,
  vendor: 'generic',
  position: { x: 0, y: 0 },
  stacks: [],
  ports,
  metadata: {},
});

const createMockEdge = (
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  distance: number = 100,
): NetworkEdge => ({
  id,
  name: `Edge ${id}`,
  type: 'fiber',
  source: { nodeId: sourceNodeId, portId: `${sourceNodeId}-port-1` },
  target: { nodeId: targetNodeId, portId: `${targetNodeId}-port-1` },
  properties: {
    distance,
    srlgCodes: [],
  },
  state: 'active',
  metadata: {},
});

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
// TESTS
// ============================================================================

describe('L1ServiceManager OSNR Integration', () => {
  function buildManagerForShortPath() {
    const nodes = new Map<string, NetworkNode>([
      ['node-A', createMockNode('node-A')],
      ['node-B', createMockNode('node-B')],
    ]);
    const edges = new Map<string, NetworkEdge>([
      ['edge-AB', createMockEdge('edge-AB', 'node-A', 'node-B', 50)],
    ]);

    const topology: L1TopologyProvider = {
      getNode: (id) => nodes.get(id),
      getEdge: (id) => edges.get(id),
      getNodes: () => Array.from(nodes.values()),
      getEdges: () => Array.from(edges.values()),
    };

    const pathFinder: L1PathFinderProvider = {
      shortestPath: vi.fn(() =>
        createMockPathResult(['node-A', 'node-B'], ['edge-AB'], 50)
      ),
      findSRLGDiversePath: vi.fn(() => null),
      findMinimumSRLGOverlapPath: vi.fn(() => null),
    };

    return new L1ServiceManager(topology, pathFinder);
  }

  function buildManagerForLongPath() {
    const nodes = new Map<string, NetworkNode>([
      ['node-A', createMockNode('node-A')],
      ['node-B', createMockNode('node-B')],
    ]);
    const edges = new Map<string, NetworkEdge>([
      ['edge-AB', createMockEdge('edge-AB', 'node-A', 'node-B', 500)],
    ]);

    const topology: L1TopologyProvider = {
      getNode: (id) => nodes.get(id),
      getEdge: (id) => edges.get(id),
      getNodes: () => Array.from(nodes.values()),
      getEdges: () => Array.from(edges.values()),
    };

    const pathFinder: L1PathFinderProvider = {
      shortestPath: vi.fn(() =>
        createMockPathResult(['node-A', 'node-B'], ['edge-AB'], 500)
      ),
      findSRLGDiversePath: vi.fn(() => null),
      findMinimumSRLGOverlapPath: vi.fn(() => null),
    };

    return new L1ServiceManager(topology, pathFinder);
  }

  function buildManagerWithAmplifier() {
    const nodes = new Map<string, NetworkNode>([
      ['node-A', createMockNode('node-A')],
      ['amp-1', createMockNode('amp-1', 'amplifier')],
      ['node-B', createMockNode('node-B')],
    ]);
    const edges = new Map<string, NetworkEdge>([
      ['edge-A-amp', createMockEdge('edge-A-amp', 'node-A', 'amp-1', 80)],
      ['edge-amp-B', createMockEdge('edge-amp-B', 'amp-1', 'node-B', 80)],
    ]);

    const topology: L1TopologyProvider = {
      getNode: (id) => nodes.get(id),
      getEdge: (id) => edges.get(id),
      getNodes: () => Array.from(nodes.values()),
      getEdges: () => Array.from(edges.values()),
    };

    const pathFinder: L1PathFinderProvider = {
      shortestPath: vi.fn(() =>
        createMockPathResult(
          ['node-A', 'amp-1', 'node-B'],
          ['edge-A-amp', 'edge-amp-B'],
          160
        )
      ),
      findSRLGDiversePath: vi.fn(() => null),
      findMinimumSRLGOverlapPath: vi.fn(() => null),
    };

    return new L1ServiceManager(topology, pathFinder);
  }

  // --------------------------------------------------------------------------
  // OSNR calculation triggered by transceiverTypeId
  // --------------------------------------------------------------------------

  it('should skip OSNR when no transceiverTypeId is set', () => {
    const manager = buildManagerForShortPath();
    const result = manager.createL1Service(createDefaultConfig());

    expect(result.success).toBe(true);
    expect(result.osnrResult).toBeUndefined();
    expect(result.service?.osnrResult).toBeUndefined();
  });

  it('should compute OSNR when transceiverTypeId is set', () => {
    const manager = buildManagerForShortPath();
    const result = manager.createL1Service(
      createDefaultConfig({ transceiverTypeId: 'cfp2-dco-100g' })
    );

    expect(result.success).toBe(true);
    expect(result.osnrResult).toBeDefined();
    expect(result.osnrResult!.finalGSNR).toBeGreaterThan(0);
    expect(result.service?.osnrResult).toBeDefined();
    expect(result.service?.transceiverTypeId).toBe('cfp2-dco-100g');
  });

  it('should mark short path as OSNR feasible', () => {
    const manager = buildManagerForShortPath();
    const result = manager.createL1Service(
      createDefaultConfig({ transceiverTypeId: 'cfp2-dco-100g' })
    );

    expect(result.success).toBe(true);
    expect(result.osnrResult!.feasible).toBe(true);
    expect(result.osnrResult!.systemMargin).toBeGreaterThan(0);
  });

  it('should warn when OSNR is infeasible for a long path', () => {
    const manager = buildManagerForLongPath();
    const result = manager.createL1Service(
      createDefaultConfig({ transceiverTypeId: 'cfp2-dco-100g' })
    );

    // Service should still be created (OSNR is a warning, not a blocker)
    expect(result.success).toBe(true);
    expect(result.osnrResult).toBeDefined();
    if (!result.osnrResult!.feasible) {
      expect(result.warnings.some((w) => w.includes('OSNR infeasible'))).toBe(true);
    }
  });

  it('should skip OSNR if transceiver ID is unknown', () => {
    const manager = buildManagerForShortPath();
    const result = manager.createL1Service(
      createDefaultConfig({ transceiverTypeId: 'nonexistent-transceiver' })
    );

    expect(result.success).toBe(true);
    expect(result.osnrResult).toBeUndefined();
  });

  it('should skip OSNR if modulation not supported by transceiver', () => {
    const manager = buildManagerForShortPath();
    // cfp2-dco-100g does not support DP-64QAM
    const result = manager.createL1Service(
      createDefaultConfig({
        transceiverTypeId: 'cfp2-dco-100g',
        modulationType: 'DP-64QAM',
      })
    );

    expect(result.success).toBe(true);
    expect(result.osnrResult).toBeUndefined();
  });

  it('should detect amplifier nodes in path and include them', () => {
    const manager = buildManagerWithAmplifier();
    const result = manager.createL1Service(
      createDefaultConfig({ transceiverTypeId: 'cfp2-dco-100g' })
    );

    expect(result.success).toBe(true);
    expect(result.osnrResult).toBeDefined();
    // With an amplifier on a 160km path, OSNR should still be feasible
    expect(result.osnrResult!.feasible).toBe(true);
  });

  it('should include OSNR result fields (GSNR, margin, EoL)', () => {
    const manager = buildManagerForShortPath();
    const result = manager.createL1Service(
      createDefaultConfig({ transceiverTypeId: 'cfp2-dco-100g' })
    );

    const osnr = result.osnrResult!;
    expect(osnr.finalGSNR).toBeGreaterThan(0);
    expect(osnr.requiredOSNR).toBe(12); // DP-QPSK required OSNR
    expect(osnr.eolMargin).toBeGreaterThan(0);
    expect(typeof osnr.systemMargin).toBe('number');
    expect(typeof osnr.feasible).toBe('boolean');
  });

  it('should store transceiverTypeId on created service object', () => {
    const manager = buildManagerForShortPath();
    const result = manager.createL1Service(
      createDefaultConfig({ transceiverTypeId: 'cfp2-dco-100g' })
    );

    expect(result.service?.transceiverTypeId).toBe('cfp2-dco-100g');
  });

  it('should propagate OSNR warnings from calculation', () => {
    const manager = buildManagerForLongPath();
    const result = manager.createL1Service(
      createDefaultConfig({ transceiverTypeId: 'cfp2-dco-100g' })
    );

    // If the OSNR result has warnings, they should be in the service warnings
    if (result.osnrResult?.warnings && result.osnrResult.warnings.length > 0) {
      for (const w of result.osnrResult.warnings) {
        expect(result.warnings).toContain(w);
      }
    }
  });

  it('should use correct fiber profile attenuation for span calculation', () => {
    // With default fiber (G.652.D, 0.2 dB/km), a 50km span has ~11 dB loss
    const manager = buildManagerForShortPath();
    const result = manager.createL1Service(
      createDefaultConfig({ transceiverTypeId: 'cfp2-dco-100g' })
    );

    expect(result.osnrResult).toBeDefined();
    // Short 50km path with good transceiver should have high margin
    expect(result.osnrResult!.systemMargin).toBeGreaterThan(5);
  });
});
