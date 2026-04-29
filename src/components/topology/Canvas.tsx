import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  applyNodeChanges,
  OnSelectionChangeFunc,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useThemeStore } from '@/stores/themeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { CapacityTracker, createStoreDataProvider, type EdgeUtilization } from '@/core/services/CapacityTracker';
import { NetworkNodeComponent } from './NetworkNode';
import { NetworkEdgeComponent } from './NetworkEdge';
import { Toolbar } from './Toolbar';
import { ContextMenu } from './ContextMenu';
import { NodeType, NODE_TYPE_CONFIGS } from '@/types';
import { isL1DWDMService, isL2L3Service } from '@/types/service';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

// Define node and edge types for React Flow
const nodeTypes = {
  networkNode: NetworkNodeComponent,
};

const edgeTypes = {
  networkEdge: NetworkEdgeComponent,
};

const CanvasContent: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();

  // Store state
  const topology = useNetworkStore((state) => state.topology);
  const selectedNodeIds = useNetworkStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useNetworkStore((state) => state.selectedEdgeIds);
  const addNode = useNetworkStore((state) => state.addNode);
  const moveNode = useNetworkStore((state) => state.moveNode);
  const selectNodes = useNetworkStore((state) => state.selectNodes);
  const selectEdges = useNetworkStore((state) => state.selectEdges);
  const selectElements = useNetworkStore((state) => state.selectElements);
  const clearSelection = useNetworkStore((state) => state.clearSelection);

  // UI state
  const toolMode = useUIStore((state) => state.toolMode);
  const setToolMode = useUIStore((state) => state.setToolMode);
  const setZoom = useUIStore((state) => state.setZoom);
  const openNodeInspector = useUIStore((state) => state.openNodeInspector);
  const openEdgeInspector = useUIStore((state) => state.openEdgeInspector);
  const openModal = useUIStore((state) => state.openModal);
  const setPendingNodePosition = useUIStore((state) => state.setPendingNodePosition);
  const closeInspector = useUIStore((state) => state.closeInspector);
  const gridVisible = useUIStore((state) => state.gridVisible);
  const gridSize = useUIStore((state) => state.gridSize);
  const snapToGrid = useUIStore((state) => state.snapToGrid);
  const pendingCommand = useUIStore((state) => state.pendingCommand);
  const clearCommand = useUIStore((state) => state.clearCommand);

  // Utilization overlay
  const showUtilization = useUIStore((state) => state.showUtilization);

  // Theme state for grid color
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

  // Settings for minimap visibility
  const showMinimap = useSettingsStore((state) => state.settings.canvas.showMinimap);

  // Service store state for path visualization
  const selectedServiceIds = useServiceStore((state) => state.selectedServiceIds);
  const services = useServiceStore((state) => state.services);
  // Compute highlighted edge IDs for selected services
  const servicePathEdges = useMemo(() => {
    const workingEdgeIds = new Set<string>();
    const protectionEdgeIds = new Set<string>();

    for (const serviceId of selectedServiceIds) {
      const service = services.find((s) => s.id === serviceId);
      if (!service) continue;

      if (isL1DWDMService(service)) {
        // L1 services have working and protection paths
        service.workingPath.edgeIds.forEach((id) => workingEdgeIds.add(id));
        service.protectionPath?.edgeIds.forEach((id) => protectionEdgeIds.add(id));
      } else if (isL2L3Service(service)) {
        // L2/L3 services can look up their underlay L1 service
        const underlayService = services.find((s) => s.id === service.underlayServiceId);
        if (underlayService && isL1DWDMService(underlayService)) {
          underlayService.workingPath.edgeIds.forEach((id) => workingEdgeIds.add(id));
          underlayService.protectionPath?.edgeIds.forEach((id) => protectionEdgeIds.add(id));
        }
      }
    }

    return { workingEdgeIds, protectionEdgeIds };
  }, [selectedServiceIds, services]);

  // Stable Set for O(1) node selection lookup
  const selectedNodeSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const selectedEdgeSet = useMemo(() => new Set(selectedEdgeIds), [selectedEdgeIds]);

  // Convert network nodes to React Flow nodes (base from store)
  // NOTE: Do NOT include selectedNodeSet as a dependency here. Selection state
  // is managed by React Flow internally (via onSelectionChange → selectElements).
  // Including it causes storeNodes to recompute on every selection change, which
  // triggers the sync useEffect below and overwrites React Flow's live drag
  // position with stale store positions — causing nodes to snap back during drag.
  const storeNodes: Node[] = useMemo(
    () =>
      topology.nodes.map((node) => ({
        id: node.id,
        type: 'networkNode',
        position: node.position,
        selected: selectedNodeSet.has(node.id),
        data: { ...node },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topology.nodes]
  );

  // Local state for nodes - allows React Flow to update positions during drag
  const [nodes, setNodes] = useState<Node[]>(storeNodes);

  // Track whether a node drag is in progress to prevent store sync from
  // overwriting React Flow's live drag position with stale store values.
  const isDraggingRef = useRef(false);

  // Track Ctrl/Cmd key state for multi-selection (ref avoids stale closures)
  const isCtrlPressedRef = useRef(false);

  // Mount guard: suppress onSelectionChange during first animation frame to prevent
  // stale selection state from GeoMap view triggering an infinite update cycle.
  const isMountingRef = useRef(true);
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      isMountingRef.current = false;
    });
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; type: 'node' | 'edge' | 'canvas'; targetId?: string;
  } | null>(null);

  // Sync local nodes with store nodes when store changes (but not during drag).
  // During a drag, React Flow owns the node positions. Overwriting them with
  // stale store positions causes visible snap-back / staggering.
  useEffect(() => {
    if (!isDraggingRef.current) {
      setNodes(storeNodes);
    }
  }, [storeNodes]);

  // Sync selection state separately so it doesn't trigger a full node array
  // recomputation via storeNodes. This updates the `selected` property in-place.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const shouldBeSelected = selectedNodeSet.has(n.id);
        return n.selected === shouldBeSelected ? n : { ...n, selected: shouldBeSelected };
      })
    );
  }, [selectedNodeSet]);

  // Auto-switch to compact mode above 150 nodes for performance
  const nodeDisplayMode = useUIStore((state) => state.nodeDisplayMode);
  const setNodeDisplayMode = useUIStore((state) => state.setNodeDisplayMode);
  useEffect(() => {
    if (topology.nodes.length > 150 && nodeDisplayMode === 'expanded') {
      setNodeDisplayMode('compact');
    }
  }, [topology.nodes.length, nodeDisplayMode, setNodeDisplayMode]);

  // Track Ctrl/Cmd key press for multi-selection append mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.metaKey) isCtrlPressedRef.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || !e.metaKey) isCtrlPressedRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Command bridge: execute zoom/fitView commands dispatched from App.tsx shortcuts
  useEffect(() => {
    if (!pendingCommand) return;
    if (typeof pendingCommand === 'string') {
      switch (pendingCommand) {
        case 'zoomIn':
          zoomIn();
          break;
        case 'zoomOut':
          zoomOut();
          break;
        case 'fitView':
          fitView();
          break;
      }
    } else if (pendingCommand.type === 'fitToEdge') {
      // Find the edge and its endpoint nodes, then fit view to them
      const edge = topology.edges.find((e) => e.id === pendingCommand.edgeId);
      if (edge) {
        const sourceNode = topology.nodes.find((n) => n.id === edge.source.nodeId);
        const targetNode = topology.nodes.find((n) => n.id === edge.target.nodeId);
        if (sourceNode && targetNode) {
          fitView({
            nodes: [
              { id: sourceNode.id, position: sourceNode.position, data: {}, width: 1, height: 1 },
              { id: targetNode.id, position: targetNode.position, data: {}, width: 1, height: 1 },
            ],
            padding: 0.3,
            duration: 500,
            minZoom: 0.5,
            maxZoom: 2,
          });
          // Flash-highlight: select the edge briefly
          selectEdges([edge.id]);
          setTimeout(() => {
            selectEdges([edge.id]); // Keep selected so user can see it
          }, 2000);
        }
      }
    }
    clearCommand();
  }, [pendingCommand, zoomIn, zoomOut, fitView, clearCommand, topology.edges, topology.nodes, selectEdges]);

  // Compute edge utilization data when overlay is enabled
  const edgeUtilizationMap = useMemo(() => {
    if (!showUtilization) return new Map<string, EdgeUtilization>();
    const provider = createStoreDataProvider(
      () => topology,
      () => services
    );
    const tracker = new CapacityTracker(provider);
    return tracker.getAllEdgeUtilization();
  }, [showUtilization, topology, services]);

  // Convert network edges to React Flow edges
  const edges: Edge[] = useMemo(() => {
    // Group edges by handle endpoints to detect edges sharing the same connection points
    // Key format: "nodeId:handle" for source and target
    const sourceHandleGroups = new Map<string, string[]>();
    const targetHandleGroups = new Map<string, string[]>();

    topology.edges.forEach((edge) => {
      // Group by source handle
      const sourceKey = `${edge.source.nodeId}:${edge.source.handle || 'default'}`;
      if (!sourceHandleGroups.has(sourceKey)) sourceHandleGroups.set(sourceKey, []);
      sourceHandleGroups.get(sourceKey)!.push(edge.id);

      // Group by target handle
      const targetKey = `${edge.target.nodeId}:${edge.target.handle || 'default'}`;
      if (!targetHandleGroups.has(targetKey)) targetHandleGroups.set(targetKey, []);
      targetHandleGroups.get(targetKey)!.push(edge.id);
    });

    return topology.edges.map((edge) => {
      const sourceKey = `${edge.source.nodeId}:${edge.source.handle || 'default'}`;
      const targetKey = `${edge.target.nodeId}:${edge.target.handle || 'default'}`;

      const sourceGroup = sourceHandleGroups.get(sourceKey)!;
      const targetGroup = targetHandleGroups.get(targetKey)!;

      // Determine if this edge shares handles with others
      const sourceShared = sourceGroup.length > 1;
      const targetShared = targetGroup.length > 1;

      // Get utilization data if overlay is active
      const utilization = edgeUtilizationMap.get(edge.id);

      return {
        id: edge.id,
        source: edge.source.nodeId,
        target: edge.target.nodeId,
        sourceHandle: edge.source.handle,
        targetHandle: edge.target.handle,
        type: 'networkEdge',
        selected: selectedEdgeSet.has(edge.id),
        data: {
          ...edge,
          // Pass handle sharing info for smart offset calculation
          sourceShared,
          targetShared,
          sourceGroupIndex: sourceGroup.indexOf(edge.id),
          sourceGroupCount: sourceGroup.length,
          targetGroupIndex: targetGroup.indexOf(edge.id),
          targetGroupCount: targetGroup.length,
          // Service path highlighting
          isWorkingPath: servicePathEdges.workingEdgeIds.has(edge.id),
          isProtectionPath: servicePathEdges.protectionEdgeIds.has(edge.id),
          // Utilization overlay
          showUtilization,
          utilizationPercent: utilization?.percentage,
          utilizationUsed: utilization?.used,
          utilizationTotal: utilization?.total,
        },
      };
    });
  }, [topology.edges, selectedEdgeSet, servicePathEdges, showUtilization, edgeUtilizationMap]);

  // Handle node changes (position only - selection handled by onSelectionChange)
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Filter out selection changes — selection is managed solely by onSelectionChange.
      // Processing 'select' changes here creates new array references via applyNodeChanges,
      // which triggers the storeNodes sync useEffect, causing an infinite update loop.
      const nonSelectChanges = changes.filter((c) => c.type !== 'select');
      if (nonSelectChanges.length === 0) return;

      // Track drag state to prevent the storeNodes sync effect from overwriting
      // React Flow's live drag positions with stale store values.
      for (const change of nonSelectChanges) {
        if (change.type === 'position') {
          if (change.dragging === true) {
            isDraggingRef.current = true;
          } else if (change.dragging === false) {
            isDraggingRef.current = false;
          }
        }
      }

      // Apply non-selection changes to local state for visual feedback during drag
      setNodes((nds) => applyNodeChanges(nonSelectChanges, nds));

      // Handle specific change types
      nonSelectChanges.forEach((change) => {
        // Only persist position to store when drag ends
        if (change.type === 'position' && change.position && change.dragging === false) {
          moveNode(change.id, change.position);
        }
      });
    },
    [moveNode]
  );

  // Edge changes handled by onSelectionChange - no-op here
  const onEdgesChange = useCallback(
    (_changes: EdgeChange[]) => {
      // Selection is handled solely by onSelectionChange to prevent
      // the dual-fire infinite loop between React Flow and Zustand
    },
    []
  );

  // Handle selection from React Flow (box selection + single clicks)
  // This is the sole selection handler — store's shallow equality check
  // in selectElements() prevents redundant updates.
  // IMPORTANT: onSelectionChange sends cumulative selection state, so
  // always pass append=false. The ref avoids stale closure issues.
  // Defense-in-depth: skip during mount frame to avoid processing stale
  // selection state carried over from a previous view (e.g., GeoMap Ctrl+A).
  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }) => {
      if (isMountingRef.current) return;
      const newNodeIds = selectedNodes.map((n) => n.id);
      const newEdgeIds = selectedEdges.map((e) => e.id);
      selectElements(newNodeIds, newEdgeIds, false);
    },
    [selectElements]
  );

  // Handle new connections - open port selection modal
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        // Open port selection modal instead of direct edge creation
        // Pass handles to preserve the user's intended connection points
        openModal('select-ports', {
          sourceId: connection.source,
          targetId: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        });
      }
    },
    [openModal]
  );

  // Handle node click (open inspector)
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNodes([node.id], false);
      openNodeInspector(node.id);
    },
    [selectNodes, openNodeInspector]
  );

  // Handle edge click (open inspector)
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      selectEdges([edge.id], false);
      openEdgeInspector(edge.id);
    },
    [selectEdges, openEdgeInspector]
  );

  // Handle pane click (deselect or add node)
  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (toolMode === 'add') {
        // In add mode, single-click opens the add node modal
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        setPendingNodePosition(position);
        openModal('add-node');
      } else {
        clearSelection();
        closeInspector();
      }
    },
    [toolMode, screenToFlowPosition, setPendingNodePosition, openModal, clearSelection, closeInspector]
  );

  // Handle double click (add node in select mode as shortcut)
  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Only in select mode - double-click is a quick way to add nodes
      // In add mode, single-click is already handled by onPaneClick
      if (toolMode === 'select') {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        setPendingNodePosition(position);
        openModal('add-node');
      }
    },
    [toolMode, screenToFlowPosition, setPendingNodePosition, openModal]
  );

  // Right-click context menu handlers
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, type: 'node', targetId: node.id });
    },
    []
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, type: 'edge', targetId: edge.id });
    },
    []
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, type: 'canvas' });
    },
    []
  );

  const handleContextMenuAction = useCallback(
    (action: string, targetId?: string) => {
      setContextMenu(null);
      switch (action) {
        case 'edit':
          if (targetId) {
            const isNode = topology.nodes.some((n) => n.id === targetId);
            if (isNode) openNodeInspector(targetId);
            else openEdgeInspector(targetId);
          }
          break;
        case 'delete':
          if (targetId) {
            const isNode = topology.nodes.some((n) => n.id === targetId);
            if (isNode) selectNodes([targetId], false);
            else selectEdges([targetId], false);
            openModal('confirm-delete');
          }
          break;
        case 'add-node': {
          const pos = screenToFlowPosition({ x: contextMenu?.x || 0, y: contextMenu?.y || 0 });
          setPendingNodePosition(pos);
          openModal('add-node');
          break;
        }
        case 'fit-view':
          fitView();
          break;
      }
    },
    [topology.nodes, openNodeInspector, openEdgeInspector, selectNodes, selectEdges, openModal, screenToFlowPosition, setPendingNodePosition, fitView, contextMenu]
  );

  // Handle drop from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow') as NodeType;
      if (!type || !NODE_TYPE_CONFIGS[type]) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode({ type, position });
      setToolMode('select');
    },
    [screenToFlowPosition, addNode, setToolMode]
  );

  // Handle zoom changes
  const onMoveEnd = useCallback(
    (_: unknown, viewport: { zoom: number }) => {
      setZoom(viewport.zoom);
    },
    [setZoom]
  );

  const miniMapNodeColor = useCallback((node: Node) => {
    const config = NODE_TYPE_CONFIGS[node.data?.type as NodeType];
    return config?.color || '#a0aec0';
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas" data-testid="canvas-container">
      <Toolbar />
      <div
        ref={reactFlowWrapper}
        className="relative flex-1"
        data-tool-mode={toolMode}
        data-testid="canvas"
      >
        <ErrorBoundary
          fallbackTitle="Canvas Error"
          fallbackMessage="The topology canvas encountered an error. Your data is safe. Try again to recover."
          className="bg-canvas"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onSelectionChange={onSelectionChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onDoubleClick={onDoubleClick}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onMoveEnd={onMoveEnd}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid={snapToGrid}
            snapGrid={[gridSize, gridSize]}
            defaultEdgeOptions={{
              type: 'networkEdge',
            }}
            connectionLineStyle={{ stroke: '#3182ce', strokeWidth: 2 }}
            deleteKeyCode={null}
            multiSelectionKeyCode="Control"
            selectionKeyCode="Shift"
            panOnScroll
            zoomOnScroll
            minZoom={0.1}
            maxZoom={4}
            panOnDrag={toolMode === 'pan' ? true : [1]}
            selectionOnDrag={toolMode === 'select'}
          >
            {gridVisible && (
              <Background
                gap={gridSize}
                size={1}
                color={resolvedTheme === 'dark' ? '#4a5568' : '#cbd5e0'}
              />
            )}
            {showMinimap && (
              <MiniMap
                nodeColor={miniMapNodeColor}
                maskColor="rgba(248, 249, 252, 0.8)"
                className="!rounded-lg !border !border-border !bg-elevated"
              />
            )}

            {/* Mode Indicator */}
            {toolMode !== 'select' && (
              <Panel position="top-center" className="!m-0 !mt-2">
                <div
                  className={cn(
                    'px-4 py-2 rounded-lg shadow-md text-sm font-medium',
                    toolMode === 'add' && 'bg-success text-white',
                    toolMode === 'connect' && 'bg-accent text-white',
                    toolMode === 'pan' && 'bg-warning text-white'
                  )}
                >
                  {toolMode === 'add' && 'Click or drag to add a node'}
                  {toolMode === 'connect' && 'Drag from a node handle to connect'}
                  {toolMode === 'pan' && 'Click and drag to pan'}
                  <span className="ml-2 opacity-75">(ESC to cancel, Middle-click to pan)</span>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </ErrorBoundary>

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            type={contextMenu.type}
            targetId={contextMenu.targetId}
            onClose={() => setContextMenu(null)}
            onAction={handleContextMenuAction}
          />
        )}
      </div>
    </div>
  );
};

// Wrap with ReactFlowProvider
export const Canvas: React.FC = () => {
  return (
    <ReactFlowProvider>
      <CanvasContent />
    </ReactFlowProvider>
  );
};
