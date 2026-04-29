import React, { useState } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { NodeType } from '@/types';

export const ActionTester: React.FC = () => {
  const [nodeType, setNodeType] = useState<NodeType>('router');
  const [nodeName, setNodeName] = useState('');

  // Network store actions
  const addNode = useNetworkStore((state) => state.addNode);
  const deleteSelected = useNetworkStore((state) => state.deleteSelected);
  const clearSelection = useNetworkStore((state) => state.clearSelection);
  const selectAll = useNetworkStore((state) => state.selectAll);
  const undo = useNetworkStore((state) => state.undo);
  const redo = useNetworkStore((state) => state.redo);
  const clearTopology = useNetworkStore((state) => state.clearTopology);
  const selectedNodeIds = useNetworkStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useNetworkStore((state) => state.selectedEdgeIds);
  const history = useNetworkStore((state) => state.history);
  const historyIndex = useNetworkStore((state) => state.historyIndex);

  // UI store actions
  const toolMode = useUIStore((state) => state.toolMode);
  const setToolMode = useUIStore((state) => state.setToolMode);

  const handleAddNode = () => {
    const position = {
      x: 100 + Math.random() * 300,
      y: 100 + Math.random() * 300,
    };
    addNode({
      type: nodeType,
      position,
      name: nodeName || `${nodeType}-${Date.now()}`,
      vendor: 'generic',
      stacks: [],
      metadata: {},
    });
    setNodeName('');
  };

  const nodeTypes: NodeType[] = [
    'router',
    'switch',
    'oadm',
    'amplifier',
    'terminal',
    'custom',
  ];

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-elevated">
      <div className="border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-text-primary">Action Tester</h2>
      </div>

      <div className="space-y-4 overflow-auto p-4">
        {/* Status */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-canvas p-2">
            <span className="text-text-muted">Selected Nodes:</span>
            <span className="ml-2 text-text-primary">{selectedNodeIds.length}</span>
          </div>
          <div className="rounded bg-canvas p-2">
            <span className="text-text-muted">Selected Edges:</span>
            <span className="ml-2 text-text-primary">{selectedEdgeIds.length}</span>
          </div>
          <div className="rounded bg-canvas p-2">
            <span className="text-text-muted">History Index:</span>
            <span className="ml-2 text-text-primary">{historyIndex}</span>
          </div>
          <div className="rounded bg-canvas p-2">
            <span className="text-text-muted">History Length:</span>
            <span className="ml-2 text-text-primary">{history.length}</span>
          </div>
        </div>

        {/* Add Node */}
        <div className="space-y-2">
          <label className="block text-xs text-text-muted">Add Node</label>
          <div className="flex gap-2">
            <select
              value={nodeType}
              onChange={(e) => setNodeType(e.target.value as NodeType)}
              className="flex-1 rounded border border-border bg-canvas px-2 py-1 text-sm text-text-primary"
            >
              {nodeTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={nodeName}
              onChange={(e) => setNodeName(e.target.value)}
              placeholder="Name..."
              className="flex-1 rounded border border-border bg-canvas px-2 py-1 text-sm text-text-primary placeholder:text-text-muted"
            />
          </div>
          <button
            onClick={handleAddNode}
            className="w-full rounded bg-success px-3 py-2 text-sm text-white hover:brightness-110"
          >
            Add Node
          </button>
        </div>

        {/* Selection Actions */}
        <div className="space-y-2">
          <label className="block text-xs text-text-muted">Selection</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={selectAll}
              className="rounded bg-primary px-3 py-2 text-sm text-white hover:bg-primary-light"
            >
              Select All
            </button>
            <button
              onClick={clearSelection}
              className="rounded bg-tertiary px-3 py-2 text-sm text-text-primary hover:brightness-110"
            >
              Clear Selection
            </button>
          </div>
        </div>

        {/* Delete / Clear */}
        <div className="space-y-2">
          <label className="block text-xs text-text-muted">Delete</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={deleteSelected}
              className="rounded bg-danger px-3 py-2 text-sm text-white hover:bg-danger-light"
            >
              Delete Selected
            </button>
            <button
              onClick={clearTopology}
              className="bg-danger/80 rounded px-3 py-2 text-sm text-white hover:bg-danger"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Undo / Redo */}
        <div className="space-y-2">
          <label className="block text-xs text-text-muted">History</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="rounded bg-warning px-3 py-2 text-sm text-white hover:brightness-110 disabled:bg-tertiary disabled:text-text-muted"
            >
              Undo
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="rounded bg-warning px-3 py-2 text-sm text-white hover:brightness-110 disabled:bg-tertiary disabled:text-text-muted"
            >
              Redo
            </button>
          </div>
        </div>

        {/* Tool Mode */}
        <div className="space-y-2">
          <label className="block text-xs text-text-muted">
            Tool Mode: <span className="text-text-primary">{toolMode}</span>
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(['select', 'add', 'connect', 'pan'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setToolMode(mode)}
                className={`rounded px-2 py-1 text-xs ${
                  toolMode === mode
                    ? 'bg-primary text-white'
                    : 'bg-tertiary text-text-secondary hover:bg-elevated'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
