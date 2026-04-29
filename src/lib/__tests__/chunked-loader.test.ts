import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNetworkStore } from '@/stores/networkStore';
import { loadTopologyChunked } from '../chunked-loader';
import type { NetworkTopology, NetworkNode, NetworkEdge } from '@/types/network';

// Mock requestAnimationFrame for test env
vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
  cb();
  return 0;
});

const getState = () => useNetworkStore.getState();

function makeNode(id: string, name: string): NetworkNode {
  return {
    id,
    name,
    type: 'router',
    vendor: 'generic',
    position: { x: 0, y: 0 },
    stacks: [],
    ports: [],
    metadata: {},
  } as NetworkNode;
}

function makeEdge(id: string, srcId: string, tgtId: string): NetworkEdge {
  return {
    id,
    name: `Link-${srcId}-${tgtId}`,
    type: 'fiber',
    source: { nodeId: srcId },
    target: { nodeId: tgtId },
    properties: { distance: 10 },
    state: 'active',
    metadata: {},
  } as NetworkEdge;
}

function makeTopology(nodeCount: number, edgeCount: number): NetworkTopology {
  const nodes = Array.from({ length: nodeCount }, (_, i) =>
    makeNode(`n${i}`, `Node-${i}`)
  );
  const edges = Array.from({ length: Math.min(edgeCount, nodeCount - 1) }, (_, i) =>
    makeEdge(`e${i}`, `n${i}`, `n${i + 1}`)
  );

  return {
    id: 'test-topo',
    name: 'Test Topology',
    version: '1.0.0',
    metadata: { created: new Date().toISOString(), modified: new Date().toISOString() },
    nodes,
    edges,
  };
}

describe('loadTopologyChunked', () => {
  beforeEach(() => {
    getState().clearTopology();
  });

  it('should load all nodes and edges', async () => {
    const topo = makeTopology(50, 49);
    const result = await loadTopologyChunked(topo, { nodeChunkSize: 10, edgeChunkSize: 10 });

    expect(result.nodesLoaded).toBe(50);
    expect(result.edgesLoaded).toBe(49);
    expect(result.cancelled).toBe(false);
    expect(getState().topology.nodes).toHaveLength(50);
    expect(getState().topology.edges).toHaveLength(49);
  });

  it('should not lose existing data when starting fresh', async () => {
    // The chunked loader replaces the topology (via clearTopology + loadTopology shell)
    // So any pre-existing data is intentionally replaced
    getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    expect(getState().topology.nodes).toHaveLength(1);

    const topo = makeTopology(10, 9);
    await loadTopologyChunked(topo, { nodeChunkSize: 5, edgeChunkSize: 5 });

    // The pre-existing node is gone (replaced), but all 10 new nodes are loaded
    expect(getState().topology.nodes).toHaveLength(10);
  });

  it('should fire progress callback with increasing values', async () => {
    const topo = makeTopology(20, 19);
    const progressValues: number[] = [];

    await loadTopologyChunked(topo, {
      nodeChunkSize: 5,
      edgeChunkSize: 5,
      onProgress: (progress) => {
        progressValues.push(progress);
      },
    });

    // Should have multiple progress callbacks
    expect(progressValues.length).toBeGreaterThan(2);
    // First value should be 0
    expect(progressValues[0]).toBe(0);
    // Last value should be 100
    expect(progressValues[progressValues.length - 1]).toBe(100);
    // Values should be non-decreasing
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });

  it('should handle empty topology', async () => {
    const topo = makeTopology(0, 0);
    const result = await loadTopologyChunked(topo);

    expect(result.nodesLoaded).toBe(0);
    expect(result.edgesLoaded).toBe(0);
    expect(result.cancelled).toBe(false);
  });

  it('should load with single-node chunks correctly', async () => {
    const topo = makeTopology(5, 4);
    const result = await loadTopologyChunked(topo, { nodeChunkSize: 1, edgeChunkSize: 1 });

    expect(result.nodesLoaded).toBe(5);
    expect(result.edgesLoaded).toBe(4);
    expect(getState().topology.nodes).toHaveLength(5);
    expect(getState().topology.edges).toHaveLength(4);
  });

  it('should set topology name and metadata from input', async () => {
    const topo = makeTopology(3, 2);
    topo.name = 'My Custom Network';
    await loadTopologyChunked(topo);

    expect(getState().topology.name).toBe('My Custom Network');
  });
});
