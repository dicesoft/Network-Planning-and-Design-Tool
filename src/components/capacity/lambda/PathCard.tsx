import React from 'react';
import { cn } from '@/lib/utils';
import { Route, AlertTriangle, Layers } from 'lucide-react';
import { PathSequence } from '@/components/capacity/PathSequence';
import type { PathLambdaAnalysis } from '@/core/services/LambdaAnalyzer';
import { getLambdaCountColor, getLambdaCountBg } from './lambda-utils';

// ============================================================================
// TYPES
// ============================================================================

export interface PathCardProps {
  path: PathLambdaAnalysis;
  isBest: boolean;
  isSelected: boolean;
  nodeNameMap: Map<string, string>;
  edgeNameMap: Map<string, string>;
  onClick: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const PathCard: React.FC<PathCardProps> = ({
  path,
  isBest,
  isSelected,
  nodeNameMap,
  edgeNameMap,
  onClick,
}) => {
  const bottleneckName = path.bottleneckEdgeId
    ? edgeNameMap.get(path.bottleneckEdgeId) || path.bottleneckEdgeId.slice(0, 12)
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 rounded-lg border-2 p-3 text-left transition-all',
        isSelected && 'ring-1 ring-accent',
        isBest
          ? 'border-success bg-success/5'
          : isSelected
            ? 'border-accent bg-accent/5'
            : 'border-border bg-elevated hover:border-border-light'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs font-medium text-text-primary">
            Path {path.pathIndex + 1}
          </span>
        </div>
        {isBest && (
          <span className="bg-success/10 rounded-full px-2 py-0.5 text-[10px] font-semibold text-success">
            Best
          </span>
        )}
      </div>

      {/* Path sequence */}
      <PathSequence
        nodes={path.nodeIds.map((id) => ({
          id,
          label: nodeNameMap.get(id) || id.slice(0, 6),
        }))}
        compact
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-text-tertiary">Distance</span>
          <span className="font-mono text-text-secondary">
            {path.totalDistance.toFixed(1)} km
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-tertiary">Hops</span>
          <span className="font-mono text-text-secondary">{path.hopCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-tertiary">Available</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 font-semibold',
              getLambdaCountColor(path.availableLambdaCount)
            )}
          >
            <Layers className="h-3 w-3" />
            {path.availableLambdaCount}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-tertiary">Bottleneck</span>
          {bottleneckName ? (
            <span className="flex items-center gap-1 truncate text-text-secondary">
              <AlertTriangle
                className={cn(
                  'h-3 w-3 shrink-0',
                  getLambdaCountColor(path.bottleneckAvailableCount)
                )}
              />
              <span className="truncate">{bottleneckName}</span>
              <span
                className={cn(
                  'font-mono text-[10px] shrink-0',
                  getLambdaCountBg(path.bottleneckAvailableCount),
                  getLambdaCountColor(path.bottleneckAvailableCount)
                )}
              >
                ({path.bottleneckAvailableCount})
              </span>
            </span>
          ) : (
            <span className="text-text-muted">-</span>
          )}
        </div>
      </div>
    </button>
  );
};
