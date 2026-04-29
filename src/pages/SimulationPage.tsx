import React, { useState, useCallback } from 'react';
import { Header, StatusBar } from '@/components/layout';
import { SimulationPanel } from '@/components/simulation/SimulationPanel';
import { ImpactReport } from '@/components/simulation/ImpactReport';
import { NetworkHealthCheck } from '@/components/simulation/NetworkHealthCheck';
import { ScenarioBar } from '@/components/simulation/ScenarioBar';
import { ExhaustiveConfig } from '@/components/simulation/ExhaustiveConfig';
import { ExhaustiveProgress } from '@/components/simulation/ExhaustiveProgress';
import { ExhaustiveResults } from '@/components/simulation/ExhaustiveResults';
import { TopologySnapshot } from '@/components/simulation/TopologySnapshot';
import { useSimulationStore } from '@/stores/simulationStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { FailureSimulator } from '@/core/simulation/FailureSimulator';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cn } from '@/lib/utils';
import { RotateCcw, Download, Zap, Search } from 'lucide-react';

type SimTab = 'failure' | 'healthcheck' | 'exhaustive';

export const SimulationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SimTab>('failure');
  const failedEdgeIds = useSimulationStore((state) => state.failedEdgeIds);
  const failedNodeIds = useSimulationStore((state) => state.failedNodeIds);
  const lastResult = useSimulationStore((state) => state.lastResult);
  const setResult = useSimulationStore((state) => state.setResult);
  const setRunning = useSimulationStore((state) => state.setRunning);
  const isRunning = useSimulationStore((state) => state.isRunning);
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);

  const exhaustiveIsRunning = useSimulationStore((state) => state.exhaustiveIsRunning);
  const exhaustiveResults = useSimulationStore((state) => state.exhaustiveResults);

  const tabs: { id: SimTab; label: string }[] = [
    { id: 'failure', label: 'Fiber Cut Simulation' },
    { id: 'healthcheck', label: 'Network Health Check' },
    { id: 'exhaustive', label: 'Exhaustive Analysis' },
  ];

  const handleRerun = useCallback(() => {
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

  const handleExport = useCallback(() => {
    if (!lastResult) return;
    const json = JSON.stringify(lastResult, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation-report-${lastResult.id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [lastResult]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Header />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-elevated px-6 py-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold text-text-primary" data-testid="simulation-page">Simulation</h1>

            <nav className="flex shrink-0 gap-0.5 rounded-lg bg-tertiary p-1" role="tablist" aria-label="Simulation views">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-elevated text-text-primary shadow-sm'
                      : 'text-text-tertiary hover:text-text-secondary'
                  )}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Action buttons */}
          {activeTab === 'failure' && lastResult && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRerun}
                disabled={isRunning || (failedEdgeIds.length === 0 && failedNodeIds.length === 0)}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Re-run Simulation
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export Report
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {activeTab === 'failure' ? (
            <>
              {/* Left: controls */}
              <div className="w-80 shrink-0 overflow-y-auto border-r border-border bg-elevated p-4">
                <SimulationPanel />
              </div>
              {/* Right: results */}
              <div className="flex-1 overflow-y-auto p-6">
                {lastResult ? (
                  <div className="flex flex-col gap-4">
                    {/* Scenario bar */}
                    <ScenarioBar
                      failedEdgeIds={lastResult.failedEdges}
                      failedNodeIds={lastResult.failedNodes}
                      timestamp={lastResult.timestamp}
                    />
                    {/* Topology snapshot */}
                    <TopologySnapshot
                      failedEdgeIds={lastResult.failedEdges}
                      failedNodeIds={lastResult.failedNodes}
                    />
                    {/* Impact report */}
                    <ImpactReport />
                  </div>
                ) : (
                  <EmptyState
                    className="h-full"
                    icon={Zap}
                    title="No Simulation Results"
                    description="Run a fiber cut simulation to see impact analysis. Select edges or nodes to fail from the panel on the left, then click &quot;Run Simulation&quot;."
                  />
                )}
              </div>
            </>
          ) : activeTab === 'exhaustive' ? (
            <>
              {/* Left: config panel */}
              <div className="w-80 shrink-0 overflow-y-auto border-r border-border bg-elevated p-4">
                <ExhaustiveConfig />
                {exhaustiveIsRunning && (
                  <div className="mt-4">
                    <ExhaustiveProgress />
                  </div>
                )}
              </div>
              {/* Right: results */}
              <div className="flex-1 overflow-y-auto p-6">
                {exhaustiveResults ? (
                  <ExhaustiveResults />
                ) : exhaustiveIsRunning ? (
                  <LoadingSpinner
                    className="h-full"
                    size="lg"
                    label="Running exhaustive analysis..."
                  />
                ) : (
                  <EmptyState
                    className="h-full"
                    icon={Search}
                    title="No Exhaustive Results"
                    description="Configure failure parameters and run an exhaustive analysis to test all combinations of edge and node failures."
                  />
                )}
              </div>
            </>
          ) : (
            /* Health Check tab - full width, no side panel needed */
            <div className="flex-1 overflow-y-auto p-6">
              <NetworkHealthCheck />
            </div>
          )}
        </div>
      </div>

      <StatusBar />
    </div>
  );
};

export default SimulationPage;
