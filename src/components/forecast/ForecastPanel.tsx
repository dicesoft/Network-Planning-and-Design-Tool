import React, { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { ForecastEngine } from '@/core/forecast/ForecastEngine';
import { ForecastConfig, type ForecastConfigState } from './ForecastConfig';
import { ForecastTable } from './ForecastTable';
import type { ForecastResult, ForecastType } from '@/types/forecast';
import {
  TrendingUp,
  AlertTriangle,
  Calendar,
  Layers,
} from 'lucide-react';

const ForecastChart = lazy(() =>
  import('./ForecastChart').then((m) => ({ default: m.ForecastChart })),
);

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

function defaultConfig(): ForecastConfigState {
  const now = new Date();
  const start = now.toISOString().slice(0, 10);
  const end = new Date(now.getFullYear() + 3, now.getMonth(), now.getDate())
    .toISOString().slice(0, 10);

  return {
    type: 'service',
    method: 'compound-growth',
    interval: 'quarterly',
    startDate: start,
    endDate: end,
    growthRate: 0.15,
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ForecastPanel: React.FC = () => {
  const [config, setConfig] = useState<ForecastConfigState>(defaultConfig);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);

  const engine = useMemo(() => {
    return new ForecastEngine({
      getNodes: () => topology.nodes,
      getEdges: () => topology.edges,
      getServices: () => services,
    });
  }, [topology.nodes, topology.edges, services]);

  const handleRun = useCallback(() => {
    setError(null);
    try {
      const forecastResult = engine.run(config.type, {
        method: config.method,
        period: {
          startDate: config.startDate,
          endDate: config.endDate,
          interval: config.interval,
        },
        growthRate: config.growthRate,
      });
      setResult(forecastResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forecast failed');
    }
  }, [engine, config]);

  return (
    <div className="flex h-full" data-testid="forecast-panel">
      {/* Left: Config sidebar */}
      <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-elevated p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-text-primary">Configuration</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Configure and run capacity forecasts
          </p>
        </div>

        <ForecastConfig
          config={config}
          onChange={setConfig}
          onRun={handleRun}
        />
      </div>

      {/* Right: Results area */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="border-danger/30 bg-danger/5 mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!result ? (
          <EmptyState />
        ) : (
          <ResultsDisplay result={result} type={config.type} />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// EMPTY STATE
// ============================================================================

const EmptyState: React.FC = () => (
  <div className="flex h-full items-center justify-center">
    <div className="text-center">
      <div className="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
        <TrendingUp className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-text-primary">
        No Forecast Generated
      </h3>
      <p className="mt-1 max-w-sm text-xs text-text-secondary">
        Configure the forecast parameters on the left and click &ldquo;Run Forecast&rdquo;
        to project future network capacity needs.
      </p>
    </div>
  </div>
);

// ============================================================================
// RESULTS DISPLAY
// ============================================================================

interface ResultsDisplayProps {
  result: ForecastResult;
  type: ForecastType;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result, type }) => {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {type === 'service' && 'Service Growth Forecast'}
            {type === 'node' && 'Node Capacity Forecast'}
            {type === 'lambda' && 'Lambda Utilization Forecast'}
          </h2>
          <div className="mt-1 flex items-center gap-3 text-xs text-text-tertiary">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(result.createdAt).toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {result.config.method}
            </span>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex gap-0.5 rounded-lg bg-tertiary p-1">
          <button
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              view === 'chart'
                ? 'bg-elevated text-text-primary shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
            onClick={() => setView('chart')}
          >
            Chart
          </button>
          <button
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              view === 'table'
                ? 'bg-elevated text-text-primary shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
            onClick={() => setView('table')}
          >
            Table
          </button>
        </div>
      </div>

      {/* Service Forecast */}
      {type === 'service' && result.serviceForecast && (
        <ServiceResults
          forecast={result.serviceForecast}
          view={view}
        />
      )}

      {/* Node Forecast */}
      {type === 'node' && result.nodeForecasts && (
        <NodeResults forecasts={result.nodeForecasts} view={view} />
      )}

      {/* Lambda Forecast */}
      {type === 'lambda' && result.lambdaForecasts && (
        <LambdaResults
          forecasts={result.lambdaForecasts}
          view={view}
        />
      )}
    </div>
  );
};

// ============================================================================
// SERVICE RESULTS
// ============================================================================

interface ServiceResultsProps {
  forecast: NonNullable<ForecastResult['serviceForecast']>;
  view: 'chart' | 'table';
}

const ServiceResults: React.FC<ServiceResultsProps> = ({ forecast, view }) => (
  <>
    {/* Summary stat */}
    <div className="flex gap-4">
      <StatCard
        label="Current Services"
        value={forecast.currentCount}
      />
      <StatCard
        label="Projected (End)"
        value={forecast.forecastPoints[forecast.forecastPoints.length - 1]?.value ?? 0}
      />
      <StatCard
        label="Growth"
        value={
          forecast.currentCount > 0
            ? `${Math.round(
                ((forecast.forecastPoints[forecast.forecastPoints.length - 1]?.value ?? 0) /
                  forecast.currentCount - 1) * 100,
              )}%`
            : 'N/A'
        }
      />
    </div>

    {view === 'chart' ? (
      <Suspense fallback={<ChartSkeleton />}>
        <ForecastChart
          title="Total Service Count"
          data={forecast.forecastPoints}
          yAxisLabel="Services"
        />
      </Suspense>
    ) : (
      <ForecastTable
        data={forecast.forecastPoints}
        startValue={forecast.currentCount}
        valueLabel="Services"
      />
    )}

    {/* Per-type breakdown */}
    {Object.entries(forecast.byType).length > 0 && (
      <div>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">
          Per-Type Breakdown
        </h3>
        <div className="grid gap-4 lg:grid-cols-3">
          {Object.entries(forecast.byType).map(([serviceType, points]) => {
            if (!points || points.length === 0) return null;
            const typeLabel =
              serviceType === 'l1-dwdm' ? 'L1 DWDM' :
              serviceType === 'l2-ethernet' ? 'L2 Ethernet' :
              'L3 IP';
            return (
              <div key={serviceType} className="rounded-lg border border-border bg-elevated p-4">
                <div className="mb-2 text-xs font-semibold text-text-secondary">
                  {typeLabel}
                </div>
                <div className="text-2xl font-bold text-text-primary">
                  {points[0].value}
                </div>
                <div className="mt-1 text-xs text-text-tertiary">
                  Projected: {points[points.length - 1].value}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
  </>
);

// ============================================================================
// NODE RESULTS
// ============================================================================

interface NodeResultsProps {
  forecasts: NonNullable<ForecastResult['nodeForecasts']>;
  view: 'chart' | 'table';
}

const NodeResults: React.FC<NodeResultsProps> = ({ forecasts, view }) => {
  const exhausting = forecasts.filter((n) => n.exhaustionDate);
  const highUtil = forecasts.filter((n) => n.currentUtilization >= 70);

  return (
    <>
      {/* Summary */}
      <div className="flex gap-4">
        <StatCard label="Total Nodes" value={forecasts.length} />
        <StatCard label="High Utilization" value={highUtil.length} variant="warning" />
        <StatCard label="Exhaustion Risk" value={exhausting.length} variant="danger" />
      </div>

      {/* Per-node list */}
      <div className="space-y-4">
        {forecasts.map((node) => (
          <div
            key={node.nodeId}
            className="rounded-lg border border-border bg-elevated p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-text-primary">{node.nodeName}</div>
                <div className="text-xs text-text-tertiary">
                  Current: {node.currentUtilization}%
                  {node.exhaustionDate && (
                    <span className="ml-2 text-danger">
                      Exhausts: {new Date(node.exhaustionDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <UtilizationBadge value={node.currentUtilization} />
            </div>

            {view === 'chart' ? (
              <Suspense fallback={<ChartSkeleton />}>
                <ForecastChart
                  title={`${node.nodeName} — Port Utilization`}
                  data={node.forecastPoints}
                  capacity={100}
                  yAxisLabel="Utilization %"
                />
              </Suspense>
            ) : (
              <ForecastTable
                data={node.forecastPoints}
                startValue={node.currentUtilization}
                valueLabel="Utilization %"
              />
            )}

            {node.recommendations.length > 0 && (
              <div className="mt-3 space-y-1">
                {node.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs text-warning"
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {rec}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {forecasts.length === 0 && (
          <div className="py-8 text-center text-sm text-text-tertiary">
            No nodes in the topology to forecast.
          </div>
        )}
      </div>
    </>
  );
};

// ============================================================================
// LAMBDA RESULTS
// ============================================================================

interface LambdaResultsProps {
  forecasts: NonNullable<ForecastResult['lambdaForecasts']>;
  view: 'chart' | 'table';
}

const LambdaResults: React.FC<LambdaResultsProps> = ({ forecasts, view }) => {
  const exhausting = forecasts.perSection.filter((s) => s.exhaustionDate);
  const topSections = [...forecasts.perSection]
    .sort((a, b) => (b.currentUsed / b.totalCapacity) - (a.currentUsed / a.totalCapacity))
    .slice(0, 10);

  return (
    <>
      {/* Summary */}
      <div className="flex gap-4">
        <StatCard label="Total Sections" value={forecasts.perSection.length} />
        <StatCard label="Exhaustion Risk" value={exhausting.length} variant="danger" />
      </div>

      {/* Top sections by utilization */}
      <div className="space-y-4">
        {topSections.map((section) => {
          const utilPct = section.totalCapacity > 0
            ? Math.round((section.currentUsed / section.totalCapacity) * 100)
            : 0;

          return (
            <div
              key={section.sectionId}
              className="rounded-lg border border-border bg-elevated p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-text-primary">
                    {section.sectionName}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {section.currentUsed} / {section.totalCapacity} channels ({utilPct}%)
                    {section.exhaustionDate && (
                      <span className="ml-2 text-danger">
                        Exhausts: {new Date(section.exhaustionDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <UtilizationBadge value={utilPct} />
              </div>

              {view === 'chart' ? (
                <Suspense fallback={<ChartSkeleton />}>
                  <ForecastChart
                    title={`${section.sectionName} — Lambda Usage`}
                    data={section.forecastPoints}
                    capacity={section.totalCapacity}
                    yAxisLabel="Channels"
                  />
                </Suspense>
              ) : (
                <ForecastTable
                  data={section.forecastPoints}
                  startValue={section.currentUsed}
                  valueLabel="Channels"
                />
              )}
            </div>
          );
        })}

        {forecasts.perSection.length === 0 && (
          <div className="py-8 text-center text-sm text-text-tertiary">
            No edges in the topology to forecast.
          </div>
        )}
      </div>
    </>
  );
};

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

interface StatCardProps {
  label: string;
  value: number | string;
  variant?: 'default' | 'warning' | 'danger';
}

const StatCard: React.FC<StatCardProps> = ({ label, value, variant = 'default' }) => (
  <div className="flex-1 rounded-lg border border-border bg-elevated p-4">
    <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
      {label}
    </div>
    <div className={cn(
      'mt-1 text-2xl font-bold',
      variant === 'danger' && 'text-danger',
      variant === 'warning' && 'text-warning',
      variant === 'default' && 'text-text-primary',
    )}>
      {value}
    </div>
  </div>
);

const UtilizationBadge: React.FC<{ value: number }> = ({ value }) => {
  const variant =
    value >= 80 ? 'danger' :
    value >= 50 ? 'warning' :
    'success';

  return (
    <span className={cn(
      'rounded-full px-2.5 py-1 text-xs font-medium',
      variant === 'danger' && 'bg-danger/10 text-danger',
      variant === 'warning' && 'bg-warning/10 text-warning',
      variant === 'success' && 'bg-success/10 text-success',
    )}>
      {value}%
    </span>
  );
};

const ChartSkeleton: React.FC = () => (
  <div className="bg-tertiary/30 flex h-panel items-center justify-center rounded-lg">
    <span className="text-xs text-text-tertiary">Loading chart...</span>
  </div>
);
