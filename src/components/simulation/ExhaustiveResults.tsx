/**
 * ExhaustiveResults - Results Summary Table for Exhaustive Simulation
 *
 * Features:
 * - Per-scenario results (sortable by survivability/down/affected)
 * - Click-to-expand detail (re-runs individual scenario on demand)
 * - Worst/best highlighting
 * - Export: individual scenario JSON, full summary CSV, complete JSON bundle
 * - CSV injection sanitization via csv-utils
 * - Spinner during export, chunked string building for large datasets
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useSimulationStore } from '@/stores/simulationStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { FailureSimulator } from '@/core/simulation/FailureSimulator';
import { ScenarioDetailModal } from './ScenarioDetailModal';
import { toCsvRow } from '@/lib/csv-utils';
import type { ExhaustiveScenarioSummary, SimulationResult } from '@/types/simulation';
import {
  Download,
  FileJson,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Trophy,
  AlertTriangle,
  ArrowUpDown,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// SORT OPTIONS
// ============================================================================

type SortField = 'survivability' | 'down' | 'affected' | 'bandwidth' | 'scenarioId';
type SortDir = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  dir: SortDir;
}

// ============================================================================
// EXPANDED ROW DETAIL
// ============================================================================

const ExpandedDetail: React.FC<{
  scenario: ExhaustiveScenarioSummary;
  onViewFullReport: () => void;
}> = ({ scenario, onViewFullReport }) => {
  const [detail, setDetail] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const topology = useNetworkStore((s) => s.topology);
  const services = useServiceStore((s) => s.services);

  const handleRerun = useCallback(() => {
    setLoading(true);
    // Run in next tick to show loading state
    setTimeout(() => {
      const simulator = new FailureSimulator(
        () => topology.nodes,
        () => topology.edges,
        () => services
      );
      const result = simulator.simulate(scenario.failedEdgeIds, scenario.failedNodeIds);
      setDetail(result);
      setLoading(false);
    }, 0);
  }, [scenario, topology, services]);

  const handleExportScenario = useCallback(() => {
    if (!detail) return;
    const json = JSON.stringify(
      { scenario: { ...scenario }, detail },
      null,
      2
    );
    downloadFile(json, `scenario-${scenario.scenarioId}.json`, 'application/json');
  }, [scenario, detail]);

  return (
    <div className="bg-tertiary/50 border-t border-border px-4 py-3">
      {!detail && !loading && (
        <Button variant="outline" size="sm" onClick={handleRerun}>
          Load Full Detail
        </Button>
      )}
      {loading && (
        <div className="text-xs text-text-tertiary">Running scenario...</div>
      )}
      {detail && (
        <div className="flex flex-col gap-2">
          {/* Summary stats */}
          <div className="flex gap-4 text-xs">
            <span className="text-text-secondary">
              Affected: <span className="font-semibold text-text-primary">{detail.affectedServices.length}</span>
            </span>
            <span className="text-text-secondary">
              Survived: <span className="font-semibold text-success">{detail.survivedServices.length}</span>
            </span>
            <span className="text-text-secondary">
              At Risk: <span className="font-semibold text-blue-500">{detail.affectedServices.filter((s) => s.status === 'at-risk').length}</span>
            </span>
            <span className="text-text-secondary">
              Temp Outage: <span className="font-semibold text-amber-500">{detail.affectedServices.filter((s) => s.status === 'temporary-outage').length}</span>
            </span>
            <span className="text-text-secondary">
              Down: <span className="font-semibold text-danger">{detail.downServices.length}</span>
            </span>
            <span className="text-text-secondary">
              BW Affected: <span className="font-semibold text-text-primary">{detail.totalBandwidthAffected}G</span>
            </span>
          </div>

          {/* Service list */}
          {detail.affectedServices.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded border border-border bg-elevated">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="px-2 py-1.5">Service</th>
                    <th className="px-2 py-1.5">Type</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Protection</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.affectedServices.map((svc) => (
                    <tr key={svc.serviceId} className="border-border/50 border-b">
                      <td className="px-2 py-1">{svc.serviceName}</td>
                      <td className="px-2 py-1">
                        <span className="rounded bg-tertiary px-1.5 py-0.5 text-[10px] font-medium">
                          {svc.serviceType}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className={cn(
                            'font-medium',
                            svc.status === 'survived' && 'text-success',
                            svc.status === 'down' && 'text-danger',
                            svc.status === 'degraded' && 'text-warning',
                            svc.status === 'at-risk' && 'text-blue-500',
                            svc.status === 'temporary-outage' && 'text-amber-500'
                          )}
                        >
                          {svc.status === 'at-risk' ? 'at risk' : svc.status === 'temporary-outage' ? 'restored (5 min)' : svc.status}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        {svc.protectionActivated ? (
                          <span className="text-success">Active</span>
                        ) : svc.hasProtection ? (
                          <span className="text-text-muted">Available</span>
                        ) : (
                          <span className="text-text-muted">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onViewFullReport}>
              <FileText className="mr-1.5 h-3 w-3" />
              View Full Report
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportScenario}>
              <FileJson className="mr-1.5 h-3 w-3" />
              Export Scenario
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ExhaustiveResults: React.FC = () => {
  const results = useSimulationStore((s) => s.exhaustiveResults);
  const [sort, setSort] = useState<SortConfig>({ field: 'survivability', dir: 'asc' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [hideZeroImpact, setHideZeroImpact] = useState(true);
  const [modalScenario, setModalScenario] = useState<ExhaustiveScenarioSummary | null>(null);

  const sortedScenarios = useMemo(() => {
    if (!results) return [];
    const sorted = [...results.scenarios];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sort.field) {
        case 'survivability':
          cmp = a.survivabilityScore - b.survivabilityScore;
          break;
        case 'down':
          cmp = a.downCount - b.downCount;
          break;
        case 'affected':
          cmp = a.affectedCount - b.affectedCount;
          break;
        case 'bandwidth':
          cmp = a.bandwidthAffected - b.bandwidthAffected;
          break;
        case 'scenarioId':
          cmp = a.scenarioId.localeCompare(b.scenarioId);
          break;
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [results, sort]);

  const displayedScenarios = useMemo(() => {
    if (!hideZeroImpact) return sortedScenarios;
    return sortedScenarios.filter((s) => s.affectedCount > 0);
  }, [sortedScenarios, hideZeroImpact]);

  const hiddenCount = sortedScenarios.length - displayedScenarios.length;

  // Summary stats based on filtered set when filter is active
  const filteredStats = useMemo(() => {
    if (!results) return { bestScore: 0, worstScore: 0, avgScore: 0, fullSurvivalCount: 0, fullSurvivalPct: '0.0', totalScenarios: 0 };
    const scenarios = hideZeroImpact ? displayedScenarios : results.scenarios;
    const total = scenarios.length;
    if (total === 0) return { bestScore: 0, worstScore: 0, avgScore: 0, fullSurvivalCount: 0, fullSurvivalPct: '0.0', totalScenarios: 0 };

    const best = Math.max(...scenarios.map((s) => s.survivabilityScore));
    const worst = Math.min(...scenarios.map((s) => s.survivabilityScore));
    const avg = Math.round(scenarios.reduce((sum, s) => sum + s.survivabilityScore, 0) / total);
    const fullCount = scenarios.filter((s) => s.survivabilityScore === 100).length;
    const fullPct = ((fullCount / total) * 100).toFixed(1);

    return { bestScore: best, worstScore: worst, avgScore: avg, fullSurvivalCount: fullCount, fullSurvivalPct: fullPct, totalScenarios: total };
  }, [results, hideZeroImpact, displayedScenarios]);

  const toggleSort = (field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: field === 'survivability' ? 'asc' : 'desc' }
    );
  };

  const handleExportCSV = useCallback(() => {
    if (!results) return;
    setIsExportingCsv(true);

    // Defer to next tick so spinner renders
    setTimeout(() => {
      const header = toCsvRow([
        'Scenario', 'Failed Edges', 'Failed Nodes',
        'Survivability %', 'Down', 'At Risk', 'Temp Outage', 'Survived', 'Affected', 'BW Affected (G)',
      ]);

      // Export respects current filter
      const exportScenarios = hideZeroImpact
        ? results.scenarios.filter((s) => s.affectedCount > 0)
        : results.scenarios;

      // Chunked building for large datasets
      const CHUNK = 1000;
      const chunks: string[] = [header];
      for (let i = 0; i < exportScenarios.length; i += CHUNK) {
        const slice = exportScenarios.slice(i, i + CHUNK);
        const rowChunk = slice.map((s) =>
          toCsvRow([
            s.scenarioId,
            s.failedEdgeIds.join(';'),
            s.failedNodeIds.join(';'),
            s.survivabilityScore,
            s.downCount,
            s.atRiskCount,
            s.temporaryOutageCount || 0,
            s.survivedCount,
            s.affectedCount,
            s.bandwidthAffected,
          ])
        );
        chunks.push(rowChunk.join('\n'));
      }

      const csv = chunks.join('\n');
      downloadFile(csv, 'exhaustive-summary.csv', 'text/csv');
      setIsExportingCsv(false);
    }, 0);
  }, [results, hideZeroImpact]);

  const handleExportJSON = useCallback(() => {
    if (!results) return;
    setIsExportingJson(true);

    setTimeout(() => {
      const json = JSON.stringify(results, null, 2);
      downloadFile(json, 'exhaustive-results.json', 'application/json');
      setIsExportingJson(false);
    }, 0);
  }, [results]);

  if (!results) return null;

  const duration = results.durationMs < 1000
    ? `${results.durationMs}ms`
    : `${(results.durationMs / 1000).toFixed(1)}s`;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Exhaustive Analysis Results
          </h3>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {results.scenarios.length.toLocaleString()} scenarios completed in {duration}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isExportingCsv}>
            {isExportingCsv ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            )}
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJSON} disabled={isExportingJson}>
            {isExportingJson ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            JSON
          </Button>
        </div>
      </div>

      {/* Aggregate stats (calculated on filtered set when filter active) */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-md border border-border bg-elevated p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Trophy className="h-3.5 w-3.5 text-success" />
            <span className="text-lg font-bold text-success">{filteredStats.bestScore}%</span>
          </div>
          <div className="text-[10px] text-text-tertiary">Best Score</div>
        </div>
        <div className="rounded-md border border-border bg-elevated p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-danger" />
            <span className="text-lg font-bold text-danger">{filteredStats.worstScore}%</span>
          </div>
          <div className="text-[10px] text-text-tertiary">Worst Score</div>
        </div>
        <div className="rounded-md border border-border bg-elevated p-3 text-center">
          <div className="text-lg font-bold text-text-primary">{filteredStats.avgScore}%</div>
          <div className="text-[10px] text-text-tertiary">Average Score</div>
        </div>
        <div className="border-success/30 bg-success/5 rounded-md border p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            <span className="text-lg font-bold text-success">{filteredStats.fullSurvivalPct}%</span>
          </div>
          <div className="text-[10px] text-text-tertiary">
            Full Survival ({filteredStats.fullSurvivalCount} of {filteredStats.totalScenarios})
          </div>
        </div>
      </div>

      {/* Filter controls */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={hideZeroImpact}
            onChange={(e) => setHideZeroImpact(e.target.checked)}
            className="accent-accent"
          />
          Hide scenarios with no affected services
        </label>
        {hideZeroImpact && hiddenCount > 0 && (
          <span className="text-xs text-text-tertiary">
            Showing {displayedScenarios.length} of {sortedScenarios.length} scenarios ({hiddenCount} hidden)
          </span>
        )}
      </div>

      {/* Results table */}
      <div className="overflow-hidden rounded-lg border border-border bg-elevated">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-sticky border-b border-border bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
              <tr className="border-b border-border text-left text-text-muted">
                <th className="w-8 px-3 py-2" />
                <SortHeader
                  field="scenarioId"
                  label="Scenario"
                  sort={sort}
                  onClick={toggleSort}
                />
                <th className="px-3 py-2">Failed Elements</th>
                <SortHeader
                  field="survivability"
                  label="Survivability"
                  sort={sort}
                  onClick={toggleSort}
                />
                <SortHeader
                  field="down"
                  label="Down"
                  sort={sort}
                  onClick={toggleSort}
                />
                <th className="px-3 py-2">At Risk</th>
                <th className="px-3 py-2">Temp Outage</th>
                <SortHeader
                  field="affected"
                  label="Affected"
                  sort={sort}
                  onClick={toggleSort}
                />
                <SortHeader
                  field="bandwidth"
                  label="BW (G)"
                  sort={sort}
                  onClick={toggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {displayedScenarios.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-text-muted">
                    No scenarios to display. Adjust filters or run a new simulation.
                  </td>
                </tr>
              )}
              {displayedScenarios.map((scenario) => {
                const isExpanded = expandedId === scenario.scenarioId;
                const isBest =
                  results.scenarios.length > 1 &&
                  scenario.survivabilityScore === results.bestScore;
                const isWorst =
                  results.scenarios.length > 1 &&
                  scenario.survivabilityScore === results.worstScore;

                return (
                  <React.Fragment key={scenario.scenarioId}>
                    <tr
                      className={cn(
                        'cursor-pointer border-b border-border/50 transition-colors hover:bg-tertiary/50',
                        isBest && 'bg-success/5',
                        isWorst && 'bg-danger/5'
                      )}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : scenario.scenarioId)
                      }
                    >
                      <td className="px-3 py-2 text-text-muted">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-text-secondary">
                        {scenario.scenarioId}
                        {isBest && (
                          <Trophy className="ml-1 inline-block h-3 w-3 text-success" />
                        )}
                        {isWorst && (
                          <AlertTriangle className="ml-1 inline-block h-3 w-3 text-danger" />
                        )}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-text-tertiary">
                        {formatFailedElements(scenario)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'font-semibold',
                            scenario.survivabilityScore >= 80 && 'text-success',
                            scenario.survivabilityScore >= 50 &&
                              scenario.survivabilityScore < 80 &&
                              'text-warning',
                            scenario.survivabilityScore < 50 && 'text-danger'
                          )}
                        >
                          {scenario.survivabilityScore}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-danger">
                        {scenario.downCount}
                      </td>
                      <td className="px-3 py-2 text-blue-500">
                        {scenario.atRiskCount}
                      </td>
                      <td className="px-3 py-2 text-amber-500">
                        {scenario.temporaryOutageCount || 0}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {scenario.affectedCount}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {scenario.bandwidthAffected}
                      </td>
                    </tr>
                    {isExpanded && <tr><td colSpan={9}><ExpandedDetail scenario={scenario} onViewFullReport={() => setModalScenario(scenario)} /></td></tr>}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scenario Detail Modal */}
      <ScenarioDetailModal
        open={modalScenario !== null}
        onClose={() => setModalScenario(null)}
        failedEdgeIds={modalScenario?.failedEdgeIds ?? []}
        failedNodeIds={modalScenario?.failedNodeIds ?? []}
        scenarioId={modalScenario?.scenarioId}
      />
    </div>
  );
};

// ============================================================================
// SORT HEADER
// ============================================================================

const SortHeader: React.FC<{
  field: SortField;
  label: string;
  sort: SortConfig;
  onClick: (field: SortField) => void;
}> = ({ field, label, sort, onClick }) => (
  <th
    className="cursor-pointer select-none px-3 py-2 hover:text-text-secondary"
    onClick={() => onClick(field)}
    aria-sort={
      sort.field === field
        ? sort.dir === 'asc'
          ? 'ascending'
          : 'descending'
        : 'none'
    }
  >
    <span className="flex items-center gap-1">
      {label}
      <ArrowUpDown
        className={cn(
          'h-3 w-3',
          sort.field === field ? 'text-accent' : 'text-text-muted/50'
        )}
      />
    </span>
  </th>
);

// ============================================================================
// HELPERS
// ============================================================================

function formatFailedElements(scenario: ExhaustiveScenarioSummary): string {
  const parts: string[] = [];
  if (scenario.failedEdgeIds.length > 0) {
    parts.push(scenario.failedEdgeIds.join(', '));
  }
  if (scenario.failedNodeIds.length > 0) {
    parts.push(scenario.failedNodeIds.join(', '));
  }
  return parts.join(' + ');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default ExhaustiveResults;
