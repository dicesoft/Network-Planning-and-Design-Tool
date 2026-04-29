import React, { useMemo, useState } from 'react';
import { useSimulationStore } from '@/stores/simulationStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useNetworkStore } from '@/stores/networkStore';
import { isL1DWDMService, isL2L3Service } from '@/types/service';
import type { ServiceImpact } from '@/types/simulation';
import type { Service, ServiceType } from '@/types/service';
import { StatCard } from '@/components/capacity/StatCard';
import { BandwidthImpact } from './BandwidthImpact';
import { PathSequence } from '@/components/capacity/PathSequence';
import { ServiceTypeBadge } from '@/components/services/ServiceTypeBadge';
import {
  Shield,
  ShieldOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Activity,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

type SortField = 'status' | 'bandwidth' | 'serviceId';

interface EnrichedServiceImpact extends ServiceImpact {
  workingPathNodeLabels?: { id: string; label: string }[];
  protectionPathNodeLabels?: { id: string; label: string }[];
  parsedServiceType?: ServiceType;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Enrich ServiceImpact with path node info and SRLG notes from serviceStore.
 * This is done in the component layer per the plan.
 */
function enrichServiceImpacts(
  impacts: ServiceImpact[],
  getService: (id: string) => Service | undefined,
  getNodeName: (id: string) => string,
  failedEdgeIds: string[],
  edges: { id: string; properties: { srlgCodes?: string[] } }[]
): EnrichedServiceImpact[] {
  const failedEdgeSet = new Set(failedEdgeIds);
  const failedSrlgCodes = new Set<string>();

  // Collect SRLG codes from failed edges
  for (const edgeId of failedEdgeIds) {
    const edge = edges.find((e) => e.id === edgeId);
    if (edge?.properties.srlgCodes) {
      for (const code of edge.properties.srlgCodes) {
        failedSrlgCodes.add(code);
      }
    }
  }

  return impacts.map((impact) => {
    const service = getService(impact.serviceId);
    const enriched: EnrichedServiceImpact = { ...impact };

    if (service) {
      // Parse service type for badge
      enriched.parsedServiceType = service.type;

      if (isL1DWDMService(service)) {
        // Working path nodes
        enriched.workingPathNodes = service.workingPath.nodeIds;
        enriched.workingPathNodeLabels = service.workingPath.nodeIds.map((id) => ({
          id,
          label: getNodeName(id),
        }));

        // Protection path nodes
        if (service.protectionPath) {
          enriched.protectionPathNodes = service.protectionPath.nodeIds;
          enriched.protectionPathNodeLabels = service.protectionPath.nodeIds.map((id) => ({
            id,
            label: getNodeName(id),
          }));
        }

        // Failed edge IDs on this service's paths
        const serviceEdgeIds = [
          ...service.workingPath.edgeIds,
          ...(service.protectionPath?.edgeIds || []),
        ];
        enriched.failedEdgeIds = serviceEdgeIds.filter((eid) => failedEdgeSet.has(eid));

        // SRLG notes
        const srlgNotes: string[] = [];
        for (const edgeId of serviceEdgeIds) {
          const edge = edges.find((e) => e.id === edgeId);
          if (edge?.properties.srlgCodes) {
            for (const code of edge.properties.srlgCodes) {
              if (failedSrlgCodes.has(code) && !failedEdgeSet.has(edgeId)) {
                srlgNotes.push(`Edge ${edgeId.slice(0, 8)} shares SRLG "${code}" with failed edge`);
              }
            }
          }
        }
        if (srlgNotes.length > 0) {
          enriched.srlgNotes = srlgNotes;
        }
      } else if (isL2L3Service(service)) {
        // For L2/L3, resolve underlay paths
        const underlay = getService(service.underlayServiceId);
        if (underlay && isL1DWDMService(underlay)) {
          enriched.workingPathNodes = underlay.workingPath.nodeIds;
          enriched.workingPathNodeLabels = underlay.workingPath.nodeIds.map((id) => ({
            id,
            label: getNodeName(id),
          }));

          if (underlay.protectionPath) {
            enriched.protectionPathNodes = underlay.protectionPath.nodeIds;
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

function sortImpacts(impacts: EnrichedServiceImpact[], sortBy: SortField): EnrichedServiceImpact[] {
  return [...impacts].sort((a, b) => {
    switch (sortBy) {
      case 'status': {
        const statusOrder: Record<string, number> = { down: 0, 'temporary-outage': 1, degraded: 2, 'at-risk': 3, survived: 4 };
        return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
      }
      case 'bandwidth': {
        const bwA = parseInt(a.dataRate || '0', 10) || 0;
        const bwB = parseInt(b.dataRate || '0', 10) || 0;
        return bwB - bwA;
      }
      case 'serviceId':
        return a.serviceId.localeCompare(b.serviceId);
      default:
        return 0;
    }
  });
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const ServiceRow: React.FC<{
  svc: EnrichedServiceImpact;
  failedEdgeIds: string[];
}> = ({ svc, failedEdgeIds }) => {
  const [expanded, setExpanded] = useState(false);
  const hasSrlgNotes = svc.srlgNotes && svc.srlgNotes.length > 0;
  const failedEdgeSet = new Set(failedEdgeIds);

  return (
    <>
      <tr
        className={cn(
          'border-b border-border last:border-0 transition-colors',
          hasSrlgNotes && 'cursor-pointer hover:bg-tertiary/50'
        )}
        onClick={hasSrlgNotes ? () => setExpanded(!expanded) : undefined}
      >
        {/* Expand toggle */}
        <td className="w-6 px-2 py-2">
          {hasSrlgNotes ? (
            expanded ? (
              <ChevronDown className="h-3 w-3 text-text-muted" />
            ) : (
              <ChevronRight className="h-3 w-3 text-text-muted" />
            )
          ) : null}
        </td>
        {/* Service name + ID */}
        <td className="px-3 py-2">
          <div className="font-medium text-text-primary">
            {svc.serviceName || svc.serviceId}
          </div>
          <div className="font-mono text-[10px] text-text-muted">{svc.serviceId}</div>
        </td>
        {/* Type badge */}
        <td className="px-3 py-2">
          {svc.parsedServiceType ? (
            <ServiceTypeBadge type={svc.parsedServiceType} />
          ) : (
            <span className="text-text-secondary">{svc.serviceType}</span>
          )}
        </td>
        {/* Data rate */}
        <td className="px-3 py-2 text-text-secondary">{svc.dataRate || '-'}</td>
        {/* Working path */}
        <td className="px-3 py-2">
          {svc.workingPathNodeLabels && svc.workingPathNodeLabels.length > 0 ? (
            <PathSequenceWithFailures
              nodes={svc.workingPathNodeLabels}
              failedEdgeIds={svc.failedEdgeIds || []}
              allFailedEdgeIds={failedEdgeSet}
              compact
            />
          ) : (
            <span className="italic text-text-muted">-</span>
          )}
        </td>
        {/* Protection path */}
        <td className="px-3 py-2">
          {svc.protectionPathNodeLabels && svc.protectionPathNodeLabels.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <PathSequenceWithFailures
                nodes={svc.protectionPathNodeLabels}
                failedEdgeIds={svc.failedEdgeIds || []}
                allFailedEdgeIds={failedEdgeSet}
                compact
              />
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
        {/* Status */}
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
      {/* SRLG notes expandable sub-row */}
      {expanded && hasSrlgNotes && (
        <tr className="bg-tertiary/30 border-b border-border">
          <td colSpan={7} className="px-8 py-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase text-text-tertiary">
                SRLG Notes
              </span>
              {svc.srlgNotes!.map((note, i) => (
                <span key={i} className="text-xs text-warning">
                  {note}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

/**
 * PathSequence wrapper that marks edges with red X if failed.
 * Since PathSequence shows nodes, we add a small failed indicator between failed nodes.
 */
const PathSequenceWithFailures: React.FC<{
  nodes: { id: string; label: string }[];
  failedEdgeIds: string[];
  allFailedEdgeIds: Set<string>;
  compact?: boolean;
}> = ({ nodes, failedEdgeIds, compact }) => {
  if (failedEdgeIds.length === 0) {
    return <PathSequence nodes={nodes} compact={compact} />;
  }

  // Show normal PathSequence with a red indicator overlay
  return (
    <div className="flex items-center gap-1">
      <PathSequence nodes={nodes} compact={compact} />
      <span className="ml-1 flex items-center gap-0.5 text-danger">
        <XCircle className="h-3 w-3" />
        <span className="text-[10px]">{failedEdgeIds.length}</span>
      </span>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ImpactReport: React.FC = () => {
  const result = useSimulationStore((state) => state.lastResult);
  const getService = useServiceStore((state) => state.getService);
  const allServices = useServiceStore((state) => state.services);
  const topology = useNetworkStore((state) => state.topology);
  const [sortBy, setSortBy] = useState<SortField>('status');
  const [hideUnaffected, setHideUnaffected] = useState(false);

  const getNodeName = useMemo(() => {
    const nodeMap = new Map(topology.nodes.map((n) => [n.id, n.name]));
    return (id: string) => nodeMap.get(id) || id.slice(0, 8);
  }, [topology.nodes]);

  const enrichedServices = useMemo(() => {
    if (!result) return [];
    return enrichServiceImpacts(
      result.affectedServices,
      getService,
      getNodeName,
      result.failedEdges,
      topology.edges
    );
  }, [result, getService, getNodeName, topology.edges]);

  const sortedServices = useMemo(
    () => sortImpacts(enrichedServices, sortBy),
    [enrichedServices, sortBy]
  );

  const displayedServices = useMemo(() => {
    if (!hideUnaffected) return sortedServices;
    return sortedServices.filter((s) => s.status !== 'survived');
  }, [sortedServices, hideUnaffected]);

  const hiddenServiceCount = sortedServices.length - displayedServices.length;

  if (!result) {
    return null;
  }

  const totalAffected = result.affectedServices.length;
  const survivedCount = result.survivedServices.length;
  const downCount = result.downServices.length;
  const atRiskCount = result.affectedServices.filter((s) => s.status === 'at-risk').length;
  const tempOutageCount = result.affectedServices.filter((s) => s.status === 'temporary-outage').length;
  const survivedPct = totalAffected > 0 ? Math.round((survivedCount / totalAffected) * 100) : 100;
  const downPct = totalAffected > 0 ? Math.round((downCount / totalAffected) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary Cards with accent-top-borders + progress bars */}
      <div className={cn('grid gap-3', tempOutageCount > 0 ? 'grid-cols-5' : 'grid-cols-4')}>
        <StatCard
          title="Affected Services"
          value={totalAffected}
          subLabel={`${result.failedEdges.length} edges, ${result.failedNodes.length} nodes failed`}
          icon={<Activity className="h-5 w-5 text-warning" />}
          variant="accent-top"
          className="border-t-warning"
        />
        <StatCard
          title="Survived"
          value={survivedCount}
          subLabel={`${survivedPct}% of affected`}
          icon={<ShieldCheck className="h-5 w-5 text-success" />}
          variant="accent-top"
          className="border-t-success"
          progress={{ value: survivedPct, variant: 'success' }}
        />
        {tempOutageCount > 0 && (
          <StatCard
            title="Temp Outage"
            value={tempOutageCount}
            subLabel="Restored via WSON"
            icon={<Clock className="h-5 w-5 text-amber-500" />}
            variant="accent-top"
            className="border-t-amber-500"
          />
        )}
        <StatCard
          title="At Risk"
          value={atRiskCount}
          subLabel="Protection lost"
          icon={<ShieldQuestion className="h-5 w-5 text-blue-500" />}
          variant="accent-top"
          className="border-t-blue-500"
        />
        <StatCard
          title="Down"
          value={downCount}
          subLabel={`${downPct}% of affected`}
          icon={<ShieldAlert className="h-5 w-5 text-danger" />}
          variant="accent-top"
          className="border-t-danger"
          progress={{ value: downPct, variant: 'danger' }}
        />
      </div>

      {/* Bandwidth Impact panel */}
      <BandwidthImpact
        totalAffected={result.totalBandwidthAffected}
        totalSurvived={result.totalBandwidthSurvived}
        serviceCounts={{
          total: allServices.length,
          affected: totalAffected,
          survived: survivedCount,
          atRisk: atRiskCount,
          lost: downCount,
          temporaryOutage: tempOutageCount,
        }}
      />

      {/* Service Impact Table */}
      {totalAffected > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border bg-elevated px-4 py-2">
            <div className="flex items-center gap-4">
              <h3 className="text-xs font-semibold text-text-primary">
                Service-by-Service Impact ({totalAffected})
              </h3>
              <label className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={hideUnaffected}
                  onChange={(e) => setHideUnaffected(e.target.checked)}
                  className="accent-accent"
                />
                Hide survived services
              </label>
              {hideUnaffected && hiddenServiceCount > 0 && (
                <span className="text-[10px] text-text-tertiary">
                  ({hiddenServiceCount} hidden)
                </span>
              )}
            </div>
            {/* Sort dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="rounded border border-border bg-tertiary px-2 py-1 text-[10px] text-text-secondary outline-none"
            >
              <option value="status">Sort: Status</option>
              <option value="bandwidth">Sort: Bandwidth</option>
              <option value="serviceId">Sort: Service ID</option>
            </select>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-sticky border-b border-border bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                <tr className="text-left text-text-secondary">
                  <th className="w-6 px-2 py-2" />
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">Working Path</th>
                  <th className="px-3 py-2">Protection Path</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayedServices.map((svc) => (
                  <ServiceRow
                    key={svc.serviceId}
                    svc={svc}
                    failedEdgeIds={result.failedEdges}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalAffected === 0 && (
        <div className="border-success/30 bg-success/5 rounded-lg border p-4 text-center text-sm text-success">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6" />
          No services affected by this failure scenario.
        </div>
      )}
    </div>
  );
};
