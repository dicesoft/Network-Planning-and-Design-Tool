import React, { useCallback, useMemo, useState } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useSimulationStore } from '@/stores/simulationStore';
import { isL1DWDMService, isL2L3Service } from '@/types/service';
import type { NetworkEdge } from '@/types/network';
import { FailureSimulator } from '@/core/simulation/FailureSimulator';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Play, RotateCcw, Zap, CircleOff, Search, Tag, Shuffle, Layers } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type EdgeViewMode = 'flat' | 'grouped';

export const SimulationPanel: React.FC = () => {
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);
  const getService = useServiceStore((state) => state.getService);
  const failedEdgeIds = useSimulationStore((state) => state.failedEdgeIds);
  const failedNodeIds = useSimulationStore((state) => state.failedNodeIds);
  const toggleEdgeFailure = useSimulationStore((state) => state.toggleEdgeFailure);
  const toggleNodeFailure = useSimulationStore((state) => state.toggleNodeFailure);
  const setResult = useSimulationStore((state) => state.setResult);
  const setFailedEdges = useSimulationStore((state) => state.setFailedEdges);
  const clearSimulation = useSimulationStore((state) => state.clearSimulation);
  const isRunning = useSimulationStore((state) => state.isRunning);
  const setRunning = useSimulationStore((state) => state.setRunning);

  const [edgeSearch, setEdgeSearch] = useState('');
  const [nodeSearch, setNodeSearch] = useState('');
  const [edgeViewMode, setEdgeViewMode] = useState<EdgeViewMode>('flat');

  const getNodeName = useCallback(
    (nodeId: string) => topology.nodes.find((n) => n.id === nodeId)?.name || nodeId.slice(0, 8),
    [topology.nodes]
  );

  // Count services per edge for Quick Test bias
  const edgeServiceCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const svc of services) {
      const edgeIds = new Set<string>();
      if (isL1DWDMService(svc)) {
        for (const eid of svc.workingPath.edgeIds) edgeIds.add(eid);
        if (svc.protectionPath) {
          for (const eid of svc.protectionPath.edgeIds) edgeIds.add(eid);
        }
      } else if (isL2L3Service(svc)) {
        const underlay = getService(svc.underlayServiceId);
        if (underlay && isL1DWDMService(underlay)) {
          for (const eid of underlay.workingPath.edgeIds) edgeIds.add(eid);
          if (underlay.protectionPath) {
            for (const eid of underlay.protectionPath.edgeIds) edgeIds.add(eid);
          }
        }
      }
      for (const eid of edgeIds) {
        counts.set(eid, (counts.get(eid) || 0) + 1);
      }
    }
    return counts;
  }, [services, getService]);

  // SRLG groups for grouped view
  const srlgGroups = useMemo(() => {
    const groups = new Map<string, NetworkEdge[]>();
    const ungrouped: NetworkEdge[] = [];
    for (const edge of topology.edges) {
      const codes = edge.properties.srlgCodes || [];
      if (codes.length === 0) {
        ungrouped.push(edge);
      } else {
        for (const code of codes) {
          const list = groups.get(code) || [];
          list.push(edge);
          groups.set(code, list);
        }
      }
    }
    return { groups, ungrouped };
  }, [topology.edges]);

  const filteredEdges = useMemo(() => {
    if (!edgeSearch.trim()) return topology.edges;
    const q = edgeSearch.toLowerCase();
    return topology.edges.filter((edge) => {
      const srcName = getNodeName(edge.source.nodeId).toLowerCase();
      const tgtName = getNodeName(edge.target.nodeId).toLowerCase();
      const edgeName = (edge.name || '').toLowerCase();
      const srlgCodes = (edge.properties.srlgCodes || []).join(' ').toLowerCase();
      return (
        srcName.includes(q) ||
        tgtName.includes(q) ||
        edgeName.includes(q) ||
        edge.id.toLowerCase().includes(q) ||
        srlgCodes.includes(q)
      );
    });
  }, [topology.edges, edgeSearch, getNodeName]);

  const filteredNodes = useMemo(() => {
    if (!nodeSearch.trim()) return topology.nodes;
    const q = nodeSearch.toLowerCase();
    return topology.nodes.filter((node) => {
      return (
        node.name.toLowerCase().includes(q) ||
        node.id.toLowerCase().includes(q) ||
        node.type.toLowerCase().includes(q)
      );
    });
  }, [topology.nodes, nodeSearch]);

  const handleRunSimulation = useCallback(() => {
    if (failedEdgeIds.length === 0 && failedNodeIds.length === 0) return;
    setRunning(true);

    setTimeout(() => {
      const simulator = new FailureSimulator(
        () => topology.nodes,
        () => topology.edges,
        () => services
      );
      const result = simulator.simulate(failedEdgeIds, failedNodeIds);
      setResult(result);
    }, 0);
  }, [failedEdgeIds, failedNodeIds, topology, services, setResult, setRunning]);

  // Quick Test: pick a high-impact edge biased by service count
  const handleQuickTest = useCallback(() => {
    if (topology.edges.length === 0) return;

    // Build weighted list: edges with more services get more weight
    const weights: { edgeId: string; weight: number }[] = topology.edges.map((e) => ({
      edgeId: e.id,
      weight: Math.max(1, edgeServiceCount.get(e.id) || 0),
    }));
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    const roll = Math.random() * totalWeight;

    let cumulative = 0;
    let selectedEdgeId = weights[0].edgeId;
    for (const w of weights) {
      cumulative += w.weight;
      if (cumulative >= roll) {
        selectedEdgeId = w.edgeId;
        break;
      }
    }

    setFailedEdges([selectedEdgeId]);

    // Auto-run simulation
    setRunning(true);
    setTimeout(() => {
      const simulator = new FailureSimulator(
        () => topology.nodes,
        () => topology.edges,
        () => services
      );
      const result = simulator.simulate([selectedEdgeId], []);
      setResult(result);
    }, 0);
  }, [topology, services, edgeServiceCount, setFailedEdges, setRunning, setResult]);

  // SRLG group toggle handler (Task 4.5)
  const handleSrlgGroupToggle = useCallback(
    (groupEdges: NetworkEdge[]) => {
      const groupEdgeIds = groupEdges.map((e) => e.id);
      const allFailed = groupEdgeIds.every((id) => failedEdgeIds.includes(id));

      if (allFailed) {
        // Un-fail all edges in group
        const newFailed = failedEdgeIds.filter((id) => !groupEdgeIds.includes(id));
        setFailedEdges(newFailed);
      } else {
        // Fail all edges in group
        const newFailed = [...new Set([...failedEdgeIds, ...groupEdgeIds])];
        setFailedEdges(newFailed);
      }
    },
    [failedEdgeIds, setFailedEdges]
  );

  const hasFailures = failedEdgeIds.length > 0 || failedNodeIds.length > 0;

  const renderEdgeButton = (edge: NetworkEdge) => {
    const isFailed = failedEdgeIds.includes(edge.id);
    const srlgCodes = edge.properties.srlgCodes || [];
    const svcCount = edgeServiceCount.get(edge.id) || 0;
    const sourceName = getNodeName(edge.source.nodeId);
    const targetName = getNodeName(edge.target.nodeId);
    const distanceKm = edge.properties.distance;
    const tooltipParts: string[] = [];
    if (edge.name) tooltipParts.push(edge.name);
    tooltipParts.push(`${sourceName} → ${targetName}`);
    if (typeof distanceKm === 'number' && distanceKm > 0) {
      tooltipParts.push(`${distanceKm.toFixed(1)} km`);
    }
    const tooltipText = tooltipParts.join(' · ');
    return (
      <Tooltip key={edge.id}>
        <TooltipTrigger asChild>
      <button
        onClick={() => toggleEdgeFailure(edge.id)}
        aria-label={tooltipText}
        className={cn(
          'flex w-full flex-col gap-1 border-b border-border px-4 py-2 text-left text-xs transition-colors last:border-0',
          isFailed
            ? 'bg-danger/10 text-danger'
            : 'text-text-secondary hover:bg-tertiary'
        )}
      >
        <div className="flex items-center gap-2">
          <Zap className={cn('h-3.5 w-3.5 shrink-0', isFailed ? 'text-danger' : 'text-text-muted')} />
          <span className="truncate font-medium">
            {getNodeName(edge.source.nodeId)} &rarr; {getNodeName(edge.target.nodeId)}
          </span>
          {edge.name && (
            <span className="truncate text-text-muted">({edge.name})</span>
          )}
          {svcCount > 0 && (
            <span className={cn(
              'shrink-0 rounded px-1 py-0.5 text-[10px] font-medium',
              isFailed ? 'bg-danger/20' : 'bg-tertiary text-text-muted'
            )}>
              {svcCount} svc
            </span>
          )}
          {isFailed && (
            <span className="ml-auto shrink-0 rounded bg-danger px-1.5 py-0.5 text-[10px] font-medium text-white">
              FAILED
            </span>
          )}
        </div>
        {srlgCodes.length > 0 && (
          <div className="ml-6 flex flex-wrap gap-1">
            {srlgCodes.map((code) => (
              <span
                key={code}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  isFailed
                    ? 'bg-danger/20 text-danger'
                    : 'bg-accent/10 text-accent'
                )}
              >
                <Tag className="h-2.5 w-2.5" />
                {code}
              </span>
            ))}
          </div>
        )}
      </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs text-xs">
          <div className="flex flex-col gap-0.5">
            {edge.name && <div className="font-medium">{edge.name}</div>}
            <div>{sourceName} → {targetName}</div>
            {typeof distanceKm === 'number' && distanceKm > 0 && (
              <div className="text-text-tertiary">{distanceKm.toFixed(1)} km</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleRunSimulation} disabled={!hasFailures || isRunning}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {isRunning ? 'Running...' : 'Run Simulation'}
        </Button>
        <Button variant="outline" size="sm" onClick={handleQuickTest} disabled={topology.edges.length === 0 || isRunning}>
          <Shuffle className="mr-1.5 h-3.5 w-3.5" />
          Quick Test
        </Button>
        <Button variant="outline" size="sm" onClick={clearSimulation} disabled={!hasFailures}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      {/* Edge failure toggles */}
      <div className="rounded-lg border border-border bg-elevated">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              Edge Failures
              {failedEdgeIds.length > 0 && (
                <span className="ml-2 text-xs font-normal text-danger">
                  ({failedEdgeIds.length} failed)
                </span>
              )}
            </h3>
            {/* View mode toggle */}
            <button
              onClick={() => setEdgeViewMode(edgeViewMode === 'flat' ? 'grouped' : 'flat')}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors',
                edgeViewMode === 'grouped'
                  ? 'bg-accent/10 text-accent'
                  : 'bg-tertiary text-text-muted hover:text-text-secondary'
              )}
              title={edgeViewMode === 'flat' ? 'Group by SRLG' : 'Show flat list'}
            >
              <Layers className="h-3 w-3" />
              {edgeViewMode === 'grouped' ? 'SRLG Groups' : 'Flat'}
            </button>
          </div>
          <p className="text-xs text-text-tertiary">Click edges to toggle failure state</p>
        </div>
        {/* Edge search */}
        <div className="border-b border-border px-3 py-2">
          <div className="bg-tertiary/50 flex items-center gap-2 rounded-md border border-border px-2 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder="Search edges..."
              value={edgeSearch}
              onChange={(e) => setEdgeSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {edgeViewMode === 'flat' ? (
            <>
              {filteredEdges.map(renderEdgeButton)}
              {filteredEdges.length === 0 && topology.edges.length > 0 && (
                <div className="px-4 py-3 text-xs text-text-muted">No edges match search</div>
              )}
            </>
          ) : (
            <>
              {/* Grouped by SRLG */}
              {Array.from(srlgGroups.groups.entries()).map(([code, edges]) => {
                const filtered = edgeSearch.trim()
                  ? edges.filter((e) => filteredEdges.some((fe) => fe.id === e.id))
                  : edges;
                if (filtered.length === 0) return null;
                const failedCount = filtered.filter((e) => failedEdgeIds.includes(e.id)).length;
                const allFailed = failedCount === filtered.length && failedCount > 0;
                const partialFailed = failedCount > 0 && !allFailed;
                return (
                  <div key={code}>
                    <div
                      role="button"
                      aria-label={`Toggle all edges in SRLG group ${code}`}
                      data-testid={`srlg-group-header-${code}`}
                      onClick={() => handleSrlgGroupToggle(filtered)}
                      className={cn(
                        'sticky top-0 z-[1] flex cursor-pointer items-center gap-1.5 border-b border-border px-4 py-1.5 transition-colors',
                        allFailed
                          ? 'bg-danger/10'
                          : partialFailed
                            ? 'bg-warning/10'
                            : 'bg-accent/5 hover:bg-accent/10'
                      )}
                    >
                      <Tag className={cn('h-3 w-3', allFailed ? 'text-danger' : partialFailed ? 'text-warning' : 'text-accent')} />
                      <span className={cn('text-[10px] font-semibold', allFailed ? 'text-danger' : partialFailed ? 'text-warning' : 'text-accent')}>
                        {code}
                      </span>
                      <span className={cn(
                        'rounded px-1 py-0.5 text-[9px] font-medium',
                        allFailed ? 'bg-danger/20 text-danger' : partialFailed ? 'bg-warning/20 text-warning' : 'bg-tertiary text-text-muted'
                      )}>
                        {failedCount}/{filtered.length} failed
                      </span>
                    </div>
                    {filtered.map(renderEdgeButton)}
                  </div>
                );
              })}
              {/* Ungrouped edges */}
              {(() => {
                const filtered = edgeSearch.trim()
                  ? srlgGroups.ungrouped.filter((e) => filteredEdges.some((fe) => fe.id === e.id))
                  : srlgGroups.ungrouped;
                if (filtered.length === 0) return null;
                return (
                  <div>
                    <div className="bg-tertiary/50 sticky top-0 z-[1] flex items-center gap-1.5 border-b border-border px-4 py-1.5">
                      <span className="text-[10px] font-semibold text-text-muted">No SRLG</span>
                      <span className="text-[10px] text-text-muted">({filtered.length} edges)</span>
                    </div>
                    {filtered.map(renderEdgeButton)}
                  </div>
                );
              })()}
              {filteredEdges.length === 0 && topology.edges.length > 0 && (
                <div className="px-4 py-3 text-xs text-text-muted">No edges match search</div>
              )}
            </>
          )}
          {topology.edges.length === 0 && (
            <div className="px-4 py-3 text-xs text-text-muted">No edges in topology</div>
          )}
        </div>
      </div>

      {/* Node failure toggles */}
      <div className="rounded-lg border border-border bg-elevated">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Node Failures
            {failedNodeIds.length > 0 && (
              <span className="ml-2 text-xs font-normal text-danger">
                ({failedNodeIds.length} failed)
              </span>
            )}
          </h3>
          <p className="text-xs text-text-tertiary">Click nodes to toggle failure state</p>
        </div>
        {/* Node search */}
        <div className="border-b border-border px-3 py-2">
          <div className="bg-tertiary/50 flex items-center gap-2 rounded-md border border-border px-2 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={nodeSearch}
              onChange={(e) => setNodeSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {filteredNodes.map((node) => {
            const isFailed = failedNodeIds.includes(node.id);
            return (
              <button
                key={node.id}
                onClick={() => toggleNodeFailure(node.id)}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-border px-4 py-2 text-left text-xs transition-colors last:border-0',
                  isFailed
                    ? 'bg-danger/10 text-danger'
                    : 'text-text-secondary hover:bg-tertiary'
                )}
              >
                <CircleOff className={cn('h-3.5 w-3.5 shrink-0', isFailed ? 'text-danger' : 'text-text-muted')} />
                <span className="truncate font-medium">{node.name}</span>
                <span className="text-text-muted">{node.type}</span>
                {isFailed && (
                  <span className="ml-auto rounded bg-danger px-1.5 py-0.5 text-[10px] font-medium text-white">
                    FAILED
                  </span>
                )}
              </button>
            );
          })}
          {filteredNodes.length === 0 && topology.nodes.length > 0 && (
            <div className="px-4 py-3 text-xs text-text-muted">No nodes match search</div>
          )}
          {topology.nodes.length === 0 && (
            <div className="px-4 py-3 text-xs text-text-muted">No nodes in topology</div>
          )}
        </div>
      </div>
    </div>
  );
};
