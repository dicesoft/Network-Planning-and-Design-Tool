import React, { useMemo, useState } from 'react';
import { useServiceStore } from '@/stores/serviceStore';
import {
  SERVICE_TYPE_CONFIGS,
  SERVICE_STATUS_CONFIGS,
  isL1DWDMService,
  isL2L3Service,
} from '@/types/service';
import type { Service, L1DWDMService, L2L3Service } from '@/types/service';
import { useTableFilter } from '@/hooks/useTableFilter';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';

// ============================================================================
// TYPES
// ============================================================================

interface ServiceUtilizationTableProps {
  getNodeName: (nodeId: string) => string;
}

type ServiceSortKey = 'id' | 'name' | 'type' | 'status' | 'dataRate';

type ServiceTypeFilter = 'all' | 'l1' | 'l2l3';

interface ServiceRow {
  service: Service;
  id: string;
  name: string;
  type: string;
  rawType: Service['type'];
  typeBadgeColor: string;
  status: string;
  statusColor: string;
  statusBgColor: string;
  source: string;
  destination: string;
  dataRate: string;
  bandwidth: string;
  channelInfo: string;
  protectionInfo: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function buildServiceRow(service: Service, getNodeName: (id: string) => string): ServiceRow {
  const typeCfg = SERVICE_TYPE_CONFIGS[service.type];
  const statusCfg = SERVICE_STATUS_CONFIGS[service.status];

  let channelInfo = '-';
  let protectionInfo = 'None';
  let bandwidth = '-';

  if (isL1DWDMService(service)) {
    const l1 = service as L1DWDMService;
    channelInfo = l1.channelNumber != null ? `CH ${l1.channelNumber}` : '-';
    protectionInfo = l1.protectionScheme !== 'none' ? l1.protectionScheme.toUpperCase() : 'None';
  } else if (isL2L3Service(service)) {
    const l2 = service as L2L3Service;
    channelInfo = `Underlay: ${l2.underlayServiceId}`;
    protectionInfo = l2.protectionScheme !== 'none' ? l2.protectionScheme.toUpperCase() : 'None';
    bandwidth = l2.dataRate;
  }

  return {
    service,
    id: service.id,
    name: service.name,
    type: typeCfg.shortLabel,
    rawType: service.type,
    typeBadgeColor: typeCfg.color,
    status: statusCfg.label,
    statusColor: statusCfg.color,
    statusBgColor: statusCfg.bgColor,
    source: getNodeName(service.sourceNodeId),
    destination: getNodeName(service.destinationNodeId),
    dataRate: service.dataRate,
    bandwidth,
    channelInfo,
    protectionInfo,
  };
}

const SORT_FNS: Partial<Record<ServiceSortKey, (a: ServiceRow, b: ServiceRow) => number>> = {
  id: (a, b) => a.id.localeCompare(b.id),
  name: (a, b) => a.name.localeCompare(b.name),
  type: (a, b) => a.type.localeCompare(b.type),
  status: (a, b) => a.status.localeCompare(b.status),
  dataRate: (a, b) => {
    const numA = parseInt(a.dataRate.replace('G', ''), 10);
    const numB = parseInt(b.dataRate.replace('G', ''), 10);
    return numA - numB;
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

function SortIcon({ direction }: { direction: 'ascending' | 'descending' | 'none' }) {
  if (direction === 'ascending') return <ArrowUp className="ml-1 inline h-3 w-3" />;
  if (direction === 'descending') return <ArrowDown className="ml-1 inline h-3 w-3" />;
  return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-30" />;
}

export const ServiceUtilizationTable: React.FC<ServiceUtilizationTableProps> = ({ getNodeName }) => {
  const services = useServiceStore((state) => state.services);
  const [typeFilter, setTypeFilter] = useState<ServiceTypeFilter>('all');

  const allRows = useMemo(
    () => services.map((s) => buildServiceRow(s, getNodeName)),
    [services, getNodeName],
  );

  const rows = useMemo(() => {
    if (typeFilter === 'all') return allRows;
    if (typeFilter === 'l1') return allRows.filter((r) => r.rawType === 'l1-dwdm');
    return allRows.filter((r) => r.rawType !== 'l1-dwdm');
  }, [allRows, typeFilter]);

  const l1Count = useMemo(() => services.filter((s) => s.type === 'l1-dwdm').length, [services]);
  const l2l3Count = useMemo(() => services.filter((s) => s.type !== 'l1-dwdm').length, [services]);

  const {
    filtered,
    searchQuery,
    setSearchQuery,
    toggleSort,
    getAriaSortValue,
  } = useTableFilter<ServiceRow, ServiceSortKey>({
    data: rows,
    searchKeys: ['id', 'name', 'source', 'destination', 'dataRate'],
    sortFns: SORT_FNS,
  });

  if (services.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No services provisioned. Create services to view utilization data.
      </div>
    );
  }

  const sortableHeaders: { key: ServiceSortKey; label: string }[] = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status' },
    { key: 'dataRate', label: 'Rate' },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-elevated px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Service Utilization</h3>
          <p className="text-xs text-text-tertiary">
            {l1Count} L1 service{l1Count !== 1 ? 's' : ''}, {l2l3Count} L2/L3 service{l2l3Count !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Type filter toggle */}
          <div className="flex items-center gap-1 rounded-md border border-border bg-canvas p-0.5">
            <Filter className="mx-1 h-3 w-3 text-text-muted" />
            {([
              { key: 'all' as const, label: 'All' },
              { key: 'l1' as const, label: 'L1' },
              { key: 'l2l3' as const, label: 'L2/L3' },
            ]).map((opt) => (
              <button
                key={opt.key}
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium transition-colors',
                  typeFilter === opt.key
                    ? 'bg-accent text-white'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
                onClick={() => setTypeFilter(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 rounded-md border border-border bg-canvas pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-sticky bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            <tr className="border-b border-border text-left text-sm text-text-secondary">
              {sortableHeaders.map((h) => (
                <th
                  key={h.key}
                  className="cursor-pointer select-none px-4 py-3 hover:text-text-primary"
                  aria-sort={getAriaSortValue(h.key)}
                  onClick={() => toggleSort(h.key)}
                >
                  {h.label}
                  <SortIcon direction={getAriaSortValue(h.key)} />
                </th>
              ))}
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Bandwidth</th>
              <th className="px-4 py-3">Channel/Underlay</th>
              <th className="px-4 py-3">Protection</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <EmptyState
                    icon={Layers}
                    title="No matching services"
                    description="No services match the current search or filter criteria."
                    className="py-8"
                  />
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border transition-colors hover:bg-tertiary"
                >
                  <td className="px-4 py-3 font-mono text-sm text-text-primary">{row.id}</td>
                  <td className="px-4 py-3 text-sm text-text-primary">{row.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: row.typeBadgeColor }}
                    >
                      {row.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded px-2 py-0.5 text-xs font-medium"
                      style={{ color: row.statusColor, backgroundColor: row.statusBgColor }}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-text-secondary">{row.dataRate}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.source}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.destination}</td>
                  <td className="px-4 py-3 font-mono text-sm text-text-secondary">{row.bandwidth}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.channelInfo}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.protectionInfo}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* L2/L3 placeholder note */}
      {l2l3Count > 0 && (
        <div className="border-t border-border bg-elevated px-4 py-2 text-xs text-text-muted">
          L2/L3 service bandwidth utilization metrics coming in a future release.
        </div>
      )}
    </div>
  );
};
