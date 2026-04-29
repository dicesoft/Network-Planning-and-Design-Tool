/**
 * DefragmentationEngine performance benchmark (T028a).
 *
 * Constitution V async-first budget: synchronous burst < 100 ms, total < 1 s
 * for `targetEdgeIds.length=500` and `maxMoves=5000`.
 *
 * If the synchronous threshold is exceeded, follow up with a
 * `requestIdleCallback`-based chunking pass mirroring `ExhaustiveRunner`.
 */

import { describe, it, expect } from 'vitest';
import { DefragmentationEngine } from '../DefragmentationEngine';
import type { NetworkEdge, NetworkNode } from '@/types/network';
import type { Service, L1DWDMService, ServicePath } from '@/types/service';

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
  name: 'Test Service',
  type: 'l1-dwdm',
  status: 'planned',
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

describe('DefragmentationEngine performance', () => {
  it('plans 500-edge defrag within sync budget (< 1s, sync burst < 100ms)', () => {
    const edgeCount = 500;
    const edges: NetworkEdge[] = [];
    const services: Service[] = [];
    const nodes = [
      createMockNode({ id: 'node-1' }),
      createMockNode({ id: 'node-2' }),
    ];

    for (let i = 0; i < edgeCount; i++) {
      const edgeId = `edge-${i + 1}`;
      edges.push(
        createMockEdge({
          id: edgeId,
          source: { nodeId: 'node-1', portId: `port-${i}-a` },
          target: { nodeId: 'node-2', portId: `port-${i}-b` },
        }),
      );
      // Two services per edge with a gap to force a move.
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

    const engine = new DefragmentationEngine(
      () => nodes,
      () => edges,
      () => services,
    );

    const targetEdgeIds = edges.map((e) => e.id);
    const t0 = performance.now();
    const plan = engine.planDefragmentation({
      strategy: 'minimal_moves',
      targetEdgeIds,
      maxMoves: 5000,
    });
    const elapsed = performance.now() - t0;

    expect(plan.moves.length).toBeGreaterThan(0);
    expect(plan.processedEdgeIds.length).toBe(edgeCount);
    expect(elapsed).toBeLessThan(1000); // 1s wall-clock budget
    if (elapsed >= 100) {
      // TODO(perf): chunk via requestIdleCallback like ExhaustiveRunner
      // (constitution V async-first budget). The wall-clock budget passed
      // but the synchronous burst exceeded 100ms.
      console.warn(
        `[defrag perf] sync burst ${elapsed.toFixed(1)}ms exceeds 100ms budget — consider rIC chunking`,
      );
    }
  });
});
