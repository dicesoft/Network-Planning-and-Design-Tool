import { dijkstra } from 'graphology-shortest-path';
import { NetworkEdge, ConstraintMode, PathWarning } from '@/types';
import { GraphEngine } from './GraphEngine';

/**
 * Path computation result
 */
export interface PathResult {
  path: string[]; // Node IDs in order
  edges: string[]; // Edge IDs in order
  totalWeight: number;
  totalDistance: number;
  hopCount: number;
  warnings?: PathWarning[]; // Warnings for best-effort constraint violations
}

/**
 * Path computation options
 */
export interface PathOptions {
  weightAttribute?: keyof NetworkEdge['properties'];
  excludeEdges?: string[];
  excludeNodes?: string[];
  maxHops?: number;
  // Constraint modes for best-effort path finding
  excludeEdgesMode?: ConstraintMode;
  excludeNodesMode?: ConstraintMode;
  maxHopsMode?: ConstraintMode;
}

/**
 * Algorithm options for disjoint path computation
 */
export type DisjointAlgorithm = 'greedy' | 'maxflow';

export interface DisjointPathOptions {
  algorithm?: DisjointAlgorithm;  // Default: 'greedy' for backward compat
  maxPaths?: number;              // Max paths to find (default: Infinity)
  weightAttribute?: keyof NetworkEdge['properties'];  // For path cost
}

/**
 * Flow network edge for max-flow algorithm
 */
interface FlowEdge {
  from: string;
  to: string;
  capacity: number;
  flow: number;
  reverseIndex: number;
  originalEdgeId?: string;
  // For undirected edges: index of the paired edge in opposite direction
  // When flow goes through one direction, paired edge capacity should be reduced
  pairedEdgeIndex?: number;
}

/**
 * Flow network for max-flow algorithm
 */
interface FlowNetwork {
  adjacency: Map<string, FlowEdge[]>;
}

/**
 * PathFinder - Algorithms for finding paths in the network
 */
export class PathFinder {
  private graphEngine: GraphEngine;

  constructor(graphEngine: GraphEngine) {
    this.graphEngine = graphEngine;
  }

  /**
   * Calculate edge weight based on options
   */
  private getWeight(edge: NetworkEdge, options: PathOptions): number {
    if (options.weightAttribute && edge.properties[options.weightAttribute] !== undefined) {
      return edge.properties[options.weightAttribute] as number;
    }
    // Default to distance, then weight, then 1
    return edge.properties.distance ?? edge.properties.weight ?? 1;
  }

  /**
   * Select the optimal (minimum weight) edge from multiple edges between the same nodes
   */
  private selectOptimalEdge(edgesBetween: NetworkEdge[], options: PathOptions): NetworkEdge {
    if (edgesBetween.length === 1) {
      return edgesBetween[0];
    }
    return edgesBetween.reduce((best, edge) =>
      this.getWeight(edge, options) < this.getWeight(best, options) ? edge : best
    );
  }

  /**
   * Find the shortest path between two nodes using Dijkstra's algorithm
   * Supports blocking and best-effort constraint modes
   */
  shortestPath(
    sourceId: string,
    targetId: string,
    options: PathOptions = {}
  ): PathResult | null {
    const graph = this.graphEngine.getGraph();

    if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) {
      return null;
    }

    // Try with all constraints first (blocking mode)
    const blockingResult = this.findPathWithConstraints(sourceId, targetId, options);

    if (blockingResult) {
      return blockingResult;
    }

    // If blocking mode failed and we have best-effort constraints, try relaxing them
    const hasBestEffortConstraints =
      options.excludeNodesMode === 'best-effort' ||
      options.excludeEdgesMode === 'best-effort' ||
      options.maxHopsMode === 'best-effort';

    if (!hasBestEffortConstraints) {
      return null;
    }

    // Try progressively relaxing constraints in best-effort mode
    return this.findPathBestEffort(sourceId, targetId, options);
  }

  /**
   * Find path with strict constraint enforcement
   */
  private findPathWithConstraints(
    sourceId: string,
    targetId: string,
    options: PathOptions
  ): PathResult | null {
    const graph = this.graphEngine.getGraph();
    let workingGraph = graph;

    if (options.excludeNodes?.length || options.excludeEdges?.length) {
      workingGraph = graph.copy();

      // Remove excluded nodes (but not source or target)
      options.excludeNodes?.forEach((nodeId) => {
        if (workingGraph.hasNode(nodeId) && nodeId !== sourceId && nodeId !== targetId) {
          workingGraph.dropNode(nodeId);
        }
      });

      // Remove excluded edges
      options.excludeEdges?.forEach((edgeId) => {
        workingGraph.forEachEdge((edge, attrs) => {
          if ((attrs as NetworkEdge).id === edgeId) {
            workingGraph.dropEdge(edge);
          }
        });
      });
    }

    try {
      const path = dijkstra.bidirectional(
        workingGraph,
        sourceId,
        targetId,
        (_, attrs) => {
          const edgeData = attrs as NetworkEdge;
          return this.getWeight(edgeData, options);
        }
      );

      if (!path || path.length === 0) {
        return null;
      }

      // Check max hops constraint in blocking mode
      if (options.maxHops && options.maxHopsMode !== 'best-effort' && path.length - 1 > options.maxHops) {
        return null;
      }

      // Calculate metrics and get edge IDs
      let totalWeight = 0;
      let totalDistance = 0;
      const edges: string[] = [];

      for (let i = 0; i < path.length - 1; i++) {
        const edgesBetween = this.graphEngine.getEdgesBetween(path[i], path[i + 1]);
        if (edgesBetween.length > 0) {
          // Select the optimal edge when multiple edges exist between same nodes
          const edge = this.selectOptimalEdge(edgesBetween, options);
          edges.push(edge.id);
          totalWeight += this.getWeight(edge, options);
          totalDistance += edge.properties.distance ?? 0;
        }
      }

      // Check for max hops warning in best-effort mode
      const warnings: PathWarning[] = [];
      if (options.maxHops && options.maxHopsMode === 'best-effort' && path.length - 1 > options.maxHops) {
        warnings.push({
          type: 'max_hops_exceeded',
          message: `Path has ${path.length - 1} hops, exceeds requested max of ${options.maxHops}`,
          details: {
            actualHops: path.length - 1,
            requestedMaxHops: options.maxHops,
          },
        });
      }

      return {
        path,
        edges,
        totalWeight,
        totalDistance,
        hopCount: path.length - 1,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Find path with best-effort constraint relaxation
   * Progressively removes constraints and adds warnings
   */
  private findPathBestEffort(
    sourceId: string,
    targetId: string,
    options: PathOptions
  ): PathResult | null {
    const graph = this.graphEngine.getGraph();
    const warnings: PathWarning[] = [];

    // Start with no exclusions and find any path
    const basePath = dijkstra.bidirectional(
      graph,
      sourceId,
      targetId,
      (_, attrs) => {
        const edgeData = attrs as NetworkEdge;
        return this.getWeight(edgeData, options);
      }
    );

    if (!basePath || basePath.length === 0) {
      return null;
    }

    // Calculate metrics
    let totalWeight = 0;
    let totalDistance = 0;
    const edges: string[] = [];

    for (let i = 0; i < basePath.length - 1; i++) {
      const edgesBetween = this.graphEngine.getEdgesBetween(basePath[i], basePath[i + 1]);
      if (edgesBetween.length > 0) {
        // Select the optimal edge when multiple edges exist between same nodes
        const edge = this.selectOptimalEdge(edgesBetween, options);
        edges.push(edge.id);
        totalWeight += this.getWeight(edge, options);
        totalDistance += edge.properties.distance ?? 0;
      }
    }

    // Check for violated constraints and add warnings

    // Check nodes that weren't avoided
    if (options.excludeNodes?.length && options.excludeNodesMode === 'best-effort') {
      const pathNodesSet = new Set(basePath);
      options.excludeNodes.forEach((nodeId) => {
        if (pathNodesSet.has(nodeId) && nodeId !== sourceId && nodeId !== targetId) {
          warnings.push({
            type: 'node_not_avoided',
            message: `Could not avoid node ${nodeId}`,
            details: { nodeId },
          });
        }
      });
    }

    // Check edges that weren't avoided
    if (options.excludeEdges?.length && options.excludeEdgesMode === 'best-effort') {
      const pathEdgesSet = new Set(edges);
      options.excludeEdges.forEach((edgeId) => {
        if (pathEdgesSet.has(edgeId)) {
          warnings.push({
            type: 'edge_not_avoided',
            message: `Could not avoid edge ${edgeId}`,
            details: { edgeId },
          });
        }
      });
    }

    // Check max hops
    if (options.maxHops && options.maxHopsMode === 'best-effort' && basePath.length - 1 > options.maxHops) {
      warnings.push({
        type: 'max_hops_exceeded',
        message: `Path has ${basePath.length - 1} hops, exceeds requested max of ${options.maxHops}`,
        details: {
          actualHops: basePath.length - 1,
          requestedMaxHops: options.maxHops,
        },
      });
    }

    return {
      path: basePath,
      edges,
      totalWeight,
      totalDistance,
      hopCount: basePath.length - 1,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Find k shortest paths using Yen's algorithm
   */
  kShortestPaths(
    sourceId: string,
    targetId: string,
    k: number,
    options: PathOptions = {}
  ): PathResult[] {
    const results: PathResult[] = [];
    const excludedEdgeSets: Set<string>[] = [];

    // Get the first shortest path
    const firstPath = this.shortestPath(sourceId, targetId, options);
    if (!firstPath) {
      return results;
    }
    results.push(firstPath);

    // Find k-1 more paths
    for (let pathIndex = 1; pathIndex < k; pathIndex++) {
      const candidates: PathResult[] = [];
      const previousPath = results[pathIndex - 1];

      // For each node in the previous path (except the last)
      for (let i = 0; i < previousPath.path.length - 1; i++) {
        const spurNode = previousPath.path[i];
        const rootPath = previousPath.path.slice(0, i + 1);

        // Build set of edges to exclude
        const excludeEdges = new Set<string>(options.excludeEdges ?? []);

        // Add edges from previous paths that share the root path
        results.forEach((result) => {
          const resultRootPath = result.path.slice(0, i + 1);
          if (arraysEqual(resultRootPath, rootPath) && result.edges[i]) {
            excludeEdges.add(result.edges[i]);
          }
        });

        // Also exclude edges from previous candidate exclusions
        excludedEdgeSets.forEach((edgeSet) => {
          edgeSet.forEach((e) => excludeEdges.add(e));
        });

        // Find spur path from spur node to target
        const spurPath = this.shortestPath(spurNode, targetId, {
          ...options,
          excludeEdges: Array.from(excludeEdges),
          excludeNodes: [...(options.excludeNodes ?? []), ...rootPath.slice(0, -1)],
        });

        if (spurPath) {
          // Combine root path and spur path
          const totalPath = [...rootPath.slice(0, -1), ...spurPath.path];

          // Get edges for the root portion
          const rootEdges: string[] = [];
          for (let j = 0; j < i; j++) {
            rootEdges.push(previousPath.edges[j]);
          }

          // Calculate total metrics
          let totalWeight = spurPath.totalWeight;
          let totalDistance = spurPath.totalDistance;

          for (let j = 0; j < i; j++) {
            const edge = this.graphEngine.getEdge(previousPath.edges[j]);
            if (edge) {
              totalWeight += this.getWeight(edge, options);
              totalDistance += edge.properties.distance ?? 0;
            }
          }

          const candidate: PathResult = {
            path: totalPath,
            edges: [...rootEdges, ...spurPath.edges],
            totalWeight,
            totalDistance,
            hopCount: totalPath.length - 1,
          };

          // Add if not duplicate
          const pathKey = totalPath.join(',');
          if (
            !candidates.some((c) => c.path.join(',') === pathKey) &&
            !results.some((r) => r.path.join(',') === pathKey)
          ) {
            candidates.push(candidate);
          }
        }
      }

      if (candidates.length === 0) {
        break;
      }

      // Sort by total weight and pick the best
      candidates.sort((a, b) => a.totalWeight - b.totalWeight);
      results.push(candidates[0]);
    }

    return results;
  }

  /**
   * Find edge-disjoint paths (paths that don't share any edges)
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @param options - Algorithm options or legacy count parameter
   */
  findEdgeDisjointPaths(
    sourceId: string,
    targetId: string,
    options: DisjointPathOptions | number = {}
  ): PathResult[] {
    // Handle legacy count parameter for backward compatibility
    const opts: DisjointPathOptions = typeof options === 'number'
      ? { maxPaths: options }
      : options;

    const { algorithm = 'greedy', maxPaths = Infinity } = opts;

    if (algorithm === 'maxflow') {
      return this.findEdgeDisjointPathsMaxFlow(sourceId, targetId, maxPaths);
    }

    return this.findEdgeDisjointPathsGreedy(sourceId, targetId, maxPaths);
  }

  /**
   * Greedy algorithm for edge-disjoint paths (fast, may miss paths)
   */
  private findEdgeDisjointPathsGreedy(
    sourceId: string,
    targetId: string,
    maxPaths: number
  ): PathResult[] {
    const results: PathResult[] = [];
    const usedEdges = new Set<string>();

    for (let i = 0; i < maxPaths; i++) {
      const path = this.shortestPath(sourceId, targetId, {
        excludeEdges: Array.from(usedEdges),
      });

      if (!path) {
        break;
      }

      results.push(path);
      path.edges.forEach((edgeId) => usedEdges.add(edgeId));
    }

    return results;
  }

  /**
   * Build a flow network from the graph for max-flow computation
   *
   * For undirected edge-disjoint paths, each physical edge should only allow
   * 1 unit of flow total (not 1 in each direction). We model this by:
   * - Creating forward and backward edges with capacity 1 each
   * - Linking them so that when flow uses one direction, the other is blocked
   */
  private buildFlowNetwork(): FlowNetwork {
    const adjacency = new Map<string, FlowEdge[]>();
    const graph = this.graphEngine.getGraph();

    // Initialize adjacency lists for all nodes
    graph.forEachNode((nodeId) => {
      adjacency.set(nodeId, []);
    });

    // For each undirected edge, create paired directed edges
    // The key insight: for edge-disjoint paths in undirected graphs,
    // each physical edge can only be used once (in either direction)
    graph.forEachEdge((_edge, attrs, source, target) => {
      const edgeData = attrs as NetworkEdge;
      const edgeId = edgeData.id;

      const sourceEdges = adjacency.get(source)!;
      const targetEdges = adjacency.get(target)!;

      // Forward edge: source -> target (capacity 1)
      const forwardIndex = sourceEdges.length;
      const forwardEdge: FlowEdge = {
        from: source,
        to: target,
        capacity: 1,
        flow: 0,
        reverseIndex: -1, // Will be set after adding residual
        originalEdgeId: edgeId,
        pairedEdgeIndex: -1, // Will be set after adding backward edge
      };
      sourceEdges.push(forwardEdge);

      // Forward residual: target -> source (capacity 0, for flow cancellation)
      const forwardResidualIndex = targetEdges.length;
      const forwardResidual: FlowEdge = {
        from: target,
        to: source,
        capacity: 0,
        flow: 0,
        reverseIndex: forwardIndex,
        originalEdgeId: edgeId,
      };
      targetEdges.push(forwardResidual);

      // Set forward edge's reverse index
      forwardEdge.reverseIndex = forwardResidualIndex;

      // Backward edge: target -> source (capacity 1)
      const backwardIndex = targetEdges.length;
      const backwardEdge: FlowEdge = {
        from: target,
        to: source,
        capacity: 1,
        flow: 0,
        reverseIndex: -1, // Will be set after adding residual
        originalEdgeId: edgeId,
        pairedEdgeIndex: forwardIndex, // Link to forward edge
      };
      targetEdges.push(backwardEdge);

      // Backward residual: source -> target (capacity 0, for flow cancellation)
      const backwardResidualIndex = sourceEdges.length;
      const backwardResidual: FlowEdge = {
        from: source,
        to: target,
        capacity: 0,
        flow: 0,
        reverseIndex: backwardIndex,
        originalEdgeId: edgeId,
      };
      sourceEdges.push(backwardResidual);

      // Set backward edge's reverse index
      backwardEdge.reverseIndex = backwardResidualIndex;

      // Link forward edge to backward edge
      forwardEdge.pairedEdgeIndex = backwardIndex;
    });

    return { adjacency };
  }

  /**
   * Find an augmenting path using BFS (Edmonds-Karp)
   */
  private findAugmentingPath(
    network: FlowNetwork,
    sourceId: string,
    targetId: string
  ): { path: string[]; edges: number[] } | null {
    const visited = new Set<string>();
    const parent = new Map<string, { node: string; edgeIndex: number }>();
    const queue: string[] = [sourceId];
    visited.add(sourceId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current === targetId) {
        // Reconstruct path
        const path: string[] = [];
        const edges: number[] = [];
        let node = targetId;

        while (node !== sourceId) {
          path.unshift(node);
          const parentInfo = parent.get(node)!;
          edges.unshift(parentInfo.edgeIndex);
          node = parentInfo.node;
        }
        path.unshift(sourceId);

        return { path, edges };
      }

      const adjacentEdges = network.adjacency.get(current) || [];
      for (let i = 0; i < adjacentEdges.length; i++) {
        const edge = adjacentEdges[i];
        const residualCapacity = edge.capacity - edge.flow;

        if (residualCapacity > 0 && !visited.has(edge.to)) {
          visited.add(edge.to);
          parent.set(edge.to, { node: current, edgeIndex: i });
          queue.push(edge.to);
        }
      }
    }

    return null;
  }

  /**
   * Compute max flow using Edmonds-Karp algorithm
   * Modified for undirected edge-disjoint paths: when using an edge in one direction,
   * block the opposite direction (paired edge) to ensure each physical edge is used at most once
   */
  private computeMaxFlow(
    network: FlowNetwork,
    sourceId: string,
    targetId: string,
    maxPaths: number
  ): number {
    let totalFlow = 0;

    while (totalFlow < maxPaths) {
      const augPath = this.findAugmentingPath(network, sourceId, targetId);
      if (!augPath) break;

      // Find minimum residual capacity along the path
      let minCapacity = Infinity;
      let current = sourceId;
      for (const edgeIndex of augPath.edges) {
        const edge = network.adjacency.get(current)![edgeIndex];
        minCapacity = Math.min(minCapacity, edge.capacity - edge.flow);
        current = edge.to;
      }

      // Augment flow along the path
      current = sourceId;
      for (const edgeIndex of augPath.edges) {
        const edges = network.adjacency.get(current)!;
        const edge = edges[edgeIndex];
        edge.flow += minCapacity;

        // Update reverse edge (residual capacity)
        const reverseEdges = network.adjacency.get(edge.to)!;
        reverseEdges[edge.reverseIndex].flow -= minCapacity;

        // For undirected graphs: block the paired edge (opposite direction)
        // This ensures each physical edge is only used once total
        if (edge.pairedEdgeIndex !== undefined && edge.pairedEdgeIndex >= 0) {
          const pairedEdge = reverseEdges[edge.pairedEdgeIndex];
          if (pairedEdge) {
            // Reduce paired edge capacity to prevent using this edge in opposite direction
            pairedEdge.capacity = Math.max(0, pairedEdge.capacity - minCapacity);
          }
        }

        current = edge.to;
      }

      totalFlow += minCapacity;
    }

    return totalFlow;
  }

  /**
   * Decompose flow into individual paths
   */
  private decomposeFlowIntoPaths(
    network: FlowNetwork,
    sourceId: string,
    targetId: string
  ): { nodePath: string[]; edgeIds: string[] }[] {
    const paths: { nodePath: string[]; edgeIds: string[] }[] = [];

    // Keep extracting paths while there's flow
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const nodePath: string[] = [sourceId];
      const edgeIds: string[] = [];
      let current = sourceId;
      let foundPath = false;

      while (current !== targetId) {
        const edges = network.adjacency.get(current) || [];
        let foundEdge = false;

        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i];
          // Only follow edges with positive flow and original edge ID
          if (edge.flow > 0 && edge.originalEdgeId) {
            // Reduce flow
            edge.flow -= 1;
            // Update reverse edge
            const reverseEdges = network.adjacency.get(edge.to)!;
            reverseEdges[edge.reverseIndex].flow += 1;

            nodePath.push(edge.to);
            edgeIds.push(edge.originalEdgeId);
            current = edge.to;
            foundEdge = true;
            break;
          }
        }

        if (!foundEdge) {
          // Dead end, can't complete path
          break;
        }
      }

      if (current === targetId && nodePath.length > 1) {
        paths.push({ nodePath, edgeIds });
        foundPath = true;
      }

      if (!foundPath) break;
    }

    return paths;
  }

  /**
   * Convert node path to PathResult format
   */
  private nodePathToResult(nodePath: string[], edgeIds: string[]): PathResult {
    let totalWeight = 0;
    let totalDistance = 0;

    for (const edgeId of edgeIds) {
      const edge = this.graphEngine.getEdge(edgeId);
      if (edge) {
        totalWeight += edge.properties.weight ?? 1;
        totalDistance += edge.properties.distance ?? 0;
      }
    }

    return {
      path: nodePath,
      edges: edgeIds,
      totalWeight,
      totalDistance,
      hopCount: nodePath.length - 1,
    };
  }

  /**
   * Max-flow algorithm for edge-disjoint paths (optimal, guaranteed correct)
   */
  private findEdgeDisjointPathsMaxFlow(
    sourceId: string,
    targetId: string,
    maxPaths: number
  ): PathResult[] {
    const graph = this.graphEngine.getGraph();

    if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) {
      return [];
    }

    if (sourceId === targetId) {
      return [];
    }

    // Build flow network
    const network = this.buildFlowNetwork();

    // Compute max flow
    this.computeMaxFlow(network, sourceId, targetId, maxPaths);

    // Rebuild network to decompose flow (need fresh flow values)
    const network2 = this.buildFlowNetwork();
    this.computeMaxFlow(network2, sourceId, targetId, maxPaths);

    // Decompose flow into paths
    const decomposedPaths = this.decomposeFlowIntoPaths(network2, sourceId, targetId);

    // Convert to PathResult format
    return decomposedPaths.map(({ nodePath, edgeIds }) =>
      this.nodePathToResult(nodePath, edgeIds)
    );
  }

  /**
   * Find node-disjoint paths (paths that don't share any nodes except source/target)
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @param options - Algorithm options or legacy count parameter
   */
  findNodeDisjointPaths(
    sourceId: string,
    targetId: string,
    options: DisjointPathOptions | number = {}
  ): PathResult[] {
    // Handle legacy count parameter for backward compatibility
    const opts: DisjointPathOptions = typeof options === 'number'
      ? { maxPaths: options }
      : options;

    const { algorithm = 'greedy', maxPaths = Infinity } = opts;

    if (algorithm === 'maxflow') {
      return this.findNodeDisjointPathsMaxFlow(sourceId, targetId, maxPaths);
    }

    return this.findNodeDisjointPathsGreedy(sourceId, targetId, maxPaths);
  }

  /**
   * Greedy algorithm for node-disjoint paths (fast, may miss paths)
   */
  private findNodeDisjointPathsGreedy(
    sourceId: string,
    targetId: string,
    maxPaths: number
  ): PathResult[] {
    const results: PathResult[] = [];
    const usedNodes = new Set<string>();

    for (let i = 0; i < maxPaths; i++) {
      const path = this.shortestPath(sourceId, targetId, {
        excludeNodes: Array.from(usedNodes),
      });

      if (!path) {
        break;
      }

      results.push(path);
      // Add intermediate nodes to used set (not source or target)
      path.path.slice(1, -1).forEach((nodeId) => usedNodes.add(nodeId));
    }

    return results;
  }

  /**
   * Max-flow algorithm for node-disjoint paths using node splitting
   */
  private findNodeDisjointPathsMaxFlow(
    sourceId: string,
    targetId: string,
    maxPaths: number
  ): PathResult[] {
    const graph = this.graphEngine.getGraph();

    if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) {
      return [];
    }

    if (sourceId === targetId) {
      return [];
    }

    // Build flow network with node splitting
    // Each node v becomes v_in and v_out with capacity 1 edge between them
    const adjacency = new Map<string, FlowEdge[]>();

    // Create split nodes for all nodes
    graph.forEachNode((nodeId) => {
      const inNode = `${nodeId}_in`;
      const outNode = `${nodeId}_out`;
      adjacency.set(inNode, []);
      adjacency.set(outNode, []);

      // Add internal edge from in to out (capacity 1, except for source/target)
      if (nodeId === sourceId || nodeId === targetId) {
        // Source and target have infinite internal capacity
        const forwardEdge: FlowEdge = {
          from: inNode,
          to: outNode,
          capacity: Infinity,
          flow: 0,
          reverseIndex: 0,
        };
        adjacency.get(inNode)!.push(forwardEdge);
        const reverseEdge: FlowEdge = {
          from: outNode,
          to: inNode,
          capacity: 0,
          flow: 0,
          reverseIndex: 0,
        };
        adjacency.get(outNode)!.push(reverseEdge);
      } else {
        // Internal nodes have capacity 1
        const forwardEdge: FlowEdge = {
          from: inNode,
          to: outNode,
          capacity: 1,
          flow: 0,
          reverseIndex: 0,
        };
        adjacency.get(inNode)!.push(forwardEdge);
        const reverseEdge: FlowEdge = {
          from: outNode,
          to: inNode,
          capacity: 0,
          flow: 0,
          reverseIndex: 0,
        };
        adjacency.get(outNode)!.push(reverseEdge);
      }
    });

    // Add edges between nodes (from out to in)
    graph.forEachEdge((_edge, attrs, source, target) => {
      const edgeData = attrs as NetworkEdge;
      const sourceOut = `${source}_out`;
      const targetIn = `${target}_in`;
      const targetOut = `${target}_out`;
      const sourceIn = `${source}_in`;

      // Forward edge: source_out -> target_in
      const forwardEdges = adjacency.get(sourceOut)!;
      const reverseEdges = adjacency.get(targetIn)!;

      const forwardEdge: FlowEdge = {
        from: sourceOut,
        to: targetIn,
        capacity: 1,
        flow: 0,
        reverseIndex: reverseEdges.length,
        originalEdgeId: edgeData.id,
      };
      forwardEdges.push(forwardEdge);

      const reverseEdge: FlowEdge = {
        from: targetIn,
        to: sourceOut,
        capacity: 0,
        flow: 0,
        reverseIndex: forwardEdges.length - 1,
      };
      reverseEdges.push(reverseEdge);

      // Backward edge: target_out -> source_in (undirected graph)
      const backwardEdges = adjacency.get(targetOut)!;
      const backReverseEdges = adjacency.get(sourceIn)!;

      const backwardEdge: FlowEdge = {
        from: targetOut,
        to: sourceIn,
        capacity: 1,
        flow: 0,
        reverseIndex: backReverseEdges.length,
        originalEdgeId: edgeData.id,
      };
      backwardEdges.push(backwardEdge);

      const backReverseEdge: FlowEdge = {
        from: sourceIn,
        to: targetOut,
        capacity: 0,
        flow: 0,
        reverseIndex: backwardEdges.length - 1,
      };
      backReverseEdges.push(backReverseEdge);
    });

    const network: FlowNetwork = { adjacency };

    // Compute max flow from source_in to target_out
    const sourceNode = `${sourceId}_in`;
    const targetNode = `${targetId}_out`;
    this.computeMaxFlow(network, sourceNode, targetNode, maxPaths);

    // Extract paths from the flow
    const paths: PathResult[] = [];

    while (paths.length < maxPaths) {
      const nodePath: string[] = [];
      const edgeIds: string[] = [];
      let current = sourceNode;
      let foundPath = false;

      while (current !== targetNode) {
        const edges = adjacency.get(current) || [];
        let foundEdge = false;

        for (const edge of edges) {
          if (edge.flow > 0) {
            edge.flow -= 1;
            const reverseEdges = adjacency.get(edge.to)!;
            reverseEdges[edge.reverseIndex].flow += 1;

            // Extract original node ID (remove _in or _out suffix)
            const toNode = edge.to.replace(/_in$|_out$/, '');
            if (edge.originalEdgeId) {
              edgeIds.push(edge.originalEdgeId);
            }

            // Add to path if it's a real node transition
            if (!nodePath.includes(toNode) || toNode === targetId) {
              const currentNode = current.replace(/_in$|_out$/, '');
              if (nodePath.length === 0 || nodePath[nodePath.length - 1] !== currentNode) {
                nodePath.push(currentNode);
              }
            }

            current = edge.to;
            foundEdge = true;
            break;
          }
        }

        if (!foundEdge) break;
      }

      if (current === targetNode) {
        // Add target node
        if (nodePath[nodePath.length - 1] !== targetId) {
          nodePath.push(targetId);
        }

        if (nodePath.length > 1) {
          paths.push(this.nodePathToResult(nodePath, edgeIds));
          foundPath = true;
        }
      }

      if (!foundPath) break;
    }

    return paths;
  }

  // ==========================================================================
  // SRLG-AWARE PATH COMPUTATION
  // ==========================================================================

  /**
   * Find shortest path while avoiding specified SRLGs
   *
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @param excludeSRLGs - SRLG codes to avoid
   * @param options - Additional path options
   * @returns Shortest path avoiding SRLGs, or null if none exists
   */
  srlgAwareShortestPath(
    sourceId: string,
    targetId: string,
    excludeSRLGs: string[],
    options: PathOptions = {}
  ): PathResult | null {
    if (excludeSRLGs.length === 0) {
      return this.shortestPath(sourceId, targetId, options);
    }

    const srlgSet = new Set(excludeSRLGs);

    // Find edges to exclude based on SRLG membership
    const excludeEdges = new Set(options.excludeEdges || []);
    const graph = this.graphEngine.getGraph();

    graph.forEachEdge((_, attrs) => {
      const edgeData = attrs as NetworkEdge;
      const edgeSRLGs = edgeData.properties.srlgCodes || [];

      // Exclude edge if it contains any of the specified SRLGs
      if (edgeSRLGs.some((srlg) => srlgSet.has(srlg))) {
        excludeEdges.add(edgeData.id);
      }
    });

    return this.shortestPath(sourceId, targetId, {
      ...options,
      excludeEdges: Array.from(excludeEdges),
    });
  }

  /**
   * Find a path that is SRLG-diverse from a reference path
   *
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @param referencePath - Path to be diverse from
   * @param maxOverlapPercent - Maximum acceptable SRLG overlap (0-100, default 0)
   * @param options - Additional path options
   * @returns SRLG-diverse path, or null if none exists within constraints
   */
  findSRLGDiversePath(
    sourceId: string,
    targetId: string,
    referencePath: PathResult,
    maxOverlapPercent: number = 0,
    options: PathOptions = {}
  ): PathResult | null {
    // Get SRLGs from reference path
    const referenceSRLGs = this.getPathSRLGs(referencePath.edges);

    if (referenceSRLGs.size === 0) {
      // No SRLGs on reference path - any path is diverse
      // Still try to find edge-disjoint path
      return this.shortestPath(sourceId, targetId, {
        ...options,
        excludeEdges: [...(options.excludeEdges || []), ...referencePath.edges],
      });
    }

    // Try strict SRLG avoidance first
    const strictPath = this.srlgAwareShortestPath(
      sourceId,
      targetId,
      Array.from(referenceSRLGs),
      options
    );

    if (strictPath) {
      return strictPath;
    }

    // If strict avoidance fails and we allow some overlap, find minimum overlap
    if (maxOverlapPercent > 0) {
      const result = this.findMinimumSRLGOverlapPath(
        sourceId,
        targetId,
        referencePath,
        options
      );

      if (result && result.overlapPercent <= maxOverlapPercent) {
        return result.path;
      }
    }

    return null;
  }

  /**
   * Find path with minimum SRLG overlap with reference path
   *
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @param referencePath - Path to compare against
   * @param options - Additional path options
   * @returns Path with overlap analysis, or null if no path exists
   */
  findMinimumSRLGOverlapPath(
    sourceId: string,
    targetId: string,
    referencePath: PathResult,
    options: PathOptions = {}
  ): { path: PathResult; sharedSRLGs: string[]; overlapPercent: number } | null {
    const referenceSRLGs = this.getPathSRLGs(referencePath.edges);

    // Get k-shortest paths and find the one with minimum overlap
    const candidates = this.kShortestPaths(sourceId, targetId, 10, options);

    if (candidates.length === 0) {
      return null;
    }

    let bestPath: PathResult | null = null;
    let minOverlap = Infinity;
    let bestSharedSRLGs: string[] = [];

    for (const candidate of candidates) {
      const candidateSRLGs = this.getPathSRLGs(candidate.edges);

      // Count shared SRLGs
      const sharedSRLGs: string[] = [];
      for (const srlg of candidateSRLGs) {
        if (referenceSRLGs.has(srlg)) {
          sharedSRLGs.push(srlg);
        }
      }

      if (sharedSRLGs.length < minOverlap) {
        minOverlap = sharedSRLGs.length;
        bestPath = candidate;
        bestSharedSRLGs = sharedSRLGs;

        // If we found a path with no overlap, return immediately
        if (minOverlap === 0) {
          break;
        }
      }
    }

    if (!bestPath) {
      return null;
    }

    // Calculate overlap percentage
    const totalSRLGs = new Set([...referenceSRLGs, ...this.getPathSRLGs(bestPath.edges)]);
    const overlapPercent =
      totalSRLGs.size > 0 ? Math.round((bestSharedSRLGs.length / totalSRLGs.size) * 100) : 0;

    return {
      path: bestPath,
      sharedSRLGs: bestSharedSRLGs,
      overlapPercent,
    };
  }

  /**
   * Get all SRLGs for a set of edges
   *
   * @param edgeIds - Edge IDs to check
   * @returns Set of unique SRLG codes
   */
  private getPathSRLGs(edgeIds: string[]): Set<string> {
    const srlgs = new Set<string>();

    for (const edgeId of edgeIds) {
      const edge = this.graphEngine.getEdge(edgeId);
      if (edge?.properties.srlgCodes) {
        for (const srlg of edge.properties.srlgCodes) {
          srlgs.add(srlg);
        }
      }
    }

    return srlgs;
  }

  /**
   * Validate that a path avoids specified SRLGs
   *
   * @param path - Path to validate
   * @param excludeSRLGs - SRLGs that should not appear
   * @returns Validation result with any violations
   */
  validateSRLGAvoidance(
    path: PathResult,
    excludeSRLGs: string[]
  ): { valid: boolean; violations: string[] } {
    if (excludeSRLGs.length === 0) {
      return { valid: true, violations: [] };
    }

    const srlgSet = new Set(excludeSRLGs);
    const pathSRLGs = this.getPathSRLGs(path.edges);
    const violations: string[] = [];

    for (const srlg of pathSRLGs) {
      if (srlgSet.has(srlg)) {
        violations.push(srlg);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Check if a path exists between two nodes
   */
  pathExists(sourceId: string, targetId: string, options: PathOptions = {}): boolean {
    return this.shortestPath(sourceId, targetId, options) !== null;
  }

  /**
   * Get all nodes reachable from a source node
   */
  getReachableNodes(sourceId: string): string[] {
    const graph = this.graphEngine.getGraph();
    if (!graph.hasNode(sourceId)) return [];

    const visited = new Set<string>();
    const stack = [sourceId];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);

      graph.forEachNeighbor(node, (neighbor) => {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      });
    }

    return Array.from(visited);
  }
}

/**
 * Helper function to compare arrays
 */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}
