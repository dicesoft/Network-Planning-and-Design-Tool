import React, { useState } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore, selectServiceCountByStatus } from '@/stores/serviceStore';
import { useUIStore } from '@/stores/uiStore';
import { NodePalette } from '@/components/topology/NodePalette';
import { HardwarePanel } from '@/components/layout/HardwarePanel';
import { ServicePanel } from '@/components/services';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const Sidebar: React.FC = () => {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const [activeTab, setActiveTab] = useState<'components' | 'hardware'>('components');

  const topology = useNetworkStore((state) => state.topology);
  const serviceCountByStatus = useServiceStore(selectServiceCountByStatus);

  const activeServices = serviceCountByStatus.active;

  const stats = {
    nodes: topology.nodes.length,
    edges: topology.edges.length,
    services: activeServices,
    alerts: topology.edges.filter((e) => e.state === 'failed').length,
  };

  if (sidebarCollapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center border-r border-border bg-elevated py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="mb-4"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside
      className="flex w-sidebar shrink-0 flex-col overflow-hidden border-r border-border bg-elevated"
      data-testid="sidebar"
    >
      {/* Collapse button */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-text-primary">
          {activeTab === 'components' ? 'Components' : 'Hardware'}
        </span>
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Tab toggle */}
      <div className="flex border-b border-border" data-testid="sidebar-tabs">
        <button
          className={cn(
            'flex-1 py-2 text-xs font-medium transition-colors',
            activeTab === 'components'
              ? 'border-b-2 border-accent text-accent'
              : 'text-text-muted hover:text-text-secondary'
          )}
          onClick={() => setActiveTab('components')}
          data-testid="sidebar-tab-components"
        >
          Components
        </button>
        <button
          className={cn(
            'flex-1 py-2 text-xs font-medium transition-colors',
            activeTab === 'hardware'
              ? 'border-b-2 border-accent text-accent'
              : 'text-text-muted hover:text-text-secondary'
          )}
          onClick={() => setActiveTab('hardware')}
          data-testid="sidebar-tab-hardware"
        >
          Hardware
        </button>
      </div>

      {/* Palette / Hardware Section */}
      <div className="border-b border-border p-4">
        {activeTab === 'components' ? (
          <>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Node Palette
            </div>
            <NodePalette />
          </>
        ) : (
          <>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Card Library
            </div>
            <HardwarePanel />
          </>
        )}
      </div>

      {/* Scrollable Content Area */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {/* Network Overview */}
        <div className="border-b border-border p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Network Overview
          </div>
          <div className="flex flex-col gap-3 rounded-lg bg-tertiary p-4">
            {[
              { label: 'Total Nodes', value: stats.nodes, color: 'text-primary' },
              { label: 'Connections', value: stats.edges, color: 'text-primary' },
              { label: 'Active Services', value: stats.services, color: 'text-success' },
              {
                label: 'Alerts',
                value: stats.alerts,
                color: stats.alerts > 0 ? 'text-danger' : 'text-success',
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-text-tertiary">{label}</span>
                <span className={cn('text-sm font-semibold', color)}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Services Section */}
        <div className="p-4">
          <ServicePanel />
        </div>
      </div>
    </aside>
  );
};
