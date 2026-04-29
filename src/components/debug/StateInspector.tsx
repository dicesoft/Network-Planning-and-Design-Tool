import React, { useState, useEffect, useCallback } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';

// Note: We use getState() directly in takeSnapshot to avoid stale closures

interface JsonTreeProps {
  data: unknown;
  depth?: number;
}

const JsonTree: React.FC<JsonTreeProps> = ({ data, depth = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  if (data === null) return <span className="text-warning">null</span>;
  if (data === undefined) return <span className="text-text-muted">undefined</span>;
  if (typeof data === 'boolean') return <span className="text-accent">{String(data)}</span>;
  if (typeof data === 'number') return <span className="text-info">{data}</span>;
  if (typeof data === 'string') return <span className="text-success">&quot;{data}&quot;</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-text-muted">[]</span>;
    return (
      <div className="ml-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-text-muted hover:text-text-primary"
        >
          {isExpanded ? '▼' : '▶'} [{data.length}]
        </button>
        {isExpanded && (
          <div className="ml-2 border-l border-border pl-2">
            {data.map((item, index) => (
              <div key={index} className="flex gap-1">
                <span className="text-text-muted">{index}:</span>
                <JsonTree data={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (entries.length === 0) return <span className="text-text-muted">{'{}'}</span>;
    return (
      <div className="ml-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-text-muted hover:text-text-primary"
        >
          {isExpanded ? '▼' : '▶'} {'{'}...{'}'}
        </button>
        {isExpanded && (
          <div className="ml-2 border-l border-border pl-2">
            {entries.map(([key, value]) => (
              <div key={key} className="flex gap-1">
                <span className="text-primary-light">{key}:</span>
                <JsonTree data={value} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span>{String(data)}</span>;
};

interface StateInspectorProps {
  refreshKey?: number; // Changes to this trigger a refresh
}

export const StateInspector: React.FC<StateInspectorProps> = ({ refreshKey = 0 }) => {
  const [activeTab, setActiveTab] = useState<'network' | 'ui' | 'selected'>('network');
  const [snapshot, setSnapshot] = useState<{
    networkData: Record<string, unknown>;
    uiData: Record<string, unknown>;
    selectedDetails: {
      selectedNodes: unknown[];
      selectedEdges: unknown[];
      summary: { nodeCount: number; edgeCount: number };
    };
  } | null>(null);

  // Create snapshot function - uses getState() directly for fresh data
  const takeSnapshot = useCallback(() => {
    // Read directly from stores to avoid stale closures
    const networkState = useNetworkStore.getState();
    const uiState = useUIStore.getState();

    console.log('[StateInspector] Taking snapshot, nodes:', networkState.topology.nodes.length);

    const selectedNodes = networkState.selectedNodeIds.map((id) =>
      networkState.topology.nodes.find((n) => n.id === id)
    ).filter(Boolean);

    const selectedEdges = networkState.selectedEdgeIds.map((id) =>
      networkState.topology.edges.find((e) => e.id === id)
    ).filter(Boolean);

    setSnapshot({
      networkData: {
        topology: networkState.topology,
        selectedNodeIds: networkState.selectedNodeIds,
        selectedEdgeIds: networkState.selectedEdgeIds,
        historyLength: networkState.history.length,
        historyIndex: networkState.historyIndex,
      },
      uiData: {
        toolMode: uiState.toolMode,
        zoom: uiState.zoom,
        inspector: uiState.inspector,
        activeModal: uiState.activeModal,
        modalData: uiState.modalData,
        pendingNodePosition: uiState.pendingNodePosition,
        sidebarCollapsed: uiState.sidebarCollapsed,
      },
      selectedDetails: {
        selectedNodes,
        selectedEdges,
        summary: {
          nodeCount: selectedNodes.length,
          edgeCount: selectedEdges.length,
        },
      },
    });
  }, []); // No dependencies - always reads fresh from getState()

  // Initial snapshot and refresh when refreshKey changes
  useEffect(() => {
    console.log('[StateInspector] refreshKey changed:', refreshKey);
    takeSnapshot();
  }, [refreshKey, takeSnapshot]);

  const getDisplayData = () => {
    if (!snapshot) return null;
    switch (activeTab) {
      case 'network':
        return snapshot.networkData;
      case 'ui':
        return snapshot.uiData;
      case 'selected':
        return snapshot.selectedDetails;
      default:
        return null;
    }
  };

  return (
    <div data-testid="state-inspector" className="flex h-full flex-col rounded-lg border border-border bg-elevated">
      <div className="border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-text-primary">State Inspector</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-4 py-2">
        <button
          onClick={() => setActiveTab('network')}
          className={cn(
            'px-3 py-1 text-xs rounded',
            activeTab === 'network'
              ? 'bg-primary text-white'
              : 'bg-tertiary text-text-secondary hover:bg-elevated'
          )}
        >
          Network
        </button>
        <button
          onClick={() => setActiveTab('ui')}
          className={cn(
            'px-3 py-1 text-xs rounded',
            activeTab === 'ui'
              ? 'bg-primary text-white'
              : 'bg-tertiary text-text-secondary hover:bg-elevated'
          )}
        >
          UI
        </button>
        <button
          onClick={() => setActiveTab('selected')}
          className={cn(
            'px-3 py-1 text-xs rounded',
            activeTab === 'selected'
              ? 'bg-accent text-white'
              : 'bg-tertiary text-text-secondary hover:bg-elevated'
          )}
        >
          Selected ({snapshot?.selectedDetails?.summary?.nodeCount || 0}N / {snapshot?.selectedDetails?.summary?.edgeCount || 0}E)
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 font-mono text-xs">
        <JsonTree data={getDisplayData()} />
      </div>
    </div>
  );
};
