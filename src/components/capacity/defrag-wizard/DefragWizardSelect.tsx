/**
 * DefragWizardSelect - Step 1: Edge selection only
 *
 * Checkboxes with fragmentation scores, "Select All Fragmented" button.
 * Strategy selection moved to Step 2.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useDefragWizard } from './DefragWizardContext';
import {
  DefragmentationEngine,
  DEFRAG_MAX_MOVES_CEILING,
} from '@/core/services/DefragmentationEngine';

const FRAGMENTATION_FILTER_THRESHOLD = 0.5;

// ============================================================================
// HELPERS
// ============================================================================

function getFragBadgeClasses(index: number): string {
  if (index <= 0.2) return 'bg-success/15 text-success';
  if (index <= 0.5) return 'bg-warning/15 text-warning';
  return 'bg-danger/15 text-danger';
}

// ============================================================================
// COMPONENT
// ============================================================================

export const DefragWizardSelect: React.FC = () => {
  const { state, dispatch } = useDefragWizard();
  const { selectedEdgeIds, edgeFragmentations } = state;
  const edges = useNetworkStore((s) => s.topology.edges);
  const nodes = useNetworkStore((s) => s.topology.nodes);
  const services = useServiceStore((s) => s.services);
  const defragVersion = useServiceStore((s) => s.defragVersion);
  const [filter, setFilter] = useState('');

  // Stale-data resilience (E1): if a defrag apply lands while the wizard is
  // mounted (e.g., from another tab or background flow), `defragVersion` advances.
  // Re-analyze fragmentation and push the fresh data into wizard state.
  // Skip the initial render so we don't clobber the prop-seeded fragmentations.
  const lastDefragVersionRef = useRef(defragVersion);
  useEffect(() => {
    if (lastDefragVersionRef.current === defragVersion) return;
    lastDefragVersionRef.current = defragVersion;
    const engine = new DefragmentationEngine(
      () => nodes,
      () => edges,
      () => services,
    );
    const result = engine.analyzeFragmentation();
    dispatch({ type: 'SET_EDGE_FRAGMENTATIONS', fragmentations: result.edgeFragmentations });
  }, [defragVersion, dispatch, nodes, edges, services]);

  const endpointLookup = useMemo(() => {
    const nodeById = new Map(nodes.map((n) => [n.id, n.name || n.id] as const));
    const lookup = new Map<string, { source: string; target: string }>();
    for (const e of edges) {
      lookup.set(e.id, {
        source: nodeById.get(e.source.nodeId) ?? '',
        target: nodeById.get(e.target.nodeId) ?? '',
      });
    }
    return lookup;
  }, [edges, nodes]);

  const [fragmentedOnly, setFragmentedOnly] = useState(false);

  const filteredEdgeFragmentations = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return edgeFragmentations.filter((ef) => {
      if (fragmentedOnly && ef.fragmentationIndex <= FRAGMENTATION_FILTER_THRESHOLD) {
        return false;
      }
      if (!q) return true;
      const endpoints = endpointLookup.get(ef.edgeId);
      const name = (ef.edgeName || ef.edgeId).toLowerCase();
      const src = endpoints?.source.toLowerCase() ?? '';
      const tgt = endpoints?.target.toLowerCase() ?? '';
      return name.includes(q) || src.includes(q) || tgt.includes(q);
    });
  }, [edgeFragmentations, endpointLookup, filter, fragmentedOnly]);

  const fragmentedEdges = useMemo(
    () => edgeFragmentations.filter((ef) => ef.fragmentationIndex > 0.3),
    [edgeFragmentations]
  );

  const handleToggleEdge = useCallback(
    (edgeId: string) => {
      dispatch({ type: 'TOGGLE_EDGE', edgeId });
    },
    [dispatch]
  );

  const handleSelectAllFragmented = useCallback(() => {
    const fragIds = fragmentedEdges.map((ef) => ef.edgeId);
    dispatch({ type: 'SET_SELECTED_EDGES', edgeIds: fragIds });
  }, [dispatch, fragmentedEdges]);

  const handleSelectAll = useCallback(() => {
    dispatch({ type: 'SET_SELECTED_EDGES', edgeIds: edgeFragmentations.map((ef) => ef.edgeId) });
  }, [dispatch, edgeFragmentations]);

  const handleDeselectAll = useCallback(() => {
    dispatch({ type: 'SET_SELECTED_EDGES', edgeIds: [] });
  }, [dispatch]);

  const allSelected = selectedEdgeIds.length === edgeFragmentations.length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            Select Edges to Defragment
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={handleSelectAllFragmented}
            >
              Select All Fragmented ({fragmentedEdges.length})
            </button>
            <span className="text-text-muted">|</span>
            <button
              type="button"
              className="text-xs text-text-secondary hover:underline"
              onClick={allSelected ? handleDeselectAll : handleSelectAll}
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>

        {edgeFragmentations.length > 0 && (
          <div className="mb-2 flex items-center gap-2">
            <Input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by edge name or endpoint..."
              className="h-8 flex-1 text-xs"
              aria-label="Filter edges"
              data-testid="defrag-select-filter"
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={fragmentedOnly}
                onChange={(e) => setFragmentedOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-accent"
              />
              Fragmented only (&gt;0.5)
            </label>
          </div>
        )}

        {edgeFragmentations.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-tertiary text-sm text-text-muted">
            No edges available. Run fragmentation analysis first.
          </div>
        ) : filteredEdgeFragmentations.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-tertiary text-sm text-text-muted">
            No edges match the current filter.
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-sticky bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                <tr className="text-left text-text-secondary">
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2">Edge</th>
                  <th className="px-3 py-2">Used / Total</th>
                  <th className="px-3 py-2">Free</th>
                  <th className="px-3 py-2">Largest Block</th>
                  <th className="px-3 py-2">Fragmentation</th>
                </tr>
              </thead>
              <tbody>
                {filteredEdgeFragmentations.map((ef) => {
                  const isSelected = selectedEdgeIds.includes(ef.edgeId);
                  return (
                    <tr
                      key={ef.edgeId}
                      className={cn(
                        'cursor-pointer border-b border-border last:border-0 transition-colors',
                        isSelected ? 'bg-accent/5' : 'hover:bg-elevated'
                      )}
                      onClick={() => handleToggleEdge(ef.edgeId)}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleEdge(ef.edgeId)}
                          className="h-3.5 w-3.5 rounded border-border accent-accent"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-text-primary">
                        {ef.edgeName || ef.edgeId.slice(0, 12)}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {ef.usedChannels} / {ef.totalChannels}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{ef.freeChannels}</td>
                      <td className="px-3 py-2 text-text-secondary">{ef.largestContiguousBlock}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            getFragBadgeClasses(ef.fragmentationIndex)
                          )}
                        >
                          {ef.fragmentationIndex.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-2 text-xs text-text-muted">
          {selectedEdgeIds.length} edge{selectedEdgeIds.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      {/* Max moves cap (T031) */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="defrag-max-moves" className="text-xs font-medium text-text-primary">
          Max moves per plan
        </label>
        <Input
          id="defrag-max-moves"
          type="number"
          min={1}
          max={DEFRAG_MAX_MOVES_CEILING}
          step={100}
          value={state.maxMoves}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) {
              dispatch({ type: 'SET_MAX_MOVES', maxMoves: v });
            }
          }}
          className="h-8 w-32 text-xs"
          data-testid="defrag-max-moves-input"
        />
        <p className="text-xs text-text-muted">
          Default 1,000 — increase up to 5,000 if your plan is truncated.
        </p>
      </div>
    </div>
  );
};
