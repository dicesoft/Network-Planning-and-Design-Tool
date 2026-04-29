import React, { useMemo, useState, useCallback } from 'react';
import { useServiceStore } from '@/stores/serviceStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
  isL1DWDMService,
  isL2L3Service,
  SERVICE_TYPE_CONFIGS,
  PROTECTION_SCHEME_CONFIGS,
  IP_PROTECTION_SCHEME_CONFIGS,
  L1_DATA_RATE_CONFIGS,
  MODULATION_TYPE_CONFIGS,
  WAVELENGTH_MODE_CONFIGS,
} from '@/types/service';
import { ServiceStatusBadge } from './ServiceStatusBadge';
import { ServiceTypeBadge } from './ServiceTypeBadge';
import { Button } from '@/components/ui/button';
import {
  X,
  Trash2,
  Play,
  Pause,
  AlertTriangle,
  ArrowRight,
  Shield,
  Radio,
  Route,
  AlertCircle,
  Activity,
  Pencil,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UnderlaySelector } from '@/core/services/UnderlaySelector';
import { pluralize } from '@/lib/pluralize';

/**
 * ServiceInspector - Right panel for viewing/editing service details
 * Follows the NodeInspector pattern with 320px width
 */
export const ServiceInspector: React.FC = () => {
  const inspector = useUIStore((state) => state.inspector);
  const closeInspector = useUIStore((state) => state.closeInspector);
  const inspectorMinimized = useUIStore((state) => state.inspectorMinimized);
  const setInspectorMinimized = useUIStore((state) => state.setInspectorMinimized);
  const openModal = useUIStore((state) => state.openModal);

  const service = useServiceStore((state) =>
    state.services.find((s) => s.id === inspector.targetId)
  );
  const getService = useServiceStore((state) => state.getService);
  const activateService = useServiceStore((state) => state.activateService);
  const deactivateService = useServiceStore((state) => state.deactivateService);
  const removeService = useServiceStore((state) => state.removeService);
  const openServiceInspector = useUIStore((state) => state.openServiceInspector);

  const getNode = useNetworkStore((state) => state.getNode);

  // All hooks must be called before any conditional return (Rules of Hooks)
  const utilization = useMemo(() => {
    if (!service || !isL1DWDMService(service)) return null;

    const serviceProvider = {
      getService: (id: string) => useServiceStore.getState().services.find((s) => s.id === id),
      getServices: () => useServiceStore.getState().services,
      getL1ServicesForEndpoints: useServiceStore.getState().getL1ServicesForEndpoints,
      findL1ServicesCoveringPath: useServiceStore.getState().findL1ServicesCoveringPath,
    };

    const topologyProvider = {
      getNode: (id: string) => useNetworkStore.getState().topology.nodes.find((n) => n.id === id),
      getEdge: (id: string) => useNetworkStore.getState().topology.edges.find((e) => e.id === id),
      getEdges: () => useNetworkStore.getState().topology.edges,
    };

    const selector = new UnderlaySelector(serviceProvider, topologyProvider);
    return selector.getUnderlayUtilization(service.id);
  }, [service]);

  const underlayService = useMemo(() => {
    if (!service || !isL2L3Service(service)) return null;
    const l2l3 = service as import('@/types/service').L2L3Service;
    if (!l2l3.underlayServiceId) return null;
    return getService(l2l3.underlayServiceId);
  }, [service, getService]);

  const protectionUnderlayService = useMemo(() => {
    if (!service || !isL2L3Service(service)) return null;
    const l2l3 = service as import('@/types/service').L2L3Service;
    if (!l2l3.protectionUnderlayServiceId) return null;
    return getService(l2l3.protectionUnderlayServiceId);
  }, [service, getService]);

  const canActivate = useMemo(() => {
    if (!service) return false;
    if (!isL2L3Service(service)) return true;
    if (!underlayService) return false;
    return underlayService.status === 'active';
  }, [service, underlayService]);

  const addToast = useUIStore((state) => state.addToast);

  const [showBlockingAlert, setShowBlockingAlert] = useState(false);
  const [blockingAlertDetails, setBlockingAlertDetails] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const getDependentServices = useServiceStore((state) => state.getDependentServices);

  const handleDeleteClick = useCallback(() => {
    if (!service) return;
    if (isL1DWDMService(service)) {
      const dependents = getDependentServices(service.id);
      if (dependents.length > 0) {
        setBlockingAlertDetails(dependents.map((d) => `${d.id} (${d.name})`));
        setShowBlockingAlert(true);
        return;
      }
    }
    setShowDeleteConfirm(true);
  }, [service, getDependentServices]);

  const handleDeleteConfirm = useCallback(() => {
    if (!service) return;
    const result = removeService(service.id);
    if (result.success) {
      closeInspector();
      addToast({
        type: 'success',
        title: 'Service Deleted',
        message: `${service.name || service.id} has been deleted`,
        duration: 3000,
      });
    } else {
      const blockerList = result.blockers?.join(', ') || 'Unknown blockers';
      addToast({
        type: 'error',
        title: 'Cannot Delete Service',
        message: `Service has dependent services: ${blockerList}`,
        duration: 7000,
      });
    }
  }, [service, removeService, closeInspector, addToast]);

  if (!service || inspector.type !== 'service') {
    return null;
  }

  const sourceNode = getNode(service.sourceNodeId);
  const destNode = getNode(service.destinationNodeId);
  const typeConfig = SERVICE_TYPE_CONFIGS[service.type];

  const handleActivate = () => {
    const result = activateService(service.id);
    if (!result.success) {
      addToast({
        type: 'error',
        title: 'Cannot Activate Service',
        message: result.error || 'Unknown error occurred',
        duration: 5000,
      });
    }
  };

  const handleDeactivate = () => {
    deactivateService(service.id);
  };

  const handleEdit = () => {
    openModal('service-wizard', { mode: 'edit', serviceId: service.id });
  };

  return (
    <aside
      className={cn(
        'flex w-inspector shrink-0 flex-col overflow-hidden border-l border-border bg-elevated shadow-lg',
        inspectorMinimized && 'self-start'
      )}
      data-testid="service-inspector"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white"
            style={{ backgroundColor: typeConfig.color }}
          >
            {typeConfig.shortLabel}
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">
              Service Properties
            </div>
            <div className="text-xs text-text-tertiary">{service.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setInspectorMinimized(!inspectorMinimized)}
            aria-label={inspectorMinimized ? 'Expand inspector' : 'Minimize inspector'}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary text-text-tertiary transition-colors hover:bg-border hover:text-text-primary"
          >
            {inspectorMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={closeInspector}
            aria-label="Close inspector"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary text-text-tertiary transition-colors hover:bg-border hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!inspectorMinimized && (<>
      {/* Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {/* Status Section */}
        <div className="border-b border-border p-5">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Status
          </div>
          <div className="mb-4 flex items-center justify-between">
            <ServiceStatusBadge status={service.status} size="md" />
            <div className="flex gap-2">
              {service.status !== 'active' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleActivate}
                  disabled={!canActivate}
                  title={!canActivate ? 'L1 underlay must be active first' : undefined}
                >
                  <Play className="mr-1 h-4 w-4" />
                  Activate
                </Button>
              )}
              {service.status === 'active' && (
                <Button variant="ghost" size="sm" onClick={handleDeactivate}>
                  <Pause className="mr-1 h-4 w-4" />
                  Deactivate
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-tertiary">Created:</span>
              <div className="text-text-secondary">
                {new Date(service.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div>
              <span className="text-text-tertiary">Modified:</span>
              <div className="text-text-secondary">
                {new Date(service.modifiedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* General Section */}
        <div className="border-b border-border p-5">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            General
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-tertiary">Name</label>
              <div className="text-sm font-medium text-text-primary">{service.name}</div>
            </div>
            <div>
              <label className="text-xs text-text-tertiary">Type</label>
              <div className="mt-1 flex items-center gap-2">
                <ServiceTypeBadge type={service.type} showLabel size="md" />
              </div>
            </div>
            <div>
              <label className="text-xs text-text-tertiary">Data Rate</label>
              <div className="text-sm text-text-primary">
                {L1_DATA_RATE_CONFIGS[service.dataRate].label}
              </div>
            </div>
          </div>
        </div>

        {/* Endpoints Section */}
        <div className="border-b border-border p-5">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Endpoints
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-tertiary p-3">
            <div className="flex-1 text-center">
              <div className="mb-1 text-xs text-text-tertiary">Source</div>
              <div className="truncate text-sm font-medium text-text-primary">
                {sourceNode?.name || 'Unknown'}
              </div>
              {service.sourcePortId && (
                <div className="mt-0.5 text-xs text-text-muted">
                  Port: {service.sourcePortId.slice(0, 8)}...
                </div>
              )}
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-text-muted" />
            <div className="flex-1 text-center">
              <div className="mb-1 text-xs text-text-tertiary">Destination</div>
              <div className="truncate text-sm font-medium text-text-primary">
                {destNode?.name || 'Unknown'}
              </div>
              {service.destinationPortId && (
                <div className="mt-0.5 text-xs text-text-muted">
                  Port: {service.destinationPortId.slice(0, 8)}...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* L1-Specific: Path & Optical Parameters */}
        {isL1DWDMService(service) && (
          <>
            {/* Optical Parameters */}
            <div className="border-b border-border p-5">
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                <Radio className="mr-1 inline h-3 w-3" />
                Optical Parameters
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Modulation</span>
                  <span className="text-text-primary">
                    {MODULATION_TYPE_CONFIGS[service.modulationType].label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Channel Width</span>
                  <span className="text-text-primary">{service.channelWidth}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Wavelength Mode</span>
                  <span className="text-text-primary">
                    {WAVELENGTH_MODE_CONFIGS[service.wavelengthMode].label}
                  </span>
                </div>
                {(() => {
                  // Channel numbers in the service are stored as user-friendly format (1-96)
                  const channelNum = service.channelNumber ?? service.workingPath?.channelNumber;
                  return channelNum !== undefined && channelNum !== null ? (
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Channel</span>
                      <span className="font-mono text-text-primary">
                        CH-{channelNum}
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Working Path */}
            <div className="border-b border-border p-5">
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                <Route className="mr-1 inline h-3 w-3" />
                Working Path
              </div>
              <PathDisplay path={service.workingPath} getNode={getNode} />
            </div>

            {/* Protection Path */}
            {service.protectionPath && (
              <div className="border-b border-border p-5">
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  <Shield className="h-3 w-3 text-success" />
                  Protection Path
                </div>
                <PathDisplay path={service.protectionPath} getNode={getNode} />
              </div>
            )}

            {/* SRLG Risk Analysis */}
            {service.srlgAnalysis && service.srlgAnalysis.riskScore > 0 && (
              <div className="border-b border-border p-5">
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  <AlertTriangle className="h-3 w-3 text-warning" />
                  SRLG Risk Analysis
                </div>
                <SRLGRiskDisplay analysis={service.srlgAnalysis} />
              </div>
            )}

            {/* Protection Scheme */}
            <div className="border-b border-border p-5">
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Protection
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Scheme</span>
                  <span className="text-text-primary">
                    {PROTECTION_SCHEME_CONFIGS[service.protectionScheme].label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Restoration</span>
                  <span className="text-text-primary">
                    {service.restorationEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>

            {/* Capacity Utilization */}
            <div className="border-b border-border p-5">
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                <Activity className="mr-1 inline h-3 w-3" />
                Capacity Utilization
              </div>
              {utilization ? (
                <div className="space-y-3">
                  {/* Utilization Bar */}
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-text-tertiary">Usage</span>
                      <span className={cn(
                        "font-medium",
                        utilization.utilizationPercent > 80 ? "text-error" :
                        utilization.utilizationPercent > 50 ? "text-warning" :
                        "text-success"
                      )}>
                        {Math.round(utilization.utilizationPercent)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-tertiary">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          utilization.utilizationPercent > 80 ? "bg-error" :
                          utilization.utilizationPercent > 50 ? "bg-warning" :
                          "bg-success"
                        )}
                        style={{ width: `${Math.min(100, utilization.utilizationPercent)}%` }}
                      />
                    </div>
                  </div>

                  {/* Capacity Details */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Total Capacity</span>
                      <span className="text-text-primary">{utilization.totalCapacityGbps} Gbps</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Used</span>
                      <span className="text-text-primary">{utilization.usedCapacityGbps} Gbps</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Available</span>
                      <span className="text-success">{utilization.availableCapacityGbps} Gbps</span>
                    </div>
                  </div>

                  {/* Overlay Services */}
                  {utilization.usedBy.length > 0 && (
                    <div className="border-t border-border pt-2">
                      <div className="mb-2 text-xs text-text-tertiary">
                        Overlay Services ({utilization.usedBy.length})
                      </div>
                      <div className="space-y-1">
                        {utilization.usedBy.map((serviceId) => (
                          <div key={serviceId} className="rounded bg-tertiary px-2 py-1 font-mono text-xs text-text-secondary">
                            {serviceId}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm italic text-text-muted">
                  No overlay services using this underlay
                </div>
              )}
            </div>
          </>
        )}

        {/* L2/L3-Specific: Underlay Reference */}
        {isL2L3Service(service) && (
          <>
            {/* Underlay Reference */}
            <div className="border-b border-border p-5">
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                L1 Underlay
              </div>
              <div
                className="hover:bg-tertiary/80 cursor-pointer rounded-lg bg-tertiary p-3 transition-colors"
                onClick={() => underlayService && openServiceInspector(underlayService.id)}
                title={underlayService ? 'Click to view underlay service' : undefined}
              >
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm text-text-primary">
                    {service.underlayServiceId}
                  </div>
                  {underlayService && (
                    <ServiceStatusBadge status={underlayService.status} size="sm" />
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-text-muted">
                    {service.underlayAutoCreated ? 'Auto-created' : 'Manually assigned'}
                  </span>
                  {underlayService && (
                    <span className="text-xs text-text-muted">
                      {underlayService.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Warning when underlay is not active */}
              {underlayService && underlayService.status !== 'active' && service.status !== 'active' && (
                <div className="mt-2 flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    L1 underlay is &quot;{underlayService.status}&quot;. Activate the L1 service first before activating this service.
                  </span>
                </div>
              )}

              {!underlayService && service.underlayServiceId && (
                <div className="mt-2 flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    L1 underlay service not found. The underlay may have been deleted.
                  </span>
                </div>
              )}

              {service.protectionUnderlayServiceId && (
                <div
                  className="hover:bg-tertiary/80 mt-2 cursor-pointer rounded-lg bg-tertiary p-3 transition-colors"
                  onClick={() => protectionUnderlayService && openServiceInspector(protectionUnderlayService.id)}
                  title={protectionUnderlayService ? 'Click to view protection underlay service' : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3 w-3 text-success" />
                      <span className="text-xs text-text-tertiary">Protection Underlay</span>
                    </div>
                    {protectionUnderlayService && (
                      <ServiceStatusBadge status={protectionUnderlayService.status} size="sm" />
                    )}
                  </div>
                  <div className="mt-1 font-mono text-sm text-text-primary">
                    {service.protectionUnderlayServiceId}
                  </div>
                </div>
              )}
            </div>

            {/* IP Protection */}
            <div className="border-b border-border p-5">
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Protection
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Scheme</span>
                  <span className="text-text-primary">
                    {IP_PROTECTION_SCHEME_CONFIGS[service.protectionScheme].label}
                  </span>
                </div>
                {service.bfdConfig.enabled && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">BFD</span>
                      <span className="text-success">Enabled</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">BFD Interval</span>
                      <span className="text-text-primary">
                        {service.bfdConfig.minTxInterval / 1000}ms
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex shrink-0 gap-3 border-t border-border p-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleEdit}
          className="flex-1"
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDeleteClick}
          className="flex-1"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
      </>)}

      {/* Blocking Alert - L1 service has dependents */}
      <AlertDialog
        open={showBlockingAlert}
        onOpenChange={setShowBlockingAlert}
        title="Cannot Delete L1 Service"
        description={`This L1 service is used by ${blockingAlertDetails.length} overlay ${pluralize('service', blockingAlertDetails.length)}. Delete the overlay services first, then delete this L1 service.`}
        details={blockingAlertDetails}
        variant="error"
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Service?"
        description={`Are you sure you want to delete "${service.name || service.id}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </aside>
  );
};

// ============================================================================
// Helper Components
// ============================================================================

interface PathDisplayProps {
  path: {
    nodeIds: string[];
    edgeIds: string[];
    totalDistance: number;
    hopCount: number;
    status: string;
  };
  getNode: (id: string) => { name: string } | undefined;
}

const PathDisplay: React.FC<PathDisplayProps> = ({ path, getNode }) => {
  return (
    <div className="space-y-3">
      {/* Path Stats */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-tertiary p-2 text-center">
          <div className="text-text-tertiary">Hops</div>
          <div className="font-semibold text-text-primary">{path.hopCount}</div>
        </div>
        <div className="rounded bg-tertiary p-2 text-center">
          <div className="text-text-tertiary">Distance</div>
          <div className="font-semibold text-text-primary">{path.totalDistance} km</div>
        </div>
        <div className="rounded bg-tertiary p-2 text-center">
          <div className="text-text-tertiary">Status</div>
          <div
            className={cn(
              'font-semibold capitalize',
              path.status === 'active' && 'text-success',
              path.status === 'computed' && 'text-info',
              path.status === 'failed' && 'text-danger'
            )}
          >
            {path.status}
          </div>
        </div>
      </div>

      {/* Path Nodes */}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {path.nodeIds.map((nodeId, index) => {
          const node = getNode(nodeId);
          return (
            <React.Fragment key={nodeId}>
              {index > 0 && (
                <ArrowRight className="h-3 w-3 text-text-muted" />
              )}
              <span
                className="max-w-[60px] truncate rounded bg-tertiary px-1.5 py-0.5 text-text-secondary"
                title={node?.name || nodeId}
              >
                {node?.name || nodeId.slice(0, 6)}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

interface SRLGRiskDisplayProps {
  analysis: {
    sharedSRLGCodes: string[];
    sharedDistanceKm: number;
    riskScore: number;
    warnings: string[];
  };
}

const SRLGRiskDisplay: React.FC<SRLGRiskDisplayProps> = ({ analysis }) => {
  const getRiskLevel = (score: number): { label: string; color: string } => {
    if (score === 0) return { label: 'None', color: 'text-success' };
    if (score <= 25) return { label: 'Low', color: 'text-success' };
    if (score <= 50) return { label: 'Medium', color: 'text-warning' };
    if (score <= 75) return { label: 'High', color: 'text-danger' };
    return { label: 'Critical', color: 'text-danger' };
  };

  const risk = getRiskLevel(analysis.riskScore);

  return (
    <div className="space-y-3">
      {/* Risk Score */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-tertiary">Risk Score</span>
        <span className={cn('text-lg font-bold', risk.color)}>
          {analysis.riskScore}%
        </span>
      </div>

      {/* Risk Level */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-tertiary">Risk Level</span>
        <span className={cn('text-sm font-semibold', risk.color)}>
          {risk.label}
        </span>
      </div>

      {/* Shared Distance */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-tertiary">Shared Distance</span>
        <span className="text-text-primary">{analysis.sharedDistanceKm} km</span>
      </div>

      {/* Shared SRLGs */}
      {analysis.sharedSRLGCodes.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-text-tertiary">Shared SRLGs</div>
          <div className="flex flex-wrap gap-1">
            {analysis.sharedSRLGCodes.map((code) => (
              <span
                key={code}
                className="bg-warning/10 rounded px-1.5 py-0.5 font-mono text-xs text-warning"
              >
                {code}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {analysis.warnings.length > 0 && (
        <div className="space-y-1">
          {analysis.warnings.map((warning, index) => (
            <div
              key={index}
              className="flex items-start gap-2 text-xs text-warning"
            >
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
