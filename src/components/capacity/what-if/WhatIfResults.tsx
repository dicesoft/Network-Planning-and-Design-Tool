import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  X,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricTooltip } from '@/components/ui/MetricTooltip';
import { formatPercentDelta } from '@/lib/format-percent';
import { pluralize } from '@/lib/pluralize';
import type { WhatIfResult } from '@/core/services/CapacityTracker';
import type { WhatIfPathResult } from '@/core/services/WhatIfPathComputer';

// ============================================================================
// TYPES
// ============================================================================

export interface WhatIfResultsProps {
  results: WhatIfResult[];
  pathResults: WhatIfPathResult[];
  edgeNameMap: Map<string, string>;
  onClear: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function getDeltaIcon(delta: number) {
  if (delta > 0) return <ArrowUp className="h-3.5 w-3.5" />;
  if (delta < 0) return <ArrowDown className="h-3.5 w-3.5" />;
  // True zero — no directional glyph; formatPercentDelta renders the neutral marker.
  return null;
}

function getDeltaColor(delta: number) {
  if (delta > 0) return 'text-warning';
  if (delta < 0) return 'text-success';
  return 'text-text-tertiary';
}

function getBarColor(pct: number): string {
  if (pct >= 85) return 'bg-danger';
  if (pct >= 60) return 'bg-warning';
  return 'bg-success';
}

function getBarColorClass(pct: number): string {
  if (pct >= 85) return 'text-danger';
  if (pct >= 60) return 'text-warning';
  return 'text-success';
}

/**
 * Returns a non-color glyph for capacity utilization band, so color-blind
 * users can distinguish bands without relying on hue (FR-018, US6 SC-006).
 *   <60%  → ✓
 *   60-85% → ▲
 *   >85%  → ✕
 */
function getBarBandGlyph(pct: number): string {
  if (pct >= 85) return '✕';
  if (pct >= 60) return '▲';
  return '✓';
}

function getBarBandLabel(pct: number): string {
  if (pct >= 85) return 'Above 85% utilization';
  if (pct >= 60) return '60–85% utilization';
  return 'Below 60% utilization';
}

/**
 * Build a narrative impact summary message.
 * Returns null when no meaningful narrative can be generated.
 */
function buildNarrativeSummary(
  aggregated: {
    allFeasible: boolean;
    totalCount: number;
    feasibleCount: number;
    netUtilChange: number;
    edgesAffected: number;
    newBottlenecks: number;
  },
  isRemoveMode: boolean
): { message: string; variant: 'info' | 'warning' } | null {
  // Edge case: no affected edges means nothing changed
  if (aggregated.edgesAffected === 0 && aggregated.netUtilChange === 0) {
    return null;
  }

  // Remove mode
  if (isRemoveMode) {
    if (aggregated.netUtilChange === 0) return null;
    const magnitude = formatPercentDelta(-Math.abs(aggregated.netUtilChange)).replace(/^[+−-]/, '');
    return {
      message: `Removing this service would free capacity on ${aggregated.edgesAffected} ${pluralize('edge', aggregated.edgesAffected)}, reducing average network utilization by ${magnitude}.`,
      variant: 'info',
    };
  }

  // Infeasible services
  if (!aggregated.allFeasible) {
    const infeasibleCount = aggregated.totalCount - aggregated.feasibleCount;
    return {
      message: `${infeasibleCount} of ${aggregated.totalCount} ${pluralize('service', aggregated.totalCount)} cannot be provisioned due to insufficient capacity or no available path.`,
      variant: 'warning',
    };
  }

  // Bottleneck detected
  if (aggregated.newBottlenecks > 0) {
    return {
      message: `Adding ${aggregated.totalCount === 1 ? 'this service' : `these ${aggregated.totalCount} services`} would create ${aggregated.newBottlenecks} new ${pluralize('bottleneck', aggregated.newBottlenecks)} exceeding 85% utilization across ${aggregated.edgesAffected} affected ${pluralize('edge', aggregated.edgesAffected)}. Consider alternative routing or capacity upgrades.`,
      variant: 'warning',
    };
  }

  // All feasible, no bottlenecks
  if (aggregated.netUtilChange === 0) return null;

  const magnitude = formatPercentDelta(Math.abs(aggregated.netUtilChange)).replace(/^[+−-]/, '');
  return {
    message: `Adding ${aggregated.totalCount === 1 ? 'this service' : `these ${aggregated.totalCount} services`} would change average network utilization by ${magnitude} across ${aggregated.edgesAffected} ${pluralize('edge', aggregated.edgesAffected)}. All links remain within safe operating thresholds.`,
    variant: 'info',
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export const WhatIfResults: React.FC<WhatIfResultsProps> = ({
  results,
  pathResults,
  edgeNameMap,
  onClear,
}) => {
  // Aggregate metrics across all results
  const aggregated = useMemo(() => {
    if (results.length === 0) return null;

    let newBottlenecks = 0;
    let feasibleCount = 0;
    let netUtilChange = 0;
    const allAffectedEdges = new Map<
      string,
      { before: number; after: number }
    >();

    for (const result of results) {
      if (result.feasible) feasibleCount++;
      // Sum unrounded per-result deltas — each delta is already an
      // average-across-edges, so summing yields the cumulative
      // full-network net change (T043). Reads canonical
      // `summary.fullNetworkNetChange` per whatif-result.contract.md.
      netUtilChange += result.summary.fullNetworkNetChange;
      for (const ae of result.affectedEdges) {
        allAffectedEdges.set(ae.edgeId, {
          before: ae.before.percentage,
          after: ae.after.percentage,
        });
        if (ae.after.percentage >= 85 && ae.before.percentage < 85) {
          newBottlenecks++;
        }
      }
    }

    const firstResult = results[0];
    const lastResult = results[results.length - 1];

    return {
      feasibleCount,
      totalCount: results.length,
      allFeasible: feasibleCount === results.length,
      netUtilChange,
      edgesAffected: allAffectedEdges.size,
      newBottlenecks,
      utilBefore: firstResult.networkUtilizationBefore,
      utilAfter: lastResult.networkUtilizationAfter,
    };
  }, [results]);

  // Detect remove mode: no pathResults means removal
  const isRemoveMode = pathResults.length === 0;

  // Collect all unique affected edges across results for the impact visualization
  const combinedAffectedEdges = useMemo(() => {
    const edgeMap = new Map<
      string,
      {
        edgeId: string;
        beforePct: number;
        afterPct: number;
        delta: number;
        usedBefore: number;
        usedAfter: number;
        totalChannels: number;
        channelDelta: number;
      }
    >();
    for (const result of results) {
      for (const ae of result.affectedEdges) {
        const existing = edgeMap.get(ae.edgeId);
        if (!existing) {
          edgeMap.set(ae.edgeId, {
            edgeId: ae.edgeId,
            beforePct: ae.before.percentage,
            afterPct: ae.after.percentage,
            delta: ae.delta,
            usedBefore: ae.usedBefore,
            usedAfter: ae.usedAfter,
            totalChannels: ae.totalChannels,
            channelDelta: ae.channelDelta,
          });
        } else {
          // For batch, show cumulative: first before, last after
          edgeMap.set(ae.edgeId, {
            ...existing,
            afterPct: ae.after.percentage,
            delta: ae.after.percentage - existing.beforePct,
            usedAfter: ae.usedAfter,
            channelDelta: ae.usedAfter - existing.usedBefore,
          });
        }
      }
    }
    return Array.from(edgeMap.values()).sort(
      (a, b) => Math.abs(b.delta) - Math.abs(a.delta)
    );
  }, [results]);

  if (!aggregated || results.length === 0) return null;

  // Narrative summary
  const narrative = buildNarrativeSummary(aggregated, isRemoveMode);

  return (
    <div className="flex flex-col gap-4">
      {/* Feasibility Badge */}
      <div
        className={cn(
          'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium',
          aggregated.allFeasible
            ? 'bg-success/10 text-success'
            : 'bg-danger/10 text-danger'
        )}
      >
        <div className="flex items-center gap-2">
          {aggregated.allFeasible ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {aggregated.allFeasible
            ? results.length === 1
              ? 'Service is feasible'
              : `All ${aggregated.totalCount} services are feasible`
            : `${aggregated.totalCount - aggregated.feasibleCount} of ${aggregated.totalCount} service(s) not feasible`}
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} className="h-6 w-6 p-0">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Infeasible reason */}
      {!aggregated.allFeasible &&
        results
          .filter((r) => !r.feasible && r.reason)
          .map((r, i) => (
            <div
              key={i}
              className="border-danger/20 bg-danger/5 rounded-md border px-3 py-2 text-xs text-danger"
            >
              {r.reason}
            </div>
          ))}

      {/* Narrative Impact Summary Banner (Task 3.4) */}
      {narrative && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-md border px-3 py-2',
            narrative.variant === 'warning'
              ? 'border-warning/20 bg-warning/5'
              : 'border-accent/20 bg-accent/5'
          )}
        >
          {narrative.variant === 'warning' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          )}
          <div
            className={cn(
              'text-xs',
              narrative.variant === 'warning' ? 'text-warning' : 'text-accent'
            )}
          >
            {narrative.message}
          </div>
        </div>
      )}

      {/* Impact Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-border bg-elevated p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-text-tertiary">
            <span>Full Network Net Change</span>
            <MetricTooltip metric="fullNetworkNetChange" />
          </div>
          <div
            className={cn(
              'flex items-center justify-center gap-1 text-lg font-semibold',
              getDeltaColor(aggregated.netUtilChange)
            )}
          >
            {getDeltaIcon(aggregated.netUtilChange)}
            {formatPercentDelta(aggregated.netUtilChange)}
          </div>
        </div>
        <div className="rounded-md border border-border bg-elevated p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-text-tertiary">
            <span>Edges Affected</span>
            <MetricTooltip metric="edgesAffected" />
          </div>
          <div className="text-lg font-semibold text-text-primary">
            {aggregated.edgesAffected}
          </div>
        </div>
        <div className="rounded-md border border-border bg-elevated p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-text-tertiary">
            <span>New Bottlenecks</span>
            <MetricTooltip metric="newBottlenecks" />
          </div>
          <div
            className={cn(
              'text-lg font-semibold',
              aggregated.newBottlenecks > 0 ? 'text-danger' : 'text-success'
            )}
          >
            {aggregated.newBottlenecks}
          </div>
        </div>
      </div>

      {/* Vertical Bar Pairs - Edge Impact Visualization (Task 3.3) */}
      {combinedAffectedEdges.length > 0 && (
        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-canvas px-3 py-2 text-xs font-medium text-text-secondary">
            Edge Impact ({combinedAffectedEdges.length})
          </div>
          <div className="max-h-80 overflow-auto p-3">
            {/* Responsive: vertical bars on large screens, horizontal on small */}
            {/* Large screen: vertical bar pairs */}
            <div className="hidden lg:grid lg:grid-cols-[repeat(auto-fill,minmax(100px,1fr))] lg:gap-3">
              {combinedAffectedEdges.map((ae) => (
                <div key={ae.edgeId} className="flex flex-col items-center">
                  {/* Edge name */}
                  <div className="mb-2 w-full truncate text-center text-[10px] font-medium text-text-primary" title={edgeNameMap.get(ae.edgeId) || ae.edgeId}>
                    {edgeNameMap.get(ae.edgeId) || ae.edgeId}
                  </div>
                  {/* Vertical bar pair container */}
                  <div className="flex items-end gap-1.5" style={{ height: '120px' }}>
                    {/* Before bar */}
                    <div className="flex h-full w-7 flex-col items-center justify-end">
                      <div
                        className={cn(
                          'w-full rounded-t-sm transition-all',
                          getBarColor(ae.beforePct)
                        )}
                        style={{ height: `${Math.max(Math.min(ae.beforePct, 100), 2)}%` }}
                        role="meter"
                        aria-valuenow={ae.beforePct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${edgeNameMap.get(ae.edgeId) || ae.edgeId} before: ${ae.beforePct}%`}
                      />
                    </div>
                    {/* After bar */}
                    <div className="flex h-full w-7 flex-col items-center justify-end">
                      <div
                        className={cn(
                          'w-full rounded-t-sm transition-all',
                          getBarColor(ae.afterPct)
                        )}
                        style={{ height: `${Math.max(Math.min(ae.afterPct, 100), 2)}%` }}
                        role="meter"
                        aria-valuenow={ae.afterPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${edgeNameMap.get(ae.edgeId) || ae.edgeId} after: ${ae.afterPct}%`}
                      />
                    </div>
                  </div>
                  {/* Labels */}
                  <div className="mt-1 flex gap-1.5 text-[9px]">
                    <span className="text-text-tertiary">{ae.beforePct}%</span>
                    <span
                      className={cn('font-medium', getBarColorClass(ae.afterPct))}
                      aria-label={getBarBandLabel(ae.afterPct)}
                      title={getBarBandLabel(ae.afterPct)}
                    >
                      <span aria-hidden="true">{getBarBandGlyph(ae.afterPct)}</span> {ae.afterPct}%
                    </span>
                  </div>
                  {/* Delta */}
                  <div className={cn('text-[10px] font-medium', getDeltaColor(ae.delta))}>
                    {formatPercentDelta(ae.delta)}
                  </div>
                  {/* Raw channel counts (FR-014) */}
                  <div className="mt-0.5 text-[9px] text-text-tertiary">
                    {ae.usedBefore}→{ae.usedAfter} of {ae.totalChannels}
                    {' '}({ae.channelDelta > 0 ? '+' : ''}{ae.channelDelta} ch)
                  </div>
                </div>
              ))}
            </div>

            {/* Small screen: horizontal fallback */}
            <div className="flex flex-col gap-2 lg:hidden">
              {combinedAffectedEdges.map((ae) => (
                <div
                  key={ae.edgeId}
                  className="border-b border-border pb-2 last:border-b-0 last:pb-0"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-text-primary">
                      {edgeNameMap.get(ae.edgeId) || ae.edgeId}
                    </span>
                    <span
                      className={cn('text-xs font-medium', getDeltaColor(ae.delta))}
                    >
                      {formatPercentDelta(ae.delta)}
                      {ae.afterPct >= 85 && (
                        <AlertTriangle className="ml-1 inline h-3 w-3 text-danger" />
                      )}
                    </span>
                  </div>
                  <div className="mb-1 text-[10px] text-text-tertiary">
                    {ae.usedBefore}→{ae.usedAfter} of {ae.totalChannels}
                    {' '}({ae.channelDelta > 0 ? '+' : ''}{ae.channelDelta} ch)
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-right text-[10px] text-text-tertiary">
                        Before
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-tertiary">
                        <div
                          className={cn('h-full rounded-full transition-all', getBarColor(ae.beforePct))}
                          style={{ width: `${Math.min(ae.beforePct, 100)}%` }}
                          role="meter"
                          aria-valuenow={ae.beforePct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${edgeNameMap.get(ae.edgeId) || ae.edgeId} before: ${ae.beforePct}%`}
                        />
                      </div>
                      <span className="w-8 text-right text-[10px] text-text-tertiary">
                        {ae.beforePct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-right text-[10px] text-text-tertiary">
                        After
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-tertiary">
                        <div
                          className={cn('h-full rounded-full transition-all', getBarColor(ae.afterPct))}
                          style={{ width: `${Math.min(ae.afterPct, 100)}%` }}
                          role="meter"
                          aria-valuenow={ae.afterPct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${edgeNameMap.get(ae.edgeId) || ae.edgeId} after: ${ae.afterPct}%`}
                        />
                      </div>
                      <span
                        className="w-12 text-right text-[10px]"
                        aria-label={getBarBandLabel(ae.afterPct)}
                        title={getBarBandLabel(ae.afterPct)}
                      >
                        <span aria-hidden="true" className={getBarColorClass(ae.afterPct)}>{getBarBandGlyph(ae.afterPct)}</span>
                        <span className="ml-1 text-text-tertiary">{ae.afterPct}%</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="border-t border-border px-3 py-1.5">
            <div className="flex items-center gap-4 text-[10px] text-text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-success" />
                <span className="text-success" aria-hidden="true">✓</span> &lt; 60%
                <MetricTooltip metric="thresholdLow" />
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-warning" />
                <span className="text-warning" aria-hidden="true">▲</span> 60-85%
                <MetricTooltip metric="thresholdMid" />
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-danger" />
                <span className="text-danger" aria-hidden="true">✕</span> &gt; 85%
                <MetricTooltip metric="thresholdHigh" />
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Edge Impact Table */}
      {combinedAffectedEdges.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-canvas">
                <th className="px-3 py-2 text-left font-medium text-text-secondary">
                  Edge
                </th>
                <th className="px-3 py-2 text-right font-medium text-text-secondary">
                  Before
                </th>
                <th className="px-3 py-2 text-right font-medium text-text-secondary">
                  After
                </th>
                <th className="px-3 py-2 text-right font-medium text-text-secondary">
                  Channels
                </th>
                <th className="px-3 py-2 text-right font-medium text-text-secondary">
                  Delta
                </th>
              </tr>
            </thead>
            <tbody>
              {combinedAffectedEdges.map((ae) => (
                <tr
                  key={ae.edgeId}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-2 text-text-primary">
                    {edgeNameMap.get(ae.edgeId) || ae.edgeId}
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {ae.beforePct}%
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {ae.afterPct}%
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {ae.usedBefore}→{ae.usedAfter} of {ae.totalChannels}
                    {' '}({ae.channelDelta > 0 ? '+' : ''}{ae.channelDelta})
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right font-medium',
                      getDeltaColor(ae.delta)
                    )}
                  >
                    {formatPercentDelta(ae.delta)}
                    {ae.afterPct >= 85 && (
                      <AlertTriangle className="ml-1 inline h-3 w-3 text-danger" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
