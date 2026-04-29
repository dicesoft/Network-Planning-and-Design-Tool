import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React, { useRef, useEffect } from 'react';
import { useMap } from 'react-leaflet';

// Mock map instance
const mockSetView = vi.fn();
const mockFitBounds = vi.fn();
const mockMap = { setView: mockSetView, fitBounds: mockFitBounds };

vi.mock('react-leaflet', () => ({
  useMap: () => mockMap,
}));

/**
 * Mirror of the MapBoundsFitter component from GeoMapView.tsx.
 * Inlined here to test in isolation without importing the full GeoMapView
 * (which pulls in MapContainer, TileLayer, stores, etc.).
 */
const MapBoundsFitter: React.FC<{ nodes: Array<{ lat: number; lng: number }> }> = ({
  nodes,
}) => {
  const map = useMap();
  const prevNodeCountRef = useRef<number>(-1);

  useEffect(() => {
    if (nodes.length === 0) return;

    const isInitialFit = prevNodeCountRef.current === -1;
    const countChanged = prevNodeCountRef.current !== nodes.length;

    if (!isInitialFit && !countChanged) return;

    prevNodeCountRef.current = nodes.length;

    if (nodes.length === 1) {
      map.setView([nodes[0].lat, nodes[0].lng], 10);
    } else {
      const bounds = nodes.map((n) => [n.lat, n.lng] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [nodes, map]);

  return null;
};

describe('MapBoundsFitter', () => {
  beforeEach(() => {
    mockSetView.mockClear();
    mockFitBounds.mockClear();
  });

  it('calls fitBounds on initial render with multiple nodes', () => {
    const nodes = [
      { lat: 40.7, lng: -74.0 },
      { lat: 41.9, lng: -87.6 },
      { lat: 34.1, lng: -118.2 },
    ];

    render(<MapBoundsFitter nodes={nodes} />);

    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    expect(mockFitBounds).toHaveBeenCalledWith(
      [[40.7, -74.0], [41.9, -87.6], [34.1, -118.2]],
      { padding: [50, 50] }
    );
  });

  it('does NOT call fitBounds when re-rendered with same node count (new array ref)', () => {
    const nodes1 = [
      { lat: 40.7, lng: -74.0 },
      { lat: 41.9, lng: -87.6 },
      { lat: 34.1, lng: -118.2 },
    ];
    const nodes2 = [
      { lat: 40.8, lng: -74.1 },
      { lat: 42.0, lng: -87.7 },
      { lat: 34.2, lng: -118.3 },
    ];

    const { rerender } = render(<MapBoundsFitter nodes={nodes1} />);
    expect(mockFitBounds).toHaveBeenCalledTimes(1);

    mockFitBounds.mockClear();

    // Re-render with new array ref but same count — simulates Zustand rehydration
    rerender(<MapBoundsFitter nodes={nodes2} />);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('calls fitBounds again when node count changes (node added)', () => {
    const nodes3 = [
      { lat: 40.7, lng: -74.0 },
      { lat: 41.9, lng: -87.6 },
      { lat: 34.1, lng: -118.2 },
    ];

    const { rerender } = render(<MapBoundsFitter nodes={nodes3} />);
    expect(mockFitBounds).toHaveBeenCalledTimes(1);

    mockFitBounds.mockClear();

    // Add a 4th node
    const nodes4 = [
      ...nodes3,
      { lat: 47.6, lng: -122.3 },
    ];
    rerender(<MapBoundsFitter nodes={nodes4} />);
    expect(mockFitBounds).toHaveBeenCalledTimes(1);
  });

  it('does not call setView or fitBounds when nodes is empty', () => {
    render(<MapBoundsFitter nodes={[]} />);
    expect(mockSetView).not.toHaveBeenCalled();
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('calls setView for a single node on initial render', () => {
    const nodes = [{ lat: 40.7, lng: -74.0 }];

    render(<MapBoundsFitter nodes={nodes} />);

    expect(mockSetView).toHaveBeenCalledTimes(1);
    expect(mockSetView).toHaveBeenCalledWith([40.7, -74.0], 10);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });
});
