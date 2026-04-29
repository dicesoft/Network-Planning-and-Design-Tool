import React from 'react';
import { Polyline, Popup, Tooltip } from 'react-leaflet';
import { NetworkEdge, NetworkNode, EDGE_STATE_CONFIGS, SERVICE_PATH_STYLES } from '@/types';

interface GeoMapEdgeProps {
  edge: NetworkEdge;
  sourceNode: NetworkNode;
  targetNode: NetworkNode;
  selected: boolean;
  isWorkingPath?: boolean;
  isProtectionPath?: boolean;
  onClick: (edgeId: string) => void;
}

export const GeoMapEdge: React.FC<GeoMapEdgeProps> = ({
  edge,
  sourceNode,
  targetNode,
  selected,
  isWorkingPath,
  isProtectionPath,
  onClick,
}) => {
  const sourceLat = sourceNode.location?.latitude;
  const sourceLng = sourceNode.location?.longitude;
  const targetLat = targetNode.location?.latitude;
  const targetLng = targetNode.location?.longitude;

  // Skip edges where endpoints don't have coordinates
  if (
    sourceLat === undefined ||
    sourceLng === undefined ||
    targetLat === undefined ||
    targetLng === undefined
  ) {
    return null;
  }

  const stateConfig = EDGE_STATE_CONFIGS[edge.state];
  const isFailed = edge.state === 'failed';

  // Determine color, weight, dash, opacity
  // Priority: selection > service path > failed state > default (accent)
  let color: string;
  let weight: number;
  let opacity = 0.85;
  let dashArray: string | undefined;

  if (selected) {
    color = '#3182ce';
    weight = 5;
    opacity = 1;
    dashArray = undefined;
  } else if (isWorkingPath) {
    // Working path: solid blue — shared constants with schematic NetworkEdge
    color = SERVICE_PATH_STYLES.working.color;
    weight = SERVICE_PATH_STYLES.working.weight;
    opacity = 0.95;
    dashArray = SERVICE_PATH_STYLES.working.dashArray;
  } else if (isProtectionPath) {
    // Protection path: green dashed — shared constants with schematic NetworkEdge
    color = SERVICE_PATH_STYLES.protection.color;
    weight = SERVICE_PATH_STYLES.protection.weight;
    opacity = 0.9;
    dashArray = SERVICE_PATH_STYLES.protection.dashArray;
  } else if (isFailed) {
    // Failed edge: red dashed
    color = '#e53e3e';
    weight = 3;
    opacity = 0.9;
    dashArray = '8, 5';
  } else {
    // Default: theme accent color for active/planned edges
    color = stateConfig.color === '#cbd5e0' ? '#3182ce' : stateConfig.color;
    weight = 3;
    dashArray = stateConfig.dashed ? '10, 5' : undefined;
  }

  // Build distance label text
  const distanceLabel = edge.properties.distance
    ? `${edge.properties.distance} km`
    : undefined;

  const positions: [number, number][] = [
    [sourceLat, sourceLng],
    [targetLat, targetLng],
  ];

  // Determine glow style when edge is part of a service path
  const glowStyle = isWorkingPath
    ? SERVICE_PATH_STYLES.workingGlow
    : isProtectionPath
      ? SERVICE_PATH_STYLES.protectionGlow
      : null;

  return (
    <>
      {/* Glow/halo polyline behind service-highlighted edges */}
      {glowStyle && (
        <Polyline
          positions={positions}
          pathOptions={{
            color: glowStyle.color,
            weight: glowStyle.weight,
            opacity: glowStyle.opacity,
            dashArray: undefined,
            lineCap: 'round',
            lineJoin: 'round',
          }}
          interactive={false}
        />
      )}

      <Polyline
        positions={positions}
        pathOptions={{
          color,
          weight,
          opacity,
          dashArray,
        }}
        eventHandlers={{
          click: () => onClick(edge.id),
        }}
      >
        {/* Distance tooltip - visible on hover at sufficient zoom */}
        {distanceLabel && (
          <Tooltip sticky direction="center" opacity={0.9}>
            <span className="text-xs font-medium">{distanceLabel}</span>
          </Tooltip>
        )}

        <Popup>
          <div className="min-w-[150px]">
            <div className="font-semibold">{edge.name}</div>
            <div className="text-xs text-gray-500">
              {sourceNode.name} → {targetNode.name}
            </div>
            {edge.properties.distance && (
              <div className="mt-1 text-xs">
                Distance: {edge.properties.distance} km
              </div>
            )}
            <div className="mt-1 text-xs">
              State: <span className="capitalize">{edge.state}</span>
            </div>
            {isWorkingPath && (
              <div className="mt-1 text-xs font-medium text-blue-600">
                Working Path
              </div>
            )}
            {isProtectionPath && (
              <div className="mt-1 text-xs font-medium text-green-500">
                Protection Path
              </div>
            )}
          </div>
        </Popup>
      </Polyline>
    </>
  );
};
