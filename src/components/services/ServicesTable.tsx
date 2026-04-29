import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useServiceStore } from '@/stores/serviceStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { Service, ServiceType, ServiceStatus, SERVICE_TYPE_CONFIGS, SERVICE_STATUS_CONFIGS, isL1DWDMService, L1DWDMService } from '@/types/service';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { UnderlaySelector } from '@/core/services/UnderlaySelector';
import { ServiceStatusBadge } from './ServiceStatusBadge';
import { ServiceTypeBadge } from './ServiceTypeBadge';
import { BatchActionsBar } from './BatchActionsBar';
import { PaginationControls } from './PaginationControls';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Trash2, CheckCircle, XCircle, Layers, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { downloadServicesAsJSON, downloadServicesAsCSV } from '@/lib/exportServices';
import { pluralize } from '@/lib/pluralize';

type SortField = 'id' | 'name' | 'type' | 'status' | 'dataRate';
type SortDirection = 'asc' | 'desc';

interface ServicesTableProps {
  typeFilter: ServiceType | 'all';
  statusFilter: ServiceStatus | 'all';
  ipCardActive?: boolean;
  onTypeFilterChange: (value: ServiceType | 'all') => void;
  onStatusFilterChange: (value: ServiceStatus | 'all') => void;
}

export const ServicesTable: React.FC<ServicesTableProps> = ({
  typeFilter,
  statusFilter,
  ipCardActive = false,
  onTypeFilterChange,
  onStatusFilterChange,
}) => {
  const services = useServiceStore((state) => state.services);
  const removeService = useServiceStore((state) => state.removeService);
  const activateService = useServiceStore((state) => state.activateService);
  const deactivateService = useServiceStore((state) => state.deactivateService);
  const getDependentServices = useServiceStore((state) => state.getDependentServices);
  const exportServices = useServiceStore((state) => state.exportServices);
  const selectedServiceIds = useServiceStore((state) => state.selectedServiceIds);
  const selectServices = useServiceStore((state) => state.selectServices);
  const clearSelection = useServiceStore((state) => state.clearSelection);
  const bulkActivate = useServiceStore((state) => state.bulkActivate);
  const bulkDeactivate = useServiceStore((state) => state.bulkDeactivate);
  const bulkDelete = useServiceStore((state) => state.bulkDelete);
  const nodes = useNetworkStore((state) => state.topology.nodes);
  const edges = useNetworkStore((state) => state.topology.edges);
  const openServiceInspector = useUIStore((state) => state.openServiceInspector);
  const addToast = useUIStore((state) => state.addToast);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Dialog states for custom modals
  const [showBlockingAlert, setShowBlockingAlert] = useState(false);
  const [blockingAlertDetails, setBlockingAlertDetails] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteService, setPendingDeleteService] = useState<Service | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  // Get node name by ID
  const getNodeName = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    return node?.name || nodeId.slice(0, 8);
  }, [nodes]);

  // Get channel number for L1 DWDM services
  const getChannelNumber = (service: Service): number | null => {
    if (isL1DWDMService(service)) {
      const l1Service = service as L1DWDMService;
      return l1Service.channelNumber ?? l1Service.workingPath?.channelNumber ?? null;
    }
    return null;
  };

  // Filter and sort services
  const filteredServices = useMemo(() => {
    let result = [...services];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.id.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query) ||
          getNodeName(s.sourceNodeId).toLowerCase().includes(query) ||
          getNodeName(s.destinationNodeId).toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      result = result.filter((s) => s.type === typeFilter);
    }

    // Apply IP card filter (covers both l2-ethernet and l3-ip)
    if (ipCardActive) {
      result = result.filter((s) => s.type === 'l2-ethernet' || s.type === 'l3-ip');
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((s) => s.status === statusFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'id':
          comparison = a.id.localeCompare(b.id);
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'dataRate':
          comparison = a.dataRate.localeCompare(b.dataRate);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [services, searchQuery, typeFilter, ipCardActive, statusFilter, sortField, sortDirection, getNodeName]);

  // Pagination derived values
  const totalPages = Math.max(1, Math.ceil(filteredServices.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredServices.length);
  const paginatedServices = filteredServices.slice(startIndex, endIndex);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, statusFilter, ipCardActive]);

  // Selection helpers for current page
  const selectedIdsSet = useMemo(() => new Set(selectedServiceIds), [selectedServiceIds]);
  const allPageSelected = paginatedServices.length > 0 && paginatedServices.every((s) => selectedIdsSet.has(s.id));
  const somePageSelected = paginatedServices.some((s) => selectedIdsSet.has(s.id));
  const headerCheckState: boolean | 'indeterminate' = allPageSelected ? true : somePageSelected ? 'indeterminate' : false;

  const handleHeaderCheckChange = (checked: boolean | 'indeterminate') => {
    if (checked) {
      const pageIds = paginatedServices.map((s) => s.id);
      selectServices(pageIds, true);
    } else {
      const pageIds = new Set(paginatedServices.map((s) => s.id));
      const remaining = selectedServiceIds.filter((id) => !pageIds.has(id));
      if (remaining.length === 0) {
        clearSelection();
      } else {
        selectServices(remaining);
      }
    }
  };

  const handleRowCheckChange = (serviceId: string, checked: boolean | 'indeterminate') => {
    if (checked) {
      selectServices([serviceId], true);
    } else {
      const remaining = selectedServiceIds.filter((id) => id !== serviceId);
      if (remaining.length === 0) {
        clearSelection();
      } else {
        selectServices(remaining);
      }
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  // Export handlers
  const handleExport = useCallback((format: 'json' | 'csv', ids?: string[]) => {
    const servicesToExport = exportServices(ids);
    if (servicesToExport.length === 0) {
      addToast({ type: 'warning', title: 'No Services', message: 'No services to export', duration: 3000 });
      return;
    }
    if (format === 'json') {
      downloadServicesAsJSON(servicesToExport);
    } else {
      downloadServicesAsCSV(servicesToExport, getNodeName);
    }
    addToast({
      type: 'success',
      title: 'Export Complete',
      message: `Exported ${servicesToExport.length} ${pluralize('service', servicesToExport.length)} as ${format.toUpperCase()}`,
      duration: 3000,
    });
  }, [exportServices, getNodeName, addToast]);

  // Batch operation handlers
  const handleBatchActivate = useCallback(() => {
    const result = bulkActivate(selectedServiceIds);
    addToast({
      type: result.failed.length > 0 ? 'warning' : 'success',
      title: 'Bulk Activate',
      message: `Activated ${result.activated.length} ${pluralize('service', result.activated.length)}${result.failed.length > 0 ? `, ${result.failed.length} failed` : ''}`,
      duration: 4000,
    });
    clearSelection();
  }, [selectedServiceIds, bulkActivate, addToast, clearSelection]);

  const handleBatchMaintenance = useCallback(() => {
    bulkDeactivate(selectedServiceIds);
    addToast({
      type: 'success',
      title: 'Bulk Maintenance',
      message: `Set ${selectedServiceIds.length} ${pluralize('service', selectedServiceIds.length)} to maintenance`,
      duration: 3000,
    });
    clearSelection();
  }, [selectedServiceIds, bulkDeactivate, addToast, clearSelection]);

  const handleBatchDeleteConfirm = useCallback(() => {
    const result = bulkDelete(selectedServiceIds);
    addToast({
      type: result.blocked.length > 0 ? 'warning' : 'success',
      title: 'Bulk Delete',
      message: `Deleted ${result.removed.length} ${pluralize('service', result.removed.length)}${result.blocked.length > 0 ? `, ${result.blocked.length} blocked` : ''}`,
      duration: 4000,
    });
    clearSelection();
  }, [selectedServiceIds, bulkDelete, addToast, clearSelection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    );
  };

  const handleRowClick = (service: Service) => {
    openServiceInspector(service.id);
  };

  const handleActivate = (e: React.MouseEvent, serviceId: string) => {
    e.stopPropagation();
    const result = activateService(serviceId);
    if (!result.success) {
      addToast({
        type: 'error',
        title: 'Cannot Activate Service',
        message: result.error || 'Unknown error occurred',
        duration: 5000,
      });
    }
  };

  const handleDeactivate = (e: React.MouseEvent, serviceId: string) => {
    e.stopPropagation();
    deactivateService(serviceId);
  };

  const handleDeleteClick = useCallback((e: React.MouseEvent, serviceId: string) => {
    e.stopPropagation();

    const service = services.find((s) => s.id === serviceId);
    if (!service) return;

    if (isL1DWDMService(service)) {
      const dependents = getDependentServices(service.id);
      if (dependents.length > 0) {
        setBlockingAlertDetails(dependents.map((d) => `${d.id} (${d.name})`));
        setShowBlockingAlert(true);
        return;
      }
    }

    setPendingDeleteService(service);
    setShowDeleteConfirm(true);
  }, [services, getDependentServices]);

  const handleDeleteConfirm = useCallback(() => {
    if (!pendingDeleteService) return;

    const result = removeService(pendingDeleteService.id);
    if (result.success) {
      addToast({
        type: 'success',
        title: 'Service Deleted',
        message: `${pendingDeleteService.name || pendingDeleteService.id} has been deleted`,
        duration: 3000,
      });
    } else {
      const blockerList = result.blockers?.join(', ') || 'Unknown blockers';
      addToast({
        type: 'error',
        title: 'Cannot Delete Service',
        message: `Deletion blocked: ${blockerList}`,
        duration: 7000,
      });
    }
    setPendingDeleteService(null);
  }, [pendingDeleteService, removeService, addToast]);

  // FR-023 utilization parity: derive each L1 service's utilization from the
  // canonical UnderlaySelector used by ServiceInspector — keeps table cell
  // and inspector cell numerically identical.
  const utilizationByServiceId = useMemo(() => {
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
    const map = new Map<string, ReturnType<UnderlaySelector['getUnderlayUtilization']>>();
    for (const svc of services) {
      if (isL1DWDMService(svc)) {
        map.set(svc.id, selector.getUnderlayUtilization(svc.id));
      }
    }
    return map;
  }, [services, nodes, edges]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filters + inline batch actions */}
      <div className="flex items-center gap-4 border-b border-border bg-elevated px-4 py-3">
        {/* Left: Search + filter dropdowns */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={typeFilter} onValueChange={(v) => onTypeFilterChange(v as ServiceType | 'all')}>
            <SelectTrigger className="w-36 shrink-0">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {(Object.keys(SERVICE_TYPE_CONFIGS) as ServiceType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  {SERVICE_TYPE_CONFIGS[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as ServiceStatus | 'all')}>
            <SelectTrigger className="w-36 shrink-0">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {(Object.keys(SERVICE_STATUS_CONFIGS) as ServiceStatus[]).map((status) => (
                <SelectItem key={status} value={status}>
                  {SERVICE_STATUS_CONFIGS[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Right: Batch actions (when selected) + Export */}
        <div className="flex shrink-0 items-center gap-2">
          {selectedServiceIds.length > 0 && (
            <BatchActionsBar
              selectedCount={selectedServiceIds.length}
              onClearSelection={clearSelection}
              onExportJSON={() => handleExport('json', selectedServiceIds)}
              onExportCSV={() => handleExport('csv', selectedServiceIds)}
              onDelete={() => setShowBatchDeleteConfirm(true)}
              onActivate={handleBatchActivate}
              onMaintenance={handleBatchMaintenance}
            />
          )}

        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-sticky bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            <tr className="border-b border-border text-left text-sm text-text-secondary">
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={headerCheckState}
                  onCheckedChange={handleHeaderCheckChange}
                />
              </th>
              <th className="px-4 py-3">
                <button
                  onClick={() => handleSort('id')}
                  className="flex items-center gap-1 hover:text-text-primary"
                >
                  ID {getSortIcon('id')}
                </button>
              </th>
              <th className="px-4 py-3">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-1 hover:text-text-primary"
                >
                  Name {getSortIcon('name')}
                </button>
              </th>
              <th className="px-4 py-3">
                <button
                  onClick={() => handleSort('type')}
                  className="flex items-center gap-1 hover:text-text-primary"
                >
                  Type {getSortIcon('type')}
                </button>
              </th>
              <th className="px-4 py-3">
                <button
                  onClick={() => handleSort('status')}
                  className="flex items-center gap-1 hover:text-text-primary"
                >
                  Status {getSortIcon('status')}
                </button>
              </th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">
                <button
                  onClick={() => handleSort('dataRate')}
                  className="flex items-center gap-1 hover:text-text-primary"
                >
                  Data Rate {getSortIcon('dataRate')}
                </button>
              </th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Utilization</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedServices.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  <EmptyState
                    icon={Layers}
                    title={services.length === 0 ? 'No services created yet' : 'No matching services'}
                    description={services.length === 0
                      ? 'Create a service to get started with capacity planning and simulation.'
                      : 'No services match the current filters. Try adjusting your search or filter criteria.'}
                  />
                </td>
              </tr>
            ) : (
              paginatedServices.map((service) => (
                <tr
                  key={service.id}
                  onClick={() => handleRowClick(service)}
                  className={cn(
                    'cursor-pointer border-b border-border transition-colors hover:bg-tertiary',
                    selectedIdsSet.has(service.id) && 'bg-accent/5'
                  )}
                >
                  <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIdsSet.has(service.id)}
                      onCheckedChange={(checked) => handleRowCheckChange(service.id, checked)}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-text-primary">
                    {service.id}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{service.name}</td>
                  <td className="px-4 py-3">
                    <ServiceTypeBadge type={service.type} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <ServiceStatusBadge status={service.status} />
                      {!!service.metadata?.allowNegativeMargin && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
                          title="Service created with negative OSNR margin"
                          data-testid="negative-margin-badge"
                        >
                          <AlertTriangle className="h-2.5 w-2.5" />
                          OSNR
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {getNodeName(service.sourceNodeId)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {getNodeName(service.destinationNodeId)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-text-secondary">
                    {service.dataRate}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {(() => {
                      const channel = getChannelNumber(service);
                      return channel !== null ? (
                        <span className="rounded bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">
                          CH-{channel}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {(() => {
                      if (!isL1DWDMService(service)) {
                        return <span className="text-text-muted">—</span>;
                      }
                      const utilization = utilizationByServiceId.get(service.id);
                      if (!utilization) {
                        return <span className="text-text-muted">—</span>;
                      }
                      const dependentCount = utilization.usedBy.length;
                      if (dependentCount === 0) {
                        return <span className="text-text-muted">0%</span>;
                      }
                      const percent = Math.min(100, Math.round(utilization.utilizationPercent));
                      return (
                        <span
                          className={cn(
                            'font-medium',
                            percent > 80
                              ? 'text-red-400'
                              : percent > 50
                                ? 'text-yellow-400'
                                : 'text-green-400'
                          )}
                          title={`Used by ${dependentCount} overlay ${pluralize('service', dependentCount)}`}
                        >
                          {percent}%
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {(service.status === 'planned' || service.status === 'maintenance') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleActivate(e, service.id)}
                          title="Activate"
                          aria-label="Activate service"
                        >
                          <CheckCircle className="h-4 w-4 text-success" />
                        </Button>
                      )}
                      {service.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDeactivate(e, service.id)}
                          title="Deactivate"
                          aria-label="Deactivate service"
                        >
                          <XCircle className="h-4 w-4 text-warning" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleDeleteClick(e, service.id)}
                        title="Delete"
                        aria-label="Delete service"
                      >
                        <Trash2 className="text-error h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={filteredServices.length}
        startIndex={filteredServices.length === 0 ? 0 : startIndex + 1}
        endIndex={endIndex}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
      />

      {/* Blocking Alert - L1 service has dependents */}
      <AlertDialog
        open={showBlockingAlert}
        onOpenChange={setShowBlockingAlert}
        title="Cannot Delete L1 Service"
        description={`This L1 service is used by ${blockingAlertDetails.length} overlay ${pluralize('service', blockingAlertDetails.length)}. Delete the overlay services first, then delete this L1 service.`}
        details={blockingAlertDetails}
        variant="error"
      />

      {/* Delete Confirmation Dialog (single) */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          setShowDeleteConfirm(open);
          if (!open) setPendingDeleteService(null);
        }}
        title="Delete Service?"
        description={`Are you sure you want to delete "${pendingDeleteService?.name || pendingDeleteService?.id}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />

      {/* Batch Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showBatchDeleteConfirm}
        onOpenChange={setShowBatchDeleteConfirm}
        title="Delete Selected Services?"
        description={`Are you sure you want to delete ${selectedServiceIds.length} ${pluralize('service', selectedServiceIds.length)}? Services with dependents will be skipped. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleBatchDeleteConfirm}
      />
    </div>
  );
};
