import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useNetworkStore } from '@/stores/networkStore';

// Mock Radix Select to avoid portal issues in test env
vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  return {
    Select: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    SelectTrigger: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement('button', props, children),
    SelectContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    SelectItem: ({ children, ...props }: { children: React.ReactNode; value: string }) =>
      React.createElement('option', props, children),
    SelectValue: ({ placeholder }: { placeholder?: string }) =>
      React.createElement('span', null, placeholder || ''),
  };
});

// Mock Radix Dialog to render inline
vi.mock('@/components/ui/dialog', async () => {
  const React = await import('react');
  return {
    Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? React.createElement('div', { 'data-testid': 'dialog' }, children) : null,
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', null, children),
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
  };
});

import { InventoryTab } from '../InventoryTab';

describe('InventoryTab', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
  });

  it('renders chassis setup form when no chassis configured', () => {
    const nodeId = useNetworkStore.getState().addNode({
      type: 'router',
      position: { x: 0, y: 0 },
    });
    const node = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;

    render(<InventoryTab node={node} />);

    expect(screen.getByTestId('chassis-setup-form')).toBeDefined();
    expect(screen.getAllByText('Configure Chassis').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('chassis-configure-btn')).toBeDefined();
  });

  it('configures chassis with form values', () => {
    const nodeId = useNetworkStore.getState().addNode({
      type: 'router',
      position: { x: 0, y: 0 },
    });
    const node = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;

    render(<InventoryTab node={node} />);

    // Change slots input
    const slotsInput = screen.getByDisplayValue('8');
    fireEvent.change(slotsInput, { target: { value: '12' } });

    // Click configure
    fireEvent.click(screen.getByTestId('chassis-configure-btn'));

    // Verify updateNode was called
    const updatedNode = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;
    expect(updatedNode.chassis).toBeDefined();
    expect(updatedNode.chassis!.totalSlots).toBe(12);
    expect(updatedNode.installedCards).toEqual([]);
  });

  it('renders slot table when chassis is configured', () => {
    const nodeId = useNetworkStore.getState().addNode({
      type: 'router',
      position: { x: 0, y: 0 },
      chassis: { totalSlots: 4 },
      installedCards: [],
    });
    const node = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;

    render(<InventoryTab node={node} />);

    // Should show slot count
    expect(screen.getByText('0/4')).toBeDefined();
    // Should show reconfigure button
    expect(screen.getByTestId('chassis-reconfigure-btn')).toBeDefined();
  });

  it('shows reconfigure form pre-filled with current chassis values', () => {
    const nodeId = useNetworkStore.getState().addNode({
      type: 'router',
      position: { x: 0, y: 0 },
      chassis: { totalSlots: 16, maxPower: 5000, description: 'Test Router' },
      installedCards: [],
    });
    const node = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;

    render(<InventoryTab node={node} />);

    // Click reconfigure
    fireEvent.click(screen.getByTestId('chassis-reconfigure-btn'));

    // Should show the form with pre-filled values
    expect(screen.getByTestId('chassis-setup-form')).toBeDefined();
    expect(screen.getByText('Reconfigure Chassis')).toBeDefined();
    expect(screen.getByDisplayValue('16')).toBeDefined();
    expect(screen.getByDisplayValue('5000')).toBeDefined();
    expect(screen.getByDisplayValue('Test Router')).toBeDefined();
  });

  it('clamps slot values to 1-32 range', () => {
    const nodeId = useNetworkStore.getState().addNode({
      type: 'router',
      position: { x: 0, y: 0 },
    });
    const node = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;

    render(<InventoryTab node={node} />);

    const slotsInput = screen.getByDisplayValue('8');

    // Try setting above 32
    fireEvent.change(slotsInput, { target: { value: '50' } });
    fireEvent.click(screen.getByTestId('chassis-configure-btn'));

    const updatedNode = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;
    expect(updatedNode.chassis!.totalSlots).toBe(32);
  });

  describe('drag-and-drop', () => {
    const routerCardJson = JSON.stringify({
      id: 'imm24-10g',
      name: 'IMM24-10G',
      vendor: 'generic',
      nodeType: 'router',
      portTemplate: [{ namePattern: 'Eth-{n}', type: 'bw', dataRate: '10G', count: 24 }],
      switchingCapacity: 240,
      powerConsumption: 450,
    });

    const oadmCardJson = JSON.stringify({
      id: 'wss-c96',
      name: 'WSS-C96',
      vendor: 'generic',
      nodeType: 'oadm',
      portTemplate: [{ namePattern: 'Line-{n}', type: 'dwdm', dataRate: '100G', channels: 96, count: 2 }],
      powerConsumption: 80,
    });

    function createDragEvent(type: string, data: Record<string, string>) {
      const dataStore: Record<string, string> = { ...data };
      return {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: (key: string) => dataStore[key] || '',
          setData: vi.fn(),
          effectAllowed: 'copy',
        },
      };
    }

    it('installs card on drop to empty slot', () => {
      const nodeId = useNetworkStore.getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: { totalSlots: 2 },
        installedCards: [],
      });
      const node = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;

      render(<InventoryTab node={node} />);

      const emptySlots = screen.getAllByText('Empty slot');
      expect(emptySlots.length).toBe(2);

      // Simulate drop on first empty slot's parent
      const slotDiv = emptySlots[0].closest('[class*="rounded-lg"]')!;
      const dropEvent = createDragEvent('drop', { 'application/atlas-card': routerCardJson });
      fireEvent.drop(slotDiv, dropEvent);

      // Verify card was installed
      const updatedNode = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;
      expect(updatedNode.installedCards!.length).toBe(1);
      expect(updatedNode.installedCards![0].slotNumber).toBe(1);
    });

    it('rejects incompatible card type on drop', () => {
      const nodeId = useNetworkStore.getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: { totalSlots: 2 },
        installedCards: [],
      });
      const node = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;

      render(<InventoryTab node={node} />);

      const emptySlots = screen.getAllByText('Empty slot');
      const slotDiv = emptySlots[0].closest('[class*="rounded-lg"]')!;

      // Drop an OADM card onto a router node
      const dropEvent = createDragEvent('drop', { 'application/atlas-card': oadmCardJson });
      fireEvent.drop(slotDiv, dropEvent);

      // Verify card was NOT installed
      const updatedNode = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeId)!;
      expect(updatedNode.installedCards!.length).toBe(0);
    });
  });
});
