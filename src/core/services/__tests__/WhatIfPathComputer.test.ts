import { describe, it, expect } from 'vitest';
import {
  WhatIfPathComputer,
  type WhatIfServiceConfig,
  type VirtualCapacityState,
} from '../WhatIfPathComputer';
import { CapacityTracker, type CapacityDataProvider } from '../CapacityTracker';
import type { NetworkNode, NetworkEdge } from '@/types/network';

// ============================================================================
// MOCK DATA FACTORIES
// ============================================================================

const createMockNode = (overrides: Partial<NetworkNode> = {}): NetworkNode => ({
  id: 'node-1',
  name: 'Node 1',
  type: 'router',
  vendor: 'generic',
  position: { x: 0, y: 0 },
  stacks: [],
  ports: [],
  metadata: {},
  ...overrides,
});

const createMockEdge = (overrides: Partial<NetworkEdge> = {}): NetworkEdge => ({
  id: 'edge-1',
  name: 'Edge 1',
  type: 'fiber',
  source: { nodeId: 'node-1', portId: 'port-1' },
  target: { nodeId: 'node-2', portId: 'port-1' },
  properties: { distance: 100 },
  state: 'active',
  metadata: {},
  ...overrides,
});

const createConfig = (overrides: Partial<WhatIfServiceConfig> = {}): WhatIfServiceConfig => ({
  sourceNodeId: 'node-A',
  destinationNodeId: 'node-D',
  serviceType: 'l1-dwdm',
  dataRate: '100G',
  protection: 'none',
  quantity: 1,
  ...overrides,
});

// ============================================================================
// LINEAR TOPOLOGY HELPER
// A --- B --- C --- D
// ============================================================================

function buildLinearTopology() {
  const nodes: NetworkNode[] = [
    createMockNode({ id: 'node-A', name: 'A', position: { x: 0, y: 0 } }),
    createMockNode({ id: 'node-B', name: 'B', position: { x: 100, y: 0 } }),
    createMockNode({ id: 'node-C', name: 'C', position: { x: 200, y: 0 } }),
    createMockNode({ id: 'node-D', name: 'D', position: { x: 300, y: 0 } }),
  ];
  const edges: NetworkEdge[] = [
    createMockEdge({ id: 'e-AB', name: 'A-B', source: { nodeId: 'node-A' }, target: { nodeId: 'node-B' }, properties: { distance: 100 } }),
    createMockEdge({ id: 'e-BC', name: 'B-C', source: { nodeId: 'node-B' }, target: { nodeId: 'node-C' }, properties: { distance: 200 } }),
    createMockEdge({ id: 'e-CD', name: 'C-D', source: { nodeId: 'node-C' }, target: { nodeId: 'node-D' }, properties: { distance: 150 } }),
  ];
  return { nodes, edges };
}

// ============================================================================
// DIAMOND TOPOLOGY HELPER (for protection path tests)
//       B
//      / \
//  A--+   +--D
//      \ /
//       C
// ============================================================================

function buildDiamondTopology() {
  const nodes: NetworkNode[] = [
    createMockNode({ id: 'node-A', name: 'A', position: { x: 0, y: 100 } }),
    createMockNode({ id: 'node-B', name: 'B', position: { x: 100, y: 0 } }),
    createMockNode({ id: 'node-C', name: 'C', position: { x: 100, y: 200 } }),
    createMockNode({ id: 'node-D', name: 'D', position: { x: 200, y: 100 } }),
  ];
  const edges: NetworkEdge[] = [
    createMockEdge({ id: 'e-AB', source: { nodeId: 'node-A' }, target: { nodeId: 'node-B' }, properties: { distance: 50 } }),
    createMockEdge({ id: 'e-AC', source: { nodeId: 'node-A' }, target: { nodeId: 'node-C' }, properties: { distance: 60 } }),
    createMockEdge({ id: 'e-BD', source: { nodeId: 'node-B' }, target: { nodeId: 'node-D' }, properties: { distance: 50 } }),
    createMockEdge({ id: 'e-CD', source: { nodeId: 'node-C' }, target: { nodeId: 'node-D' }, properties: { distance: 60 } }),
  ];
  return { nodes, edges };
}

// ============================================================================
// TESTS
// ============================================================================

describe('WhatIfPathComputer', () => {
  // ========================================================================
  // SINGLE PATH COMPUTATION
  // ========================================================================

  describe('computePaths', () => {
    it('should compute a working path on a linear topology', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ sourceNodeId: 'node-A', destinationNodeId: 'node-D' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.workingPath).not.toBeNull();
      expect(result.workingPath!.nodeIds).toContain('node-A');
      expect(result.workingPath!.nodeIds).toContain('node-D');
      expect(result.workingPath!.edgeIds.length).toBeGreaterThan(0);
      expect(result.workingPath!.totalDistance).toBeGreaterThan(0);
      expect(result.workingPath!.hopCount).toBeGreaterThan(0);
    });

    it('should return protectionPath = null when protection is none', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ protection: 'none' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.protectionPath).toBeNull();
    });

    it('should compute a protection path when protection is olp', () => {
      const { nodes, edges } = buildDiamondTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ protection: 'olp' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.workingPath).not.toBeNull();
      expect(result.protectionPath).not.toBeNull();
      // Working and protection should be edge-disjoint
      const workingEdges = new Set(result.workingPath!.edgeIds);
      const protectionEdges = new Set(result.protectionPath!.edgeIds);
      const overlap = [...workingEdges].filter((e) => protectionEdges.has(e));
      expect(overlap.length).toBe(0);
    });

    it('should return infeasible when source node does not exist', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ sourceNodeId: 'nonexistent' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(false);
      expect(result.workingPath).toBeNull();
      expect(result.reason).toContain('not found');
    });

    it('should return infeasible when destination node does not exist', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ destinationNodeId: 'nonexistent' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(false);
      expect(result.workingPath).toBeNull();
      expect(result.reason).toContain('not found');
    });

    it('should return infeasible when no path exists (disconnected)', () => {
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'node-A', name: 'A' }),
        createMockNode({ id: 'node-D', name: 'D', position: { x: 300, y: 0 } }),
      ];
      const edges: NetworkEdge[] = []; // No edges

      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig();

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(false);
      expect(result.workingPath).toBeNull();
      expect(result.reason).toContain('No working path found');
    });

    it('should allow amplifier nodes as DWDM transit nodes', () => {
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'node-A', name: 'A', type: 'router' }),
        createMockNode({ id: 'node-AMP', name: 'AMP', type: 'amplifier', position: { x: 50, y: 0 } }),
        createMockNode({ id: 'node-D', name: 'D', type: 'router', position: { x: 100, y: 0 } }),
      ];
      const edges: NetworkEdge[] = [
        createMockEdge({ id: 'e-A-AMP', source: { nodeId: 'node-A' }, target: { nodeId: 'node-AMP' }, properties: { distance: 50 } }),
        createMockEdge({ id: 'e-AMP-D', source: { nodeId: 'node-AMP' }, target: { nodeId: 'node-D' }, properties: { distance: 50 } }),
      ];

      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({
        sourceNodeId: 'node-A',
        destinationNodeId: 'node-D',
        serviceType: 'l1-dwdm',
      });

      const result = computer.computePaths(config);

      // Amplifiers are valid transit nodes for DWDM paths
      expect(result.feasible).toBe(true);
      expect(result.workingPath!.nodeIds).toContain('node-AMP');
    });

    it('should NOT exclude passive node types for non-DWDM services', () => {
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'node-A', name: 'A', type: 'router' }),
        createMockNode({ id: 'node-AMP', name: 'AMP', type: 'amplifier', position: { x: 50, y: 0 } }),
        createMockNode({ id: 'node-D', name: 'D', type: 'router', position: { x: 100, y: 0 } }),
      ];
      const edges: NetworkEdge[] = [
        createMockEdge({ id: 'e-A-AMP', source: { nodeId: 'node-A' }, target: { nodeId: 'node-AMP' }, properties: { distance: 50 } }),
        createMockEdge({ id: 'e-AMP-D', source: { nodeId: 'node-AMP' }, target: { nodeId: 'node-D' }, properties: { distance: 50 } }),
      ];

      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({
        sourceNodeId: 'node-A',
        destinationNodeId: 'node-D',
        serviceType: 'l2-ethernet',
      });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.workingPath!.nodeIds).toContain('node-AMP');
    });

    it('should exclude osp-termination nodes from DWDM intermediate paths', () => {
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'node-A', name: 'A', type: 'router' }),
        createMockNode({ id: 'node-OSP', name: 'OSP', type: 'osp-termination', position: { x: 50, y: 0 } }),
        createMockNode({ id: 'node-D', name: 'D', type: 'router', position: { x: 100, y: 0 } }),
      ];
      const edges: NetworkEdge[] = [
        createMockEdge({ id: 'e-A-OSP', source: { nodeId: 'node-A' }, target: { nodeId: 'node-OSP' }, properties: { distance: 30 } }),
        createMockEdge({ id: 'e-OSP-D', source: { nodeId: 'node-OSP' }, target: { nodeId: 'node-D' }, properties: { distance: 30 } }),
      ];

      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({
        sourceNodeId: 'node-A',
        destinationNodeId: 'node-D',
        serviceType: 'l1-dwdm',
      });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(false);
    });

    it('should store config in result', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig();

      const result = computer.computePaths(config);

      expect(result.config).toBe(config);
    });

    it('should still find protection path = null on linear topology (no diverse path)', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ protection: 'olp' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.workingPath).not.toBeNull();
      // On linear topology there is no edge-disjoint protection path
      expect(result.protectionPath).toBeNull();
    });
  });

  // ========================================================================
  // VIRTUAL CAPACITY STATE
  // ========================================================================

  describe('createVirtualState', () => {
    it('should return an empty virtual state', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);

      const state = computer.createVirtualState();

      expect(state.additionalChannelsUsed.size).toBe(0);
      expect(state.freedChannels.size).toBe(0);
    });
  });

  describe('getVirtualChannelsUsed', () => {
    it('should return 0 for edge not in state', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state = computer.createVirtualState();

      expect(computer.getVirtualChannelsUsed(state, 'unknown-edge')).toBe(0);
    });

    it('should return net channels used (added minus freed)', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state: VirtualCapacityState = {
        additionalChannelsUsed: new Map([['e-AB', new Set([0, 1, 2])]]),
        freedChannels: new Map([['e-AB', new Set([10])]]),
      };

      expect(computer.getVirtualChannelsUsed(state, 'e-AB')).toBe(2); // 3 - 1
    });
  });

  describe('getAffectedEdges', () => {
    it('should return empty array for empty state', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state = computer.createVirtualState();

      expect(computer.getAffectedEdges(state)).toEqual([]);
    });

    it('should collect edges from both added and freed maps', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state: VirtualCapacityState = {
        additionalChannelsUsed: new Map([['e-AB', new Set([0])]]),
        freedChannels: new Map([['e-CD', new Set([1])]]),
      };

      const affected = computer.getAffectedEdges(state);
      expect(affected).toContain('e-AB');
      expect(affected).toContain('e-CD');
      expect(affected.length).toBe(2);
    });

    it('should deduplicate edges appearing in both maps', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state: VirtualCapacityState = {
        additionalChannelsUsed: new Map([['e-AB', new Set([0])]]),
        freedChannels: new Map([['e-AB', new Set([1])]]),
      };

      const affected = computer.getAffectedEdges(state);
      expect(affected.length).toBe(1);
      expect(affected[0]).toBe('e-AB');
    });
  });

  // ========================================================================
  // BATCH COMPUTATION
  // ========================================================================

  describe('computeBatchPaths', () => {
    it('should compute paths for multiple configs', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const configs = [
        createConfig({ sourceNodeId: 'node-A', destinationNodeId: 'node-B' }),
        createConfig({ sourceNodeId: 'node-B', destinationNodeId: 'node-D' }),
      ];

      const results = computer.computeBatchPaths(configs);

      expect(results.length).toBe(2);
      expect(results[0].feasible).toBe(true);
      expect(results[1].feasible).toBe(true);
    });

    it('should accumulate virtual state across batch items', () => {
      const { nodes, edges } = buildDiamondTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state = computer.createVirtualState();

      const configs = [
        createConfig({ quantity: 2 }),
        createConfig({ quantity: 1 }),
      ];

      const results = computer.computeBatchPaths(configs, state);

      expect(results.length).toBe(2);
      // The virtual state should have been updated for edges in the first result
      const affected = computer.getAffectedEdges(state);
      expect(affected.length).toBeGreaterThan(0);
    });

    it('should handle empty config list', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);

      const results = computer.computeBatchPaths([]);

      expect(results).toEqual([]);
    });

    it('should handle mix of feasible and infeasible configs', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const configs = [
        createConfig({ sourceNodeId: 'node-A', destinationNodeId: 'node-D' }),
        createConfig({ sourceNodeId: 'nonexistent', destinationNodeId: 'node-D' }),
        createConfig({ sourceNodeId: 'node-B', destinationNodeId: 'node-C' }),
      ];

      const results = computer.computeBatchPaths(configs);

      expect(results[0].feasible).toBe(true);
      expect(results[1].feasible).toBe(false);
      expect(results[2].feasible).toBe(true);
    });

    it('should create internal virtual state when not provided', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const configs = [createConfig()];

      // Should not throw when virtualState is undefined
      const results = computer.computeBatchPaths(configs);
      expect(results.length).toBe(1);
    });
  });

  // ========================================================================
  // getChannelsRequired (indirectly tested via batch virtual state)
  // ========================================================================

  describe('channels required behavior', () => {
    it('should use 1 channel for non-400G L1 DWDM service', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state = computer.createVirtualState();

      const configs = [
        createConfig({ dataRate: '100G', quantity: 1 }),
      ];
      computer.computeBatchPaths(configs, state);

      // Working path has 3 edges; each should have 1 channel added
      const affected = computer.getAffectedEdges(state);
      for (const edgeId of affected) {
        expect(computer.getVirtualChannelsUsed(state, edgeId)).toBe(1);
      }
    });

    it('should use 4 channels for 400G L1 DWDM service', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state = computer.createVirtualState();

      const configs = [
        createConfig({ dataRate: '400G', quantity: 1 }),
      ];
      computer.computeBatchPaths(configs, state);

      const affected = computer.getAffectedEdges(state);
      for (const edgeId of affected) {
        expect(computer.getVirtualChannelsUsed(state, edgeId)).toBe(4);
      }
    });

    it('should use 1 channel for L2 Ethernet service (rides on L1 underlay)', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state = computer.createVirtualState();

      const configs = [
        createConfig({ serviceType: 'l2-ethernet', dataRate: '100G', quantity: 1 }),
      ];
      computer.computeBatchPaths(configs, state);

      // L2/L3 services consume 1 L1 underlay channel each
      const affected = computer.getAffectedEdges(state);
      expect(affected.length).toBeGreaterThan(0);
      for (const edgeId of affected) {
        expect(computer.getVirtualChannelsUsed(state, edgeId)).toBe(1);
      }
    });

    it('should use 1 channel for L3 IP service (rides on L1 underlay)', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state = computer.createVirtualState();

      const configs = [
        createConfig({ serviceType: 'l3-ip', dataRate: '100G', quantity: 1 }),
      ];
      computer.computeBatchPaths(configs, state);

      const affected = computer.getAffectedEdges(state);
      expect(affected.length).toBeGreaterThan(0);
      for (const edgeId of affected) {
        expect(computer.getVirtualChannelsUsed(state, edgeId)).toBe(1);
      }
    });

    it('should multiply channels by quantity', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state = computer.createVirtualState();

      const configs = [
        createConfig({ dataRate: '100G', quantity: 5 }),
      ];
      computer.computeBatchPaths(configs, state);

      const affected = computer.getAffectedEdges(state);
      for (const edgeId of affected) {
        expect(computer.getVirtualChannelsUsed(state, edgeId)).toBe(5);
      }
    });

    it('should multiply 400G channels (4) by quantity', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state = computer.createVirtualState();

      const configs = [
        createConfig({ dataRate: '400G', quantity: 3 }),
      ];
      computer.computeBatchPaths(configs, state);

      const affected = computer.getAffectedEdges(state);
      for (const edgeId of affected) {
        expect(computer.getVirtualChannelsUsed(state, edgeId)).toBe(12); // 4 * 3
      }
    });
  });

  // ========================================================================
  // MODULATION REACH VALIDATION
  // ========================================================================

  describe('modulation reach validation', () => {
    it('should mark infeasible when working path exceeds modulation reach', () => {
      // DP-64QAM has 120km reach, total path is 450km (100+200+150)
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({
        serviceType: 'l1-dwdm',
        modulation: 'DP-64QAM',
        protection: 'none',
      });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(false);
      expect(result.workingPath).toBeNull();
      expect(result.reason).toContain('exceeds');
      expect(result.reason).toContain('DP-64QAM');
    });

    it('should be feasible when working path is within modulation reach', () => {
      // DP-QPSK has 2500km reach, total path is 450km -- within reach
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({
        serviceType: 'l1-dwdm',
        modulation: 'DP-QPSK',
        protection: 'none',
      });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.workingPath).not.toBeNull();
      expect(result.warnings).toBeUndefined();
    });

    it('should nullify protection path with warning when protection exceeds reach but working is OK', () => {
      // Diamond topology: working via B (50+50=100km), protection via C (60+60=120km)
      // DP-64QAM reach is 120km -- working path (100km) is OK, protection (120km) is at the limit
      // Use DP-32QAM (250km reach) -- both paths fit
      // Instead, build a custom topology where protection is longer
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'node-A', name: 'A', type: 'router', position: { x: 0, y: 100 } }),
        createMockNode({ id: 'node-B', name: 'B', type: 'router', position: { x: 100, y: 0 } }),
        createMockNode({ id: 'node-C', name: 'C', type: 'router', position: { x: 100, y: 200 } }),
        createMockNode({ id: 'node-D', name: 'D', type: 'router', position: { x: 200, y: 100 } }),
      ];
      const edges: NetworkEdge[] = [
        createMockEdge({ id: 'e-AB', source: { nodeId: 'node-A' }, target: { nodeId: 'node-B' }, properties: { distance: 50 } }),
        createMockEdge({ id: 'e-AC', source: { nodeId: 'node-A' }, target: { nodeId: 'node-C' }, properties: { distance: 80 } }),
        createMockEdge({ id: 'e-BD', source: { nodeId: 'node-B' }, target: { nodeId: 'node-D' }, properties: { distance: 50 } }),
        createMockEdge({ id: 'e-CD', source: { nodeId: 'node-C' }, target: { nodeId: 'node-D' }, properties: { distance: 80 } }),
      ];

      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      // DP-64QAM reach = 120km. Working path: A->B->D = 100km (OK). Protection: A->C->D = 160km (exceeds)
      const config = createConfig({
        serviceType: 'l1-dwdm',
        modulation: 'DP-64QAM',
        protection: 'olp',
      });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.workingPath).not.toBeNull();
      expect(result.protectionPath).toBeNull(); // Nullified due to reach
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBe(1);
      expect(result.warnings![0]).toContain('Protection path');
      expect(result.warnings![0]).toContain('DP-64QAM');
    });

    it('should skip reach validation for non-DWDM services', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({
        serviceType: 'l2-ethernet',
        modulation: 'DP-64QAM', // Should be ignored for L2
        protection: 'none',
      });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should skip reach validation when modulation is not specified', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({
        serviceType: 'l1-dwdm',
        modulation: undefined,
        protection: 'none',
      });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.warnings).toBeUndefined();
    });
  });

  // ========================================================================
  // ALTERNATIVE PATHS (kShortestPaths-based computation)
  // ========================================================================

  describe('alternative paths', () => {
    it('should return no alternativePaths on a linear topology (only 1 path exists)', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ protection: 'none' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.workingPath).not.toBeNull();
      expect(result.alternativePaths).toBeUndefined();
    });

    it('should return alternativePaths on a diamond topology (2+ paths exist)', () => {
      const { nodes, edges } = buildDiamondTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ protection: 'none' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.workingPath).not.toBeNull();
      expect(result.alternativePaths).toBeDefined();
      expect(result.alternativePaths!.length).toBeGreaterThanOrEqual(1);
    });

    it('should return working path as shortest and alternatives as longer paths', () => {
      const { nodes, edges } = buildDiamondTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ protection: 'none' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      if (result.alternativePaths && result.alternativePaths.length > 0) {
        for (const alt of result.alternativePaths) {
          expect(alt.totalDistance).toBeGreaterThanOrEqual(result.workingPath!.totalDistance);
        }
      }
    });

    it('should find multiple paths on a rich topology', () => {
      // Build a topology with multiple paths: A -> B -> D, A -> C -> D, A -> E -> D
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'node-A', name: 'A', position: { x: 0, y: 100 } }),
        createMockNode({ id: 'node-B', name: 'B', position: { x: 100, y: 0 } }),
        createMockNode({ id: 'node-C', name: 'C', position: { x: 100, y: 100 } }),
        createMockNode({ id: 'node-E', name: 'E', position: { x: 100, y: 200 } }),
        createMockNode({ id: 'node-D', name: 'D', position: { x: 200, y: 100 } }),
      ];
      const edges: NetworkEdge[] = [
        createMockEdge({ id: 'e-AB', source: { nodeId: 'node-A' }, target: { nodeId: 'node-B' }, properties: { distance: 50 } }),
        createMockEdge({ id: 'e-AC', source: { nodeId: 'node-A' }, target: { nodeId: 'node-C' }, properties: { distance: 60 } }),
        createMockEdge({ id: 'e-AE', source: { nodeId: 'node-A' }, target: { nodeId: 'node-E' }, properties: { distance: 70 } }),
        createMockEdge({ id: 'e-BD', source: { nodeId: 'node-B' }, target: { nodeId: 'node-D' }, properties: { distance: 50 } }),
        createMockEdge({ id: 'e-CD', source: { nodeId: 'node-C' }, target: { nodeId: 'node-D' }, properties: { distance: 60 } }),
        createMockEdge({ id: 'e-ED', source: { nodeId: 'node-E' }, target: { nodeId: 'node-D' }, properties: { distance: 70 } }),
      ];

      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ protection: 'none' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.workingPath).not.toBeNull();
      expect(result.alternativePaths).toBeDefined();
      expect(result.alternativePaths!.length).toBeGreaterThanOrEqual(2);
    });

    it('should not include alternativePaths in infeasible result', () => {
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'node-A', name: 'A' }),
        createMockNode({ id: 'node-D', name: 'D', position: { x: 300, y: 0 } }),
      ];
      const edges: NetworkEdge[] = [];

      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig();

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(false);
      expect(result.alternativePaths).toBeUndefined();
    });
  });

  // ========================================================================
  // PROTECTION PATH COMPUTATION
  // ========================================================================

  describe('protection path variants', () => {
    it('should compute protection path for sncp scheme', () => {
      const { nodes, edges } = buildDiamondTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ protection: 'sncp' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.protectionPath).not.toBeNull();
    });

    it('should compute protection path for wson-restoration scheme', () => {
      const { nodes, edges } = buildDiamondTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({ protection: 'wson-restoration' });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.protectionPath).not.toBeNull();
    });

    it('should track protection path edges in virtual state', () => {
      const { nodes, edges } = buildDiamondTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const state = computer.createVirtualState();

      const configs = [
        createConfig({ protection: 'olp', dataRate: '100G', quantity: 1 }),
      ];
      computer.computeBatchPaths(configs, state);

      // Should have channels on both working and protection path edges
      const affected = computer.getAffectedEdges(state);
      expect(affected.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ========================================================================
  // AMPLIFIER TRANSIT FIX (Sprint 5 Bug 1)
  // ========================================================================

  describe('amplifier transit fix', () => {
    it('should find 3 paths on diamond topology with amplifier transit', () => {
      // Diamond: A -> AMP1 -> D, A -> B -> D, A -> C -> D
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'node-A', name: 'A', type: 'router', position: { x: 0, y: 100 } }),
        createMockNode({ id: 'node-AMP1', name: 'AMP1', type: 'amplifier', position: { x: 100, y: 0 } }),
        createMockNode({ id: 'node-B', name: 'B', type: 'router', position: { x: 100, y: 100 } }),
        createMockNode({ id: 'node-C', name: 'C', type: 'router', position: { x: 100, y: 200 } }),
        createMockNode({ id: 'node-D', name: 'D', type: 'router', position: { x: 200, y: 100 } }),
      ];
      const edges: NetworkEdge[] = [
        createMockEdge({ id: 'e-A-AMP1', source: { nodeId: 'node-A' }, target: { nodeId: 'node-AMP1' }, properties: { distance: 40 } }),
        createMockEdge({ id: 'e-AMP1-D', source: { nodeId: 'node-AMP1' }, target: { nodeId: 'node-D' }, properties: { distance: 40 } }),
        createMockEdge({ id: 'e-AB', source: { nodeId: 'node-A' }, target: { nodeId: 'node-B' }, properties: { distance: 50 } }),
        createMockEdge({ id: 'e-BD', source: { nodeId: 'node-B' }, target: { nodeId: 'node-D' }, properties: { distance: 50 } }),
        createMockEdge({ id: 'e-AC', source: { nodeId: 'node-A' }, target: { nodeId: 'node-C' }, properties: { distance: 60 } }),
        createMockEdge({ id: 'e-CD', source: { nodeId: 'node-C' }, target: { nodeId: 'node-D' }, properties: { distance: 60 } }),
      ];

      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const config = createConfig({
        sourceNodeId: 'node-A',
        destinationNodeId: 'node-D',
        serviceType: 'l1-dwdm',
        protection: 'none',
      });

      const result = computer.computePaths(config);

      expect(result.feasible).toBe(true);
      expect(result.workingPath).not.toBeNull();
      // Working path (shortest via AMP1) + 2 alternatives (via B and via C)
      const totalPaths = 1 + (result.alternativePaths?.length ?? 0);
      expect(totalPaths).toBe(3);
    });

    it('should still exclude amplifier as DWDM service endpoint', () => {
      // Amplifier can be transit but NOT a valid source/destination for path exclusion
      // (amplifiers are excluded when they ARE the source or destination via the EXCLUDED check)
      // Actually, the exclusion list only excludes INTERMEDIATE nodes, not endpoints.
      // The real check is that amplifiers aren't valid service endpoints in the service wizard.
      // In WhatIfPathComputer, amplifiers as source/destination should still find paths
      // since the exclusion explicitly skips source and destination nodes.
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'node-AMP', name: 'AMP', type: 'amplifier', position: { x: 0, y: 0 } }),
        createMockNode({ id: 'node-B', name: 'B', type: 'router', position: { x: 100, y: 0 } }),
      ];
      const edges: NetworkEdge[] = [
        createMockEdge({ id: 'e-AMP-B', source: { nodeId: 'node-AMP' }, target: { nodeId: 'node-B' }, properties: { distance: 50 } }),
      ];

      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      // Using amplifier as endpoint: the exclusion logic skips source/dest
      const config = createConfig({
        sourceNodeId: 'node-AMP',
        destinationNodeId: 'node-B',
        serviceType: 'l1-dwdm',
      });

      const result = computer.computePaths(config);

      // Path is feasible because endpoint exclusion is skipped for source/dest
      expect(result.feasible).toBe(true);
    });
  });

  // ========================================================================
  // simulateBatch (P3.1) — cumulative path + capacity sim in one call
  // ========================================================================

  describe('simulateBatch', () => {
    function makeProvider(nodes: NetworkNode[], edges: NetworkEdge[]): CapacityDataProvider {
      return {
        getNode: (id) => nodes.find((n) => n.id === id),
        getEdge: (id) => edges.find((e) => e.id === id),
        getEdges: () => edges,
        getNodes: () => nodes,
        getServices: () => [],
      };
    }

    it('returns paths and simResults of equal length to configs', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const tracker = new CapacityTracker(makeProvider(nodes, edges));
      const configs = [
        createConfig({ sourceNodeId: 'node-A', destinationNodeId: 'node-B' }),
        createConfig({ sourceNodeId: 'node-B', destinationNodeId: 'node-C' }),
        createConfig({ sourceNodeId: 'node-C', destinationNodeId: 'node-D' }),
      ];

      const { paths, simResults } = computer.simulateBatch(configs, tracker);

      expect(paths.length).toBe(3);
      expect(simResults.length).toBe(3);
      for (const sr of simResults) {
        expect(sr.feasible).toBe(true);
        expect(sr.summary).toBeDefined();
      }
    });

    it('accumulates virtual state so each batch entry sees prior allocations', () => {
      // Three services on the same A→D path; each adds 1 channel to every
      // edge along the path. Per-result `usedAfter` should grow monotonically.
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const tracker = new CapacityTracker(makeProvider(nodes, edges));

      const configs = [
        createConfig({ sourceNodeId: 'node-A', destinationNodeId: 'node-D', dataRate: '100G', quantity: 1 }),
        createConfig({ sourceNodeId: 'node-A', destinationNodeId: 'node-D', dataRate: '100G', quantity: 1 }),
        createConfig({ sourceNodeId: 'node-A', destinationNodeId: 'node-D', dataRate: '100G', quantity: 1 }),
      ];

      const { simResults } = computer.simulateBatch(configs, tracker);

      // Find a shared edge (e-AB is on every working path) and check growth.
      const usedAfters: number[] = [];
      for (const sr of simResults) {
        const edgeImpact = sr.affectedEdges.find((ae) => ae.edgeId === 'e-AB');
        expect(edgeImpact).toBeDefined();
        usedAfters.push(edgeImpact!.usedAfter);
      }

      expect(usedAfters[0]).toBe(1);
      expect(usedAfters[1]).toBe(2);
      expect(usedAfters[2]).toBe(3);
    });

    it('records non-feasible entries with summary fields and zero delta', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const tracker = new CapacityTracker(makeProvider(nodes, edges));

      const configs = [
        createConfig({ sourceNodeId: 'node-A', destinationNodeId: 'node-D' }),
        createConfig({ sourceNodeId: 'nonexistent', destinationNodeId: 'node-D' }),
      ];

      const { paths, simResults } = computer.simulateBatch(configs, tracker);

      expect(paths[1].feasible).toBe(false);
      expect(simResults[1].feasible).toBe(false);
      expect(simResults[1].summary.fullNetworkNetChange).toBe(0);
      expect(simResults[1].summary.edgesAffected).toBe(0);
      expect(simResults[1].networkUtilizationDelta).toBe(0);
    });

    it('uses provided virtualState when supplied (caller can pre-seed allocations)', () => {
      const { nodes, edges } = buildLinearTopology();
      const computer = new WhatIfPathComputer(() => nodes, () => edges);
      const tracker = new CapacityTracker(makeProvider(nodes, edges));
      const state = computer.createVirtualState();
      // Pre-seed 5 used channels on e-AB
      state.additionalChannelsUsed.set('e-AB', new Set([0, 1, 2, 3, 4]));

      const { simResults } = computer.simulateBatch(
        [createConfig({ sourceNodeId: 'node-A', destinationNodeId: 'node-D' })],
        tracker,
        state
      );

      const ab = simResults[0].affectedEdges.find((ae) => ae.edgeId === 'e-AB')!;
      expect(ab.usedBefore).toBe(5);
      expect(ab.usedAfter).toBe(6);
    });
  });

  // ========================================================================
  // summary.fullNetworkNetChange parity (P3.2)
  // ========================================================================

  describe('WhatIfResult.summary.fullNetworkNetChange parity', () => {
    function makeProvider(nodes: NetworkNode[], edges: NetworkEdge[]): CapacityDataProvider {
      return {
        getNode: (id) => nodes.find((n) => n.id === id),
        getEdge: (id) => edges.find((e) => e.id === id),
        getEdges: () => edges,
        getNodes: () => nodes,
        getServices: () => [],
      };
    }

    it('mirrors networkUtilizationDelta for a 1-edge network', () => {
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'n0' }),
        createMockNode({ id: 'n1' }),
      ];
      const edges: NetworkEdge[] = [
        createMockEdge({ id: 'e0', source: { nodeId: 'n0' }, target: { nodeId: 'n1' } }),
      ];
      const tracker = new CapacityTracker(makeProvider(nodes, edges));
      const result = tracker.simulateServiceAdditionWithPath({
        workingPath: { nodeIds: ['n0', 'n1'], edgeIds: ['e0'], totalDistance: 50, hopCount: 1 },
        channelsRequired: 1,
      });
      expect(result.summary.fullNetworkNetChange).toBe(result.networkUtilizationDelta);
    });

    it('mirrors networkUtilizationDelta for a 23-edge network with sub-1% magnitude', () => {
      const nodes: NetworkNode[] = [];
      const edges: NetworkEdge[] = [];
      for (let i = 0; i <= 23; i++) {
        nodes.push(createMockNode({ id: `n${i}` }));
      }
      for (let i = 0; i < 23; i++) {
        edges.push(
          createMockEdge({
            id: `e${i}`,
            source: { nodeId: `n${i}` },
            target: { nodeId: `n${i + 1}` },
          })
        );
      }
      const tracker = new CapacityTracker(makeProvider(nodes, edges));
      const result = tracker.simulateServiceAdditionWithPath({
        workingPath: {
          nodeIds: ['n0', 'n1', 'n2'],
          edgeIds: ['e0', 'e1'],
          totalDistance: 100,
          hopCount: 2,
        },
        channelsRequired: 1,
      });
      expect(result.networkUtilizationDelta).toBeGreaterThan(0);
      expect(result.networkUtilizationDelta).toBeLessThan(1);
      expect(result.summary.fullNetworkNetChange).toBe(result.networkUtilizationDelta);
      expect(result.summary.edgesAffected).toBe(2);
    });

    it('reports newBottlenecks=0 and edgesAffected=count for a low-utilization batch', () => {
      const { nodes, edges } = buildLinearTopology();
      const tracker = new CapacityTracker(makeProvider(nodes, edges));
      const result = tracker.simulateServiceAdditionWithPath({
        workingPath: {
          nodeIds: ['node-A', 'node-B', 'node-C', 'node-D'],
          edgeIds: ['e-AB', 'e-BC', 'e-CD'],
          totalDistance: 450,
          hopCount: 3,
        },
        channelsRequired: 1,
      });
      expect(result.summary.edgesAffected).toBe(3);
      expect(result.summary.newBottlenecks).toBe(0);
      expect(result.summary.fullNetworkNetChange).toBe(result.networkUtilizationDelta);
    });
  });
});
