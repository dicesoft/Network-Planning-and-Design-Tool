import { describe, it, expect } from 'vitest';
import {
  LambdaAnalyzer,
  REGEN_CAPABLE_NODE_TYPES,
} from '../LambdaAnalyzer';
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
  target: { nodeId: 'node-2', portId: 'port-2' },
  properties: { distance: 100 },
  state: 'active',
  metadata: {},
  ...overrides,
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a linear long-haul topology:
 * Terminal-A -- OADM-1 -- OADM-2 -- Terminal-B
 * Each OADM has spare DWDM ports.
 */
function buildLinearOADMTopology() {
  const nodes: NetworkNode[] = [
    createMockNode({
      id: 'term-A',
      name: 'Terminal-A',
      type: 'terminal',
      position: { x: 0, y: 0 },
      ports: [
        { id: 'pA1', name: 'DWDM-1', type: 'dwdm', dataRate: '100G', channels: 96, status: 'used', connectedEdgeId: 'e-A-O1', spectrum: { gridType: 'fixed-50ghz', allocations: [] } },
        { id: 'pA2', name: 'DWDM-2', type: 'dwdm', dataRate: '100G', channels: 96, status: 'available', spectrum: { gridType: 'fixed-50ghz', allocations: [] } },
      ],
    }),
    createMockNode({
      id: 'oadm-1',
      name: 'OADM-1',
      type: 'oadm',
      position: { x: 100, y: 0 },
      ports: [
        { id: 'pO1a', name: 'DWDM-1', type: 'dwdm', dataRate: '100G', channels: 96, status: 'used', connectedEdgeId: 'e-A-O1', spectrum: { gridType: 'fixed-50ghz', allocations: [] } },
        { id: 'pO1b', name: 'DWDM-2', type: 'dwdm', dataRate: '100G', channels: 96, status: 'used', connectedEdgeId: 'e-O1-O2', spectrum: { gridType: 'fixed-50ghz', allocations: [] } },
        { id: 'pO1c', name: 'DWDM-3', type: 'dwdm', dataRate: '100G', channels: 96, status: 'available', spectrum: { gridType: 'fixed-50ghz', allocations: [] } },
      ],
    }),
    createMockNode({
      id: 'oadm-2',
      name: 'OADM-2',
      type: 'oadm',
      position: { x: 200, y: 0 },
      ports: [
        { id: 'pO2a', name: 'DWDM-1', type: 'dwdm', dataRate: '100G', channels: 96, status: 'used', connectedEdgeId: 'e-O1-O2', spectrum: { gridType: 'fixed-50ghz', allocations: [] } },
        { id: 'pO2b', name: 'DWDM-2', type: 'dwdm', dataRate: '100G', channels: 96, status: 'used', connectedEdgeId: 'e-O2-B', spectrum: { gridType: 'fixed-50ghz', allocations: [] } },
        { id: 'pO2c', name: 'DWDM-3', type: 'dwdm', dataRate: '100G', channels: 96, status: 'available', spectrum: { gridType: 'fixed-50ghz', allocations: [] } },
      ],
    }),
    createMockNode({
      id: 'term-B',
      name: 'Terminal-B',
      type: 'terminal',
      position: { x: 300, y: 0 },
      ports: [
        { id: 'pB1', name: 'DWDM-1', type: 'dwdm', dataRate: '100G', channels: 96, status: 'used', connectedEdgeId: 'e-O2-B', spectrum: { gridType: 'fixed-50ghz', allocations: [] } },
        { id: 'pB2', name: 'DWDM-2', type: 'dwdm', dataRate: '100G', channels: 96, status: 'available', spectrum: { gridType: 'fixed-50ghz', allocations: [] } },
      ],
    }),
  ];

  const edges: NetworkEdge[] = [
    createMockEdge({
      id: 'e-A-O1',
      name: 'A-OADM1',
      source: { nodeId: 'term-A', portId: 'pA1' },
      target: { nodeId: 'oadm-1', portId: 'pO1a' },
      properties: { distance: 300 },
    }),
    createMockEdge({
      id: 'e-O1-O2',
      name: 'OADM1-OADM2',
      source: { nodeId: 'oadm-1', portId: 'pO1b' },
      target: { nodeId: 'oadm-2', portId: 'pO2a' },
      properties: { distance: 350 },
    }),
    createMockEdge({
      id: 'e-O2-B',
      name: 'OADM2-B',
      source: { nodeId: 'oadm-2', portId: 'pO2b' },
      target: { nodeId: 'term-B', portId: 'pB1' },
      properties: { distance: 250 },
    }),
  ];

  return { nodes, edges };
}

// ============================================================================
// TESTS
// ============================================================================

describe('LambdaAnalyzer', () => {
  describe('REGEN_CAPABLE_NODE_TYPES', () => {
    it('should include oadm as regen-capable', () => {
      expect(REGEN_CAPABLE_NODE_TYPES).toContain('oadm');
    });

    it('should include router as regen-capable', () => {
      expect(REGEN_CAPABLE_NODE_TYPES).toContain('router');
    });

    it('should include terminal as regen-capable', () => {
      expect(REGEN_CAPABLE_NODE_TYPES).toContain('terminal');
    });
  });

  describe('analyzeWithRegeneration - OADM regen points', () => {
    it('should identify OADM intermediate nodes as regeneration points', () => {
      const { nodes, edges } = buildLinearOADMTopology();
      const analyzer = new LambdaAnalyzer(() => nodes, () => edges);

      const report = analyzer.analyzeWithRegeneration('term-A', 'term-B');

      expect(report.pathsWithRegen.length).toBeGreaterThan(0);

      const pathRegen = report.pathsWithRegen[0];
      // Both OADM-1 and OADM-2 should be identified as regen points
      const regenNodeIds = pathRegen.regenerationPoints.map((rp) => rp.nodeId);
      expect(regenNodeIds).toContain('oadm-1');
      expect(regenNodeIds).toContain('oadm-2');
    });

    it('should split path into segments at OADM regen nodes', () => {
      const { nodes, edges } = buildLinearOADMTopology();
      const analyzer = new LambdaAnalyzer(() => nodes, () => edges);

      const report = analyzer.analyzeWithRegeneration('term-A', 'term-B');
      const pathRegen = report.pathsWithRegen[0];

      // With 2 regen points (OADM-1, OADM-2), we get 3 segments:
      // term-A -> oadm-1, oadm-1 -> oadm-2, oadm-2 -> term-B
      expect(pathRegen.segments.length).toBe(3);
      expect(pathRegen.segments[0].startNodeId).toBe('term-A');
      expect(pathRegen.segments[0].endNodeId).toBe('oadm-1');
      expect(pathRegen.segments[1].startNodeId).toBe('oadm-1');
      expect(pathRegen.segments[1].endNodeId).toBe('oadm-2');
      expect(pathRegen.segments[2].startNodeId).toBe('oadm-2');
      expect(pathRegen.segments[2].endNodeId).toBe('term-B');
    });

    it('should identify regen points even without available DWDM ports (planning mode)', () => {
      // All ports on OADM nodes are "used" (connected)
      const { nodes, edges } = buildLinearOADMTopology();
      // Remove the spare port from OADM-1
      const oadm1 = nodes.find((n) => n.id === 'oadm-1')!;
      oadm1.ports = oadm1.ports!.filter((p) => p.status !== 'available');
      // Remove the spare port from OADM-2
      const oadm2 = nodes.find((n) => n.id === 'oadm-2')!;
      oadm2.ports = oadm2.ports!.filter((p) => p.status !== 'available');

      const analyzer = new LambdaAnalyzer(() => nodes, () => edges);
      const report = analyzer.analyzeWithRegeneration('term-A', 'term-B');
      const pathRegen = report.pathsWithRegen[0];

      // Even without available ports, OADMs should still be regen points
      // (planning mode: port availability is advisory, not required)
      const regenNodeIds = pathRegen.regenerationPoints.map((rp) => rp.nodeId);
      expect(regenNodeIds).toContain('oadm-1');
      expect(regenNodeIds).toContain('oadm-2');

      // Port availability flagged as false (advisory)
      const oadm1Regen = pathRegen.regenerationPoints.find((rp) => rp.nodeId === 'oadm-1');
      expect(oadm1Regen!.hasDWDMPortsAvailable).toBe(false);

      // Segments should still be split (even without available ports)
      expect(pathRegen.segments.length).toBe(3);
    });

    it('should have availableLambdasWithRegen >= availableLambdaCount when segments have different utilization', () => {
      // In this basic test (no channel allocations), both should be equal
      // since all channels are available on all edges
      const { nodes, edges } = buildLinearOADMTopology();
      const analyzer = new LambdaAnalyzer(() => nodes, () => edges);

      const report = analyzer.analyzeWithRegeneration('term-A', 'term-B');
      const pathRegen = report.pathsWithRegen[0];

      // With regeneration, availability should be >= non-regen availability
      // (min of per-segment is >= intersection of all edges)
      expect(pathRegen.availableLambdasWithRegen).toBeGreaterThanOrEqual(
        pathRegen.availableLambdaCount
      );
    });
  });

  describe('analyzeE2EAvailability', () => {
    it('should find paths between terminal endpoints', () => {
      const { nodes, edges } = buildLinearOADMTopology();
      const analyzer = new LambdaAnalyzer(() => nodes, () => edges);

      const report = analyzer.analyzeE2EAvailability('term-A', 'term-B');

      expect(report.totalPathsAnalyzed).toBeGreaterThan(0);
      expect(report.bestPath).not.toBeNull();
      expect(report.bestPath!.nodeIds).toContain('term-A');
      expect(report.bestPath!.nodeIds).toContain('term-B');
    });

    it('should return empty report for disconnected nodes', () => {
      const nodes: NetworkNode[] = [
        createMockNode({ id: 'n1', name: 'N1', type: 'terminal' }),
        createMockNode({ id: 'n2', name: 'N2', type: 'terminal', position: { x: 100, y: 0 } }),
      ];
      const edges: NetworkEdge[] = [];

      const analyzer = new LambdaAnalyzer(() => nodes, () => edges);
      const report = analyzer.analyzeE2EAvailability('n1', 'n2');

      expect(report.totalPathsAnalyzed).toBe(0);
      expect(report.bestPath).toBeNull();
      expect(report.maxE2ELambdas).toBe(0);
    });
  });
});
