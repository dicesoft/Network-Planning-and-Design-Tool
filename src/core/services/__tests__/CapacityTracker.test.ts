import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapacityTracker,
  type CapacityDataProvider,
  createCapacityTracker,
  createStoreDataProvider,
} from '../CapacityTracker';
import type { NetworkNode, NetworkEdge, Port } from '@/types/network';
import type { Service, L1DWDMService, ServicePath } from '@/types/service';
import type { ChannelAllocation, PortSpectrum } from '@/types/spectrum';
import { userToItuChannel } from '@/core/spectrum/channelConfig';

// ============================================================================
// MOCK DATA FACTORIES
// ============================================================================

const createMockPort = (overrides: Partial<Port> = {}): Port => ({
  id: 'port-1',
  name: 'DWDM-1',
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
  ],
  metadata: {},
  ...overrides,
});

const createMockEdge = (overrides: Partial<NetworkEdge> = {}): NetworkEdge => ({
  id: 'edge-1',
  name: 'Edge 1',
  type: 'fiber',
  source: { nodeId: 'node-1', portId: 'port-1' },
  target: { nodeId: 'node-2', portId: 'port-1' },
  properties: { distance: 50 },
  state: 'active',
  metadata: {},
  ...overrides,
});

const createMockSpectrum = (allocatedUserChannels: number[] = []): PortSpectrum => ({
  gridType: 'fixed-50ghz',
  allocations: allocatedUserChannels.map(
    (userCh, idx): ChannelAllocation => ({
      id: `alloc-${idx}`,
      channelNumber: userToItuChannel(userCh, 'fixed-50ghz'),
      status: 'allocated',
    })
  ),
});

const createMockPath = (overrides: Partial<ServicePath> = {}): ServicePath => ({
  id: 'path-1',
  type: 'working',
  nodeIds: ['node-1', 'node-2'],
  edgeIds: ['edge-1'],
  totalDistance: 50,
  hopCount: 1,
  status: 'active',
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
  destinationPortId: 'port-1',
  dataRate: '100G',
  modulationType: 'DP-QPSK',
  channelWidth: '50GHz',
  wavelengthMode: 'continuous',
  channelNumber: 1,
  workingPath: createMockPath({
    channelNumber: 1,
    status: 'active',
  }),
  protectionScheme: 'none',
  restorationEnabled: false,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  metadata: {},
  ...overrides,
});

// ============================================================================
// TEST DATA PROVIDER
// ============================================================================

class MockDataProvider implements CapacityDataProvider {
  nodes: NetworkNode[] = [];
  edges: NetworkEdge[] = [];
  services: Service[] = [];

  getNode(id: string): NetworkNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  getEdge(id: string): NetworkEdge | undefined {
    return this.edges.find((e) => e.id === id);
  }

  getEdges(): NetworkEdge[] {
    return this.edges;
  }

  getNodes(): NetworkNode[] {
    return this.nodes;
  }

  getServices(): Service[] {
    return this.services;
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('CapacityTracker', () => {
  let provider: MockDataProvider;
  let tracker: CapacityTracker;

  beforeEach(() => {
    provider = new MockDataProvider();
    tracker = new CapacityTracker(provider);
  });

  // ========================================================================
  // EDGE UTILIZATION
  // ========================================================================

  describe('getEdgeUtilization', () => {
    it('should return 0% for an edge with no allocated channels', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1', ports: [createMockPort({ id: 'port-1' })] }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-2' })] }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const util = tracker.getEdgeUtilization('edge-1');
      expect(util.total).toBe(96);
      expect(util.used).toBe(0);
      expect(util.available).toBe(96);
      expect(util.percentage).toBe(0);
    });

    it('should reflect port spectrum allocations', () => {
      const allocatedChannels = [1, 2, 3, 4, 5];
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum(allocatedChannels) })],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-2' })] }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const util = tracker.getEdgeUtilization('edge-1');
      expect(util.used).toBe(5);
      expect(util.available).toBe(91);
      expect(util.percentage).toBe(5);
    });

    it('should return empty utilization for nonexistent edge', () => {
      const util = tracker.getEdgeUtilization('nonexistent');
      expect(util.total).toBe(96);
      expect(util.used).toBe(96); // All channels unavailable since edge not found
    });

    it('should combine allocations from both source and target ports', () => {
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum([1, 2, 3]) })],
        }),
        createMockNode({
          id: 'node-2',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum([4, 5, 6]) })],
        }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const util = tracker.getEdgeUtilization('edge-1');
      expect(util.used).toBe(6);
      expect(util.available).toBe(90);
    });
  });

  describe('getAllEdgeUtilization', () => {
    it('should return utilization for all edges', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
        createMockNode({ id: 'node-3' }),
      ];
      provider.edges = [
        createMockEdge({ id: 'edge-1', source: { nodeId: 'node-1', portId: 'port-1' }, target: { nodeId: 'node-2', portId: 'port-1' } }),
        createMockEdge({ id: 'edge-2', source: { nodeId: 'node-2', portId: 'port-2' }, target: { nodeId: 'node-3', portId: 'port-1' } }),
      ];

      const allUtil = tracker.getAllEdgeUtilization();
      expect(allUtil.size).toBe(2);
      expect(allUtil.has('edge-1')).toBe(true);
      expect(allUtil.has('edge-2')).toBe(true);
    });

    it('should return empty map when no edges exist', () => {
      const allUtil = tracker.getAllEdgeUtilization();
      expect(allUtil.size).toBe(0);
    });
  });

  describe('getNetworkUtilization', () => {
    it('should return 0 when no edges exist', () => {
      expect(tracker.getNetworkUtilization()).toBe(0);
    });

    it('should calculate average utilization across all edges', () => {
      const alloc10 = Array.from({ length: 10 }, (_, i) => i + 1);
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum(alloc10) }), createMockPort({ id: 'port-2' })],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' }), createMockPort({ id: 'port-2' })] }),
        createMockNode({ id: 'node-3', ports: [createMockPort({ id: 'port-1' })] }),
      ];
      provider.edges = [
        createMockEdge({ id: 'edge-1', source: { nodeId: 'node-1', portId: 'port-1' }, target: { nodeId: 'node-2', portId: 'port-1' } }),
        createMockEdge({ id: 'edge-2', source: { nodeId: 'node-2', portId: 'port-2' }, target: { nodeId: 'node-3', portId: 'port-1' } }),
      ];

      // Edge-1 has 10 allocated channels, Edge-2 has 0
      // Total: 10/192 = ~5.2% → rounds to 5
      const util = tracker.getNetworkUtilization();
      expect(util).toBe(5);
    });
  });

  // ========================================================================
  // NODE UTILIZATION
  // ========================================================================

  describe('getNodeUtilization', () => {
    it('should return zeroes for nonexistent node', () => {
      const util = tracker.getNodeUtilization('nonexistent');
      expect(util.totalPorts).toBe(0);
      expect(util.usedPorts).toBe(0);
      expect(util.portUtilizationPercent).toBe(0);
    });

    it('should count port types correctly', () => {
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [
            createMockPort({ id: 'port-1', type: 'dwdm', status: 'used' }),
            createMockPort({ id: 'port-2', type: 'dwdm', status: 'available' }),
            createMockPort({ id: 'port-3', type: 'bw', name: 'Eth-1', dataRate: '10G', channels: 1, status: 'used' }),
            createMockPort({ id: 'port-4', type: 'bw', name: 'Eth-2', dataRate: '10G', channels: 1, status: 'available' }),
          ],
        }),
      ];

      const util = tracker.getNodeUtilization('node-1');
      expect(util.totalPorts).toBe(4);
      expect(util.usedPorts).toBe(2);
      expect(util.availablePorts).toBe(2);
      expect(util.portUtilizationPercent).toBe(50);
      expect(util.dwdmPorts).toBe(2);
      expect(util.dwdmPortsUsed).toBe(1);
      expect(util.bwPorts).toBe(2);
      expect(util.bwPortsUsed).toBe(1);
    });

    it('should count connectedEdgeId as used', () => {
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [
            createMockPort({ id: 'port-1', status: 'available', connectedEdgeId: 'edge-1' }),
            createMockPort({ id: 'port-2', status: 'available' }),
          ],
        }),
      ];

      const util = tracker.getNodeUtilization('node-1');
      expect(util.usedPorts).toBe(1);
    });

    it('should handle node with no ports', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1', ports: [] }),
      ];

      const util = tracker.getNodeUtilization('node-1');
      expect(util.totalPorts).toBe(0);
      expect(util.portUtilizationPercent).toBe(0);
    });
  });

  describe('getAllNodeUtilization', () => {
    it('should return utilization for all nodes', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];

      const allUtil = tracker.getAllNodeUtilization();
      expect(allUtil.size).toBe(2);
      expect(allUtil.has('node-1')).toBe(true);
      expect(allUtil.has('node-2')).toBe(true);
    });
  });

  // ========================================================================
  // LAMBDA ANALYSIS
  // ========================================================================

  describe('getLambdaUsage', () => {
    it('should return full availability for edge with no allocations', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const usage = tracker.getLambdaUsage('edge-1');
      expect(usage.total).toBe(96);
      expect(usage.used).toBe(0);
      expect(usage.available).toBe(96);
      expect(usage.reserved).toBe(0);
      expect(usage.fragmentationIndex).toBe(0);
    });

    it('should track allocated channels', () => {
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum([1, 2, 3, 50, 51]) })],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' })] }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const usage = tracker.getLambdaUsage('edge-1');
      expect(usage.used).toBeGreaterThanOrEqual(5);
      expect(usage.available).toBeLessThanOrEqual(91);
    });

    it('should compute fragmentation index', () => {
      // Allocate channels 1-3 and 50-52 (gap in between → fragmented)
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum([1, 2, 3, 50, 51, 52]) })],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' })] }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const usage = tracker.getLambdaUsage('edge-1');
      // Free space is fragmented (two blocks: 4-49 and 53-96)
      // Largest contiguous block is 44 (channels 53-96), total free = 90
      // Fragmentation = 1 - (44/90) ≈ 0.51
      expect(usage.fragmentationIndex).toBeGreaterThan(0);
      expect(usage.fragmentationIndex).toBeLessThan(1);
    });
  });

  describe('getAvailableLambdas', () => {
    it('should return all 96 channels when nothing allocated', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const available = tracker.getAvailableLambdas('edge-1');
      expect(available.length).toBe(96);
    });

    it('should exclude allocated channels', () => {
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum([1, 2, 3]) })],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' })] }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const available = tracker.getAvailableLambdas('edge-1');
      expect(available.length).toBe(93);
      expect(available).not.toContain(1);
      expect(available).not.toContain(2);
      expect(available).not.toContain(3);
    });
  });

  describe('getLambdaMap', () => {
    it('should return 96 entries', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const map = tracker.getLambdaMap('edge-1');
      expect(map.length).toBe(96);
    });

    it('should mark all channels as free when nothing allocated', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const map = tracker.getLambdaMap('edge-1');
      const freeCount = map.filter((e) => e.status === 'free').length;
      expect(freeCount).toBe(96);
    });

    it('should track service allocations on lambda map', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];
      provider.services = [
        createMockL1Service({
          id: 'L1-001',
          workingPath: createMockPath({
            edgeIds: ['edge-1'],
            channelNumber: 5,
            status: 'active',
          }),
        }),
      ];

      const map = tracker.getLambdaMap('edge-1');
      const ch5 = map.find((e) => e.channelNumber === 5);
      expect(ch5?.status).toBe('allocated');
      expect(ch5?.serviceId).toBe('L1-001');
    });

    it('should mark reserved channels for computed paths', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];
      provider.services = [
        createMockL1Service({
          id: 'L1-002',
          status: 'planned',
          workingPath: createMockPath({
            edgeIds: ['edge-1'],
            channelNumber: 10,
            status: 'computed',
          }),
        }),
      ];

      const map = tracker.getLambdaMap('edge-1');
      const ch10 = map.find((e) => e.channelNumber === 10);
      expect(ch10?.status).toBe('reserved');
    });
  });

  // ========================================================================
  // BOTTLENECK DETECTION
  // ========================================================================

  describe('findBottlenecks', () => {
    it('should return empty when no edges exceed threshold', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const bottlenecks = tracker.findBottlenecks(80);
      expect(bottlenecks.length).toBe(0);
    });

    it('should find edges above default 80% threshold', () => {
      // Allocate 80 of 96 channels (~83%)
      const alloc80 = Array.from({ length: 80 }, (_, i) => i + 1);
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum(alloc80) })],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' })] }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const bottlenecks = tracker.findBottlenecks();
      expect(bottlenecks.length).toBe(1);
      expect(bottlenecks[0].edgeId).toBe('edge-1');
      expect(bottlenecks[0].utilization.percentage).toBeGreaterThanOrEqual(80);
    });

    it('should support custom threshold', () => {
      const alloc50 = Array.from({ length: 50 }, (_, i) => i + 1);
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum(alloc50) })],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' })] }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      // 50% threshold → should find it
      expect(tracker.findBottlenecks(50).length).toBe(1);
      // 60% threshold → should NOT find it
      expect(tracker.findBottlenecks(60).length).toBe(0);
    });

    it('should sort bottlenecks by utilization descending', () => {
      const alloc90 = Array.from({ length: 90 }, (_, i) => i + 1);
      const alloc80 = Array.from({ length: 80 }, (_, i) => i + 1);

      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [
            createMockPort({ id: 'port-1', spectrum: createMockSpectrum(alloc90) }),
            createMockPort({ id: 'port-2', spectrum: createMockSpectrum(alloc80) }),
          ],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' }), createMockPort({ id: 'port-2' })] }),
      ];
      provider.edges = [
        createMockEdge({ id: 'edge-1', source: { nodeId: 'node-1', portId: 'port-2' }, target: { nodeId: 'node-2', portId: 'port-1' } }),
        createMockEdge({ id: 'edge-2', source: { nodeId: 'node-1', portId: 'port-1' }, target: { nodeId: 'node-2', portId: 'port-2' } }),
      ];

      const bottlenecks = tracker.findBottlenecks(80);
      expect(bottlenecks.length).toBe(2);
      expect(bottlenecks[0].utilization.percentage).toBeGreaterThanOrEqual(
        bottlenecks[1].utilization.percentage
      );
    });
  });

  describe('getOversubscribedEdges', () => {
    it('should return empty when no edges at 100%', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      expect(tracker.getOversubscribedEdges().length).toBe(0);
    });

    it('should find fully utilized edges', () => {
      const alloc96 = Array.from({ length: 96 }, (_, i) => i + 1);
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum(alloc96) })],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' })] }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const oversubscribed = tracker.getOversubscribedEdges();
      expect(oversubscribed.length).toBe(1);
      expect(oversubscribed[0].utilization.percentage).toBe(100);
    });
  });

  // ========================================================================
  // WHAT-IF SIMULATION
  // ========================================================================

  describe('simulateServiceAddition', () => {
    it('should report feasible when capacity exists', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const result = tracker.simulateServiceAddition({
        edgeIds: ['edge-1'],
        channelsRequired: 1,
      });

      expect(result.feasible).toBe(true);
      expect(result.affectedEdges.length).toBe(1);
      expect(result.affectedEdges[0].delta).toBeGreaterThan(0);
    });

    it('should report infeasible when capacity exceeded', () => {
      const alloc96 = Array.from({ length: 96 }, (_, i) => i + 1);
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum(alloc96) })],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' })] }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const result = tracker.simulateServiceAddition({
        edgeIds: ['edge-1'],
        channelsRequired: 1,
      });

      expect(result.feasible).toBe(false);
      expect(result.reason).toContain('exceed capacity');
    });

    it('should default to 1 channel required', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const result = tracker.simulateServiceAddition({ edgeIds: ['edge-1'] });
      expect(result.feasible).toBe(true);
      expect(result.affectedEdges[0].after.used).toBe(result.affectedEdges[0].before.used + 1);
    });

    it('should handle multiple channels required', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];

      const result = tracker.simulateServiceAddition({
        edgeIds: ['edge-1'],
        channelsRequired: 10,
      });

      expect(result.feasible).toBe(true);
      expect(result.affectedEdges[0].after.used).toBe(10);
    });

    it('should show network-wide utilization change', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1' }),
        createMockNode({ id: 'node-2' }),
        createMockNode({ id: 'node-3' }),
      ];
      provider.edges = [
        createMockEdge({ id: 'edge-1' }),
        createMockEdge({ id: 'edge-2', source: { nodeId: 'node-2', portId: 'port-2' }, target: { nodeId: 'node-3', portId: 'port-1' } }),
      ];

      const result = tracker.simulateServiceAddition({
        edgeIds: ['edge-1'],
        channelsRequired: 1,
      });

      expect(result.networkUtilizationDelta).toBeGreaterThanOrEqual(0);
    });
  });

  describe('simulateServiceRemoval', () => {
    it('should return infeasible for nonexistent service', () => {
      const result = tracker.simulateServiceRemoval('nonexistent');
      expect(result.feasible).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should show capacity freed on service removal', () => {
      provider.nodes = [
        createMockNode({
          id: 'node-1',
          ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum([1]) })],
        }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' })] }),
      ];
      provider.edges = [createMockEdge({ id: 'edge-1' })];
      provider.services = [
        createMockL1Service({
          id: 'L1-001',
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 1, status: 'active' }),
        }),
      ];

      const result = tracker.simulateServiceRemoval('L1-001');
      expect(result.feasible).toBe(true);
      expect(result.affectedEdges.length).toBe(1);
      expect(result.affectedEdges[0].delta).toBeLessThan(0);
    });

    it('should account for protection path edges too', () => {
      provider.nodes = [
        createMockNode({ id: 'node-1', ports: [createMockPort({ id: 'port-1', spectrum: createMockSpectrum([1, 2]) })] }),
        createMockNode({ id: 'node-2', ports: [createMockPort({ id: 'port-1' }), createMockPort({ id: 'port-2' })] }),
        createMockNode({ id: 'node-3', ports: [createMockPort({ id: 'port-1' })] }),
      ];
      provider.edges = [
        createMockEdge({ id: 'edge-1' }),
        createMockEdge({ id: 'edge-2', source: { nodeId: 'node-1', portId: 'port-2' }, target: { nodeId: 'node-3', portId: 'port-1' } }),
      ];
      provider.services = [
        createMockL1Service({
          id: 'L1-001',
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 1, status: 'active' }),
          protectionPath: createMockPath({
            id: 'prot-1',
            type: 'protection',
            edgeIds: ['edge-2'],
            channelNumber: 2,
            status: 'active',
          }),
          protectionScheme: 'olp',
        }),
      ];

      const result = tracker.simulateServiceRemoval('L1-001');
      expect(result.affectedEdges.length).toBe(2);
    });
  });

  // ========================================================================
  // FACTORY FUNCTIONS
  // ========================================================================

  describe('createCapacityTracker', () => {
    it('should create a CapacityTracker instance', () => {
      const tracker = createCapacityTracker(provider);
      expect(tracker).toBeInstanceOf(CapacityTracker);
    });
  });

  // ========================================================================
  // WHAT-IF: Full Network Net Change (T051 — contract test matrix)
  // ========================================================================

  describe('simulateServiceAdditionWithPath — fullNetworkNetChange', () => {
    /**
     * Build a linear N-edge topology with N+1 nodes wired tip-to-tip.
     * Source ports get pre-allocated spectrum so each edge starts at a known
     * utilization level. Caller supplies the working-path edge list.
     */
    function buildLinearTopology(
      edgeCount: number,
      preAllocatedPerEdge: number[] = []
    ): { workingPath: { nodeIds: string[]; edgeIds: string[]; totalDistance: number; hopCount: number } } {
      const nodes: NetworkNode[] = [];
      const edges: NetworkEdge[] = [];
      for (let i = 0; i <= edgeCount; i++) {
        nodes.push(
          createMockNode({
            id: `n${i}`,
            ports: [
              createMockPort({
                id: 'p-out',
                spectrum: createMockSpectrum(
                  Array.from({ length: preAllocatedPerEdge[i] ?? 0 }, (_, k) => k + 1)
                ),
              }),
              createMockPort({ id: 'p-in' }),
            ],
          })
        );
      }
      for (let i = 0; i < edgeCount; i++) {
        edges.push(
          createMockEdge({
            id: `e${i}`,
            source: { nodeId: `n${i}`, portId: 'p-out' },
            target: { nodeId: `n${i + 1}`, portId: 'p-in' },
          })
        );
      }
      provider.nodes = nodes;
      provider.edges = edges;
      return {
        workingPath: {
          nodeIds: nodes.map((n) => n.id),
          edgeIds: edges.map((e) => e.id),
          totalDistance: 50 * edgeCount,
          hopCount: edgeCount,
        },
      };
    }

    it('Row 1: 23-edge network, 2 affected edges → non-zero summary', () => {
      // Working path traverses 2 edges out of 23, +1 channel each = +1.04% per edge.
      // Average across all 23 edges = 2 * (1/96 * 100) / 23 ≈ 0.0906%
      buildLinearTopology(23);
      const workingPath = {
        nodeIds: ['n0', 'n1', 'n2'],
        edgeIds: ['e0', 'e1'],
        totalDistance: 100,
        hopCount: 2,
      };
      const result = tracker.simulateServiceAdditionWithPath({ workingPath, channelsRequired: 1 });
      expect(result.affectedEdges.length).toBe(2);
      // Should be non-zero (the bug was that this rounded to 0)
      expect(result.networkUtilizationDelta).toBeGreaterThan(0);
      expect(result.networkUtilizationDelta).toBeLessThan(1);
    });

    it('Row 2: 23-edge network, 3 affected edges → non-zero summary', () => {
      buildLinearTopology(23);
      const workingPath = {
        nodeIds: ['n0', 'n1', 'n2', 'n3'],
        edgeIds: ['e0', 'e1', 'e2'],
        totalDistance: 150,
        hopCount: 3,
      };
      const result = tracker.simulateServiceAdditionWithPath({ workingPath, channelsRequired: 1 });
      expect(result.affectedEdges.length).toBe(3);
      expect(result.networkUtilizationDelta).toBeGreaterThan(0);
      expect(result.networkUtilizationDelta).toBeLessThan(1);
    });

    it('Row 3: all edges affected uniformly → integer-formatted summary (≈ +1%)', () => {
      // Single-edge network — adding 1 channel = +1.04%, rounds to integer in display.
      buildLinearTopology(1);
      const workingPath = {
        nodeIds: ['n0', 'n1'],
        edgeIds: ['e0'],
        totalDistance: 50,
        hopCount: 1,
      };
      const result = tracker.simulateServiceAdditionWithPath({ workingPath, channelsRequired: 1 });
      expect(result.affectedEdges.length).toBe(1);
      // delta is ~1.04% — average over 1 edge = ~1.04
      expect(result.networkUtilizationDelta).toBeGreaterThan(0.5);
      expect(result.networkUtilizationDelta).toBeLessThan(2);
    });

    it('Row 4: zero impact (path empty) → exactly zero summary', () => {
      buildLinearTopology(5);
      const workingPath = {
        nodeIds: ['n0'],
        edgeIds: [],
        totalDistance: 0,
        hopCount: 0,
      };
      const result = tracker.simulateServiceAdditionWithPath({ workingPath, channelsRequired: 1 });
      expect(result.affectedEdges.length).toBe(0);
      expect(result.networkUtilizationDelta).toBe(0);
    });

    it('Row 5: cumulative virtual state advances across batch entries', () => {
      // Two services across the same edge — second sim should see the first's
      // allocation in its `before` count.
      buildLinearTopology(3);
      const workingPath = {
        nodeIds: ['n0', 'n1'],
        edgeIds: ['e0'],
        totalDistance: 50,
        hopCount: 1,
      };
      const virtualState = {
        additionalChannelsUsed: new Map<string, Set<number>>(),
        freedChannels: new Map<string, Set<number>>(),
      };
      const r1 = tracker.simulateServiceAdditionWithPath({ workingPath, channelsRequired: 1, virtualState });
      // Apply first allocation to virtual state.
      virtualState.additionalChannelsUsed.set('e0', new Set([0]));
      const r2 = tracker.simulateServiceAdditionWithPath({ workingPath, channelsRequired: 1, virtualState });
      expect(r1.affectedEdges[0].usedBefore).toBe(0);
      expect(r1.affectedEdges[0].usedAfter).toBe(1);
      // Second sim sees prior allocation.
      expect(r2.affectedEdges[0].usedBefore).toBe(1);
      expect(r2.affectedEdges[0].usedAfter).toBe(2);
    });

    it('Row 6: per-edge raw counts populated (FR-014)', () => {
      buildLinearTopology(2, [5, 0]); // edge-0 starts at 5/96 used, edge-1 at 0
      const workingPath = {
        nodeIds: ['n0', 'n1', 'n2'],
        edgeIds: ['e0', 'e1'],
        totalDistance: 100,
        hopCount: 2,
      };
      const result = tracker.simulateServiceAdditionWithPath({ workingPath, channelsRequired: 1 });
      const e0 = result.affectedEdges.find((ae) => ae.edgeId === 'e0')!;
      const e1 = result.affectedEdges.find((ae) => ae.edgeId === 'e1')!;
      expect(e0.usedBefore).toBe(5);
      expect(e0.usedAfter).toBe(6);
      expect(e0.totalChannels).toBe(96);
      expect(e0.channelDelta).toBe(1);
      expect(e1.usedBefore).toBe(0);
      expect(e1.usedAfter).toBe(1);
      expect(e1.channelDelta).toBe(1);
    });
  });

  describe('createStoreDataProvider', () => {
    it('should create a provider that bridges store data', () => {
      const mockNodes = [createMockNode({ id: 'node-1' })];
      const mockEdges = [createMockEdge({ id: 'edge-1' })];
      const mockServices: Service[] = [];

      const dataProvider = createStoreDataProvider(
        () => ({ nodes: mockNodes, edges: mockEdges }),
        () => mockServices
      );

      expect(dataProvider.getNode('node-1')).toBeDefined();
      expect(dataProvider.getEdge('edge-1')).toBeDefined();
      expect(dataProvider.getEdges().length).toBe(1);
      expect(dataProvider.getNodes().length).toBe(1);
      expect(dataProvider.getServices().length).toBe(0);
    });
  });
});
