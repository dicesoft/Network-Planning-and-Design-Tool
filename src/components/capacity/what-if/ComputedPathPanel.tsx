import React from 'react';
import { cn } from '@/lib/utils';
import { Route, Shield, AlertTriangle, BarChart3 } from 'lucide-react';
import { PathSequence } from '@/components/capacity/PathSequence';
import type { WhatIfPathResult, ComputedPath } from '@/core/services/WhatIfPathComputer';

// ============================================================================
// TYPES
// ============================================================================

export interface ComputedPathPanelProps {
  pathResults: WhatIfPathResult[];
  nodeNameMap: Map<string, string>;
  onAnalyzeAlternative?: (pathResultIndex: number, unifiedIndex: number) => void;
  selectedPathIndex?: { pathResultIndex: number; unifiedIndex: number } | null;
}

// ============================================================================
// PATH CARD (matches Lambda Study PathCard layout)
// ============================================================================

interface WhatIfPathCardProps {
  path: ComputedPath;
  label: string;
  isShortestDistance: boolean;
  isSelected: boolean;
  nodeNameMap: Map<string, string>;
  onAnalyze?: () => void;
}

const WhatIfPathCard: React.FC<WhatIfPathCardProps> = ({
  path,
  label,
  isShortestDistance,
  isSelected,
  nodeNameMap,
  onAnalyze,
}) => (
  <div
    className={cn(
      'flex flex-col gap-2 rounded-lg border-2 p-3 min-w-[180px]',
      isSelected
        ? 'border-indigo-500 ring-2 ring-indigo-500 bg-indigo-500/5'
        : isShortestDistance
          ? 'border-success bg-success/5'
          : 'border-border bg-elevated hover:border-border-light'
    )}
    data-testid="what-if-path-card"
  >
    {/* Header */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Route className="h-3.5 w-3.5 text-text-muted" />
        <span className="text-xs font-medium text-text-primary">{label}</span>
      </div>
      {isShortestDistance && (
        <span className="bg-success/10 rounded-full px-2 py-0.5 text-[10px] font-semibold text-success">
          Shortest
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
        <span className="text-text-tertiary">Hops</span>
        <span className="font-mono text-text-secondary">{path.hopCount}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-text-tertiary">Distance</span>
        <span className="font-mono text-text-secondary">{path.totalDistance.toFixed(1)} km</span>
      </div>
    </div>

    {/* Analyze action */}
    {onAnalyze && (
      <button
        onClick={onAnalyze}
        className="mt-1 flex items-center justify-center gap-1.5 rounded border border-border bg-canvas px-2 py-1 text-[10px] font-medium text-text-secondary transition-colors hover:bg-elevated hover:text-text-primary"
        data-testid="analyze-impact-btn"
      >
        <BarChart3 className="h-3 w-3" />
        Analyze Impact
      </button>
    )}
  </div>
);

// ============================================================================
// COMPONENT
// ============================================================================

export const ComputedPathPanel: React.FC<ComputedPathPanelProps> = ({
  pathResults,
  nodeNameMap,
  onAnalyzeAlternative,
  selectedPathIndex,
}) => {
  if (pathResults.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {pathResults.map((pr, i) => {
        const srcName = nodeNameMap.get(pr.config.sourceNodeId) || pr.config.sourceNodeId.slice(0, 6);
        const dstName = nodeNameMap.get(pr.config.destinationNodeId) || pr.config.destinationNodeId.slice(0, 6);
        const allPaths: ComputedPath[] = [];
        if (pr.workingPath) allPaths.push(pr.workingPath);
        if (pr.alternativePaths) allPaths.push(...pr.alternativePaths);
        const totalCandidates = allPaths.length;
        const shortestDistance = allPaths.length > 0
          ? Math.min(...allPaths.map((p) => p.totalDistance))
          : 0;

        return (
          <div
            key={i}
            className={cn(
              'rounded-md border p-3',
              pr.feasible
                ? 'border-border bg-elevated'
                : 'border-danger/20 bg-danger/5'
            )}
          >
            {/* Header */}
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium text-text-secondary">
                {pathResults.length > 1 && `Service ${i + 1}: `}
                {srcName} &rarr; {dstName}
              </div>
              <div className="flex items-center gap-2">
                {totalCandidates > 0 && (
                  <span className="text-[10px] text-text-muted">
                    Computed Paths ({totalCandidates} candidate{totalCandidates !== 1 ? 's' : ''})
                  </span>
                )}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    pr.feasible
                      ? 'bg-success/10 text-success'
                      : 'bg-danger/10 text-danger'
                  )}
                >
                  {pr.feasible ? 'Feasible' : 'Infeasible'}
                </span>
              </div>
            </div>

            {/* Infeasible reason */}
            {!pr.feasible && pr.reason && (
              <div className="bg-danger/5 flex items-start gap-2 rounded-md px-2 py-1.5 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {pr.reason}
              </div>
            )}

            {/* Path cards row (working + alternatives as first-class cards) */}
            {allPaths.length > 0 && (
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1" data-testid="path-cards-row">
                {allPaths.map((path, pi) => (
                  <WhatIfPathCard
                    key={pi}
                    path={path}
                    label={pi === 0 ? 'Working' : `Alt ${pi}`}
                    isShortestDistance={path.totalDistance === shortestDistance}
                    isSelected={
                      selectedPathIndex?.pathResultIndex === i &&
                      selectedPathIndex?.unifiedIndex === pi
                    }
                    nodeNameMap={nodeNameMap}
                    onAnalyze={
                      onAnalyzeAlternative
                        ? () => onAnalyzeAlternative(i, pi)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}

            {/* Protection path (separate from candidates) */}
            {pr.protectionPath && (
              <div className="mb-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-warning" />
                  <span className="text-[10px] font-medium uppercase text-text-tertiary">
                    Protection Path
                  </span>
                </div>
                <PathSequence
                  nodes={pr.protectionPath.nodeIds.map((id) => ({
                    id,
                    label: nodeNameMap.get(id) || id.slice(0, 6),
                  }))}
                  compact
                />
                <div className="mt-1 flex gap-3 text-[10px] text-text-muted">
                  <span>{pr.protectionPath.hopCount} hops</span>
                  <span>{pr.protectionPath.totalDistance.toFixed(1)} km</span>
                </div>
              </div>
            )}

            {/* Warnings */}
            {pr.warnings && pr.warnings.length > 0 && (
              <div className="bg-warning/5 mt-2 flex items-start gap-2 rounded-md px-2 py-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  {pr.warnings.map((w, wi) => (
                    <span key={wi}>{w}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
