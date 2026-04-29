import React, { useMemo } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { CapacityTracker, createStoreDataProvider } from '@/core/services/CapacityTracker';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export const CapacityReport: React.FC = () => {
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);

  const tracker = useMemo(() => {
    const provider = createStoreDataProvider(() => topology, () => services);
    return new CapacityTracker(provider);
  }, [topology, services]);

  const getNodeName = (nodeId: string): string => {
    const node = topology.nodes.find((n) => n.id === nodeId);
    return node?.name || nodeId.slice(0, 8);
  };

  const getEdgeRoute = (edgeId: string): string => {
    const edge = topology.edges.find((e) => e.id === edgeId);
    if (!edge) return 'Unknown';
    return `${getNodeName(edge.source.nodeId)} -> ${getNodeName(edge.target.nodeId)}`;
  };

  const handleExportJSON = () => {
    const allEdgeUtil = tracker.getAllEdgeUtilization();
    const allNodeUtil = tracker.getAllNodeUtilization();
    const bottlenecks = tracker.findBottlenecks();
    const oversubscribed = tracker.getOversubscribedEdges();
    const networkUtil = tracker.getNetworkUtilization();

    const report = {
      generatedAt: new Date().toISOString(),
      network: {
        totalNodes: topology.nodes.length,
        totalEdges: topology.edges.length,
        totalServices: services.length,
        averageUtilizationPercent: networkUtil,
      },
      bottleneckEdges: bottlenecks.map((b) => ({
        edgeId: b.edgeId,
        edgeName: b.edgeName,
        route: getEdgeRoute(b.edgeId),
        utilization: b.utilization.percentage,
        used: b.utilization.used,
        total: b.utilization.total,
      })),
      oversubscribedEdges: oversubscribed.map((e) => ({
        edgeId: e.edgeId,
        route: getEdgeRoute(e.edgeId),
        utilization: e.utilization.percentage,
      })),
      edgeUtilization: Array.from(allEdgeUtil.values()).map((u) => ({
        edgeId: u.edgeId,
        route: getEdgeRoute(u.edgeId),
        used: u.used,
        total: u.total,
        available: u.available,
        percentage: u.percentage,
      })),
      nodeUtilization: Array.from(allNodeUtil.values()).map((u) => ({
        nodeId: u.nodeId,
        totalPorts: u.totalPorts,
        usedPorts: u.usedPorts,
        portUtilizationPercent: u.portUtilizationPercent,
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `capacity-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const allEdgeUtil = tracker.getAllEdgeUtilization();
    const rows = [['Edge ID', 'Route', 'Used', 'Total', 'Available', 'Utilization %']];
    for (const u of allEdgeUtil.values()) {
      const route = `"${getEdgeRoute(u.edgeId)}"`;
      rows.push([u.edgeId, route, String(u.used), String(u.total), String(u.available), String(u.percentage)]);
    }
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `capacity-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleExportJSON}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Export JSON
      </Button>
      <Button variant="outline" size="sm" onClick={handleExportCSV}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Export CSV
      </Button>
    </div>
  );
};
