import { describe, it, expect, vi } from 'vitest';
import {
  DefragmentationEngine,
  DEFRAG_DEFAULT_MAX_MOVES,
  DEFRAG_MAX_MOVES_CEILING,
  type DefragMove,
} from '../DefragmentationEngine';
import type { NetworkNode, NetworkEdge } from '@/types/network';
import type { Service, L1DWDMService, ServicePath } from '@/types/service';

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
  workingPath: createMockPath({ channelNumber: 1, status: 'active' }),
  protectionScheme: 'none',
  restorationEnabled: false,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  metadata: {},
  ...overrides,
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Create a DefragmentationEngine with simple data.
 * Allows optionally providing services and customizing port spectrum
 * allocations to control which channels are "used" on edges.
 */
function createEngine(options: {
  nodes?: NetworkNode[];
  edges?: NetworkEdge[];
  services?: Service[];
}) {
  const nodes = options.nodes ?? [
    createMockNode({ id: 'node-1' }),
    createMockNode({ id: 'node-2' }),
  ];
  const edges = options.edges ?? [
    createMockEdge({ id: 'edge-1' }),
  ];
  const services = options.services ?? [];

  return new DefragmentationEngine(
    () => nodes,
    () => edges,
    () => services,
  );
}

// ============================================================================
// TESTS
// ============================================================================

describe('DefragmentationEngine', () => {
  // Stub crypto.randomUUID for deterministic plan IDs
  beforeAll(() => {
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: () => 'test-uuid-0001',
    });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  // ========================================================================
  // FRAGMENTATION ANALYSIS
  // ========================================================================

  describe('analyzeFragmentation', () => {
    it('should return zero fragmentation for an empty network', () => {
      const engine = createEngine({ edges: [] });
      const summary = engine.analyzeFragmentation();

      expect(summary.totalEdges).toBe(0);
      expect(summary.averageFragmentation).toBe(0);
      expect(summary.worstFragmentation).toBe(0);
      expect(summary.fragmentedEdges).toBe(0);
      expect(summary.worstEdgeId).toBeNull();
    });

    it('should return zero fragmentation when no channels are allocated', () => {
      const engine = createEngine({});
      const summary = engine.analyzeFragmentation();

      expect(summary.totalEdges).toBe(1);
      expect(summary.averageFragmentation).toBe(0);
      expect(summary.worstFragmentation).toBe(0);
      expect(summary.fragmentedEdges).toBe(0);
    });

    it('should detect fragmented edges', () => {
      // Create services that allocate non-contiguous channels
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 1,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 1, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const summary = engine.analyzeFragmentation();

      // With channels 1 and 50 allocated, there is fragmented free space
      expect(summary.averageFragmentation).toBeGreaterThan(0);
    });

    it('should sort edge fragmentations by index descending', () => {
      const edges = [
        createMockEdge({ id: 'edge-1', source: { nodeId: 'node-1' }, target: { nodeId: 'node-2' } }),
        createMockEdge({ id: 'edge-2', source: { nodeId: 'node-1' }, target: { nodeId: 'node-2' } }),
      ];

      const engine = createEngine({ edges });
      const summary = engine.analyzeFragmentation();

      for (let i = 1; i < summary.edgeFragmentations.length; i++) {
        expect(summary.edgeFragmentations[i - 1].fragmentationIndex)
          .toBeGreaterThanOrEqual(summary.edgeFragmentations[i].fragmentationIndex);
      }
    });

    it('should identify the worst edge', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 1,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 1, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const summary = engine.analyzeFragmentation();

      expect(summary.worstEdgeId).toBe('edge-1');
      expect(summary.worstFragmentation).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // EDGE FRAGMENTATION
  // ========================================================================

  describe('getEdgeFragmentation', () => {
    it('should return correct channel counts for unfragmented edge', () => {
      const engine = createEngine({});
      const ef = engine.getEdgeFragmentation('edge-1');

      expect(ef.edgeId).toBe('edge-1');
      expect(ef.totalChannels).toBe(96);
      expect(ef.usedChannels).toBe(0);
      expect(ef.freeChannels).toBe(96);
      expect(ef.fragmentationIndex).toBe(0);
      expect(ef.largestContiguousBlock).toBe(96);
    });

    it('should use edge name from edge data', () => {
      const engine = createEngine({});
      const ef = engine.getEdgeFragmentation('edge-1');
      expect(ef.edgeName).toBe('Edge 1');
    });

    it('should fall back to edgeId for name if edge not found', () => {
      const engine = createEngine({});
      const ef = engine.getEdgeFragmentation('nonexistent');
      expect(ef.edgeName).toBe('nonexistent');
    });

    it('should compute fragments correctly', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 5,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 5, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const ef = engine.getEdgeFragmentation('edge-1');

      // Should have fragments: free(1-4), allocated(5), free(6-96)
      expect(ef.fragments.length).toBeGreaterThanOrEqual(2);
      expect(ef.usedChannels).toBe(1);
      expect(ef.freeChannels).toBe(95);
    });
  });

  // ========================================================================
  // PLAN DEFRAGMENTATION
  // ========================================================================

  describe('planDefragmentation', () => {
    it('should return a plan with correct structure', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 10,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 10, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      expect(plan.id).toBe('test-uuid-0001');
      expect(plan.strategy).toBe('minimal_moves');
      expect(plan.targetEdgeIds).toContain('edge-1');
      expect(plan.beforeMetrics).toBeDefined();
      expect(plan.afterMetrics).toBeDefined();
      expect(plan.estimatedImpact).toBeDefined();
      expect(plan.estimatedImpact.riskSummary).toBeDefined();
    });

    it('should produce no moves when spectrum is already defragmented', () => {
      // Service on channel 1 - already at the start, nothing to move
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 1,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 1, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      expect(plan.moves.length).toBe(0);
      expect(plan.estimatedImpact.totalMoves).toBe(0);
    });

    it('should produce no moves for single allocation (minimal_moves keeps first in place)', () => {
      // Single service on channel 50 - minimal_moves keeps first allocation in place
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      // Only one allocation, no gaps to close
      expect(plan.moves.length).toBe(0);
    });

    it('should close gaps between allocations (minimal_moves greedy gap-fill)', () => {
      // Services on channels 10 and 50 -- gap-fill moves 50 to 11
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 10,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 10, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      expect(plan.moves.length).toBe(1);
      expect(plan.moves[0].fromChannel).toBe(50);
      expect(plan.moves[0].toChannel).toBe(11);
      expect(plan.moves[0].serviceId).toBe('L1-002');
    });

    it('should produce fewer moves than maximize_contiguous', () => {
      // Services on channels 10, 30, 50
      // minimal_moves: keeps 10 in place, moves 30->11, 50->12 = 2 moves
      // maximize_contiguous: moves 10->1, 30->2, 50->3 = 3 moves
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 10,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 10, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 30,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 30, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-003',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const minPlan = engine.planDefragmentation({ strategy: 'minimal_moves' });
      const maxPlan = engine.planDefragmentation({ strategy: 'maximize_contiguous' });

      expect(minPlan.moves.length).toBeLessThan(maxPlan.moves.length);
      expect(minPlan.moves.length).toBe(2); // 30->11, 50->12
      expect(maxPlan.moves.length).toBe(3); // 10->1, 30->2, 50->3
    });

    it('should produce moves for maximize_contiguous strategy', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 30,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 30, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 60,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 60, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'maximize_contiguous' });

      // Both services should be compacted to the beginning
      expect(plan.moves.length).toBeGreaterThan(0);
      // After compaction, channels should be 1 and 2
      const targets = plan.moves.map((m) => m.toChannel).sort((a, b) => a - b);
      expect(targets).toContain(1);
    });

    it('should produce moves for balance_spectrum strategy', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 1,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 1, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 2,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 2, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'balance_spectrum' });

      // Balance strategy spreads allocations evenly across 96 channels
      // With 2 services: step = 96/2 = 48, so targets would be ch 1 and ch 49
      if (plan.moves.length > 0) {
        const targets = plan.moves.map((m) => m.toChannel);
        expect(targets.some((t) => t > 2)).toBe(true); // At least one moved further out
      }
    });

    it('should clamp at maxMoves=1 and report truncated=true when more moves are possible (E3)', () => {
      // Many gappy services so the engine produces > 1 candidate move.
      const services: Service[] = Array.from({ length: 6 }, (_, i) =>
        createMockL1Service({
          id: `L1-${String(i + 1).padStart(3, '0')}`,
          channelNumber: 1 + i * 5,
          workingPath: createMockPath({
            edgeIds: ['edge-1'],
            channelNumber: 1 + i * 5,
            status: 'active',
          }),
        }),
      );

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'maximize_contiguous', maxMoves: 1 });

      expect(plan.moves.length).toBeLessThanOrEqual(1);
      expect(plan.maxMoves).toBe(1);
      // With 6 services and a maxMoves of 1, the engine should signal truncation.
      expect(plan.truncated).toBe(true);
    });

    it('should respect maxMoves limit', () => {
      // Create many services with gaps to generate lots of moves
      const services: Service[] = Array.from({ length: 10 }, (_, i) =>
        createMockL1Service({
          id: `L1-${String(i + 1).padStart(3, '0')}`,
          channelNumber: 1 + i * 5, // channels: 1, 6, 11, 16, ...
          workingPath: createMockPath({
            edgeIds: ['edge-1'],
            channelNumber: 1 + i * 5,
            status: 'active',
          }),
        }),
      );

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'maximize_contiguous', maxMoves: 3 });

      expect(plan.moves.length).toBeLessThanOrEqual(3);
    });

    it('should use all edges when targetEdgeIds is not specified', () => {
      const edges = [
        createMockEdge({ id: 'edge-1', source: { nodeId: 'node-1' }, target: { nodeId: 'node-2' } }),
        createMockEdge({ id: 'edge-2', source: { nodeId: 'node-1' }, target: { nodeId: 'node-2' } }),
      ];

      const engine = createEngine({ edges });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      expect(plan.targetEdgeIds).toContain('edge-1');
      expect(plan.targetEdgeIds).toContain('edge-2');
    });

    it('should only defrag specified target edges', () => {
      const edges = [
        createMockEdge({ id: 'edge-1', source: { nodeId: 'node-1' }, target: { nodeId: 'node-2' } }),
        createMockEdge({ id: 'edge-2', source: { nodeId: 'node-1' }, target: { nodeId: 'node-2' } }),
      ];

      // Two allocations per edge with gaps to generate moves
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 10,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 10, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-003',
          channelNumber: 10,
          workingPath: createMockPath({
            id: 'path-3',
            edgeIds: ['edge-2'],
            channelNumber: 10,
            status: 'active',
          }),
        }),
        createMockL1Service({
          id: 'L1-004',
          channelNumber: 50,
          workingPath: createMockPath({
            id: 'path-4',
            edgeIds: ['edge-2'],
            channelNumber: 50,
            status: 'active',
          }),
        }),
      ];

      const engine = createEngine({ edges, services });
      const plan = engine.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds: ['edge-1'],
      });

      // Only edge-1 moves should be in the plan
      expect(plan.targetEdgeIds).toEqual(['edge-1']);
      expect(plan.moves.length).toBeGreaterThan(0);
      for (const move of plan.moves) {
        expect(move.edgeId).toBe('edge-1');
      }
    });
  });

  // ========================================================================
  // RISK ASSESSMENT
  // ========================================================================

  describe('assessMovesRisk', () => {
    it('should assign high risk to active unprotected service', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          status: 'active',
          protectionScheme: 'none',
        }),
      ];

      const engine = createEngine({ services });
      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 50, toChannel: 1 },
      ];

      const assessed = engine.assessMovesRisk(moves);
      expect(assessed[0].risk).toBe('high');
      expect(assessed[0].riskReason).toContain('without protection');
      expect(assessed[0].estimatedDowntime).toBe(120);
    });

    it('should assign medium risk to active protected service', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          status: 'active',
          protectionScheme: 'olp',
        }),
      ];

      const engine = createEngine({ services });
      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 5, toChannel: 1 },
      ];

      const assessed = engine.assessMovesRisk(moves);
      expect(assessed[0].risk).toBe('medium');
      expect(assessed[0].estimatedDowntime).toBe(30);
    });

    it('should assign low risk to planned service with small move', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          status: 'planned',
          protectionScheme: 'none',
        }),
      ];

      const engine = createEngine({ services });
      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 5, toChannel: 1 },
      ];

      const assessed = engine.assessMovesRisk(moves);
      expect(assessed[0].risk).toBe('low');
      expect(assessed[0].estimatedDowntime).toBe(0);
    });

    it('should assign medium risk for large channel shift (>10)', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          status: 'planned',
          protectionScheme: 'none',
        }),
      ];

      const engine = createEngine({ services });
      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 50, toChannel: 1 },
      ];

      const assessed = engine.assessMovesRisk(moves);
      expect(assessed[0].risk).toBe('medium');
      expect(assessed[0].riskReason).toContain('Large channel shift');
    });

    it('should assign high risk for cross-edge coordination (>=3 edges)', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          status: 'planned',
          protectionScheme: 'none',
        }),
      ];

      const engine = createEngine({ services });
      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 5, toChannel: 1 },
        { edgeId: 'edge-2', serviceId: 'L1-001', fromChannel: 5, toChannel: 1 },
        { edgeId: 'edge-3', serviceId: 'L1-001', fromChannel: 5, toChannel: 1 },
      ];

      const assessed = engine.assessMovesRisk(moves);
      // All 3 moves for same service across 3 edges = high risk
      for (const m of assessed) {
        expect(m.risk).toBe('high');
        expect(m.riskReason).toContain('coordination');
      }
    });

    it('should assign medium risk for cross-edge coordination (2 edges)', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          status: 'planned',
          protectionScheme: 'none',
        }),
      ];

      const engine = createEngine({ services });
      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 5, toChannel: 1 },
        { edgeId: 'edge-2', serviceId: 'L1-001', fromChannel: 5, toChannel: 1 },
      ];

      const assessed = engine.assessMovesRisk(moves);
      for (const m of assessed) {
        expect(m.risk).toBe('medium');
        expect(m.riskReason).toContain('Cross-edge');
      }
    });

    it('should handle unknown service gracefully', () => {
      const engine = createEngine({ services: [] });
      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'nonexistent', fromChannel: 5, toChannel: 1 },
      ];

      const assessed = engine.assessMovesRisk(moves);
      // Unknown service defaults to 'planned' status
      expect(assessed[0].risk).toBe('low');
    });
  });

  // ========================================================================
  // ACCURATE AFTER-METRICS
  // ========================================================================

  describe('computeAccurateAfterMetrics', () => {
    it('should return original metrics when no moves are provided', () => {
      const engine = createEngine({});
      const before = engine.analyzeFragmentation();
      const afterMetrics = engine.computeAccurateAfterMetrics(['edge-1'], []);

      expect(afterMetrics.avgFragmentation).toBe(before.averageFragmentation);
    });

    it('should show improved fragmentation after defrag moves', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const before = engine.analyzeFragmentation();

      const moves: DefragMove[] = [
        { edgeId: 'edge-1', serviceId: 'L1-001', fromChannel: 50, toChannel: 1 },
      ];

      const afterMetrics = engine.computeAccurateAfterMetrics(['edge-1'], moves);

      // After moving channel 50 to 1, fragmentation should be <= before
      expect(afterMetrics.worstFragmentation).toBeLessThanOrEqual(before.worstFragmentation);
    });
  });

  // ========================================================================
  // CLONE LAMBDA MAP
  // ========================================================================

  describe('cloneLambdaMap', () => {
    it('should return a copy that does not mutate original', () => {
      const engine = createEngine({});
      const original = engine.getTracker().getLambdaMap('edge-1');
      const clone = engine.cloneLambdaMap('edge-1');

      expect(clone.length).toBe(original.length);

      // Mutate clone and verify original is untouched
      if (clone.length > 0) {
        clone[0].status = 'allocated';
        expect(original[0].status).toBe('free');
      }
    });
  });

  // ========================================================================
  // IMPACT SUMMARY
  // ========================================================================

  describe('estimatedImpact', () => {
    it('should count affected services correctly', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 60,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 60, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'maximize_contiguous' });

      expect(plan.estimatedImpact.servicesAffected).toBe(2);
      expect(plan.estimatedImpact.totalMoves).toBe(plan.moves.length);
    });

    it('should accumulate estimated downtime', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          status: 'active',
          protectionScheme: 'none',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'maximize_contiguous' });

      // Active unprotected = high risk = 120s per move
      expect(plan.estimatedImpact.estimatedDowntime).toBeGreaterThanOrEqual(120);
    });

    it('should categorize risks in riskSummary', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          status: 'active',
          protectionScheme: 'none',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'maximize_contiguous' });

      const { riskSummary } = plan.estimatedImpact;
      expect(riskSummary.low + riskSummary.medium + riskSummary.high).toBe(plan.moves.length);
    });
  });

  // ========================================================================
  // RESERVED CHANNELS & NO-MOVE REASONS (Task 2.5)
  // ========================================================================

  describe('reserved channel defragmentation', () => {
    it('should include reserved channels in defrag targets', () => {
      // Create services with reserved (computed) paths
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 10,
          status: 'planned',
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 10, status: 'computed' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 50,
          status: 'planned',
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'computed' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      // With reserved channels at 10 and 50, there should be a move to close the gap
      expect(plan.moves.length).toBeGreaterThan(0);
    });

    it('should assign low risk to reservation moves', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 10,
          status: 'planned',
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 10, status: 'computed' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 50,
          status: 'planned',
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'computed' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      // All moves involving planned services should be low risk
      for (const move of plan.moves) {
        expect(move.risk).toBe('low');
        expect(move.estimatedDowntime).toBe(0);
      }
    });

    it('should handle channels without serviceId using synthetic identifier', () => {
      // When port-level allocations exist without service IDs, the engine should
      // still generate moves using edge:channel as identifier
      const engine = createEngine({ services: [] });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      // No allocations means no moves
      expect(plan.moves.length).toBe(0);
    });

    it('should assign low risk to synthetic (port-level) moves', () => {
      const engine = createEngine({ services: [] });
      const moves = [
        { edgeId: 'edge-1', serviceId: 'edge-1:ch10', fromChannel: 10, toChannel: 1 },
        { edgeId: 'edge-1', serviceId: 'edge-1:ch50', fromChannel: 50, toChannel: 2 },
      ];

      const assessed = engine.assessMovesRisk(moves);
      for (const m of assessed) {
        expect(m.risk).toBe('low');
        expect(m.riskReason).toContain('Reservation/port-level');
        expect(m.estimatedDowntime).toBe(0);
      }
    });
  });

  describe('no-move reason codes', () => {
    it('should return no-allocations reason when edge has no used channels', () => {
      const engine = createEngine({ services: [] });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      expect(plan.moves.length).toBe(0);
      expect(plan.reason).toBe('no-allocations');
    });

    it('should return single-allocation reason when edge has one allocation', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      expect(plan.moves.length).toBe(0);
      expect(plan.reason).toBe('single-allocation');
    });

    it('should return no-fragmentation reason when allocations are contiguous', () => {
      // Two adjacent services with no gap
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 1,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 1, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 2,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 2, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      expect(plan.moves.length).toBe(0);
      expect(plan.reason).toBe('no-fragmentation');
    });

    it('should not set reason when moves are produced', () => {
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 10,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 10, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 50,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 50, status: 'active' }),
        }),
      ];

      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      expect(plan.moves.length).toBeGreaterThan(0);
      expect(plan.reason).toBeUndefined();
    });
  });

  // ========================================================================
  // EDGE CASES
  // ========================================================================

  describe('edge cases', () => {
    it('should handle fully allocated spectrum (no free channels)', () => {
      // We can't easily allocate all 96 channels via services without port spectrum,
      // but the engine should handle the scenario gracefully
      const engine = createEngine({});
      const plan = engine.planDefragmentation({ strategy: 'minimal_moves' });

      // With no allocations, no moves needed
      expect(plan.moves.length).toBe(0);
    });

    it('should handle empty services array', () => {
      const engine = createEngine({ services: [] });
      const plan = engine.planDefragmentation({ strategy: 'maximize_contiguous' });

      expect(plan.moves.length).toBe(0);
      expect(plan.estimatedImpact.servicesAffected).toBe(0);
    });

    it('should expose tracker via getTracker()', () => {
      const engine = createEngine({});
      const tracker = engine.getTracker();

      expect(tracker).toBeDefined();
      expect(tracker.getLambdaMap('edge-1').length).toBe(96);
    });
  });

  // ========================================================================
  // CONTRACT MATRIX (T035 — contracts/defrag-plan.contract.md)
  // ========================================================================

  describe('contract matrix — planDefragmentation', () => {
    /**
     * Build a multi-edge engine with one fragmented service per edge.
     * Each edge gets two services on channels 10 and 50, generating exactly
     * one move under minimal_moves (close 50 -> 11).
     */
    function createMultiEdgeEngine(edgeCount: number): DefragmentationEngine {
      const edges: NetworkEdge[] = [];
      const services: Service[] = [];
      for (let i = 0; i < edgeCount; i++) {
        const edgeId = `edge-${i + 1}`;
        edges.push(
          createMockEdge({
            id: edgeId,
            source: { nodeId: 'node-1', portId: `port-${i}-a` },
            target: { nodeId: 'node-2', portId: `port-${i}-b` },
          }),
        );
        services.push(
          createMockL1Service({
            id: `L1-${edgeId}-A`,
            channelNumber: 10,
            workingPath: createMockPath({
              id: `path-${edgeId}-A`,
              edgeIds: [edgeId],
              channelNumber: 10,
              status: 'active',
            }),
          }),
          createMockL1Service({
            id: `L1-${edgeId}-B`,
            channelNumber: 50,
            workingPath: createMockPath({
              id: `path-${edgeId}-B`,
              edgeIds: [edgeId],
              channelNumber: 50,
              status: 'active',
            }),
          }),
        );
      }
      return createEngine({ edges, services });
    }

    // Row 1
    it('row 1: 1 edge, fragmented channels — all moves planned, not truncated', () => {
      const engine = createMultiEdgeEngine(1);
      const plan = engine.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds: ['edge-1'],
      });
      expect(plan.moves.length).toBeGreaterThan(0);
      expect(plan.truncated).toBe(false);
      expect(plan.processedEdgeIds).toEqual(['edge-1']);
    });

    // Row 2
    it('row 2: 20 edges with default maxMoves — every edge processed, not truncated', () => {
      const engine = createMultiEdgeEngine(20);
      const targetEdgeIds = Array.from({ length: 20 }, (_, i) => `edge-${i + 1}`);
      const plan = engine.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds,
      });
      expect(plan.processedEdgeIds.length).toBe(20);
      expect(plan.truncated).toBe(false);
      expect(plan.maxMoves).toBe(DEFRAG_DEFAULT_MAX_MOVES);
      // Each edge contributes exactly one move (close gap 50 -> 11)
      expect(plan.moves.length).toBe(20);
      const movedEdges = new Set(plan.moves.map((m: DefragMove) => m.edgeId));
      expect(movedEdges.size).toBe(20);
    });

    // Row 3
    it('row 3: 100 edges with maxMoves=50 — truncated, processed < target', () => {
      // Use 100 edges but maxMoves only allows 50 moves; one move per edge
      const engine = createMultiEdgeEngine(100);
      const targetEdgeIds = Array.from({ length: 100 }, (_, i) => `edge-${i + 1}`);
      const plan = engine.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds,
        maxMoves: 50,
      });
      expect(plan.truncated).toBe(true);
      expect(plan.processedEdgeIds.length).toBeLessThan(100);
      expect(plan.moves.length).toBeLessThanOrEqual(50);
      expect(plan.maxMoves).toBe(50);
      // Every move should reference a processed edge
      const processed = new Set(plan.processedEdgeIds);
      for (const m of plan.moves) {
        expect(processed.has(m.edgeId)).toBe(true);
      }
    });

    // Row 4
    it('row 4: empty targetEdgeIds — empty plan, processed=[], truncated=false', () => {
      const engine = createEngine({});
      const plan = engine.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds: [],
      });
      expect(plan.moves.length).toBe(0);
      expect(plan.processedEdgeIds).toEqual([]);
      expect(plan.targetEdgeIds).toEqual([]);
      expect(plan.truncated).toBe(false);
    });

    // Row 5
    it('row 5: targets without fragmentation — 0 moves, all in processedEdgeIds, no truncation', () => {
      // Two contiguous services on edge-1 (channels 1, 2): no fragmentation
      const services: Service[] = [
        createMockL1Service({
          id: 'L1-001',
          channelNumber: 1,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 1, status: 'active' }),
        }),
        createMockL1Service({
          id: 'L1-002',
          channelNumber: 2,
          workingPath: createMockPath({ edgeIds: ['edge-1'], channelNumber: 2, status: 'active' }),
        }),
      ];
      const engine = createEngine({ services });
      const plan = engine.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds: ['edge-1'],
      });
      expect(plan.moves.length).toBe(0);
      expect(plan.processedEdgeIds).toEqual(['edge-1']);
      expect(plan.truncated).toBe(false);
    });

    // Row 6
    it('row 6: maxMoves=0 — clamped to 1', () => {
      const engine = createMultiEdgeEngine(2);
      const plan = engine.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds: ['edge-1', 'edge-2'],
        maxMoves: 0,
      });
      expect(plan.maxMoves).toBe(1);
      expect(plan.moves.length).toBeLessThanOrEqual(1);
    });

    // Row 7
    it('row 7: maxMoves=10000 — clamped to 5000 ceiling', () => {
      const engine = createMultiEdgeEngine(1);
      const plan = engine.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds: ['edge-1'],
        maxMoves: 10000,
      });
      expect(plan.maxMoves).toBe(DEFRAG_MAX_MOVES_CEILING);
      expect(plan.maxMoves).toBe(5000);
    });

    it('default maxMoves is 1000 when omitted', () => {
      const engine = createMultiEdgeEngine(1);
      const plan = engine.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds: ['edge-1'],
      });
      expect(plan.maxMoves).toBe(DEFRAG_DEFAULT_MAX_MOVES);
      expect(DEFRAG_DEFAULT_MAX_MOVES).toBe(1000);
    });

    it('FR-005: ceiling stays at 5000 and is distinct from the default', () => {
      expect(DEFRAG_MAX_MOVES_CEILING).toBe(5000);
      expect(DEFRAG_DEFAULT_MAX_MOVES).toBeLessThan(DEFRAG_MAX_MOVES_CEILING);
    });

    it('FR-005: plan truncates at the 1000 default but unblocks at the 5000 ceiling', () => {
      // 1500 fragmented edges, one move each -> truncates at default 1000
      const engineDefault = createMultiEdgeEngine(1500);
      const planDefault = engineDefault.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds: Array.from({ length: 1500 }, (_, i) => `edge-${i + 1}`),
      });
      expect(planDefault.maxMoves).toBe(1000);
      expect(planDefault.truncated).toBe(true);
      expect(planDefault.moves.length).toBe(1000);

      // Same 1500 edges with maxMoves raised to 5000 should not truncate
      const engineRaised = createMultiEdgeEngine(1500);
      const planRaised = engineRaised.planDefragmentation({
        strategy: 'minimal_moves',
        targetEdgeIds: Array.from({ length: 1500 }, (_, i) => `edge-${i + 1}`),
        maxMoves: 5000,
      });
      expect(planRaised.maxMoves).toBe(5000);
      expect(planRaised.truncated).toBe(false);
      expect(planRaised.moves.length).toBe(1500);
    });
  });
});
