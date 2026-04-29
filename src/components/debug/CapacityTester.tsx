import React, { useState, useCallback } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { CapacityTracker } from '@/core/services/CapacityTracker';
import { Button } from '@/components/ui/button';

const sectionClass = 'rounded border border-border bg-elevated/50 p-3';

export const CapacityTester: React.FC = () => {
  const [output, setOutput] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const topology = useNetworkStore((s) => s.topology);
  const services = useServiceStore((s) => s.services);

  const log = useCallback((msg: string) => {
    setOutput((prev) => [...prev.slice(-49), msg]);
  }, []);

  const handleAnalyzeFragmentation = useCallback(() => {
    setLoading(true);
    try {
      const tracker = new CapacityTracker({
        getNode: (id: string) => topology.nodes.find((n) => n.id === id),
        getEdge: (id: string) => topology.edges.find((e) => e.id === id),
        getEdges: () => topology.edges,
        getNodes: () => topology.nodes,
        getServices: () => services,
      });

      const edgeUtils = tracker.getAllEdgeUtilization();
      const bottlenecks = tracker.findBottlenecks(80);

      log(`Edge utilization: ${edgeUtils.size} edges analyzed`);

      if (edgeUtils.size > 0) {
        const utilValues = Array.from(edgeUtils.values());
        const avgUtil =
          utilValues.reduce((sum, e) => sum + e.percentage, 0) / utilValues.length;
        log(`Average utilization: ${avgUtil.toFixed(1)}%`);
        const maxUtil = Math.max(...utilValues.map((e) => e.percentage));
        log(`Max utilization: ${maxUtil.toFixed(1)}%`);
      }

      if (bottlenecks.length > 0) {
        log(`Bottlenecks (>80%): ${bottlenecks.length} edges`);
        bottlenecks.slice(0, 5).forEach((b) => {
          log(`  ${b.edgeId}: ${b.utilization.percentage.toFixed(1)}% (${b.utilization.used}/${b.utilization.total})`);
        });
      } else {
        log('No bottlenecks found (>80% threshold)');
      }
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [topology, services, log]);

  const handleNetworkSummary = useCallback(() => {
    setLoading(true);
    try {
      log(`Network Summary:`);
      log(`  Nodes: ${topology.nodes.length}`);
      log(`  Edges: ${topology.edges.length}`);
      log(`  Services: ${services.length}`);

      const nodeTypes = topology.nodes.reduce<Record<string, number>>((acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
      }, {});
      log(`  Node types: ${Object.entries(nodeTypes).map(([t, c]) => `${t}=${c}`).join(', ')}`);

      const serviceTypes = services.reduce<Record<string, number>>((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      }, {});
      log(`  Service types: ${Object.entries(serviceTypes).map(([t, c]) => `${t}=${c}`).join(', ')}`);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [topology, services, log]);

  const handleEdgeChannelSummary = useCallback(() => {
    setLoading(true);
    try {
      let totalChannels = 0;
      let usedChannels = 0;

      for (const edge of topology.edges) {
        const sourceNode = topology.nodes.find((n) => n.id === edge.source.nodeId);
        const targetNode = topology.nodes.find((n) => n.id === edge.target.nodeId);
        if (!sourceNode || !targetNode) continue;

        const sourcePort = sourceNode.ports?.find((p) => p.id === edge.source.portId);
        if (sourcePort?.spectrum) {
          totalChannels += 96;
          usedChannels += sourcePort.spectrum.allocations.length;
        }
      }

      log(`Channel Summary:`);
      log(`  Total capacity: ${totalChannels} channels across ${topology.edges.length} edges`);
      log(`  Used: ${usedChannels} channels`);
      log(`  Overall utilization: ${totalChannels > 0 ? ((usedChannels / totalChannels) * 100).toFixed(1) : 0}%`);
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [topology, log]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* Analysis Actions */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Capacity Analysis</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handleAnalyzeFragmentation} disabled={loading}>
            Analyze Fragmentation
          </Button>
          <Button size="sm" onClick={handleEdgeChannelSummary} disabled={loading}>
            Channel Summary
          </Button>
          <Button size="sm" onClick={handleNetworkSummary} disabled={loading}>
            Network Summary
          </Button>
        </div>
        <div className="mt-2 text-xs text-text-muted">
          Edges: {topology.edges.length} | Services: {services.length}
        </div>
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
