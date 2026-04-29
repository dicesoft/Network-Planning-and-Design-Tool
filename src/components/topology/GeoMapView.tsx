import React, { useMemo, useEffect, useCallback, useState, useRef } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useUIStore } from '@/stores/uiStore';
import { useThemeStore } from '@/stores/themeStore';
import { GeoMapMarker } from './GeoMapMarker';
import { GeoMapEdge } from './GeoMapEdge';
import { Toolbar } from './Toolbar';
import { isL1DWDMService, isL2L3Service } from '@/types/service';
import { MapPin } from 'lucide-react';
import { NetworkNode } from '@/types';
import { Button } from '@/components/ui/button';
import { pluralize } from '@/lib/pluralize';

// Default map center (San Francisco area)
const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_ZOOM = 5;

// CORS-friendly CartoDB tile URLs (support both light and dark themes)
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Extended node type with temporary location for unpositioned nodes
export interface GeoMapNode extends NetworkNode {
  _isUnpositioned?: boolean;
  _tempLocation?: { latitude: number; longitude: number };
}

/**
 * Component to auto-fit map bounds to nodes
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
      // Single node - center on it
      map.setView([nodes[0].lat, nodes[0].lng], 10);
    } else {
      // Multiple nodes - fit bounds
      const bounds = nodes.map((n) => [n.lat, n.lng] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [nodes, map]);

  return null;
};

/**
 * Component to handle map click deselection.
 * Clicking empty space on the map deselects all nodes/edges and closes inspector.
 * Uses a ref guard to prevent deselection when a marker/edge was just clicked.
 */
const MapClickHandler: React.FC<{
  onMapClick: () => void;
  elementClickedRef: React.MutableRefObject<boolean>;
}> = ({ onMapClick, elementClickedRef }) => {
  useMapEvents({
    click: () => {
      // If a marker/edge was just clicked, skip deselection
      if (elementClickedRef.current) {
        elementClickedRef.current = false;
        return;
      }
      onMapClick();
    },
  });
  return null;
};

export const GeoMapView: React.FC = () => {
  // Store state
  const topology = useNetworkStore((state) => state.topology);
  const selectedNodeIds = useNetworkStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useNetworkStore((state) => state.selectedEdgeIds);
  const selectNodes = useNetworkStore((state) => state.selectNodes);
  const selectEdges = useNetworkStore((state) => state.selectEdges);
  const clearSelection = useNetworkStore((state) => state.clearSelection);

  // UI state
  const openNodeInspector = useUIStore((state) => state.openNodeInspector);
  const openEdgeInspector = useUIStore((state) => state.openEdgeInspector);
  const closeInspector = useUIStore((state) => state.closeInspector);
  const addToast = useUIStore((state) => state.addToast);

  // Theme state for tile selection
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

  // Service state for path visualization
  const selectedServiceIds = useServiceStore((state) => state.selectedServiceIds);
  const services = useServiceStore((state) => state.services);
  // Ref to guard map click from firing after marker/edge click
  const elementClickedRef = useRef(false);

  // User geolocation state
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Get user location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.warn('Geolocation failed:', error.message);
          // Fallback remains DEFAULT_CENTER
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, []);

  // Filter nodes with valid coordinates
  const geoNodes = useMemo(() => {
    return topology.nodes.filter(
      (node) =>
        node.location?.latitude !== undefined &&
        node.location?.longitude !== undefined
    );
  }, [topology.nodes]);

  // Nodes without coordinates (for warning)
  const nodesWithoutCoords = useMemo(() => {
    return topology.nodes.filter(
      (node) =>
        node.location?.latitude === undefined ||
        node.location?.longitude === undefined
    );
  }, [topology.nodes]);

  // Generate positions for unpositioned nodes (spread around user location or default center)
  const unpositionedNodesWithCoords = useMemo((): GeoMapNode[] => {
    if (nodesWithoutCoords.length === 0) return [];

    const center = userLocation || DEFAULT_CENTER;
    const offset = 0.01; // ~1km spread at mid-latitudes

    return nodesWithoutCoords.map((node, index) => {
      // Spiral pattern for spreading nodes (golden angle)
      const angle = (index * 137.5 * Math.PI) / 180;
      const radius = offset * Math.sqrt(index + 1);
      return {
        ...node,
        _tempLocation: {
          latitude: center[0] + radius * Math.cos(angle),
          longitude: center[1] + radius * Math.sin(angle),
        },
        _isUnpositioned: true,
      };
    });
  }, [userLocation, nodesWithoutCoords]);

  // Compute service path edges (for highlighting)
  const servicePathEdges = useMemo(() => {
    const workingEdgeIds = new Set<string>();
    const protectionEdgeIds = new Set<string>();

    for (const serviceId of selectedServiceIds) {
      const service = services.find((s) => s.id === serviceId);
      if (!service) continue;

      if (isL1DWDMService(service)) {
        service.workingPath.edgeIds.forEach((id) => workingEdgeIds.add(id));
        service.protectionPath?.edgeIds.forEach((id) => protectionEdgeIds.add(id));
      } else if (isL2L3Service(service)) {
        const underlayService = services.find((s) => s.id === service.underlayServiceId);
        if (underlayService && isL1DWDMService(underlayService)) {
          underlayService.workingPath.edgeIds.forEach((id) => workingEdgeIds.add(id));
          underlayService.protectionPath?.edgeIds.forEach((id) => protectionEdgeIds.add(id));
        }
      }
    }

    return { workingEdgeIds, protectionEdgeIds };
  }, [selectedServiceIds, services]);

  // Create node lookup map — merge real locations with temp locations for unpositioned nodes
  // so that GeoMapEdge can resolve coordinates for all endpoints
  const nodeMap = useMemo(() => {
    const map = new Map<string, NetworkNode>(
      topology.nodes.map((node) => [node.id, node])
    );
    // Overlay temp locations for unpositioned nodes
    for (const geoNode of unpositionedNodesWithCoords) {
      if (geoNode._tempLocation) {
        map.set(geoNode.id, {
          ...geoNode,
          location: {
            ...geoNode.location,
            latitude: geoNode._tempLocation.latitude,
            longitude: geoNode._tempLocation.longitude,
          },
        });
      }
    }
    return map;
  }, [topology.nodes, unpositionedNodesWithCoords]);

  // Get bounds for auto-fitting (includes both positioned and unpositioned nodes)
  const boundsNodes = useMemo(() => {
    const positioned = geoNodes.map((node) => ({
      lat: node.location!.latitude!,
      lng: node.location!.longitude!,
    }));

    const unpositioned = unpositionedNodesWithCoords.map((node) => ({
      lat: node._tempLocation!.latitude,
      lng: node._tempLocation!.longitude,
    }));

    return [...positioned, ...unpositioned];
  }, [geoNodes, unpositionedNodesWithCoords]);

  // Handle node click (marks ref to prevent map deselection)
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      elementClickedRef.current = true;
      selectNodes([nodeId], false);
      openNodeInspector(nodeId);
    },
    [selectNodes, openNodeInspector]
  );

  // Handle edge click (marks ref to prevent map deselection)
  const handleEdgeClick = useCallback(
    (edgeId: string) => {
      elementClickedRef.current = true;
      selectEdges([edgeId], false);
      openEdgeInspector(edgeId);
    },
    [selectEdges, openEdgeInspector]
  );

  // Handle map click (deselect nodes/edges, close inspector)
  // Note: service selection is NOT cleared here — consistent with schematic Canvas.tsx
  // (Phase 1.1 fix: clearServiceSelection was removed from onPaneClick to preserve path highlighting)
  const handleMapClick = useCallback(() => {
    clearSelection();
    closeInspector();
  }, [clearSelection, closeInspector]);

  // CTA handler: open node inspector for the selected node, or guide the user
  // to select one first (FR-024 — empty state must offer a guiding action).
  const handleSetCoordinatesCta = useCallback(() => {
    const targetNodeId = selectedNodeIds[0];
    if (targetNodeId) {
      openNodeInspector(targetNodeId);
    } else {
      addToast({
        type: 'info',
        title: 'Select a node first',
        message: 'Click a node on the map (or in the node list) to set its coordinates.',
      });
    }
  }, [selectedNodeIds, openNodeInspector, addToast]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas" data-testid="geomap-container">
      <Toolbar />

      {/* Info banner for nodes without coordinates */}
      {nodesWithoutCoords.length > 0 && (
        <div
          className="bg-info/10 flex flex-wrap items-center gap-2 px-4 py-2 text-sm text-info"
          data-testid="geomap-no-coords-banner"
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {geoNodes.length} of {topology.nodes.length} {geoNodes.length === 1 ? 'node has' : 'nodes have'} geographic coordinates.{' '}
            {nodesWithoutCoords.length} shown at {userLocation ? 'your location' : 'default location'} — click a node to set its location.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSetCoordinatesCta}
            data-testid="geomap-set-coordinates-cta"
            className="shrink-0"
          >
            <MapPin className="mr-1.5 h-3.5 w-3.5" />
            Set coordinates on selected node
          </Button>
        </div>
      )}

      {/* Empty state when no nodes have geographic coordinates at all */}
      {topology.nodes.length > 0 && geoNodes.length === 0 && (
        <div
          className="flex flex-col items-center justify-center gap-3 border-b border-border bg-elevated px-4 py-6 text-center text-sm text-text-secondary"
          data-testid="geomap-empty-state"
        >
          <MapPin className="h-8 w-8 text-text-muted" />
          <div>
            <div className="font-medium text-text-primary">No geographic coordinates yet</div>
            <p className="mt-1 max-w-md text-xs text-text-tertiary">
              {topology.nodes.length} {pluralize('node', topology.nodes.length)} in this topology, but none have a latitude/longitude.
              Set coordinates to plot nodes on the map.
            </p>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={handleSetCoordinatesCta}
            data-testid="geomap-empty-state-cta"
          >
            <MapPin className="mr-1.5 h-3.5 w-3.5" />
            Set coordinates on selected node
          </Button>
        </div>
      )}

      <div className="relative isolate flex-1">
        <MapContainer
          center={boundsNodes.length > 0 ? [boundsNodes[0].lat, boundsNodes[0].lng] : DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution={TILE_ATTRIBUTION}
            url={resolvedTheme === 'dark' ? DARK_TILES : LIGHT_TILES}
          />

          {/* Map click handler for deselection */}
          <MapClickHandler onMapClick={handleMapClick} elementClickedRef={elementClickedRef} />

          {/* Auto-fit bounds to nodes */}
          <MapBoundsFitter nodes={boundsNodes} />

          {/* Render edges first (so nodes appear on top) */}
          {topology.edges.map((edge) => {
            const sourceNode = nodeMap.get(edge.source.nodeId);
            const targetNode = nodeMap.get(edge.target.nodeId);

            if (!sourceNode || !targetNode) return null;

            return (
              <GeoMapEdge
                key={edge.id}
                edge={edge}
                sourceNode={sourceNode}
                targetNode={targetNode}
                selected={selectedEdgeIds.includes(edge.id)}
                isWorkingPath={servicePathEdges.workingEdgeIds.has(edge.id)}
                isProtectionPath={servicePathEdges.protectionEdgeIds.has(edge.id)}
                onClick={handleEdgeClick}
              />
            );
          })}

          {/* Render positioned node markers */}
          {geoNodes.map((node) => (
            <GeoMapMarker
              key={node.id}
              node={node}
              selected={selectedNodeIds.includes(node.id)}
              onClick={handleNodeClick}
            />
          ))}

          {/* Render unpositioned node markers (at user location with visual indicator) */}
          {unpositionedNodesWithCoords.map((node) => (
            <GeoMapMarker
              key={node.id}
              node={node}
              selected={selectedNodeIds.includes(node.id)}
              onClick={handleNodeClick}
            />
          ))}
        </MapContainer>
      </div>
    </div>
  );
};
