import React, { useMemo } from 'react';
import type { CapacityTracker, NodeUtilization } from '@/core/services/CapacityTracker';
import type { NetworkNode } from '@/types/network';
import { NODE_TYPE_CONFIGS } from '@/types/network';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useTableFilter } from '@/hooks/useTableFilter';

// ============================================================================
// TYPES
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

interface NodeCapacityTableProps {
  tracker: CapacityTracker;
  nodes: NetworkNode[];
}

interface NodeRow {
  nu: NodeUtilization;
  nodeName: string;
  nodeType: string;
  nodeTypeLabel: string;
}

type NodeSortKey = 'name' | 'type' | 'totalPorts' | 'utilization' | 'switchingCapacity' | 'switchingUtilization';

function SortIcon({ direction }: { direction: 'ascending' | 'descending' | 'none' }) {
  if (direction === 'ascending') return <ArrowUp className="ml-1 inline h-3 w-3" />;
  if (direction === 'descending') return <ArrowDown className="ml-1 inline h-3 w-3" />;
  return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-30" />;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const NodeCapacityTable: React.FC<NodeCapacityTableProps> = ({ tracker, nodes }) => {
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const nodeRows = useMemo(() => {
    const utilMap = tracker.getAllNodeUtilization();
    const rows: NodeRow[] = [];
    for (const [, nu] of utilMap) {
      const node = nodes.find((n) => n.id === nu.nodeId);
      const typeCfg = node ? NODE_TYPE_CONFIGS[node.type] : null;
      rows.push({
        nu,
        nodeName: node?.name || nu.nodeId.slice(0, 8),
        nodeType: node?.type || 'unknown',
        nodeTypeLabel: typeCfg?.label || 'Unknown',
      });
    }
    return rows;
  }, [tracker, nodes]);

  const sortFns: Partial<Record<NodeSortKey, (a: NodeRow, b: NodeRow) => number>> = useMemo(() => ({
    name: (a, b) => a.nodeName.localeCompare(b.nodeName),
    type: (a, b) => a.nodeTypeLabel.localeCompare(b.nodeTypeLabel),
    totalPorts: (a, b) => a.nu.totalPorts - b.nu.totalPorts,
    utilization: (a, b) => a.nu.portUtilizationPercent - b.nu.portUtilizationPercent,
    switchingCapacity: (a, b) => (a.nu.switchingCapacity ?? 0) - (b.nu.switchingCapacity ?? 0),
    switchingUtilization: (a, b) => (a.nu.switchingUtilization ?? 0) - (b.nu.switchingUtilization ?? 0),
  }), []);

  const {
    filtered,
    searchQuery,
    setSearchQuery,
    toggleSort,
    getAriaSortValue,
  } = useTableFilter<NodeRow, NodeSortKey>({
    data: nodeRows,
    searchKeys: ['nodeName', 'nodeTypeLabel'],
    sortFns,
    defaultSort: { key: 'utilization', direction: 'desc' },
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedNodes = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const startIndex = filtered.length > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(safePage * pageSize, filtered.length);

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  const hasSwitchingData = nodeRows.some((r) => r.nu.switchingCapacity !== undefined);

  if (nodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No nodes in the topology.
      </div>
    );
  }

  const sortableHeaders: { key: NodeSortKey; label: string; show: boolean }[] = [
    { key: 'name', label: 'Node', show: true },
    { key: 'type', label: 'Type', show: true },
    { key: 'totalPorts', label: 'Total Ports', show: true },
    { key: 'utilization', label: 'Utilization', show: true },
    { key: 'switchingCapacity', label: 'Switching (Gbps)', show: hasSwitchingData },
    { key: 'switchingUtilization', label: 'SW Util', show: hasSwitchingData },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-elevated px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Port & Switching Capacity</h3>
            <p className="text-xs text-text-tertiary">
              {filtered.length} node{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 rounded-md border border-border bg-canvas pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-sticky bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
              <tr className="border-b border-border text-left text-sm text-text-secondary">
                {sortableHeaders.filter((h) => h.show).map((h) => (
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
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3">DWDM</th>
                <th className="px-4 py-3">BW</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedNodes.length === 0 ? (
                <tr>
                  <td colSpan={sortableHeaders.filter((h) => h.show).length + 4} className="px-4 py-8 text-center text-sm text-text-muted">
                    No nodes match the search criteria.
                  </td>
                </tr>
              ) : (
                paginatedNodes.map((row) => {
                  const { nu } = row;
                  return (
                    <tr
                      key={nu.nodeId}
                      className="border-b border-border transition-colors hover:bg-tertiary"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">
                        {row.nodeName}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {row.nodeTypeLabel}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-text-secondary">
                        {nu.totalPorts}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-tertiary">
                            <div
                              className={cn('h-full rounded-full transition-all', getUtilizationBgColor(nu.portUtilizationPercent))}
                              style={{ width: `${Math.min(nu.portUtilizationPercent, 100)}%` }}
                            />
                          </div>
                          <span className={cn('text-sm font-medium', getUtilizationColor(nu.portUtilizationPercent))}>
                            {nu.portUtilizationPercent}%
                          </span>
                        </div>
                      </td>
                      {hasSwitchingData && (
                        <>
                          <td className="px-4 py-3 font-mono text-sm text-text-secondary">
                            {nu.switchingCapacity != null ? `${nu.switchingCapacity}` : '-'}
                          </td>
                          <td className="px-4 py-3">
                            {nu.switchingUtilization != null ? (
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-12 overflow-hidden rounded-full bg-tertiary">
                                  <div
                                    className={cn('h-full rounded-full transition-all', getUtilizationBgColor(nu.switchingUtilization))}
                                    style={{ width: `${Math.min(nu.switchingUtilization, 100)}%` }}
                                  />
                                </div>
                                <span className={cn('text-xs font-medium', getUtilizationColor(nu.switchingUtilization))}>
                                  {nu.switchingUtilization}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-text-muted">-</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 font-mono text-sm text-text-secondary">
                        {nu.usedPorts} / {nu.totalPorts}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-text-secondary">
                        {nu.dwdmPortsUsed} / {nu.dwdmPorts}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-text-secondary">
                        {nu.bwPortsUsed} / {nu.bwPorts}
                      </td>
                      <td className="px-4 py-3">
                        {nu.portUtilizationPercent >= 100 ? (
                          <span className="bg-danger/10 rounded px-2 py-0.5 text-xs font-medium text-danger">
                            Full
                          </span>
                        ) : nu.portUtilizationPercent >= 80 ? (
                          <span className="bg-warning/10 rounded px-2 py-0.5 text-xs font-medium text-warning">
                            High
                          </span>
                        ) : (
                          <span className="bg-success/10 rounded px-2 py-0.5 text-xs font-medium text-success">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
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
    </div>
  );
};
