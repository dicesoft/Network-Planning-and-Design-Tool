/**
 * ManualPathSelector - Interactive component for manually building a path
 *
 * Allows users to:
 * - Click intermediate nodes to build a path from source to destination
 * - See real-time validation of path connectivity
 * - View distance and channel availability
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  MapPin,
  ArrowRight,
  X,
  AlertTriangle,
  CheckCircle,
  Ruler,
  Hash,
  Radio,
  RotateCcw,
  Info,
} from 'lucide-react';
import { GraphEngine } from '@/core/graph/GraphEngine';
import { ChannelChecker, type ChannelTopologyProvider } from '@/core/services/ChannelChecker';
import type { ServicePath, WavelengthMode } from '@/types/service';

// ============================================================================
// TYPES
// ============================================================================

export interface PathValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalDistance: number;
  hopCount: number;
  availableChannel?: number;
}

interface ManualPathSelectorProps {
  sourceNodeId: string;
  destinationNodeId: string;
  wavelengthMode: WavelengthMode;
  isL1Service: boolean;
  onPathChange: (path: ServicePath | null, validation: PathValidationResult, channelNumber?: number) => void;
  initialPath?: ServicePath;
  excludeEdges?: string[];  // Edges to warn about (e.g., working path edges for protection)
}

// ============================================================================
// NODE CHIP COMPONENT
// ============================================================================

interface NodeChipProps {
  nodeId: string;
  nodeName: string;
  isLocked?: boolean;
  isSource?: boolean;
  isDestination?: boolean;
  onRemove?: () => void;
}

const NodeChip: React.FC<NodeChipProps> = ({
  nodeName,
  isLocked,
  isSource,
  isDestination,
  onRemove,
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm',
        isLocked
          ? isSource
            ? 'bg-green-500/10 border border-green-500/30 text-green-400'
            : isDestination
            ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
            : 'bg-secondary'
          : 'bg-secondary border border-border hover:border-accent/50'
      )}
    >
      <MapPin className="h-3.5 w-3.5" />
      <span className="max-w-[120px] truncate font-medium">{nodeName}</span>
      {isLocked && (
        <span className="text-xs opacity-60">
          {isSource ? '(source)' : isDestination ? '(dest)' : ''}
        </span>
      )}
      {!isLocked && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 transition-colors hover:text-red-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

// ============================================================================
// AVAILABLE NODE BUTTON
// ============================================================================

interface AvailableNodeButtonProps {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  onClick: () => void;
  disabled?: boolean;
  isNeighbor: boolean;
}

// Node type badge colors
const NODE_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  router: { label: 'R', color: 'bg-blue-500/20 text-blue-400' },
  switch: { label: 'S', color: 'bg-cyan-500/20 text-cyan-400' },
  oadm: { label: 'O', color: 'bg-purple-500/20 text-purple-400' },
  terminal: { label: 'T', color: 'bg-pink-500/20 text-pink-400' },
  amplifier: { label: 'A', color: 'bg-orange-500/20 text-orange-400' },
  'osp-termination': { label: 'OSP', color: 'bg-gray-500/20 text-gray-400' },
  custom: { label: 'C', color: 'bg-gray-500/20 text-gray-400' },
};

const AvailableNodeButton: React.FC<AvailableNodeButtonProps> = ({
  nodeName,
  nodeType,
  onClick,
  disabled,
  isNeighbor,
}) => {
  const badge = NODE_TYPE_BADGES[nodeType] || NODE_TYPE_BADGES.custom;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
        isNeighbor
          ? 'bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20'
          : 'bg-secondary/50 border border-border text-text-muted hover:bg-secondary hover:text-text-primary',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <span className={cn('px-1 py-0.5 rounded text-[10px] font-bold', badge.color)}>
        {badge.label}
      </span>
      {nodeName}
      {isNeighbor && <span className="text-xs opacity-70">(connected)</span>}
    </button>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ManualPathSelector: React.FC<ManualPathSelectorProps> = ({
  sourceNodeId,
  destinationNodeId,
  wavelengthMode,
  isL1Service,
  onPathChange,
  initialPath,
  excludeEdges,
}) => {
  const topology = useNetworkStore((s) => s.topology);

  // State: list of intermediate node IDs (source and destination are implicit)
  const [intermediateNodes, setIntermediateNodes] = useState<string[]>(() => {
    // Initialize from initialPath if provided
    if (initialPath && initialPath.nodeIds.length > 2) {
      return initialPath.nodeIds.slice(1, -1);
    }
    return [];
  });

  // Create node name map for display
  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    topology.nodes.forEach((node) => {
      map.set(node.id, node.name);
    });
    return map;
  }, [topology.nodes]);

  // Full path: source + intermediates + destination
  const fullPathNodeIds = useMemo(
    () => [sourceNodeId, ...intermediateNodes, destinationNodeId],
    [sourceNodeId, intermediateNodes, destinationNodeId]
  );

  // Create GraphEngine for validation
  const graphEngine = useMemo(() => {
    const engine = new GraphEngine();
    engine.loadFromTopology(topology);
    return engine;
  }, [topology]);

  // Create topology provider for ChannelChecker
  const topologyProvider = useMemo(
    (): ChannelTopologyProvider => ({
      getNode: (id: string) => topology.nodes.find((n) => n.id === id),
      getEdge: (id: string) => topology.edges.find((e) => e.id === id),
      getEdges: () => topology.edges,
    }),
    [topology]
  );

  // Create node type map for validation messages
  const nodeTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    topology.nodes.forEach((node) => {
      map.set(node.id, node.type);
    });
    return map;
  }, [topology.nodes]);

  // Validate the path and compute metrics
  const validation = useMemo((): PathValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalDistance = 0;
    const edgeIds: string[] = [];

    // Check connectivity between consecutive nodes
    for (let i = 0; i < fullPathNodeIds.length - 1; i++) {
      const fromNode = fullPathNodeIds[i];
      const toNode = fullPathNodeIds[i + 1];

      const edges = graphEngine.getEdgesBetween(fromNode, toNode);
      if (edges.length === 0) {
        const fromType = nodeTypeMap.get(fromNode) || 'unknown';
        const toType = nodeTypeMap.get(toNode) || 'unknown';
        errors.push(
          `No edge between "${nodeNameMap.get(fromNode) || fromNode}" (${fromType}) and "${
            nodeNameMap.get(toNode) || toNode
          }" (${toType}). Ensure these nodes are connected in the topology.`
        );
      } else {
        // Use the first edge (shortest) between the nodes
        const edge = edges[0];
        edgeIds.push(edge.id);
        totalDistance += edge.properties.distance || 0;
      }
    }

    // Check modulation reach warnings
    if (isL1Service) {
      if (totalDistance > 2500) {
        warnings.push(`Path distance (${totalDistance.toFixed(0)}km) exceeds DP-QPSK reach (2500km)`);
      } else if (totalDistance > 1500) {
        warnings.push(`Path distance (${totalDistance.toFixed(0)}km) exceeds DP-8QAM reach (1500km)`);
      } else if (totalDistance > 800) {
        warnings.push(`Path distance (${totalDistance.toFixed(0)}km) exceeds DP-16QAM reach (800km)`);
      }
    }

    // Check for shared edges with excludeEdges (e.g., working path edges)
    if (excludeEdges && excludeEdges.length > 0) {
      const sharedEdges = edgeIds.filter((id) => excludeEdges.includes(id));
      if (sharedEdges.length > 0) {
        warnings.push(`Path shares ${sharedEdges.length} edge(s) with working path - reduced protection diversity`);
      }
    }

    // Check channel availability for L1 services
    let availableChannel: number | undefined;
    if (isL1Service && errors.length === 0 && edgeIds.length > 0) {
      const channelChecker = new ChannelChecker(topologyProvider);
      const tempPath: ServicePath = {
        id: 'temp',
        type: 'working',
        nodeIds: fullPathNodeIds,
        edgeIds,
        totalDistance,
        hopCount: fullPathNodeIds.length - 1,
        status: 'computed',
      };
      const availability = channelChecker.checkChannelAvailability(
        tempPath,
        wavelengthMode
      );

      if (availability.available && availability.suggestedChannel) {
        availableChannel = availability.suggestedChannel;
      } else if (!availability.available) {
        warnings.push('No common channel available on this path');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      totalDistance,
      hopCount: fullPathNodeIds.length - 1,
      availableChannel,
    };
  }, [fullPathNodeIds, graphEngine, nodeNameMap, topologyProvider, wavelengthMode, isL1Service, excludeEdges]);

  // Get the last node in the current path (for neighbor highlighting)
  const lastNodeInPath = useMemo(
    () => (intermediateNodes.length > 0 ? intermediateNodes[intermediateNodes.length - 1] : sourceNodeId),
    [intermediateNodes, sourceNodeId]
  );

  // Get neighbors of the last node
  const neighborIds = useMemo(() => {
    const neighbors = graphEngine.getNeighbors(lastNodeInPath);
    return new Set(neighbors.map((n) => n.id));
  }, [graphEngine, lastNodeInPath]);

  // Available nodes (not in path, not source/destination)
  const availableNodes = useMemo(() => {
    const pathSet = new Set(fullPathNodeIds);
    return topology.nodes
      .filter((n) => !pathSet.has(n.id))
      .map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        isNeighbor: neighborIds.has(n.id),
      }))
      .sort((a, b) => {
        // Sort neighbors first, then alphabetically
        if (a.isNeighbor && !b.isNeighbor) return -1;
        if (!a.isNeighbor && b.isNeighbor) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [topology.nodes, fullPathNodeIds, neighborIds]);

  // Group available nodes by type for better organization
  const groupedNodes = useMemo(() => {
    const neighbors = availableNodes.filter((n) => n.isNeighbor);
    const opticalNodes = availableNodes.filter(
      (n) => !n.isNeighbor && ['oadm', 'terminal', 'amplifier'].includes(n.type)
    );
    const ipNodes = availableNodes.filter(
      (n) => !n.isNeighbor && ['router', 'switch'].includes(n.type)
    );
    const otherNodes = availableNodes.filter(
      (n) =>
        !n.isNeighbor &&
        !['oadm', 'terminal', 'amplifier', 'router', 'switch'].includes(n.type)
    );
    return { neighbors, opticalNodes, ipNodes, otherNodes };
  }, [availableNodes]);

  // Build edge IDs for the service path
  const buildEdgeIds = useCallback((): string[] => {
    const edgeIds: string[] = [];
    for (let i = 0; i < fullPathNodeIds.length - 1; i++) {
      const fromNode = fullPathNodeIds[i];
      const toNode = fullPathNodeIds[i + 1];
      const edges = graphEngine.getEdgesBetween(fromNode, toNode);
      if (edges.length > 0) {
        edgeIds.push(edges[0].id);
      }
    }
    return edgeIds;
  }, [fullPathNodeIds, graphEngine]);

  // Handle adding a node
  const handleAddNode = useCallback(
    (nodeId: string) => {
      setIntermediateNodes((prev) => [...prev, nodeId]);
    },
    []
  );

  // Handle removing a node
  const handleRemoveNode = useCallback(
    (index: number) => {
      setIntermediateNodes((prev) => prev.filter((_, i) => i !== index));
    },
    []
  );

  // Handle clearing path
  const handleClearPath = useCallback(() => {
    setIntermediateNodes([]);
  }, []);

  // Notify parent when path changes
  React.useEffect(() => {
    const edgeIds = buildEdgeIds();

    if (validation.valid && edgeIds.length === fullPathNodeIds.length - 1) {
      const servicePath: ServicePath = {
        id: crypto.randomUUID(),
        type: 'working',
        nodeIds: fullPathNodeIds,
        edgeIds,
        totalDistance: validation.totalDistance,
        hopCount: validation.hopCount,
        latency: validation.totalDistance * 0.005, // Approximate: 5μs per km
        status: 'computed',
        channelNumber: validation.availableChannel,
      };
      onPathChange(servicePath, validation, validation.availableChannel);
    } else {
      onPathChange(null, validation, undefined);
    }
  }, [fullPathNodeIds, validation, buildEdgeIds, onPathChange]);

  return (
    <div className="space-y-4">
      {/* Current Path Display */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">
          Current Path
        </label>
        <div className="bg-secondary/30 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Source (locked) */}
            <NodeChip
              nodeId={sourceNodeId}
              nodeName={nodeNameMap.get(sourceNodeId) || sourceNodeId}
              isLocked
              isSource
            />

            {/* Intermediate nodes */}
            {intermediateNodes.map((nodeId, index) => (
              <React.Fragment key={nodeId}>
                <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
                <NodeChip
                  nodeId={nodeId}
                  nodeName={nodeNameMap.get(nodeId) || nodeId}
                  onRemove={() => handleRemoveNode(index)}
                />
              </React.Fragment>
            ))}

            {/* Arrow to destination */}
            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />

            {/* Destination (locked) */}
            <NodeChip
              nodeId={destinationNodeId}
              nodeName={nodeNameMap.get(destinationNodeId) || destinationNodeId}
              isLocked
              isDestination
            />
          </div>
        </div>
      </div>

      {/* Path Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-secondary/30 flex items-center gap-2 rounded-lg px-3 py-2">
          <Ruler className="h-4 w-4 text-text-muted" />
          <span className="text-sm text-text-muted">Distance:</span>
          <span className="text-sm font-medium text-text-primary">
            {validation.totalDistance.toFixed(1)} km
          </span>
        </div>
        <div className="bg-secondary/30 flex items-center gap-2 rounded-lg px-3 py-2">
          <Hash className="h-4 w-4 text-text-muted" />
          <span className="text-sm text-text-muted">Hops:</span>
          <span className="text-sm font-medium text-text-primary">
            {validation.hopCount}
          </span>
        </div>
        {isL1Service && (
          <div className="bg-secondary/30 flex items-center gap-2 rounded-lg px-3 py-2">
            <Radio className="h-4 w-4 text-text-muted" />
            <span className="text-sm text-text-muted">Channel:</span>
            <span className="text-sm font-medium text-text-primary">
              {validation.availableChannel ? `CH-${validation.availableChannel}` : 'N/A'}
            </span>
          </div>
        )}
      </div>

      {/* Validation Messages */}
      {validation.errors.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div className="space-y-1">
              {validation.errors.map((error, i) => (
                <p key={i} className="text-sm text-red-400">
                  {error}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            <div className="space-y-1">
              {validation.warnings.map((warning, i) => (
                <p key={i} className="text-sm text-yellow-400">
                  {warning}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {validation.valid && validation.errors.length === 0 && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-400">Path is valid</span>
          </div>
        </div>
      )}

      {/* Available Nodes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-text-secondary">
            Add Intermediate Nodes
          </label>
          {intermediateNodes.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearPath}
              className="text-xs"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Clear Path
            </Button>
          )}
        </div>
        <p className="text-xs text-text-muted">
          Click nodes to add them to your path. Connected nodes are highlighted.
        </p>

        {/* Informational guidance for L2/L3 multi-layer paths */}
        {!isL1Service && (
          <div className="flex items-start gap-2 rounded border border-blue-500/30 bg-blue-500/10 p-2 text-xs text-blue-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              For multi-layer paths, you can select OADM/terminal nodes as intermediate hops.
              The physical path will traverse the optical layer.
            </span>
          </div>
        )}

        <div className="bg-secondary/20 max-h-[280px] space-y-3 overflow-y-auto rounded-lg border border-border p-3">
          {availableNodes.length > 0 ? (
            <>
              {/* Connected Nodes (Neighbors) */}
              {groupedNodes.neighbors.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-accent">
                    Connected Nodes ({groupedNodes.neighbors.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {groupedNodes.neighbors.map((node) => (
                      <AvailableNodeButton
                        key={node.id}
                        nodeId={node.id}
                        nodeName={node.name}
                        nodeType={node.type}
                        onClick={() => handleAddNode(node.id)}
                        isNeighbor={true}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Optical Nodes (OADM, Terminal, Amplifier) */}
              {groupedNodes.opticalNodes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-purple-400">
                    Optical Nodes ({groupedNodes.opticalNodes.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {groupedNodes.opticalNodes.map((node) => (
                      <AvailableNodeButton
                        key={node.id}
                        nodeId={node.id}
                        nodeName={node.name}
                        nodeType={node.type}
                        onClick={() => handleAddNode(node.id)}
                        isNeighbor={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* IP Nodes (Router, Switch) */}
              {groupedNodes.ipNodes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-blue-400">
                    IP Nodes ({groupedNodes.ipNodes.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {groupedNodes.ipNodes.map((node) => (
                      <AvailableNodeButton
                        key={node.id}
                        nodeId={node.id}
                        nodeName={node.name}
                        nodeType={node.type}
                        onClick={() => handleAddNode(node.id)}
                        isNeighbor={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Other Nodes */}
              {groupedNodes.otherNodes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-text-muted">
                    Other Nodes ({groupedNodes.otherNodes.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {groupedNodes.otherNodes.map((node) => (
                      <AvailableNodeButton
                        key={node.id}
                        nodeId={node.id}
                        nodeName={node.name}
                        nodeType={node.type}
                        onClick={() => handleAddNode(node.id)}
                        isNeighbor={false}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="py-2 text-center text-sm text-text-muted">
              No available intermediate nodes
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualPathSelector;
