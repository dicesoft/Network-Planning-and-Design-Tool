import React from 'react';
import { useServiceStore } from '@/stores/serviceStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { Service, isL1DWDMService, L1DWDMService, L1DataRate } from '@/types/service';
import { ServiceStatusBadge } from './ServiceStatusBadge';
import { ServiceTypeBadge } from './ServiceTypeBadge';
import { ArrowRight, Shield, Radio, X, Cable } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// Data rate to Gbps conversion for utilization calculation
const DATA_RATE_GBPS: Record<L1DataRate, number> = {
  '10G': 10,
  '25G': 25,
  '100G': 100,
  '200G': 200,
  '400G': 400,
};

/**
 * ServiceList - Card-based scrollable list of services
 */
export const ServiceList: React.FC = () => {
  const services = useServiceStore((state) => state.getFilteredServices());
  const selectedServiceIds = useServiceStore((state) => state.selectedServiceIds);
  const selectServices = useServiceStore((state) => state.selectServices);
  const clearSelection = useServiceStore((state) => state.clearSelection);
  const getDependentServices = useServiceStore((state) => state.getDependentServices);
  const openServiceInspector = useUIStore((state) => state.openServiceInspector);
  const getNode = useNetworkStore((state) => state.getNode);

  const handleServiceClick = (service: Service, event: React.MouseEvent) => {
    const isCtrlClick = event.ctrlKey || event.metaKey;

    if (isCtrlClick) {
      // Toggle selection
      if (selectedServiceIds.includes(service.id)) {
        selectServices(selectedServiceIds.filter((id) => id !== service.id));
      } else {
        selectServices([...selectedServiceIds, service.id]);
      }
    } else {
      // Single selection and open inspector
      selectServices([service.id]);
      openServiceInspector(service.id);
    }
  };

  if (services.length === 0) {
    return (
      <EmptyState
        icon={Cable}
        title="No services found"
        description="Create services using the Add Service button or the Service Wizard."
      />
    );
  }

  return (
    <div className="space-y-2">
      {/* Selection header - shows when services are selected */}
      {selectedServiceIds.length > 0 && (
        <div className="bg-accent/10 border-accent/30 flex items-center justify-between rounded-md border px-2 py-1.5">
          <span className="text-xs font-medium text-accent">
            {selectedServiceIds.length} service{selectedServiceIds.length !== 1 ? 's' : ''} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              clearSelection();
            }}
            className="hover:bg-accent/20 h-6 px-2 text-xs text-accent hover:text-accent"
          >
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        </div>
      )}

      {/* Service cards list */}
      <div className="custom-scrollbar max-h-[280px] space-y-2 overflow-y-auto pr-1">
      {services.map((service) => {
        const sourceNode = getNode(service.sourceNodeId);
        const destNode = getNode(service.destinationNodeId);
        const isSelected = selectedServiceIds.includes(service.id);
        const hasProtection = isL1DWDMService(service)
          ? service.protectionScheme !== 'none'
          : service.protectionScheme !== 'none';

        // Get channel number for L1 services
        const channelNumber = isL1DWDMService(service)
          ? (service as L1DWDMService).channelNumber ||
            (service as L1DWDMService).workingPath?.channelNumber ||
            null
          : null;

        // Get utilization percentage for L1 services
        const utilization = (() => {
          if (!isL1DWDMService(service)) return null;
          const dependents = getDependentServices(service.id);
          if (dependents.length === 0) return { percent: 0, count: 0 };
          const totalCapacity = DATA_RATE_GBPS[service.dataRate] || 100;
          const usedCapacity = dependents.reduce((sum, dep) => {
            return sum + (DATA_RATE_GBPS[dep.dataRate] || 0);
          }, 0);
          const percent = Math.min(100, Math.round((usedCapacity / totalCapacity) * 100));
          return { percent, count: dependents.length };
        })();

        return (
          <div
            key={service.id}
            onClick={(e) => handleServiceClick(service, e)}
            className={cn(
              'p-3 rounded-lg cursor-pointer transition-all',
              'border',
              isSelected
                ? 'bg-accent/10 border-accent'
                : 'bg-tertiary border-transparent hover:border-border hover:bg-border'
            )}
          >
            {/* Top Row: ID, Type Badge, Utilization, Status Badge */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-text-tertiary">
                  {service.id}
                </span>
                <ServiceTypeBadge type={service.type} size="sm" />
                {/* L1 utilization indicator */}
                {utilization && utilization.count > 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                      utilization.percent > 80
                        ? 'bg-red-500/10 text-red-400'
                        : utilization.percent > 50
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-green-500/10 text-green-400'
                    )}
                    title={`${utilization.percent}% utilized by ${utilization.count} overlay service(s)`}
                  >
                    {utilization.percent}%
                  </span>
                )}
              </div>
              <ServiceStatusBadge status={service.status} size="sm" />
            </div>

            {/* Service Name */}
            <div className="mb-1.5 truncate text-sm font-medium text-text-primary">
              {service.name}
            </div>

            {/* Endpoints */}
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="max-w-[80px] truncate" title={sourceNode?.name}>
                {sourceNode?.name || 'Unknown'}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0 text-text-muted" />
              <span className="max-w-[80px] truncate" title={destNode?.name}>
                {destNode?.name || 'Unknown'}
              </span>
              <div className="ml-auto flex items-center gap-1">
                {channelNumber && (
                  <span
                    className="bg-primary/10 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary"
                    title={`Channel ${channelNumber}`}
                  >
                    <Radio className="h-2.5 w-2.5" />
                    CH-{channelNumber}
                  </span>
                )}
                {hasProtection && (
                  <span title="Protected">
                    <Shield className="h-3 w-3 shrink-0 text-success" />
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
};
