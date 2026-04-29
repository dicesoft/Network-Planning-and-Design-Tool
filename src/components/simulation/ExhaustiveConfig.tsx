/**
 * ExhaustiveConfig - Configuration UI for Exhaustive Multi-Failure Simulation
 *
 * Controls: edge failure count (0-3), node failure count (0-2),
 * live scenario count estimation, "Run Exhaustive Analysis" button.
 * Warns if >10,000 scenarios.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useSimulationStore } from '@/stores/simulationStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  estimateScenarioCount,
  estimateTime,
  MAX_SCENARIOS,
  WARN_SCENARIOS,
} from '@/core/simulation/ExhaustiveSimulator';
import { runExhaustiveSimulation } from '@/core/simulation/ExhaustiveRunner';
import { useServiceStore } from '@/stores/serviceStore';
import { Play, Square, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ExhaustiveConfig: React.FC = () => {
  const config = useSimulationStore((s) => s.exhaustiveConfig);
  const setConfig = useSimulationStore((s) => s.setExhaustiveConfig);
  const isRunning = useSimulationStore((s) => s.exhaustiveIsRunning);
  const setRunning = useSimulationStore((s) => s.setExhaustiveRunning);
  const setProgress = useSimulationStore((s) => s.setExhaustiveProgress);
  const setResults = useSimulationStore((s) => s.setExhaustiveResults);
  const topology = useNetworkStore((s) => s.topology);
  const services = useServiceStore((s) => s.services);

  const simSettings = useSettingsStore((s) => s.settings.simulation);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize config from settings defaults on mount
  useEffect(() => {
    setConfig({
      maxEdgeFailures: simSettings.defaultMaxEdgeFailures ?? 1,
      maxNodeFailures: simSettings.defaultMaxNodeFailures ?? 0,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  const edgeCount = topology.edges.length;
  const nodeCount = topology.nodes.length;
  const serviceCount = services.length;

  const scenarioCount = useMemo(
    () => estimateScenarioCount(edgeCount, nodeCount, config),
    [edgeCount, nodeCount, config]
  );

  const timeEstimate = useMemo(() => estimateTime(scenarioCount), [scenarioCount]);

  const isOverCap = scenarioCount > MAX_SCENARIOS;
  const isWarning = scenarioCount > WARN_SCENARIOS && !isOverCap;
  const canRun = scenarioCount > 0 && !isOverCap && serviceCount > 0 && !isRunning;

  const handleRun = () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setRunning(true);
    setProgress({
      completed: 0,
      total: scenarioCount,
      currentLabel: 'Starting...',
      startedAt: new Date().toISOString(),
    });

    runExhaustiveSimulation(
      config,
      () => topology.nodes,
      () => topology.edges,
      () => services,
      {
        onProgress: (completed, total, currentLabel) => {
          setProgress({
            completed,
            total,
            currentLabel,
            startedAt: useSimulationStore.getState().exhaustiveProgress?.startedAt ?? new Date().toISOString(),
          });
        },
        onComplete: (results) => {
          setResults(results);
          setProgress(null);
          abortControllerRef.current = null;
        },
        onAbort: () => {
          setRunning(false);
          setProgress(null);
          abortControllerRef.current = null;
        },
        onError: (error) => {
          console.error('Exhaustive simulation error:', error);
          setRunning(false);
          setProgress(null);
          abortControllerRef.current = null;
        },
      },
      controller.signal
    );
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Exhaustive Analysis</h3>
        <p className="mt-1 text-xs text-text-tertiary">
          Test all combinations of edge and node failures to find worst-case scenarios.
        </p>
      </div>

      {/* Topology info */}
      <div className="flex gap-3">
        <div className="flex-1 rounded-md border border-border bg-tertiary p-2.5 text-center">
          <div className="text-lg font-semibold text-text-primary">{edgeCount}</div>
          <div className="text-[10px] text-text-tertiary">Edges</div>
        </div>
        <div className="flex-1 rounded-md border border-border bg-tertiary p-2.5 text-center">
          <div className="text-lg font-semibold text-text-primary">{nodeCount}</div>
          <div className="text-[10px] text-text-tertiary">Nodes</div>
        </div>
        <div className="flex-1 rounded-md border border-border bg-tertiary p-2.5 text-center">
          <div className="text-lg font-semibold text-text-primary">{serviceCount}</div>
          <div className="text-[10px] text-text-tertiary">Services</div>
        </div>
      </div>

      {/* Edge failure count */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-secondary">
          Max Edge Failures
        </label>
        <div className="flex gap-0.5 rounded-lg bg-tertiary p-1" role="radiogroup" aria-label="Max edge failures">
          {[0, 1, 2, 3].map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={config.maxEdgeFailures === value}
              disabled={isRunning}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                config.maxEdgeFailures === value
                  ? 'bg-elevated text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary',
                isRunning && 'pointer-events-none opacity-50',
              )}
              onClick={() => setConfig({ ...config, maxEdgeFailures: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {/* Node failure count */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-secondary">
          Max Node Failures
        </label>
        <div className="flex gap-0.5 rounded-lg bg-tertiary p-1" role="radiogroup" aria-label="Max node failures">
          {[0, 1, 2].map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={config.maxNodeFailures === value}
              disabled={isRunning}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                config.maxNodeFailures === value
                  ? 'bg-elevated text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary',
                isRunning && 'pointer-events-none opacity-50',
              )}
              onClick={() => setConfig({ ...config, maxNodeFailures: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {/* Scenario estimation */}
      <div
        className={cn(
          'rounded-md border p-3',
          isOverCap
            ? 'border-danger bg-danger/10'
            : isWarning
              ? 'border-warning bg-warning/10'
              : 'border-border bg-tertiary'
        )}
      >
        <div className="flex items-start gap-2">
          {(isOverCap || isWarning) && (
            <AlertTriangle
              className={cn(
                'mt-0.5 h-3.5 w-3.5 shrink-0',
                isOverCap ? 'text-danger' : 'text-warning'
              )}
            />
          )}
          {!isOverCap && !isWarning && (
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
          )}
          <div>
            <div className="text-sm font-semibold text-text-primary">
              {scenarioCount.toLocaleString()} scenarios
            </div>
            {scenarioCount > 0 && (
              <div className="text-xs text-text-tertiary">
                Estimated time: {timeEstimate}
              </div>
            )}
            {isOverCap && (
              <div className="mt-1 text-xs text-danger">
                Exceeds maximum of {MAX_SCENARIOS.toLocaleString()} scenarios. Reduce failure counts.
              </div>
            )}
            {isWarning && (
              <div className="mt-1 text-xs text-warning">
                Large number of scenarios. Simulation may take a while.
              </div>
            )}
            {serviceCount === 0 && (
              <div className="mt-1 text-xs text-text-muted">
                No services in topology. Add services to run analysis.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Run / Cancel button */}
      {isRunning ? (
        <Button variant="destructive" size="sm" onClick={handleCancel} className="w-full">
          <Square className="mr-1.5 h-3.5 w-3.5" />
          Cancel Simulation
        </Button>
      ) : (
        <Button
          variant="default"
          size="sm"
          onClick={handleRun}
          disabled={!canRun}
          className="w-full"
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Run Exhaustive Analysis
        </Button>
      )}
    </div>
  );
};

export default ExhaustiveConfig;
