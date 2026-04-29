import React, { useState, useCallback } from 'react';
import { Header, StatusBar } from '@/components/layout';
import {
  ServicesTable,
  ServiceInspector,
  ServiceEditModal,
  ServiceSummaryCards,
} from '@/components/services';
import { useUIStore } from '@/stores/uiStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useNetworkStore } from '@/stores/networkStore';
import { Button } from '@/components/ui/button';
import { Wand2, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadServicesAsJSON, downloadServicesAsCSV } from '@/lib/exportServices';
import type { ServiceType, ServiceStatus } from '@/types/service';
import type { CardFilter } from '@/components/services/ServiceSummaryCards';

export const ServicesPage: React.FC = () => {
  const inspector = useUIStore((state) => state.inspector);
  const openModal = useUIStore((state) => state.openModal);
  const addToast = useUIStore((state) => state.addToast);
  const services = useServiceStore((state) => state.services);

  // Filter state (lifted from ServicesTable so cards can drive it)
  const [typeFilter, setTypeFilter] = useState<ServiceType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | 'all'>('all');
  const [ipCardActive, setIpCardActive] = useState(false);
  const [activeCardFilter, setActiveCardFilter] = useState<CardFilter>('all');

  // Count services by type
  const dwdmCount = services.filter((s) => s.type === 'l1-dwdm').length;
  const ipCount = services.filter((s) => s.type === 'l2-ethernet' || s.type === 'l3-ip').length;
  const failedCount = services.filter((s) => s.status === 'failed').length;

  const handleCardFilterChange = useCallback((filter: CardFilter) => {
    setActiveCardFilter(filter);
    setIpCardActive(false);

    switch (filter) {
      case 'dwdm':
        setTypeFilter('l1-dwdm');
        setStatusFilter('all');
        break;
      case 'ip':
        setTypeFilter('all');
        setStatusFilter('all');
        setIpCardActive(true);
        break;
      case 'down':
        setTypeFilter('all');
        setStatusFilter('failed');
        break;
      default: // 'all'
        setTypeFilter('all');
        setStatusFilter('all');
        break;
    }
  }, []);

  // When user changes filter dropdowns directly, clear the card active state
  const handleTypeFilterChange = useCallback((value: ServiceType | 'all') => {
    setTypeFilter(value);
    setActiveCardFilter('all');
    setIpCardActive(false);
  }, []);

  const handleStatusFilterChange = useCallback((value: ServiceStatus | 'all') => {
    setStatusFilter(value);
    setActiveCardFilter('all');
    setIpCardActive(false);
  }, []);

  const nodes = useNetworkStore((state) => state.topology.nodes);
  const exportServicesData = useServiceStore((state) => state.exportServices);

  const getNodeName = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    return node?.name || nodeId.slice(0, 8);
  }, [nodes]);

  const handleExport = useCallback((format: 'json' | 'csv') => {
    const servicesToExport = exportServicesData();
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
      message: `Exported ${servicesToExport.length} service(s) as ${format.toUpperCase()}`,
      duration: 3000,
    });
  }, [exportServicesData, getNodeName, addToast]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-border bg-elevated px-6 py-4">
            <h1 className="text-xl font-semibold text-text-primary" data-testid="services-page">Services</h1>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" data-testid="export-services-dropdown">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport('json')}>
                    Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('csv')}>
                    Export as CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => openModal('service-wizard')}>
                <Wand2 className="mr-2 h-4 w-4" />
                Service Wizard
              </Button>
            </div>
          </div>

          {/* Summary cards */}
          <ServiceSummaryCards
            totalCount={services.length}
            dwdmCount={dwdmCount}
            ipCount={ipCount}
            failedCount={failedCount}
            activeFilter={activeCardFilter}
            onFilterChange={handleCardFilterChange}
          />

          {/* Table */}
          <ServicesTable
            typeFilter={typeFilter}
            statusFilter={statusFilter}
            ipCardActive={ipCardActive}
            onTypeFilterChange={handleTypeFilterChange}
            onStatusFilterChange={handleStatusFilterChange}
          />
        </div>

        {/* Inspector panel */}
        {inspector.isOpen && inspector.type === 'service' && <ServiceInspector />}
      </div>

      <StatusBar />

      {/* Modals */}
      <ServiceEditModal />
    </div>
  );
};

export default ServicesPage;
