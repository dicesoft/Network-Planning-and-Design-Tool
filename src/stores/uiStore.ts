import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { ToolMode, InspectorState, ModalType, Toast, NodeDisplayMode, MODAL_TYPES } from '@/types';

/**
 * Dev-only modal registry probe. Asserts that the type passed to openModal()
 * is a registered ModalType. Production builds skip the check (zero overhead).
 *
 * Per modal-registry.contract.md: every value of ModalType MUST have exactly
 * one mounted consumer in App.tsx. This runtime check catches typos / drift
 * during development; the type-system + registry tests catch missing mounts.
 */
const MODAL_REGISTRY: ReadonlySet<string> = new Set(MODAL_TYPES);

/**
 * Grid size options
 */
export type GridSize = 20 | 40 | 80;

/**
 * Canvas view mode
 */
export type ViewMode = 'schematic' | 'geographic';

/**
 * Commands that can be dispatched to the Canvas via the command bridge
 */
export type CanvasCommand = 'zoomIn' | 'zoomOut' | 'fitView' | { type: 'fitToEdge'; edgeId: string };

/**
 * UI store state interface
 */
interface UIState {
  // Tool mode
  toolMode: ToolMode;
  setToolMode: (mode: ToolMode) => void;

  // Canvas
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;

  // Grid settings
  gridVisible: boolean;
  gridSize: GridSize;
  snapToGrid: boolean;
  setGridVisible: (visible: boolean) => void;
  setGridSize: (size: GridSize) => void;
  setSnapToGrid: (snap: boolean) => void;
  toggleGrid: () => void;

  // View mode (schematic vs geographic)
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;

  // Inspector panel
  inspector: InspectorState;
  openNodeInspector: (nodeId: string) => void;
  openEdgeInspector: (edgeId: string) => void;
  openServiceInspector: (serviceId: string) => void;
  closeInspector: () => void;
  /**
   * Ephemeral, per-session minimize state for the inspector overlay.
   * NOT persisted — auto-resets to false on selection change (see Inspectors).
   */
  inspectorMinimized: boolean;
  setInspectorMinimized: (minimized: boolean) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Modals
  activeModal: ModalType;
  modalData: Record<string, unknown>;
  openModal: (type: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;

  // Toasts
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  // Pending add node position (for double-click to add)
  pendingNodePosition: { x: number; y: number } | null;
  setPendingNodePosition: (pos: { x: number; y: number } | null) => void;

  // Utilization overlay
  showUtilization: boolean;
  setShowUtilization: (show: boolean) => void;
  toggleUtilization: () => void;

  // Node display mode
  nodeDisplayMode: NodeDisplayMode;
  setNodeDisplayMode: (mode: NodeDisplayMode) => void;

  // Command dispatch (for bridging shortcuts to React Flow context)
  pendingCommand: CanvasCommand | null;
  dispatchCommand: (cmd: CanvasCommand) => void;
  clearCommand: () => void;
}

/**
 * Generate unique ID for toasts
 */
const generateToastId = (): string => {
  return `toast-${Date.now()}-${Math.random().toString(36).substring(7)}`;
};

/**
 * UI store
 */
export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set, get) => ({
      // Tool mode
      toolMode: 'select',
      setToolMode: (mode) => set({ toolMode: mode }),

      // Canvas zoom
      zoom: 1,
      setZoom: (zoom) => set({ zoom: Math.min(Math.max(zoom, 0.1), 4) }),
      zoomIn: () => {
        const currentZoom = get().zoom;
        set({ zoom: Math.min(currentZoom * 1.2, 4) });
      },
      zoomOut: () => {
        const currentZoom = get().zoom;
        set({ zoom: Math.max(currentZoom / 1.2, 0.1) });
      },
      resetZoom: () => set({ zoom: 1 }),

      // Grid settings
      gridVisible: true,
      gridSize: 40,
      snapToGrid: true,
      setGridVisible: (visible) => set({ gridVisible: visible }),
      setGridSize: (size) => set({ gridSize: size }),
      setSnapToGrid: (snap) => set({ snapToGrid: snap }),
      toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),

      // View mode
      viewMode: 'schematic',
      setViewMode: (mode) => set({ viewMode: mode }),
      toggleViewMode: () =>
        set((state) => ({
          viewMode: state.viewMode === 'schematic' ? 'geographic' : 'schematic',
        })),

      // Inspector
      inspector: {
        isOpen: false,
        type: null,
        targetId: null,
      },
      openNodeInspector: (nodeId) =>
        set({ inspector: { isOpen: true, type: 'node', targetId: nodeId }, inspectorMinimized: false }),
      openEdgeInspector: (edgeId) =>
        set({ inspector: { isOpen: true, type: 'edge', targetId: edgeId }, inspectorMinimized: false }),
      openServiceInspector: (serviceId) =>
        set({ inspector: { isOpen: true, type: 'service', targetId: serviceId }, inspectorMinimized: false }),
      closeInspector: () =>
        set({ inspector: { isOpen: false, type: null, targetId: null }, inspectorMinimized: false }),
      inspectorMinimized: false,
      setInspectorMinimized: (minimized) => set({ inspectorMinimized: minimized }),

      // Sidebar
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Modals
      activeModal: null,
      modalData: {},
      openModal: (type, data = {}) => {
        if (import.meta.env.DEV && type !== null && !MODAL_REGISTRY.has(type)) {
          throw new Error(
            `[uiStore.openModal] No mounted consumer for modal type: "${type}". ` +
              `Add it to MODAL_TYPES in src/types/ui.ts and mount a renderer in App.tsx.`
          );
        }
        set({ activeModal: type, modalData: data });
      },
      closeModal: () => set({ activeModal: null, modalData: {} }),

      // Toasts
      toasts: [],
      addToast: (toast) => {
        const id = generateToastId();
        const newToast: Toast = { ...toast, id };

        set((state) => ({
          toasts: [...state.toasts, newToast],
        }));

        // Auto-remove after duration
        const duration = toast.duration ?? 5000;
        if (duration > 0) {
          setTimeout(() => {
            get().removeToast(id);
          }, duration);
        }
      },
      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },

      // Utilization overlay
      showUtilization: false,
      setShowUtilization: (show) => set({ showUtilization: show }),
      toggleUtilization: () => set((state) => ({ showUtilization: !state.showUtilization })),

      // Node display mode
      nodeDisplayMode: 'expanded' as NodeDisplayMode,
      setNodeDisplayMode: (mode) => set({ nodeDisplayMode: mode }),

      // Pending node position
      pendingNodePosition: null,
      setPendingNodePosition: (pos) => set({ pendingNodePosition: pos }),

      // Command dispatch
      pendingCommand: null,
      dispatchCommand: (cmd) => set({ pendingCommand: cmd }),
      clearCommand: () => set({ pendingCommand: null }),
      }),
      {
        name: 'ui-preferences-storage',
        partialize: () => ({}),
      }
    ),
    { name: 'UIStore' }
  )
);
