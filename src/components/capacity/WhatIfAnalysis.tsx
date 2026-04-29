import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { useNetworkStore } from '@/stores/networkStore';
import { useCapacityTracker } from '@/hooks/useCapacityTracker';
import { WhatIfPathComputer } from '@/core/services/WhatIfPathComputer';
import type { WhatIfServiceConfig, WhatIfPathResult } from '@/core/services/WhatIfPathComputer';
import type { WhatIfResult } from '@/core/services/CapacityTracker';
import { WhatIfConfig, type AnalysisAction } from './what-if/WhatIfConfig';
import { ComputedPathPanel } from './what-if/ComputedPathPanel';
import { WhatIfResults } from './what-if/WhatIfResults';
import {
  WhatIfHistory,
  type WhatIfHistoryEntry,
  WHATIF_HISTORY_MAX,
  createHistoryId,
} from './what-if/WhatIfHistory';

// ============================================================================
// HELPERS
// ============================================================================

function buildHistorySummary(
  action: AnalysisAction,
  configs: WhatIfServiceConfig[],
  selectedServiceId: string | undefined,
  nodeNameMap: Map<string, string>,
): string {
  if (action === 'remove' && selectedServiceId) {
    return `Remove ${selectedServiceId}`;
  }
  if (configs.length === 0) return 'No services configured';
  const first = configs[0];
  const srcName = nodeNameMap.get(first.sourceNodeId) || first.sourceNodeId.slice(0, 6);
  const dstName = nodeNameMap.get(first.destinationNodeId) || first.destinationNodeId.slice(0, 6);
  const typeBadge = first.serviceType === 'l1-dwdm' ? 'L1' : first.serviceType === 'l2-ethernet' ? 'L2' : 'L3';
  const suffix = configs.length > 1 ? ` (+${configs.length - 1} more)` : '';
  return `${typeBadge} ${first.dataRate} ${srcName} -> ${dstName}${suffix}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export interface WhatIfAnalysisProps {
  onSimulationActive?: (active: boolean) => void;
}

export const WhatIfAnalysis: React.FC<WhatIfAnalysisProps> = ({ onSimulationActive }) => {
  const topology = useNetworkStore((state) => state.topology);

  const tracker = useCapacityTracker();

  const [results, setResults] = useState<WhatIfResult[]>([]);
  const [pathResults, setPathResults] = useState<WhatIfPathResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<WhatIfHistoryEntry[]>([]);
  const [selectedAnalysisPath, setSelectedAnalysisPath] = useState<{
    pathResultIndex: number;
    unifiedIndex: number;
  } | null>(null);

  const pathComputer = useMemo(
    () =>
      new WhatIfPathComputer(
        () => topology.nodes,
        () => topology.edges
      ),
    [topology.nodes, topology.edges]
  );

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
      map.set(edge.id, edge.name || edge.id);
    }
    return map;
  }, [topology.edges]);

  const handleClear = useCallback(() => {
    setResults([]);
    setPathResults([]);
    setSelectedAnalysisPath(null);
  }, []);

  const addToHistory = useCallback(
    (action: AnalysisAction, configs: WhatIfServiceConfig[], selectedServiceId?: string) => {
      const entry: WhatIfHistoryEntry = {
        id: createHistoryId(),
        timestamp: new Date(),
        action,
        serviceCount: action === 'add' ? configs.length : 1,
        summary: buildHistorySummary(action, configs, selectedServiceId, nodeNameMap),
      };
      setHistory((prev) => {
        const next = [entry, ...prev];
        return next.slice(0, WHATIF_HISTORY_MAX);
      });
    },
    [nodeNameMap]
  );

  const handleAnalyze = useCallback(
    (configs: WhatIfServiceConfig[], action: AnalysisAction, selectedServiceId?: string) => {
      setIsAnalyzing(true);
      setSelectedAnalysisPath(null);
      try {
        if (action === 'add') {
          // T048 — cumulative batch sim is now a single core-service call.
          const { paths: computedPaths, simResults } = pathComputer.simulateBatch(
            configs,
            tracker
          );
          setPathResults(computedPaths);

          if (simResults.length === 0) {
            setResults([{
              feasible: false,
              reason: 'No path found',
              affectedEdges: [],
              networkUtilizationBefore: tracker.getNetworkUtilization(),
              networkUtilizationAfter: tracker.getNetworkUtilization(),
              networkUtilizationDelta: 0,
              summary: { fullNetworkNetChange: 0, edgesAffected: 0, newBottlenecks: 0 },
            }]);
          } else {
            setResults(simResults);
            setSelectedAnalysisPath({ pathResultIndex: 0, unifiedIndex: 0 });
          }
          addToHistory(action, configs);
        } else {
          // Remove mode: simulate removal of the selected service
          if (selectedServiceId) {
            const simResult = tracker.simulateServiceRemoval(selectedServiceId);
            setResults([simResult]);
            setPathResults([]);
            addToHistory(action, [], selectedServiceId);
          }
        }
      } finally {
        setIsAnalyzing(false);
      }
    },
    [pathComputer, tracker, addToHistory]
  );

  const handleHistoryRecall = useCallback(
    (_entry: WhatIfHistoryEntry) => {
      // History recall is informational only -- clear results to reset UI
      // A full recall would require storing configs per entry, which is
      // beyond the spec (session-only ephemeral display of past analyses)
      handleClear();
    },
    [handleClear]
  );

  const handleAnalyzeAlternative = useCallback(
    (pathResultIndex: number, unifiedIndex: number) => {
      const pr = pathResults[pathResultIndex];
      if (!pr) return;

      // Unified index: 0 = workingPath, >= 1 = alternativePaths[unifiedIndex - 1]
      const selectedPath =
        unifiedIndex === 0
          ? pr.workingPath
          : pr.alternativePaths?.[unifiedIndex - 1];
      if (!selectedPath) return;

      setSelectedAnalysisPath({ pathResultIndex, unifiedIndex });

      const virtualState = pathComputer.createVirtualState();
      const simResult = tracker.simulateServiceAdditionWithPath({
        workingPath: selectedPath,
        protectionPath: pr.protectionPath,
        channelsRequired: pathComputer.getChannelsRequired(pr.config),
        quantity: pr.config.quantity,
        virtualState,
      });
      setResults([simResult]);
    },
    [pathResults, pathComputer, tracker]
  );

  // Notify parent of simulation active state
  const hasResults = results.length > 0;
  useEffect(() => {
    onSimulationActive?.(hasResults);
  }, [hasResults, onSimulationActive]);

  const showEmptyState = !hasResults && history.length === 0 && !isAnalyzing;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      {/* Header with History */}
      {(history.length > 0 || hasResults) && (
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-text-primary">
            What-If Analysis
          </div>
          <WhatIfHistory entries={history} onRecall={handleHistoryRecall} />
        </div>
      )}

      {showEmptyState && (
        <div
          className="rounded-lg border border-border bg-elevated p-5 text-sm text-text-secondary"
          data-testid="what-if-empty-state"
        >
          <div className="mb-2 flex items-center gap-2 text-text-primary">
            <Activity className="h-4 w-4 text-accent" />
            <span className="font-semibold">What-If Analysis</span>
          </div>
          <p className="mb-3 text-xs text-text-tertiary">
            Simulate the impact of adding or removing services without committing changes.
            Computes paths, channel reservations, and projected utilization deltas against the current topology.
          </p>
          <ul className="mb-3 space-y-1 text-xs text-text-tertiary">
            <li><span className="font-medium text-text-secondary">Inputs:</span> action (Add or Remove), service type (L1/L2/L3), endpoints, data rate, optional batch entries.</li>
            <li><span className="font-medium text-text-secondary">Output:</span> feasibility per entry, working/protection paths, edge-by-edge before/after utilization, and aggregated network deltas.</li>
          </ul>
          <p className="text-xs text-text-muted">
            Configure parameters below and click <span className="font-medium text-text-secondary">Analyze</span> to run.
          </p>
        </div>
      )}

      <WhatIfConfig
        onAnalyze={handleAnalyze}
        onClear={handleClear}
        isAnalyzing={isAnalyzing}
      />

      {pathResults.length > 0 && (
        <ComputedPathPanel
          pathResults={pathResults}
          nodeNameMap={nodeNameMap}
          onAnalyzeAlternative={handleAnalyzeAlternative}
          selectedPathIndex={selectedAnalysisPath}
        />
      )}

      {results.length > 0 && (
        <WhatIfResults
          results={results}
          pathResults={pathResults}
          edgeNameMap={edgeNameMap}
          onClear={handleClear}
        />
      )}
    </div>
  );
};
