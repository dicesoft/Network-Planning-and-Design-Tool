import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GeoMapEdge } from '../GeoMapEdge';
import { SERVICE_PATH_STYLES } from '@/types';
import type { NetworkEdge, NetworkNode } from '@/types';

// Capture Polyline props for assertions
let polylineInstances: Array<Record<string, unknown>> = [];

vi.mock('react-leaflet', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    Polyline: (props: Record<string, unknown>) => {
      polylineInstances.push(props);
      return React.createElement('div', { 'data-testid': 'polyline' }, props.children);
    },
    Popup: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'popup' }, children),
    Tooltip: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'tooltip' }, children),
  };
});

// Helper to create a test node with location
function makeNode(overrides: Partial<NetworkNode> = {}): NetworkNode {
  return {
    id: 'node-1',
    name: 'Node A',
    type: 'router',
    vendor: 'generic',
    position: { x: 0, y: 0 },
    location: { latitude: 40.7128, longitude: -74.006 },
    stacks: [],
    metadata: {},
    ...overrides,
  } as NetworkNode;
}

// Helper to create a test edge
function makeEdge(overrides: Partial<NetworkEdge> = {}): NetworkEdge {
  return {
    id: 'edge-1',
    name: 'Edge A-B',
    type: 'fiber',
    source: { nodeId: 'node-1' },
    target: { nodeId: 'node-2' },
    properties: { distance: 100 },
    state: 'active',
    metadata: {},
    ...overrides,
  } as NetworkEdge;
}

describe('GeoMapEdge', () => {
  beforeEach(() => {
    polylineInstances = [];
  });

  const sourceNode = makeNode({ id: 'node-1', name: 'NYC', location: { latitude: 40.7, longitude: -74.0 } });
  const targetNode = makeNode({ id: 'node-2', name: 'CHI', location: { latitude: 41.9, longitude: -87.6 } });

  it('returns null when source node has no coordinates', () => {
    const noLocNode = makeNode({ location: {} });
    const { container } = render(
      <GeoMapEdge
        edge={makeEdge()}
        sourceNode={noLocNode}
        targetNode={targetNode}
        selected={false}
        onClick={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  describe('default (non-service) edge', () => {
    it('renders a single polyline with default style', () => {
      render(
        <GeoMapEdge
          edge={makeEdge()}
          sourceNode={sourceNode}
          targetNode={targetNode}
          selected={false}
          onClick={vi.fn()}
        />
      );
      // Only one Polyline (no glow)
      expect(polylineInstances).toHaveLength(1);
      const opts = polylineInstances[0].pathOptions as Record<string, unknown>;
      expect(opts.weight).toBe(3);
    });
  });

  describe('working path', () => {
    it('renders with shared working path styles', () => {
      render(
        <GeoMapEdge
          edge={makeEdge()}
          sourceNode={sourceNode}
          targetNode={targetNode}
          selected={false}
          isWorkingPath={true}
          onClick={vi.fn()}
        />
      );
      // Two polylines: glow + main
      expect(polylineInstances).toHaveLength(2);

      // Glow polyline (rendered first = index 0)
      const glowOpts = polylineInstances[0].pathOptions as Record<string, unknown>;
      expect(glowOpts.color).toBe(SERVICE_PATH_STYLES.workingGlow.color);
      expect(glowOpts.weight).toBe(SERVICE_PATH_STYLES.workingGlow.weight);
      expect(glowOpts.opacity).toBe(SERVICE_PATH_STYLES.workingGlow.opacity);
      expect(polylineInstances[0].interactive).toBe(false);

      // Main polyline (index 1)
      const mainOpts = polylineInstances[1].pathOptions as Record<string, unknown>;
      expect(mainOpts.color).toBe(SERVICE_PATH_STYLES.working.color);
      expect(mainOpts.weight).toBe(SERVICE_PATH_STYLES.working.weight);
      expect(mainOpts.dashArray).toBeUndefined();
    });
  });

  describe('protection path', () => {
    it('renders with shared protection path styles (green, dashed)', () => {
      render(
        <GeoMapEdge
          edge={makeEdge()}
          sourceNode={sourceNode}
          targetNode={targetNode}
          selected={false}
          isProtectionPath={true}
          onClick={vi.fn()}
        />
      );
      // Two polylines: glow + main
      expect(polylineInstances).toHaveLength(2);

      // Glow polyline
      const glowOpts = polylineInstances[0].pathOptions as Record<string, unknown>;
      expect(glowOpts.color).toBe(SERVICE_PATH_STYLES.protectionGlow.color);
      expect(glowOpts.weight).toBe(SERVICE_PATH_STYLES.protectionGlow.weight);
      expect(glowOpts.opacity).toBe(SERVICE_PATH_STYLES.protectionGlow.opacity);

      // Main polyline
      const mainOpts = polylineInstances[1].pathOptions as Record<string, unknown>;
      expect(mainOpts.color).toBe(SERVICE_PATH_STYLES.protection.color);
      expect(mainOpts.weight).toBe(SERVICE_PATH_STYLES.protection.weight);
      expect(mainOpts.dashArray).toBe(SERVICE_PATH_STYLES.protection.dashArray);
    });

    it('does NOT use orange (#f97316) for protection paths', () => {
      render(
        <GeoMapEdge
          edge={makeEdge()}
          sourceNode={sourceNode}
          targetNode={targetNode}
          selected={false}
          isProtectionPath={true}
          onClick={vi.fn()}
        />
      );
      for (const instance of polylineInstances) {
        const opts = instance.pathOptions as Record<string, unknown>;
        expect(opts.color).not.toBe('#f97316');
      }
    });
  });

  describe('failed edge', () => {
    it('renders with red dashed style and no glow', () => {
      render(
        <GeoMapEdge
          edge={makeEdge({ state: 'failed' })}
          sourceNode={sourceNode}
          targetNode={targetNode}
          selected={false}
          onClick={vi.fn()}
        />
      );
      // No glow for failed edges
      expect(polylineInstances).toHaveLength(1);
      const opts = polylineInstances[0].pathOptions as Record<string, unknown>;
      expect(opts.color).toBe('#e53e3e');
      expect(opts.dashArray).toBe('8, 5');
    });
  });

  describe('selected edge', () => {
    it('selection overrides service path styles', () => {
      render(
        <GeoMapEdge
          edge={makeEdge()}
          sourceNode={sourceNode}
          targetNode={targetNode}
          selected={true}
          isWorkingPath={true}
          onClick={vi.fn()}
        />
      );
      // No glow for selected edges (selection takes priority over service path)
      // isWorkingPath is true but selected is also true — selected wins in styling
      // However glow is based on isWorkingPath, not selection
      // So we get glow + main
      expect(polylineInstances.length).toBeGreaterThanOrEqual(1);
      // Main polyline should have selection color
      const mainIdx = polylineInstances.length - 1;
      const mainOpts = polylineInstances[mainIdx].pathOptions as Record<string, unknown>;
      expect(mainOpts.color).toBe('#3182ce');
      expect(mainOpts.weight).toBe(5);
    });
  });

  describe('edge that is both working AND protection', () => {
    it('working path takes priority over protection', () => {
      render(
        <GeoMapEdge
          edge={makeEdge()}
          sourceNode={sourceNode}
          targetNode={targetNode}
          selected={false}
          isWorkingPath={true}
          isProtectionPath={true}
          onClick={vi.fn()}
        />
      );
      // Main polyline should use working styles (working takes priority)
      const mainIdx = polylineInstances.length - 1;
      const mainOpts = polylineInstances[mainIdx].pathOptions as Record<string, unknown>;
      expect(mainOpts.color).toBe(SERVICE_PATH_STYLES.working.color);
    });
  });

  describe('glow behavior', () => {
    it('does NOT render glow for default (non-service) edges', () => {
      render(
        <GeoMapEdge
          edge={makeEdge()}
          sourceNode={sourceNode}
          targetNode={targetNode}
          selected={false}
          onClick={vi.fn()}
        />
      );
      expect(polylineInstances).toHaveLength(1);
    });

    it('glow polyline is non-interactive', () => {
      render(
        <GeoMapEdge
          edge={makeEdge()}
          sourceNode={sourceNode}
          targetNode={targetNode}
          selected={false}
          isWorkingPath={true}
          onClick={vi.fn()}
        />
      );
      expect(polylineInstances[0].interactive).toBe(false);
    });
  });
});
