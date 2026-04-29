import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/stores/themeStore';

interface LocationPickerModalProps {
  open: boolean;
  onClose: () => void;
  initialLocation?: { latitude?: number; longitude?: number };
  onSelect: (lat: number, lng: number) => void;
}

// CORS-friendly CartoDB tile URLs
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_ZOOM = 10;

/**
 * Create a simple marker icon
 */
const createMarkerIcon = (): L.DivIcon => {
  return L.divIcon({
    className: 'location-picker-marker',
    html: `
      <div style="
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #3182ce;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: move;
      "></div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

/**
 * Component to fly to user location
 */
const FlyToUserLocation: React.FC<{
  initialCenter: [number, number];
  hasInitialLocation: boolean;
}> = ({ initialCenter, hasInitialLocation }) => {
  const map = useMap();

  useEffect(() => {
    // If we have an initial location, center on it
    if (hasInitialLocation) {
      map.setView(initialCenter, DEFAULT_ZOOM);
      return;
    }

    // Otherwise try to get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          map.setView([position.coords.latitude, position.coords.longitude], DEFAULT_ZOOM);
        },
        () => {
          // Geolocation failed, use default center
          map.setView(initialCenter, DEFAULT_ZOOM);
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, [map, initialCenter, hasInitialLocation]);

  return null;
};

/**
 * Component to handle map clicks and marker dragging
 */
const LocationSelector: React.FC<{
  position: [number, number] | null;
  setPosition: (pos: [number, number]) => void;
}> = ({ position, setPosition }) => {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={position}
      icon={createMarkerIcon()}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          const pos = marker.getLatLng();
          setPosition([pos.lat, pos.lng]);
        },
      }}
    />
  );
};

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  open,
  onClose,
  initialLocation,
  onSelect,
}) => {
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

  const hasInitialLocation = Boolean(
    initialLocation?.latitude !== undefined && initialLocation?.longitude !== undefined
  );

  const initialCenter: [number, number] = hasInitialLocation
    ? [initialLocation!.latitude!, initialLocation!.longitude!]
    : DEFAULT_CENTER;

  const [position, setPosition] = useState<[number, number] | null>(
    hasInitialLocation ? initialCenter : null
  );

  // Reset position only when modal transitions from closed → open.
  // While the modal is open, ignore initialLocation ref changes from immer/persist.
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (hasInitialLocation) {
        setPosition([initialLocation!.latitude!, initialLocation!.longitude!]);
      } else {
        setPosition(null);
      }
    }
    prevOpenRef.current = open;
  }, [open, initialLocation, hasInitialLocation]);

  const handleConfirm = useCallback(() => {
    if (position) {
      onSelect(position[0], position[1]);
      onClose();
    }
  }, [position, onSelect, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" hideClose>
        <DialogHeader>
          <DialogTitle>Pick Location on Map</DialogTitle>
        </DialogHeader>

        <div className="mb-2 text-sm text-text-secondary">
          Click on the map to place a marker, or drag the marker to adjust the position.
        </div>

        <div className="h-[400px] w-full overflow-hidden rounded-md border border-border">
          {open && (
            <MapContainer
              center={initialCenter}
              zoom={DEFAULT_ZOOM}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                attribution={TILE_ATTRIBUTION}
                url={resolvedTheme === 'dark' ? DARK_TILES : LIGHT_TILES}
              />
              <FlyToUserLocation
                initialCenter={initialCenter}
                hasInitialLocation={hasInitialLocation}
              />
              <LocationSelector position={position} setPosition={setPosition} />
            </MapContainer>
          )}
        </div>

        {position && (
          <div className="text-sm text-text-secondary">
            Selected: {position[0].toFixed(6)}, {position[1].toFixed(6)}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!position}>
            Confirm Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
