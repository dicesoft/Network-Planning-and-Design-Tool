/**
 * L2L3ServiceManager Unit Tests
 *
 * Tests for L2/L3 IP service creation, underlay selection,
 * validation, and shared portion analysis.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  L2L3ServiceManager,
  createL2L3ServiceManager,
  type L2L3TopologyProvider,
  type L2L3ServiceProvider,
} from '../L2L3ServiceManager';
import { UnderlaySelector } from '../UnderlaySelector';
import type { NetworkNode, NetworkEdge } from '@/types/network';
import type {
  Service,
  L1DWDMService,
  L2L3Service,
  L2L3ServiceConfig,
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
 * Create mock L1 service
 */
const createMockL1Service = (
  id: string,
  sourceNodeId: string,
  destNodeId: string,
  dataRate: L1DataRate = '100G',
  status: 'active' | 'planned' | 'provisioning' = 'active',
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
 * Create mock L2/L3 config
 */
const createMockL2L3Config = (
  overrides: Partial<L2L3ServiceConfig> = {}
): L2L3ServiceConfig => ({
  name: 'Test L2 Service',
  type: 'l2-ethernet',
  sourceNodeId: 'node-A',
  sourcePortId: 'node-A-port-1',
  destinationNodeId: 'node-B',
  destinationPortId: 'node-B-port-1',
  dataRate: '100G',
  autoCreateUnderlay: false,
  underlayServiceId: 'L1-001',
  protectionScheme: 'none',
  bfdConfig: { enabled: false, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
  ...overrides,
});

// ============================================================================
// MOCK PROVIDERS
// ============================================================================

const createMockTopologyProvider = (
  nodes: NetworkNode[] = [],
  edges: NetworkEdge[] = []
): L2L3TopologyProvider => ({
  getNode: vi.fn((id: string) => nodes.find((n) => n.id === id)),
  getEdge: vi.fn((id: string) => edges.find((e) => e.id === id)),
  getNodes: vi.fn(() => nodes),
  getEdges: vi.fn(() => edges),
});

const createMockServiceProvider = (
  services: Service[] = []
): L2L3ServiceProvider => ({
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

describe('L2L3ServiceManager', () => {
  let manager: L2L3ServiceManager;
  let topology: L2L3TopologyProvider;
  let services: L2L3ServiceProvider;
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

    // Setup L1 services
    l1Services = [
      createMockL1Service('L1-001', 'node-A', 'node-B', '100G', 'active', ['edge-1']),
      createMockL1Service('L1-002', 'node-A', 'node-B', '100G', 'active', ['edge-3', 'edge-2']),
      createMockL1Service('L1-003', 'node-A', 'node-C', '400G', 'active', ['edge-3']),
    ];

    topology = createMockTopologyProvider(nodes, edges);
    services = createMockServiceProvider(l1Services);
    manager = new L2L3ServiceManager(topology, services);
  });

  // ==========================================================================
  // BASIC SERVICE CREATION
  // ==========================================================================

  describe('Basic Service Creation', () => {
    it('should create L2 Ethernet service with manual underlay selection', () => {
      const config = createMockL2L3Config({
        type: 'l2-ethernet',
        underlayServiceId: 'L1-001',
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.service).toBeDefined();
      expect(result.service?.type).toBe('l2-ethernet');
      expect(result.service?.underlayServiceId).toBe('L1-001');
      expect(result.service?.underlayAutoCreated).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should create L3 IP service with manual underlay selection', () => {
      const config = createMockL2L3Config({
        type: 'l3-ip',
        underlayServiceId: 'L1-001',
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.service).toBeDefined();
      expect(result.service?.type).toBe('l3-ip');
      expect(result.errors).toHaveLength(0);
    });

    it('should set service status to planned initially', () => {
      const config = createMockL2L3Config();
      const result = manager.createL2L3Service(config);

      expect(result.service?.status).toBe('planned');
    });

    it('should set timestamps on service creation', () => {
      const config = createMockL2L3Config();
      const result = manager.createL2L3Service(config);

      expect(result.service?.createdAt).toBeDefined();
      expect(result.service?.modifiedAt).toBeDefined();
    });
  });

  // ==========================================================================
  // UNDERLAY SELECTION
  // ==========================================================================

  describe('Underlay Selection', () => {
    it('should auto-select best available underlay', () => {
      const config = createMockL2L3Config({
        underlayServiceId: undefined,
        autoCreateUnderlay: true, // Enable auto-selection
      });

      // Reconfigure services to return available L1s
      const availableL1 = createMockL1Service('L1-AUTO', 'node-A', 'node-B');
      services = createMockServiceProvider([availableL1]);
      manager = new L2L3ServiceManager(topology, services);

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.service?.underlayServiceId).toBe('L1-AUTO');
      expect(result.service?.underlayAutoCreated).toBe(true);
    });

    it('should fail when no compatible underlay is available', () => {
      const config = createMockL2L3Config({
        underlayServiceId: undefined,
        autoCreateUnderlay: false,
      });

      // No L1 services available
      services = createMockServiceProvider([]);
      manager = new L2L3ServiceManager(topology, services);

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail when underlay not found', () => {
      const config = createMockL2L3Config({
        underlayServiceId: 'L1-NONEXISTENT',
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('should warn when underlay not active', () => {
      const plannedL1 = createMockL1Service('L1-PLANNED', 'node-A', 'node-B', '100G', 'planned');
      services = createMockServiceProvider([plannedL1]);
      manager = new L2L3ServiceManager(topology, services);

      const config = createMockL2L3Config({
        underlayServiceId: 'L1-PLANNED',
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('not active'))).toBe(true);
    });

    it('should return selected underlay in result', () => {
      const config = createMockL2L3Config({
        underlayServiceId: 'L1-001',
      });

      const result = manager.createL2L3Service(config);

      expect(result.selectedUnderlay).toBeDefined();
      expect(result.selectedUnderlay?.id).toBe('L1-001');
    });
  });

  // ==========================================================================
  // CAPACITY VALIDATION
  // ==========================================================================

  describe('Capacity Validation', () => {
    it('should accept underlay with sufficient capacity', () => {
      const config = createMockL2L3Config({
        dataRate: '100G',
        underlayServiceId: 'L1-001', // 100G underlay
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
    });

    it('should accept underlay with higher capacity than required', () => {
      const config = createMockL2L3Config({
        sourceNodeId: 'node-A',
        destinationNodeId: 'node-C',
        dataRate: '100G',
        underlayServiceId: 'L1-003', // 400G underlay
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
    });

    it('should reject underlay with insufficient capacity', () => {
      // Create 10G underlay
      const lowCapacityL1 = createMockL1Service('L1-LOW', 'node-A', 'node-B', '10G');
      services = createMockServiceProvider([lowCapacityL1]);
      manager = new L2L3ServiceManager(topology, services);

      const config = createMockL2L3Config({
        dataRate: '100G',
        underlayServiceId: 'L1-LOW',
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('insufficient'))).toBe(true);
    });
  });

  // ==========================================================================
  // PROTECTION CONFIGURATION
  // ==========================================================================

  describe('Protection Configuration', () => {
    it('should create service with BFD failover protection', () => {
      const config = createMockL2L3Config({
        protectionScheme: 'bfd-failover',
        protectionUnderlayServiceId: 'L1-002',
        bfdConfig: { enabled: true, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.service?.protectionScheme).toBe('bfd-failover');
      expect(result.service?.protectionUnderlayServiceId).toBe('L1-002');
      expect(result.service?.bfdConfig.enabled).toBe(true);
    });

    it('should auto-select diverse protection underlay', () => {
      const config = createMockL2L3Config({
        protectionScheme: 'bfd-failover',
        underlayServiceId: 'L1-001',
        protectionUnderlayServiceId: undefined,
        bfdConfig: { enabled: true, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      // Should select L1-002 as it's different from L1-001
      expect(result.selectedProtectionUnderlay).toBeDefined();
      expect(result.selectedProtectionUnderlay?.id).not.toBe('L1-001');
    });

    it('should reject protection underlay same as working underlay', () => {
      const config = createMockL2L3Config({
        protectionScheme: 'bfd-failover',
        underlayServiceId: 'L1-001',
        protectionUnderlayServiceId: 'L1-001', // Same as working
        bfdConfig: { enabled: true, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('different'))).toBe(true);
    });

    it('should warn when no protection underlay available for BFD failover', () => {
      // Only one L1 service available
      const singleL1 = createMockL1Service('L1-SINGLE', 'node-A', 'node-B');
      services = createMockServiceProvider([singleL1]);
      manager = new L2L3ServiceManager(topology, services);

      const config = createMockL2L3Config({
        protectionScheme: 'bfd-failover',
        underlayServiceId: 'L1-SINGLE',
        protectionUnderlayServiceId: undefined,
        bfdConfig: { enabled: true, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('protection underlay'))).toBe(true);
    });
  });

  // ==========================================================================
  // BFD CONFIGURATION
  // ==========================================================================

  describe('BFD Configuration', () => {
    it('should apply default BFD config when disabled', () => {
      const config = createMockL2L3Config({
        bfdConfig: { enabled: false, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      });

      const result = manager.createL2L3Service(config);

      expect(result.service?.bfdConfig.enabled).toBe(false);
    });

    it('should accept custom BFD config', () => {
      const config = createMockL2L3Config({
        bfdConfig: {
          enabled: true,
          minTxInterval: 100000,
          minRxInterval: 100000,
          multiplier: 5,
        },
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.service?.bfdConfig.minTxInterval).toBe(100000);
      expect(result.service?.bfdConfig.multiplier).toBe(5);
    });

    it('should warn when BFD TX interval is too low', () => {
      const config = createMockL2L3Config({
        bfdConfig: {
          enabled: true,
          minTxInterval: 10000, // 10ms - below recommended 50ms
          minRxInterval: 300000,
          multiplier: 3,
        },
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('CPU'))).toBe(true);
    });

    it('should reject BFD multiplier out of range', () => {
      const config = createMockL2L3Config({
        bfdConfig: {
          enabled: true,
          minTxInterval: 300000,
          minRxInterval: 300000,
          multiplier: 300, // Out of range (max 255)
        },
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('multiplier'))).toBe(true);
    });

    it('should auto-enable BFD for bfd-failover protection scheme', () => {
      const config = createMockL2L3Config({
        protectionScheme: 'bfd-failover',
        protectionUnderlayServiceId: 'L1-002',
        bfdConfig: { enabled: false, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.service?.bfdConfig.enabled).toBe(true);
    });
  });

  // ==========================================================================
  // SHARED PORTION ANALYSIS
  // ==========================================================================

  describe('Shared Portion Analysis', () => {
    it('should analyze shared portion between underlays with no overlap', () => {
      // L1-001 uses edge-1, L1-002 uses edge-3, edge-2
      const config = createMockL2L3Config({
        protectionScheme: 'bfd-failover',
        underlayServiceId: 'L1-001',
        protectionUnderlayServiceId: 'L1-002',
        bfdConfig: { enabled: true, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.sharedPortionAnalysis).toBeDefined();
      expect(result.sharedPortionAnalysis?.sharedEdgeIds).toHaveLength(0);
      expect(result.sharedPortionAnalysis?.sharedPercentage).toBe(0);
    });

    it('should detect shared edges between underlays', () => {
      // Create overlapping L1 services
      const l1Work = createMockL1Service('L1-WORK', 'node-A', 'node-B', '100G', 'active', [
        'edge-1',
        'edge-2',
      ]);
      const l1Prot = createMockL1Service('L1-PROT', 'node-A', 'node-B', '100G', 'active', [
        'edge-1', // Shared
        'edge-3',
      ]);

      services = createMockServiceProvider([l1Work, l1Prot]);
      manager = new L2L3ServiceManager(topology, services);

      const config = createMockL2L3Config({
        protectionScheme: 'bfd-failover',
        underlayServiceId: 'L1-WORK',
        protectionUnderlayServiceId: 'L1-PROT',
        bfdConfig: { enabled: true, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(true);
      expect(result.sharedPortionAnalysis).toBeDefined();
      expect(result.sharedPortionAnalysis?.sharedEdgeIds).toContain('edge-1');
    });

    it('should warn or error on high shared portion', () => {
      // Create partially overlapping L1 services for warning (50-69% overlap)
      // To trigger warning, we need 50-69% overlap
      // L1-WORK has 2 edges (total distance 200), L1-PROT has 2 edges with 1 shared
      const l1Work = createMockL1Service('L1-WORK', 'node-A', 'node-B', '100G', 'active', [
        'edge-1',
        'edge-2',
      ]);
      const l1Prot = createMockL1Service('L1-PROT', 'node-A', 'node-B', '100G', 'active', [
        'edge-1', // Shared edge (100km)
        'edge-3', // Different edge (100km)
      ]);

      services = createMockServiceProvider([l1Work, l1Prot]);

      // Provide edges with distance - shared edge-1 gives 100km / 200km = 50% overlap
      const edgesWithDistance: NetworkEdge[] = [
        createMockEdge('edge-1', 'node-A', 'node-B', 100),
        createMockEdge('edge-2', 'node-B', 'node-C', 100),
        createMockEdge('edge-3', 'node-A', 'node-C', 100),
      ];
      topology = createMockTopologyProvider(nodes, edgesWithDistance);
      manager = new L2L3ServiceManager(topology, services);

      const config = createMockL2L3Config({
        protectionScheme: 'bfd-failover',
        underlayServiceId: 'L1-WORK',
        protectionUnderlayServiceId: 'L1-PROT',
        bfdConfig: { enabled: true, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      });

      const result = manager.createL2L3Service(config);

      // At 50% overlap, should trigger a "High path overlap" warning
      expect(result.warnings.some((w) => w.toLowerCase().includes('overlap'))).toBe(true);
    });

    it('should include shared portion analysis in service result', () => {
      const config = createMockL2L3Config({
        protectionScheme: 'bfd-failover',
        underlayServiceId: 'L1-001',
        protectionUnderlayServiceId: 'L1-002',
        bfdConfig: { enabled: true, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      });

      const result = manager.createL2L3Service(config);

      expect(result.service?.sharedPortionAnalysis).toBeDefined();
    });
  });

  // ==========================================================================
  // VALIDATION ERRORS
  // ==========================================================================

  describe('Validation Errors', () => {
    it('should reject when source node not found', () => {
      const config = createMockL2L3Config({
        sourceNodeId: 'nonexistent-node',
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Source node not found'))).toBe(true);
    });

    it('should reject when destination node not found', () => {
      const config = createMockL2L3Config({
        destinationNodeId: 'nonexistent-node',
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Destination node not found'))).toBe(true);
    });

    it('should reject when source equals destination', () => {
      const config = createMockL2L3Config({
        sourceNodeId: 'node-A',
        destinationNodeId: 'node-A',
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('different nodes'))).toBe(true);
    });

    it('should reject when service name is missing', () => {
      const config = createMockL2L3Config({
        name: '',
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('name is required'))).toBe(true);
    });

    it('should reject when underlay is not L1 type', () => {
      // Add an L2 service as potential "underlay"
      const l2Service: L2L3Service = {
        id: 'L2-FAKE',
        name: 'Fake Underlay',
        type: 'l2-ethernet',
        status: 'active',
        sourceNodeId: 'node-A',
        sourcePortId: 'node-A-port-1',
        destinationNodeId: 'node-B',
        destinationPortId: 'node-B-port-1',
        dataRate: '100G',
        underlayServiceId: 'L1-001',
        underlayAutoCreated: false,
        protectionScheme: 'none',
        bfdConfig: { enabled: false, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        metadata: {},
      };

      services = createMockServiceProvider([...l1Services, l2Service]);
      manager = new L2L3ServiceManager(topology, services);

      const config = createMockL2L3Config({
        underlayServiceId: 'L2-FAKE',
      });

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('L1 DWDM'))).toBe(true);
    });

    it('should require underlay when auto-create is disabled', () => {
      const config = createMockL2L3Config({
        underlayServiceId: undefined,
        autoCreateUnderlay: false,
      });

      // No L1 services available
      services = createMockServiceProvider([]);
      manager = new L2L3ServiceManager(topology, services);

      const result = manager.createL2L3Service(config);

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  describe('Utility Methods', () => {
    it('should get available underlays for endpoints', () => {
      const underlays = manager.getAvailableUnderlays('node-A', 'node-B');

      expect(underlays.length).toBeGreaterThan(0);
      expect(underlays.every((u) => u.type === 'l1-dwdm')).toBe(true);
    });

    it('should select underlay manually', () => {
      const underlay = manager.selectUnderlay('node-A', 'node-B', '100G', 'L1-001');

      expect(underlay).toBeDefined();
      expect(underlay?.id).toBe('L1-001');
    });

    it('should select protection underlay excluding working', () => {
      const protection = manager.selectProtectionUnderlay(
        'node-A',
        'node-B',
        '100G',
        'L1-001'
      );

      expect(protection).toBeDefined();
      expect(protection?.id).not.toBe('L1-001');
    });

    it('should validate existing service', () => {
      const existingService: L2L3Service = {
        id: 'L2-001',
        name: 'Existing Service',
        type: 'l2-ethernet',
        status: 'active',
        sourceNodeId: 'node-A',
        sourcePortId: 'node-A-port-1',
        destinationNodeId: 'node-B',
        destinationPortId: 'node-B-port-1',
        dataRate: '100G',
        underlayServiceId: 'L1-001',
        underlayAutoCreated: false,
        protectionScheme: 'none',
        bfdConfig: { enabled: false, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        metadata: {},
      };

      const result = manager.validateExistingService(existingService);

      expect(result.valid).toBe(true);
    });

    it('should detect invalid existing service when underlay removed', () => {
      const existingService: L2L3Service = {
        id: 'L2-001',
        name: 'Existing Service',
        type: 'l2-ethernet',
        status: 'active',
        sourceNodeId: 'node-A',
        sourcePortId: 'node-A-port-1',
        destinationNodeId: 'node-B',
        destinationPortId: 'node-B-port-1',
        dataRate: '100G',
        underlayServiceId: 'L1-REMOVED', // This L1 doesn't exist
        underlayAutoCreated: false,
        protectionScheme: 'none',
        bfdConfig: { enabled: false, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        metadata: {},
      };

      const result = manager.validateExistingService(existingService);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'UNDERLAY_NOT_FOUND')).toBe(true);
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION
  // ==========================================================================

  describe('Factory Function', () => {
    it('should create manager with factory function', () => {
      const factoryManager = createL2L3ServiceManager(topology, services);

      expect(factoryManager).toBeInstanceOf(L2L3ServiceManager);
    });

    it('should accept custom underlay selector', () => {
      const customSelector = new UnderlaySelector(services, topology);
      const factoryManager = createL2L3ServiceManager(topology, services, customSelector);

      expect(factoryManager).toBeInstanceOf(L2L3ServiceManager);
    });
  });
});
