import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUIStore } from '../uiStore';

describe('UIStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useUIStore.setState({
      toolMode: 'select',
      zoom: 1,
      inspector: { isOpen: false, type: null, targetId: null },
      sidebarCollapsed: false,
      activeModal: null,
      modalData: {},
      toasts: [],
      pendingNodePosition: null,
    });
  });

  describe('Tool Mode', () => {
    it('should set tool mode', () => {
      const store = useUIStore.getState();

      store.setToolMode('add');
      expect(useUIStore.getState().toolMode).toBe('add');

      store.setToolMode('connect');
      expect(useUIStore.getState().toolMode).toBe('connect');
    });
  });

  describe('Zoom', () => {
    it('should set zoom within bounds', () => {
      const store = useUIStore.getState();

      store.setZoom(2);
      expect(useUIStore.getState().zoom).toBe(2);
    });

    it('should clamp zoom to minimum', () => {
      const store = useUIStore.getState();

      store.setZoom(0.01);
      expect(useUIStore.getState().zoom).toBe(0.1);
    });

    it('should clamp zoom to maximum', () => {
      const store = useUIStore.getState();

      store.setZoom(10);
      expect(useUIStore.getState().zoom).toBe(4);
    });

    it('should zoom in', () => {
      const store = useUIStore.getState();
      const initialZoom = store.zoom;

      store.zoomIn();
      expect(useUIStore.getState().zoom).toBeGreaterThan(initialZoom);
    });

    it('should zoom out', () => {
      const store = useUIStore.getState();
      const initialZoom = store.zoom;

      store.zoomOut();
      expect(useUIStore.getState().zoom).toBeLessThan(initialZoom);
    });

    it('should reset zoom', () => {
      const store = useUIStore.getState();
      store.setZoom(2);

      store.resetZoom();
      expect(useUIStore.getState().zoom).toBe(1);
    });
  });

  describe('Inspector', () => {
    it('should open node inspector', () => {
      const store = useUIStore.getState();

      store.openNodeInspector('node-123');

      const inspector = useUIStore.getState().inspector;
      expect(inspector.isOpen).toBe(true);
      expect(inspector.type).toBe('node');
      expect(inspector.targetId).toBe('node-123');
    });

    it('should open edge inspector', () => {
      const store = useUIStore.getState();

      store.openEdgeInspector('edge-456');

      const inspector = useUIStore.getState().inspector;
      expect(inspector.isOpen).toBe(true);
      expect(inspector.type).toBe('edge');
      expect(inspector.targetId).toBe('edge-456');
    });

    it('should close inspector', () => {
      const store = useUIStore.getState();
      store.openNodeInspector('node-123');

      store.closeInspector();

      const inspector = useUIStore.getState().inspector;
      expect(inspector.isOpen).toBe(false);
      expect(inspector.type).toBeNull();
      expect(inspector.targetId).toBeNull();
    });
  });

  describe('Sidebar', () => {
    it('should toggle sidebar', () => {
      const store = useUIStore.getState();
      expect(store.sidebarCollapsed).toBe(false);

      store.toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);

      store.toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('Modals', () => {
    it('should open modal', () => {
      const store = useUIStore.getState();

      store.openModal('add-node');

      expect(useUIStore.getState().activeModal).toBe('add-node');
    });

    it('should open modal with data', () => {
      const store = useUIStore.getState();

      store.openModal('confirm-delete', { id: '123', name: 'Test' });

      expect(useUIStore.getState().activeModal).toBe('confirm-delete');
      expect(useUIStore.getState().modalData).toEqual({ id: '123', name: 'Test' });
    });

    it('should close modal', () => {
      const store = useUIStore.getState();
      store.openModal('add-node');

      store.closeModal();

      expect(useUIStore.getState().activeModal).toBeNull();
      expect(useUIStore.getState().modalData).toEqual({});
    });
  });

  describe('Toasts', () => {
    it('should add toast', () => {
      const store = useUIStore.getState();

      store.addToast({ type: 'success', title: 'Success!' });

      const toasts = useUIStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe('success');
      expect(toasts[0].title).toBe('Success!');
    });

    it('should remove toast', () => {
      const store = useUIStore.getState();
      store.addToast({ type: 'success', title: 'Success!' });
      const toastId = useUIStore.getState().toasts[0].id;

      store.removeToast(toastId);

      expect(useUIStore.getState().toasts).toHaveLength(0);
    });

    it('should auto-remove toast after duration', async () => {
      vi.useFakeTimers();
      const store = useUIStore.getState();

      store.addToast({ type: 'info', title: 'Info', duration: 1000 });
      expect(useUIStore.getState().toasts).toHaveLength(1);

      vi.advanceTimersByTime(1100);
      expect(useUIStore.getState().toasts).toHaveLength(0);

      vi.useRealTimers();
    });
  });

  describe('Pending Node Position', () => {
    it('should set pending node position', () => {
      const store = useUIStore.getState();

      store.setPendingNodePosition({ x: 100, y: 200 });

      expect(useUIStore.getState().pendingNodePosition).toEqual({ x: 100, y: 200 });
    });

    it('should clear pending node position', () => {
      const store = useUIStore.getState();
      store.setPendingNodePosition({ x: 100, y: 200 });

      store.setPendingNodePosition(null);

      expect(useUIStore.getState().pendingNodePosition).toBeNull();
    });
  });
});
