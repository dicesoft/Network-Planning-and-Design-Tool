import React, { useEffect, useCallback, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Header, Sidebar, StatusBar, WikiModal, ShortcutsModal } from '@/components/layout';
import { Canvas, NodeInspector, EdgeInspector, AddNodeModal, ExportModal, ImportModal, SelectPortsModal, ConfirmDeleteModal, GeoMapView } from '@/components/topology';
import { ServiceInspector, ServiceEditModal, ServiceWizard } from '@/components/services';
import { ToastContainer } from '@/components/ui/toast-container';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { logUIEvent, logSystemEvent } from '@/stores/eventStore';
import { matchShortcut } from '@/lib/shortcutDispatcher';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ServicesPage } from '@/pages/ServicesPage';
import { CapacityPage } from '@/pages/CapacityPage';
import { SimulationPage } from '@/pages/SimulationPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ToolsPage } from '@/pages/ToolsPage';
import { ForecastPage } from '@/pages/ForecastPage';

const DebugPage = import.meta.env.DEV
  ? React.lazy(() => import('./pages/DebugPage').then((m) => ({ default: m.DebugPage })))
  : null;

// Main topology editor component
const TopologyEditor: React.FC = () => {
  const inspector = useUIStore((state) => state.inspector);
  const viewMode = useUIStore((state) => state.viewMode);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Header />

      <div className="relative isolate flex flex-1 overflow-hidden">
        <Sidebar />

        {/* Conditionally render based on view mode */}
        {viewMode === 'schematic' ? <Canvas /> : <GeoMapView />}

        {/* Inspectors */}
        {inspector.isOpen && inspector.type === 'node' && <NodeInspector key="node-inspector" />}
        {inspector.isOpen && inspector.type === 'edge' && <EdgeInspector key="edge-inspector" />}
        {inspector.isOpen && inspector.type === 'service' && <ServiceInspector key="service-inspector" />}
      </div>

      <StatusBar />

      {/* Modals */}
      <AddNodeModal />
      <ServiceEditModal />
      <ExportModal />
      <ImportModal />
      <SelectPortsModal />
      <ConfirmDeleteModal />
      <WikiModal />
      <ShortcutsModal />
    </div>
  );
};

function App() {
  const setToolMode = useUIStore((state) => state.setToolMode);
  const closeModal = useUIStore((state) => state.closeModal);
  const closeInspector = useUIStore((state) => state.closeInspector);
  const toolMode = useUIStore((state) => state.toolMode);
  const zoom = useUIStore((state) => state.zoom);
  const inspector = useUIStore((state) => state.inspector);
  const dispatchCommand = useUIStore((state) => state.dispatchCommand);

  const topology = useNetworkStore((state) => state.topology);
  const selectAll = useNetworkStore((state) => state.selectAll);
  const clearSelection = useNetworkStore((state) => state.clearSelection);
  const undo = useNetworkStore((state) => state.undo);
  const redo = useNetworkStore((state) => state.redo);
  const openModal = useUIStore((state) => state.openModal);

  // Type for tracking previous UI values (network events are now logged directly in store actions)
  interface PrevUIState {
    toolMode: string;
    zoom: number;
    inspectorOpen: boolean;
    initialized: boolean;
  }

  // Track previous UI values for event logging
  const prevRef = useRef<PrevUIState>({
    toolMode: 'select',
    zoom: 1,
    inspectorOpen: false,
    initialized: false,
  });

  // Global keyboard shortcuts — data-driven via matchShortcut()
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const shortcut = matchShortcut(event);
      if (!shortcut) return;

      switch (shortcut.action) {
        case 'deselect':
          setToolMode('select');
          closeModal();
          closeInspector();
          clearSelection();
          break;

        case 'delete': {
          event.preventDefault();
          const state = useNetworkStore.getState();
          const hasSelection = state.selectedNodeIds.length > 0 || state.selectedEdgeIds.length > 0;
          if (hasSelection) {
            openModal('confirm-delete');
          }
          break;
        }

        case 'selectAll':
          event.preventDefault();
          selectAll();
          break;

        case 'undo':
          event.preventDefault();
          undo();
          break;

        case 'redo':
          event.preventDefault();
          redo();
          break;

        case 'selectMode':
          setToolMode('select');
          break;

        case 'addMode':
          setToolMode('add');
          break;

        case 'connectMode':
          setToolMode('connect');
          break;

        case 'save':
          event.preventDefault();
          openModal('export');
          break;

        case 'zoomIn':
          event.preventDefault();
          dispatchCommand('zoomIn');
          break;

        case 'zoomOut':
          event.preventDefault();
          dispatchCommand('zoomOut');
          break;

        case 'fitView':
          event.preventDefault();
          dispatchCommand('fitView');
          break;

        case 'duplicate': {
          event.preventDefault();
          const dupState = useNetworkStore.getState();
          if (dupState.selectedNodeIds.length > 0) {
            dupState.duplicateSelected();
          }
          break;
        }

        case 'showShortcuts':
          openModal('shortcuts');
          break;
      }
    },
    [setToolMode, closeModal, closeInspector, clearSelection, selectAll, undo, redo, openModal, dispatchCommand]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Log system start event once and capture initial UI state values
  // Note: Network events (node/edge add/remove, undo/redo) are now logged directly in store actions
  useEffect(() => {
    const prev = prevRef.current;
    if (!prev.initialized) {
      // Capture initial UI state values ONCE on mount
      prev.toolMode = toolMode;
      prev.zoom = zoom;
      prev.inspectorOpen = inspector.isOpen;
      prev.initialized = true;

      logSystemEvent('app', 'Application started', {
        nodeCount: topology.nodes.length,
        edgeCount: topology.edges.length,
      });
    }
  }, []);

  // Monitor UI changes
  useEffect(() => {
    const prev = prevRef.current;
    if (!prev) return;

    if (toolMode !== prev.toolMode) {
      logUIEvent('tool', `Tool mode changed to: ${toolMode}`);
      prev.toolMode = toolMode;
    }
  }, [toolMode]);

  useEffect(() => {
    const prev = prevRef.current;
    if (!prev) return;

    const zoomPercent = Math.round(zoom * 100);
    const prevZoomPercent = Math.round(prev.zoom * 100);

    if (Math.abs(zoomPercent - prevZoomPercent) >= 5) {
      logUIEvent('zoom', `Zoom changed to ${zoomPercent}%`);
      prev.zoom = zoom;
    }
  }, [zoom]);

  useEffect(() => {
    const prev = prevRef.current;
    if (!prev) return;

    if (inspector.isOpen !== prev.inspectorOpen) {
      if (inspector.isOpen) {
        logUIEvent('inspector', `Inspector opened: ${inspector.type} (${inspector.targetId?.slice(0, 8)}...)`);
      } else {
        logUIEvent('inspector', 'Inspector closed');
      }
      prev.inspectorOpen = inspector.isOpen;
    }
  }, [inspector.isOpen, inspector.type, inspector.targetId]);

  return (
    <TooltipProvider>
      <ErrorBoundary fallbackTitle="Page Error" fallbackMessage="This page encountered an error. Try again or navigate to a different page.">
        <Routes>
          <Route path="/" element={<TopologyEditor />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/capacity" element={<CapacityPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:reportId" element={<ReportsPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/forecast" element={<ForecastPage />} />
          {import.meta.env.DEV && DebugPage && (
            <Route
              path="/debug"
              element={
                <React.Suspense fallback={null}>
                  <DebugPage />
                </React.Suspense>
              }
            />
          )}
        </Routes>
      </ErrorBoundary>
      {/* Global modals (route-independent) */}
      <ServiceWizard />
      {/* Global Toast Notifications */}
      <ToastContainer />
    </TooltipProvider>
  );
}

export default App;
