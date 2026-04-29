/**
 * DefragWizardSimulate - Step 4: Before/after spectrum comparison
 *
 * Side-by-side SpectrumGrid (16-col grid mode with channel numbers),
 * accurate after-metrics via cloned lambda map, summary bar.
 */

import React, { useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useDefragWizard } from './DefragWizardContext';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { DefragmentationEngine } from '@/core/services/DefragmentationEngine';
import { SpectrumGrid, type ChannelState } from '@/components/capacity/SpectrumGrid';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

// ============================================================================
// HELPERS
// ============================================================================

function lambdaMapToChannelStates(
  map: Array<{ channelNumber: number; status: string; serviceId?: string }>,
  moves?: Array<{ fromChannel: number; toChannel: number }>,
  isAfter = false
): ChannelState[] {
  const movingFrom = new Set<number>();
  const movingTo = new Set<number>();
  if (moves) {
    for (const m of moves) {
      movingFrom.add(m.fromChannel);
      movingTo.add(m.toChannel);
    }
  }

  return map.map((entry) => {
    if (isAfter) {
      if (movingTo.has(entry.channelNumber) && entry.status !== 'free') {
        return 'moved-to';
      }
    } else {
      if (movingFrom.has(entry.channelNumber) && entry.status !== 'free') {
        return 'moving';
      }
    }

    if (entry.status === 'allocated') return 'allocated';
    if (entry.status === 'reserved') return 'reserved';
    return 'free';
  });
}

function formatDowntime(seconds: number): string {
  if (seconds === 0) return 'None';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const DefragWizardSimulate: React.FC = () => {
  const { state, dispatch } = useDefragWizard();
  const topology = useNetworkStore((s) => s.topology);
  const services = useServiceStore((s) => s.services);

  const engine = useMemo(() => {
    return new DefragmentationEngine(
      () => topology.nodes,
      () => topology.edges,
      () => services
    );
  }, [topology, services]);

  // Build before/after lambda maps on mount
  useEffect(() => {
    if (!state.plan || state.plan.moves.length === 0) return;

    const beforeMaps = new Map<string, Array<{ channelNumber: number; status: string; serviceId?: string }>>();
    const afterMaps = new Map<string, Array<{ channelNumber: number; status: string; serviceId?: string }>>();

    for (const edgeId of state.plan.targetEdgeIds) {
      const beforeMap = engine.cloneLambdaMap(edgeId);
      beforeMaps.set(edgeId, beforeMap);

      const afterMap = engine.cloneLambdaMap(edgeId);
      const edgeMoves = state.plan.moves.filter((m) => m.edgeId === edgeId);
      for (const move of edgeMoves) {
        const fromEntry = afterMap.find((e) => e.channelNumber === move.fromChannel);
        const toEntry = afterMap.find((e) => e.channelNumber === move.toChannel);
        if (fromEntry && toEntry) {
          toEntry.status = fromEntry.status;
          toEntry.serviceId = fromEntry.serviceId;
          fromEntry.status = 'free';
          fromEntry.serviceId = undefined;
        }
      }
      afterMaps.set(edgeId, afterMap);
    }

    dispatch({ type: 'SET_BEFORE_LAMBDA_MAPS', maps: beforeMaps });
    dispatch({ type: 'SET_AFTER_LAMBDA_MAPS', maps: afterMaps });
  }, [engine, state.plan, dispatch]);

  const plan = state.plan;

  if (!plan) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-muted">
        No plan available. Go back to review moves.
      </div>
    );
  }

  const fragReduction = plan.beforeMetrics.avgFragmentation - plan.afterMetrics.avgFragmentation;
  const fragReductionPercent = plan.beforeMetrics.avgFragmentation > 0
    ? Math.round((fragReduction / plan.beforeMetrics.avgFragmentation) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-tertiary px-4 py-3">
        <SummaryItem
          label="Affected Services"
          value={plan.estimatedImpact.servicesAffected}
        />
        <SummaryDivider />
        <SummaryItem
          label="Total Moves"
          value={plan.estimatedImpact.totalMoves}
        />
        <SummaryDivider />
        <SummaryItem
          label="Est. Downtime"
          value={formatDowntime(plan.estimatedImpact.estimatedDowntime)}
        />
        <SummaryDivider />
        <SummaryItem
          label="Risk"
          value={
            plan.estimatedImpact.riskSummary.high > 0
              ? 'High'
              : plan.estimatedImpact.riskSummary.medium > 0
                ? 'Medium'
                : 'Low'
          }
          valueColor={
            plan.estimatedImpact.riskSummary.high > 0
              ? 'text-danger'
              : plan.estimatedImpact.riskSummary.medium > 0
                ? 'text-warning'
                : 'text-success'
          }
        />
        <SummaryDivider />
        <SummaryItem
          label="Frag Reduction"
          value={`${(plan.beforeMetrics.avgFragmentation * 100).toFixed(0)}% -> ${(plan.afterMetrics.avgFragmentation * 100).toFixed(0)}%`}
          valueColor="text-success"
          suffix={
            fragReductionPercent > 0 ? (
              <span className="flex items-center gap-0.5 text-xs text-success">
                <ArrowDown className="h-3 w-3" />
                {fragReductionPercent}%
              </span>
            ) : fragReductionPercent < 0 ? (
              <span className="flex items-center gap-0.5 text-xs text-danger">
                <ArrowUp className="h-3 w-3" />
                {Math.abs(fragReductionPercent)}%
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-xs text-text-muted">
                <Minus className="h-3 w-3" />
                0%
              </span>
            )
          }
        />
      </div>

      {/* Before/After Spectrum */}
      {plan.moves.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-text-primary">
            Before / After Spectrum Comparison
            <span className="ml-2 text-xs font-normal text-text-muted">(Estimated)</span>
          </h3>

          <div className="flex max-h-64 flex-col gap-4 overflow-y-auto">
            {state.plan?.targetEdgeIds.map((edgeId) => {
              const edge = topology.edges.find((e) => e.id === edgeId);
              const edgeName = edge?.name || edgeId.slice(0, 12);
              const beforeMap = state.beforeLambdaMaps.get(edgeId);
              const afterMap = state.afterLambdaMaps.get(edgeId);
              const edgeMoves = plan.moves.filter((m) => m.edgeId === edgeId);

              if (!beforeMap || !afterMap || edgeMoves.length === 0) return null;

              const beforeChannels = lambdaMapToChannelStates(beforeMap, edgeMoves, false);
              const afterChannels = lambdaMapToChannelStates(afterMap, edgeMoves, true);

              return (
                <div key={edgeId} className="rounded-lg border border-border bg-elevated p-3">
                  <span className="mb-2 block text-xs font-medium text-text-secondary">
                    {edgeName}
                    <span className="ml-2 text-text-muted">({edgeMoves.length} move{edgeMoves.length !== 1 ? 's' : ''})</span>
                  </span>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Before</span>
                      <SpectrumGrid channels={beforeChannels} mode="grid" compact />
                    </div>
                    <div>
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">After</span>
                      <SpectrumGrid channels={afterChannels} mode="grid" compact />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-3">
            <LegendItem color="#ef4444" label="Allocated" />
            <LegendItem color="#f97316" label="Reserved" />
            <LegendItem color="#eab308" label="Moving (before)" />
            <LegendItem color="#3b82f6" label="Moved To (after)" />
            <LegendItem color="#22c55e" label="Free" opacity={0.3} />
          </div>
        </div>
      )}

      {plan.moves.length === 0 && (
        <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-tertiary text-sm text-text-muted">
          No moves needed. Spectrum is already optimal for selected edges.
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const SummaryItem: React.FC<{
  label: string;
  value: string | number;
  valueColor?: string;
  suffix?: React.ReactNode;
}> = ({ label, value, valueColor, suffix }) => (
  <div className="flex flex-col">
    <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
    <div className="flex items-center gap-1">
      <span className={cn('text-sm font-semibold text-text-primary', valueColor)}>
        {value}
      </span>
      {suffix}
    </div>
  </div>
);

const SummaryDivider: React.FC = () => (
  <div className="hidden h-8 w-px bg-border sm:block" />
);

const LegendItem: React.FC<{ color: string; label: string; opacity?: number }> = ({
  color,
  label,
  opacity = 0.85,
}) => (
  <div className="flex items-center gap-1.5">
    <div
      className="h-3 w-3 rounded-sm"
      style={{ backgroundColor: color, opacity }}
    />
    <span className="text-xs text-text-tertiary">{label}</span>
  </div>
);
