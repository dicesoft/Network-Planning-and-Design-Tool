import { describe, it, expect, beforeEach } from 'vitest';
import { useNetworkStore } from '../networkStore';

const getState = () => useNetworkStore.getState();

describe('insertAmplifierOnEdge', () => {
  let node1Id: string;
  let node2Id: string;
  let edgeId: string;

  beforeEach(() => {
    getState().clearTopology();

    node1Id = getState().addNode({
      type: 'oadm',
      position: { x: 0, y: 0 },
      name: 'OADM-A',
    });
    node2Id = getState().addNode({
      type: 'oadm',
      position: { x: 200, y: 100 },
      name: 'OADM-B',
    });
    edgeId = getState().addEdge(node1Id, node2Id)!;
    // Set a known distance on the edge
    getState().updateEdge(edgeId, {
      properties: {
        distance: 100,
        fiberProfile: { profileType: 'G.652.D' },
        srlgCodes: ['SRLG-1', 'SRLG-2'],
      },
    });
  });

  it('should insert an amplifier node and split the edge', () => {
    const result = getState().insertAmplifierOnEdge(edgeId, 40);

    expect(result.success).toBe(true);
    expect(result.amplifierNodeId).toBeDefined();

    // Original edge should be removed
    expect(getState().getEdge(edgeId)).toBeUndefined();

    // Amplifier node should exist
    const ampNode = getState().getNode(result.amplifierNodeId!);
    expect(ampNode).toBeDefined();
    expect(ampNode!.type).toBe('amplifier');
    expect(ampNode!.name).toBe('Amp-OADM-A-OADM-B');

    // Should have 2 DWDM line ports
    expect(ampNode!.ports).toHaveLength(2);
    expect(ampNode!.ports![0].name).toBe('LINE-IN');
    expect(ampNode!.ports![0].type).toBe('dwdm');
    expect(ampNode!.ports![1].name).toBe('LINE-OUT');
    expect(ampNode!.ports![1].type).toBe('dwdm');
  });

  it('should create two new edges with correct distances', () => {
    const result = getState().insertAmplifierOnEdge(edgeId, 40);
    const ampId = result.amplifierNodeId!;

    const edges = getState().topology.edges;
    expect(edges).toHaveLength(2);

    // Find edges by source/target
    const edgeToAmp = edges.find(
      (e) => e.source.nodeId === node1Id && e.target.nodeId === ampId
    );
    const edgeFromAmp = edges.find(
      (e) => e.source.nodeId === ampId && e.target.nodeId === node2Id
    );

    expect(edgeToAmp).toBeDefined();
    expect(edgeFromAmp).toBeDefined();
    expect(edgeToAmp!.properties.distance).toBe(40);
    expect(edgeFromAmp!.properties.distance).toBe(60);
  });

  it('should copy fiber profile and SRLG codes to both new edges', () => {
    const result = getState().insertAmplifierOnEdge(edgeId, 40);
    const ampId = result.amplifierNodeId!;

    const edges = getState().topology.edges;
    const edgeToAmp = edges.find(
      (e) => e.source.nodeId === node1Id && e.target.nodeId === ampId
    )!;
    const edgeFromAmp = edges.find(
      (e) => e.source.nodeId === ampId && e.target.nodeId === node2Id
    )!;

    // Fiber profile preserved
    expect(edgeToAmp.properties.fiberProfile?.profileType).toBe('G.652.D');
    expect(edgeFromAmp.properties.fiberProfile?.profileType).toBe('G.652.D');

    // SRLG codes preserved
    expect(edgeToAmp.properties.srlgCodes).toEqual(['SRLG-1', 'SRLG-2']);
    expect(edgeFromAmp.properties.srlgCodes).toEqual(['SRLG-1', 'SRLG-2']);
  });

  it('should position amplifier by interpolation', () => {
    const result = getState().insertAmplifierOnEdge(edgeId, 40);
    const ampNode = getState().getNode(result.amplifierNodeId!);

    // Source at (0,0), target at (200,100), ratio = 40/100 = 0.4
    expect(ampNode!.position.x).toBeCloseTo(80, 0);
    expect(ampNode!.position.y).toBeCloseTo(40, 0);
  });

  it('should return error for non-existent edge', () => {
    const result = getState().insertAmplifierOnEdge('fake-edge-id', 50);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Edge not found');
  });

  it('should return error for kmOffset out of range', () => {
    const result1 = getState().insertAmplifierOnEdge(edgeId, 0);
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('kmOffset');

    const result2 = getState().insertAmplifierOnEdge(edgeId, 100);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('kmOffset');

    const result3 = getState().insertAmplifierOnEdge(edgeId, -5);
    expect(result3.success).toBe(false);
  });

  it('should maintain correct node and edge counts after insertion', () => {
    expect(getState().topology.nodes).toHaveLength(2);
    expect(getState().topology.edges).toHaveLength(1);

    getState().insertAmplifierOnEdge(edgeId, 50);

    expect(getState().topology.nodes).toHaveLength(3);
    expect(getState().topology.edges).toHaveLength(2);
  });

  it('should support undo after insertion', () => {
    const nodesBefore = getState().topology.nodes.length;
    const edgesBefore = getState().topology.edges.length;

    getState().insertAmplifierOnEdge(edgeId, 50);

    expect(getState().topology.nodes).toHaveLength(nodesBefore + 1);
    expect(getState().topology.edges).toHaveLength(edgesBefore + 1);

    getState().undo();

    // After undo, should be back to original state
    expect(getState().topology.nodes).toHaveLength(nodesBefore);
    expect(getState().topology.edges).toHaveLength(edgesBefore);
    // Original edge should be restored
    expect(getState().getEdge(edgeId)).toBeDefined();
  });

  it('should preserve edge type (fiber) on new edges', () => {
    const result = getState().insertAmplifierOnEdge(edgeId, 50);
    const ampId = result.amplifierNodeId!;

    const edges = getState().topology.edges;
    for (const edge of edges) {
      expect(edge.type).toBe('fiber');
    }

    // Both edges should reference the amplifier
    const ampEdges = edges.filter(
      (e) => e.source.nodeId === ampId || e.target.nodeId === ampId
    );
    expect(ampEdges).toHaveLength(2);
  });
});
