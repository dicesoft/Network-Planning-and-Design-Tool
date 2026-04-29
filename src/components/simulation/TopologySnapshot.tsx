import React, { useMemo, useState } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopologySnapshotProps {
  failedEdgeIds: string[];
  failedNodeIds: string[];
}

const SVG_WIDTH = 600;
const SVG_HEIGHT = 300;
const NODE_RADIUS = 8;
const PADDING = 30;

/**
 * TopologySnapshot - Lightweight SVG topology visualization for simulation results.
 * Nodes as circles, edges as lines. Failed elements shown in red with animated dash.
 * Collapsible, respects prefers-reduced-motion, fallback for no layout data.
 */
export const TopologySnapshot: React.FC<TopologySnapshotProps> = ({
  failedEdgeIds,
  failedNodeIds,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const topology = useNetworkStore((state) => state.topology);

  const failedEdgeSet = useMemo(() => new Set(failedEdgeIds), [failedEdgeIds]);
  const failedNodeSet = useMemo(() => new Set(failedNodeIds), [failedNodeIds]);

  // Check if all nodes are at origin (no meaningful layout)
  const hasLayout = useMemo(() => {
    return topology.nodes.some((n) => n.position.x !== 0 || n.position.y !== 0);
  }, [topology.nodes]);

  // Compute SVG positions by normalizing node positions into the SVG viewport
  const { nodePositions, edges } = useMemo(() => {
    if (topology.nodes.length === 0) {
      return { nodePositions: new Map<string, { x: number; y: number }>(), edges: [] };
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of topology.nodes) {
      minX = Math.min(minX, node.position.x);
      maxX = Math.max(maxX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxY = Math.max(maxY, node.position.y);
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const usableW = SVG_WIDTH - PADDING * 2;
    const usableH = SVG_HEIGHT - PADDING * 2;

    const positions = new Map<string, { x: number; y: number }>();
    for (const node of topology.nodes) {
      positions.set(node.id, {
        x: PADDING + ((node.position.x - minX) / rangeX) * usableW,
        y: PADDING + ((node.position.y - minY) / rangeY) * usableH,
      });
    }

    return { nodePositions: positions, edges: topology.edges };
  }, [topology.nodes, topology.edges]);

  if (topology.nodes.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-elevated">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hover:bg-tertiary/50 flex w-full items-center justify-between px-4 py-2 text-xs font-semibold text-text-primary transition-colors"
      >
        <span>Topology Snapshot</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {!collapsed && (
        <div className="border-t border-border px-4 py-3">
          {!hasLayout ? (
            <div className="flex items-center justify-center py-6 text-xs text-text-muted">
              No layout data available (all nodes at origin)
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="w-full"
              role="img"
              aria-label="Topology snapshot showing network nodes and edges with failure highlights"
            >
              {/* Animated dash style for failed elements */}
              <defs>
                <style>{`
                  @media (prefers-reduced-motion: no-preference) {
                    .failed-dash {
                      animation: dash-march 1s linear infinite;
                    }
                  }
                  @keyframes dash-march {
                    to { stroke-dashoffset: -16; }
                  }
                `}</style>
              </defs>

              {/* Edges */}
              {edges.map((edge) => {
                const src = nodePositions.get(edge.source.nodeId);
                const tgt = nodePositions.get(edge.target.nodeId);
                if (!src || !tgt) return null;
                const isFailed = failedEdgeSet.has(edge.id);
                return (
                  <line
                    key={edge.id}
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke={isFailed ? 'var(--color-danger, #ef4444)' : 'var(--color-border, #374151)'}
                    strokeWidth={isFailed ? 2.5 : 1.5}
                    strokeDasharray={isFailed ? '8 8' : undefined}
                    className={cn(isFailed && 'failed-dash')}
                    strokeOpacity={isFailed ? 1 : 0.5}
                  />
                );
              })}

              {/* Nodes */}
              {topology.nodes.map((node) => {
                const pos = nodePositions.get(node.id);
                if (!pos) return null;
                const isFailed = failedNodeSet.has(node.id);
                return (
                  <g key={node.id}>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={NODE_RADIUS}
                      fill={isFailed ? 'var(--color-danger, #ef4444)' : 'var(--color-accent, #6366f1)'}
                      stroke={isFailed ? 'var(--color-danger, #ef4444)' : 'var(--color-border, #374151)'}
                      strokeWidth={isFailed ? 2 : 1}
                      opacity={isFailed ? 1 : 0.8}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + NODE_RADIUS + 12}
                      textAnchor="middle"
                      fontSize="9"
                      fill={isFailed ? 'var(--color-danger, #ef4444)' : 'var(--color-text-secondary, #94a3b8)'}
                      fontFamily="monospace"
                    >
                      {node.name.length > 10 ? node.name.slice(0, 10) + '...' : node.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      )}
    </div>
  );
};
