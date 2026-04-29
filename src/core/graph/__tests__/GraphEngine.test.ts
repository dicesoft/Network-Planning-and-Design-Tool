import { describe, it, expect, beforeEach } from 'vitest';
import { GraphEngine } from '../GraphEngine';
import { NetworkNode, NetworkEdge, NetworkTopology } from '@/types';

describe('GraphEngine', () => {
  let engine: GraphEngine;

  const createTestTopology = (): NetworkTopology => ({
    id: 'test-network',
    name: 'Test Network',
    version: '1.0.0',
    metadata: {
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    },
    nodes: [
      {
        id: 'node-1',
        name: 'Node 1',
        type: 'router',
        vendor: 'cisco',
        position: { x: 0, y: 0 },
        stacks: [],
        metadata: {},
      },
      {
        id: 'node-2',
        name: 'Node 2',
        type: 'switch',
        vendor: 'juniper',
        position: { x: 100, y: 0 },
        stacks: [],
        metadata: {},
      },
      {
        id: 'node-3',
        name: 'Node 3',
        type: 'oadm',
        vendor: 'nokia',
        position: { x: 200, y: 0 },
        stacks: [],
        metadata: {},
      },
    ],
    edges: [
      {
        id: 'edge-1',
        name: 'Edge 1',
        type: 'fiber',
        source: { nodeId: 'node-1' },
        target: { nodeId: 'node-2' },
        properties: { distance: 50 },
        state: 'active',
        metadata: {},
      },
      {
        id: 'edge-2',
        name: 'Edge 2',
        type: 'fiber',
        source: { nodeId: 'node-2' },
        target: { nodeId: 'node-3' },
        properties: { distance: 75 },
        state: 'active',
        metadata: {},
      },
    ],
  });

  beforeEach(() => {
    engine = new GraphEngine();
  });

  describe('loadFromTopology', () => {
    it('should load nodes and edges from topology', () => {
      const topology = createTestTopology();
      engine.loadFromTopology(topology);

      expect(engine.getAllNodes()).toHaveLength(3);
      expect(engine.getAllEdges()).toHaveLength(2);
    });

    it('should clear previous data when loading new topology', () => {
      const topology = createTestTopology();
      engine.loadFromTopology(topology);

      engine.loadFromTopology({
        ...topology,
        nodes: [topology.nodes[0]],
        edges: [],
      });

      expect(engine.getAllNodes()).toHaveLength(1);
      expect(engine.getAllEdges()).toHaveLength(0);
    });
  });

  describe('Node Operations', () => {
    it('should add a node', () => {
      const node: NetworkNode = {
        id: 'test-node',
        name: 'Test Node',
        type: 'router',
        vendor: 'nokia',
        position: { x: 50, y: 50 },
        stacks: [],
        metadata: {},
      };

      engine.addNode(node);

      expect(engine.hasNode('test-node')).toBe(true);
      expect(engine.getNode('test-node')?.name).toBe('Test Node');
    });

    it('should not add duplicate node', () => {
      const node: NetworkNode = {
        id: 'test-node',
        name: 'Test Node',
        type: 'router',
        vendor: 'nokia',
        position: { x: 50, y: 50 },
        stacks: [],
        metadata: {},
      };

      engine.addNode(node);
      engine.addNode({ ...node, name: 'Different Name' });

      expect(engine.getAllNodes()).toHaveLength(1);
      expect(engine.getNode('test-node')?.name).toBe('Test Node');
    });

    it('should remove a node', () => {
      engine.loadFromTopology(createTestTopology());

      engine.removeNode('node-1');

      expect(engine.hasNode('node-1')).toBe(false);
      expect(engine.getAllNodes()).toHaveLength(2);
    });

    it('should update node attributes', () => {
      engine.loadFromTopology(createTestTopology());

      engine.updateNode('node-1', { name: 'Updated Name' });

      expect(engine.getNode('node-1')?.name).toBe('Updated Name');
    });

    it('should return null for non-existent node', () => {
      expect(engine.getNode('non-existent')).toBeNull();
    });
  });

  describe('Edge Operations', () => {
    beforeEach(() => {
      engine.loadFromTopology(createTestTopology());
    });

    it('should add an edge', () => {
      const newEdge: NetworkEdge = {
        id: 'new-edge',
        name: 'New Edge',
        type: 'fiber',
        source: { nodeId: 'node-1' },
        target: { nodeId: 'node-3' },
        properties: { distance: 100 },
        state: 'active',
        metadata: {},
      };

      const result = engine.addEdge(newEdge);

      expect(result).toBe(true);
      expect(engine.getAllEdges()).toHaveLength(3);
    });

    it('should not add edge between non-existent nodes', () => {
      const newEdge: NetworkEdge = {
        id: 'invalid-edge',
        name: 'Invalid Edge',
        type: 'fiber',
        source: { nodeId: 'node-1' },
        target: { nodeId: 'non-existent' },
        properties: {},
        state: 'active',
        metadata: {},
      };

      const result = engine.addEdge(newEdge);

      expect(result).toBe(false);
    });

    it('should not add duplicate edge with same ID', () => {
      // Try to add an edge with the same ID as an existing edge
      const duplicateEdge: NetworkEdge = {
        id: 'edge-1', // Same ID as existing edge
        name: 'Duplicate Edge',
        type: 'fiber',
        source: { nodeId: 'node-1' },
        target: { nodeId: 'node-3' },
        properties: {},
        state: 'active',
        metadata: {},
      };

      const result = engine.addEdge(duplicateEdge);

      expect(result).toBe(false);
      expect(engine.getAllEdges()).toHaveLength(2); // Still only 2 edges
    });

    it('should allow parallel edges with different IDs', () => {
      // Add a parallel edge between the same nodes but with different ID
      const parallelEdge: NetworkEdge = {
        id: 'parallel-edge',
        name: 'Parallel Edge',
        type: 'fiber',
        source: { nodeId: 'node-1' },
        target: { nodeId: 'node-2' },
        properties: { distance: 200 }, // Different distance
        state: 'active',
        metadata: {},
      };

      const result = engine.addEdge(parallelEdge);

      expect(result).toBe(true);
      expect(engine.getAllEdges()).toHaveLength(3); // Now 3 edges
      expect(engine.getEdgesBetween('node-1', 'node-2')).toHaveLength(2); // 2 edges between node-1 and node-2
    });

    it('should check if edge exists between nodes', () => {
      expect(engine.hasEdgeBetween('node-1', 'node-2')).toBe(true);
      expect(engine.hasEdgeBetween('node-1', 'node-3')).toBe(false);
    });

    it('should get edges between two nodes', () => {
      const edges = engine.getEdgesBetween('node-1', 'node-2');

      expect(edges).toHaveLength(1);
      expect(edges[0].id).toBe('edge-1');
    });
  });

  describe('Graph Queries', () => {
    beforeEach(() => {
      engine.loadFromTopology(createTestTopology());
    });

    it('should get neighbors of a node', () => {
      const neighbors = engine.getNeighbors('node-2');

      expect(neighbors).toHaveLength(2);
      expect(neighbors.map((n) => n.id).sort()).toEqual(['node-1', 'node-3']);
    });

    it('should get connected edges for a node', () => {
      const edges = engine.getConnectedEdges('node-2');

      expect(edges).toHaveLength(2);
    });

    it('should get degree of a node', () => {
      expect(engine.getDegree('node-2')).toBe(2);
      expect(engine.getDegree('node-1')).toBe(1);
    });

    it('should return empty for non-existent node', () => {
      expect(engine.getNeighbors('non-existent')).toHaveLength(0);
      expect(engine.getConnectedEdges('non-existent')).toHaveLength(0);
      expect(engine.getDegree('non-existent')).toBe(0);
    });
  });

  describe('Connectivity', () => {
    it('should detect connected graph', () => {
      engine.loadFromTopology(createTestTopology());

      expect(engine.isConnected()).toBe(true);
    });

    it('should detect disconnected graph', () => {
      const topology = createTestTopology();
      topology.nodes.push({
        id: 'node-4',
        name: 'Isolated Node',
        type: 'router',
        vendor: 'generic',
        position: { x: 300, y: 0 },
        stacks: [],
        metadata: {},
      });
      engine.loadFromTopology(topology);

      expect(engine.isConnected()).toBe(false);
    });

    it('should return connected components', () => {
      const topology = createTestTopology();
      topology.nodes.push({
        id: 'node-4',
        name: 'Isolated Node',
        type: 'router',
        vendor: 'generic',
        position: { x: 300, y: 0 },
        stacks: [],
        metadata: {},
      });
      engine.loadFromTopology(topology);

      const components = engine.getConnectedComponents();

      expect(components).toHaveLength(2);
      expect(components[0]).toHaveLength(3);
      expect(components[1]).toHaveLength(1);
    });

    it('should handle empty graph', () => {
      expect(engine.isConnected()).toBe(true);
      expect(engine.getConnectedComponents()).toHaveLength(0);
    });

    it('should handle single node', () => {
      engine.addNode({
        id: 'single',
        name: 'Single',
        type: 'router',
        vendor: 'generic',
        position: { x: 0, y: 0 },
        stacks: [],
        metadata: {},
      });

      expect(engine.isConnected()).toBe(true);
      expect(engine.getConnectedComponents()).toHaveLength(1);
    });
  });

  describe('Validation', () => {
    it('should validate connected graph without errors', () => {
      engine.loadFromTopology(createTestTopology());

      const result = engine.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about isolated nodes', () => {
      const topology = createTestTopology();
      topology.nodes.push({
        id: 'isolated',
        name: 'Isolated Node',
        type: 'router',
        vendor: 'generic',
        position: { x: 300, y: 0 },
        stacks: [],
        metadata: {},
      });
      engine.loadFromTopology(topology);

      const result = engine.validate();

      expect(result.warnings).toContain(
        'Node "Isolated Node" is not connected to any other node'
      );
    });

    it('should warn about disconnected network', () => {
      const topology = createTestTopology();
      topology.nodes.push({
        id: 'isolated',
        name: 'Isolated Node',
        type: 'router',
        vendor: 'generic',
        position: { x: 300, y: 0 },
        stacks: [],
        metadata: {},
      });
      engine.loadFromTopology(topology);

      const result = engine.validate();

      expect(result.warnings).toContain(
        'Network is not fully connected - there are isolated components'
      );
    });
  });

  describe('Statistics', () => {
    it('should calculate network statistics', () => {
      engine.loadFromTopology(createTestTopology());

      const stats = engine.getStatistics();

      expect(stats.nodeCount).toBe(3);
      expect(stats.edgeCount).toBe(2);
      expect(stats.isConnected).toBe(true);
      expect(stats.componentCount).toBe(1);
      expect(stats.averageDegree).toBeCloseTo(4 / 3); // (1 + 2 + 1) / 3
    });

    it('should calculate density correctly', () => {
      engine.loadFromTopology(createTestTopology());

      const stats = engine.getStatistics();

      // For 3 nodes, max edges = 3 * 2 / 2 = 3
      // With 2 edges, density = 2/3
      expect(stats.density).toBeCloseTo(2 / 3);
    });

    it('should handle empty graph statistics', () => {
      const stats = engine.getStatistics();

      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.density).toBe(0);
      expect(stats.averageDegree).toBe(0);
    });
  });
});
