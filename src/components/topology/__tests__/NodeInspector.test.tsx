import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';

// Mock child components that have complex dependencies
vi.mock('../PortConfigurationSection', () => ({
  PortConfigurationSection: () => <div data-testid="port-config-section" />,
}));
vi.mock('../LocationSection', () => ({
  LocationSection: () => <div data-testid="location-section" />,
}));
vi.mock('../OSPPropertiesSection', () => ({
  OSPPropertiesSection: () => <div data-testid="osp-properties-section" />,
}));
vi.mock('../PortMappingEditor', () => ({
  PortMappingEditor: () => <div data-testid="port-mapping-editor" />,
}));
vi.mock('../InventoryTab', () => ({
  InventoryTab: () => <div data-testid="inventory-tab" />,
}));

// Mock Radix Select to avoid portal issues in test env
// Note: vi.mock factories are hoisted, so we use inline functions (no forwardRef needed for mocks)
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

import { NodeInspector } from '../NodeInspector';

describe('NodeInspector hooks ordering', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
    useUIStore.getState().closeInspector();
  });

  it('renders null without error when no node exists (hooks still called)', () => {
    useUIStore.getState().openNodeInspector('non-existent-id');

    const { container } = render(<NodeInspector />);
    // Should render nothing — no crash from hooks ordering
    expect(container.innerHTML).toBe('');
  });

  it('renders inspector when node exists', () => {
    const nodeId = useNetworkStore.getState().addNode({
      type: 'router',
      position: { x: 0, y: 0 },
    });

    useUIStore.getState().openNodeInspector(nodeId);

    render(<NodeInspector />);
    expect(screen.getByTestId('node-inspector')).toBeTruthy();
  });

  it('transitions from node to no-node without hooks error', () => {
    const nodeId = useNetworkStore.getState().addNode({
      type: 'router',
      position: { x: 0, y: 0 },
    });

    useUIStore.getState().openNodeInspector(nodeId);

    const { rerender } = render(<NodeInspector />);
    expect(screen.getByTestId('node-inspector')).toBeTruthy();

    // Remove the node — component should render null on next render
    act(() => {
      useNetworkStore.getState().removeNode(nodeId);
    });

    rerender(<NodeInspector />);
    // Should not throw "Rendered fewer hooks than expected"
    expect(screen.queryByTestId('node-inspector')).toBeNull();
  });
});
