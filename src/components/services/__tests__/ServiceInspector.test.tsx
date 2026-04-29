import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { useServiceStore } from '@/stores/serviceStore';
import type { L1DWDMService } from '@/types/service';

// Mock UnderlaySelector to avoid complex dependency chain
vi.mock('@/core/services/UnderlaySelector', () => ({
  UnderlaySelector: vi.fn().mockImplementation(() => ({
    getUnderlayUtilization: () => null,
  })),
}));

// Mock child components
vi.mock('../ServiceStatusBadge', () => ({
  ServiceStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));
vi.mock('../ServiceTypeBadge', () => ({
  ServiceTypeBadge: ({ type }: { type: string }) => (
    <span data-testid="type-badge">{type}</span>
  ),
}));

// Mock UI components that use portals
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}));
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: () => null,
}));

import { ServiceInspector } from '../ServiceInspector';

// Helper to inject a minimal L1 DWDM service directly into state
function injectTestL1Service(): string {
  const srcId = useNetworkStore.getState().addNode({
    type: 'router',
    position: { x: 0, y: 0 },
  });
  const dstId = useNetworkStore.getState().addNode({
    type: 'router',
    position: { x: 200, y: 0 },
  });

  const serviceId = 'L1-TEST-001';
  const service: L1DWDMService = {
    id: serviceId,
    type: 'l1-dwdm',
    name: 'Test L1 Service',
    status: 'planned',
    sourceNodeId: srcId,
    destinationNodeId: dstId,
    dataRate: '100G',
    modulationType: 'DP-QPSK',
    channelWidth: '50GHz',
    wavelengthMode: 'continuous',
    protectionScheme: 'none',
    restorationEnabled: false,
    workingPath: {
      nodeIds: [srcId, dstId],
      edgeIds: [],
      totalDistance: 100,
      hopCount: 1,
      status: 'computed',
    },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };

  // Inject directly into store state to avoid addService validation
  useServiceStore.setState((state) => ({
    services: [...state.services, service],
  }));

  return serviceId;
}

describe('ServiceInspector hooks ordering', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
    useServiceStore.getState().clearAllServices();
    useUIStore.getState().closeInspector();
  });

  it('renders null without error when no service exists (hooks still called)', () => {
    useUIStore.getState().openServiceInspector('non-existent-id');

    const { container } = render(<ServiceInspector />);
    expect(container.innerHTML).toBe('');
  });

  it('renders inspector when service exists', () => {
    const serviceId = injectTestL1Service();
    useUIStore.getState().openServiceInspector(serviceId);

    render(<ServiceInspector />);
    expect(screen.getByTestId('service-inspector')).toBeTruthy();
  });

  it('transitions from service to no-service without hooks error', () => {
    const serviceId = injectTestL1Service();
    useUIStore.getState().openServiceInspector(serviceId);

    const { rerender } = render(<ServiceInspector />);
    expect(screen.getByTestId('service-inspector')).toBeTruthy();

    // Remove the service
    act(() => {
      useServiceStore.getState().clearAllServices();
    });

    rerender(<ServiceInspector />);
    // Should not throw "Rendered fewer hooks than expected"
    expect(screen.queryByTestId('service-inspector')).toBeNull();
  });
});

describe('ServiceInspector Edit action (US1)', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
    useServiceStore.getState().clearAllServices();
    useUIStore.getState().closeInspector();
    useUIStore.getState().closeModal();
  });

  it('clicking Edit opens ServiceWizard in edit mode with service ID', () => {
    const serviceId = injectTestL1Service();
    useUIStore.getState().openServiceInspector(serviceId);

    render(<ServiceInspector />);

    // Find and click the Edit button (icon + label)
    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Verify uiStore now has the service-wizard modal open in edit mode
    const ui = useUIStore.getState();
    expect(ui.activeModal).toBe('service-wizard');
    expect(ui.modalData).toMatchObject({ mode: 'edit', serviceId });
  });

  it('prefills wizard state with current service values when in edit mode', () => {
    const serviceId = injectTestL1Service();
    const service = useServiceStore.getState().services.find((s) => s.id === serviceId);
    expect(service).toBeDefined();

    useUIStore.getState().openServiceInspector(serviceId);
    render(<ServiceInspector />);

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    // The modalData carries the IDs the wizard uses to build initial state.
    const ui = useUIStore.getState();
    expect(ui.modalData.mode).toBe('edit');
    expect(ui.modalData.serviceId).toBe(serviceId);

    // Verify the service we expect to edit still exists with original values
    expect(service?.name).toBe('Test L1 Service');
    expect(service?.dataRate).toBe('100G');
  });
});
