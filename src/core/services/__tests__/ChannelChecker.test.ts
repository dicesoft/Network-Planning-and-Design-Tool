import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChannelChecker,
  ChannelTopologyProvider,
  DEFAULT_CHANNEL_RANGE,
  createChannelChecker,
} from '../ChannelChecker';
import type { ServicePath } from '@/types/service';
import type { NetworkNode, NetworkEdge, Port } from '@/types/network';
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
  properties: {
    distance: 50,
  },
  state: 'active',
  metadata: {},
  ...overrides,
});

const createMockPath = (overrides: Partial<ServicePath> = {}): ServicePath => ({
  id: 'path-1',
  type: 'working',
  nodeIds: ['node-1', 'node-2'],
  edgeIds: ['edge-1'],
  totalDistance: 50,
  hopCount: 1,
  status: 'computed',
  ...overrides,
});

/**
 * Create mock spectrum with allocated channels.
 * Input channels are USER channel numbers (1-96).
 * They are converted to ITU-T channel numbers (-35 to 60) for storage,
 * matching how real spectrum allocations work.
 */
const createMockSpectrum = (allocatedUserChannels: number[] = []): PortSpectrum => ({
  gridType: 'fixed-50ghz',
  allocations: allocatedUserChannels.map(
    (userCh, idx): ChannelAllocation => ({
      id: `alloc-${idx}`,
      // Convert user channel (1-96) to ITU-T (-35 to 60) for storage
      channelNumber: userToItuChannel(userCh, 'fixed-50ghz'),
      status: 'allocated',
    })
  ),
});

// ============================================================================
// MOCK TOPOLOGY PROVIDER
// ============================================================================

const createMockTopologyProvider = (
  nodes: NetworkNode[] = [],
  edges: NetworkEdge[] = []
): ChannelTopologyProvider => ({
  getNode: (id) => nodes.find((n) => n.id === id),
  getEdge: (id) => edges.find((e) => e.id === id),
  getEdges: () => edges,
});

// ============================================================================
// TESTS
// ============================================================================

describe('ChannelChecker', () => {
  let checker: ChannelChecker;
  let nodes: NetworkNode[];
  let edges: NetworkEdge[];

  // --------------------------------------------------------------------------
  // Setup
  // --------------------------------------------------------------------------

  beforeEach(() => {
    // Create a basic 3-node topology: node-1 -- edge-1 --> node-2 -- edge-2 --> node-3
    nodes = [
      createMockNode({
        id: 'node-1',
        name: 'Node A',
        ports: [createMockPort({ id: 'port-1' }), createMockPort({ id: 'port-2' })],
      }),
      createMockNode({
        id: 'node-2',
        name: 'Node B',
        ports: [createMockPort({ id: 'port-1' }), createMockPort({ id: 'port-2' })],
      }),
      createMockNode({
        id: 'node-3',
        name: 'Node C',
        ports: [createMockPort({ id: 'port-1' }), createMockPort({ id: 'port-2' })],
      }),
    ];

    edges = [
      createMockEdge({
        id: 'edge-1',
        name: 'Edge A-B',
        source: { nodeId: 'node-1', portId: 'port-1' },
        target: { nodeId: 'node-2', portId: 'port-1' },
      }),
      createMockEdge({
        id: 'edge-2',
        name: 'Edge B-C',
        source: { nodeId: 'node-2', portId: 'port-2' },
        target: { nodeId: 'node-3', portId: 'port-1' },
      }),
    ];

    const topology = createMockTopologyProvider(nodes, edges);
    checker = new ChannelChecker(topology);
  });

  // --------------------------------------------------------------------------
  // getAvailableChannels Tests
  // --------------------------------------------------------------------------

  describe('getAvailableChannels', () => {
    it('should return all channels when no allocations exist', () => {
      const available = checker.getAvailableChannels('edge-1');

      expect(available.length).toBe(DEFAULT_CHANNEL_RANGE.max - DEFAULT_CHANNEL_RANGE.min + 1);
      expect(available).toContain(1);
      expect(available).toContain(96);
    });

    it('should exclude allocated channels from port spectrum', () => {
      // Add allocations to source port
      nodes[0].ports![0].spectrum = createMockSpectrum([1, 2, 3, 10, 50]);

      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const available = checker.getAvailableChannels('edge-1');

      expect(available).not.toContain(1);
      expect(available).not.toContain(2);
      expect(available).not.toContain(3);
      expect(available).not.toContain(10);
      expect(available).not.toContain(50);
      expect(available).toContain(4);
      expect(available).toContain(96);
    });

    it('should return empty array for non-existent edge', () => {
      const available = checker.getAvailableChannels('non-existent');
      expect(available).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // findCommonChannels Tests
  // --------------------------------------------------------------------------

  describe('findCommonChannels', () => {
    it('should return all channels when no allocations on any edge', () => {
      const common = checker.findCommonChannels(['edge-1', 'edge-2']);

      expect(common.length).toBe(DEFAULT_CHANNEL_RANGE.max - DEFAULT_CHANNEL_RANGE.min + 1);
    });

    it('should return intersection of available channels', () => {
      // Allocate channels 1-50 on edge-1 source
      nodes[0].ports![0].spectrum = createMockSpectrum(
        Array.from({ length: 50 }, (_, i) => i + 1)
      );
      // Allocate channels 40-96 on edge-2 target
      nodes[2].ports![0].spectrum = createMockSpectrum(
        Array.from({ length: 57 }, (_, i) => i + 40)
      );

      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const common = checker.findCommonChannels(['edge-1', 'edge-2']);

      // Edge-1 has 51-96 available (46 channels)
      // Edge-2 has 1-39 available (39 channels)
      // Intersection should be empty
      expect(common.length).toBe(0);
    });

    it('should return empty array for empty edge list', () => {
      const common = checker.findCommonChannels([]);
      expect(common).toEqual([]);
    });

    it('should find common channels across multiple edges', () => {
      // Allocate different channels on each edge
      nodes[0].ports![0].spectrum = createMockSpectrum([1, 2, 3]);
      nodes[2].ports![0].spectrum = createMockSpectrum([4, 5, 6]);

      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const common = checker.findCommonChannels(['edge-1', 'edge-2']);

      // Should exclude 1-6, have 7-96 available on both
      expect(common).not.toContain(1);
      expect(common).not.toContain(6);
      expect(common).toContain(7);
      expect(common).toContain(96);
      expect(common.length).toBe(90);
    });
  });

  // --------------------------------------------------------------------------
  // checkChannelAvailability Tests - Continuous Mode
  // --------------------------------------------------------------------------

  describe('checkChannelAvailability - continuous mode', () => {
    it('should return available with common channels', () => {
      const path = createMockPath({
        nodeIds: ['node-1', 'node-2', 'node-3'],
        edgeIds: ['edge-1', 'edge-2'],
      });

      const result = checker.checkChannelAvailability(path, 'continuous');

      expect(result.available).toBe(true);
      expect(result.mode).toBe('continuous');
      expect(result.commonChannels).toBeDefined();
      expect(result.commonChannels!.length).toBeGreaterThan(0);
      expect(result.suggestedChannel).toBeDefined();
    });

    it('should return unavailable when no common channels exist', () => {
      // Block all channels on edge-1
      nodes[0].ports![0].spectrum = createMockSpectrum(
        Array.from({ length: 96 }, (_, i) => i + 1)
      );

      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const path = createMockPath({
        nodeIds: ['node-1', 'node-2', 'node-3'],
        edgeIds: ['edge-1', 'edge-2'],
      });

      const result = checker.checkChannelAvailability(path, 'continuous');

      expect(result.available).toBe(false);
      expect(result.blockedEdges).toContain('edge-1');
    });

    it('should check specific requested channel', () => {
      const path = createMockPath();

      // Channel 35 should be available
      const result1 = checker.checkChannelAvailability(path, 'continuous', 35);
      expect(result1.available).toBe(true);
      expect(result1.suggestedChannel).toBe(35);

      // Block channel 35
      nodes[0].ports![0].spectrum = createMockSpectrum([35]);
      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const result2 = checker.checkChannelAvailability(path, 'continuous', 35);
      expect(result2.available).toBe(false);
      expect(result2.blockedReason).toContain('35');
    });

    it('should suggest lowest available channel', () => {
      // Block channels 1-10
      nodes[0].ports![0].spectrum = createMockSpectrum([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const path = createMockPath();
      const result = checker.checkChannelAvailability(path, 'continuous');

      expect(result.suggestedChannel).toBe(11);
    });

    it('should handle empty path', () => {
      const path = createMockPath({ edgeIds: [] });
      const result = checker.checkChannelAvailability(path, 'continuous');

      expect(result.available).toBe(false);
      expect(result.blockedReason).toBe('Path has no edges');
    });
  });

  // --------------------------------------------------------------------------
  // checkChannelAvailability Tests - Conversion Mode
  // --------------------------------------------------------------------------

  describe('checkChannelAvailability - conversion mode', () => {
    it('should return available when each edge has at least one channel', () => {
      // Block different channels on each edge
      nodes[0].ports![0].spectrum = createMockSpectrum([1, 2, 3]);
      nodes[2].ports![0].spectrum = createMockSpectrum([4, 5, 6]);

      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const path = createMockPath({
        nodeIds: ['node-1', 'node-2', 'node-3'],
        edgeIds: ['edge-1', 'edge-2'],
      });

      const result = checker.checkChannelAvailability(path, 'conversion-allowed');

      expect(result.available).toBe(true);
      expect(result.mode).toBe('conversion-allowed');
      expect(result.perEdgeChannels).toBeDefined();
    });

    it('should identify conversion points', () => {
      // Make edges have no common channels (channel 1 only on edge-1, channel 2 only on edge-2)
      nodes[0].ports![0].spectrum = createMockSpectrum(
        Array.from({ length: 95 }, (_, i) => i + 2)
      ); // 2-96 blocked, only 1 free
      nodes[2].ports![0].spectrum = createMockSpectrum(
        [1, ...Array.from({ length: 94 }, (_, i) => i + 3)]
      ); // 1, 3-96 blocked, only 2 free

      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const path = createMockPath({
        nodeIds: ['node-1', 'node-2', 'node-3'],
        edgeIds: ['edge-1', 'edge-2'],
      });

      const result = checker.checkChannelAvailability(path, 'conversion-allowed');

      expect(result.available).toBe(true);
      expect(result.conversionPoints).toBeDefined();
      expect(result.conversionPoints).toContain('node-2');
    });

    it('should return unavailable when an edge is fully blocked', () => {
      // Block all channels on edge-1
      nodes[0].ports![0].spectrum = createMockSpectrum(
        Array.from({ length: 96 }, (_, i) => i + 1)
      );

      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const path = createMockPath({
        edgeIds: ['edge-1', 'edge-2'],
      });

      const result = checker.checkChannelAvailability(path, 'conversion-allowed');

      expect(result.available).toBe(false);
      expect(result.blockedEdges).toContain('edge-1');
    });
  });

  // --------------------------------------------------------------------------
  // canAllocateChannel Tests
  // --------------------------------------------------------------------------

  describe('canAllocateChannel', () => {
    it('should return true for available channel', () => {
      const path = createMockPath();
      expect(checker.canAllocateChannel(path, 35)).toBe(true);
    });

    it('should return false for unavailable channel', () => {
      nodes[0].ports![0].spectrum = createMockSpectrum([35]);
      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const path = createMockPath();
      expect(checker.canAllocateChannel(path, 35)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getExhaustionWarnings Tests
  // --------------------------------------------------------------------------

  describe('getExhaustionWarnings', () => {
    it('should return warnings for edges with low availability', () => {
      // Block most channels leaving only a few
      const blockedChannels = Array.from({ length: 93 }, (_, i) => i + 1); // Block 1-93
      nodes[0].ports![0].spectrum = createMockSpectrum(blockedChannels);

      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const warnings = checker.getExhaustionWarnings(['edge-1', 'edge-2']);

      expect(warnings.length).toBe(1);
      expect(warnings[0].edgeId).toBe('edge-1');
      expect(warnings[0].availableCount).toBe(3);
    });

    it('should return empty array when all edges have sufficient channels', () => {
      const warnings = checker.getExhaustionWarnings(['edge-1', 'edge-2']);
      expect(warnings).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getEdgeUtilization Tests
  // --------------------------------------------------------------------------

  describe('getEdgeUtilization', () => {
    it('should calculate correct utilization for unused edge', () => {
      const util = checker.getEdgeUtilization('edge-1');

      expect(util.total).toBe(96);
      expect(util.used).toBe(0);
      expect(util.available).toBe(96);
      expect(util.utilizationPercent).toBe(0);
    });

    it('should calculate correct utilization for partially used edge', () => {
      // Allocate 48 channels (50%)
      nodes[0].ports![0].spectrum = createMockSpectrum(
        Array.from({ length: 48 }, (_, i) => i + 1)
      );

      const topology = createMockTopologyProvider(nodes, edges);
      checker = new ChannelChecker(topology);

      const util = checker.getEdgeUtilization('edge-1');

      expect(util.total).toBe(96);
      expect(util.used).toBe(48);
      expect(util.available).toBe(48);
      expect(util.utilizationPercent).toBe(50);
    });
  });

  // --------------------------------------------------------------------------
  // Factory Function Tests
  // --------------------------------------------------------------------------

  describe('createChannelChecker', () => {
    it('should create ChannelChecker instance', () => {
      const topology = createMockTopologyProvider(nodes, edges);
      const instance = createChannelChecker(topology);

      expect(instance).toBeInstanceOf(ChannelChecker);
    });
  });
});
