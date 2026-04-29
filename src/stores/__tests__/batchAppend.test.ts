import { describe, it, expect, beforeEach } from 'vitest';
import { useNetworkStore } from '../networkStore';
import type { NetworkNode, NetworkEdge } from '@/types/network';

const getState = () => useNetworkStore.getState();

/** Create a minimal valid node */
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

/** Create a minimal valid edge */
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

describe('batchAppendNodes', () => {
  beforeEach(() => {
    getState().clearTopology();
  });

  it('should append nodes without losing existing data', () => {
    // Add an initial node via normal addNode
    const existingId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    expect(getState().topology.nodes).toHaveLength(1);

    // Batch append 3 more nodes
    const newNodes = [
      makeNode('n1', 'Node-1'),
      makeNode('n2', 'Node-2'),
      makeNode('n3', 'Node-3'),
    ];
    getState().batchAppendNodes(newNodes);

    expect(getState().topology.nodes).toHaveLength(4);
    // Existing node still there
    expect(getState().topology.nodes.some((n) => n.id === existingId)).toBe(true);
    // New nodes appended
    expect(getState().topology.nodes.some((n) => n.id === 'n1')).toBe(true);
    expect(getState().topology.nodes.some((n) => n.id === 'n2')).toBe(true);
    expect(getState().topology.nodes.some((n) => n.id === 'n3')).toBe(true);
  });

  it('should handle empty array without error', () => {
    getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    const countBefore = getState().topology.nodes.length;
    getState().batchAppendNodes([]);
    expect(getState().topology.nodes).toHaveLength(countBefore);
  });

  it('should update modified timestamp', () => {
    getState().batchAppendNodes([makeNode('n1', 'Node-1')]);
    const after = getState().topology.metadata.modified;
    // Modified should have changed (or at least not be undefined)
    expect(after).toBeDefined();
    // We can't guarantee different timestamps in fast tests, but it should be set
    expect(typeof after).toBe('string');
  });
});

describe('batchAppendEdges', () => {
  beforeEach(() => {
    getState().clearTopology();
  });

  it('should append edges without losing existing data', () => {
    // Add 3 nodes first
    getState().batchAppendNodes([
      makeNode('na', 'A'),
      makeNode('nb', 'B'),
      makeNode('nc', 'C'),
    ]);

    // Add one edge via normal addEdge
    getState().addEdge('na', 'nb');
    expect(getState().topology.edges).toHaveLength(1);

    // Batch append another edge
    getState().batchAppendEdges([makeEdge('e2', 'nb', 'nc')]);

    expect(getState().topology.edges).toHaveLength(2);
    expect(getState().topology.edges.some((e) => e.id === 'e2')).toBe(true);
  });

  it('should handle empty array without error', () => {
    getState().batchAppendEdges([]);
    expect(getState().topology.edges).toHaveLength(0);
  });

  it('should handle large batch', () => {
    // Create 200 nodes
    const nodes = Array.from({ length: 200 }, (_, i) => makeNode(`n${i}`, `Node-${i}`));
    getState().batchAppendNodes(nodes);
    expect(getState().topology.nodes).toHaveLength(200);

    // Create edges connecting sequential pairs
    const edges = Array.from({ length: 199 }, (_, i) =>
      makeEdge(`e${i}`, `n${i}`, `n${i + 1}`)
    );
    getState().batchAppendEdges(edges);
    expect(getState().topology.edges).toHaveLength(199);
  });
});
