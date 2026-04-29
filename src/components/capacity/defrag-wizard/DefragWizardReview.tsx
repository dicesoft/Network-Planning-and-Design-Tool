/**
 * DefragWizardReview - Step 2: Review proposed channel moves
 *
 * Shows the defrag plan with Ch 14 -> Ch 8 styling (strikethrough old, highlighted new),
 * risk badges, and strategy badge in header.
 */

import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { useDefragWizard } from './DefragWizardContext';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { DefragmentationEngine, DEFRAG_MAX_MOVES_CEILING, type DefragRiskLevel, type DefragNoMoveReason } from '@/core/services/DefragmentationEngine';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// CONSTANTS
// ============================================================================

const STRATEGY_LABELS: Record<string, string> = {
  minimal_moves: 'Minimal Moves',
  maximize_contiguous: 'Maximize Contiguous',
  balance_spectrum: 'Balance Spectrum',
};

const RISK_CONFIG: Record<DefragRiskLevel, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  low: {
    label: 'Low',
    color: 'text-success',
    bgColor: 'bg-success/15',
    icon: <ShieldCheck className="h-3 w-3" />,
  },
  medium: {
    label: 'Medium',
    color: 'text-warning',
    bgColor: 'bg-warning/15',
    icon: <Shield className="h-3 w-3" />,
  },
  high: {
    label: 'High',
    color: 'text-danger',
    bgColor: 'bg-danger/15',
    icon: <ShieldAlert className="h-3 w-3" />,
  },
};

const PAGE_SIZE = 25;

// ============================================================================
// COMPONENT
// ============================================================================

export const DefragWizardReview: React.FC = () => {
  const { state, dispatch } = useDefragWizard();
  const topology = useNetworkStore((s) => s.topology);
  const services = useServiceStore((s) => s.services);
  const [page, setPage] = useState(0);

  const engine = useMemo(() => {
    return new DefragmentationEngine(
      () => topology.nodes,
      () => topology.edges,
      () => services
    );
  }, [topology, services]);

  // Compute plan on mount or when strategy/edges change
  useEffect(() => {
    if (state.selectedEdgeIds.length === 0) return;

    dispatch({ type: 'SET_COMPUTING', isComputing: true });
    const plan = engine.planDefragmentation({
      strategy: state.strategy,
      targetEdgeIds: state.selectedEdgeIds,
      maxMoves: state.maxMoves,
    });
    dispatch({ type: 'SET_PLAN', plan });
    dispatch({ type: 'SET_COMPUTING', isComputing: false });
  }, [engine, state.selectedEdgeIds, state.strategy, state.maxMoves, dispatch]);

  const handleRaiseLimit = useCallback(() => {
    const next = Math.min(DEFRAG_MAX_MOVES_CEILING, state.maxMoves * 2);
    dispatch({ type: 'SET_MAX_MOVES', maxMoves: next });
  }, [dispatch, state.maxMoves]);

  const plan = state.plan;
  const totalPages = plan ? Math.ceil(plan.moves.length / PAGE_SIZE) : 0;
  const paginatedMoves = useMemo(() => {
    if (!plan) return [];
    return plan.moves.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [plan, page]);

  const getEdgeName = useCallback(
    (edgeId: string) => {
      const edge = topology.edges.find((e) => e.id === edgeId);
      return edge?.name || edgeId.slice(0, 12);
    },
    [topology.edges]
  );

  const getServiceName = useCallback(
    (serviceId: string) => {
      const svc = services.find((s) => s.id === serviceId);
      return svc?.name || serviceId.slice(0, 12);
    },
    [services]
  );

  if (state.isComputing) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-muted">
        Computing defragmentation plan...
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-muted">
        No plan available. Go back and select edges.
      </div>
    );
  }

  const riskSummary = plan.estimatedImpact.riskSummary;

  return (
    <div className="flex flex-col gap-4">
      {/* Header with strategy badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Proposed Moves</h3>
          <span className="bg-accent/15 rounded-full px-2.5 py-0.5 text-xs font-medium text-accent">
            {STRATEGY_LABELS[plan.strategy] || plan.strategy}
          </span>
        </div>
        <span className="text-xs text-text-muted" data-testid="defrag-review-summary">
          {plan.moves.length} move{plan.moves.length !== 1 ? 's' : ''} planned across{' '}
          {plan.processedEdgeIds.length} of {plan.targetEdgeIds.length} edge
          {plan.targetEdgeIds.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Truncation banner (T032) */}
      {plan.truncated && (
        <div
          className="border-warning/40 bg-warning/10 flex items-start gap-3 rounded-lg border px-4 py-3"
          data-testid="defrag-truncation-banner"
          role="status"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-xs font-medium text-text-primary">
              Plan capped at {plan.maxMoves.toLocaleString()} move
              {plan.maxMoves !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-text-secondary">
              {plan.moves.length} move{plan.moves.length !== 1 ? 's' : ''} planned across{' '}
              {plan.processedEdgeIds.length} of {plan.targetEdgeIds.length} edge
              {plan.targetEdgeIds.length !== 1 ? 's' : ''}. Some selected edges were skipped to
              keep the plan tractable.
            </p>
          </div>
          {state.maxMoves < DEFRAG_MAX_MOVES_CEILING && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRaiseLimit}
              data-testid="defrag-raise-limit"
            >
              Raise limit
            </Button>
          )}
        </div>
      )}

      {/* Risk summary bar */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-tertiary px-4 py-2">
        <span className="text-xs font-medium text-text-secondary">Risk Summary:</span>
        {(['low', 'medium', 'high'] as DefragRiskLevel[]).map((level) => {
          const config = RISK_CONFIG[level];
          const count = riskSummary[level];
          return (
            <div key={level} className="flex items-center gap-1.5">
              <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', config.bgColor, config.color)}>
                {config.icon}
                {config.label}: {count}
              </span>
            </div>
          );
        })}
        {riskSummary.high > 0 && (
          <div className="ml-auto flex items-center gap-1 text-xs text-danger">
            <AlertTriangle className="h-3 w-3" />
            <span>{riskSummary.high} high-risk move{riskSummary.high !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Moves table */}
      {plan.moves.length === 0 ? (
        <NoMovesMessage reason={plan.reason} />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-sticky bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                  <tr className="text-left text-text-secondary">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Edge</th>
                    <th className="px-3 py-2">Service</th>
                    <th className="px-3 py-2">Channel Move</th>
                    <th className="px-3 py-2">Risk</th>
                    <th className="px-3 py-2">Downtime</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMoves.map((move, idx) => {
                    const risk = move.risk || 'low';
                    const riskConfig = RISK_CONFIG[risk];
                    return (
                      <tr key={`${move.edgeId}-${move.serviceId}-${idx}`} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-text-muted">
                          {page * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-3 py-2 font-mono text-text-primary">
                          {getEdgeName(move.edgeId)}
                        </td>
                        <td className="px-3 py-2 font-mono text-text-secondary">
                          {getServiceName(move.serviceId)}
                        </td>
                        <td className="px-3 py-2">
                          <ChannelMoveDisplay from={move.fromChannel} to={move.toChannel} />
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                              riskConfig.bgColor,
                              riskConfig.color
                            )}
                            title={move.riskReason}
                          >
                            {riskConfig.icon}
                            {riskConfig.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {move.estimatedDowntime ? `${move.estimatedDowntime}s` : '--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span>
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, plan.moves.length)} of {plan.moves.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="rounded px-2 py-1 hover:bg-tertiary disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded px-2 py-1 hover:bg-tertiary disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============================================================================
// CHANNEL MOVE DISPLAY
// ============================================================================

const ChannelMoveDisplay: React.FC<{ from: number; to: number }> = ({ from, to }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="font-mono text-text-muted line-through">Ch {from}</span>
    <ArrowRight className="h-3 w-3 text-text-muted" />
    <span className="bg-accent/15 rounded px-1.5 py-0.5 font-mono font-medium text-accent">
      Ch {to}
    </span>
  </span>
);

const NO_MOVE_MESSAGES: Record<DefragNoMoveReason, { title: string; description: string }> = {
  'no-fragmentation': {
    title: 'No Fragmentation Detected',
    description: 'The selected edges have contiguous allocations with no internal gaps. No defragmentation is needed.',
  },
  'single-allocation': {
    title: 'Single Allocation',
    description: 'Each selected edge has at most one channel allocated. Defragmentation requires multiple allocations to consolidate.',
  },
  'no-allocations': {
    title: 'No Allocations Found',
    description: 'The selected edges have no allocated or reserved channels. There is nothing to defragment.',
  },
};

const NoMovesMessage: React.FC<{ reason?: DefragNoMoveReason }> = ({ reason }) => {
  const info = reason ? NO_MOVE_MESSAGES[reason] : null;
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-tertiary px-6 py-8 text-center">
      <CheckCircle2 className="h-8 w-8 text-success" />
      <h4 className="text-sm font-semibold text-text-primary">
        {info?.title || 'No Moves Needed'}
      </h4>
      <p className="max-w-sm text-xs text-text-secondary">
        {info?.description || 'Spectrum is already optimal for the selected edges.'}
      </p>
    </div>
  );
};
