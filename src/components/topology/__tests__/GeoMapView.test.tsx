/**
 * P2.4 — Empty-state component test for GeoMapView (no-coordinates case).
 *
 * Asserts:
 *   - When no node has geographic coordinates, the dedicated empty state
 *     (`geomap-empty-state` + `geomap-empty-state-cta`) renders with the
 *     prescribed FR-024 copy and a guiding CTA.
 *   - When some nodes are positioned and others are not, the partial-coverage
 *     banner renders with "X of Y nodes have geographic coordinates" copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeoMapView } from '../GeoMapView';
import { useNetworkStore } from '@/stores/networkStore';

// jsdom doesn't implement Leaflet's DOM map APIs; stub the wrapper.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="leaflet-map">{children}</div>
  ),
  TileLayer: () => null,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: () => ({}),
  Marker: () => null,
  Polyline: () => null,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../GeoMapMarker', () => ({ GeoMapMarker: () => null }));
vi.mock('../GeoMapEdge', () => ({ GeoMapEdge: () => null }));
vi.mock('../Toolbar', () => ({ Toolbar: () => <div data-testid="toolbar-stub" /> }));

describe('GeoMapView — empty-coordinates state (P2.4 / FR-024)', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
  });

  it('renders the empty-state panel + CTA when no node has coordinates', () => {
    const network = useNetworkStore.getState();
    network.addNode({ type: 'router', position: { x: 0, y: 0 } });
    network.addNode({ type: 'router', position: { x: 100, y: 0 } });

    render(<GeoMapView />);

    const emptyState = screen.getByTestId('geomap-empty-state');
    expect(emptyState).toBeInTheDocument();
    expect(emptyState).toHaveTextContent(/No geographic coordinates yet/i);
    expect(emptyState).toHaveTextContent(/2 nodes in this topology/i);

    const cta = screen.getByTestId('geomap-empty-state-cta');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveTextContent(/Set coordinates on selected node/i);
  });

  it('shows the prescribed banner copy when some nodes have coords and others do not', () => {
    const network = useNetworkStore.getState();
    const a = network.addNode({ type: 'router', position: { x: 0, y: 0 } });
    const b = network.addNode({ type: 'router', position: { x: 100, y: 0 } });
    network.addNode({ type: 'router', position: { x: 200, y: 0 } });

    useNetworkStore.getState().updateNode(a, {
      location: { latitude: 37.7749, longitude: -122.4194 },
    });
    useNetworkStore.getState().updateNode(b, {
      location: { latitude: 40.7128, longitude: -74.006 },
    });

    render(<GeoMapView />);

    const banner = screen.getByTestId('geomap-no-coords-banner');
    expect(banner).toBeInTheDocument();
    // 2 of 3 nodes have coords -> plural "nodes have"
    expect(banner).toHaveTextContent(/2 of 3 nodes have geographic coordinates/i);
    expect(banner).toHaveTextContent(/click a node to set its location/i);
  });

  // P5.3 / E5 — singular pluralization when exactly one node has coordinates
  // out of many. Previously the code keyed pluralization off the total node
  // count, which produced "1 of 50 nodes have" — wrong subject-verb agreement.
  it('uses singular "node has" when exactly one of many nodes has coordinates (E5)', () => {
    const network = useNetworkStore.getState();
    const single = network.addNode({ type: 'router', position: { x: 0, y: 0 } });
    for (let i = 0; i < 49; i++) {
      network.addNode({ type: 'router', position: { x: 10 * i, y: 0 } });
    }

    useNetworkStore.getState().updateNode(single, {
      location: { latitude: 30.0444, longitude: 31.2357 },
    });

    render(<GeoMapView />);

    const banner = screen.getByTestId('geomap-no-coords-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/1 of 50 node has geographic coordinates/i);
    expect(banner).not.toHaveTextContent(/1 of 50 nodes have/i);
  });
});
