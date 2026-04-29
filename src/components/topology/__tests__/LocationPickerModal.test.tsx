import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocationPickerModal } from '../LocationPickerModal';

// Mock leaflet
vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn(() => ({})),
  },
}));

// Capture the click handler from useMapEvents so tests can simulate map clicks
let mapClickHandler: ((e: { latlng: { lat: number; lng: number } }) => void) | null = null;

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ position }: { position: [number, number] }) => (
    <div data-testid="marker" data-lat={position[0]} data-lng={position[1]} />
  ),
  useMapEvents: (handlers: { click?: (e: { latlng: { lat: number; lng: number } }) => void }) => {
    mapClickHandler = handlers.click ?? null;
    return null;
  },
  useMap: () => ({
    setView: vi.fn(),
  }),
}));

// Mock theme store
vi.mock('@/stores/themeStore', () => ({
  useThemeStore: () => 'light',
}));

describe('LocationPickerModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    initialLocation: { latitude: 40.0, longitude: -74.0 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mapClickHandler = null;
  });

  it('sets position from initialLocation when modal opens', () => {
    render(<LocationPickerModal {...defaultProps} />);

    const marker = screen.getByTestId('marker');
    expect(marker.dataset.lat).toBe('40');
    expect(marker.dataset.lng).toBe('-74');
  });

  it('does NOT reset position when initialLocation ref changes while modal is open', () => {
    const { rerender } = render(<LocationPickerModal {...defaultProps} />);

    // Simulate user clicking the map
    expect(mapClickHandler).not.toBeNull();
    mapClickHandler!({ latlng: { lat: 51.5, lng: -0.1 } });

    // Rerender with a NEW object reference but same lat/lng values (immer rehydration)
    rerender(
      <LocationPickerModal
        {...defaultProps}
        initialLocation={{ latitude: 40.0, longitude: -74.0 }}
      />
    );

    // User's click should be preserved, not reset
    const marker = screen.getByTestId('marker');
    expect(marker.dataset.lat).toBe('51.5');
    expect(marker.dataset.lng).toBe('-0.1');
  });

  it('does NOT reset position when initialLocation changes to different values while open', () => {
    const { rerender } = render(<LocationPickerModal {...defaultProps} />);

    // Simulate user clicking the map
    mapClickHandler!({ latlng: { lat: 51.5, lng: -0.1 } });

    // Rerender with different lat/lng while still open
    rerender(
      <LocationPickerModal
        {...defaultProps}
        initialLocation={{ latitude: 35.0, longitude: 139.0 }}
      />
    );

    // User's click should still be preserved
    const marker = screen.getByTestId('marker');
    expect(marker.dataset.lat).toBe('51.5');
    expect(marker.dataset.lng).toBe('-0.1');
  });

  it('resets position when modal closes and reopens', () => {
    const { rerender } = render(<LocationPickerModal {...defaultProps} />);

    // User clicks a position
    mapClickHandler!({ latlng: { lat: 51.5, lng: -0.1 } });

    // Close the modal
    rerender(<LocationPickerModal {...defaultProps} open={false} />);

    // Reopen with a new location
    rerender(
      <LocationPickerModal
        {...defaultProps}
        open={true}
        initialLocation={{ latitude: 35.0, longitude: 139.0 }}
      />
    );

    // Should use the new initialLocation, not the old user click
    const marker = screen.getByTestId('marker');
    expect(marker.dataset.lat).toBe('35');
    expect(marker.dataset.lng).toBe('139');
  });

  it('opens with no marker when initialLocation is undefined', () => {
    render(
      <LocationPickerModal
        open={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByTestId('marker')).toBeNull();
  });
});
