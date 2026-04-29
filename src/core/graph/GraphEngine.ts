import Graph from 'graphology';
import { NetworkNode, NetworkEdge, NetworkTopology } from '@/types';

/**
 * Validation result from graph operations
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Network statistics
 */
export interface NetworkStatistics {
  nodeCount: number;
  edgeCount: number;
  density: number;
  isConnected: boolean;
  componentCount: number;
  averageDegree: number;
}

/**
 * GraphEngine - Wrapper around graphology for network topology operations
 */
export class GraphEngine {
  private graph: Graph;

  constructor() {
    // Enable multi-edge support to handle parallel edges between same nodes
    this.graph = new Graph({ multi: true, allowSelfLoops: false, type: 'undirected' });
  }

  /**
   * Initialize graph from a network topology
   */
  loadFromTopology(topology: NetworkTopology): void {
    this.graph.clear();

    // Add all nodes
    topology.nodes.forEach((node) => {
      this.graph.addNode(node.id, { ...node });
    });

    // Add all edges - use addEdgeWithKey to support parallel edges
    topology.edges.forEach((edge) => {
      if (
        this.graph.hasNode(edge.source.nodeId) &&
        this.graph.hasNode(edge.target.nodeId)
      ) {
        try {
          // Use edge.id as the key to allow multiple edges between same nodes
          this.graph.addEdgeWithKey(edge.id, edge.source.nodeId, edge.target.nodeId, {
            ...edge,
          });
        } catch {
          // Edge might already exist with this key
        }
      }
    });
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.graph.clear();
  }

  // Node operations

  /**
   * Add a node to the graph
   */
  addNode(node: NetworkNode): void {
    if (!this.graph.hasNode(node.id)) {
      this.graph.addNode(node.id, { ...node });
    }
  }

  /**
   * Remove a node from the graph
   */
  removeNode(nodeId: string): void {
    if (this.graph.hasNode(nodeId)) {
      this.graph.dropNode(nodeId);
    }
  }

  /**
   * Update node attributes
   */
  updateNode(nodeId: string, updates: Partial<NetworkNode>): void {
    if (this.graph.hasNode(nodeId)) {
      this.graph.mergeNodeAttributes(nodeId, updates);
    }
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): NetworkNode | null {
    if (this.graph.hasNode(nodeId)) {
      return this.graph.getNodeAttributes(nodeId) as NetworkNode;
    }
    return null;
  }

  /**
   * Get all nodes
   */
  getAllNodes(): NetworkNode[] {
    return this.graph.mapNodes((_, attrs) => attrs as NetworkNode);
  }

  /**
   * Check if node exists
   */
  hasNode(nodeId: string): boolean {
    return this.graph.hasNode(nodeId);
  }

  // Edge operations

  /**
   * Add an edge to the graph
   * Now supports multiple edges between the same nodes (parallel edges)
   */
  addEdge(edge: NetworkEdge): boolean {
    const { source, target } = edge;

    if (
      this.graph.hasNode(source.nodeId) &&
      this.graph.hasNode(target.nodeId)
    ) {
      try {
        // Use edge.id as key to support parallel edges
        this.graph.addEdgeWithKey(edge.id, source.nodeId, target.nodeId, { ...edge });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Remove an edge by ID
   */
  removeEdge(edgeId: string): void {
    this.graph.forEachEdge((edge, attrs) => {
      if ((attrs as NetworkEdge).id === edgeId) {
        this.graph.dropEdge(edge);
      }
    });
  }

  /**
   * Get an edge by ID
   */
  getEdge(edgeId: string): NetworkEdge | null {
    let result: NetworkEdge | null = null;
    this.graph.forEachEdge((_, attrs) => {
      if ((attrs as NetworkEdge).id === edgeId) {
        result = attrs as NetworkEdge;
      }
    });
    return result;
  }

  /**
   * Get all edges
   */
  getAllEdges(): NetworkEdge[] {
    return this.graph.mapEdges((_, attrs) => attrs as NetworkEdge);
  }

  /**
   * Check if edge exists between two nodes
   */
  hasEdgeBetween(nodeA: string, nodeB: string): boolean {
    if (!this.graph.hasNode(nodeA) || !this.graph.hasNode(nodeB)) {
      return false;
    }
    return this.graph.hasEdge(nodeA, nodeB);
  }

  /**
   * Get edges between two nodes
   */
  getEdgesBetween(nodeA: string, nodeB: string): NetworkEdge[] {
    const edges: NetworkEdge[] = [];
    if (this.graph.hasNode(nodeA) && this.graph.hasNode(nodeB)) {
      this.graph.forEachEdge(nodeA, (_, attrs, source, target) => {
        if (
          (source === nodeA && target === nodeB) ||
          (source === nodeB && target === nodeA)
        ) {
          edges.push(attrs as NetworkEdge);
        }
      });
    }
    return edges;
  }

  // Graph queries

  /**
   * Get neighbors of a node
   */
  getNeighbors(nodeId: string): NetworkNode[] {
    if (!this.graph.hasNode(nodeId)) return [];
    return this.graph.mapNeighbors(nodeId, (_, attrs) => attrs as NetworkNode);
  }

  /**
   * Get edges connected to a node
   */
  getConnectedEdges(nodeId: string): NetworkEdge[] {
    if (!this.graph.hasNode(nodeId)) return [];
    const edges: NetworkEdge[] = [];
    this.graph.forEachEdge(nodeId, (_, attrs) => {
      edges.push(attrs as NetworkEdge);
    });
    return edges;
  }

  /**
   * Get degree of a node
   */
  getDegree(nodeId: string): number {
    if (!this.graph.hasNode(nodeId)) return 0;
    return this.graph.degree(nodeId);
  }

  /**
   * Check if the graph is connected (all nodes reachable from any node)
   */
  isConnected(): boolean {
    if (this.graph.order === 0) return true;
    if (this.graph.order === 1) return true;

    const visited = new Set<string>();
    const stack = [this.graph.nodes()[0]];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);

      this.graph.forEachNeighbor(node, (neighbor) => {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      });
    }

    return visited.size === this.graph.order;
  }

  /**
   * Get connected components (groups of connected nodes)
   */
  getConnectedComponents(): NetworkNode[][] {
    const visited = new Set<string>();
    const components: NetworkNode[][] = [];

    this.graph.forEachNode((nodeId) => {
      if (!visited.has(nodeId)) {
        const component: NetworkNode[] = [];
        const stack = [nodeId];

        while (stack.length > 0) {
          const currentId = stack.pop()!;
          if (visited.has(currentId)) continue;
          visited.add(currentId);
          component.push(this.graph.getNodeAttributes(currentId) as NetworkNode);

          this.graph.forEachNeighbor(currentId, (neighbor) => {
            if (!visited.has(neighbor)) {
              stack.push(neighbor);
            }
          });
        }

        components.push(component);
      }
    });

    return components;
  }

  // Validation

  /**
   * Validate the graph for common issues
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for isolated nodes
    this.graph.forEachNode((nodeId, attrs) => {
      if (this.graph.degree(nodeId) === 0) {
        warnings.push(`Node "${(attrs as NetworkNode).name}" is not connected to any other node`);
      }
    });

    // Check for missing node references in edges
    this.graph.forEachEdge((_, attrs) => {
      const edgeData = attrs as NetworkEdge;
      if (!this.graph.hasNode(edgeData.source.nodeId)) {
        errors.push(`Edge "${edgeData.name}" references non-existent source node`);
      }
      if (!this.graph.hasNode(edgeData.target.nodeId)) {
        errors.push(`Edge "${edgeData.name}" references non-existent target node`);
      }
    });

    // Check connectivity
    if (this.graph.order > 1 && !this.isConnected()) {
      warnings.push('Network is not fully connected - there are isolated components');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // Statistics

  /**
   * Get network statistics
   */
  getStatistics(): NetworkStatistics {
    const nodeCount = this.graph.order;
    const edgeCount = this.graph.size;

    // Calculate density: ratio of actual edges to possible edges
    const maxPossibleEdges = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 0;
    const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;

    // Calculate average degree
    let totalDegree = 0;
    this.graph.forEachNode((nodeId) => {
      totalDegree += this.graph.degree(nodeId);
    });
    const averageDegree = nodeCount > 0 ? totalDegree / nodeCount : 0;

    return {
      nodeCount,
      edgeCount,
      density,
      isConnected: this.isConnected(),
      componentCount: this.getConnectedComponents().length,
      averageDegree,
    };
  }

  /**
   * Get the underlying graphology graph instance
   */
  getGraph(): Graph {
    return this.graph;
  }
}

// Export singleton instance
export const graphEngine = new GraphEngine();
