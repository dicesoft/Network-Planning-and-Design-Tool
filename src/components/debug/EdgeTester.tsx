import React, { useState } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { Position } from '@/types';

// Valid handle IDs (must match NetworkNode.tsx)
const VALID_HANDLES = [
  'top-source', 'top-target',
  'bottom-source', 'bottom-target',
  'left-source', 'left-target',
  'right-source', 'right-target',
] as const;

const SOURCE_HANDLES = ['top-source', 'bottom-source', 'left-source', 'right-source'] as const;
const TARGET_HANDLES = ['top-target', 'bottom-target', 'left-target', 'right-target'] as const;

type SourceHandle = (typeof SOURCE_HANDLES)[number];
type TargetHandle = (typeof TARGET_HANDLES)[number];

// Validate handle format
const isValidHandle = (handle: string | undefined): boolean => {
  if (!handle) return false;
  return VALID_HANDLES.includes(handle as (typeof VALID_HANDLES)[number]);
};

/**
 * EdgeTesterContent - the inner content, used by TabbedTester
 */
export const EdgeTesterContent: React.FC = () => {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Edge creation form state
  const [newEdgeSource, setNewEdgeSource] = useState<string>('');
  const [newEdgeTarget, setNewEdgeTarget] = useState<string>('');
  const [newEdgeSourceHandle, setNewEdgeSourceHandle] = useState<SourceHandle>('right-source');
  const [newEdgeTargetHandle, setNewEdgeTargetHandle] = useState<TargetHandle>('left-target');
  const [autoAllocatePorts, setAutoAllocatePorts] = useState<boolean>(true);

  // Network store
  const edges = useNetworkStore((state) => state.topology.edges);
  const nodes = useNetworkStore((state) => state.topology.nodes);
  const addNode = useNetworkStore((state) => state.addNode);
  const addEdge = useNetworkStore((state) => state.addEdge);
  const addEdgeWithPorts = useNetworkStore((state) => state.addEdgeWithPorts);
  const getAvailablePorts = useNetworkStore((state) => state.getAvailablePorts);
  const clearTopology = useNetworkStore((state) => state.clearTopology);
  const updateEdgeBendPoint = useNetworkStore((state) => state.updateEdgeBendPoint);
  const selectEdges = useNetworkStore((state) => state.selectEdges);

  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);
  const edgesWithBendPoints = edges.filter((e) => e.properties.bendPoint);

  // Create parallel edges test topology (2 nodes with 3 edges)
  const createParallelEdges = () => {
    clearTopology();

    // Create two nodes
    const node1Id = addNode({
      type: 'router',
      position: { x: 150, y: 200 },
      name: 'Router-A',
      vendor: 'generic',
      stacks: [],
      metadata: {},
    });

    const node2Id = addNode({
      type: 'router',
      position: { x: 450, y: 200 },
      name: 'Router-B',
      vendor: 'generic',
      stacks: [],
      metadata: {},
    });

    // Create 3 parallel edges with correct handle format
    addEdge(node1Id, node2Id, 'right-source', 'left-target');
    addEdge(node1Id, node2Id, 'right-source', 'left-target');
    addEdge(node1Id, node2Id, 'right-source', 'left-target');
  };

  // Create triangle test topology (3 nodes, 3 edges)
  const createTriangle = () => {
    clearTopology();

    const nodeA = addNode({
      type: 'switch',
      position: { x: 300, y: 100 },
      name: 'Switch-A',
      vendor: 'generic',
      stacks: [],
      metadata: {},
    });

    const nodeB = addNode({
      type: 'switch',
      position: { x: 150, y: 300 },
      name: 'Switch-B',
      vendor: 'generic',
      stacks: [],
      metadata: {},
    });

    const nodeC = addNode({
      type: 'switch',
      position: { x: 450, y: 300 },
      name: 'Switch-C',
      vendor: 'generic',
      stacks: [],
      metadata: {},
    });

    addEdge(nodeA, nodeB, 'bottom-source', 'top-target');
    addEdge(nodeB, nodeC, 'right-source', 'left-target');
    addEdge(nodeC, nodeA, 'top-source', 'bottom-target');
  };

  // Bend point preset offsets
  const setBendPointPreset = (offsetX: number, offsetY: number) => {
    if (!selectedEdgeId || !selectedEdge) return;

    // Get edge source/target positions from nodes
    const sourceNode = nodes.find((n) => n.id === selectedEdge.source.nodeId);
    const targetNode = nodes.find((n) => n.id === selectedEdge.target.nodeId);

    if (!sourceNode || !targetNode) return;

    // Calculate midpoint
    const midX = (sourceNode.position.x + targetNode.position.x) / 2;
    const midY = (sourceNode.position.y + targetNode.position.y) / 2;

    updateEdgeBendPoint(selectedEdgeId, {
      x: midX + offsetX,
      y: midY + offsetY,
    });
  };

  // Clear bend point for selected edge
  const clearBendPoint = () => {
    if (selectedEdgeId) {
      updateEdgeBendPoint(selectedEdgeId, null);
    }
  };

  // Clear all bend points
  const clearAllBendPoints = () => {
    edges.forEach((edge) => {
      if (edge.properties.bendPoint) {
        updateEdgeBendPoint(edge.id, null);
      }
    });
  };

  // Randomize bend point
  const randomizeBendPoint = () => {
    if (!selectedEdgeId || !selectedEdge) return;

    const sourceNode = nodes.find((n) => n.id === selectedEdge.source.nodeId);
    const targetNode = nodes.find((n) => n.id === selectedEdge.target.nodeId);

    if (!sourceNode || !targetNode) return;

    const midX = (sourceNode.position.x + targetNode.position.x) / 2;
    const midY = (sourceNode.position.y + targetNode.position.y) / 2;

    // Random offset between -150 and 150
    const randomOffset = () => (Math.random() - 0.5) * 300;

    updateEdgeBendPoint(selectedEdgeId, {
      x: midX + randomOffset(),
      y: midY + randomOffset(),
    });
  };

  // Select edge in canvas
  const handleSelectEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    selectEdges([edgeId]);
  };

  // Check if we can create an edge
  const canCreateEdge = newEdgeSource && newEdgeTarget && newEdgeSource !== newEdgeTarget;

  // Create edge with validation
  const handleCreateEdge = () => {
    if (!newEdgeSource || !newEdgeTarget) return;
    if (newEdgeSource === newEdgeTarget) return;

    // Validate handles
    if (!SOURCE_HANDLES.includes(newEdgeSourceHandle)) {
      console.error('Invalid source handle:', newEdgeSourceHandle);
      return;
    }
    if (!TARGET_HANDLES.includes(newEdgeTargetHandle)) {
      console.error('Invalid target handle:', newEdgeTargetHandle);
      return;
    }

    if (autoAllocatePorts) {
      // Get available ports from both nodes
      const sourcePorts = getAvailablePorts(newEdgeSource);
      const targetPorts = getAvailablePorts(newEdgeTarget);

      if (sourcePorts.length === 0 || targetPorts.length === 0) {
        console.warn('No available ports - creating edge without port allocation');
        addEdge(newEdgeSource, newEdgeTarget, newEdgeSourceHandle, newEdgeTargetHandle);
      } else {
        // Auto-select first available port of matching types
        const sourcePort = sourcePorts[0];
        const targetPort = targetPorts.find((p) => p.type === sourcePort.type) || targetPorts[0];
        addEdgeWithPorts(
          newEdgeSource,
          newEdgeTarget,
          sourcePort.id,
          targetPort.id,
          'fiber',
          newEdgeSourceHandle,
          newEdgeTargetHandle
        );
      }
    } else {
      addEdge(newEdgeSource, newEdgeTarget, newEdgeSourceHandle, newEdgeTargetHandle);
    }

    // Reset form
    setNewEdgeSource('');
    setNewEdgeTarget('');
  };

  const formatPosition = (pos: Position | undefined): string => {
    if (!pos) return 'None';
    return `(${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 overflow-auto p-4">
        {/* Sample Topologies */}
        <div className="space-y-2">
          <label className="block text-xs text-text-secondary">Sample Topologies</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={createParallelEdges}
              className="rounded bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700"
            >
              Parallel Edges
            </button>
            <button
              onClick={createTriangle}
              className="rounded bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700"
            >
              Triangle
            </button>
          </div>
        </div>

        {/* Add Edge Section */}
        <div className="space-y-2">
          <label className="block text-xs text-text-secondary">Add Edge</label>
          <div className="space-y-2 rounded bg-elevated p-2">
            {/* Source Node Dropdown */}
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs text-text-secondary">Source:</span>
              <select
                value={newEdgeSource}
                onChange={(e) => setNewEdgeSource(e.target.value)}
                className="flex-1 rounded bg-tertiary px-2 py-1 text-xs text-white"
              >
                <option value="">Select node...</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name || node.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>

            {/* Source Handle Dropdown */}
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs text-text-secondary">Handle:</span>
              <select
                value={newEdgeSourceHandle}
                onChange={(e) => setNewEdgeSourceHandle(e.target.value as SourceHandle)}
                className="flex-1 rounded bg-tertiary px-2 py-1 text-xs text-white"
              >
                {SOURCE_HANDLES.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="my-1 border-t border-border" />

            {/* Target Node Dropdown */}
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs text-text-secondary">Target:</span>
              <select
                value={newEdgeTarget}
                onChange={(e) => setNewEdgeTarget(e.target.value)}
                className="flex-1 rounded bg-tertiary px-2 py-1 text-xs text-white"
              >
                <option value="">Select node...</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name || node.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Handle Dropdown */}
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs text-text-secondary">Handle:</span>
              <select
                value={newEdgeTargetHandle}
                onChange={(e) => setNewEdgeTargetHandle(e.target.value as TargetHandle)}
                className="flex-1 rounded bg-tertiary px-2 py-1 text-xs text-white"
              >
                {TARGET_HANDLES.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            {/* Port allocation toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoAllocatePorts"
                checked={autoAllocatePorts}
                onChange={(e) => setAutoAllocatePorts(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-tertiary text-success"
              />
              <label htmlFor="autoAllocatePorts" className="text-xs text-text-secondary">
                Auto-allocate ports
              </label>
            </div>

            {/* Create Button */}
            <button
              onClick={handleCreateEdge}
              disabled={!canCreateEdge}
              className="w-full rounded bg-success px-3 py-2 text-sm text-white hover:brightness-110 disabled:opacity-50"
            >
              Create Edge
            </button>
          </div>
        </div>

        {/* Edge List */}
        <div className="space-y-2">
          <label className="block text-xs text-text-secondary">
            Edges ({edges.length}) - {edgesWithBendPoints.length} with bend points
          </label>
          <div className="max-h-32 overflow-auto rounded border border-border">
            {edges.length === 0 ? (
              <div className="p-2 text-xs text-text-muted">No edges</div>
            ) : (
              edges.map((edge) => (
                <button
                  key={edge.id}
                  onClick={() => handleSelectEdge(edge.id)}
                  className={`w-full px-2 py-1 text-left text-xs ${
                    selectedEdgeId === edge.id
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:bg-elevated'
                  }`}
                >
                  <span className="font-mono">{edge.name || edge.id.slice(0, 8)}</span>
                  {edge.properties.bendPoint && (
                    <span className="ml-2 text-warning">●</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Selected Edge Info */}
        {selectedEdge && (
          <div className="space-y-2">
            <label className="block text-xs text-text-secondary">Selected Edge</label>
            <div className="rounded bg-elevated p-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">ID:</span>
                <span className="font-mono text-white">{selectedEdge.id.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Source Handle:</span>
                <span className={isValidHandle(selectedEdge.source.handle) ? 'text-success' : 'text-danger'}>
                  {selectedEdge.source.handle || 'undefined'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Target Handle:</span>
                <span className={isValidHandle(selectedEdge.target.handle) ? 'text-success' : 'text-danger'}>
                  {selectedEdge.target.handle || 'undefined'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Bend Point:</span>
                <span className={selectedEdge.properties.bendPoint ? 'text-warning' : 'text-text-muted'}>
                  {formatPosition(selectedEdge.properties.bendPoint)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bend Point Controls */}
        <div className="space-y-2">
          <label className="block text-xs text-text-secondary">Bend Point Controls</label>

          {/* Preset offsets */}
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => setBendPointPreset(-100, -100)}
              disabled={!selectedEdgeId}
              className="rounded bg-tertiary px-2 py-1 text-xs text-white hover:bg-tertiary disabled:opacity-50"
            >
              ↖ -100,-100
            </button>
            <button
              onClick={() => setBendPointPreset(0, -100)}
              disabled={!selectedEdgeId}
              className="rounded bg-tertiary px-2 py-1 text-xs text-white hover:bg-tertiary disabled:opacity-50"
            >
              ↑ 0,-100
            </button>
            <button
              onClick={() => setBendPointPreset(100, -100)}
              disabled={!selectedEdgeId}
              className="rounded bg-tertiary px-2 py-1 text-xs text-white hover:bg-tertiary disabled:opacity-50"
            >
              ↗ +100,-100
            </button>
            <button
              onClick={() => setBendPointPreset(-100, 0)}
              disabled={!selectedEdgeId}
              className="rounded bg-tertiary px-2 py-1 text-xs text-white hover:bg-tertiary disabled:opacity-50"
            >
              ← -100,0
            </button>
            <button
              onClick={() => setBendPointPreset(0, 0)}
              disabled={!selectedEdgeId}
              className="rounded bg-tertiary px-2 py-1 text-xs text-white hover:bg-tertiary disabled:opacity-50"
            >
              ⊙ Center
            </button>
            <button
              onClick={() => setBendPointPreset(100, 0)}
              disabled={!selectedEdgeId}
              className="rounded bg-tertiary px-2 py-1 text-xs text-white hover:bg-tertiary disabled:opacity-50"
            >
              → +100,0
            </button>
            <button
              onClick={() => setBendPointPreset(-100, 100)}
              disabled={!selectedEdgeId}
              className="rounded bg-tertiary px-2 py-1 text-xs text-white hover:bg-tertiary disabled:opacity-50"
            >
              ↙ -100,+100
            </button>
            <button
              onClick={() => setBendPointPreset(0, 100)}
              disabled={!selectedEdgeId}
              className="rounded bg-tertiary px-2 py-1 text-xs text-white hover:bg-tertiary disabled:opacity-50"
            >
              ↓ 0,+100
            </button>
            <button
              onClick={() => setBendPointPreset(100, 100)}
              disabled={!selectedEdgeId}
              className="rounded bg-tertiary px-2 py-1 text-xs text-white hover:bg-tertiary disabled:opacity-50"
            >
              ↘ +100,+100
            </button>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={randomizeBendPoint}
              disabled={!selectedEdgeId}
              className="rounded bg-warning px-3 py-2 text-sm text-white hover:brightness-110 disabled:opacity-50"
            >
              🎲 Randomize
            </button>
            <button
              onClick={clearBendPoint}
              disabled={!selectedEdgeId || !selectedEdge?.properties.bendPoint}
              className="rounded bg-warning px-3 py-2 text-sm text-white hover:brightness-110 disabled:opacity-50"
            >
              Clear Selected
            </button>
          </div>
          <button
            onClick={clearAllBendPoints}
            disabled={edgesWithBendPoints.length === 0}
            className="w-full rounded bg-danger px-3 py-2 text-sm text-white hover:bg-danger-light disabled:opacity-50"
          >
            Clear All Bend Points ({edgesWithBendPoints.length})
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * EdgeTester - standalone panel wrapper for backward compatibility
 */
export const EdgeTester: React.FC = () => {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-canvas">
      <div className="border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-white">Edge Tester</h2>
      </div>
      <EdgeTesterContent />
    </div>
  );
};
