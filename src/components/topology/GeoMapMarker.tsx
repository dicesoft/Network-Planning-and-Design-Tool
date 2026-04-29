import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { NetworkNode, NODE_TYPE_CONFIGS, NodeType } from '@/types';
import { GeoMapNode } from './GeoMapView';

interface GeoMapMarkerProps {
  node: NetworkNode | GeoMapNode;
  selected: boolean;
  onClick: (nodeId: string) => void;
}

/**
 * Create a custom icon for a node type
 */
const createNodeIcon = (nodeType: NodeType, selected: boolean, isUnpositioned?: boolean): L.DivIcon => {
  const config = NODE_TYPE_CONFIGS[nodeType] || NODE_TYPE_CONFIGS.custom;
  const size = selected ? 36 : 30;
  const borderWidth = selected ? 3 : 2;
  const borderColor = selected ? '#3182ce' : isUnpositioned ? '#f59e0b' : '#ffffff';

  // Unpositioned nodes: dashed amber border with pulsing animation
  const borderStyle = isUnpositioned ? 'dashed' : 'solid';
  const cssClass = isUnpositioned ? 'geo-marker-unpositioned' : '';

  return L.divIcon({
    className: 'custom-node-marker',
    html: `
      <div class="${cssClass}" style="
        width: ${size}px;
        height: ${size}px;
        border-radius: ${isUnpositioned ? '50%' : '8px'};
        background: ${config.color};
        border: ${borderWidth}px ${borderStyle} ${borderColor};
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
        transition: transform 0.15s ease;
        ${selected ? 'transform: scale(1.1);' : ''}
      ">
        ${config.shortLabel}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

export const GeoMapMarker: React.FC<GeoMapMarkerProps> = ({
  node,
  selected,
  onClick,
}) => {
  // Check if this is an unpositioned node with temporary coordinates
  const geoNode = node as GeoMapNode;
  const isUnpositioned = geoNode._isUnpositioned === true;

  // Use temp location for unpositioned nodes, otherwise use real location
  const latitude = isUnpositioned
    ? geoNode._tempLocation?.latitude
    : node.location?.latitude;
  const longitude = isUnpositioned
    ? geoNode._tempLocation?.longitude
    : node.location?.longitude;

  // Skip nodes without valid coordinates (should not happen with temp location)
  if (latitude === undefined || longitude === undefined) {
    return null;
  }

  const icon = createNodeIcon(node.type, selected, isUnpositioned);

  return (
    <Marker
      position={[latitude, longitude]}
      icon={icon}
      eventHandlers={{
        click: () => onClick(node.id),
      }}
    >
      <Popup>
        <div className="min-w-[150px]">
          <div className="font-semibold">{node.name}</div>
          <div className="text-xs text-gray-500">
            {NODE_TYPE_CONFIGS[node.type]?.label || node.type}
          </div>
          {isUnpositioned ? (
            <div className="mt-1 text-xs font-medium text-amber-600">
              No location set - click to configure
            </div>
          ) : (
            <>
              <div className="mt-1 text-xs">
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </div>
              {node.location?.address && (
                <div className="mt-1 text-xs text-gray-600">
                  {node.location.address}
                </div>
              )}
            </>
          )}
        </div>
      </Popup>
    </Marker>
  );
};
