import React, { useState, useCallback } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useSimulationStore } from '@/stores/simulationStore';
import { FailureSimulator } from '@/core/simulation/FailureSimulator';
import { runExhaustiveSimulation } from '@/core/simulation/ExhaustiveRunner';
import { Button } from '@/components/ui/button';

const sectionClass = 'rounded border border-border bg-elevated/50 p-3';

export const SimulationTester: React.FC = () => {
  const [output, setOutput] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const topology = useNetworkStore((s) => s.topology);
  const services = useServiceStore((s) => s.services);
  const setResult = useSimulationStore((s) => s.setResult);
  const setExhaustiveResults = useSimulationStore((s) => s.setExhaustiveResults);
  const setExhaustiveProgress = useSimulationStore((s) => s.setExhaustiveProgress);
  const setExhaustiveRunning = useSimulationStore((s) => s.setExhaustiveRunning);
  const clearSimulation = useSimulationStore((s) => s.clearSimulation);
  const clearExhaustive = useSimulationStore((s) => s.clearExhaustive);

  const log = useCallback((msg: string) => {
    setOutput((prev) => [...prev.slice(-49), msg]);
  }, []);

  const handleRandomFailure = useCallback(() => {
    const edges = topology.edges;
    if (edges.length === 0) {
      log('ERROR: No edges in topology');
      return;
    }
    setLoading(true);
    const randomEdge = edges[Math.floor(Math.random() * edges.length)];
    log(`Simulating failure of edge: ${randomEdge.name || randomEdge.id}`);

    const simulator = new FailureSimulator(
      () => topology.nodes,
      () => topology.edges,
      () => services
    );
    const result = simulator.simulate([randomEdge.id], []);
    setResult(result);
    log(
      `Result: ${result.affectedServices.length} affected, ${result.survivedServices.length} survived, ${result.downServices.length} down, score=${result.survivabilityScore}%`
    );
    setLoading(false);
  }, [topology, services, setResult, log]);

  const handleQuickExhaustive = useCallback(() => {
    const edges = topology.edges;
    if (edges.length === 0) {
      log('ERROR: No edges in topology');
      return;
    }
    setLoading(true);
    setExhaustiveRunning(true);
    log(`Running quick exhaustive (1-edge failures, ${edges.length} scenarios)...`);

    const controller = new AbortController();
    abortRef.current = controller;

    runExhaustiveSimulation(
      { maxEdgeFailures: 1, maxNodeFailures: 0 },
      () => topology.nodes,
      () => topology.edges,
      () => services,
      {
        onProgress: (completed, total, label) => {
          setExhaustiveProgress({
            completed,
            total,
            currentLabel: label,
            startedAt: new Date().toISOString(),
          });
        },
        onComplete: (results) => {
          setExhaustiveResults(results);
          log(
            `Exhaustive complete: ${results.scenarios.length} scenarios, best=${results.bestScore}%, worst=${results.worstScore}%, avg=${results.avgScore}%`
          );
          setLoading(false);
        },
        onAbort: () => {
          log('Exhaustive simulation aborted');
          setExhaustiveRunning(false);
          setLoading(false);
        },
        onError: (error) => {
          log(`ERROR: ${error.message}`);
          setExhaustiveRunning(false);
          setLoading(false);
        },
      },
      controller.signal
    );
  }, [topology, services, setExhaustiveResults, setExhaustiveProgress, setExhaustiveRunning, log]);

  const handlePresetDualFailure = useCallback(() => {
    const edges = topology.edges;
    if (edges.length < 2) {
      log('ERROR: Need at least 2 edges for dual failure');
      return;
    }
    setLoading(true);
    const idx1 = Math.floor(Math.random() * edges.length);
    let idx2 = Math.floor(Math.random() * edges.length);
    while (idx2 === idx1) idx2 = Math.floor(Math.random() * edges.length);

    const edge1 = edges[idx1];
    const edge2 = edges[idx2];
    log(`Simulating dual failure: ${edge1.name || edge1.id} + ${edge2.name || edge2.id}`);

    const simulator = new FailureSimulator(
      () => topology.nodes,
      () => topology.edges,
      () => services
    );
    const result = simulator.simulate([edge1.id, edge2.id], []);
    setResult(result);
    log(
      `Result: ${result.affectedServices.length} affected, ${result.downServices.length} down, score=${result.survivabilityScore}%`
    );
    setLoading(false);
  }, [topology, services, setResult, log]);

  const handleClear = useCallback(() => {
    clearSimulation();
    clearExhaustive();
    log('Cleared all simulation state');
  }, [clearSimulation, clearExhaustive, log]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* Quick Actions */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Quick Simulation</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handleRandomFailure} disabled={loading}>
            Random Single Failure
          </Button>
          <Button size="sm" onClick={handlePresetDualFailure} disabled={loading}>
            Random Dual Failure
          </Button>
          <Button size="sm" onClick={handleQuickExhaustive} disabled={loading}>
            Quick Exhaustive (1-edge)
          </Button>
        </div>
        <div className="mt-2 text-xs text-text-muted">
          Edges: {topology.edges.length} | Services: {services.length}
        </div>
      </div>

      {/* Cleanup */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Cleanup</h3>
        <Button variant="destructive" size="sm" onClick={handleClear} disabled={loading}>
          Clear All Simulation State
        </Button>
      </div>

      {/* Output Log */}
      {output.length > 0 && (
        <div className={sectionClass}>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Output</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOutput([])}
            >
              Clear
            </Button>
          </div>
          <div className="max-h-40 overflow-y-auto font-mono text-xs text-text-secondary">
            {output.map((line, i) => (
              <div
                key={i}
                className={line.startsWith('ERROR') ? 'text-danger' : ''}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
