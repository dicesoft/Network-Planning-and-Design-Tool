import React, { useState, useCallback } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { SurvivabilityAnalyzer } from '@/core/simulation/SurvivabilityAnalyzer';
import type { SurvivabilityResult } from '@/types/simulation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Play, Shield } from 'lucide-react';

export const SurvivabilityReport: React.FC = () => {
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);
  const [result, setResult] = useState<SurvivabilityResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const getNodeName = useCallback(
    (nodeId: string) => topology.nodes.find((n) => n.id === nodeId)?.name || nodeId.slice(0, 8),
    [topology.nodes]
  );

  const handleRun = useCallback(() => {
    setIsRunning(true);
    setTimeout(() => {
      const analyzer = new SurvivabilityAnalyzer(
        () => topology.nodes,
        () => topology.edges,
        () => services
      );
      const res = analyzer.runSingleFailureAnalysis();
      setResult(res);
      setIsRunning(false);
    }, 0);
  }, [topology, services]);

  const canRun = topology.edges.length > 0 && services.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleRun} disabled={!canRun || isRunning}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {isRunning ? 'Analyzing...' : 'Run Survivability Analysis'}
        </Button>
        {!canRun && (
          <span className="text-xs text-text-muted">
            Requires at least one edge and one service.
          </span>
        )}
      </div>

      {result && (
        <>
          {/* Score */}
          <div className="flex items-center gap-4 rounded-lg border border-border bg-elevated p-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-current" style={{ color: result.overallScore >= 80 ? 'var(--color-success)' : result.overallScore >= 50 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
              <span className="text-2xl font-bold">{result.overallScore}%</span>
            </div>
            <div>
              <div className="text-lg font-semibold text-text-primary">
                Single Failure Survivability
              </div>
              <div className="text-sm text-text-secondary">
                {result.overallScore >= 80 ? 'Good' : result.overallScore >= 50 ? 'Fair' : 'Poor'} —{' '}
                {result.overallScore}% of affected services survive any single edge failure
              </div>
            </div>
            <Shield className={cn(
              'ml-auto h-8 w-8',
              result.overallScore >= 80 ? 'text-success' : result.overallScore >= 50 ? 'text-warning' : 'text-danger'
            )} />
          </div>

          {/* Per-edge breakdown */}
          {result.edgeResults.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="border-b border-border bg-elevated px-4 py-3">
                <h3 className="text-sm font-semibold text-text-primary">
                  Per-Edge Failure Impact
                </h3>
                <p className="text-xs text-text-tertiary">
                  Sorted by number of services lost
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-sticky bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                    <tr className="text-left text-text-secondary">
                      <th className="px-3 py-2">Edge</th>
                      <th className="px-3 py-2">Route</th>
                      <th className="px-3 py-2 text-right">Down</th>
                      <th className="px-3 py-2 text-right">Survived</th>
                      <th className="px-3 py-2 text-right">Affected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.edgeResults.map((er) => (
                      <tr key={er.edgeId} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-text-primary">
                          {er.edgeId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {getNodeName(er.sourceNodeId)} → {getNodeName(er.targetNodeId)}
                        </td>
                        <td className={cn('px-3 py-2 text-right font-medium', er.downServiceCount > 0 ? 'text-danger' : 'text-text-muted')}>
                          {er.downServiceCount}
                        </td>
                        <td className={cn('px-3 py-2 text-right font-medium', er.survivedServiceCount > 0 ? 'text-success' : 'text-text-muted')}>
                          {er.survivedServiceCount}
                        </td>
                        <td className="px-3 py-2 text-right text-text-secondary">
                          {er.affectedServiceIds.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
