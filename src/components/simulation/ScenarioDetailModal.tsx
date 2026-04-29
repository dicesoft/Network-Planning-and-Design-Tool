/**
 * ScenarioDetailModal - Full report modal for exhaustive analysis scenarios
 *
 * Renders ScenarioBar + TopologySnapshot + BandwidthImpact + service impact table
 * for a specific failure scenario. Runs FailureSimulator on-demand when opened.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { FailureSimulator } from '@/core/simulation/FailureSimulator';
import { ScenarioBar } from './ScenarioBar';
import { TopologySnapshot } from './TopologySnapshot';
import { BandwidthImpact } from './BandwidthImpact';
import type { SimulationResult, ServiceImpact } from '@/types/simulation';
import { isL1DWDMService, isL2L3Service } from '@/types/service';
import type { Service, ServiceType } from '@/types/service';
import { PathSequence } from '@/components/capacity/PathSequence';
import { ServiceTypeBadge } from '@/components/services/ServiceTypeBadge';
import {
  Shield,
  ShieldOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldQuestion,
  Loader2,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface ScenarioDetailModalProps {
  open: boolean;
  onClose: () => void;
  failedEdgeIds: string[];
  failedNodeIds: string[];
  scenarioId?: string;
}

interface EnrichedServiceImpact extends ServiceImpact {
  workingPathNodeLabels?: { id: string; label: string }[];
  protectionPathNodeLabels?: { id: string; label: string }[];
  parsedServiceType?: ServiceType;
}

// ============================================================================
// HELPERS
// ============================================================================

function enrichImpacts(
  impacts: ServiceImpact[],
  getService: (id: string) => Service | undefined,
  getNodeName: (id: string) => string,
  failedEdgeIds: string[],
): EnrichedServiceImpact[] {
  const failedEdgeSet = new Set(failedEdgeIds);

  return impacts.map((impact) => {
    const service = getService(impact.serviceId);
    const enriched: EnrichedServiceImpact = { ...impact };

    if (service) {
      enriched.parsedServiceType = service.type;

      if (isL1DWDMService(service)) {
        enriched.workingPathNodeLabels = service.workingPath.nodeIds.map((id) => ({
          id,
          label: getNodeName(id),
        }));
        if (service.protectionPath) {
          enriched.protectionPathNodeLabels = service.protectionPath.nodeIds.map((id) => ({
            id,
            label: getNodeName(id),
          }));
        }
        const serviceEdgeIds = [
          ...service.workingPath.edgeIds,
          ...(service.protectionPath?.edgeIds || []),
        ];
        enriched.failedEdgeIds = serviceEdgeIds.filter((eid) => failedEdgeSet.has(eid));
      } else if (isL2L3Service(service)) {
        const underlay = getService(service.underlayServiceId);
        if (underlay && isL1DWDMService(underlay)) {
          enriched.workingPathNodeLabels = underlay.workingPath.nodeIds.map((id) => ({
            id,
            label: getNodeName(id),
          }));
          if (underlay.protectionPath) {
            enriched.protectionPathNodeLabels = underlay.protectionPath.nodeIds.map((id) => ({
              id,
              label: getNodeName(id),
            }));
          }
          const serviceEdgeIds = [
            ...underlay.workingPath.edgeIds,
            ...(underlay.protectionPath?.edgeIds || []),
          ];
          enriched.failedEdgeIds = serviceEdgeIds.filter((eid) => failedEdgeSet.has(eid));
        }
      }
    }

    return enriched;
  });
}

// ============================================================================
// SERVICE ROW
// ============================================================================

const ModalServiceRow: React.FC<{
  svc: EnrichedServiceImpact;
  failedEdgeIds: string[];
}> = ({ svc }) => (
  <tr className="border-b border-border last:border-0">
    <td className="px-3 py-2">
      <div className="font-medium text-text-primary">
        {svc.serviceName || svc.serviceId}
      </div>
      <div className="font-mono text-[10px] text-text-muted">{svc.serviceId}</div>
    </td>
    <td className="px-3 py-2">
      {svc.parsedServiceType ? (
        <ServiceTypeBadge type={svc.parsedServiceType} />
      ) : (
        <span className="text-text-secondary">{svc.serviceType}</span>
      )}
    </td>
    <td className="px-3 py-2 text-text-secondary">{svc.dataRate || '-'}</td>
    <td className="px-3 py-2">
      {svc.workingPathNodeLabels && svc.workingPathNodeLabels.length > 0 ? (
        <div className="flex items-center gap-1">
          <PathSequence nodes={svc.workingPathNodeLabels} compact />
          {svc.failedEdgeIds && svc.failedEdgeIds.length > 0 && (
            <span className="ml-1 flex items-center gap-0.5 text-danger">
              <XCircle className="h-3 w-3" />
              <span className="text-[10px]">{svc.failedEdgeIds.length}</span>
            </span>
          )}
        </div>
      ) : (
        <span className="italic text-text-muted">-</span>
      )}
    </td>
    <td className="px-3 py-2">
      {svc.protectionPathNodeLabels && svc.protectionPathNodeLabels.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <PathSequence nodes={svc.protectionPathNodeLabels} compact />
          {svc.protectionActivated ? (
            <Shield className="h-3 w-3 shrink-0 text-success" />
          ) : (
            <ShieldOff className="h-3 w-3 shrink-0 text-danger" />
          )}
        </div>
      ) : svc.hasProtection ? (
        svc.protectionActivated ? (
          <span className="flex items-center gap-1 text-success">
            <Shield className="h-3 w-3" /> Active
          </span>
        ) : (
          <span className="flex items-center gap-1 text-danger">
            <ShieldOff className="h-3 w-3" /> Failed
          </span>
        )
      ) : (
        <span className="text-text-muted">None</span>
      )}
    </td>
    <td className="px-3 py-2">
      {svc.status === 'survived' && (
        <span className="flex items-center gap-1 text-success">
          <CheckCircle2 className="h-3 w-3" /> Survived
        </span>
      )}
      {svc.status === 'temporary-outage' && (
        <span className="flex items-center gap-1 text-amber-500">
          <Clock className="h-3 w-3" /> Restored (5 min)
        </span>
      )}
      {svc.status === 'at-risk' && (
        <span className="flex items-center gap-1 text-blue-500">
          <ShieldQuestion className="h-3 w-3" /> At Risk
        </span>
      )}
      {svc.status === 'degraded' && (
        <span className="flex items-center gap-1 text-warning">
          <AlertTriangle className="h-3 w-3" /> Degraded
        </span>
      )}
      {svc.status === 'down' && (
        <span className="flex items-center gap-1 text-danger">
          <XCircle className="h-3 w-3" /> Down
        </span>
      )}
    </td>
  </tr>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ScenarioDetailModal: React.FC<ScenarioDetailModalProps> = ({
  open,
  onClose,
  failedEdgeIds,
  failedNodeIds,
  scenarioId,
}) => {
  const topology = useNetworkStore((s) => s.topology);
  const services = useServiceStore((s) => s.services);
  const getService = useServiceStore((s) => s.getService);

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const getNodeName = useMemo(() => {
    const nodeMap = new Map(topology.nodes.map((n) => [n.id, n.name]));
    return (id: string) => nodeMap.get(id) || id.slice(0, 8);
  }, [topology.nodes]);

  // Run simulation when modal opens
  useEffect(() => {
    if (!open) {
      setResult(null);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      const simulator = new FailureSimulator(
        () => topology.nodes,
        () => topology.edges,
        () => services
      );
      const simResult = simulator.simulate(failedEdgeIds, failedNodeIds);
      setResult(simResult);
      setLoading(false);
    }, 0);

    return () => clearTimeout(timer);
  }, [open, failedEdgeIds, failedNodeIds, topology, services]);

  const enrichedServices = useMemo(() => {
    if (!result) return [];
    return enrichImpacts(
      result.affectedServices,
      getService,
      getNodeName,
      result.failedEdges,
    );
  }, [result, getService, getNodeName]);

  const sortedServices = useMemo(() => {
    const statusOrder: Record<string, number> = { down: 0, 'temporary-outage': 1, degraded: 2, 'at-risk': 3, survived: 4 };
    return [...enrichedServices].sort(
      (a, b) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
    );
  }, [enrichedServices]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) onClose();
    },
    [onClose]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {scenarioId ? `Scenario ${scenarioId} - Full Report` : 'Scenario Full Report'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 p-6 pt-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
              <span className="ml-2 text-sm text-text-secondary">Running simulation...</span>
            </div>
          )}

          {result && (
            <>
              {/* Scenario Bar */}
              <ScenarioBar
                failedEdgeIds={result.failedEdges}
                failedNodeIds={result.failedNodes}
                timestamp={result.timestamp}
              />

              {/* Topology Snapshot */}
              <TopologySnapshot
                failedEdgeIds={result.failedEdges}
                failedNodeIds={result.failedNodes}
              />

              {/* Bandwidth Impact */}
              <BandwidthImpact
                totalAffected={result.totalBandwidthAffected}
                totalSurvived={result.totalBandwidthSurvived}
                serviceCounts={{
                  total: services.length,
                  affected: result.affectedServices.length,
                  survived: result.survivedServices.length,
                  atRisk: result.affectedServices.filter((s) => s.status === 'at-risk').length,
                  temporaryOutage: result.affectedServices.filter((s) => s.status === 'temporary-outage').length,
                  lost: result.downServices.length,
                }}
              />

              {/* Survivability Score */}
              <div className="flex items-center gap-3 rounded-lg border border-border bg-elevated px-4 py-3">
                <span className="text-xs font-semibold text-text-secondary">Survivability Score:</span>
                <span
                  className={cn(
                    'text-lg font-bold',
                    result.survivabilityScore >= 80 && 'text-success',
                    result.survivabilityScore >= 50 && result.survivabilityScore < 80 && 'text-warning',
                    result.survivabilityScore < 50 && 'text-danger'
                  )}
                >
                  {result.survivabilityScore}%
                </span>
              </div>

              {/* Service Impact Table */}
              {result.affectedServices.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="border-b border-border bg-elevated px-4 py-2">
                    <h3 className="text-xs font-semibold text-text-primary">
                      Service Impact ({result.affectedServices.length} affected)
                    </h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-sticky bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                        <tr className="text-left text-text-secondary">
                          <th className="px-3 py-2">Service</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Rate</th>
                          <th className="px-3 py-2">Working Path</th>
                          <th className="px-3 py-2">Protection Path</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedServices.map((svc) => (
                          <ModalServiceRow
                            key={svc.serviceId}
                            svc={svc}
                            failedEdgeIds={result.failedEdges}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="border-success/30 bg-success/5 rounded-lg border p-4 text-center text-sm text-success">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6" />
                  No services affected by this failure scenario.
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
