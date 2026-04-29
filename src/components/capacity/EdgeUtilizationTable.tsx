import React, { useState, useMemo, useCallback } from 'react';
import type { EdgeUtilization, BottleneckEdge } from '@/core/services/CapacityTracker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useTableFilter } from '@/hooks/useTableFilter';

// ============================================================================
// HELPERS
// ============================================================================

function getUtilizationColor(percent: number): string {
  if (percent > 80) return 'text-danger';
  if (percent >= 50) return 'text-warning';
  return 'text-success';
}

function getUtilizationBgColor(percent: number): string {
  if (percent > 80) return 'bg-danger';
  if (percent >= 50) return 'bg-warning';
  return 'bg-success';
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// TYPES
// ============================================================================

type FilterTab = 'all' | 'bottlenecks' | 'available' | 'oversubscribed';
type EdgeSortKey = 'edgeId' | 'route' | 'used' | 'utilization' | 'status';

interface EdgeRow {
  eu: EdgeUtilization;
  edgeId: string;
  route: string;
  isBottleneck: boolean;
  isOversubscribed: boolean;
}

interface EdgeUtilizationTableProps {
  edgeUtilizations: EdgeUtilization[];
  bottlenecks: BottleneckEdge[];
  oversubscribed: BottleneckEdge[];
  getEdgeEndpoints: (edgeId: string) => { source: string; target: string } | null;
  onEdgeClick?: (edgeId: string) => void;
  alertFilter?: string | null;
  onClearAlertFilter?: () => void;
}

function SortIcon({ direction }: { direction: 'ascending' | 'descending' | 'none' }) {
  if (direction === 'ascending') return <ArrowUp className="ml-1 inline h-3 w-3" />;
  if (direction === 'descending') return <ArrowDown className="ml-1 inline h-3 w-3" />;
  return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-30" />;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const EdgeUtilizationTable: React.FC<EdgeUtilizationTableProps> = ({
  edgeUtilizations,
  bottlenecks,
  oversubscribed,
  getEdgeEndpoints,
  onEdgeClick,
  alertFilter,
  onClearAlertFilter,
}) => {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const bottleneckIds = useMemo(() => new Set(bottlenecks.map((b) => b.edgeId)), [bottlenecks]);
  const oversubscribedIds = useMemo(() => new Set(oversubscribed.map((o) => o.edgeId)), [oversubscribed]);

  // Build row data
  const allRows = useMemo((): EdgeRow[] => {
    return edgeUtilizations.map((eu) => {
      const endpoints = getEdgeEndpoints(eu.edgeId);
      return {
        eu,
        edgeId: eu.edgeId,
        route: endpoints ? `${endpoints.source} \u2192 ${endpoints.target}` : 'Unknown',
        isBottleneck: bottleneckIds.has(eu.edgeId),
        isOversubscribed: oversubscribedIds.has(eu.edgeId),
      };
    });
  }, [edgeUtilizations, getEdgeEndpoints, bottleneckIds, oversubscribedIds]);

  // Tab filter
  const tabFilteredRows = useMemo(() => {
    let result = allRows;
    switch (filterTab) {
      case 'bottlenecks':
        result = result.filter((r) => r.eu.percentage >= 80);
        break;
      case 'available':
        result = result.filter((r) => r.eu.percentage < 100);
        break;
      case 'oversubscribed':
        result = result.filter((r) => r.eu.percentage >= 100);
        break;
    }
    // Alert filter
    if (alertFilter) {
      result = result.filter((r) => r.route.toLowerCase().includes(alertFilter.toLowerCase()) || r.edgeId.includes(alertFilter));
    }
    return result;
  }, [allRows, filterTab, alertFilter]);

  const filterCounts = useMemo(() => ({
    all: edgeUtilizations.length,
    bottlenecks: edgeUtilizations.filter((eu) => eu.percentage >= 80).length,
    available: edgeUtilizations.filter((eu) => eu.percentage < 100).length,
    oversubscribed: edgeUtilizations.filter((eu) => eu.percentage >= 100).length,
  }), [edgeUtilizations]);

  // Sort + search
  const sortFns: Partial<Record<EdgeSortKey, (a: EdgeRow, b: EdgeRow) => number>> = useMemo(() => ({
    edgeId: (a, b) => a.edgeId.localeCompare(b.edgeId),
    route: (a, b) => a.route.localeCompare(b.route),
    used: (a, b) => a.eu.used - b.eu.used,
    utilization: (a, b) => a.eu.percentage - b.eu.percentage,
    status: (a, b) => {
      const statusRank = (r: EdgeRow) => r.isOversubscribed ? 2 : r.isBottleneck ? 1 : 0;
      return statusRank(a) - statusRank(b);
    },
  }), []);

  const {
    filtered,
    searchQuery,
    setSearchQuery,
    toggleSort,
    getAriaSortValue,
  } = useTableFilter<EdgeRow, EdgeSortKey>({
    data: tabFilteredRows,
    searchKeys: ['edgeId', 'route'],
    sortFns,
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEdges = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const startIndex = filtered.length > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(safePage * pageSize, filtered.length);

  const handleFilterChange = (tab: FilterTab) => {
    setFilterTab(tab);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  // Selection
  const allPageIds = useMemo(() => paginatedEdges.map((r) => r.edgeId), [paginatedEdges]);
  const allPageSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));
  const somePageSelected = allPageIds.some((id) => selectedIds.has(id));

  const toggleRow = useCallback((edgeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(edgeId)) next.delete(edgeId);
      else next.add(edgeId);
      return next;
    });
  }, []);

  const toggleAllPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of allPageIds) next.delete(id);
      } else {
        for (const id of allPageIds) next.add(id);
      }
      return next;
    });
  }, [allPageIds, allPageSelected]);

  // Export
  const exportSelected = useCallback((format: 'csv' | 'json') => {
    const selected = filtered.filter((r) => selectedIds.has(r.edgeId));
    if (selected.length === 0) return;

    if (format === 'json') {
      const data = selected.map((r) => ({
        edgeId: r.edgeId,
        route: r.route,
        used: r.eu.used,
        total: r.eu.total,
        available: r.eu.available,
        utilization: r.eu.percentage,
        status: r.isOversubscribed ? 'oversubscribed' : r.isBottleneck ? 'bottleneck' : 'ok',
      }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      triggerDownload(blob, 'edge-utilization.json');
    } else {
      const headers = ['Edge ID', 'Route', 'Used', 'Total', 'Available', 'Utilization %', 'Status'];
      const rows = selected.map((r) => [
        r.edgeId,
        r.route,
        String(r.eu.used),
        String(r.eu.total),
        String(r.eu.available),
        String(r.eu.percentage),
        r.isOversubscribed ? 'Oversubscribed' : r.isBottleneck ? 'Bottleneck' : 'OK',
      ]);
      const csv = [
        headers.map(escapeCSV).join(','),
        ...rows.map((row) => row.map(escapeCSV).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      triggerDownload(blob, 'edge-utilization.csv');
    }
  }, [filtered, selectedIds]);

  const filterOptions: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'bottlenecks', label: 'Bottlenecks' },
    { id: 'available', label: 'Available' },
    { id: 'oversubscribed', label: 'Oversubscribed' },
  ];

  const sortableHeaders: { key: EdgeSortKey; label: string }[] = [
    { key: 'edgeId', label: 'Edge ID' },
    { key: 'route', label: 'Route' },
    { key: 'used', label: 'Used / Total' },
    { key: 'utilization', label: 'Utilization' },
    { key: 'status', label: 'Status' },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border">
      {/* Header with title, search, filter tabs */}
      <div className="flex flex-col gap-2 border-b border-border bg-elevated px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Edge Utilization</h3>
            <p className="text-xs text-text-tertiary">
              {filtered.length} edge{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-muted">{selectedIds.size} selected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => exportSelected('csv')}
                >
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => exportSelected('json')}
                >
                  <Download className="h-3 w-3" />
                  JSON
                </Button>
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search edges..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-48 rounded-md border border-border bg-canvas pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-lg bg-tertiary p-1">
            {filterOptions.map((opt) => (
              <button
                key={opt.id}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  filterTab === opt.id
                    ? 'bg-elevated text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
                onClick={() => handleFilterChange(opt.id)}
              >
                {opt.label}
                <span className="ml-1 text-text-muted">({filterCounts[opt.id]})</span>
              </button>
            ))}
          </div>
          {alertFilter && (
            <div className="bg-accent/10 flex items-center gap-1 rounded-full px-2.5 py-1">
              <span className="text-xs font-medium text-accent">Filtered by: {alertFilter}</span>
              <button
                onClick={onClearAlertFilter}
                className="hover:bg-accent/20 ml-0.5 rounded-full p-0.5"
              >
                <X className="h-3 w-3 text-accent" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-sticky bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            <tr className="border-b border-border text-left text-sm text-text-secondary">
              <th className="w-10 px-3 py-3">
                <Checkbox
                  checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAllPage}
                  aria-label="Select all on page"
                />
              </th>
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
            </tr>
          </thead>
          <tbody>
            {paginatedEdges.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                  {edgeUtilizations.length === 0
                    ? 'No edges in topology.'
                    : 'No edges match the selected filter.'}
                </td>
              </tr>
            ) : (
              paginatedEdges.map((row) => (
                <tr
                  key={row.edgeId}
                  className={cn(
                    'border-b border-border transition-colors',
                    onEdgeClick && 'cursor-pointer',
                    selectedIds.has(row.edgeId) ? 'bg-accent/5' : 'hover:bg-tertiary',
                  )}
                >
                  <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(row.edgeId)}
                      onCheckedChange={() => toggleRow(row.edgeId)}
                      aria-label={`Select edge ${row.edgeId}`}
                    />
                  </td>
                  <td
                    className="px-4 py-3 font-mono text-sm text-text-primary"
                    onClick={() => onEdgeClick?.(row.edgeId)}
                  >
                    {row.edgeId.slice(0, 12)}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-text-secondary"
                    onClick={() => onEdgeClick?.(row.edgeId)}
                  >
                    {row.route}
                  </td>
                  <td
                    className="px-4 py-3 font-mono text-sm text-text-secondary"
                    onClick={() => onEdgeClick?.(row.edgeId)}
                  >
                    {row.eu.used} / {row.eu.total}
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={() => onEdgeClick?.(row.edgeId)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-tertiary">
                        <div
                          className={cn('h-full rounded-full transition-all', getUtilizationBgColor(row.eu.percentage))}
                          style={{ width: `${Math.min(row.eu.percentage, 100)}%` }}
                        />
                      </div>
                      <span className={cn('text-sm font-medium', getUtilizationColor(row.eu.percentage))}>
                        {row.eu.percentage}%
                      </span>
                    </div>
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={() => onEdgeClick?.(row.edgeId)}
                  >
                    <div className="flex items-center gap-1.5">
                      {row.isOversubscribed && (
                        <span className="bg-danger/10 rounded px-2 py-0.5 text-xs font-medium text-danger">
                          Oversubscribed
                        </span>
                      )}
                      {row.isBottleneck && !row.isOversubscribed && (
                        <span className="bg-warning/10 rounded px-2 py-0.5 text-xs font-medium text-warning">
                          Bottleneck
                        </span>
                      )}
                      {!row.isBottleneck && (
                        <span className="bg-success/10 rounded px-2 py-0.5 text-xs font-medium text-success">
                          OK
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between border-t border-border bg-elevated px-4 py-2">
        <span className="text-sm text-text-secondary">
          {filtered.length > 0
            ? `Showing ${startIndex}\u2013${endIndex} of ${filtered.length}`
            : 'No results'}
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-tertiary">Per page</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-16 text-center text-xs text-text-secondary">
              {safePage} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
