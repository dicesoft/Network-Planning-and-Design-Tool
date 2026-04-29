import React, { useMemo } from 'react';
import type { EdgeUtilization, BottleneckEdge } from '@/core/services/CapacityTracker';
import type { NetworkEdge } from '@/types/network';
import { XOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface CapacityAlert {
  id: string;
  severity: 'critical' | 'warning';
  message: string;
  filterValue: string;
}

interface AlertsWarningsPanelProps {
  edgeUtilizations: EdgeUtilization[];
  bottlenecks: BottleneckEdge[];
  edges: NetworkEdge[];
  getNodeName: (nodeId: string) => string;
  onAlertClick?: (filterValue: string) => void;
}

export const AlertsWarningsPanel: React.FC<AlertsWarningsPanelProps> = ({
  edgeUtilizations,
  bottlenecks,
  edges,
  getNodeName,
  onAlertClick,
}) => {
  const alerts = useMemo(() => {
    const result: CapacityAlert[] = [];

    // Critical: edges at >= 90% utilization
    for (const eu of edgeUtilizations) {
      if (eu.percentage >= 90) {
        const edge = edges.find((e) => e.id === eu.edgeId);
        if (!edge) continue;
        const src = getNodeName(edge.source.nodeId);
        const tgt = getNodeName(edge.target.nodeId);
        const routeLabel = `${src} \u2192 ${tgt}`;

        if (eu.percentage >= 100) {
          result.push({
            id: `critical-${eu.edgeId}`,
            severity: 'critical',
            message: `${routeLabel} is fully subscribed. No channels available.`,
            filterValue: src,
          });
        } else {
          result.push({
            id: `critical-${eu.edgeId}`,
            severity: 'critical',
            message: `${routeLabel} is at ${eu.percentage}% utilization. Only ${eu.available} channels remaining.`,
            filterValue: src,
          });
        }
      }
    }

    // Warning: SRLG groups with multiple bottleneck edges
    const srlgIndex = new Map<string, string[]>();
    for (const edge of edges) {
      const codes = edge.properties.srlgCodes || [];
      for (const code of codes) {
        const list = srlgIndex.get(code) || [];
        list.push(edge.id);
        srlgIndex.set(code, list);
      }
    }

    const bottleneckIds = new Set(bottlenecks.map((b) => b.edgeId));
    for (const [srlgCode, edgeIds] of srlgIndex) {
      const bottleneckEdgesInSrlg = edgeIds.filter((id) => bottleneckIds.has(id));
      if (bottleneckEdgesInSrlg.length >= 2) {
        const edgeLabels = bottleneckEdgesInSrlg.map((id) => id.slice(0, 8)).join(', ');
        result.push({
          id: `warning-srlg-${srlgCode}`,
          severity: 'warning',
          message: `SRLG ${srlgCode} shares ${bottleneckEdgesInSrlg.length} bottleneck edges (${edgeLabels}). Single failure risk.`,
          filterValue: srlgCode,
        });
      }
    }

    // Sort: critical first, then warning
    result.sort((a, b) => {
      if (a.severity === b.severity) return 0;
      return a.severity === 'critical' ? -1 : 1;
    });

    return result;
  }, [edgeUtilizations, bottlenecks, edges, getNodeName]);

  return (
    <div className="rounded-lg border border-border bg-elevated">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">Alerts & Warnings</h3>
        {alerts.length > 0 && (
          <span className="bg-danger/10 rounded-full px-2 py-0.5 text-xs font-medium text-danger">
            {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto p-3">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
            <CheckCircle2 className="h-4 w-4 text-success" />
            No alerts. Network capacity is healthy.
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <button
                key={alert.id}
                className="flex w-full gap-2 rounded-md bg-canvas p-2 text-left text-sm transition-colors hover:bg-tertiary"
                onClick={() => onAlertClick?.(alert.filterValue)}
                title="Click to filter edge table"
              >
                {alert.severity === 'critical' ? (
                  <XOctagon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                )}
                <span className="text-text-secondary">{alert.message}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
