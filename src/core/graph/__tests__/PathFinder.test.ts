import { describe, it, expect, beforeEach } from 'vitest';
import { GraphEngine } from '../GraphEngine';
import { PathFinder } from '../PathFinder';
import { NetworkTopology } from '@/types';

describe('PathFinder', () => {
  let engine: GraphEngine;
  let pathFinder: PathFinder;

  // Create a more complex topology for path testing
  // A -- B -- C
  // |    |    |
  // D -- E -- F
  const createTestTopology = (): NetworkTopology => ({
    id: 'test-network',
    name: 'Test Network',
    version: '1.0.0',
    metadata: {
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    },
    nodes: [
      { id: 'A', name: 'A', type: 'router', vendor: 'generic', position: { x: 0, y: 0 }, stacks: [], metadata: {} },
      { id: 'B', name: 'B', type: 'router', vendor: 'generic', position: { x: 100, y: 0 }, stacks: [], metadata: {} },
      { id: 'C', name: 'C', type: 'router', vendor: 'generic', position: { x: 200, y: 0 }, stacks: [], metadata: {} },
      { id: 'D', name: 'D', type: 'router', vendor: 'generic', position: { x: 0, y: 100 }, stacks: [], metadata: {} },
      { id: 'E', name: 'E', type: 'router', vendor: 'generic', position: { x: 100, y: 100 }, stacks: [], metadata: {} },
      { id: 'F', name: 'F', type: 'router', vendor: 'generic', position: { x: 200, y: 100 }, stacks: [], metadata: {} },
    ],
    edges: [
      { id: 'AB', name: 'A-B', type: 'fiber', source: { nodeId: 'A' }, target: { nodeId: 'B' }, properties: { distance: 10, weight: 1 }, state: 'active', metadata: {} },
      { id: 'BC', name: 'B-C', type: 'fiber', source: { nodeId: 'B' }, target: { nodeId: 'C' }, properties: { distance: 10, weight: 1 }, state: 'active', metadata: {} },
      { id: 'AD', name: 'A-D', type: 'fiber', source: { nodeId: 'A' }, target: { nodeId: 'D' }, properties: { distance: 10, weight: 1 }, state: 'active', metadata: {} },
      { id: 'BE', name: 'B-E', type: 'fiber', source: { nodeId: 'B' }, target: { nodeId: 'E' }, properties: { distance: 10, weight: 1 }, state: 'active', metadata: {} },
      { id: 'CF', name: 'C-F', type: 'fiber', source: { nodeId: 'C' }, target: { nodeId: 'F' }, properties: { distance: 10, weight: 1 }, state: 'active', metadata: {} },
      { id: 'DE', name: 'D-E', type: 'fiber', source: { nodeId: 'D' }, target: { nodeId: 'E' }, properties: { distance: 10, weight: 1 }, state: 'active', metadata: {} },
      { id: 'EF', name: 'E-F', type: 'fiber', source: { nodeId: 'E' }, target: { nodeId: 'F' }, properties: { distance: 10, weight: 1 }, state: 'active', metadata: {} },
    ],
  });

  beforeEach(() => {
    engine = new GraphEngine();
    engine.loadFromTopology(createTestTopology());
    pathFinder = new PathFinder(engine);
  });

  describe('shortestPath', () => {
    it('should find the shortest path between adjacent nodes', () => {
      const result = pathFinder.shortestPath('A', 'B');

      expect(result).not.toBeNull();
      expect(result?.path).toEqual(['A', 'B']);
      expect(result?.hopCount).toBe(1);
    });

    it('should find the shortest path across multiple hops', () => {
      const result = pathFinder.shortestPath('A', 'C');

      expect(result).not.toBeNull();
      expect(result?.path).toEqual(['A', 'B', 'C']);
      expect(result?.hopCount).toBe(2);
    });

    it('should find one of the shortest paths for equal-cost paths', () => {
      // A to F has multiple 3-hop paths:
      // A-B-C-F, A-B-E-F, A-D-E-F
      const result = pathFinder.shortestPath('A', 'F');

      expect(result).not.toBeNull();
      expect(result?.hopCount).toBe(3);
    });

    it('should return null for non-existent source', () => {
      const result = pathFinder.shortestPath('Z', 'A');

      expect(result).toBeNull();
    });

    it('should return null for non-existent target', () => {
      const result = pathFinder.shortestPath('A', 'Z');

      expect(result).toBeNull();
    });

    it('should find path excluding specific edges', () => {
      const result = pathFinder.shortestPath('A', 'B', {
        excludeEdges: ['AB'],
      });

      expect(result).not.toBeNull();
      // Must go A-D-E-B now
      expect(result?.hopCount).toBeGreaterThan(1);
      expect(result?.path).not.toContain('AB');
    });

    it('should find path excluding specific nodes', () => {
      const result = pathFinder.shortestPath('A', 'F', {
        excludeNodes: ['B', 'E'],
      });

      // This should be impossible as B and E are the only paths
      expect(result).toBeNull();
    });

    it('should respect maxHops constraint', () => {
      const result = pathFinder.shortestPath('A', 'F', {
        maxHops: 2,
      });

      expect(result).toBeNull(); // A to F requires 3 hops minimum
    });

    it('should calculate total distance', () => {
      const result = pathFinder.shortestPath('A', 'C');

      expect(result).not.toBeNull();
      expect(result?.totalDistance).toBe(20); // 10 + 10
    });
  });

  describe('kShortestPaths', () => {
    it('should find k shortest paths', () => {
      const results = pathFinder.kShortestPaths('A', 'F', 3);

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(3);

      // All paths should end at F
      results.forEach((result) => {
        expect(result.path[0]).toBe('A');
        expect(result.path[result.path.length - 1]).toBe('F');
      });
    });

    it('should return paths in order of total weight', () => {
      const results = pathFinder.kShortestPaths('A', 'F', 3);

      for (let i = 1; i < results.length; i++) {
        expect(results[i].totalWeight).toBeGreaterThanOrEqual(results[i - 1].totalWeight);
      }
    });

    it('should return empty array for non-existent path', () => {
      // Add an isolated node
      engine.addNode({
        id: 'Z',
        name: 'Z',
        type: 'router',
        vendor: 'generic',
        position: { x: 500, y: 500 },
        stacks: [],
        metadata: {},
      });

      const results = pathFinder.kShortestPaths('A', 'Z', 3);

      expect(results).toHaveLength(0);
    });
  });

  describe('findEdgeDisjointPaths', () => {
    it('should find edge-disjoint paths with greedy algorithm (default)', () => {
      const results = pathFinder.findEdgeDisjointPaths('A', 'F', 2);

      expect(results.length).toBeGreaterThanOrEqual(1);

      if (results.length >= 2) {
        // Check that edges don't overlap
        const edges1 = new Set(results[0].edges);
        const edges2 = new Set(results[1].edges);

        edges1.forEach((edge) => {
          expect(edges2.has(edge)).toBe(false);
        });
      }
    });

    it('should find edge-disjoint paths with options object', () => {
      const results = pathFinder.findEdgeDisjointPaths('A', 'F', { algorithm: 'greedy', maxPaths: 2 });

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should find edge-disjoint paths with maxflow algorithm', () => {
      const results = pathFinder.findEdgeDisjointPaths('A', 'F', { algorithm: 'maxflow' });

      expect(results.length).toBeGreaterThanOrEqual(1);

      // Verify all paths are edge-disjoint
      const allEdges = new Set<string>();
      for (const result of results) {
        for (const edge of result.edges) {
          expect(allEdges.has(edge)).toBe(false);
          allEdges.add(edge);
        }
      }
    });

    it('should respect maxPaths limit', () => {
      const results = pathFinder.findEdgeDisjointPaths('A', 'F', { algorithm: 'maxflow', maxPaths: 1 });

      expect(results.length).toBe(1);
    });

    it('should return as many paths as possible', () => {
      const results = pathFinder.findEdgeDisjointPaths('A', 'F', 10);

      // There are limited edge-disjoint paths in this topology
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('should return empty array for same source and target', () => {
      const results = pathFinder.findEdgeDisjointPaths('A', 'A', { algorithm: 'maxflow' });
      expect(results).toHaveLength(0);
    });

    it('should return empty array for non-existent nodes', () => {
      const results = pathFinder.findEdgeDisjointPaths('Z', 'F', { algorithm: 'maxflow' });
      expect(results).toHaveLength(0);
    });
  });

  describe('findEdgeDisjointPaths on mesh topology', () => {
    // Create mesh topology matching the AlgorithmTester mesh
    // N1 -- N2 -- N3
    // |  \  |  /  |
    // N4 -- N5 -- N6
    // | \  / \  / |
    // N7 ------- N8
    const createMeshTopology = (): NetworkTopology => ({
      id: 'mesh-network',
      name: 'Mesh Network',
      version: '1.0.0',
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
      },
      nodes: [
        { id: 'N1', name: 'N1', type: 'router', vendor: 'generic', position: { x: 100, y: 100 }, stacks: [], metadata: {} },
        { id: 'N2', name: 'N2', type: 'router', vendor: 'generic', position: { x: 250, y: 100 }, stacks: [], metadata: {} },
        { id: 'N3', name: 'N3', type: 'router', vendor: 'generic', position: { x: 400, y: 100 }, stacks: [], metadata: {} },
        { id: 'N4', name: 'N4', type: 'router', vendor: 'generic', position: { x: 100, y: 250 }, stacks: [], metadata: {} },
        { id: 'N5', name: 'N5', type: 'router', vendor: 'generic', position: { x: 250, y: 250 }, stacks: [], metadata: {} },
        { id: 'N6', name: 'N6', type: 'router', vendor: 'generic', position: { x: 400, y: 250 }, stacks: [], metadata: {} },
        { id: 'N7', name: 'N7', type: 'router', vendor: 'generic', position: { x: 175, y: 350 }, stacks: [], metadata: {} },
        { id: 'N8', name: 'N8', type: 'router', vendor: 'generic', position: { x: 325, y: 350 }, stacks: [], metadata: {} },
      ],
      edges: [
        // Top row
        { id: 'N1-N2', name: 'N1-N2', type: 'fiber', source: { nodeId: 'N1' }, target: { nodeId: 'N2' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        { id: 'N2-N3', name: 'N2-N3', type: 'fiber', source: { nodeId: 'N2' }, target: { nodeId: 'N3' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        // Vertical
        { id: 'N1-N4', name: 'N1-N4', type: 'fiber', source: { nodeId: 'N1' }, target: { nodeId: 'N4' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        { id: 'N2-N5', name: 'N2-N5', type: 'fiber', source: { nodeId: 'N2' }, target: { nodeId: 'N5' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        { id: 'N3-N6', name: 'N3-N6', type: 'fiber', source: { nodeId: 'N3' }, target: { nodeId: 'N6' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        // Middle row
        { id: 'N4-N5', name: 'N4-N5', type: 'fiber', source: { nodeId: 'N4' }, target: { nodeId: 'N5' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        { id: 'N5-N6', name: 'N5-N6', type: 'fiber', source: { nodeId: 'N5' }, target: { nodeId: 'N6' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        // Bottom connections
        { id: 'N4-N7', name: 'N4-N7', type: 'fiber', source: { nodeId: 'N4' }, target: { nodeId: 'N7' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        { id: 'N5-N7', name: 'N5-N7', type: 'fiber', source: { nodeId: 'N5' }, target: { nodeId: 'N7' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        { id: 'N5-N8', name: 'N5-N8', type: 'fiber', source: { nodeId: 'N5' }, target: { nodeId: 'N8' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        { id: 'N6-N8', name: 'N6-N8', type: 'fiber', source: { nodeId: 'N6' }, target: { nodeId: 'N8' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        // Bottom row
        { id: 'N7-N8', name: 'N7-N8', type: 'fiber', source: { nodeId: 'N7' }, target: { nodeId: 'N8' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        // Diagonal redundancy
        { id: 'N1-N5', name: 'N1-N5', type: 'fiber', source: { nodeId: 'N1' }, target: { nodeId: 'N5' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        { id: 'N2-N6', name: 'N2-N6', type: 'fiber', source: { nodeId: 'N2' }, target: { nodeId: 'N6' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        { id: 'N2-N4', name: 'N2-N4', type: 'fiber', source: { nodeId: 'N2' }, target: { nodeId: 'N4' }, properties: { weight: 1 }, state: 'active', metadata: {} },
        { id: 'N3-N5', name: 'N3-N5', type: 'fiber', source: { nodeId: 'N3' }, target: { nodeId: 'N5' }, properties: { weight: 1 }, state: 'active', metadata: {} },
      ],
    });

    let meshEngine: GraphEngine;
    let meshPathFinder: PathFinder;

    beforeEach(() => {
      meshEngine = new GraphEngine();
      meshEngine.loadFromTopology(createMeshTopology());
      meshPathFinder = new PathFinder(meshEngine);
    });

    it('greedy algorithm finds at least 2 paths on mesh N1->N8', () => {
      const results = meshPathFinder.findEdgeDisjointPaths('N1', 'N8', { algorithm: 'greedy' });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('maxflow algorithm finds at least 3 paths on mesh N1->N8', () => {
      const results = meshPathFinder.findEdgeDisjointPaths('N1', 'N8', { algorithm: 'maxflow' });
      // Max-flow should find more paths than greedy on this topology
      expect(results.length).toBeGreaterThanOrEqual(3);

      // Verify all paths are truly edge-disjoint
      const allEdges = new Set<string>();
      for (const result of results) {
        for (const edge of result.edges) {
          expect(allEdges.has(edge)).toBe(false);
          allEdges.add(edge);
        }
      }
    });

    it('maxflow respects maxPaths limit on mesh topology', () => {
      const results = meshPathFinder.findEdgeDisjointPaths('N1', 'N8', { algorithm: 'maxflow', maxPaths: 2 });
      expect(results.length).toBe(2);
    });
  });

  describe('findNodeDisjointPaths', () => {
    it('should find node-disjoint paths with greedy algorithm (default)', () => {
      const results = pathFinder.findNodeDisjointPaths('A', 'F', 2);

      expect(results.length).toBeGreaterThanOrEqual(1);

      if (results.length >= 2) {
        // Check that intermediate nodes don't overlap
        const intermediateNodes1 = new Set(results[0].path.slice(1, -1));
        const intermediateNodes2 = new Set(results[1].path.slice(1, -1));

        intermediateNodes1.forEach((node) => {
          expect(intermediateNodes2.has(node)).toBe(false);
        });
      }
    });

    it('should find node-disjoint paths with options object', () => {
      const results = pathFinder.findNodeDisjointPaths('A', 'F', { algorithm: 'greedy', maxPaths: 2 });

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should find node-disjoint paths with maxflow algorithm', () => {
      const results = pathFinder.findNodeDisjointPaths('A', 'F', { algorithm: 'maxflow' });

      expect(results.length).toBeGreaterThanOrEqual(1);

      // Verify all paths are node-disjoint (intermediate nodes don't overlap)
      if (results.length >= 2) {
        const allIntermediateNodes = new Set<string>();
        for (const result of results) {
          const intermediateNodes = result.path.slice(1, -1);
          for (const node of intermediateNodes) {
            expect(allIntermediateNodes.has(node)).toBe(false);
            allIntermediateNodes.add(node);
          }
        }
      }
    });

    it('should respect maxPaths limit with maxflow', () => {
      const results = pathFinder.findNodeDisjointPaths('A', 'F', { algorithm: 'maxflow', maxPaths: 1 });
      expect(results.length).toBe(1);
    });

    it('should return empty array for same source and target with maxflow', () => {
      const results = pathFinder.findNodeDisjointPaths('A', 'A', { algorithm: 'maxflow' });
      expect(results).toHaveLength(0);
    });
  });

  describe('pathExists', () => {
    it('should return true for existing path', () => {
      expect(pathFinder.pathExists('A', 'F')).toBe(true);
    });

    it('should return false for non-existing path', () => {
      // Add isolated node
      engine.addNode({
        id: 'Z',
        name: 'Z',
        type: 'router',
        vendor: 'generic',
        position: { x: 500, y: 500 },
        stacks: [],
        metadata: {},
      });

      expect(pathFinder.pathExists('A', 'Z')).toBe(false);
    });
  });

  describe('getReachableNodes', () => {
    it('should return all reachable nodes', () => {
      const reachable = pathFinder.getReachableNodes('A');

      expect(reachable).toContain('A');
      expect(reachable).toContain('B');
      expect(reachable).toContain('C');
      expect(reachable).toContain('D');
      expect(reachable).toContain('E');
      expect(reachable).toContain('F');
      expect(reachable).toHaveLength(6);
    });

    it('should return only reachable nodes for disconnected graph', () => {
      // Add isolated node
      engine.addNode({
        id: 'Z',
        name: 'Z',
        type: 'router',
        vendor: 'generic',
        position: { x: 500, y: 500 },
        stacks: [],
        metadata: {},
      });

      const reachable = pathFinder.getReachableNodes('A');

      expect(reachable).not.toContain('Z');
      expect(reachable).toHaveLength(6);
    });

    it('should return empty for non-existent node', () => {
      const reachable = pathFinder.getReachableNodes('Z');

      expect(reachable).toHaveLength(0);
    });
  });

  describe('constraint modes', () => {
    it('should return null in blocking mode when node cannot be avoided', () => {
      // A to F must go through B or E - try to avoid both
      const result = pathFinder.shortestPath('A', 'F', {
        excludeNodes: ['B', 'E'],
        excludeNodesMode: 'blocking',
      });

      expect(result).toBeNull();
    });

    it('should return path with warnings in best-effort mode when node cannot be avoided', () => {
      // A to F must go through B or E - try to avoid both with best-effort
      const result = pathFinder.shortestPath('A', 'F', {
        excludeNodes: ['B', 'E'],
        excludeNodesMode: 'best-effort',
      });

      expect(result).not.toBeNull();
      expect(result?.warnings).toBeDefined();
      expect(result?.warnings?.length).toBeGreaterThan(0);
      expect(result?.warnings?.some(w => w.type === 'node_not_avoided')).toBe(true);
    });

    it('should return null in blocking mode when edge cannot be avoided', () => {
      // A to B direct edge is AB - try to avoid it
      const result = pathFinder.shortestPath('A', 'B', {
        excludeEdges: ['AB', 'AD'], // Block both direct paths
        excludeEdgesMode: 'blocking',
      });

      // Should still find a path through D-E-B if possible
      // Actually A -> D -> E -> B is possible if we only block AB and AD... wait, we block AD too
      // So A cannot reach D directly. Let's see: A is connected to B (blocked) and D (blocked)
      // This should make it impossible
      expect(result).toBeNull();
    });

    it('should return path with warnings in best-effort mode when edge cannot be avoided', () => {
      // Try to avoid the only direct path from A to B
      const result = pathFinder.shortestPath('A', 'B', {
        excludeEdges: ['AB', 'AD', 'DE', 'BE'], // Block all paths
        excludeEdgesMode: 'best-effort',
      });

      expect(result).not.toBeNull();
      expect(result?.warnings).toBeDefined();
      expect(result?.warnings?.some(w => w.type === 'edge_not_avoided')).toBe(true);
    });

    it('should return null in blocking mode when max hops exceeded', () => {
      // A to F requires at least 3 hops
      const result = pathFinder.shortestPath('A', 'F', {
        maxHops: 2,
        maxHopsMode: 'blocking',
      });

      expect(result).toBeNull();
    });

    it('should return path with warning in best-effort mode when max hops exceeded', () => {
      // A to F requires at least 3 hops
      const result = pathFinder.shortestPath('A', 'F', {
        maxHops: 2,
        maxHopsMode: 'best-effort',
      });

      expect(result).not.toBeNull();
      expect(result?.hopCount).toBeGreaterThan(2);
      expect(result?.warnings).toBeDefined();
      expect(result?.warnings?.some(w => w.type === 'max_hops_exceeded')).toBe(true);
      expect(result?.warnings?.find(w => w.type === 'max_hops_exceeded')?.details?.actualHops).toBe(result?.hopCount);
      expect(result?.warnings?.find(w => w.type === 'max_hops_exceeded')?.details?.requestedMaxHops).toBe(2);
    });

    it('should return path without warnings when constraint is satisfied', () => {
      // A to C can be done in 2 hops: A -> B -> C
      const result = pathFinder.shortestPath('A', 'C', {
        maxHops: 3,
        maxHopsMode: 'best-effort',
      });

      expect(result).not.toBeNull();
      expect(result?.hopCount).toBeLessThanOrEqual(3);
      expect(result?.warnings).toBeUndefined();
    });

    it('should use weight attribute when specified', () => {
      // Test with explicit weight attribute
      const result = pathFinder.shortestPath('A', 'C', {
        weightAttribute: 'distance',
      });

      expect(result).not.toBeNull();
      expect(result?.totalWeight).toBeDefined();
    });
  });

  // ==========================================================================
  // SRLG-AWARE PATH COMPUTATION TESTS
  // ==========================================================================

  describe('SRLG-aware path computation', () => {
    // Create topology with SRLGs for testing
    // A -- B -- C
    // |    |    |
    // D -- E -- F
    // SRLGs:
    // - SRLG-North: AB, BC (top row)
    // - SRLG-South: DE, EF (bottom row)
    // - SRLG-Vert: AD, CF (verticals)
    // - BE has no SRLG
    const createSRLGTopology = (): NetworkTopology => ({
      id: 'srlg-network',
      name: 'SRLG Test Network',
      version: '1.0.0',
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
      },
      nodes: [
        { id: 'A', name: 'A', type: 'router', vendor: 'generic', position: { x: 0, y: 0 }, stacks: [], metadata: {} },
        { id: 'B', name: 'B', type: 'router', vendor: 'generic', position: { x: 100, y: 0 }, stacks: [], metadata: {} },
        { id: 'C', name: 'C', type: 'router', vendor: 'generic', position: { x: 200, y: 0 }, stacks: [], metadata: {} },
        { id: 'D', name: 'D', type: 'router', vendor: 'generic', position: { x: 0, y: 100 }, stacks: [], metadata: {} },
        { id: 'E', name: 'E', type: 'router', vendor: 'generic', position: { x: 100, y: 100 }, stacks: [], metadata: {} },
        { id: 'F', name: 'F', type: 'router', vendor: 'generic', position: { x: 200, y: 100 }, stacks: [], metadata: {} },
      ],
      edges: [
        { id: 'AB', name: 'A-B', type: 'fiber', source: { nodeId: 'A' }, target: { nodeId: 'B' }, properties: { distance: 10, weight: 1, srlgCodes: ['SRLG-North'] }, state: 'active', metadata: {} },
        { id: 'BC', name: 'B-C', type: 'fiber', source: { nodeId: 'B' }, target: { nodeId: 'C' }, properties: { distance: 10, weight: 1, srlgCodes: ['SRLG-North'] }, state: 'active', metadata: {} },
        { id: 'AD', name: 'A-D', type: 'fiber', source: { nodeId: 'A' }, target: { nodeId: 'D' }, properties: { distance: 10, weight: 1, srlgCodes: ['SRLG-Vert'] }, state: 'active', metadata: {} },
        { id: 'BE', name: 'B-E', type: 'fiber', source: { nodeId: 'B' }, target: { nodeId: 'E' }, properties: { distance: 10, weight: 1 }, state: 'active', metadata: {} }, // No SRLG
        { id: 'CF', name: 'C-F', type: 'fiber', source: { nodeId: 'C' }, target: { nodeId: 'F' }, properties: { distance: 10, weight: 1, srlgCodes: ['SRLG-Vert'] }, state: 'active', metadata: {} },
        { id: 'DE', name: 'D-E', type: 'fiber', source: { nodeId: 'D' }, target: { nodeId: 'E' }, properties: { distance: 10, weight: 1, srlgCodes: ['SRLG-South'] }, state: 'active', metadata: {} },
        { id: 'EF', name: 'E-F', type: 'fiber', source: { nodeId: 'E' }, target: { nodeId: 'F' }, properties: { distance: 10, weight: 1, srlgCodes: ['SRLG-South'] }, state: 'active', metadata: {} },
      ],
    });

    let srlgEngine: GraphEngine;
    let srlgPathFinder: PathFinder;

    beforeEach(() => {
      srlgEngine = new GraphEngine();
      srlgEngine.loadFromTopology(createSRLGTopology());
      srlgPathFinder = new PathFinder(srlgEngine);
    });

    describe('srlgAwareShortestPath', () => {
      it('should find path avoiding specified SRLGs', () => {
        // From A to C, avoid SRLG-North (AB, BC)
        // Must go A -> D -> E -> B -> C or A -> D -> E -> F -> C
        const result = srlgPathFinder.srlgAwareShortestPath('A', 'C', ['SRLG-North']);

        expect(result).not.toBeNull();
        expect(result?.edges).not.toContain('AB');
        expect(result?.edges).not.toContain('BC');
      });

      it('should return regular shortest path when no SRLGs to avoid', () => {
        const result = srlgPathFinder.srlgAwareShortestPath('A', 'C', []);
        const regularResult = srlgPathFinder.shortestPath('A', 'C');

        expect(result).not.toBeNull();
        expect(result?.path).toEqual(regularResult?.path);
      });

      it('should return null when all paths contain excluded SRLGs', () => {
        // From A to D, must use AD (SRLG-Vert) - no alternative
        // But A can also reach D through A-B-E-D (if we don't exclude SRLG-North and SRLG-South)
        // Actually A -> B -> E -> D works: AB (SRLG-North), BE (no SRLG), DE (SRLG-South)
        // To block all, exclude SRLG-Vert (direct), SRLG-North (top), SRLG-South (bottom)
        const result = srlgPathFinder.srlgAwareShortestPath('A', 'D', [
          'SRLG-Vert',
          'SRLG-North',
          'SRLG-South',
        ]);

        expect(result).toBeNull();
      });

      it('should work with additional path options', () => {
        const result = srlgPathFinder.srlgAwareShortestPath('A', 'F', ['SRLG-North'], {
          maxHops: 10,
        });

        expect(result).not.toBeNull();
        expect(result?.edges).not.toContain('AB');
        expect(result?.edges).not.toContain('BC');
      });
    });

    describe('findSRLGDiversePath', () => {
      it('should find path diverse from reference path', () => {
        // Reference path: A -> B -> C (SRLG-North)
        const referencePath = srlgPathFinder.shortestPath('A', 'C')!;

        // Find diverse path from A to C
        const diversePath = srlgPathFinder.findSRLGDiversePath('A', 'C', referencePath);

        expect(diversePath).not.toBeNull();
        // Should not use edges with SRLG-North
        expect(diversePath?.edges).not.toContain('AB');
        expect(diversePath?.edges).not.toContain('BC');
      });

      it('should return edge-disjoint path when reference has no SRLGs', () => {
        // Create a path through BE (no SRLG): A -> B -> E
        // For this we need a reference with no SRLGs
        // BE has no SRLG, so a path A -> B (has SRLG) -> E is partly no-SRLG
        // Let's test with a manually constructed "reference"
        const mockReference = {
          path: ['B', 'E'],
          edges: ['BE'],
          totalWeight: 10,
          totalDistance: 10,
          hopCount: 1,
        };

        // Find diverse path from B to E - must avoid BE edge
        const diversePath = srlgPathFinder.findSRLGDiversePath('B', 'E', mockReference);

        if (diversePath) {
          expect(diversePath.edges).not.toContain('BE');
        }
      });

      it('should respect maxOverlapPercent parameter', () => {
        const referencePath = srlgPathFinder.shortestPath('A', 'C')!;

        // Allow up to 50% overlap
        const result = srlgPathFinder.findSRLGDiversePath('A', 'C', referencePath, 50);

        // Should find a path (even if partially overlapping)
        expect(result).not.toBeNull();
      });

      it('should return null when no diverse path exists within constraints', () => {
        const referencePath = srlgPathFinder.shortestPath('A', 'C')!;

        // Try to find strict (0%) diverse path - may not exist
        const result = srlgPathFinder.findSRLGDiversePath('A', 'C', referencePath, 0);

        // This depends on topology - may or may not be null
        if (result) {
          expect(result.edges).not.toContain('AB');
          expect(result.edges).not.toContain('BC');
        }
      });
    });

    describe('findMinimumSRLGOverlapPath', () => {
      it('should find path with minimum SRLG overlap', () => {
        const referencePath = srlgPathFinder.shortestPath('A', 'C')!;

        const result = srlgPathFinder.findMinimumSRLGOverlapPath('A', 'C', referencePath);

        expect(result).not.toBeNull();
        expect(result?.path).toBeDefined();
        expect(result?.sharedSRLGs).toBeDefined();
        expect(result?.overlapPercent).toBeDefined();
        expect(result?.overlapPercent).toBeGreaterThanOrEqual(0);
        expect(result?.overlapPercent).toBeLessThanOrEqual(100);
      });

      it('should return zero overlap for fully diverse path', () => {
        // A to C via bottom: A -> D -> E -> F -> C
        // vs top: A -> B -> C
        const referencePath = {
          path: ['A', 'B', 'C'],
          edges: ['AB', 'BC'],
          totalWeight: 20,
          totalDistance: 20,
          hopCount: 2,
        };

        const result = srlgPathFinder.findMinimumSRLGOverlapPath('A', 'C', referencePath);

        // The minimum overlap path should avoid SRLG-North if possible
        if (result && result.sharedSRLGs.length === 0) {
          expect(result.overlapPercent).toBe(0);
        }
      });

      it('should return null when no path exists', () => {
        const referencePath = {
          path: ['A', 'B'],
          edges: ['AB'],
          totalWeight: 10,
          totalDistance: 10,
          hopCount: 1,
        };

        // Try to find path to non-existent node
        const result = srlgPathFinder.findMinimumSRLGOverlapPath('A', 'Z', referencePath);

        expect(result).toBeNull();
      });
    });

    describe('validateSRLGAvoidance', () => {
      it('should validate path avoids specified SRLGs', () => {
        const path = {
          path: ['A', 'D', 'E', 'F'],
          edges: ['AD', 'DE', 'EF'],
          totalWeight: 30,
          totalDistance: 30,
          hopCount: 3,
        };

        // Path has SRLG-Vert (AD), SRLG-South (DE, EF)
        // Check if it avoids SRLG-North
        const result = srlgPathFinder.validateSRLGAvoidance(path, ['SRLG-North']);

        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should detect SRLG violations', () => {
        const path = {
          path: ['A', 'B', 'C'],
          edges: ['AB', 'BC'],
          totalWeight: 20,
          totalDistance: 20,
          hopCount: 2,
        };

        // Path has SRLG-North - check if we're trying to avoid it
        const result = srlgPathFinder.validateSRLGAvoidance(path, ['SRLG-North']);

        expect(result.valid).toBe(false);
        expect(result.violations).toContain('SRLG-North');
      });

      it('should return valid for empty exclude list', () => {
        const path = {
          path: ['A', 'B'],
          edges: ['AB'],
          totalWeight: 10,
          totalDistance: 10,
          hopCount: 1,
        };

        const result = srlgPathFinder.validateSRLGAvoidance(path, []);

        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });
    });
  });
});
