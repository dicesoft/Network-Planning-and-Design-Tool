import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { useServiceStore } from '@/stores/serviceStore';
import { cn } from '@/lib/utils';
import { Circle, AlertTriangle, RefreshCw, Database, HardDrive } from 'lucide-react';
import { getStorageBackend } from '@/lib/indexeddb-storage';
import { pluralize } from '@/lib/pluralize';

export const StatusBar: React.FC = () => {
  const topology = useNetworkStore((state) => state.topology);
  const selectedNodeIds = useNetworkStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useNetworkStore((state) => state.selectedEdgeIds);
  const toolMode = useUIStore((state) => state.toolMode);
  const zoom = useUIStore((state) => state.zoom);

  // Use narrow deps (length) for service count to avoid re-renders on service content changes
  const serviceCount = useServiceStore((state) => state.services.length);

  // Derive edge counts via useMemo with narrow deps (edge length as proxy)
  const edgeCount = topology.edges.length;
  const { failedEdges, plannedEdges } = useMemo(() => ({
    failedEdges: topology.edges.filter((e) => e.state === 'failed').length,
    plannedEdges: topology.edges.filter((e) => e.state === 'planned').length,
  }), [edgeCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedCount = selectedNodeIds.length + selectedEdgeIds.length;

  // Storage backend status
  const [storageBackend, setStorageBackend] = useState<'indexeddb' | 'localstorage' | 'unknown'>('unknown');
  useEffect(() => {
    // Check storage backend after initial probe completes
    const timer = setTimeout(() => {
      setStorageBackend(getStorageBackend());
    }, 1000);
    // Also listen for fallback events
    const handleFallback = () => setStorageBackend('localstorage');
    window.addEventListener('indexeddb-write-error', handleFallback);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('indexeddb-write-error', handleFallback);
    };
  }, []);

  // Manual refresh counter to force rehydrate from localStorage
  const [, setRefreshTick] = useState(0);
  const handleRefresh = useCallback(() => {
    useNetworkStore.persist.rehydrate();
    useServiceStore.persist.rehydrate();
    setRefreshTick((t) => t + 1);
  }, []);

  // Format the last modified date
  const formatLastModified = () => {
    if (!topology.metadata.modified) return 'Never';
    const date = new Date(topology.metadata.modified);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <footer
      className="flex h-statusbar shrink-0 items-center justify-between border-t border-border bg-tertiary px-4 text-sm"
      data-testid="status-bar"
    >
      {/* Left section - Statistics */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Circle className="h-2 w-2 fill-success text-success" />
          <span className="text-text-tertiary">Nodes:</span>
          <span className="font-medium text-text-primary">{topology.nodes.length}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Circle className="h-2 w-2 fill-accent text-accent" />
          <span className="text-text-tertiary">Edges:</span>
          <span className="font-medium text-text-primary">{topology.edges.length}</span>
        </div>

        {selectedCount > 0 && (
          <div className="bg-accent/10 flex items-center gap-1.5 rounded px-2 py-0.5">
            <span className="text-text-tertiary">Selected:</span>
            <span className="font-medium text-accent">{selectedCount}</span>
          </div>
        )}

        {failedEdges > 0 && (
          <div className="bg-danger/10 flex items-center gap-1.5 rounded px-2 py-0.5">
            <AlertTriangle className="h-3 w-3 text-danger" />
            <span className="font-medium text-danger">
              {failedEdges} {pluralize('Failed Link', failedEdges)}
            </span>
          </div>
        )}

        {plannedEdges > 0 && (
          <div className="bg-info/10 flex items-center gap-1.5 rounded px-2 py-0.5">
            <span className="text-text-tertiary">Planned:</span>
            <span className="font-medium text-info">{plannedEdges}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Circle className="h-2 w-2 fill-warning text-warning" />
          <span className="text-text-tertiary">Services:</span>
          <span className="font-medium text-text-primary">{serviceCount}</span>
        </div>
      </div>

      {/* Right section - Mode & Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-text-tertiary">Mode:</span>
          <span
            className={cn(
              'font-medium px-2 py-0.5 rounded text-xs uppercase tracking-wide',
              toolMode === 'select' && 'bg-primary/10 text-primary',
              toolMode === 'add' && 'bg-success/10 text-success',
              toolMode === 'connect' && 'bg-accent/10 text-accent',
              toolMode === 'pan' && 'bg-warning/10 text-warning'
            )}
          >
            {toolMode}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-text-tertiary">Zoom:</span>
          <span className="font-mono font-medium text-text-primary">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-1.5">
          <span className="text-text-tertiary">Network:</span>
          <span className="max-w-[120px] truncate font-medium text-text-primary">
            {topology.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-text-tertiary">Modified:</span>
          <span className="font-medium text-text-secondary">{formatLastModified()}</span>
        </div>

        {storageBackend !== 'unknown' && (
          <div
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
              storageBackend === 'indexeddb'
                ? 'text-text-tertiary'
                : 'bg-warning/10 text-warning'
            )}
            title={
              storageBackend === 'indexeddb'
                ? 'Data persisted via IndexedDB'
                : 'Using localStorage fallback (reduced capacity)'
            }
            data-testid="storage-backend-indicator"
          >
            {storageBackend === 'indexeddb' ? (
              <Database className="h-3 w-3" />
            ) : (
              <HardDrive className="h-3 w-3" />
            )}
            <span>{storageBackend === 'indexeddb' ? 'IndexedDB' : 'localStorage'}</span>
          </div>
        )}

        <button
          onClick={handleRefresh}
          className="hover:bg-secondary flex items-center gap-1 rounded px-1.5 py-0.5 text-text-tertiary transition-colors hover:text-text-primary"
          title="Refresh store data"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
    </footer>
  );
};
