import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { LambdaAnalyzer } from '@/core/services/LambdaAnalyzer';
import type {
  LambdaAvailabilityReport,
  PathLambdaAnalysis,
  LambdaAvailabilityReportWithRegen,
  PathLambdaAnalysisWithRegen,
} from '@/core/services/LambdaAnalyzer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { Search, Route, AlertTriangle, Layers, RefreshCw, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { PathCard } from './lambda/PathCard';
import { PathSpectrumView } from './lambda/PathSpectrumView';

// ============================================================================
// COMPONENT
// ============================================================================

export const LambdaAvailabilityStudy: React.FC = () => {
  const topology = useNetworkStore((state) => state.topology);

  const [sourceNodeId, setSourceNodeId] = useState<string>('');
  const [destinationNodeId, setDestinationNodeId] = useState<string>('');
  const [report, setReport] = useState<LambdaAvailabilityReport | null>(null);
  const [regenReport, setRegenReport] = useState<LambdaAvailabilityReportWithRegen | null>(null);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Regeneration options
  const [considerRegen, setConsiderRegen] = useState(false);
  const [minContiguous, setMinContiguous] = useState(1);

  const analyzer = useMemo(() => {
    return new LambdaAnalyzer(
      () => topology.nodes,
      () => topology.edges,
    );
  }, [topology.nodes, topology.edges]);

  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of topology.nodes) {
      map.set(node.id, node.name || node.id.slice(0, 8));
    }
    return map;
  }, [topology.nodes]);

  const edgeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const edge of topology.edges) {
      map.set(edge.id, edge.name || edge.id.slice(0, 12));
    }
    return map;
  }, [topology.edges]);

  const getNodeName = useCallback(
    (nodeId: string) => nodeNameMap.get(nodeId) || nodeId.slice(0, 8),
    [nodeNameMap],
  );

  const handleAnalyze = useCallback(() => {
    if (!sourceNodeId || !destinationNodeId) return;

    setIsAnalyzing(true);
    try {
      if (considerRegen) {
        const result = analyzer.analyzeWithRegeneration(
          sourceNodeId,
          destinationNodeId,
          minContiguous,
        );
        setReport(result);
        setRegenReport(result);
      } else {
        const result = analyzer.analyzeE2EAvailability(sourceNodeId, destinationNodeId);
        setReport(result);
        setRegenReport(null);
      }
      setSelectedPathIndex(0);
    } finally {
      setIsAnalyzing(false);
    }
  }, [sourceNodeId, destinationNodeId, analyzer, considerRegen, minContiguous]);

  // Auto-re-trigger analysis when considerRegen is toggled and we already have results
  const hasRun = useRef(false);
  useEffect(() => {
    // Skip the initial mount
    if (!hasRun.current) {
      hasRun.current = true;
      return;
    }
    if (report && sourceNodeId && destinationNodeId && sourceNodeId !== destinationNodeId) {
      handleAnalyze();
    }
    // Only re-trigger when considerRegen changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [considerRegen]);

  const canAnalyze = sourceNodeId !== '' && destinationNodeId !== '' && sourceNodeId !== destinationNodeId;

  const bestPath = useMemo(() => {
    if (!report || report.paths.length === 0) return null;
    return report.paths.reduce((best, path) =>
      path.availableLambdaCount > best.availableLambdaCount ? path : best,
    );
  }, [report]);

  const selectedPath = useMemo(() => {
    if (report === null || selectedPathIndex === null) return null;
    return report.paths[selectedPathIndex] ?? null;
  }, [report, selectedPathIndex]);

  const selectedRegenPath = useMemo((): PathLambdaAnalysisWithRegen | null => {
    if (!regenReport || selectedPathIndex === null) return null;
    return regenReport.pathsWithRegen[selectedPathIndex] ?? null;
  }, [regenReport, selectedPathIndex]);

  const sourceOptions: ComboboxOption[] = useMemo(
    () =>
      topology.nodes.map((node) => ({
        value: node.id,
        label: node.name || node.id,
        description: node.type,
      })),
    [topology.nodes],
  );

  const destinationOptions: ComboboxOption[] = useMemo(
    () =>
      topology.nodes
        .filter((n) => n.id !== sourceNodeId)
        .map((node) => ({
          value: node.id,
          label: node.name || node.id,
          description: node.type,
        })),
    [topology.nodes, sourceNodeId],
  );

  const insufficientNodes = topology.nodes.length < 2;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      {/* Empty-state description (shown until analysis runs OR when topology has <2 nodes) */}
      {(!report || insufficientNodes) && (
        <div
          className="rounded-lg border border-border bg-elevated p-5 text-sm text-text-secondary"
          data-testid="lambda-study-empty-state"
        >
          <div className="mb-2 flex items-center gap-2 text-text-primary">
            <Layers className="h-4 w-4 text-accent" />
            <span className="font-semibold">Lambda Availability Study</span>
          </div>
          <p className="mb-3 text-xs text-text-tertiary">
            Enumerates candidate paths between two nodes and reports how many DWDM lambdas are
            available end-to-end. Surfaces bottleneck edges, per-edge spectrum, and (optionally)
            regeneration points that extend reach.
          </p>
          <ul className="mb-3 space-y-1 text-xs text-text-tertiary">
            <li><span className="font-medium text-text-secondary">Inputs:</span> source node, destination node, optional &quot;consider regeneration&quot; flag and minimum contiguous channel width.</li>
            <li><span className="font-medium text-text-secondary">Output:</span> ranked path list, best-path summary (lambdas, hops, distance, bottleneck), per-edge spectrum view, regeneration segments.</li>
          </ul>
          <p className="text-xs text-text-muted">
            Pick source and destination nodes below and click <span className="font-medium text-text-secondary">Analyze</span> to run.
          </p>
          {insufficientNodes && (
            <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
              At least 2 nodes are required for E2E lambda availability analysis.
            </p>
          )}
        </div>
      )}

      {/* Input Section */}
      <div className="rounded-md border border-border bg-elevated p-4">
        <div className="mb-3 text-sm font-medium text-text-primary">
          E2E Lambda Availability Analysis
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary">Source Node</label>
            <Combobox
              options={sourceOptions}
              value={sourceNodeId}
              onChange={setSourceNodeId}
              placeholder="Select source"
              searchPlaceholder="Search nodes..."
              emptyMessage="No nodes found."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary">Destination Node</label>
            <Combobox
              options={destinationOptions}
              value={destinationNodeId}
              onChange={setDestinationNodeId}
              placeholder="Select destination"
              searchPlaceholder="Search nodes..."
              emptyMessage="No nodes found."
            />
          </div>
        </div>

        {/* Regeneration options */}
        <div className="mt-3 flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex cursor-help items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={considerRegen}
                  onChange={(e) => setConsiderRegen(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                <RefreshCw className="h-3.5 w-3.5" />
                Consider regeneration
                <Info className="h-3 w-3 text-text-muted" />
              </label>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              Include intermediate nodes (routers, terminals) as optical regeneration
              points to extend reach beyond single-span limits
            </TooltipContent>
          </Tooltip>

          {considerRegen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <label className="flex cursor-help items-center gap-2 text-xs text-text-secondary">
                  Min contiguous:
                  <Input
                    type="number"
                    min={1}
                    max={96}
                    value={minContiguous}
                    onChange={(e) => setMinContiguous(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-7 w-16 text-xs"
                  />
                  <Info className="h-3 w-3 text-text-muted" />
                </label>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Minimum number of adjacent free channels required per segment
                for super-channel provisioning
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Regen no-improvement message */}
        {considerRegen && regenReport && bestPath && regenReport.maxE2ELambdasWithRegen <= bestPath.availableLambdaCount && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-tertiary px-3 py-1.5 text-xs text-text-muted">
            <Info className="h-3.5 w-3.5 shrink-0" />
            No regeneration benefit: path has no intermediate regen-capable nodes (router/terminal types),
            or regeneration does not improve lambda availability.
          </div>
        )}

        <div className="mt-4">
          <Button size="sm" onClick={handleAnalyze} disabled={!canAnalyze || isAnalyzing}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
        </div>
      </div>

      {/* Results */}
      {report && (
        <>
          {/* Best Path Summary Card */}
          {bestPath && (
            <div className="rounded-md border border-border bg-elevated p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Route className="h-4 w-4 text-accent" />
                Best Path Summary
                {regenReport && regenReport.maxE2ELambdasWithRegen > bestPath.availableLambdaCount && (
                  <span className="bg-success/10 ml-2 rounded px-2 py-0.5 text-xs font-normal text-success">
                    +{regenReport.maxE2ELambdasWithRegen - bestPath.availableLambdaCount} with regen
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-border bg-canvas p-3">
                  <div className="text-xs text-text-tertiary">E2E Lambdas</div>
                  <div
                    className={cn(
                      'text-lg font-semibold',
                      bestPath.availableLambdaCount >= 20 ? 'text-success' :
                        bestPath.availableLambdaCount >= 5 ? 'text-warning' : 'text-danger',
                    )}
                  >
                    {bestPath.availableLambdaCount}
                    {regenReport && regenReport.maxE2ELambdasWithRegen > bestPath.availableLambdaCount && (
                      <span className="ml-1 text-sm text-success">
                        ({regenReport.maxE2ELambdasWithRegen})
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-canvas p-3">
                  <div className="text-xs text-text-tertiary">Hops</div>
                  <div className="text-lg font-semibold text-text-primary">
                    {bestPath.hopCount}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-canvas p-3">
                  <div className="text-xs text-text-tertiary">Distance</div>
                  <div className="text-lg font-semibold text-text-primary">
                    {bestPath.totalDistance.toFixed(1)} km
                  </div>
                </div>
                <div className="rounded-md border border-border bg-canvas p-3">
                  <div className="text-xs text-text-tertiary">Bottleneck</div>
                  <div className="truncate text-sm font-medium text-text-primary">
                    {bestPath.bottleneckEdgeId
                      ? edgeNameMap.get(bestPath.bottleneckEdgeId) || bestPath.bottleneckEdgeId
                      : 'None'}
                  </div>
                  {bestPath.bottleneckEdgeId && (
                    <div className={cn(
                      'text-xs',
                      bestPath.bottleneckAvailableCount >= 20 ? 'text-success' :
                        bestPath.bottleneckAvailableCount >= 5 ? 'text-warning' : 'text-danger',
                    )}>
                      {bestPath.bottleneckAvailableCount} available
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* No Paths Found */}
          {report.paths.length === 0 && (
            <div className="rounded-md border border-border bg-elevated p-4 text-center">
              <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-warning" />
              <div className="text-sm font-medium text-text-primary">No Paths Found</div>
              <div className="text-xs text-text-tertiary">
                No path exists between {getNodeName(sourceNodeId)} and{' '}
                {getNodeName(destinationNodeId)}.
              </div>
            </div>
          )}

          {/* Path Cards - 3-column grid */}
          {report.paths.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-text-primary">
                Analyzed Paths ({report.paths.length})
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {report.paths.map((path: PathLambdaAnalysis) => (
                  <PathCard
                    key={path.pathIndex}
                    path={path}
                    isBest={bestPath !== null && path.pathIndex === bestPath.pathIndex}
                    isSelected={selectedPathIndex === path.pathIndex}
                    nodeNameMap={nodeNameMap}
                    edgeNameMap={edgeNameMap}
                    onClick={() => setSelectedPathIndex(path.pathIndex)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Spectrum Visualization for selected path */}
          {selectedPath && (
            <div className="rounded-lg border border-border">
              <div className="border-b border-border bg-elevated px-4 py-3">
                <h3 className="text-sm font-semibold text-text-primary">
                  Path {selectedPath.pathIndex + 1} - Spectrum View
                </h3>
                <p className="text-xs text-text-tertiary">
                  Per-edge channel availability with common E2E channels
                </p>
              </div>

              <div className="p-4">
                <PathSpectrumView
                  path={selectedPath}
                  edgeNameMap={edgeNameMap}
                />
              </div>
            </div>
          )}

          {/* Regeneration Info for selected path */}
          {selectedRegenPath && selectedRegenPath.regenerationPoints.length > 0 && (
            <div className="rounded-lg border border-border">
              <div className="border-b border-border bg-elevated px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <RefreshCw className="h-4 w-4 text-accent" />
                  Regeneration Analysis - Path {selectedRegenPath.pathIndex + 1}
                </h3>
                <p className="text-xs text-text-tertiary">
                  {selectedRegenPath.regenerationPoints.filter((rp) => rp.hasDWDMPortsAvailable).length} viable
                  regeneration point(s). E2E lambdas with regen: {selectedRegenPath.availableLambdasWithRegen}
                </p>
              </div>

              <div className="p-4">
                {/* Regeneration points */}
                <div className="mb-3">
                  <div className="mb-1 text-xs font-medium text-text-secondary">
                    Regeneration Points
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedRegenPath.regenerationPoints.map((rp) => (
                      <span
                        key={rp.nodeId}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
                          rp.hasDWDMPortsAvailable
                            ? 'border-success/30 bg-success/5 text-success'
                            : 'border-border bg-tertiary text-text-muted'
                        )}
                      >
                        <RefreshCw className="h-3 w-3" />
                        {getNodeName(rp.nodeId)}
                        <span className="text-[10px]">({rp.nodeType})</span>
                        {!rp.hasDWDMPortsAvailable && (
                          <span className="text-[10px] text-text-muted">no ports</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Segments */}
                {selectedRegenPath.segments.length > 1 && (
                  <div>
                    <div className="mb-1 text-xs font-medium text-text-secondary">
                      Segments
                    </div>
                    <div className="overflow-hidden rounded-md border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-canvas">
                            <th className="px-3 py-2 text-left font-medium text-text-secondary">Segment</th>
                            <th className="px-3 py-2 text-left font-medium text-text-secondary">Route</th>
                            <th className="px-3 py-2 text-right font-medium text-text-secondary">Edges</th>
                            <th className="px-3 py-2 text-right font-medium text-text-secondary">Available</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRegenPath.segments.map((seg, i) => (
                            <tr key={i} className="border-b border-border last:border-b-0">
                              <td className="px-3 py-2 text-text-primary">Seg {i + 1}</td>
                              <td className="px-3 py-2 text-text-secondary">
                                {getNodeName(seg.startNodeId)} &rarr; {getNodeName(seg.endNodeId)}
                              </td>
                              <td className="px-3 py-2 text-right text-text-secondary">
                                {seg.edgeIds.length}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={cn(
                                  'inline-flex items-center gap-1 font-semibold',
                                  seg.availableLambdas >= 20 ? 'text-success' :
                                    seg.availableLambdas >= 5 ? 'text-warning' : 'text-danger',
                                )}>
                                  <Layers className="h-3 w-3" />
                                  {seg.availableLambdas}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
