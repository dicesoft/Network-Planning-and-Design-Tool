/**
 * UnderlaySelector Unit Tests
 *
 * Tests for L1 underlay selection functionality including:
 * - Finding compatible underlays
 * - Best underlay selection
 * - Diverse underlay selection
 * - Capacity validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UnderlaySelector,
  createUnderlaySelector,
  type UnderlayTopologyProvider,
  type UnderlayServiceProvider,
} from '../UnderlaySelector';
import type { NetworkNode, NetworkEdge } from '@/types/network';
import type {
  Service,
  L1DWDMService,
  L2L3Service,
  ServicePath,
  L1DataRate,
} from '@/types/service';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Create mock node
 */
const createMockNode = (id: string): NetworkNode => ({
  id,
  name: `Node ${id}`,
  type: 'router',
  vendor: 'cisco',
  position: { x: 0, y: 0 },
  stacks: [],
  ports: [
    { id: `${id}-port-1`, name: 'Ethernet1', type: 'bw', dataRate: '100G', status: 'available' },
    { id: `${id}-port-2`, name: 'DWDM1', type: 'dwdm', dataRate: '100G', status: 'available' },
  ],
  metadata: {},
});

/**
 * Create mock edge
 */
const createMockEdge = (
  id: string,
  sourceId: string,
  targetId: string,
  distance: number = 100
): NetworkEdge => ({
  id,
  name: `Edge ${id}`,
  type: 'fiber',
  source: { nodeId: sourceId },
  target: { nodeId: targetId },
  properties: { distance, weight: distance, cost: distance },
  state: 'active',
  metadata: {},
});

/**
 * Create mock service path
 */
const createMockServicePath = (
  type: 'working' | 'protection',
  edgeIds: string[] = ['edge-1']
): ServicePath => ({
  id: crypto.randomUUID(),
  type,
  nodeIds: ['node-A', 'node-B'],
  edgeIds,
  totalDistance: edgeIds.length * 100,
  hopCount: edgeIds.length,
  status: 'active',
});

/**
 * Create mock L1 service
 */
const createMockL1Service = (
  id: string,
  sourceNodeId: string,
  destNodeId: string,
  dataRate: L1DataRate = '100G',
  status: 'active' | 'planned' | 'provisioning' | 'failed' = 'active',
  edgeIds: string[] = ['edge-1']
): L1DWDMService => ({
  id,
  name: `L1 Service ${id}`,
  type: 'l1-dwdm',
  status,
  sourceNodeId,
  sourcePortId: `${sourceNodeId}-port-2`,
  destinationNodeId: destNodeId,
  destinationPortId: `${destNodeId}-port-2`,
  dataRate,
  modulationType: 'DP-QPSK',
  channelWidth: '50GHz',
  wavelengthMode: 'continuous',
  channelNumber: 10,
  workingPath: createMockServicePath('working', edgeIds),
  protectionScheme: 'none',
  restorationEnabled: false,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  metadata: {},
});

/**
 * Create mock L2 service (for utilization testing)
 */
const createMockL2Service = (
  id: string,
  underlayId: string
): L2L3Service => ({
  id,
  name: `L2 Service ${id}`,
  type: 'l2-ethernet',
  status: 'active',
  sourceNodeId: 'node-A',
  sourcePortId: 'node-A-port-1',
  destinationNodeId: 'node-B',
  destinationPortId: 'node-B-port-1',
  dataRate: '100G',
  underlayServiceId: underlayId,
  underlayAutoCreated: false,
  protectionScheme: 'none',
  bfdConfig: { enabled: false, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  metadata: {},
});

// ============================================================================
// MOCK PROVIDERS
// ============================================================================

const createMockTopologyProvider = (
  nodes: NetworkNode[] = [],
  edges: NetworkEdge[] = []
): UnderlayTopologyProvider => ({
  getNode: vi.fn((id: string) => nodes.find((n) => n.id === id)),
  getEdge: vi.fn((id: string) => edges.find((e) => e.id === id)),
});

const createMockServiceProvider = (
  services: Service[] = []
): UnderlayServiceProvider => ({
  getService: vi.fn((id: string) => services.find((s) => s.id === id)),
  getServices: vi.fn(() => services),
  getL1ServicesForEndpoints: vi.fn(
    (sourceNodeId: string, destNodeId: string, _minDataRate?: L1DataRate) =>
      services.filter(
        (s): s is L1DWDMService =>
          s.type === 'l1-dwdm' &&
          s.status === 'active' &&
          ((s.sourceNodeId === sourceNodeId && s.destinationNodeId === destNodeId) ||
            (s.sourceNodeId === destNodeId && s.destinationNodeId === sourceNodeId))
      )
  ),
});

// ============================================================================
// TESTS
// ============================================================================

describe('UnderlaySelector', () => {
  let selector: UnderlaySelector;
  let topology: UnderlayTopologyProvider;
  let services: UnderlayServiceProvider;
  let nodes: NetworkNode[];
  let edges: NetworkEdge[];
  let l1Services: L1DWDMService[];

  beforeEach(() => {
    // Setup test topology
    nodes = [
      createMockNode('node-A'),
      createMockNode('node-B'),
      createMockNode('node-C'),
    ];

    edges = [
      createMockEdge('edge-1', 'node-A', 'node-B', 100),
      createMockEdge('edge-2', 'node-B', 'node-C', 150),
      createMockEdge('edge-3', 'node-A', 'node-C', 200),
    ];

    // Setup L1 services - various capacities and routes
    l1Services = [
      createMockL1Service('L1-001', 'node-A', 'node-B', '100G', 'active', ['edge-1']),
      createMockL1Service('L1-002', 'node-A', 'node-B', '400G', 'active', ['edge-3', 'edge-2']),
      createMockL1Service('L1-003', 'node-A', 'node-C', '100G', 'active', ['edge-3']),
      createMockL1Service('L1-004', 'node-B', 'node-C', '100G', 'active', ['edge-2']),
    ];

    topology = createMockTopologyProvider(nodes, edges);
    services = createMockServiceProvider(l1Services);
    selector = new UnderlaySelector(services, topology);
  });

  // ==========================================================================
  // FIND COMPATIBLE UNDERLAYS
  // ==========================================================================

  describe('findCompatibleUnderlays', () => {
    it('should find L1 services connecting endpoints', () => {
      const underlays = selector.findCompatibleUnderlays('node-A', 'node-B', '100G');

      expect(underlays.length).toBeGreaterThan(0);
      expect(underlays.every((u) => u.type === 'l1-dwdm')).toBe(true);
    });

    it('should filter by minimum data rate', () => {
      // Only L1-002 has 400G capacity
      const underlays = selector.findCompatibleUnderlays('node-A', 'node-B', '400G');

      expect(underlays).toHaveLength(1);
      expect(underlays[0].dataRate).toBe('400G');
    });

    it('should return empty array when no compatible underlays', () => {
      // No L1 services connect node-A to node-C with 400G
      const underlays = selector.findCompatibleUnderlays('node-A', 'node-C', '400G');

      expect(underlays).toHaveLength(0);
    });

    it('should include bidirectional services', () => {
      // Search in reverse direction
      const underlays = selector.findCompatibleUnderlays('node-B', 'node-A', '100G');

      expect(underlays.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // SELECT BEST UNDERLAY
  // ==========================================================================

  describe('selectBestUnderlay', () => {
    it('should select best underlay based on criteria', () => {
      const result = selector.selectBestUnderlay('node-A', 'node-B', '100G');

      expect(result.selected).toBeDefined();
      expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('should prefer active status', () => {
      // Add a planned service with higher capacity
      const plannedL1 = createMockL1Service('L1-PLANNED', 'node-A', 'node-B', '400G', 'planned');
      services = createMockServiceProvider([...l1Services, plannedL1]);
      // But getL1ServicesForEndpoints only returns active services
      selector = new UnderlaySelector(services, topology);

      const result = selector.selectBestUnderlay('node-A', 'node-B', '100G');

      expect(result.selected?.status).toBe('active');
    });

    it('should prefer higher capacity when status equal', () => {
      const result = selector.selectBestUnderlay('node-A', 'node-B', '100G');

      // L1-002 has 400G, L1-001 has 100G, both active
      expect(result.selected?.dataRate).toBe('400G');
    });

    it('should prefer shorter path when capacity equal', () => {
      // Create two 100G services with different hop counts
      const shortPath = createMockL1Service('L1-SHORT', 'node-A', 'node-B', '100G', 'active', [
        'edge-1',
      ]);
      const longPath = createMockL1Service('L1-LONG', 'node-A', 'node-B', '100G', 'active', [
        'edge-3',
        'edge-2',
      ]);

      services = createMockServiceProvider([shortPath, longPath]);
      selector = new UnderlaySelector(services, topology);

      const result = selector.selectBestUnderlay('node-A', 'node-B', '100G');

      expect(result.selected?.id).toBe('L1-SHORT');
    });

    it('should return null when no compatible underlays', () => {
      services = createMockServiceProvider([]);
      selector = new UnderlaySelector(services, topology);

      const result = selector.selectBestUnderlay('node-A', 'node-B', '100G');

      expect(result.selected).toBeNull();
      expect(result.reason).toContain('No L1 services');
    });

    it('should fail when source node not found', () => {
      const result = selector.selectBestUnderlay('nonexistent', 'node-B', '100G');

      expect(result.selected).toBeNull();
      expect(result.reason).toContain('Source node not found');
    });

    it('should fail when destination node not found', () => {
      const result = selector.selectBestUnderlay('node-A', 'nonexistent', '100G');

      expect(result.selected).toBeNull();
      expect(result.reason).toContain('Destination node not found');
    });

    it('should include candidates in result', () => {
      const result = selector.selectBestUnderlay('node-A', 'node-B', '100G');

      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      expect(result.candidates).toContain(result.selected);
    });
  });

  // ==========================================================================
  // SELECT DIVERSE UNDERLAY
  // ==========================================================================

  describe('selectDiverseUnderlay', () => {
    it('should exclude specified underlay', () => {
      const result = selector.selectDiverseUnderlay('node-A', 'node-B', '100G', 'L1-001');

      expect(result.selected).toBeDefined();
      expect(result.selected?.id).not.toBe('L1-001');
    });

    it('should prefer underlay with minimal edge overlap', () => {
      // L1-001 uses edge-1
      // L1-002 uses edge-3, edge-2 (no overlap with edge-1)
      const result = selector.selectDiverseUnderlay('node-A', 'node-B', '100G', 'L1-001');

      expect(result.selected?.id).toBe('L1-002');
    });

    it('should return null when no diverse underlays available', () => {
      // Only one L1 service
      const singleL1 = createMockL1Service('L1-SINGLE', 'node-A', 'node-B');
      services = createMockServiceProvider([singleL1]);
      selector = new UnderlaySelector(services, topology);

      const result = selector.selectDiverseUnderlay('node-A', 'node-B', '100G', 'L1-SINGLE');

      expect(result.selected).toBeNull();
      expect(result.reason).toContain('No diverse');
    });

    it('should warn on high edge overlap', () => {
      // Create two services with highly overlapping paths (>50% overlap)
      // L1-WORK has 2 edges, L1-DIV shares both - this is 100% overlap
      const l1Work = createMockL1Service('L1-WORK', 'node-A', 'node-B', '100G', 'active', [
        'edge-1',
      ]);
      const l1Div = createMockL1Service('L1-DIV', 'node-A', 'node-B', '100G', 'active', [
        'edge-1', // Same edge = 100% overlap
      ]);

      services = createMockServiceProvider([l1Work, l1Div]);
      selector = new UnderlaySelector(services, topology);

      const result = selector.selectDiverseUnderlay('node-A', 'node-B', '100G', 'L1-WORK');

      expect(result.selected?.id).toBe('L1-DIV');
      expect(result.warnings.some((w) => w.includes('overlap'))).toBe(true);
    });
  });

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  describe('validateUnderlay', () => {
    it('should validate existing underlay successfully', () => {
      const result = selector.validateUnderlay(
        'L1-001',
        'node-A',
        'node-B',
        '100G'
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when underlay not found', () => {
      const result = selector.validateUnderlay(
        'L1-NONEXISTENT',
        'node-A',
        'node-B',
        '100G'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('should fail when underlay is not L1 type', () => {
      const l2Service = createMockL2Service('L2-001', 'L1-001');
      services = createMockServiceProvider([...l1Services, l2Service]);
      selector = new UnderlaySelector(services, topology);

      const result = selector.validateUnderlay(
        'L2-001',
        'node-A',
        'node-B',
        '100G'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not an L1'))).toBe(true);
    });

    it('should fail when endpoints do not match', () => {
      const result = selector.validateUnderlay(
        'L1-001', // Connects A to B
        'node-A',
        'node-C', // Wrong destination
        '100G'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('do not match'))).toBe(true);
    });

    it('should fail when capacity insufficient', () => {
      const result = selector.validateUnderlay(
        'L1-001', // 100G
        'node-A',
        'node-B',
        '400G' // Requires 400G
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('insufficient'))).toBe(true);
    });

    it('should warn when underlay not active', () => {
      const plannedL1 = createMockL1Service('L1-PLANNED', 'node-A', 'node-B', '100G', 'planned');
      services = createMockServiceProvider([plannedL1]);
      selector = new UnderlaySelector(services, topology);

      const result = selector.validateUnderlay(
        'L1-PLANNED',
        'node-A',
        'node-B',
        '100G'
      );

      expect(result.valid).toBe(true); // Valid but with warning
      expect(result.warnings.some((w) => w.includes('not active'))).toBe(true);
    });
  });

  // ==========================================================================
  // CAPACITY CHECKING
  // ==========================================================================

  describe('canAccommodate', () => {
    it('should return true for sufficient capacity', () => {
      expect(selector.canAccommodate('L1-001', '100G')).toBe(true);
      expect(selector.canAccommodate('L1-001', '10G')).toBe(true);
    });

    it('should return false for insufficient capacity', () => {
      expect(selector.canAccommodate('L1-001', '400G')).toBe(false);
    });

    it('should return false for non-existent service', () => {
      expect(selector.canAccommodate('L1-NONEXISTENT', '100G')).toBe(false);
    });

    it('should return false for non-L1 service', () => {
      const l2Service = createMockL2Service('L2-001', 'L1-001');
      services = createMockServiceProvider([...l1Services, l2Service]);
      selector = new UnderlaySelector(services, topology);

      expect(selector.canAccommodate('L2-001', '100G')).toBe(false);
    });
  });

  // ==========================================================================
  // UTILIZATION
  // ==========================================================================

  describe('getUnderlayUtilization', () => {
    it('should return utilization for valid underlay', () => {
      const util = selector.getUnderlayUtilization('L1-001');

      expect(util).toBeDefined();
      expect(util?.underlayId).toBe('L1-001');
      expect(util?.dataRate).toBe('100G');
    });

    it('should return null for non-existent underlay', () => {
      const util = selector.getUnderlayUtilization('L1-NONEXISTENT');

      expect(util).toBeNull();
    });

    it('should track services using underlay', () => {
      // Add L2 services using L1-001
      const l2Service1 = createMockL2Service('L2-001', 'L1-001');
      const l2Service2 = createMockL2Service('L2-002', 'L1-001');

      services = createMockServiceProvider([...l1Services, l2Service1, l2Service2]);
      selector = new UnderlaySelector(services, topology);

      const util = selector.getUnderlayUtilization('L1-001');

      expect(util?.usedBy).toContain('L2-001');
      expect(util?.usedBy).toContain('L2-002');
    });
  });

  describe('getAvailableUnderlays', () => {
    it('should return underlays with utilization info', () => {
      const underlays = selector.getAvailableUnderlays('node-A', 'node-B');

      expect(underlays.length).toBeGreaterThan(0);
      expect(underlays[0].utilization).toBeDefined();
      expect(underlays[0].utilization.underlayId).toBe(underlays[0].id);
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION
  // ==========================================================================

  describe('Factory Function', () => {
    it('should create selector with factory function', () => {
      const factorySelector = createUnderlaySelector(services, topology);

      expect(factorySelector).toBeInstanceOf(UnderlaySelector);
    });
  });
});
