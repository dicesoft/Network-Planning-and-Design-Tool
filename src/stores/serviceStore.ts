import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { setupCrossTabSync, notifyCrossTabSync, markStoreRehydrated } from '@/lib/cross-tab-sync';
import { createIndexedDBStorage } from '@/lib/indexeddb-storage';
import {
  Service,
  L1DWDMService,
  L2L3Service,
  ServiceStatus,
  ServiceFilters,
  ServiceSortField,
  SortDirection,
  ServiceIdCounters,
  ServicePath,
  SRLGRiskAnalysis,
  L1DataRate,
  generateServiceId,
  isL1DWDMService,
  isL2L3Service,
} from '@/types/service';
import type { ServiceType } from '@/types/service';
import type { ChannelAllocation } from '@/types/spectrum';
import { logNetworkEvent } from './eventStore';
import { useNetworkStore } from './networkStore';
import { ChannelChecker, type ChannelTopologyProvider } from '@/core/services/ChannelChecker';
import { userToItuChannel } from '@/core/spectrum/channelConfig';
import type { DefragMove, DefragPlan } from '@/core/services/DefragmentationEngine';
import { validateDefragMoves } from '@/core/services/defragMoveValidation';

// ============================================================================
// DEFRAG APPLY TYPES
// ============================================================================

/**
 * Snapshot captured before applying a defrag plan, used for rollback / undo.
 * Mirrors the legacy DefragUndoSnapshot shape from the wizard so the wizard's
 * undo flow keeps working unchanged.
 */
export interface DefragApplySnapshot {
  serviceSnapshots: Array<{
    serviceId: string;
    channelNumber: number;
    protectionChannelNumber?: number;
  }>;
  spectrumSnapshots: Array<{
    nodeId: string;
    portId: string;
    allocationId: string;
    channelNumber: number;
    status: 'allocated' | 'reserved';
    label: string;
    edgeId: string;
  }>;
}

export interface ApplyDefragMovesResult {
  success: boolean;
  error?: string;
  appliedMoveCount?: number;
  snapshot?: DefragApplySnapshot;
  blockedMoveCount?: number;
}

// ============================================================================
// STORE STATE INTERFACE
// ============================================================================

/**
 * Service store state interface
 */
interface ServiceState {
  // Data
  services: Service[];
  idCounters: ServiceIdCounters;

  // Selection
  selectedServiceIds: string[];

  // Filtering & Sorting
  filters: ServiceFilters;
  sortBy: ServiceSortField;
  sortDirection: SortDirection;

  // Actions - CRUD
  addService: (service: Omit<Service, 'id' | 'createdAt' | 'modifiedAt'>) => string;
  updateService: (id: string, updates: Partial<Service>) => void;
  removeService: (id: string) => { success: boolean; blockers?: string[] };
  removeServices: (ids: string[]) => { removed: string[]; blocked: { id: string; blockers: string[] }[] };
  getService: (id: string) => Service | undefined;

  // Actions - Query
  getServicesByNode: (nodeId: string) => Service[];
  getServicesByEdge: (edgeId: string) => Service[];
  getL1ServicesForEndpoints: (
    sourceNodeId: string,
    destinationNodeId: string,
    minDataRate?: L1DataRate
  ) => L1DWDMService[];
  findL1ServicesCoveringPath: (
    dwdmEdgeIds: string[],
    minDataRate?: L1DataRate
  ) => L1DWDMService[];
  findL1ServicesAlongPath: (
    pathNodeIds: string[],
    minDataRate?: L1DataRate
  ) => L1DWDMService[];
  getFilteredServices: () => Service[];
  getDependentServices: (serviceId: string) => L2L3Service[];

  // Actions - Selection
  selectServices: (ids: string[], append?: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Actions - Filtering & Sorting
  setFilters: (filters: Partial<ServiceFilters>) => void;
  clearFilters: () => void;
  setSort: (field: ServiceSortField, direction?: SortDirection) => void;

  // Actions - Status Management
  activateService: (id: string) => { success: boolean; error?: string; conflicts?: { edgeId: string; channel: number }[] };
  deactivateService: (id: string) => void;
  failService: (id: string) => void;
  setServiceStatus: (id: string, status: ServiceStatus) => void;

  // Actions - Path Updates
  updateWorkingPath: (serviceId: string, path: ServicePath) => void;
  updateProtectionPath: (serviceId: string, path: ServicePath | undefined) => void;
  updateSRLGAnalysis: (serviceId: string, analysis: SRLGRiskAnalysis) => void;
  /**
   * Update L1 service path with proper spectrum reservation cleanup
   * Deallocates channels from old path and allocates on new path
   */
  updateL1ServicePathWithSpectrum: (
    serviceId: string,
    newWorkingPath: ServicePath,
    newProtectionPath?: ServicePath
  ) => { success: boolean; error?: string };

  // Actions - Bulk Operations
  bulkActivate: (ids: string[]) => {
    activated: string[];
    failed: { id: string; error: string }[];
  };
  bulkDeactivate: (ids: string[]) => void;
  bulkDelete: (ids: string[]) => { removed: string[]; blocked: { id: string; blockers: string[] }[] };

  // Actions - Utility
  clearAllServices: () => void;
  importServices: (services: Service[]) => void;
  exportServices: (ids?: string[]) => Service[];

  // Actions - Defragmentation
  /** Monotonic counter incremented after every successful applyDefragMoves. Subscribers (e.g. dashboards) can watch this to auto-refresh. */
  defragVersion: number;
  bumpDefragVersion: () => void;
  /**
   * Apply a defragmentation plan via two-phase commit (validate -> snapshot -> apply -> verify).
   * Idempotent: concurrent calls with the same plan id no-op (return the in-flight result shape).
   * On success, increments `defragVersion`.
   */
  applyDefragMoves: (plan: DefragPlan) => ApplyDefragMovesResult;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current timestamp
 */
const now = (): string => new Date().toISOString();

/**
 * Initial ID counters
 */
const initialIdCounters: ServiceIdCounters = {
  l1: 0,
  l2: 0,
  l3: 0,
};

/**
 * Initial filters
 */
const initialFilters: ServiceFilters = {};

/**
 * Data rate numeric values for comparison
 */
const DATA_RATE_VALUES: Record<L1DataRate, number> = {
  '10G': 10,
  '25G': 25,
  '100G': 100,
  '200G': 200,
  '400G': 400,
};

/**
 * Compare data rates
 */
const isDataRateSufficient = (available: L1DataRate, required: L1DataRate): boolean => {
  return DATA_RATE_VALUES[available] >= DATA_RATE_VALUES[required];
};

/**
 * Reserve channels for a path (used when creating planned L1-DWDM services)
 * Creates allocations with status 'reserved' instead of 'allocated'
 *
 * @param serviceId - Service ID for allocation labels
 * @param path - Service path containing edge IDs
 * @param channelNumber - User-friendly channel number (1-96) from ChannelChecker
 * @param isProtection - Whether this is a protection path
 */
const reserveChannelsForPath = (
  serviceId: string,
  path: ServicePath,
  channelNumber: number,
  isProtection: boolean = false
): void => {
  const networkState = useNetworkStore.getState();
  const prefix = isProtection ? `${serviceId}-prot` : serviceId;

  // Convert user channel (1-96) to ITU-T channel for spectrum storage
  const ituChannelNumber = userToItuChannel(channelNumber, 'fixed-50ghz');

  for (const edgeId of path.edgeIds) {
    const edge = networkState.topology.edges.find((e) => e.id === edgeId);
    if (!edge) continue;

    // Get source and target nodes
    const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
    const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

    // Find port IDs - use edge's port if exists, otherwise find first DWDM port
    const sourcePortId = edge.source.portId ||
      sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
    const targetPortId = edge.target.portId ||
      targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

    // Reserve on source port
    if (sourcePortId) {
      const allocation: ChannelAllocation = {
        id: `${prefix}-${edgeId}-src`,
        channelNumber: ituChannelNumber,
        status: 'reserved',
        label: `Service: ${serviceId}${isProtection ? ' (prot)' : ''} [reserved]`,
        edgeId,
      };
      useNetworkStore.getState().allocateChannels(
        edge.source.nodeId,
        sourcePortId,
        [allocation],
        edgeId
      );
    }

    // Reserve on target port
    if (targetPortId) {
      const allocation: ChannelAllocation = {
        id: `${prefix}-${edgeId}-tgt`,
        channelNumber: ituChannelNumber,
        status: 'reserved',
        label: `Service: ${serviceId}${isProtection ? ' (prot)' : ''} [reserved]`,
        edgeId,
      };
      useNetworkStore.getState().allocateChannels(
        edge.target.nodeId,
        targetPortId,
        [allocation],
        edgeId
      );
    }
  }
};

/**
 * Release channel reservations/allocations from a service path
 * Used when deleting a service or updating its path
 */
const releaseChannelsForPath = (
  serviceId: string,
  path: ServicePath,
  isProtection: boolean = false
): void => {
  const networkState = useNetworkStore.getState();
  const prefix = isProtection ? `${serviceId}-prot` : serviceId;

  for (const edgeId of path.edgeIds) {
    const edge = networkState.topology.edges.find((e) => e.id === edgeId);
    if (!edge) continue;

    // Get source and target nodes
    const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
    const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

    // Find port IDs - use edge's port if exists, otherwise find first DWDM port
    const sourcePortId = edge.source.portId ||
      sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
    const targetPortId = edge.target.portId ||
      targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

    // Deallocate from source port
    if (sourcePortId) {
      useNetworkStore.getState().deallocateChannels(
        edge.source.nodeId,
        sourcePortId,
        [`${prefix}-${edgeId}-src`]
      );
    }

    // Deallocate from target port
    if (targetPortId) {
      useNetworkStore.getState().deallocateChannels(
        edge.target.nodeId,
        targetPortId,
        [`${prefix}-${edgeId}-tgt`]
      );
    }
  }
};

/**
 * Re-allocate channels for a service path with specific status
 * Used when updating a path to maintain proper status (reserved vs allocated)
 */
const allocateChannelsForPath = (
  serviceId: string,
  path: ServicePath,
  channelNumber: number,
  isActive: boolean,
  isProtection: boolean = false
): void => {
  const networkState = useNetworkStore.getState();
  const prefix = isProtection ? `${serviceId}-prot` : serviceId;

  // Convert user channel (1-96) to ITU-T channel for spectrum storage
  const ituChannelNumber = userToItuChannel(channelNumber, 'fixed-50ghz');
  const status = isActive ? 'allocated' : 'reserved';
  const labelSuffix = isActive ? '' : ' [reserved]';

  for (const edgeId of path.edgeIds) {
    const edge = networkState.topology.edges.find((e) => e.id === edgeId);
    if (!edge) continue;

    // Get source and target nodes
    const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
    const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

    // Find port IDs - use edge's port if exists, otherwise find first DWDM port
    const sourcePortId = edge.source.portId ||
      sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
    const targetPortId = edge.target.portId ||
      targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

    // Allocate on source port
    if (sourcePortId) {
      const allocation: ChannelAllocation = {
        id: `${prefix}-${edgeId}-src`,
        channelNumber: ituChannelNumber,
        status,
        label: `Service: ${serviceId}${isProtection ? ' (prot)' : ''}${labelSuffix}`,
        edgeId,
      };
      useNetworkStore.getState().allocateChannels(
        edge.source.nodeId,
        sourcePortId,
        [allocation],
        edgeId
      );
    }

    // Allocate on target port
    if (targetPortId) {
      const allocation: ChannelAllocation = {
        id: `${prefix}-${edgeId}-tgt`,
        channelNumber: ituChannelNumber,
        status,
        label: `Service: ${serviceId}${isProtection ? ' (prot)' : ''}${labelSuffix}`,
        edgeId,
      };
      useNetworkStore.getState().allocateChannels(
        edge.target.nodeId,
        targetPortId,
        [allocation],
        edgeId
      );
    }
  }
};

/**
 * Sort services by field
 */
const sortServices = (
  services: Service[],
  sortBy: ServiceSortField,
  direction: SortDirection
): Service[] => {
  const sorted = [...services].sort((a, b) => {
    let aVal: string | number | undefined;
    let bVal: string | number | undefined;

    switch (sortBy) {
      case 'id':
        aVal = a.id;
        bVal = b.id;
        break;
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'type':
        aVal = a.type;
        bVal = b.type;
        break;
      case 'status':
        aVal = a.status;
        bVal = b.status;
        break;
      case 'sourceNodeId':
        aVal = a.sourceNodeId;
        bVal = b.sourceNodeId;
        break;
      case 'destinationNodeId':
        aVal = a.destinationNodeId;
        bVal = b.destinationNodeId;
        break;
      case 'dataRate':
        aVal = DATA_RATE_VALUES[a.dataRate];
        bVal = DATA_RATE_VALUES[b.dataRate];
        break;
      case 'createdAt':
        aVal = a.createdAt;
        bVal = b.createdAt;
        break;
      case 'modifiedAt':
        aVal = a.modifiedAt;
        bVal = b.modifiedAt;
        break;
      default:
        return 0;
    }

    if (aVal === undefined || bVal === undefined) return 0;
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
};

/**
 * Filter services by criteria
 */
const filterServices = (services: Service[], filters: ServiceFilters): Service[] => {
  return services.filter((service) => {
    // Type filter
    if (filters.type && filters.type.length > 0) {
      if (!filters.type.includes(service.type)) return false;
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      if (!filters.status.includes(service.status)) return false;
    }

    // Source node filter
    if (filters.sourceNodeId) {
      if (service.sourceNodeId !== filters.sourceNodeId) return false;
    }

    // Destination node filter
    if (filters.destinationNodeId) {
      if (service.destinationNodeId !== filters.destinationNodeId) return false;
    }

    // Protection scheme filter (L1 only)
    if (filters.protectionScheme && filters.protectionScheme.length > 0) {
      if (isL1DWDMService(service)) {
        if (!filters.protectionScheme.includes(service.protectionScheme)) return false;
      }
    }

    // Data rate filter
    if (filters.dataRate && filters.dataRate.length > 0) {
      if (!filters.dataRate.includes(service.dataRate)) return false;
    }

    // Search query filter (searches ID and name)
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase().trim();
      const matchesId = service.id.toLowerCase().includes(query);
      const matchesName = service.name.toLowerCase().includes(query);
      if (!matchesId && !matchesName) return false;
    }

    return true;
  });
};

/**
 * Check if a node is used by a service
 */
const serviceUsesNode = (service: Service, nodeId: string): boolean => {
  // Check endpoints
  if (service.sourceNodeId === nodeId || service.destinationNodeId === nodeId) {
    return true;
  }

  // Check working path
  if (isL1DWDMService(service)) {
    if (service.workingPath.nodeIds.includes(nodeId)) return true;
    if (service.protectionPath?.nodeIds.includes(nodeId)) return true;
  }

  return false;
};

/**
 * Check if an edge is used by a service
 */
const serviceUsesEdge = (service: Service, edgeId: string): boolean => {
  if (isL1DWDMService(service)) {
    if (service.workingPath.edgeIds.includes(edgeId)) return true;
    if (service.protectionPath?.edgeIds.includes(edgeId)) return true;
  }

  return false;
};

/**
 * Create a topology provider for ChannelChecker from networkStore
 */
const createTopologyProvider = (): ChannelTopologyProvider => {
  const networkState = useNetworkStore.getState();
  return {
    getNode: (id: string) => networkState.topology.nodes.find((n) => n.id === id),
    getEdge: (id: string) => networkState.topology.edges.find((e) => e.id === id),
    getEdges: () => networkState.topology.edges,
  };
};

/**
 * Check for channel conflicts before creating an L1 service
 * Returns an error message if conflict found, undefined if OK
 */
const checkChannelConflict = (
  edgeIds: string[],
  channelNumber: number
): string | undefined => {
  if (edgeIds.length === 0 || !channelNumber) {
    return undefined;
  }

  const topologyProvider = createTopologyProvider();
  const channelChecker = new ChannelChecker(topologyProvider);

  for (const edgeId of edgeIds) {
    // Skip edges that don't exist in topology (e.g., in tests with mock data)
    const edge = topologyProvider.getEdge(edgeId);
    if (!edge) {
      continue;
    }

    const availableChannels = channelChecker.getAvailableChannels(edgeId);
    if (!availableChannels.includes(channelNumber)) {
      const edgeName = edge?.name || edgeId;
      return `Channel ${channelNumber} is not available on edge "${edgeName}". It may be already allocated or reserved by another service.`;
    }
  }

  return undefined;
};

// ============================================================================
// DEFRAG IN-FLIGHT GUARD (module-local; not persisted, not part of state)
// ============================================================================

/**
 * Idempotency for applyDefragMoves keyed by plan id:
 *  - `_applyingPlanIds` — set of plan ids currently inside an apply call (re-entrant
 *    duplicate suppression; matters when an upstream caller fires twice synchronously
 *    or while React is mid-render).
 *  - `_recentlyAppliedPlanIds` — short post-success cooldown so a second click
 *    arriving on the next tick still no-ops.
 *
 * applyDefragMoves is synchronous, so "in-flight promise tracking" reduces to a
 * Set guard plus the cooldown map. Both keyed by plan.id.
 */
const DEFRAG_APPLY_COOLDOWN_MS = 500;
const _applyingPlanIds = new Set<string>();
const _recentlyAppliedPlanIds = new Map<string, number>();

const _isRecentlyApplied = (planId: string): boolean => {
  const at = _recentlyAppliedPlanIds.get(planId);
  if (at === undefined) return false;
  if (Date.now() - at > DEFRAG_APPLY_COOLDOWN_MS) {
    _recentlyAppliedPlanIds.delete(planId);
    return false;
  }
  return true;
};

/** Test-only helper: clear in-flight + cooldown guards between tests. */
export const _clearDefragInFlight = (): void => {
  _applyingPlanIds.clear();
  _recentlyAppliedPlanIds.clear();
};

// ============================================================================
// STORE CREATION
// ============================================================================

/**
 * Service store for managing network services
 */
export const useServiceStore = create<ServiceState>()(
  devtools(
    persist(
      immer((set, get) => ({
        // Initial state
        services: [],
        idCounters: { ...initialIdCounters },
        selectedServiceIds: [],
        filters: { ...initialFilters },
        sortBy: 'createdAt' as ServiceSortField,
        sortDirection: 'desc' as SortDirection,
        defragVersion: 0,

        // ====================================================================
        // CRUD ACTIONS
        // ====================================================================

        addService: (serviceData) => {
          // Check for channel conflicts for L1 DWDM services BEFORE creating
          if (serviceData.type === 'l1-dwdm') {
            const l1Data = serviceData as Omit<L1DWDMService, 'id' | 'createdAt' | 'modifiedAt'>;
            const channelNumber = l1Data.channelNumber || l1Data.workingPath?.channelNumber;

            if (channelNumber && l1Data.workingPath?.edgeIds) {
              // Check working path for conflicts
              const workingConflict = checkChannelConflict(l1Data.workingPath.edgeIds, channelNumber);
              if (workingConflict) {
                throw new Error(`Channel conflict on working path: ${workingConflict}`);
              }

              // Check protection path for conflicts if present
              if (l1Data.protectionPath?.edgeIds) {
                const protChannel = l1Data.protectionPath.channelNumber || channelNumber;
                const protConflict = checkChannelConflict(l1Data.protectionPath.edgeIds, protChannel);
                if (protConflict) {
                  throw new Error(`Channel conflict on protection path: ${protConflict}`);
                }
              }
            }
          }

          const { id, updatedCounters } = generateServiceId(
            serviceData.type,
            get().idCounters
          );

          const timestamp = now();
          const newService: Service = {
            ...serviceData,
            id,
            createdAt: timestamp,
            modifiedAt: timestamp,
          } as Service;

          set((state) => {
            state.services.push(newService);
            state.idCounters = updatedCounters;
          });

          // Reserve channels for planned L1-DWDM services
          if (newService.type === 'l1-dwdm' && newService.status === 'planned') {
            const l1Service = newService as L1DWDMService;
            const channelNumber = l1Service.channelNumber || l1Service.workingPath?.channelNumber;

            if (channelNumber && l1Service.workingPath) {
              reserveChannelsForPath(id, l1Service.workingPath, channelNumber, false);

              // Reserve protection path if exists
              if (l1Service.protectionPath && l1Service.protectionScheme !== 'none') {
                const protChannel = l1Service.protectionPath.channelNumber || channelNumber;
                reserveChannelsForPath(id, l1Service.protectionPath, protChannel, true);
              }
            }
          }

          // Log event
          logNetworkEvent(
            'service',
            `Service created: ${newService.name} (${newService.type})`,
            { serviceId: id, type: newService.type }
          );

          return id;
        },

        updateService: (id, updates) => {
          set((state) => {
            const index = state.services.findIndex((s) => s.id === id);
            if (index !== -1) {
              // Don't allow changing id, type, or createdAt
              const { id: _id, type: _type, createdAt: _createdAt, ...safeUpdates } = updates as Service;
              // Use Object.assign to avoid TypeScript spread type issues with union types
              const existingService = state.services[index];
              Object.assign(existingService, safeUpdates, { modifiedAt: now() });
            }
          });

          logNetworkEvent('service', `Service updated: ${id}`, { serviceId: id, updates });
        },

        removeService: (id) => {
          const state = get();
          const service = state.services.find((s) => s.id === id);

          if (!service) {
            return { success: false, blockers: ['Service not found'] };
          }

          // Check for dependent L2/L3 services if this is an L1 service
          if (isL1DWDMService(service)) {
            const dependents = state.getDependentServices(id);
            if (dependents.length > 0) {
              return {
                success: false,
                blockers: dependents.map(
                  (d) => `Service ${d.id} (${d.name}) depends on this L1 service`
                ),
              };
            }

            // Deallocate channels if service was active or planned (reserved)
            if (service.status === 'active' || service.status === 'planned') {
              const l1Service = service as L1DWDMService;
              const networkState = useNetworkStore.getState();

              // Deallocate working path channels
              if (l1Service.workingPath) {
                for (const edgeId of l1Service.workingPath.edgeIds) {
                  const edge = networkState.topology.edges.find((e) => e.id === edgeId);
                  if (edge) {
                    // Get source and target nodes
                    const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
                    const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

                    // Find port IDs - use edge's port if exists, otherwise find first DWDM port
                    const sourcePortId = edge.source.portId ||
                      sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
                    const targetPortId = edge.target.portId ||
                      targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

                    if (sourcePortId) {
                      useNetworkStore.getState().deallocateChannels(
                        edge.source.nodeId,
                        sourcePortId,
                        [`${id}-${edgeId}-src`]
                      );
                    }
                    if (targetPortId) {
                      useNetworkStore.getState().deallocateChannels(
                        edge.target.nodeId,
                        targetPortId,
                        [`${id}-${edgeId}-tgt`]
                      );
                    }
                  }
                }
              }

              // Deallocate protection path channels
              if (l1Service.protectionPath) {
                for (const edgeId of l1Service.protectionPath.edgeIds) {
                  const edge = networkState.topology.edges.find((e) => e.id === edgeId);
                  if (edge) {
                    // Get source and target nodes
                    const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
                    const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

                    // Find port IDs - use edge's port if exists, otherwise find first DWDM port
                    const sourcePortId = edge.source.portId ||
                      sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
                    const targetPortId = edge.target.portId ||
                      targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

                    if (sourcePortId) {
                      useNetworkStore.getState().deallocateChannels(
                        edge.source.nodeId,
                        sourcePortId,
                        [`${id}-prot-${edgeId}-src`]
                      );
                    }
                    if (targetPortId) {
                      useNetworkStore.getState().deallocateChannels(
                        edge.target.nodeId,
                        targetPortId,
                        [`${id}-prot-${edgeId}-tgt`]
                      );
                    }
                  }
                }
              }
            }
          }

          set((state) => {
            state.services = state.services.filter((s) => s.id !== id);
            state.selectedServiceIds = state.selectedServiceIds.filter((sid) => sid !== id);
          });

          logNetworkEvent('service', `Service deleted: ${service.name}`, {
            serviceId: id,
            type: service.type,
          });

          return { success: true };
        },

        removeServices: (ids) => {
          const removed: string[] = [];
          const blocked: { id: string; blockers: string[] }[] = [];

          for (const id of ids) {
            const result = get().removeService(id);
            if (result.success) {
              removed.push(id);
            } else {
              blocked.push({ id, blockers: result.blockers || [] });
            }
          }

          return { removed, blocked };
        },

        getService: (id) => {
          return get().services.find((s) => s.id === id);
        },

        // ====================================================================
        // QUERY ACTIONS
        // ====================================================================

        getServicesByNode: (nodeId) => {
          return get().services.filter((s) => serviceUsesNode(s, nodeId));
        },

        getServicesByEdge: (edgeId) => {
          return get().services.filter((s) => serviceUsesEdge(s, edgeId));
        },

        getL1ServicesForEndpoints: (sourceNodeId, destinationNodeId, minDataRate) => {
          return get().services.filter((s): s is L1DWDMService => {
            if (!isL1DWDMService(s)) return false;
            if (s.status !== 'active') return false;

            // Check endpoints match
            const matchesEndpoints =
              (s.sourceNodeId === sourceNodeId && s.destinationNodeId === destinationNodeId) ||
              (s.sourceNodeId === destinationNodeId && s.destinationNodeId === sourceNodeId);

            if (!matchesEndpoints) return false;

            // Check data rate if specified
            if (minDataRate && !isDataRateSufficient(s.dataRate, minDataRate)) {
              return false;
            }

            return true;
          });
        },

        findL1ServicesCoveringPath: (dwdmEdgeIds, minDataRate) => {
          // Return early if no DWDM edges to cover
          if (dwdmEdgeIds.length === 0) return [];

          return get().services.filter((s): s is L1DWDMService => {
            if (!isL1DWDMService(s)) return false;
            // Accept active or planned L1 services
            if (s.status !== 'active' && s.status !== 'planned') return false;

            // L1 service must cover ALL DWDM edges in the path
            const l1EdgeSet = new Set(s.workingPath.edgeIds);
            const allDwdmCovered = dwdmEdgeIds.every((edgeId) => l1EdgeSet.has(edgeId));
            if (!allDwdmCovered) return false;

            // Check data rate if specified
            if (minDataRate && !isDataRateSufficient(s.dataRate, minDataRate)) {
              return false;
            }

            return true;
          });
        },

        // Find L1 services whose endpoints are intermediate DWDM nodes along a path
        // This enables detection of L1 services between OADMs when L2/L3 path goes Router→OADM→OADM→Router
        findL1ServicesAlongPath: (pathNodeIds, minDataRate) => {
          // Need at least 3 nodes (source, intermediate, destination)
          if (pathNodeIds.length < 3) return [];

          // Get DWDM node types from the path (OADM, terminal)
          const networkState = useNetworkStore.getState();
          const dwdmNodeIds = pathNodeIds.filter((nodeId) => {
            const node = networkState.topology.nodes.find((n) => n.id === nodeId);
            return node && (node.type === 'oadm' || node.type === 'terminal');
          });

          // Need at least 2 DWDM nodes to have an L1 service between them
          if (dwdmNodeIds.length < 2) return [];

          return get().services.filter((s): s is L1DWDMService => {
            if (!isL1DWDMService(s)) return false;
            // Accept active or planned L1 services
            if (s.status === 'failed' || s.status === 'decommissioned') return false;

            // Check if L1 service endpoints are BOTH within the path's DWDM nodes
            const sourceInPath = dwdmNodeIds.includes(s.sourceNodeId);
            const destInPath = dwdmNodeIds.includes(s.destinationNodeId);

            if (!sourceInPath || !destInPath) return false;

            // Check data rate if specified
            if (minDataRate && !isDataRateSufficient(s.dataRate, minDataRate)) {
              return false;
            }

            return true;
          });
        },

        getFilteredServices: () => {
          const { services, filters, sortBy, sortDirection } = get();
          const filtered = filterServices(services, filters);
          return sortServices(filtered, sortBy, sortDirection);
        },

        getDependentServices: (serviceId) => {
          return get().services.filter((s): s is L2L3Service => {
            if (!isL2L3Service(s)) return false;
            return (
              s.underlayServiceId === serviceId ||
              s.protectionUnderlayServiceId === serviceId
            );
          });
        },

        // ====================================================================
        // SELECTION ACTIONS
        // ====================================================================

        selectServices: (ids, append = false) => {
          set((state) => {
            if (append) {
              const newIds = ids.filter((id) => !state.selectedServiceIds.includes(id));
              state.selectedServiceIds.push(...newIds);
            } else {
              state.selectedServiceIds = [...ids];
            }
          });
        },

        clearSelection: () => {
          set((state) => {
            state.selectedServiceIds = [];
          });
        },

        selectAll: () => {
          set((state) => {
            state.selectedServiceIds = state.services.map((s) => s.id);
          });
        },

        // ====================================================================
        // FILTERING & SORTING ACTIONS
        // ====================================================================

        setFilters: (filters) => {
          set((state) => {
            state.filters = { ...state.filters, ...filters };
          });
        },

        clearFilters: () => {
          set((state) => {
            state.filters = { ...initialFilters };
          });
        },

        setSort: (field, direction) => {
          set((state) => {
            if (state.sortBy === field && !direction) {
              // Toggle direction if same field clicked
              state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
              state.sortBy = field;
              state.sortDirection = direction || 'asc';
            }
          });
        },

        // ====================================================================
        // STATUS MANAGEMENT ACTIONS
        // ====================================================================

        activateService: (id) => {
          const service = get().getService(id);
          if (!service) {
            return { success: false, error: 'Service not found' };
          }

          // For L2/L3 services, validate that underlay L1 service is active
          if (isL2L3Service(service)) {
            const l2l3Service = service as L2L3Service;

            // Check working underlay
            if (l2l3Service.underlayServiceId) {
              const underlay = get().getService(l2l3Service.underlayServiceId);
              if (!underlay) {
                return {
                  success: false,
                  error: `Cannot activate: Working underlay service ${l2l3Service.underlayServiceId} not found`,
                };
              }
              if (underlay.status !== 'active') {
                return {
                  success: false,
                  error: `Cannot activate: Working underlay ${underlay.name || l2l3Service.underlayServiceId} is "${underlay.status}" (must be "active")`,
                };
              }
            } else if (!l2l3Service.underlayAutoCreated) {
              // No underlay assigned and not auto-created - this is an error
              return {
                success: false,
                error: 'Cannot activate: No L1 underlay service assigned',
              };
            }

            // Check protection underlay (warning only, not blocking)
            if (l2l3Service.protectionUnderlayServiceId) {
              const protUnderlay = get().getService(l2l3Service.protectionUnderlayServiceId);
              if (protUnderlay && protUnderlay.status !== 'active') {
                console.warn(
                  `Protection underlay ${l2l3Service.protectionUnderlayServiceId} is "${protUnderlay.status}" - protection may not be available`
                );
              }
            }
          }

          // For L1 DWDM services, promote reserved channels to allocated or create new allocations
          if (isL1DWDMService(service)) {
            const l1Service = service as L1DWDMService;

            // Get channel number from service or working path
            const channelNumber = l1Service.channelNumber || l1Service.workingPath?.channelNumber;
            const networkState = useNetworkStore.getState();

            if (channelNumber && l1Service.workingPath) {
              // Check if service was planned (has reservations) or needs new allocations
              const wasPlanned = l1Service.status === 'planned';

              if (wasPlanned) {
                // Promote working path reservations to allocations
                for (const edgeId of l1Service.workingPath.edgeIds) {
                  const edge = networkState.topology.edges.find((e) => e.id === edgeId);
                  if (!edge) continue;

                  // Get source and target nodes
                  const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
                  const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

                  // Find port IDs - use edge's port if exists, otherwise find first DWDM port
                  const sourcePortId = edge.source.portId ||
                    sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
                  const targetPortId = edge.target.portId ||
                    targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

                  if (sourcePortId) {
                    networkState.promoteReservationToAllocation(
                      edge.source.nodeId,
                      sourcePortId,
                      [`${id}-${edgeId}-src`]
                    );
                  }
                  if (targetPortId) {
                    networkState.promoteReservationToAllocation(
                      edge.target.nodeId,
                      targetPortId,
                      [`${id}-${edgeId}-tgt`]
                    );
                  }
                }

                // Promote protection path reservations
                if (l1Service.protectionPath && l1Service.protectionScheme !== 'none') {
                  for (const edgeId of l1Service.protectionPath.edgeIds) {
                    const edge = networkState.topology.edges.find((e) => e.id === edgeId);
                    if (!edge) continue;

                    // Get source and target nodes
                    const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
                    const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

                    // Find port IDs - use edge's port if exists, otherwise find first DWDM port
                    const sourcePortId = edge.source.portId ||
                      sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
                    const targetPortId = edge.target.portId ||
                      targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

                    if (sourcePortId) {
                      networkState.promoteReservationToAllocation(
                        edge.source.nodeId,
                        sourcePortId,
                        [`${id}-prot-${edgeId}-src`]
                      );
                    }
                    if (targetPortId) {
                      networkState.promoteReservationToAllocation(
                        edge.target.nodeId,
                        targetPortId,
                        [`${id}-prot-${edgeId}-tgt`]
                      );
                    }
                  }
                }
              } else {
                // Service wasn't planned - need to check availability and create new allocations
                // Create topology provider for ChannelChecker
                const topologyProvider: ChannelTopologyProvider = {
                  getNode: (nodeId: string) => networkState.topology.nodes.find((n) => n.id === nodeId),
                  getEdge: (edgeId: string) => networkState.topology.edges.find((e) => e.id === edgeId),
                  getEdges: () => networkState.topology.edges,
                };

                // Check channel availability on all edges in the working path
                const channelChecker = new ChannelChecker(topologyProvider);
                const availability = channelChecker.checkChannelAvailability(
                  l1Service.workingPath,
                  l1Service.wavelengthMode,
                  channelNumber
                );

                if (!availability.available) {
                  // Find which edges are blocked
                  const conflicts: { edgeId: string; channel: number }[] = [];
                  for (const edgeId of l1Service.workingPath.edgeIds) {
                    const availableChannels = channelChecker.getAvailableChannels(edgeId);
                    if (!availableChannels.includes(channelNumber)) {
                      conflicts.push({ edgeId, channel: channelNumber });
                    }
                  }

                  return {
                    success: false,
                    error: `Channel ${channelNumber} is not available on ${conflicts.length} edge(s). Another service may be using this channel.`,
                    conflicts,
                  };
                }

                // Convert user channel (1-96) to ITU-T channel for spectrum storage
                const ituChannelNumber = userToItuChannel(channelNumber, 'fixed-50ghz');

                // Allocate channels on all edges in the path
                for (const edgeId of l1Service.workingPath.edgeIds) {
                  const edge = networkState.topology.edges.find((e) => e.id === edgeId);
                  if (edge) {
                    // Get source and target nodes
                    const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
                    const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

                    // Find port IDs - use edge's port if exists, otherwise find first DWDM port
                    const sourcePortId = edge.source.portId ||
                      sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
                    const targetPortId = edge.target.portId ||
                      targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

                    if (sourcePortId) {
                      const allocation: ChannelAllocation = {
                        id: `${id}-${edgeId}-src`,
                        channelNumber: ituChannelNumber,
                        status: 'allocated',
                        label: `Service: ${id}`,
                        edgeId,
                      };
                      useNetworkStore.getState().allocateChannels(
                        edge.source.nodeId,
                        sourcePortId,
                        [allocation],
                        edgeId
                      );
                    }

                    if (targetPortId) {
                      const allocation: ChannelAllocation = {
                        id: `${id}-${edgeId}-tgt`,
                        channelNumber: ituChannelNumber,
                        status: 'allocated',
                        label: `Service: ${id}`,
                        edgeId,
                      };
                      useNetworkStore.getState().allocateChannels(
                        edge.target.nodeId,
                        targetPortId,
                        [allocation],
                        edgeId
                      );
                    }
                  }
                }

                // Also allocate for protection path if it exists
                if (l1Service.protectionPath && l1Service.protectionScheme !== 'none') {
                  const protectionChannel = l1Service.protectionPath.channelNumber || channelNumber;
                  // Convert protection channel to ITU-T
                  const ituProtectionChannel = userToItuChannel(protectionChannel, 'fixed-50ghz');

                  for (const edgeId of l1Service.protectionPath.edgeIds) {
                    const edge = networkState.topology.edges.find((e) => e.id === edgeId);
                    if (edge) {
                      // Get source and target nodes
                      const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
                      const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

                      // Find port IDs - use edge's port if exists, otherwise find first DWDM port
                      const sourcePortId = edge.source.portId ||
                        sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
                      const targetPortId = edge.target.portId ||
                        targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

                      if (sourcePortId) {
                        const allocation: ChannelAllocation = {
                          id: `${id}-prot-${edgeId}-src`,
                          channelNumber: ituProtectionChannel,
                          status: 'allocated',
                          label: `Service: ${id} (prot)`,
                          edgeId,
                        };
                        useNetworkStore.getState().allocateChannels(
                          edge.source.nodeId,
                          sourcePortId,
                          [allocation],
                          edgeId
                        );
                      }

                      if (targetPortId) {
                        const allocation: ChannelAllocation = {
                          id: `${id}-prot-${edgeId}-tgt`,
                          channelNumber: ituProtectionChannel,
                          status: 'allocated',
                          label: `Service: ${id} (prot)`,
                          edgeId,
                        };
                        useNetworkStore.getState().allocateChannels(
                          edge.target.nodeId,
                          targetPortId,
                          [allocation],
                          edgeId
                        );
                      }
                    }
                  }
                }
              }
            }
          }

          // Set status to active
          get().setServiceStatus(id, 'active');
          return { success: true };
        },

        deactivateService: (id) => {
          const service = get().getService(id);
          if (service && isL1DWDMService(service)) {
            // Deallocate channels for L1 services
            const l1Service = service as L1DWDMService;
            const networkState = useNetworkStore.getState();

            // Deallocate working path channels
            if (l1Service.workingPath) {
              for (const edgeId of l1Service.workingPath.edgeIds) {
                const edge = networkState.topology.edges.find((e) => e.id === edgeId);
                if (edge) {
                  // Get source and target nodes
                  const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
                  const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

                  // Find port IDs - use edge's port if exists, otherwise find first DWDM port
                  const sourcePortId = edge.source.portId ||
                    sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
                  const targetPortId = edge.target.portId ||
                    targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

                  if (sourcePortId) {
                    useNetworkStore.getState().deallocateChannels(
                      edge.source.nodeId,
                      sourcePortId,
                      [`${id}-${edgeId}-src`]
                    );
                  }
                  if (targetPortId) {
                    useNetworkStore.getState().deallocateChannels(
                      edge.target.nodeId,
                      targetPortId,
                      [`${id}-${edgeId}-tgt`]
                    );
                  }
                }
              }
            }

            // Deallocate protection path channels
            if (l1Service.protectionPath) {
              for (const edgeId of l1Service.protectionPath.edgeIds) {
                const edge = networkState.topology.edges.find((e) => e.id === edgeId);
                if (edge) {
                  // Get source and target nodes
                  const sourceNode = networkState.topology.nodes.find((n) => n.id === edge.source.nodeId);
                  const targetNode = networkState.topology.nodes.find((n) => n.id === edge.target.nodeId);

                  // Find port IDs - use edge's port if exists, otherwise find first DWDM port
                  const sourcePortId = edge.source.portId ||
                    sourceNode?.ports?.find((p) => p.type === 'dwdm')?.id;
                  const targetPortId = edge.target.portId ||
                    targetNode?.ports?.find((p) => p.type === 'dwdm')?.id;

                  if (sourcePortId) {
                    useNetworkStore.getState().deallocateChannels(
                      edge.source.nodeId,
                      sourcePortId,
                      [`${id}-prot-${edgeId}-src`]
                    );
                  }
                  if (targetPortId) {
                    useNetworkStore.getState().deallocateChannels(
                      edge.target.nodeId,
                      targetPortId,
                      [`${id}-prot-${edgeId}-tgt`]
                    );
                  }
                }
              }
            }
          }

          get().setServiceStatus(id, 'maintenance');
        },

        failService: (id) => {
          get().setServiceStatus(id, 'failed');
        },

        setServiceStatus: (id, status) => {
          set((state) => {
            const service = state.services.find((s) => s.id === id);
            if (service) {
              const previousStatus = service.status;
              service.status = status;
              service.modifiedAt = now();

              logNetworkEvent(
                'service',
                `Service status changed: ${service.name} (${previousStatus} → ${status})`,
                { serviceId: id, previousStatus, newStatus: status }
              );
            }
          });
        },

        // ====================================================================
        // PATH UPDATE ACTIONS
        // ====================================================================

        updateWorkingPath: (serviceId, path) => {
          set((state) => {
            const service = state.services.find((s) => s.id === serviceId);
            if (service && isL1DWDMService(service)) {
              service.workingPath = path;
              service.modifiedAt = now();
            }
          });
        },

        updateProtectionPath: (serviceId, path) => {
          set((state) => {
            const service = state.services.find((s) => s.id === serviceId);
            if (service && isL1DWDMService(service)) {
              service.protectionPath = path;
              service.modifiedAt = now();
            }
          });
        },

        updateSRLGAnalysis: (serviceId, analysis) => {
          set((state) => {
            const service = state.services.find((s) => s.id === serviceId);
            if (service && isL1DWDMService(service)) {
              service.srlgAnalysis = analysis;
              service.modifiedAt = now();
            }
          });
        },

        updateL1ServicePathWithSpectrum: (serviceId, newWorkingPath, newProtectionPath) => {
          const state = get();
          const service = state.services.find((s) => s.id === serviceId);

          if (!service) {
            return { success: false, error: 'Service not found' };
          }

          if (!isL1DWDMService(service)) {
            return { success: false, error: 'Only L1 DWDM services support path updates with spectrum' };
          }

          const l1Service = service as L1DWDMService;
          const isActive = l1Service.status === 'active';

          // Get the channel number from the service
          const channelNumber = l1Service.channelNumber || l1Service.workingPath?.channelNumber;
          if (!channelNumber) {
            return { success: false, error: 'Service has no channel number assigned' };
          }

          // 1. Release old working path allocations
          if (l1Service.workingPath && l1Service.workingPath.edgeIds.length > 0) {
            releaseChannelsForPath(serviceId, l1Service.workingPath, false);
          }

          // 2. Release old protection path allocations (if exists)
          if (l1Service.protectionPath && l1Service.protectionPath.edgeIds.length > 0) {
            releaseChannelsForPath(serviceId, l1Service.protectionPath, true);
          }

          // 3. Allocate new working path
          if (newWorkingPath && newWorkingPath.edgeIds.length > 0) {
            allocateChannelsForPath(serviceId, newWorkingPath, channelNumber, isActive, false);
          }

          // 4. Allocate new protection path (if provided)
          if (newProtectionPath && newProtectionPath.edgeIds.length > 0) {
            const protChannel = newProtectionPath.channelNumber || channelNumber;
            allocateChannelsForPath(serviceId, newProtectionPath, protChannel, isActive, true);
          }

          // 5. Update the service record
          set((state) => {
            const index = state.services.findIndex((s) => s.id === serviceId);
            if (index !== -1 && isL1DWDMService(state.services[index])) {
              const serviceRef = state.services[index] as L1DWDMService;
              serviceRef.workingPath = newWorkingPath;
              serviceRef.protectionPath = newProtectionPath;
              serviceRef.modifiedAt = now();
            }
          });

          logNetworkEvent('service', `L1 service path updated with spectrum: ${serviceId}`, {
            serviceId,
            newWorkingPathEdges: newWorkingPath.edgeIds.length,
            newProtectionPathEdges: newProtectionPath?.edgeIds.length || 0,
          });

          return { success: true };
        },

        // ====================================================================
        // BULK OPERATIONS
        // ====================================================================

        bulkActivate: (ids) => {
          const results = {
            activated: [] as string[],
            failed: [] as { id: string; error: string }[],
          };

          for (const id of ids) {
            const result = get().activateService(id);
            if (result.success) {
              results.activated.push(id);
            } else {
              results.failed.push({ id, error: result.error || 'Unknown error' });
            }
          }

          if (results.activated.length > 0) {
            logNetworkEvent('service', `Bulk activate: ${results.activated.length} services activated`, {
              activated: results.activated,
              failed: results.failed.length,
            });
          }

          return results;
        },

        bulkDeactivate: (ids) => {
          let count = 0;
          for (const id of ids) {
            const service = get().getService(id);
            if (service && service.status !== 'maintenance') {
              get().deactivateService(id);
              count++;
            }
          }

          logNetworkEvent('service', `Bulk deactivate: ${count} services`, { serviceIds: ids });
        },

        bulkDelete: (ids) => {
          return get().removeServices(ids);
        },

        // ====================================================================
        // UTILITY ACTIONS
        // ====================================================================

        clearAllServices: () => {
          set((state) => {
            state.services = [];
            state.selectedServiceIds = [];
            state.idCounters = { ...initialIdCounters };
          });

          logNetworkEvent('service', 'All services cleared');
        },

        importServices: (services) => {
          set((state) => {
            // Find highest ID numbers to update counters
            let maxL1 = state.idCounters.l1;
            let maxL2 = state.idCounters.l2;
            let maxL3 = state.idCounters.l3;

            for (const service of services) {
              const match = service.id.match(/^(L[123])-(\d+)$/);
              if (match) {
                const [, prefix, numStr] = match;
                const num = parseInt(numStr, 10);
                if (prefix === 'L1') maxL1 = Math.max(maxL1, num);
                else if (prefix === 'L2') maxL2 = Math.max(maxL2, num);
                else if (prefix === 'L3') maxL3 = Math.max(maxL3, num);
              }

              // Check for duplicate IDs and skip
              if (!state.services.some((s) => s.id === service.id)) {
                state.services.push(service);
              }
            }

            state.idCounters = { l1: maxL1, l2: maxL2, l3: maxL3 };
          });

          logNetworkEvent('service', `Imported ${services.length} services`, {
            count: services.length,
          });
        },

        exportServices: (ids) => {
          const { services } = get();
          if (ids && ids.length > 0) {
            return services.filter((s) => ids.includes(s.id));
          }
          return [...services];
        },

        // ====================================================================
        // DEFRAGMENTATION
        // ====================================================================

        bumpDefragVersion: () => {
          set((state) => {
            state.defragVersion = state.defragVersion + 1;
          });
        },

        applyDefragMoves: (plan) => {
          // Idempotency:
          //   1. Re-entrant duplicate (same plan currently applying) — drop quietly.
          //   2. Post-success cooldown — duplicate within 500ms is a no-op success.
          if (_applyingPlanIds.has(plan.id) || _isRecentlyApplied(plan.id)) {
            return { success: true, appliedMoveCount: 0 };
          }

          _applyingPlanIds.add(plan.id);
          try {
          const networkStore = useNetworkStore.getState();
          {
            const currentServices = get().services;

            // Phase 1: VALIDATE against current state
            const revalidation = validateDefragMoves(plan.moves, currentServices);
            const movesToApply = revalidation.allowedMoves;

            if (!revalidation.valid) {
              return {
                success: false,
                error: revalidation.errors[0] || 'Defrag validation failed',
                blockedMoveCount: revalidation.blockedMoves.length,
              };
            }

            if (movesToApply.length === 0) {
              return { success: false, error: 'No applicable moves' };
            }

            // Phase 2: SNAPSHOT
            const snapshot: DefragApplySnapshot = {
              serviceSnapshots: [],
              spectrumSnapshots: [],
            };

            const affectedServiceIds = new Set(movesToApply.map((m) => m.serviceId));
            for (const serviceId of affectedServiceIds) {
              const service = currentServices.find((s) => s.id === serviceId);
              if (service && isL1DWDMService(service)) {
                const l1 = service as L1DWDMService;
                snapshot.serviceSnapshots.push({
                  serviceId,
                  channelNumber: l1.channelNumber || l1.workingPath?.channelNumber || 0,
                  protectionChannelNumber: l1.protectionPath?.channelNumber,
                });
              }
            }

            const affectedEdgeIds = new Set(movesToApply.map((m) => m.edgeId));
            for (const edgeId of affectedEdgeIds) {
              const edge = networkStore.topology.edges.find((e) => e.id === edgeId);
              if (!edge) continue;
              for (const endpoint of [edge.source, edge.target]) {
                const node = networkStore.topology.nodes.find((n) => n.id === endpoint.nodeId);
                if (!node) continue;
                const portId = endpoint.portId || node.ports?.find((p) => p.type === 'dwdm')?.id;
                if (!portId) continue;

                const spectrum = networkStore.getPortSpectrum(endpoint.nodeId, portId);
                if (!spectrum) continue;

                for (const alloc of spectrum.allocations) {
                  if (alloc.edgeId === edgeId) {
                    const allocServiceId = alloc.label?.match(/Service: (\S+)/)?.[1];
                    if (
                      allocServiceId &&
                      affectedServiceIds.has(allocServiceId) &&
                      alloc.channelNumber != null
                    ) {
                      snapshot.spectrumSnapshots.push({
                        nodeId: endpoint.nodeId,
                        portId,
                        allocationId: alloc.id,
                        channelNumber: alloc.channelNumber,
                        status: alloc.status as 'allocated' | 'reserved',
                        label: alloc.label || '',
                        edgeId,
                      });
                    }
                  }
                }
              }
            }

            // Phase 3: APPLY
            const movesByService = new Map<string, DefragMove[]>();
            for (const move of movesToApply) {
              const arr = movesByService.get(move.serviceId) || [];
              arr.push(move);
              movesByService.set(move.serviceId, arr);
            }

            for (const [serviceId, svcMoves] of movesByService) {
              const service = currentServices.find((s) => s.id === serviceId);
              if (!service || !isL1DWDMService(service)) continue;
              const l1 = service as L1DWDMService;
              const newChannel = svcMoves[0].toChannel;
              get().updateService(serviceId, {
                channelNumber: newChannel,
                workingPath: {
                  ...l1.workingPath,
                  channelNumber: newChannel,
                },
              } as Partial<L1DWDMService>);
            }

            for (const move of movesToApply) {
              const edge = networkStore.topology.edges.find((e) => e.id === move.edgeId);
              if (!edge) continue;
              const newItuChannel = userToItuChannel(move.toChannel, 'fixed-50ghz');

              for (const endpoint of [edge.source, edge.target]) {
                const node = networkStore.topology.nodes.find((n) => n.id === endpoint.nodeId);
                if (!node) continue;
                const portId = endpoint.portId || node.ports?.find((p) => p.type === 'dwdm')?.id;
                if (!portId) continue;

                const suffix = endpoint === edge.source ? 'src' : 'tgt';
                const allocId = `${move.serviceId}-${move.edgeId}-${suffix}`;

                networkStore.deallocateChannels(endpoint.nodeId, portId, [allocId]);

                const service = currentServices.find((s) => s.id === move.serviceId);
                const isActive = service?.status === 'active';
                networkStore.allocateChannels(
                  endpoint.nodeId,
                  portId,
                  [
                    {
                      id: allocId,
                      channelNumber: newItuChannel,
                      status: isActive ? 'allocated' : 'reserved',
                      label: `Service: ${move.serviceId}${isActive ? '' : ' [reserved]'}`,
                      edgeId: move.edgeId,
                    },
                  ],
                  move.edgeId
                );
              }
            }

            // Phase 4: VERIFY
            let integrityOk = true;
            for (const [serviceId, svcMoves] of movesByService) {
              const updated = get().getService(serviceId);
              if (!updated || !isL1DWDMService(updated)) continue;
              const l1 = updated as L1DWDMService;
              const expected = svcMoves[0].toChannel;
              const actual = l1.channelNumber || l1.workingPath?.channelNumber;
              if (actual !== expected) {
                integrityOk = false;
                break;
              }
            }

            if (!integrityOk) {
              return {
                success: false,
                error: 'Integrity check failed: service channels did not match expected state.',
                snapshot,
              };
            }

            // Success — bump version, mark cooldown, log
            get().bumpDefragVersion();
            _recentlyAppliedPlanIds.set(plan.id, Date.now());

            logNetworkEvent('service', `Defragmentation applied: ${movesToApply.length} moves`, {
              planId: plan.id,
              moveCount: movesToApply.length,
              servicesAffected: affectedServiceIds.size,
            });

            return {
              success: true,
              appliedMoveCount: movesToApply.length,
              snapshot,
            };
          }
          } finally {
            _applyingPlanIds.delete(plan.id);
          }
        },
      })),
      {
        name: 'service-store',
        storage: createJSONStorage(() => createIndexedDBStorage()),
        partialize: (state) => ({
          services: state.services,
          idCounters: state.idCounters,
          filters: state.filters,
          sortBy: state.sortBy,
          sortDirection: state.sortDirection,
        }),
        onRehydrateStorage: () => () => {
          markStoreRehydrated('service-store');
        },
      }
    ),
    { name: 'ServiceStore' }
  )
);

// ============================================================================
// CROSS-TAB SYNC
// ============================================================================

/**
 * Setup cross-tab synchronization for service store.
 * Uses BroadcastChannel (with storage event fallback).
 */
export const setupServiceStoreCrossTabSync = (): (() => void) => {
  const cleanupSync = setupCrossTabSync('service-store', useServiceStore);
  const unsubscribe = useServiceStore.subscribe(() => {
    notifyCrossTabSync('service-store');
  });

  return () => {
    cleanupSync();
    unsubscribe();
  };
};

// ============================================================================
// SELECTORS (for optimized re-renders)
// ============================================================================

/**
 * Select all services
 */
export const selectServices = (state: ServiceState) => state.services;

/**
 * Select selected service IDs
 */
export const selectSelectedServiceIds = (state: ServiceState) => state.selectedServiceIds;

/**
 * Select filters
 */
export const selectFilters = (state: ServiceState) => state.filters;

/**
 * Select sort configuration
 */
export const selectSort = (state: ServiceState) => ({
  sortBy: state.sortBy,
  sortDirection: state.sortDirection,
});

/**
 * Select service count by type
 */
export const selectServiceCountByType = (state: ServiceState) => {
  const counts: Record<ServiceType, number> = {
    'l1-dwdm': 0,
    'l2-ethernet': 0,
    'l3-ip': 0,
  };

  for (const service of state.services) {
    counts[service.type]++;
  }

  return counts;
};

/**
 * Select service count by status
 */
export const selectServiceCountByStatus = (state: ServiceState) => {
  const counts: Record<ServiceStatus, number> = {
    planned: 0,
    provisioning: 0,
    active: 0,
    failed: 0,
    maintenance: 0,
    decommissioned: 0,
  };

  for (const service of state.services) {
    counts[service.status]++;
  }

  return counts;
};
