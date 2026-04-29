/**
 * DefragmentationDashboard - Enhanced defragmentation analysis view
 *
 * Features:
 * - FragmentationGauge (left) + explanation text + stats (right)
 * - Fragmentation table with colored pill badges
 * - Spectrum heatmap (compact SpectrumGrid per edge)
 * - Legend bar
 * - "Start Defrag Wizard" + "Export Report" buttons
 * - Sort control for the table
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import {
  DefragmentationEngine,
  type NetworkFragmentationSummary,
} from '@/core/services/DefragmentationEngine';
import { CapacityTracker, createStoreDataProvider, type LambdaMapEntry } from '@/core/services/CapacityTracker';
import { FragmentationGauge } from '@/components/capacity/FragmentationGauge';
import { SpectrumGrid, type ChannelState } from '@/components/capacity/SpectrumGrid';
import { StatCard } from '@/components/capacity/StatCard';
import { DefragWizard } from '@/components/capacity/defrag-wizard/DefragWizard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { BarChart3, Wand2, Download, ArrowUpDown } from 'lucide-react';

const FRAGMENTATION_FILTER_THRESHOLD = 0.5;

// ============================================================================
// TYPES
// ============================================================================

type SortField = 'fragmentation' | 'name' | 'used' | 'free';
type SortDir = 'asc' | 'desc';

// ============================================================================
// HEALTH CATEGORIES
// ============================================================================

type HealthCategory = 'critical' | 'warning' | 'healthy' | 'recoverable';

interface HealthCounts {
  critical: number;   // fragmentation > 0.7
  warning: number;    // fragmentation > 0.3 and <= 0.7
  healthy: number;    // fragmentation <= 0.3 and has no used channels, or <= 0.1
  recoverable: number; // fragmentation > 0.1 and <= 0.3 with used channels
}

function getEdgeHealth(fragIndex: number, usedChannels: number): HealthCategory {
  if (fragIndex > 0.7) return 'critical';
  if (fragIndex > 0.3) return 'warning';
  if (fragIndex <= 0.1 || usedChannels === 0) return 'healthy';
  return 'recoverable';
}

const HEALTH_CONFIG: Record<HealthCategory, { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Critical', color: 'text-danger', bgColor: 'bg-danger/15' },
  warning: { label: 'Warning', color: 'text-warning', bgColor: 'bg-warning/15' },
  healthy: { label: 'Healthy', color: 'text-success', bgColor: 'bg-success/15' },
  recoverable: { label: 'Recoverable', color: 'text-accent', bgColor: 'bg-accent/15' },
};

// ============================================================================
// HELPERS
// ============================================================================

function getFragBadgeClasses(index: number): string {
  if (index <= 0.2) return 'bg-success/15 text-success';
  if (index <= 0.5) return 'bg-warning/15 text-warning';
  return 'bg-danger/15 text-danger';
}

function lambdaMapToChannels(map: LambdaMapEntry[]): ChannelState[] {
  return map.map((entry) => {
    if (entry.status === 'allocated') return 'allocated';
    if (entry.status === 'reserved') return 'reserved';
    return 'free';
  });
}

function countFreeFragments(fragments: Array<{ status: string }>): number {
  return fragments.filter((f) => f.status === 'free').length;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const DefragmentationDashboard: React.FC = () => {
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);
  const defragVersion = useServiceStore((state) => state.defragVersion);
  const [analysis, setAnalysis] = useState<NetworkFragmentationSummary | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>('fragmentation');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState('');
  const [fragmentedOnly, setFragmentedOnly] = useState(false);

  const endpointLookup = useMemo(() => {
    const nodeById = new Map(topology.nodes.map((n) => [n.id, n.name || n.id] as const));
    const lookup = new Map<string, { source: string; target: string }>();
    for (const e of topology.edges) {
      lookup.set(e.id, {
        source: nodeById.get(e.source.nodeId) ?? '',
        target: nodeById.get(e.target.nodeId) ?? '',
      });
    }
    return lookup;
  }, [topology.nodes, topology.edges]);

  const engine = useMemo(() => {
    return new DefragmentationEngine(
      () => topology.nodes,
      () => topology.edges,
      () => services
    );
  }, [topology, services]);

  const tracker = useMemo(() => {
    const provider = createStoreDataProvider(
      () => ({ nodes: topology.nodes, edges: topology.edges }),
      () => services
    );
    return new CapacityTracker(provider);
  }, [topology, services]);

  const handleAnalyze = useCallback(() => {
    setIsAnalyzing(true);
    setTimeout(() => {
      const result = engine.analyzeFragmentation();
      setAnalysis(result);
      setIsAnalyzing(false);
    }, 0);
  }, [engine]);

  // T059 — auto-refresh after a defrag apply. Skip the initial render so we
  // don't double-run on mount; only re-analyze if the user has already
  // produced an analysis to compare against.
  const lastDefragVersionRef = useRef(defragVersion);
  useEffect(() => {
    if (lastDefragVersionRef.current === defragVersion) return;
    lastDefragVersionRef.current = defragVersion;
    if (!analysis) return;
    setIsAutoRefreshing(true);
    setTimeout(() => {
      const result = engine.analyzeFragmentation();
      setAnalysis(result);
      setIsAutoRefreshing(false);
    }, 0);
  }, [defragVersion, engine, analysis]);

  const handleExportReport = useCallback(() => {
    if (!analysis) return;
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        averageFragmentation: analysis.averageFragmentation,
        worstFragmentation: analysis.worstFragmentation,
        totalEdges: analysis.totalEdges,
        fragmentedEdges: analysis.fragmentedEdges,
      },
      edges: analysis.edgeFragmentations.map((ef) => ({
        edgeId: ef.edgeId,
        edgeName: ef.edgeName,
        fragmentationIndex: ef.fragmentationIndex,
        usedChannels: ef.usedChannels,
        totalChannels: ef.totalChannels,
        freeChannels: ef.freeChannels,
        largestContiguousBlock: ef.largestContiguousBlock,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fragmentation-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analysis]);

  // Filter + sort edge fragmentations
  const sortedFragmentations = useMemo(() => {
    if (!analysis) return [];
    const q = filter.trim().toLowerCase();
    const filtered = analysis.edgeFragmentations.filter((ef) => {
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
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'fragmentation':
          cmp = a.fragmentationIndex - b.fragmentationIndex;
          break;
        case 'name':
          cmp = (a.edgeName || a.edgeId).localeCompare(b.edgeName || b.edgeId);
          break;
        case 'used':
          cmp = a.usedChannels - b.usedChannels;
          break;
        case 'free':
          cmp = a.freeChannels - b.freeChannels;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [analysis, sortField, sortDir, filter, fragmentedOnly, endpointLookup]);

  // Get lambda maps for spectrum heatmap
  const edgeLambdaMaps = useMemo(() => {
    if (!analysis) return new Map<string, ChannelState[]>();
    const maps = new Map<string, ChannelState[]>();
    for (const ef of analysis.edgeFragmentations) {
      const lambdaMap = tracker.getLambdaMap(ef.edgeId);
      maps.set(ef.edgeId, lambdaMapToChannels(lambdaMap));
    }
    return maps;
  }, [analysis, tracker]);

  const canAnalyze = topology.edges.length > 0;

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      {/* Top bar: Analyze + Action buttons */}
      <div className="flex items-center justify-between">
        <Button size="sm" onClick={handleAnalyze} disabled={!canAnalyze || isAnalyzing}>
          <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
          {isAnalyzing ? 'Analyzing...' : 'Analyze Fragmentation'}
        </Button>

        {analysis && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWizardOpen(true)}
              disabled={analysis.fragmentedEdges === 0}
            >
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              Start Defrag Wizard
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportReport}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export Report
            </Button>
          </div>
        )}
      </div>

      {/* Auto-refresh banner — shown briefly while we re-run analysis after a defrag apply */}
      {isAutoRefreshing && (
        <div
          data-testid="defrag-dashboard-refreshing-banner"
          className="border-accent/40 bg-accent/10 rounded-md border px-3 py-2 text-xs text-accent"
        >
          Refreshing analysis…
        </div>
      )}

      {/* Analysis Results */}
      {analysis && (
        <>
          {/* Gauge + Explanation + Stats */}
          <div className="grid grid-cols-12 gap-4">
            {/* Gauge */}
            <div className="col-span-3 flex min-h-[120px] items-center justify-center rounded-lg border border-border bg-elevated p-4">
              <FragmentationGauge
                value={analysis.averageFragmentation}
                label="Avg Fragmentation"
              />
            </div>

            {/* Explanation */}
            <div className="col-span-4 flex flex-col justify-center rounded-lg border border-border bg-elevated p-4">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                Spectrum Fragmentation
              </h3>
              <p className="text-xs leading-relaxed text-text-secondary">
                Fragmentation measures how scattered free spectrum is across each edge.
                A high fragmentation index means free channels are spread in small gaps,
                making it harder to allocate contiguous blocks for new services.
                Defragmentation consolidates free spectrum by moving existing allocations.
              </p>
              {analysis.fragmentedEdges > 0 && (
                <p className="mt-2 text-xs text-warning">
                  {analysis.fragmentedEdges} edge{analysis.fragmentedEdges !== 1 ? 's' : ''} exceed
                  the 30% fragmentation threshold and may benefit from defragmentation.
                </p>
              )}
            </div>

            {/* Stats - 4 health categories */}
            <div className="col-span-5 grid grid-cols-2 gap-3">
              {(() => {
                const health: HealthCounts = { critical: 0, warning: 0, healthy: 0, recoverable: 0 };
                for (const ef of analysis.edgeFragmentations) {
                  health[getEdgeHealth(ef.fragmentationIndex, ef.usedChannels)]++;
                }
                return (
                  <>
                    <StatCard
                      title="Critical"
                      value={health.critical}
                      subLabel="Frag > 70%"
                      progress={{
                        value: analysis.totalEdges > 0 ? (health.critical / analysis.totalEdges) * 100 : 0,
                        variant: 'danger',
                      }}
                    />
                    <StatCard
                      title="Warning"
                      value={health.warning}
                      subLabel="Frag 30-70%"
                      progress={{
                        value: analysis.totalEdges > 0 ? (health.warning / analysis.totalEdges) * 100 : 0,
                        variant: 'warning',
                      }}
                    />
                    <StatCard
                      title="Healthy"
                      value={health.healthy}
                      subLabel="Frag < 10% or unused"
                      progress={{
                        value: analysis.totalEdges > 0 ? (health.healthy / analysis.totalEdges) * 100 : 0,
                        variant: 'success',
                      }}
                    />
                    <StatCard
                      title="Recoverable"
                      value={health.recoverable}
                      subLabel="Frag 10-30%"
                      progress={{
                        value: analysis.totalEdges > 0 ? (health.recoverable / analysis.totalEdges) * 100 : 0,
                        variant: 'auto',
                      }}
                    />
                  </>
                );
              })()}
            </div>
          </div>

          {/* Fragmentation Table */}
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-elevated px-4 py-3">
              <h3 className="text-sm font-semibold text-text-primary">Per-Edge Fragmentation</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter edges..."
                  className="h-7 w-48 text-xs"
                  aria-label="Filter edges"
                  data-testid="defrag-dashboard-filter"
                />
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={fragmentedOnly}
                    onChange={(e) => setFragmentedOnly(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border accent-accent"
                  />
                  Fragmented only (&gt;0.5)
                </label>
                <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" />
                <Select
                  value={sortField}
                  onValueChange={(v) => {
                    setSortField(v as SortField);
                    setSortDir('desc');
                  }}
                >
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fragmentation">Fragmentation</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="used">Used Channels</SelectItem>
                    <SelectItem value="free">Free Channels</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-sticky bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                  <tr className="text-left text-text-secondary">
                    <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort('name')}>Edge</th>
                    <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort('used')}>Used/Total</th>
                    <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort('free')}>Free</th>
                    <th className="px-3 py-2">Largest Contiguous</th>
                    <th className="px-3 py-2">Fragments</th>
                    <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort('fragmentation')}>Fragmentation</th>
                    <th className="px-3 py-2">Health</th>
                    <th className="px-3 py-2">Spectrum</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFragmentations.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-text-muted">
                        No edges match the current filter.
                      </td>
                    </tr>
                  )}
                  {sortedFragmentations.map((ef) => {
                    const health = getEdgeHealth(ef.fragmentationIndex, ef.usedChannels);
                    const healthCfg = HEALTH_CONFIG[health];
                    const fragmentCount = countFreeFragments(ef.fragments);
                    return (
                      <tr key={ef.edgeId} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-text-primary">
                          {ef.edgeName || ef.edgeId.slice(0, 12)}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {ef.usedChannels}/{ef.totalChannels}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{ef.freeChannels}</td>
                        <td className="px-3 py-2 text-text-secondary">{ef.largestContiguousBlock}</td>
                        <td className="px-3 py-2 text-text-secondary">{fragmentCount}</td>
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
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                              healthCfg.bgColor,
                              healthCfg.color
                            )}
                          >
                            {healthCfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {edgeLambdaMaps.get(ef.edgeId) && (
                            <div className="min-w-[200px] flex-1">
                              <SpectrumGrid
                                channels={edgeLambdaMaps.get(ef.edgeId)!}
                                mode="linear"
                                compact
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Spectrum Legend */}
          <div className="flex flex-wrap gap-3 px-1">
            <LegendItem color="#ef4444" label="Allocated" />
            <LegendItem color="#f97316" label="Reserved" />
            <LegendItem color="#22c55e" label="Free" opacity={0.3} />
          </div>
        </>
      )}

      {/* Empty state */}
      {!analysis && !isAnalyzing && (
        <div className="flex h-32 items-center justify-center text-sm text-text-muted">
          {canAnalyze
            ? 'Click "Analyze Fragmentation" to assess spectrum usage.'
            : 'Add edges to the topology to analyze fragmentation.'}
        </div>
      )}

      {/* Defrag Wizard modal */}
      {analysis && (
        <DefragWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          edgeFragmentations={analysis.edgeFragmentations}
        />
      )}
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

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
