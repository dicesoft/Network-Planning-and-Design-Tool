import React, { useState, useCallback } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { GraphEngine } from '@/core/graph/GraphEngine';
import { PathFinder, DisjointAlgorithm, PathResult } from '@/core/graph/PathFinder';
import { ConstraintConfig, DEFAULT_CONSTRAINT_CONFIG, ConstraintMode } from '@/types';

// Timing utility for algorithm benchmarking
interface TimedResult<T> {
  result: T;
  elapsedMs: number;
}

function withTiming<T>(fn: () => T): TimedResult<T> {
  const start = performance.now();
  const result = fn();
  const elapsedMs = performance.now() - start;
  return { result, elapsedMs };
}

function formatTimingLine(elapsedMs: number): string {
  let timeStr: string;
  if (elapsedMs >= 1) {
    timeStr = `${elapsedMs.toFixed(3)} ms`;
  } else if (elapsedMs >= 0.001) {
    // Convert to microseconds for sub-ms times
    timeStr = `${(elapsedMs * 1000).toFixed(1)} µs`;
  } else {
    // Extremely fast - show as <1 µs
    timeStr = '<1 µs';
  }
  return `\n─────────────────────\nElapsed Time: ${timeStr}`;
}

// Sample topology definitions
type TopologyName = 'diamond' | 'linear' | 'star' | 'ring' | 'mesh' | 'grid10x10' | 'denseMesh' | 'linearLong';

interface TopologyDef {
  name: string;
  description: string;
  nodeCount: number;
}

const SAMPLE_TOPOLOGIES: Record<TopologyName, TopologyDef> = {
  diamond: { name: 'Diamond', description: '4 nodes, 2 parallel paths', nodeCount: 4 },
  linear: { name: 'Linear Chain', description: '5 nodes in sequence', nodeCount: 5 },
  star: { name: 'Star', description: '6 nodes, hub-spoke', nodeCount: 6 },
  ring: { name: 'Ring', description: '6 nodes in circle', nodeCount: 6 },
  mesh: { name: 'Mesh', description: '8 nodes, redundant', nodeCount: 8 },
  grid10x10: { name: 'Grid 10x10', description: '100 nodes, stress test', nodeCount: 100 },
  denseMesh: { name: 'Dense Mesh', description: '50 nodes, 600+ edges', nodeCount: 50 },
  linearLong: { name: 'Long Chain', description: '200 nodes in sequence', nodeCount: 200 },
};

// Check if high-precision timing is available (requires cross-origin isolation)
const isHighPrecisionTiming = typeof window !== 'undefined' && window.crossOriginIsolated;

/**
 * AlgorithmTesterContent - the inner content, used by TabbedTester
 */
export const AlgorithmTesterContent: React.FC = () => {
  const topology = useNetworkStore((state) => state.topology);
  const addNode = useNetworkStore((state) => state.addNode);
  const addEdge = useNetworkStore((state) => state.addEdge);
  const clearTopology = useNetworkStore((state) => state.clearTopology);

  const [selectedTopology, setSelectedTopology] = useState<TopologyName>('diamond');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [kPaths, setKPaths] = useState(2);
  const [results, setResults] = useState<string>('');
  const [disjointAlgorithm, setDisjointAlgorithm] = useState<DisjointAlgorithm>('greedy');
  const [maxPathCount, setMaxPathCount] = useState(10);
  const [constraintConfig, setConstraintConfig] = useState<ConstraintConfig>(DEFAULT_CONSTRAINT_CONFIG);
  const [showConstraints, setShowConstraints] = useState(false);

  // Load selected sample topology
  const loadSampleTopology = useCallback(() => {
    clearTopology();

    let firstNodeId = '';
    let lastNodeId = '';
    const nodeIds: string[] = [];

    switch (selectedTopology) {
      case 'diamond': {
        // Diamond: A → B → D, A → C → D
        const nodeA = addNode({ type: 'router', position: { x: 100, y: 200 }, name: 'A', vendor: 'generic', stacks: [], metadata: {} });
        const nodeB = addNode({ type: 'router', position: { x: 250, y: 100 }, name: 'B', vendor: 'generic', stacks: [], metadata: {} });
        const nodeC = addNode({ type: 'router', position: { x: 250, y: 300 }, name: 'C', vendor: 'generic', stacks: [], metadata: {} });
        const nodeD = addNode({ type: 'router', position: { x: 400, y: 200 }, name: 'D', vendor: 'generic', stacks: [], metadata: {} });
        addEdge(nodeA, nodeB);
        addEdge(nodeB, nodeD);
        addEdge(nodeA, nodeC);
        addEdge(nodeC, nodeD);
        firstNodeId = nodeA;
        lastNodeId = nodeD;
        setResults('Diamond topology loaded:\nPaths: A→B→D, A→C→D');
        break;
      }
      case 'linear': {
        // Linear Chain: A → B → C → D → E
        const names = ['A', 'B', 'C', 'D', 'E'];
        names.forEach((name, i) => {
          const id = addNode({
            type: 'switch',
            position: { x: 100 + i * 120, y: 200 },
            name,
            vendor: 'generic',
            stacks: [],
            metadata: {},
          });
          nodeIds.push(id);
          if (i > 0) addEdge(nodeIds[i - 1], id);
        });
        firstNodeId = nodeIds[0];
        lastNodeId = nodeIds[nodeIds.length - 1];
        setResults('Linear topology loaded:\nPath: A→B→C→D→E');
        break;
      }
      case 'star': {
        // Star: Hub connected to 5 spokes
        const hub = addNode({
          type: 'router',
          position: { x: 250, y: 200 },
          name: 'Hub',
          vendor: 'cisco',
          stacks: [],
          metadata: {},
        });
        nodeIds.push(hub);
        const spokeNames = ['S1', 'S2', 'S3', 'S4', 'S5'];
        const angles = [0, 72, 144, 216, 288];
        spokeNames.forEach((name, i) => {
          const angle = (angles[i] * Math.PI) / 180;
          const x = 250 + Math.cos(angle) * 150;
          const y = 200 + Math.sin(angle) * 150;
          const id = addNode({
            type: 'switch',
            position: { x, y },
            name,
            vendor: 'generic',
            stacks: [],
            metadata: {},
          });
          nodeIds.push(id);
          addEdge(hub, id);
        });
        firstNodeId = nodeIds[1]; // S1
        lastNodeId = nodeIds[3]; // S3 (across the hub)
        setResults('Star topology loaded:\nHub with 5 spokes (S1-S5)');
        break;
      }
      case 'ring': {
        // Ring: A → B → C → D → E → F → A
        const names = ['A', 'B', 'C', 'D', 'E', 'F'];
        names.forEach((name, i) => {
          const angle = ((i * 60 - 90) * Math.PI) / 180;
          const x = 250 + Math.cos(angle) * 130;
          const y = 200 + Math.sin(angle) * 130;
          const id = addNode({
            type: 'oadm',
            position: { x, y },
            name,
            vendor: 'nokia',
            stacks: [],
            metadata: {},
          });
          nodeIds.push(id);
        });
        // Connect in ring
        for (let i = 0; i < nodeIds.length; i++) {
          addEdge(nodeIds[i], nodeIds[(i + 1) % nodeIds.length]);
        }
        firstNodeId = nodeIds[0];
        lastNodeId = nodeIds[3]; // Opposite side
        setResults('Ring topology loaded:\nCycle: A→B→C→D→E→F→A');
        break;
      }
      case 'mesh': {
        // Mesh: 8 nodes with multiple redundant paths
        const positions = [
          { x: 100, y: 100, name: 'N1' },
          { x: 250, y: 100, name: 'N2' },
          { x: 400, y: 100, name: 'N3' },
          { x: 100, y: 250, name: 'N4' },
          { x: 250, y: 250, name: 'N5' },
          { x: 400, y: 250, name: 'N6' },
          { x: 175, y: 350, name: 'N7' },
          { x: 325, y: 350, name: 'N8' },
        ];
        positions.forEach((pos) => {
          const id = addNode({
            type: 'router',
            position: { x: pos.x, y: pos.y },
            name: pos.name,
            vendor: 'huawei',
            stacks: [],
            metadata: {},
          });
          nodeIds.push(id);
        });
        // Create mesh connections
        const connections = [
          [0, 1], [1, 2], // Top row
          [0, 3], [1, 4], [2, 5], // Vertical
          [3, 4], [4, 5], // Middle row
          [3, 6], [4, 6], [4, 7], [5, 7], // Bottom connections
          [6, 7], // Bottom row
          [0, 4], [1, 5], [1, 3], [2, 4], // Diagonal redundancy
        ];
        connections.forEach(([from, to]) => {
          addEdge(nodeIds[from], nodeIds[to]);
        });
        firstNodeId = nodeIds[0]; // N1 top-left
        lastNodeId = nodeIds[7]; // N8 bottom-right
        setResults('Mesh topology loaded:\n8 nodes with 16 edges\nMultiple redundant paths');
        break;
      }
      case 'grid10x10': {
        // Grid 10x10: 100 nodes arranged in a 10x10 grid
        const gridSize = 10;
        const spacing = 80;
        const gridNodes: string[][] = [];

        // Create nodes
        for (let row = 0; row < gridSize; row++) {
          gridNodes[row] = [];
          for (let col = 0; col < gridSize; col++) {
            const id = addNode({
              type: 'router',
              position: { x: 50 + col * spacing, y: 50 + row * spacing },
              name: `N${row * gridSize + col + 1}`,
              vendor: 'generic',
              stacks: [],
              metadata: {},
            });
            gridNodes[row][col] = id;
            nodeIds.push(id);
          }
        }

        // Connect grid neighbors (up, down, left, right)
        let edgeCount = 0;
        for (let row = 0; row < gridSize; row++) {
          for (let col = 0; col < gridSize; col++) {
            // Connect right
            if (col < gridSize - 1) {
              addEdge(gridNodes[row][col], gridNodes[row][col + 1]);
              edgeCount++;
            }
            // Connect down
            if (row < gridSize - 1) {
              addEdge(gridNodes[row][col], gridNodes[row + 1][col]);
              edgeCount++;
            }
          }
        }

        firstNodeId = gridNodes[0][0]; // Top-left
        lastNodeId = gridNodes[gridSize - 1][gridSize - 1]; // Bottom-right
        setResults(`Grid 10x10 topology loaded:\n100 nodes, ${edgeCount} edges\nSource: top-left, Target: bottom-right`);
        break;
      }
      case 'denseMesh': {
        // Dense Mesh: 50 nodes with ~50% connectivity
        const meshNodeCount = 50;
        const nodesPerRow = 10;
        const meshSpacing = 100;

        // Create nodes in a grid-like arrangement
        for (let i = 0; i < meshNodeCount; i++) {
          const row = Math.floor(i / nodesPerRow);
          const col = i % nodesPerRow;
          const id = addNode({
            type: 'switch',
            position: { x: 50 + col * meshSpacing, y: 50 + row * meshSpacing },
            name: `M${i + 1}`,
            vendor: 'generic',
            stacks: [],
            metadata: {},
          });
          nodeIds.push(id);
        }

        // Connect with ~50% density (connect if (i+j) % 2 == 0 or distance < threshold)
        let denseEdgeCount = 0;
        for (let i = 0; i < meshNodeCount; i++) {
          for (let j = i + 1; j < meshNodeCount; j++) {
            // Connect based on multiple criteria for dense connectivity
            const rowI = Math.floor(i / nodesPerRow);
            const colI = i % nodesPerRow;
            const rowJ = Math.floor(j / nodesPerRow);
            const colJ = j % nodesPerRow;
            const distance = Math.abs(rowI - rowJ) + Math.abs(colI - colJ);

            // Connect if: adjacent, or diagonal, or every 3rd node pair
            if (distance <= 2 || (i + j) % 3 === 0) {
              addEdge(nodeIds[i], nodeIds[j]);
              denseEdgeCount++;
            }
          }
        }

        firstNodeId = nodeIds[0];
        lastNodeId = nodeIds[meshNodeCount - 1];
        setResults(`Dense Mesh topology loaded:\n${meshNodeCount} nodes, ${denseEdgeCount} edges\nHigh connectivity for stress testing`);
        break;
      }
      case 'linearLong': {
        // Linear Long: 200 nodes in a chain
        const chainLength = 200;
        const chainSpacing = 50;
        const nodesPerLineRow = 20;

        for (let i = 0; i < chainLength; i++) {
          const row = Math.floor(i / nodesPerLineRow);
          const col = i % nodesPerLineRow;
          const id = addNode({
            type: 'switch',
            position: { x: 50 + col * chainSpacing, y: 50 + row * 80 },
            name: `L${i + 1}`,
            vendor: 'generic',
            stacks: [],
            metadata: {},
          });
          nodeIds.push(id);

          // Connect to previous node
          if (i > 0) {
            addEdge(nodeIds[i - 1], id);
          }
        }

        firstNodeId = nodeIds[0];
        lastNodeId = nodeIds[chainLength - 1];
        setResults(`Long Chain topology loaded:\n${chainLength} nodes, ${chainLength - 1} edges\nSequential path from L1 to L${chainLength}`);
        break;
      }
    }

    setSourceId(firstNodeId);
    setTargetId(lastNodeId);
  }, [clearTopology, addNode, addEdge, selectedTopology]);

  // Create GraphEngine and PathFinder instances
  const createPathFinder = useCallback(() => {
    const engine = new GraphEngine();
    engine.loadFromTopology(topology);
    return new PathFinder(engine);
  }, [topology]);

  // Format path result with warnings
  const formatPathResult = useCallback((result: PathResult, title: string, elapsedMs: number): string => {
    const nodeNames = result.path.map((id) => {
      const node = topology.nodes.find((n) => n.id === id);
      return node?.name || id.slice(0, 8);
    });

    let output = `${title}:\nPath: ${nodeNames.join(' → ')}\nTotal Weight: ${result.totalWeight}\nHop Count: ${result.hopCount}`;

    if (result.warnings && result.warnings.length > 0) {
      output += '\n\n⚠️ Warnings:';
      result.warnings.forEach((warning) => {
        output += `\n  - ${warning.message}`;
      });
    }

    output += formatTimingLine(elapsedMs);
    return output;
  }, [topology.nodes]);

  // Build path options from constraint config
  const buildPathOptions = useCallback(() => {
    const options: Parameters<PathFinder['shortestPath']>[2] = {};

    if (constraintConfig.avoidNodes.enabled && constraintConfig.avoidNodes.nodeIds.length > 0) {
      options.excludeNodes = constraintConfig.avoidNodes.nodeIds;
      options.excludeNodesMode = constraintConfig.avoidNodes.mode;
    }

    if (constraintConfig.avoidEdges.enabled && constraintConfig.avoidEdges.edgeIds.length > 0) {
      options.excludeEdges = constraintConfig.avoidEdges.edgeIds;
      options.excludeEdgesMode = constraintConfig.avoidEdges.mode;
    }

    if (constraintConfig.maxHops.enabled) {
      options.maxHops = constraintConfig.maxHops.value;
      options.maxHopsMode = constraintConfig.maxHops.mode;
    }

    if (constraintConfig.weightAttribute.enabled) {
      options.weightAttribute = constraintConfig.weightAttribute.attribute;
    }

    return options;
  }, [constraintConfig]);

  // Run shortest path algorithm
  const runShortestPath = useCallback(() => {
    if (!sourceId || !targetId) {
      setResults('Error: Select source and target nodes');
      return;
    }

    try {
      const pathFinder = createPathFinder();
      const options = buildPathOptions();
      const { result, elapsedMs } = withTiming(() => pathFinder.shortestPath(sourceId, targetId, options));

      if (result) {
        setResults(formatPathResult(result, 'Shortest Path Result', elapsedMs));
      } else {
        setResults('No path found between selected nodes (constraints may be too strict)');
      }
    } catch (error) {
      setResults(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [sourceId, targetId, createPathFinder, buildPathOptions, formatPathResult]);

  // Run K-shortest paths
  const runKShortest = useCallback(() => {
    if (!sourceId || !targetId) {
      setResults('Error: Select source and target nodes');
      return;
    }

    try {
      const pathFinder = createPathFinder();
      const { result: paths, elapsedMs } = withTiming(() => pathFinder.kShortestPaths(sourceId, targetId, kPaths));

      if (paths.length > 0) {
        const output = paths.map((result, i) => {
          const nodeNames = result.path.map((id) => {
            const node = topology.nodes.find((n) => n.id === id);
            return node?.name || id.slice(0, 8);
          });
          return `Path ${i + 1}: ${nodeNames.join(' → ')} (weight: ${result.totalWeight})`;
        });
        setResults(`K-Shortest Paths (k=${kPaths}):\n${output.join('\n')}${formatTimingLine(elapsedMs)}`);
      } else {
        setResults('No paths found');
      }
    } catch (error) {
      setResults(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [topology, sourceId, targetId, kPaths, createPathFinder]);

  // Run edge-disjoint paths
  const runEdgeDisjoint = useCallback(() => {
    if (!sourceId || !targetId) {
      setResults('Error: Select source and target nodes');
      return;
    }

    try {
      const pathFinder = createPathFinder();
      const { result: paths, elapsedMs } = withTiming(() =>
        pathFinder.findEdgeDisjointPaths(sourceId, targetId, {
          algorithm: disjointAlgorithm,
          maxPaths: maxPathCount,
        })
      );

      if (paths.length > 0) {
        const output = paths.map((result, i) => {
          const nodeNames = result.path.map((id) => {
            const node = topology.nodes.find((n) => n.id === id);
            return node?.name || id.slice(0, 8);
          });
          return `Path ${i + 1}: ${nodeNames.join(' → ')}`;
        });
        const algoLabel = disjointAlgorithm === 'maxflow' ? 'Max-Flow (Optimal)' : 'Greedy (Fast)';
        setResults(`Edge-Disjoint Paths [${algoLabel}]:\n${output.join('\n')}\n\nFound ${paths.length} disjoint path(s)${formatTimingLine(elapsedMs)}`);
      } else {
        setResults('No edge-disjoint paths found');
      }
    } catch (error) {
      setResults(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [topology, sourceId, targetId, createPathFinder, disjointAlgorithm, maxPathCount]);

  // Validate topology
  const runValidation = useCallback(() => {
    try {
      const engine = new GraphEngine();
      engine.loadFromTopology(topology);

      const { result: validationResult, elapsedMs } = withTiming(() => {
        const validation = engine.validate();
        const stats = engine.getStatistics();
        return { validation, stats };
      });

      const { validation, stats } = validationResult;

      const output = [
        `Validation Results:`,
        `- Valid: ${validation.valid ? 'Yes' : 'No'}`,
        `- Nodes: ${stats.nodeCount}`,
        `- Edges: ${stats.edgeCount}`,
        `- Connected: ${stats.isConnected ? 'Yes' : 'No'}`,
        `- Components: ${stats.componentCount}`,
      ];

      if (validation.errors.length > 0) {
        output.push(`\nErrors:`);
        validation.errors.forEach((err: string) => output.push(`  - ${err}`));
      }

      if (validation.warnings.length > 0) {
        output.push(`\nWarnings:`);
        validation.warnings.forEach((warn: string) => output.push(`  - ${warn}`));
      }

      output.push(formatTimingLine(elapsedMs));
      setResults(output.join('\n'));
    } catch (error) {
      setResults(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [topology]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 overflow-auto p-4">
        {/* Sample Topology Selection */}
        <div className="space-y-2">
          <label className="mb-1 block text-xs text-text-secondary">Sample Topology</label>
          <select
            value={selectedTopology}
            onChange={(e) => setSelectedTopology(e.target.value as TopologyName)}
            className="w-full rounded border border-border bg-canvas px-2 py-1.5 text-sm text-white"
          >
            {(Object.keys(SAMPLE_TOPOLOGIES) as TopologyName[]).map((key) => (
              <option key={key} value={key}>
                {SAMPLE_TOPOLOGIES[key].name} - {SAMPLE_TOPOLOGIES[key].description}
              </option>
            ))}
          </select>
          <button
            onClick={loadSampleTopology}
            className="w-full rounded bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700"
          >
            Load {SAMPLE_TOPOLOGIES[selectedTopology].name} ({SAMPLE_TOPOLOGIES[selectedTopology].nodeCount} nodes)
          </button>
        </div>

        {/* Node Selection */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Source Node</label>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-white"
            >
              <option value="">Select...</option>
              {topology.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name || node.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Target Node</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-white"
            >
              <option value="">Select...</option>
              {topology.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name || node.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* K value for k-shortest */}
        <div>
          <label className="mb-1 block text-xs text-text-secondary">K value (for k-shortest)</label>
          <input
            type="number"
            value={kPaths}
            onChange={(e) => setKPaths(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
            max={10}
            className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-white"
          />
        </div>

        {/* Disjoint Path Options */}
        <div className="bg-elevated/50 space-y-2 rounded border border-border p-3">
          <label className="block text-xs font-medium text-text-secondary">Disjoint Path Options</label>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Algorithm</label>
            <select
              value={disjointAlgorithm}
              onChange={(e) => setDisjointAlgorithm(e.target.value as DisjointAlgorithm)}
              className="w-full rounded border border-border bg-canvas px-2 py-1.5 text-sm text-white"
            >
              <option value="greedy">Greedy (Fast, may miss paths)</option>
              <option value="maxflow">Max-Flow (Optimal, guaranteed)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Max Paths to Find</label>
            <input
              type="number"
              value={maxPathCount}
              onChange={(e) => setMaxPathCount(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={20}
              className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-white"
            />
          </div>
        </div>

        {/* Path Constraints */}
        <div className="bg-elevated/50 space-y-2 rounded border border-border p-3">
          <button
            onClick={() => setShowConstraints(!showConstraints)}
            className="flex w-full items-center justify-between text-xs font-medium text-text-secondary"
          >
            <span>Path Constraints</span>
            <span className="text-text-muted">{showConstraints ? '▼' : '▶'}</span>
          </button>

          {showConstraints && (
            <div className="space-y-3 pt-2">
              {/* Avoid Nodes */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={constraintConfig.avoidNodes.enabled}
                      onChange={(e) =>
                        setConstraintConfig((prev) => ({
                          ...prev,
                          avoidNodes: { ...prev.avoidNodes, enabled: e.target.checked },
                        }))
                      }
                      className="h-3 w-3"
                    />
                    Avoid Nodes
                  </label>
                  <select
                    value={constraintConfig.avoidNodes.mode}
                    onChange={(e) =>
                      setConstraintConfig((prev) => ({
                        ...prev,
                        avoidNodes: { ...prev.avoidNodes, mode: e.target.value as ConstraintMode },
                      }))
                    }
                    disabled={!constraintConfig.avoidNodes.enabled}
                    className="rounded border border-border bg-canvas px-1 py-0.5 text-xs text-white disabled:opacity-50"
                  >
                    <option value="blocking">Blocking</option>
                    <option value="best-effort">Best-effort</option>
                  </select>
                </div>
                {constraintConfig.avoidNodes.enabled && (
                  <div className="max-h-24 space-y-1 overflow-y-auto rounded bg-canvas p-2">
                    {topology.nodes
                      .filter((n) => n.id !== sourceId && n.id !== targetId)
                      .map((node) => (
                        <label key={node.id} className="flex items-center gap-2 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            checked={constraintConfig.avoidNodes.nodeIds.includes(node.id)}
                            onChange={(e) => {
                              const nodeIds = e.target.checked
                                ? [...constraintConfig.avoidNodes.nodeIds, node.id]
                                : constraintConfig.avoidNodes.nodeIds.filter((id) => id !== node.id);
                              setConstraintConfig((prev) => ({
                                ...prev,
                                avoidNodes: { ...prev.avoidNodes, nodeIds },
                              }));
                            }}
                            className="h-3 w-3"
                          />
                          {node.name || node.id.slice(0, 8)}
                        </label>
                      ))}
                  </div>
                )}
              </div>

              {/* Avoid Edges */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={constraintConfig.avoidEdges.enabled}
                      onChange={(e) =>
                        setConstraintConfig((prev) => ({
                          ...prev,
                          avoidEdges: { ...prev.avoidEdges, enabled: e.target.checked },
                        }))
                      }
                      className="h-3 w-3"
                    />
                    Avoid Edges
                  </label>
                  <select
                    value={constraintConfig.avoidEdges.mode}
                    onChange={(e) =>
                      setConstraintConfig((prev) => ({
                        ...prev,
                        avoidEdges: { ...prev.avoidEdges, mode: e.target.value as ConstraintMode },
                      }))
                    }
                    disabled={!constraintConfig.avoidEdges.enabled}
                    className="rounded border border-border bg-canvas px-1 py-0.5 text-xs text-white disabled:opacity-50"
                  >
                    <option value="blocking">Blocking</option>
                    <option value="best-effort">Best-effort</option>
                  </select>
                </div>
                {constraintConfig.avoidEdges.enabled && (
                  <div className="max-h-24 space-y-1 overflow-y-auto rounded bg-canvas p-2">
                    {topology.edges.map((edge) => (
                      <label key={edge.id} className="flex items-center gap-2 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          checked={constraintConfig.avoidEdges.edgeIds.includes(edge.id)}
                          onChange={(e) => {
                            const edgeIds = e.target.checked
                              ? [...constraintConfig.avoidEdges.edgeIds, edge.id]
                              : constraintConfig.avoidEdges.edgeIds.filter((id) => id !== edge.id);
                            setConstraintConfig((prev) => ({
                              ...prev,
                              avoidEdges: { ...prev.avoidEdges, edgeIds },
                            }));
                          }}
                          className="h-3 w-3"
                        />
                        {edge.name || edge.id.slice(0, 8)}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Max Hops */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={constraintConfig.maxHops.enabled}
                      onChange={(e) =>
                        setConstraintConfig((prev) => ({
                          ...prev,
                          maxHops: { ...prev.maxHops, enabled: e.target.checked },
                        }))
                      }
                      className="h-3 w-3"
                    />
                    Max Hops
                  </label>
                  <select
                    value={constraintConfig.maxHops.mode}
                    onChange={(e) =>
                      setConstraintConfig((prev) => ({
                        ...prev,
                        maxHops: { ...prev.maxHops, mode: e.target.value as ConstraintMode },
                      }))
                    }
                    disabled={!constraintConfig.maxHops.enabled}
                    className="rounded border border-border bg-canvas px-1 py-0.5 text-xs text-white disabled:opacity-50"
                  >
                    <option value="blocking">Blocking</option>
                    <option value="best-effort">Best-effort</option>
                  </select>
                </div>
                {constraintConfig.maxHops.enabled && (
                  <input
                    type="number"
                    value={constraintConfig.maxHops.value}
                    onChange={(e) =>
                      setConstraintConfig((prev) => ({
                        ...prev,
                        maxHops: { ...prev.maxHops, value: Math.max(1, parseInt(e.target.value) || 1) },
                      }))
                    }
                    min={1}
                    max={50}
                    className="w-full rounded border border-border bg-canvas px-2 py-1 text-xs text-white"
                  />
                )}
              </div>

              {/* Weight Attribute */}
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={constraintConfig.weightAttribute.enabled}
                    onChange={(e) =>
                      setConstraintConfig((prev) => ({
                        ...prev,
                        weightAttribute: { ...prev.weightAttribute, enabled: e.target.checked },
                      }))
                    }
                    className="h-3 w-3"
                  />
                  Weight Attribute
                </label>
                {constraintConfig.weightAttribute.enabled && (
                  <select
                    value={constraintConfig.weightAttribute.attribute}
                    onChange={(e) =>
                      setConstraintConfig((prev) => ({
                        ...prev,
                        weightAttribute: {
                          ...prev.weightAttribute,
                          attribute: e.target.value as 'distance' | 'weight' | 'cost',
                        },
                      }))
                    }
                    className="w-full rounded border border-border bg-canvas px-2 py-1 text-xs text-white"
                  >
                    <option value="distance">Distance</option>
                    <option value="weight">Weight</option>
                    <option value="cost">Cost</option>
                  </select>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Algorithm Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={runShortestPath}
            className="rounded bg-primary px-3 py-2 text-sm text-white hover:bg-primary-light"
          >
            Shortest Path
          </button>
          <button
            onClick={runKShortest}
            className="rounded bg-success px-3 py-2 text-sm text-white hover:brightness-110"
          >
            K-Shortest
          </button>
          <button
            onClick={runEdgeDisjoint}
            className="rounded bg-warning px-3 py-2 text-sm text-white hover:brightness-110"
          >
            Edge-Disjoint
          </button>
          <button
            onClick={runValidation}
            className="rounded bg-tertiary px-3 py-2 text-sm text-text-secondary hover:bg-elevated"
          >
            Validate
          </button>
        </div>

        {/* Results */}
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-text-secondary">Results</label>
            <span className={`text-xs ${isHighPrecisionTiming ? 'text-success' : 'text-warning'}`}>
              {isHighPrecisionTiming ? '⚡ High precision' : '⚠️ Limited precision'}
            </span>
          </div>
          <pre className="min-h-[100px] whitespace-pre-wrap rounded bg-elevated p-3 font-mono text-xs text-success">
            {results || 'Run an algorithm to see results...'}
          </pre>
        </div>
      </div>
    </div>
  );
};

/**
 * AlgorithmTester - standalone panel wrapper for backward compatibility
 */
export const AlgorithmTester: React.FC = () => {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-canvas">
      <div className="border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-white">Algorithm Tester</h2>
      </div>
      <AlgorithmTesterContent />
    </div>
  );
};
