/**
 * DefragWizardSimulateExport - Step 3: Before/after spectrum comparison & export
 *
 * Side-by-side SpectrumGrid (16-col grid mode with channel numbers),
 * accurate after-metrics via cloned lambda map, summary bar, export buttons.
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useDefragWizard } from './DefragWizardContext';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { DefragmentationEngine } from '@/core/services/DefragmentationEngine';
import { SpectrumGrid, type ChannelState } from '@/components/capacity/SpectrumGrid';
import { FileJson, FileSpreadsheet, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// HELPERS
// ============================================================================

function lambdaMapToChannelStates(
  map: Array<{ channelNumber: number; status: string; serviceId?: string }>,
  moves?: Array<{ fromChannel: number; toChannel: number }>,
  isAfter = false
): ChannelState[] {
  // Build a set of moving-from and moving-to channels
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

export const DefragWizardSimulateExport: React.FC = () => {
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
      // Before: clone current lambda map
      const beforeMap = engine.cloneLambdaMap(edgeId);
      beforeMaps.set(edgeId, beforeMap);

      // After: clone and apply moves
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

  // Export handlers
  const handleExportJSON = useCallback(() => {
    if (!plan) return;
    const data = {
      ...plan,
      exportedAt: new Date().toISOString(),
      label: 'Estimated',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `defrag-plan-${plan.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [plan]);

  const handleExportCSV = useCallback(() => {
    if (!plan) return;
    const headers = ['#', 'Edge ID', 'Service ID', 'From Channel', 'To Channel', 'Risk', 'Est. Downtime (s)'];
    const rows = plan.moves.map((m, i) => [
      i + 1,
      m.edgeId,
      m.serviceId,
      m.fromChannel,
      m.toChannel,
      m.risk || 'low',
      m.estimatedDowntime || 0,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `defrag-moves-${plan.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [plan]);

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
            <LegendItem color="#3b82f6" label="Allocated" />
            <LegendItem color="#eab308" label="Reserved" />
            <LegendItem color="#f97316" label="Moving (before)" />
            <LegendItem color="#22c55e" label="Moved To (after)" />
            <LegendItem color="#94a3b8" label="Free" opacity={0.3} />
          </div>
        </div>
      )}

      {/* Export buttons */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleExportJSON}>
          <FileJson className="mr-1.5 h-3.5 w-3.5" />
          Export JSON
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>
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
