import React from 'react';
import {
  useServiceStore,
  selectServiceCountByType,
  selectServiceCountByStatus,
} from '@/stores/serviceStore';
import { useUIStore } from '@/stores/uiStore';
import { SERVICE_TYPE_CONFIGS, SERVICE_STATUS_CONFIGS, ServiceType, ServiceStatus } from '@/types/service';
import { Button } from '@/components/ui/button';
import { ServiceList } from './ServiceList';
import { PlusCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ServicePanel - Sidebar panel for service management
 * Shows service counts by type and status, quick filters, and service list
 */
export const ServicePanel: React.FC = () => {
  const countByType = useServiceStore(selectServiceCountByType);
  const countByStatus = useServiceStore(selectServiceCountByStatus);
  const filters = useServiceStore((state) => state.filters);
  const setFilters = useServiceStore((state) => state.setFilters);
  const clearFilters = useServiceStore((state) => state.clearFilters);
  const openModal = useUIStore((state) => state.openModal);

  const totalServices = Object.values(countByType).reduce((a, b) => a + b, 0);
  const hasFilters = filters.type?.length || filters.status?.length;

  const handleTypeFilter = (type: ServiceType) => {
    const currentTypes = filters.type || [];
    if (currentTypes.includes(type)) {
      setFilters({ type: currentTypes.filter((t) => t !== type) });
    } else {
      setFilters({ type: [...currentTypes, type] });
    }
  };

  const handleStatusFilter = (status: ServiceStatus) => {
    const currentStatuses = filters.status || [];
    if (currentStatuses.includes(status)) {
      setFilters({ status: currentStatuses.filter((s) => s !== status) });
    } else {
      setFilters({ status: [...currentStatuses, status] });
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Services
          </span>
          <span className="text-xs text-text-muted">({totalServices})</span>
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-primary"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Type Summary - Quick Filters */}
      <div className="mb-3 flex gap-2">
        {(Object.keys(SERVICE_TYPE_CONFIGS) as ServiceType[]).map((type) => {
          const config = SERVICE_TYPE_CONFIGS[type];
          const count = countByType[type];
          const isActive = filters.type?.includes(type);

          return (
            <button
              key={type}
              onClick={() => handleTypeFilter(type)}
              className={cn(
                'flex-1 flex flex-col items-center py-2 px-2 rounded-lg transition-all border',
                isActive
                  ? 'border-accent bg-accent/10'
                  : 'border-transparent bg-tertiary hover:bg-border'
              )}
            >
              <span
                className="text-lg font-bold"
                style={{ color: config.color }}
              >
                {count}
              </span>
              <span className="text-[10px] uppercase text-text-tertiary">
                {config.shortLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status Quick Filters */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(Object.keys(SERVICE_STATUS_CONFIGS) as ServiceStatus[])
          .filter((status) => countByStatus[status] > 0 || filters.status?.includes(status))
          .map((status) => {
            const config = SERVICE_STATUS_CONFIGS[status];
            const count = countByStatus[status];
            const isActive = filters.status?.includes(status);

            return (
              <button
                key={status}
                onClick={() => handleStatusFilter(status)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all',
                  isActive
                    ? 'ring-1 ring-accent ring-offset-1 ring-offset-canvas'
                    : 'hover:opacity-80'
                )}
                style={{
                  backgroundColor: config.bgColor,
                  color: config.color,
                }}
              >
                {config.label}
                <span className="opacity-70">({count})</span>
              </button>
            );
          })}
      </div>

      {/* Service List */}
      <ServiceList />

      {/* Add Service Button */}
      <Button
        variant="outline"
        size="sm"
        className="mt-3 justify-start"
        onClick={() => openModal('service-wizard')}
      >
        <PlusCircle className="mr-2 h-4 w-4" />
        Add Service
      </Button>
    </div>
  );
};
