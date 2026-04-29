import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ServiceManager,
  TopologyProvider,
  ServiceProvider,
  PathFinderProvider,
  PathResult,
  isDataRateSufficient,
  getDataRateValue,
} from '../ServiceManager';
import type {
  L1ServiceConfig,
  L2L3ServiceConfig,
  ServicePath,
  L1DWDMService,
  L2L3Service,
} from '@/types/service';
import type { NetworkNode, NetworkEdge, Port } from '@/types/network';

// ============================================================================
// MOCK DATA
// ============================================================================

const createMockPort = (overrides: Partial<Port> = {}): Port => ({
  id: 'port-1',
  name: 'Port 1',
  type: 'dwdm',
  dataRate: '100G',
  channels: 96,
  status: 'available',
  ...overrides,
});

const createMockNode = (overrides: Partial<NetworkNode> = {}): NetworkNode => ({
  id: 'node-1',
  name: 'Node 1',
  type: 'router',
  vendor: 'generic',
  position: { x: 0, y: 0 },
  stacks: [],
  ports: [
    createMockPort({ id: 'port-1', name: 'DWDM-1' }),
    createMockPort({ id: 'port-2', name: 'DWDM-2' }),
    createMockPort({ id: 'port-3', name: 'BW-1', type: 'bw', dataRate: '10G', channels: 1 }),
  ],
  metadata: {},
  ...overrides,
});

const createMockEdge = (overrides: Partial<NetworkEdge> = {}): NetworkEdge => ({
  id: 'edge-1',
  name: 'Edge 1',
  type: 'fiber',
  source: { nodeId: 'node-1', portId: 'port-1' },
  target: { nodeId: 'node-2', portId: 'port-2' },
  properties: {
    distance: 50,
    srlgCodes: ['SRLG-A'],
  },
  state: 'active',
  metadata: {},
  ...overrides,
});

const createMockServicePath = (overrides: Partial<ServicePath> = {}): ServicePath => ({
  id: 'path-1',
  type: 'working',
  nodeIds: ['node-1', 'node-2'],
  edgeIds: ['edge-1'],
  totalDistance: 50,
  hopCount: 1,
  status: 'computed',
  ...overrides,
});

const createMockL1Service = (overrides: Partial<L1DWDMService> = {}): L1DWDMService => ({
  id: 'L1-001',
  name: 'Test L1 Service',
  type: 'l1-dwdm',
  status: 'active',
  sourceNodeId: 'node-1',
  sourcePortId: 'port-1',
  destinationNodeId: 'node-2',
  destinationPortId: 'port-2',
  dataRate: '100G',
  modulationType: 'DP-QPSK',
  channelWidth: '50GHz',
  wavelengthMode: 'continuous',
  channelNumber: 35,
  workingPath: createMockServicePath(),
  protectionScheme: 'none',
  restorationEnabled: false,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  metadata: {},
  ...overrides,
});

// ============================================================================
// MOCK PROVIDERS
// ============================================================================

const createMockTopologyProvider = (
  nodes: NetworkNode[] = [],
  edges: NetworkEdge[] = []
): TopologyProvider => ({
  getNode: (id) => nodes.find((n) => n.id === id),
  getEdge: (id) => edges.find((e) => e.id === id),
  getNodes: () => nodes,
  getEdges: () => edges,
  getConnectedEdges: (nodeId) =>
    edges.filter((e) => e.source.nodeId === nodeId || e.target.nodeId === nodeId),
});

const createMockServiceProvider = (services: (L1DWDMService | L2L3Service)[] = []): ServiceProvider => ({
  getService: (id) => services.find((s) => s.id === id),
  getServices: () => services,
  getL1ServicesForEndpoints: (sourceNodeId, destNodeId, _minDataRate) =>
    services.filter((s): s is L1DWDMService => {
      if (s.type !== 'l1-dwdm') return false;
      if (s.status !== 'active') return false;
      const matches =
        (s.sourceNodeId === sourceNodeId && s.destinationNodeId === destNodeId) ||
        (s.sourceNodeId === destNodeId && s.destinationNodeId === sourceNodeId);
      return matches;
    }),
  getDependentServices: (serviceId) =>
    services.filter((s): s is L2L3Service => {
      if (s.type === 'l1-dwdm') return false;
      return (
        (s as L2L3Service).underlayServiceId === serviceId ||
        (s as L2L3Service).protectionUnderlayServiceId === serviceId
      );
    }),
});

const createMockPathFinderProvider = (): PathFinderProvider => ({
  shortestPath: vi.fn().mockReturnValue({
    path: ['node-1', 'node-2'],
    edges: ['edge-1'],
    totalWeight: 50,
    totalDistance: 50,
    hopCount: 1,
  } as PathResult),
  kShortestPaths: vi.fn().mockReturnValue([
    {
      path: ['node-1', 'node-2'],
      edges: ['edge-1'],
      totalWeight: 50,
      totalDistance: 50,
      hopCount: 1,
    },
  ] as PathResult[]),
  findEdgeDisjointPaths: vi.fn().mockReturnValue([
    {
      path: ['node-1', 'node-2'],
      edges: ['edge-1'],
      totalWeight: 50,
      totalDistance: 50,
      hopCount: 1,
    },
    {
      path: ['node-1', 'node-3', 'node-2'],
      edges: ['edge-2', 'edge-3'],
      totalWeight: 80,
      totalDistance: 80,
      hopCount: 2,
    },
  ] as PathResult[]),
});

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

describe('Utility Functions', () => {
  describe('isDataRateSufficient', () => {
    it('should return true when available equals required', () => {
      expect(isDataRateSufficient('100G', '100G')).toBe(true);
    });

    it('should return true when available exceeds required', () => {
      expect(isDataRateSufficient('400G', '100G')).toBe(true);
      expect(isDataRateSufficient('100G', '10G')).toBe(true);
    });

    it('should return false when available is less than required', () => {
      expect(isDataRateSufficient('10G', '100G')).toBe(false);
      expect(isDataRateSufficient('25G', '400G')).toBe(false);
    });
  });

  describe('getDataRateValue', () => {
    it('should return correct numeric values', () => {
      expect(getDataRateValue('10G')).toBe(10);
      expect(getDataRateValue('25G')).toBe(25);
      expect(getDataRateValue('100G')).toBe(100);
      expect(getDataRateValue('200G')).toBe(200);
      expect(getDataRateValue('400G')).toBe(400);
    });
  });
});

// ============================================================================
// SERVICE MANAGER TESTS
// ============================================================================

describe('ServiceManager', () => {
  let manager: ServiceManager;
  let topologyProvider: TopologyProvider;
  let serviceProvider: ServiceProvider;
  let pathFinderProvider: PathFinderProvider;

  const node1 = createMockNode({ id: 'node-1', name: 'Node 1' });
  const node2 = createMockNode({
    id: 'node-2',
    name: 'Node 2',
    ports: [
      createMockPort({ id: 'port-3', name: 'DWDM-1' }),
      createMockPort({ id: 'port-4', name: 'DWDM-2' }),
    ],
  });
  const edge1 = createMockEdge({
    id: 'edge-1',
    source: { nodeId: 'node-1', portId: 'port-1' },
    target: { nodeId: 'node-2', portId: 'port-3' },
    properties: { distance: 50, srlgCodes: ['SRLG-A'] },
  });
  const edge2 = createMockEdge({
    id: 'edge-2',
    source: { nodeId: 'node-1', portId: 'port-2' },
    target: { nodeId: 'node-2', portId: 'port-4' },
    properties: { distance: 60, srlgCodes: ['SRLG-B'] },
  });

  beforeEach(() => {
    topologyProvider = createMockTopologyProvider([node1, node2], [edge1, edge2]);
    serviceProvider = createMockServiceProvider([]);
    pathFinderProvider = createMockPathFinderProvider();
    manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);
  });

  // ==========================================================================
  // L1 SERVICE VALIDATION
  // ==========================================================================

  describe('validateL1Service', () => {
    const validL1Config: L1ServiceConfig = {
      name: 'Test L1 Service',
      sourceNodeId: 'node-1',
      sourcePortId: 'port-1',
      destinationNodeId: 'node-2',
      destinationPortId: 'port-3',
      dataRate: '100G',
      modulationType: 'DP-QPSK',
      channelWidth: '50GHz',
      wavelengthMode: 'continuous',
      protectionScheme: 'none',
      restorationEnabled: false,
      pathOptions: {
        mode: 'shortest-path',
        weightAttribute: 'distance',
      },
    };

    it('should validate a correct L1 service configuration', () => {
      const result = manager.validateL1Service(validL1Config);
      expect(result.valid).toBe(true);
      expect(result.messages).toHaveLength(0);
    });

    it('should fail validation when source node not found', () => {
      const config = { ...validL1Config, sourceNodeId: 'nonexistent' };
      const result = manager.validateL1Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'NODE_NOT_FOUND')).toBe(true);
    });

    it('should fail validation when destination node not found', () => {
      const config = { ...validL1Config, destinationNodeId: 'nonexistent' };
      const result = manager.validateL1Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'NODE_NOT_FOUND')).toBe(true);
    });

    it('should fail validation when source equals destination', () => {
      const config = { ...validL1Config, destinationNodeId: 'node-1' };
      const result = manager.validateL1Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'SAME_ENDPOINT')).toBe(true);
    });

    it('should fail validation when source port not found', () => {
      const config = { ...validL1Config, sourcePortId: 'nonexistent' };
      const result = manager.validateL1Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'PORT_NOT_FOUND')).toBe(true);
    });

    it('should fail validation when port is not DWDM type', () => {
      const config = { ...validL1Config, sourcePortId: 'port-3' }; // BW port
      const result = manager.validateL1Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'INVALID_PORT_TYPE')).toBe(true);
    });

    it('should warn when source port is already in use', () => {
      const nodeWithUsedPort = createMockNode({
        id: 'node-1',
        ports: [createMockPort({ id: 'port-1', status: 'used' })],
      });
      topologyProvider = createMockTopologyProvider([nodeWithUsedPort, node2], [edge1]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const result = manager.validateL1Service(validL1Config);

      expect(result.messages.some((m) => m.code === 'PORT_IN_USE')).toBe(true);
      // Should still be valid (warning, not error)
      expect(result.messages.every((m) => m.severity !== 'error')).toBe(true);
    });

    it('should fail validation when name is empty', () => {
      const config = { ...validL1Config, name: '' };
      const result = manager.validateL1Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'NAME_REQUIRED')).toBe(true);
    });

    it('should warn when WSON scheme selected but restoration not enabled', () => {
      const config = {
        ...validL1Config,
        protectionScheme: 'wson-restoration' as const,
        restorationEnabled: false,
      };
      const result = manager.validateL1Service(config);

      expect(result.messages.some((m) => m.code === 'RESTORATION_MISMATCH')).toBe(true);
    });
  });

  // ==========================================================================
  // L2/L3 SERVICE VALIDATION
  // ==========================================================================

  describe('validateL2L3Service', () => {
    const l1Service = createMockL1Service();

    const validL2Config: L2L3ServiceConfig = {
      name: 'Test L2 Service',
      type: 'l2-ethernet',
      sourceNodeId: 'node-1',
      sourcePortId: 'port-1',
      destinationNodeId: 'node-2',
      destinationPortId: 'port-3',
      dataRate: '10G',
      underlayServiceId: 'L1-001',
      autoCreateUnderlay: false,
      protectionScheme: 'none',
      bfdConfig: {
        enabled: false,
        minTxInterval: 300000,
        minRxInterval: 300000,
        multiplier: 3,
      },
    };

    beforeEach(() => {
      serviceProvider = createMockServiceProvider([l1Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);
    });

    it('should validate a correct L2 service configuration', () => {
      const result = manager.validateL2L3Service(validL2Config);
      expect(result.valid).toBe(true);
    });

    it('should fail validation when underlay not found', () => {
      const config = { ...validL2Config, underlayServiceId: 'nonexistent' };
      const result = manager.validateL2L3Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'UNDERLAY_NOT_FOUND')).toBe(true);
    });

    it('should fail validation when no underlay and auto-create disabled', () => {
      const config = {
        ...validL2Config,
        underlayServiceId: undefined,
        autoCreateUnderlay: false,
      };
      const result = manager.validateL2L3Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'UNDERLAY_REQUIRED')).toBe(true);
    });

    it('should pass validation when no underlay but auto-create enabled', () => {
      const config = {
        ...validL2Config,
        underlayServiceId: undefined,
        autoCreateUnderlay: true,
      };
      const result = manager.validateL2L3Service(config);

      // Should not have UNDERLAY_REQUIRED error
      expect(result.messages.every((m) => m.code !== 'UNDERLAY_REQUIRED')).toBe(true);
    });

    it('should fail validation when underlay capacity insufficient', () => {
      const lowCapacityL1 = createMockL1Service({ dataRate: '10G' });
      serviceProvider = createMockServiceProvider([lowCapacityL1]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const config = { ...validL2Config, dataRate: '100G' as const };
      const result = manager.validateL2L3Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'INSUFFICIENT_CAPACITY')).toBe(true);
    });

    it('should warn when underlay is not active', () => {
      const inactiveL1 = createMockL1Service({ status: 'planned' });
      serviceProvider = createMockServiceProvider([inactiveL1]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const result = manager.validateL2L3Service(validL2Config);

      expect(result.messages.some((m) => m.code === 'UNDERLAY_NOT_ACTIVE')).toBe(true);
    });

    it('should fail when protection underlay same as working underlay', () => {
      const config = {
        ...validL2Config,
        protectionUnderlayServiceId: 'L1-001', // Same as underlayServiceId
      };
      const result = manager.validateL2L3Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'SAME_UNDERLAY')).toBe(true);
    });

    it('should fail validation when BFD multiplier out of range', () => {
      const config = {
        ...validL2Config,
        bfdConfig: {
          enabled: true,
          minTxInterval: 300000,
          minRxInterval: 300000,
          multiplier: 300, // Invalid
        },
      };
      const result = manager.validateL2L3Service(config);

      expect(result.valid).toBe(false);
      expect(result.messages.some((m) => m.code === 'BFD_MULTIPLIER_INVALID')).toBe(true);
    });

    it('should warn when BFD TX interval very low', () => {
      const config = {
        ...validL2Config,
        bfdConfig: {
          enabled: true,
          minTxInterval: 500, // Very low
          minRxInterval: 300000,
          multiplier: 3,
        },
      };
      const result = manager.validateL2L3Service(config);

      expect(result.messages.some((m) => m.code === 'BFD_TX_TOO_LOW')).toBe(true);
    });
  });

  // ==========================================================================
  // PATH COMPUTATION
  // ==========================================================================

  describe('computeWorkingPath', () => {
    it('should compute shortest path', () => {
      const path = manager.computeWorkingPath('node-1', 'node-2', {
        mode: 'shortest-path',
        weightAttribute: 'distance',
      });

      expect(path).not.toBeNull();
      expect(path?.nodeIds).toEqual(['node-1', 'node-2']);
      expect(path?.edgeIds).toEqual(['edge-1']);
      expect(path?.type).toBe('working');
      expect(path?.status).toBe('computed');
      expect(pathFinderProvider.shortestPath).toHaveBeenCalled();
    });

    it('should compute k-shortest paths and return first', () => {
      const path = manager.computeWorkingPath('node-1', 'node-2', {
        mode: 'k-shortest',
        weightAttribute: 'distance',
        k: 3,
      });

      expect(path).not.toBeNull();
      expect(pathFinderProvider.kShortestPaths).toHaveBeenCalledWith(
        'node-1',
        'node-2',
        3,
        expect.any(Object)
      );
    });

    it('should compute edge-disjoint path', () => {
      const path = manager.computeWorkingPath('node-1', 'node-2', {
        mode: 'edge-disjoint',
        weightAttribute: 'distance',
      });

      expect(path).not.toBeNull();
      expect(pathFinderProvider.findEdgeDisjointPaths).toHaveBeenCalled();
    });

    it('should return null for manual mode', () => {
      const path = manager.computeWorkingPath('node-1', 'node-2', {
        mode: 'manual',
        weightAttribute: 'distance',
      });

      expect(path).toBeNull();
    });

    it('should throw error when PathFinder not configured', () => {
      const managerWithoutPathFinder = new ServiceManager(
        topologyProvider,
        serviceProvider
      );

      expect(() =>
        managerWithoutPathFinder.computeWorkingPath('node-1', 'node-2', {
          mode: 'shortest-path',
          weightAttribute: 'distance',
        })
      ).toThrow('PathFinder not configured');
    });
  });

  describe('computeProtectionPath', () => {
    it('should compute protection path avoiding working path edges', () => {
      const workingPath = createMockServicePath({
        edgeIds: ['edge-1'],
      });

      const path = manager.computeProtectionPath('node-1', 'node-2', workingPath, {
        mode: 'shortest-path',
        weightAttribute: 'distance',
      });

      expect(path).not.toBeNull();
      expect(path?.type).toBe('protection');
    });
  });

  // ==========================================================================
  // SRLG ANALYSIS
  // ==========================================================================

  describe('getPathSRLGs', () => {
    it('should return all SRLGs for edges in path', () => {
      const srlgs = manager.getPathSRLGs(['edge-1', 'edge-2']);

      expect(srlgs).toContain('SRLG-A');
      expect(srlgs).toContain('SRLG-B');
      expect(srlgs).toHaveLength(2);
    });

    it('should return empty array for edges without SRLGs', () => {
      const edgeWithoutSRLG = createMockEdge({
        id: 'edge-no-srlg',
        properties: { distance: 50 },
      });
      topologyProvider = createMockTopologyProvider([node1, node2], [edgeWithoutSRLG]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const srlgs = manager.getPathSRLGs(['edge-no-srlg']);
      expect(srlgs).toHaveLength(0);
    });

    it('should handle non-existent edges gracefully', () => {
      const srlgs = manager.getPathSRLGs(['nonexistent-edge']);
      expect(srlgs).toHaveLength(0);
    });
  });

  describe('analyzeSRLGRisk', () => {
    it('should detect shared SRLGs between paths', () => {
      const edge3 = createMockEdge({
        id: 'edge-3',
        properties: { distance: 70, srlgCodes: ['SRLG-A'] }, // Same SRLG as edge-1
      });
      topologyProvider = createMockTopologyProvider([node1, node2], [edge1, edge2, edge3]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const workingPath = createMockServicePath({
        edgeIds: ['edge-1'],
        totalDistance: 50,
      });
      const protectionPath = createMockServicePath({
        type: 'protection',
        edgeIds: ['edge-3'],
        totalDistance: 70,
      });

      const analysis = manager.analyzeSRLGRisk(workingPath, protectionPath);

      expect(analysis.sharedSRLGCodes).toContain('SRLG-A');
      expect(analysis.sharedEdgeIds).toContain('edge-3');
      expect(analysis.riskScore).toBeGreaterThan(0);
      expect(analysis.warnings.length).toBeGreaterThan(0);
    });

    it('should return zero risk for fully diverse paths', () => {
      const workingPath = createMockServicePath({
        edgeIds: ['edge-1'],
        totalDistance: 50,
      });
      const protectionPath = createMockServicePath({
        type: 'protection',
        edgeIds: ['edge-2'],
        totalDistance: 60,
      });

      const analysis = manager.analyzeSRLGRisk(workingPath, protectionPath);

      expect(analysis.sharedSRLGCodes).toHaveLength(0);
      expect(analysis.sharedEdgeIds).toHaveLength(0);
      expect(analysis.riskScore).toBe(0);
    });

    it('should calculate shared distance correctly', () => {
      const edge3 = createMockEdge({
        id: 'edge-3',
        properties: { distance: 30, srlgCodes: ['SRLG-A'] },
      });
      topologyProvider = createMockTopologyProvider([node1, node2], [edge1, edge3]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const workingPath = createMockServicePath({
        edgeIds: ['edge-1'],
        totalDistance: 50,
      });
      const protectionPath = createMockServicePath({
        type: 'protection',
        edgeIds: ['edge-3'],
        totalDistance: 30,
      });

      const analysis = manager.analyzeSRLGRisk(workingPath, protectionPath);

      expect(analysis.sharedDistanceKm).toBe(30);
    });
  });

  // ==========================================================================
  // DEPENDENCY MANAGEMENT
  // ==========================================================================

  describe('canDeleteService', () => {
    it('should allow deletion of L1 service with no dependents', () => {
      const l1Service = createMockL1Service();
      serviceProvider = createMockServiceProvider([l1Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const result = manager.canDeleteService('L1-001');

      expect(result.canDelete).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('should block deletion of L1 service with dependent L2 service', () => {
      const l1Service = createMockL1Service();
      const l2Service: L2L3Service = {
        id: 'L2-001',
        name: 'Dependent L2',
        type: 'l2-ethernet',
        status: 'active',
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '10G',
        underlayServiceId: 'L1-001',
        underlayAutoCreated: false,
        protectionScheme: 'none',
        bfdConfig: {
          enabled: false,
          minTxInterval: 300000,
          minRxInterval: 300000,
          multiplier: 3,
        },
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        metadata: {},
      };
      serviceProvider = createMockServiceProvider([l1Service, l2Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const result = manager.canDeleteService('L1-001');

      expect(result.canDelete).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers[0]).toContain('L2-001');
    });

    it('should always allow deletion of L2/L3 services', () => {
      const l2Service: L2L3Service = {
        id: 'L2-001',
        name: 'L2 Service',
        type: 'l2-ethernet',
        status: 'active',
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '10G',
        underlayServiceId: 'L1-001',
        underlayAutoCreated: false,
        protectionScheme: 'none',
        bfdConfig: {
          enabled: false,
          minTxInterval: 300000,
          minRxInterval: 300000,
          multiplier: 3,
        },
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        metadata: {},
      };
      serviceProvider = createMockServiceProvider([l2Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const result = manager.canDeleteService('L2-001');

      expect(result.canDelete).toBe(true);
    });

    it('should handle non-existent service', () => {
      const result = manager.canDeleteService('nonexistent');

      expect(result.canDelete).toBe(false);
      expect(result.blockers).toContain('Service not found');
    });
  });

  describe('getServicesUsingNode', () => {
    it('should find services using node as endpoint', () => {
      const l1Service = createMockL1Service();
      serviceProvider = createMockServiceProvider([l1Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const services = manager.getServicesUsingNode('node-1');

      expect(services).toHaveLength(1);
      expect(services[0].id).toBe('L1-001');
    });

    it('should find services using node in path', () => {
      const l1Service = createMockL1Service({
        workingPath: createMockServicePath({
          nodeIds: ['node-1', 'node-3', 'node-2'],
        }),
      });
      serviceProvider = createMockServiceProvider([l1Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const services = manager.getServicesUsingNode('node-3');

      expect(services).toHaveLength(1);
    });

    it('should return empty for unused node', () => {
      const l1Service = createMockL1Service();
      serviceProvider = createMockServiceProvider([l1Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const services = manager.getServicesUsingNode('unused-node');

      expect(services).toHaveLength(0);
    });
  });

  describe('getServicesUsingEdge', () => {
    it('should find services using edge in working path', () => {
      const l1Service = createMockL1Service();
      serviceProvider = createMockServiceProvider([l1Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const services = manager.getServicesUsingEdge('edge-1');

      expect(services).toHaveLength(1);
    });

    it('should find services using edge in protection path', () => {
      const l1Service = createMockL1Service({
        protectionPath: createMockServicePath({
          type: 'protection',
          edgeIds: ['edge-2'],
        }),
      });
      serviceProvider = createMockServiceProvider([l1Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const services = manager.getServicesUsingEdge('edge-2');

      expect(services).toHaveLength(1);
    });

    it('should return empty for unused edge', () => {
      const l1Service = createMockL1Service();
      serviceProvider = createMockServiceProvider([l1Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const services = manager.getServicesUsingEdge('unused-edge');

      expect(services).toHaveLength(0);
    });
  });

  describe('findCompatibleL1Services', () => {
    it('should find compatible L1 services between endpoints', () => {
      const l1Service = createMockL1Service();
      serviceProvider = createMockServiceProvider([l1Service]);
      manager = new ServiceManager(topologyProvider, serviceProvider, pathFinderProvider);

      const services = manager.findCompatibleL1Services('node-1', 'node-2', '10G');

      expect(services).toHaveLength(1);
    });
  });
});
