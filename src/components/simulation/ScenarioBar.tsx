import React from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { Zap, CircleOff, Clock } from 'lucide-react';

interface ScenarioBarProps {
  failedEdgeIds: string[];
  failedNodeIds: string[];
  timestamp: string;
}

/**
 * ScenarioBar - Displays the failure scenario description with badges.
 * Red "Link Down" / "Node Down" badges, timestamp, danger accent border.
 */
export const ScenarioBar: React.FC<ScenarioBarProps> = ({
  failedEdgeIds,
  failedNodeIds,
  timestamp,
}) => {
  const topology = useNetworkStore((state) => state.topology);

  const getNodeName = (nodeId: string) =>
    topology.nodes.find((n) => n.id === nodeId)?.name || nodeId.slice(0, 8);

  const getEdgeLabel = (edgeId: string) => {
    const edge = topology.edges.find((e) => e.id === edgeId);
    if (!edge) return edgeId.slice(0, 8);
    return `${getNodeName(edge.source.nodeId)} - ${getNodeName(edge.target.nodeId)}`;
  };

  const formattedTime = new Date(timestamp).toLocaleString();

  return (
    <div className="border-danger/30 bg-danger/5 rounded-lg border border-l-4 border-l-danger px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text-primary">
            Failure Scenario
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {failedEdgeIds.map((edgeId) => (
              <span
                key={edgeId}
                className="inline-flex items-center gap-1 rounded bg-danger px-2 py-0.5 text-[10px] font-semibold text-white"
              >
                <Zap className="h-3 w-3" />
                Link Down: {getEdgeLabel(edgeId)}
              </span>
            ))}
            {failedNodeIds.map((nodeId) => (
              <span
                key={nodeId}
                className="inline-flex items-center gap-1 rounded bg-danger px-2 py-0.5 text-[10px] font-semibold text-white"
              >
                <CircleOff className="h-3 w-3" />
                Node Down: {getNodeName(nodeId)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-text-tertiary">
          <Clock className="h-3.5 w-3.5" />
          {formattedTime}
        </div>
      </div>
    </div>
  );
};
