import React, { useMemo, useState, useCallback, lazy, Suspense } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useCapacityTracker } from '@/hooks/useCapacityTracker';
import { cn } from '@/lib/utils';
import { pluralize } from '@/lib/pluralize';
import {
  Activity,
  BarChart3,
  AlertTriangle,
  XOctagon,
  Layers,
  TrendingUp,
  Download,
  FileSpreadsheet,
  FileJson,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatCard } from './StatCard';
import { EdgeUtilizationTable } from './EdgeUtilizationTable';
import { AlertsWarningsPanel } from './AlertsWarningsPanel';
import { QuickStatsPanel } from './QuickStatsPanel';
import { NodeCapacityTable } from './NodeCapacityTable';
import { ServiceUtilizationTable } from './ServiceUtilizationTable';
import {
  exportEdgeUtilizationCsv,
  exportEdgeUtilizationJson,
  exportNodeCapacityCsv,
  exportNodeCapacityJson,
  exportServiceUtilizationCsv,
  exportServiceUtilizationJson,
} from '@/lib/capacity-export-utils';

const UtilizationCharts = lazy(() =>
  import('./UtilizationCharts').then((m) => ({ default: m.UtilizationCharts })),
);

type DashboardView = 'edge' | 'node' | 'service';

interface CapacityDashboardProps {
  onEdgeClick?: (edgeId: string) => void;
}

function getUtilizationVariant(percent: number): 'success' | 'warning' | 'danger' {
  if (percent > 80) return 'danger';
  if (percent >= 50) return 'warning';
  return 'success';
}

export const CapacityDashboard: React.FC<CapacityDashboardProps> = ({ onEdgeClick }) => {
  const [dashboardView, setDashboardView] = useState<DashboardView>('edge');
  const [alertFilter, setAlertFilter] = useState<string | null>(null);
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);

  const tracker = useCapacityTracker();

  const edgeUtilizations = useMemo(() => {
    const utilMap = tracker.getAllEdgeUtilization();
    const entries = Array.from(utilMap.values());
    entries.sort((a, b) => b.percentage - a.percentage);
    return entries;
  }, [tracker]);

  const bottlenecks = useMemo(() => tracker.findBottlenecks(80), [tracker]);
  const oversubscribed = useMemo(() => tracker.getOversubscribedEdges(), [tracker]);

  const summary = useMemo(() => {
    let totalChannels = 0;
    let totalUsed = 0;
    let totalAvailable = 0;

    for (const eu of edgeUtilizations) {
      totalChannels += eu.total;
      totalUsed += eu.used;
      totalAvailable += eu.available;
    }

    const rawAvg = edgeUtilizations.length > 0
      ? edgeUtilizations.reduce((sum, eu) => sum + eu.percentage, 0) / edgeUtilizations.length
      : 0;
    const avgUtilization = Number.isFinite(rawAvg) ? Math.round(rawAvg) : 0;

    return { totalChannels, totalUsed, totalAvailable, avgUtilization };
  }, [edgeUtilizations]);

  const activeServiceCount = useMemo(
    () => services.filter((s) => s.status === 'active').length,
    [services],
  );
  const plannedServiceCount = useMemo(
    () => services.filter((s) => s.status === 'planned').length,
    [services],
  );
  const edgesAtZero = useMemo(
    () => edgeUtilizations.filter((eu) => eu.percentage === 0).length,
    [edgeUtilizations],
  );

  const getNodeName = useCallback((nodeId: string): string => {
    const node = topology.nodes.find((n) => n.id === nodeId);
    return node?.name || nodeId.slice(0, 8);
  }, [topology.nodes]);

  const getEdgeEndpoints = useCallback((edgeId: string): { source: string; target: string } | null => {
    const edge = topology.edges.find((e) => e.id === edgeId);
    if (!edge) return null;
    return {
      source: getNodeName(edge.source.nodeId),
      target: getNodeName(edge.target.nodeId),
    };
  }, [topology.edges, getNodeName]);

  const handleAlertClick = useCallback((filterValue: string) => {
    setAlertFilter(filterValue);
    setDashboardView('edge');
  }, []);

  const handleClearAlertFilter = useCallback(() => {
    setAlertFilter(null);
  }, []);

  const nodeUtilizations = useMemo(() => {
    const utilMap = tracker.getAllNodeUtilization();
    return Array.from(utilMap.values());
  }, [tracker]);

  const handleExport = useCallback(
    (format: 'csv' | 'json') => {
      if (dashboardView === 'edge') {
        if (format === 'csv') exportEdgeUtilizationCsv(edgeUtilizations, getEdgeEndpoints);
        else exportEdgeUtilizationJson(edgeUtilizations, getEdgeEndpoints);
      } else if (dashboardView === 'node') {
        if (format === 'csv') exportNodeCapacityCsv(nodeUtilizations, getNodeName);
        else exportNodeCapacityJson(nodeUtilizations, getNodeName);
      } else if (dashboardView === 'service') {
        if (format === 'csv') exportServiceUtilizationCsv(services, getNodeName);
        else exportServiceUtilizationJson(services, getNodeName);
      }
    },
    [dashboardView, edgeUtilizations, getEdgeEndpoints, nodeUtilizations, getNodeName, services],
  );

  if (topology.edges.length === 0 && topology.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        No topology data. Add nodes and edges to view capacity data.
      </div>
    );
  }

  const viewTabs: { id: DashboardView; label: string }[] = [
    { id: 'edge', label: 'Edge Utilization' },
    { id: 'node', label: 'Node Capacity' },
    { id: 'service', label: 'Service Utilization' },
  ];

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
      {/* Sub-tab toggle + export */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-0.5 rounded-lg bg-tertiary p-1">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                dashboardView === tab.id
                  ? 'bg-elevated text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary',
              )}
              onClick={() => setDashboardView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid="capacity-export-btn">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('csv')}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('json')}>
              <FileJson className="mr-2 h-4 w-4" />
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Summary Stats - Updated labels per 2.1 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Total Channels"
          value={summary.totalChannels.toLocaleString()}
          subLabel={`${edgeUtilizations.length} ${pluralize('edge', edgeUtilizations.length)}`}
          icon={<Layers className="h-5 w-5 text-accent" />}
        />
        <StatCard
          title="Used Channels"
          value={summary.totalUsed.toLocaleString()}
          subLabel={`across ${edgeUtilizations.filter((e) => e.used > 0).length} ${pluralize('edge', edgeUtilizations.filter((e) => e.used > 0).length)}`}
          icon={<BarChart3 className="h-5 w-5 text-info" />}
          progress={{
            value: summary.totalChannels > 0 ? Math.round((summary.totalUsed / summary.totalChannels) * 100) : 0,
            variant: 'auto',
          }}
        />
        <StatCard
          title="Available Channels"
          value={summary.totalAvailable.toLocaleString()}
          subLabel={`across ${edgeUtilizations.length} ${pluralize('edge', edgeUtilizations.length)}`}
          icon={<Activity className="h-5 w-5 text-success" />}
        />
        <StatCard
          title="Avg. Edge Utilization"
          value={`${summary.avgUtilization}%`}
          subLabel={`${edgeUtilizations.length} ${pluralize('edge', edgeUtilizations.length)} measured`}
          icon={<TrendingUp className={cn('h-5 w-5', `text-${getUtilizationVariant(summary.avgUtilization)}`)} />}
          progress={{
            value: summary.avgUtilization,
            variant: 'auto',
          }}
        />
        <StatCard
          title="Bottlenecks"
          value={bottlenecks.length}
          subLabel={bottlenecks.length > 0 ? `${bottlenecks.length} ${pluralize('edge', bottlenecks.length)} > 80%` : 'None'}
          icon={<AlertTriangle className={cn('h-5 w-5', bottlenecks.length > 0 ? 'text-warning' : 'text-text-muted')} />}
        />
        <StatCard
          title="Oversubscribed"
          value={oversubscribed.length}
          subLabel={oversubscribed.length > 0 ? `${oversubscribed.length} ${pluralize('edge', oversubscribed.length)} at 100%` : 'None'}
          icon={<XOctagon className={cn('h-5 w-5', oversubscribed.length > 0 ? 'text-danger' : 'text-text-muted')} />}
        />
      </div>

      {/* View content */}
      {dashboardView === 'edge' && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
          {/* Left: Edge table */}
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <EdgeUtilizationTable
              edgeUtilizations={edgeUtilizations}
              bottlenecks={bottlenecks}
              oversubscribed={oversubscribed}
              getEdgeEndpoints={getEdgeEndpoints}
              onEdgeClick={onEdgeClick}
              alertFilter={alertFilter}
              onClearAlertFilter={handleClearAlertFilter}
            />
          </div>

          {/* Right: Alerts + Charts + Quick Stats sidebar */}
          <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto lg:w-80">
            <AlertsWarningsPanel
              edgeUtilizations={edgeUtilizations}
              bottlenecks={bottlenecks}
              edges={topology.edges}
              getNodeName={getNodeName}
              onAlertClick={handleAlertClick}
            />
            <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-tertiary" />}>
              <UtilizationCharts
                edgeUtilizations={edgeUtilizations}
                getEdgeEndpoints={getEdgeEndpoints}
              />
            </Suspense>
            <QuickStatsPanel
              avgUtilization={summary.avgUtilization}
              activeServiceCount={activeServiceCount}
              plannedServiceCount={plannedServiceCount}
              edgesAbove80={bottlenecks.length}
              edgesAtZero={edgesAtZero}
            />
          </div>
        </div>
      )}

      {dashboardView === 'node' && (
        <NodeCapacityTable tracker={tracker} nodes={topology.nodes} />
      )}

      {dashboardView === 'service' && (
        <ServiceUtilizationTable getNodeName={getNodeName} />
      )}
    </div>
  );
};
