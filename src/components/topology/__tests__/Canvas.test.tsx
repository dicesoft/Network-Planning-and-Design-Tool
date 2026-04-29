import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useNetworkStore } from '@/stores/networkStore';

// We need a way to invoke the callbacks that Canvas passes to ReactFlow.
// Strategy: after rendering, we call the mock ReactFlow's onSelectionChange
// by accessing it through a global-level ref that the mock writes to.
// vi.mock factory closures in vitest can reference variables declared BEFORE
// the vi.mock call — the factory is hoisted but var refs bind at runtime.

let _rfProps: Record<string, unknown> = {};

// Module-level spy for applyNodeChanges — vi.hoisted ensures it's available
// inside the vi.mock factory which gets hoisted to the top of the file.
const { applyNodeChangesSpy } = vi.hoisted(() => ({
  applyNodeChangesSpy: vi.fn((_changes: unknown[], nodes: unknown[]) => [...nodes]),
}));

vi.mock('@xyflow/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');

  const ReactFlow = (props: Record<string, unknown>) => {
    _rfProps = props;
    return React.createElement('div', { 'data-testid': 'mock-react-flow' }, props.children);
  };

  return {
    ReactFlow,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    Background: () => null,
    MiniMap: () => null,
    Panel: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    useReactFlow: () => ({
      screenToFlowPosition: (pos: { x: number; y: number }) => pos,
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      fitView: vi.fn(),
    }),
    applyNodeChanges: applyNodeChangesSpy,
  };
});

// Mock Radix Tooltip to prevent "must be used within TooltipProvider" errors
vi.mock('@radix-ui/react-tooltip', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const TriggerComponent = React.forwardRef(
    ({ children, asChild, ...props }: { children: React.ReactNode; asChild?: boolean }, ref: unknown) =>
      asChild ? children : React.createElement('button', { ...props, ref }, children)
  );
  TriggerComponent.displayName = 'MockTooltipTrigger';
  return {
    Root: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Trigger: TriggerComponent,
    Content: () => null,
    Provider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Portal: () => null,
    Arrow: () => null,
  };
});

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      toolMode: 'select',
      setToolMode: vi.fn(),
      setZoom: vi.fn(),
      openNodeInspector: vi.fn(),
      openEdgeInspector: vi.fn(),
      openModal: vi.fn(),
      setPendingNodePosition: vi.fn(),
      closeInspector: vi.fn(),
      gridVisible: false,
      gridSize: 20,
      snapToGrid: false,
      pendingCommand: null,
      clearCommand: vi.fn(),
      showUtilization: false,
    }),
}));

vi.mock('@/stores/serviceStore', () => ({
  useServiceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ selectedServiceIds: [], services: [], clearSelection: vi.fn() }),
}));

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ resolvedTheme: 'light' }),
}));

vi.mock('@/core/services/CapacityTracker', () => ({
  CapacityTracker: vi.fn().mockImplementation(() => ({
    getAllEdgeUtilization: () => new Map(),
  })),
  createStoreDataProvider: vi.fn(),
}));

vi.mock('@/components/ui/ErrorBoundary', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    ErrorBoundary: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
  };
});

import { Canvas } from '../Canvas';

const getState = () => useNetworkStore.getState();

/** Helper: render Canvas and advance past the mount guard (rAF) */
async function renderAndMount() {
  const result = render(
    <MemoryRouter>
      <Canvas />
    </MemoryRouter>
  );
  // Flush the requestAnimationFrame mount guard so onSelectionChange works
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  return result;
}

describe('Canvas Selection Integration', () => {
  beforeEach(() => {
    _rfProps = {};
    getState().clearTopology();
  });

  it('should update store correctly via onSelectionChange without crashing (box-select scenario)', async () => {
    const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
    const node3Id = getState().addNode({ type: 'oadm', position: { x: 200, y: 0 } });
    const edgeId = getState().addEdge(node1Id, node2Id)!;

    await renderAndMount();

    const onSelectionChange = _rfProps.onSelectionChange as (params: {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    }) => void;

    expect(onSelectionChange).toBeDefined();

    // Simulate box-selection selecting all 3 nodes and 1 edge
    act(() => {
      onSelectionChange({
        nodes: [{ id: node1Id }, { id: node2Id }, { id: node3Id }],
        edges: [{ id: edgeId }],
      });
    });

    expect(getState().selectedNodeIds).toHaveLength(3);
    expect(getState().selectedNodeIds).toContain(node1Id);
    expect(getState().selectedNodeIds).toContain(node2Id);
    expect(getState().selectedNodeIds).toContain(node3Id);
    expect(getState().selectedEdgeIds).toHaveLength(1);
    expect(getState().selectedEdgeIds).toContain(edgeId);

    // Call again with same selection — should be idempotent (no crash, no loop)
    let updateCount = 0;
    const unsubscribe = useNetworkStore.subscribe(() => updateCount++);

    act(() => {
      onSelectionChange({
        nodes: [{ id: node1Id }, { id: node2Id }, { id: node3Id }],
        edges: [{ id: edgeId }],
      });
    });

    expect(updateCount).toBe(0);
    unsubscribe();
  });

  it('should handle onNodeClick for single-click selection after removing onNodesChange select handler', async () => {
    const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });

    await renderAndMount();

    const onNodeClick = _rfProps.onNodeClick as (
      event: React.MouseEvent,
      node: { id: string }
    ) => void;

    expect(onNodeClick).toBeDefined();

    const fakeEvent = { clientX: 0, clientY: 0 } as React.MouseEvent;

    act(() => {
      onNodeClick(fakeEvent, { id: node1Id });
    });

    expect(getState().selectedNodeIds).toContain(node1Id);

    act(() => {
      onNodeClick(fakeEvent, { id: node2Id });
    });

    expect(getState().selectedNodeIds).toHaveLength(1);
    expect(getState().selectedNodeIds).toContain(node2Id);
  });

  it('should handle empty box-selection (deselect scenario)', async () => {
    const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    getState().selectNodes([nodeId]);
    expect(getState().selectedNodeIds).toHaveLength(1);

    await renderAndMount();

    const onSelectionChange = _rfProps.onSelectionChange as (params: {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    }) => void;

    act(() => {
      onSelectionChange({ nodes: [], edges: [] });
    });

    expect(getState().selectedNodeIds).toHaveLength(0);
    expect(getState().selectedEdgeIds).toHaveLength(0);
  });
});

describe('Canvas Infinite Loop Regression', () => {
  beforeEach(() => {
    _rfProps = {};
    getState().clearTopology();
    applyNodeChangesSpy.mockClear();
  });

  it('onNodesChange should filter out type=select changes and not call applyNodeChanges', async () => {
    getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

    await renderAndMount();

    const onNodesChange = _rfProps.onNodesChange as (changes: Array<{ type: string; id: string; selected?: boolean }>) => void;
    expect(onNodesChange).toBeDefined();

    applyNodeChangesSpy.mockClear();

    // Fire only 'select' type changes — these should be filtered out entirely
    act(() => {
      onNodesChange([
        { type: 'select', id: 'node-1', selected: true },
        { type: 'select', id: 'node-2', selected: true },
      ]);
    });

    // applyNodeChanges should NOT have been called since all changes were filtered
    expect(applyNodeChangesSpy).not.toHaveBeenCalled();
  });

  it('onNodesChange should pass through position changes while filtering select changes', async () => {
    const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

    await renderAndMount();

    const onNodesChange = _rfProps.onNodesChange as (changes: Array<Record<string, unknown>>) => void;

    applyNodeChangesSpy.mockClear();

    // Mix of select and position changes — only position should pass through
    act(() => {
      onNodesChange([
        { type: 'select', id: nodeId, selected: true },
        { type: 'position', id: nodeId, position: { x: 50, y: 50 }, dragging: false },
      ]);
    });

    // applyNodeChanges should have been called with only the position change
    expect(applyNodeChangesSpy).toHaveBeenCalledTimes(1);
    const passedChanges = applyNodeChangesSpy.mock.calls[0][0];
    expect(passedChanges).toHaveLength(1);
    expect(passedChanges[0].type).toBe('position');
  });

  it('onSelectionChange should be suppressed during mount (first animation frame)', () => {
    const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    // Pre-select a node to simulate carry-over from GeoMap view
    getState().selectNodes([nodeId]);

    // Track store updates
    let updateCount = 0;
    const unsubscribe = useNetworkStore.subscribe(() => updateCount++);

    // Render WITHOUT advancing past mount guard
    render(
      <MemoryRouter>
        <Canvas />
      </MemoryRouter>
    );

    const onSelectionChange = _rfProps.onSelectionChange as (params: {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    }) => void;

    // Call onSelectionChange immediately (before rAF fires) — should be suppressed
    updateCount = 0;
    act(() => {
      onSelectionChange({ nodes: [], edges: [] });
    });

    // Selection should NOT have been cleared because mount guard is active
    expect(getState().selectedNodeIds).toContain(nodeId);
    expect(updateCount).toBe(0);

    unsubscribe();
  });

  it('onSelectionChange should work normally after mount frame completes', async () => {
    const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

    await renderAndMount();

    const onSelectionChange = _rfProps.onSelectionChange as (params: {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    }) => void;

    // Now onSelectionChange should work
    act(() => {
      onSelectionChange({
        nodes: [{ id: nodeId }],
        edges: [],
      });
    });

    expect(getState().selectedNodeIds).toContain(nodeId);
  });

  it('rapid repeated onNodesChange with select-only changes does not cause infinite loop', async () => {
    getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });

    await renderAndMount();

    const onNodesChange = _rfProps.onNodesChange as (changes: Array<{ type: string; id: string; selected?: boolean }>) => void;

    applyNodeChangesSpy.mockClear();

    // Simulate the rapid-fire select changes that cause the infinite loop
    act(() => {
      for (let i = 0; i < 100; i++) {
        onNodesChange([
          { type: 'select', id: 'node-1', selected: true },
          { type: 'select', id: 'node-2', selected: true },
        ]);
      }
    });

    // None of these should have reached applyNodeChanges
    expect(applyNodeChangesSpy).not.toHaveBeenCalled();
  });
});

describe('Canvas Drag Stability (snap-back regression)', () => {
  beforeEach(() => {
    _rfProps = {};
    getState().clearTopology();
    applyNodeChangesSpy.mockClear();
  });

  it('should not overwrite local state during drag when selection changes', async () => {
    const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    getState().addNode({ type: 'switch', position: { x: 200, y: 0 } });

    await renderAndMount();

    const onNodesChange = _rfProps.onNodesChange as (changes: Array<Record<string, unknown>>) => void;
    const onSelectionChange = _rfProps.onSelectionChange as (params: {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    }) => void;

    applyNodeChangesSpy.mockClear();

    // Simulate drag start: position change with dragging=true
    act(() => {
      onNodesChange([
        { type: 'position', id: nodeId, position: { x: 50, y: 50 }, dragging: true },
      ]);
    });

    // applyNodeChanges called for the position update (local state)
    expect(applyNodeChangesSpy).toHaveBeenCalledTimes(1);

    // Now simulate what React Flow does: auto-select the dragged node.
    // Before the fix, this would trigger storeNodes recomputation → setNodes
    // with stale positions → snap-back. After the fix, the drag guard and
    // decoupled selection prevent this.
    let storeUpdateCount = 0;
    const unsubscribe = useNetworkStore.subscribe(() => storeUpdateCount++);

    act(() => {
      onSelectionChange({ nodes: [{ id: nodeId }], edges: [] });
    });

    unsubscribe();

    // Selection should update the store
    expect(getState().selectedNodeIds).toContain(nodeId);

    // Simulate more drag movement after selection changed
    applyNodeChangesSpy.mockClear();
    act(() => {
      onNodesChange([
        { type: 'position', id: nodeId, position: { x: 150, y: 150 }, dragging: true },
      ]);
    });

    // Position updates should still flow to local state during drag
    expect(applyNodeChangesSpy).toHaveBeenCalledTimes(1);
    const passedChanges = applyNodeChangesSpy.mock.calls[0][0];
    expect(passedChanges[0].position).toEqual({ x: 150, y: 150 });
  });

  it('should sync store nodes to local state after drag ends', async () => {
    const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

    await renderAndMount();

    const onNodesChange = _rfProps.onNodesChange as (changes: Array<Record<string, unknown>>) => void;

    // Start drag
    act(() => {
      onNodesChange([
        { type: 'position', id: nodeId, position: { x: 100, y: 100 }, dragging: true },
      ]);
    });

    // End drag — this calls moveNode which updates the store
    act(() => {
      onNodesChange([
        { type: 'position', id: nodeId, position: { x: 100, y: 100 }, dragging: false },
      ]);
    });

    // After drag ends, the store should have the final position
    const storeNode = getState().topology.nodes.find((n) => n.id === nodeId);
    expect(storeNode?.position).toEqual({ x: 100, y: 100 });
  });
});
