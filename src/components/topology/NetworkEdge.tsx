import { memo, useCallback, useRef, useEffect } from 'react';
import {
  EdgeProps,
  EdgeLabelRenderer,
  BaseEdge,
  useReactFlow,
} from '@xyflow/react';
import { NetworkEdge, EDGE_STATE_CONFIGS, EdgeState, SERVICE_PATH_STYLES } from '@/types';
import { cn } from '@/lib/utils';
import { useNetworkStore } from '@/stores/networkStore';

interface NetworkEdgeData extends NetworkEdge {
  selected?: boolean;
  // Handle sharing info for smart curve offsetting
  sourceShared?: boolean;
  targetShared?: boolean;
  sourceGroupIndex?: number;
  sourceGroupCount?: number;
  targetGroupIndex?: number;
  targetGroupCount?: number;
  // Service path highlighting
  isWorkingPath?: boolean;
  isProtectionPath?: boolean;
  // Utilization overlay
  showUtilization?: boolean;
  utilizationPercent?: number;
  utilizationUsed?: number;
  utilizationTotal?: number;
}

// Type assertion helper for data
type NetworkEdgeProps = EdgeProps & {
  data?: NetworkEdgeData;
};

export const NetworkEdgeComponent = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    style,
  }: NetworkEdgeProps) => {
    const {
      sourceShared = false,
      targetShared = false,
      sourceGroupIndex = 0,
      sourceGroupCount = 1,
      targetGroupIndex = 0,
      targetGroupCount = 1,
    } = data || {};

    const { getViewport } = useReactFlow();
    const updateEdgeBendPoint = useNetworkStore((s) => s.updateEdgeBendPoint);
    const isDraggingRef = useRef(false);

    // Get user-defined bend point if exists
    const userBendPoint = data?.properties?.bendPoint;

    // Calculate perpendicular direction for curve offsets
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular unit vector (rotated 90 degrees)
    const perpX = -dy / len;
    const perpY = dx / len;

    // Calculate offset amounts based on which handles are shared
    // Offset is applied via control points, not endpoints, so edges converge at handles
    const sourceOffset = sourceShared
      ? (sourceGroupIndex - (sourceGroupCount - 1) / 2) * 80
      : 0;
    const targetOffset = targetShared
      ? (targetGroupIndex - (targetGroupCount - 1) / 2) * 80
      : 0;

    // Build a custom cubic bezier path that:
    // - Starts exactly at sourceX, sourceY (the handle position)
    // - Ends exactly at targetX, targetY (the handle position)
    // - Uses offset control points to create distinct curves

    // Base control point distance (how far control points are from endpoints)
    const controlDistance = len * 0.4;

    // Calculate control points based on source/target positions
    // These determine the curve direction at each endpoint
    let sourceControlX = sourceX;
    let sourceControlY = sourceY;
    let targetControlX = targetX;
    let targetControlY = targetY;

    // Adjust control points based on handle position (top, right, bottom, left)
    switch (sourcePosition) {
      case 'top':
        sourceControlY = sourceY - controlDistance;
        sourceControlX = sourceX + perpX * sourceOffset;
        break;
      case 'bottom':
        sourceControlY = sourceY + controlDistance;
        sourceControlX = sourceX + perpX * sourceOffset;
        break;
      case 'left':
        sourceControlX = sourceX - controlDistance;
        sourceControlY = sourceY + perpY * sourceOffset;
        break;
      case 'right':
        sourceControlX = sourceX + controlDistance;
        sourceControlY = sourceY + perpY * sourceOffset;
        break;
      default:
        // Default: offset perpendicular to the edge direction
        sourceControlX = sourceX + dx * 0.25 + perpX * sourceOffset;
        sourceControlY = sourceY + dy * 0.25 + perpY * sourceOffset;
    }

    switch (targetPosition) {
      case 'top':
        targetControlY = targetY - controlDistance;
        targetControlX = targetX + perpX * targetOffset;
        break;
      case 'bottom':
        targetControlY = targetY + controlDistance;
        targetControlX = targetX + perpX * targetOffset;
        break;
      case 'left':
        targetControlX = targetX - controlDistance;
        targetControlY = targetY + perpY * targetOffset;
        break;
      case 'right':
        targetControlX = targetX + controlDistance;
        targetControlY = targetY + perpY * targetOffset;
        break;
      default:
        // Default: offset perpendicular to the edge direction
        targetControlX = targetX - dx * 0.25 + perpX * targetOffset;
        targetControlY = targetY - dy * 0.25 + perpY * targetOffset;
    }

    // Calculate edge path and label position
    let edgePath: string;
    let labelX: number;
    let labelY: number;
    let bendHandleX: number;
    let bendHandleY: number;

    if (userBendPoint) {
      // Use quadratic bezier through user's bend point
      edgePath = `M ${sourceX} ${sourceY} Q ${userBendPoint.x} ${userBendPoint.y}, ${targetX} ${targetY}`;
      labelX = userBendPoint.x;
      labelY = userBendPoint.y;
      bendHandleX = userBendPoint.x;
      bendHandleY = userBendPoint.y;
    } else {
      // Create custom cubic bezier path
      edgePath = `M ${sourceX} ${sourceY} C ${sourceControlX} ${sourceControlY}, ${targetControlX} ${targetControlY}, ${targetX} ${targetY}`;
      // Calculate label position at the midpoint of the curve
      labelX = (sourceX + 3 * sourceControlX + 3 * targetControlX + targetX) / 8;
      labelY = (sourceY + 3 * sourceControlY + 3 * targetControlY + targetY) / 8;
      // Bend handle at curve midpoint
      bendHandleX = labelX;
      bendHandleY = labelY;
    }

    const state = (data?.state as EdgeState) || 'active';
    const stateConfig = EDGE_STATE_CONFIGS[state];

    // Service path highlighting
    const isWorkingPath = data?.isWorkingPath ?? false;
    const isProtectionPath = data?.isProtectionPath ?? false;

    // Utilization overlay data
    const showUtilization = data?.showUtilization ?? false;
    const utilizationPercent = data?.utilizationPercent;
    const utilizationUsed = data?.utilizationUsed;
    const utilizationTotal = data?.utilizationTotal;

    // Get utilization color: green (<50%), yellow (50-80%), red (>80%), gray (no data)
    const getUtilizationColor = (pct: number | undefined) => {
      if (pct === undefined) return '#a0aec0'; // gray - no DWDM data
      if (pct > 80) return '#e53e3e'; // red
      if (pct >= 50) return '#d69e2e'; // yellow
      return '#38a169'; // green
    };

    // Determine stroke color and style
    // Priority: selection > service path > utilization overlay > edge state
    let strokeColor = stateConfig.color;
    let strokeWidth = 2;
    let strokeDasharray = stateConfig.dashed ? '8,4' : undefined;

    if (showUtilization && state !== 'failed') {
      // Utilization overlay active: color by utilization percentage
      strokeColor = getUtilizationColor(utilizationPercent);
      strokeWidth = utilizationPercent !== undefined
        ? Math.max(2, Math.min(5, 2 + (utilizationPercent / 100) * 3))
        : 2;
      strokeDasharray = undefined;
    }

    if (isWorkingPath) {
      // Working path: solid blue, wider — shared constants with GeoMapEdge
      strokeColor = SERVICE_PATH_STYLES.working.color;
      strokeWidth = SERVICE_PATH_STYLES.working.weight;
      strokeDasharray = SERVICE_PATH_STYLES.working.dashArray;
    } else if (isProtectionPath) {
      // Protection path: green, dashed — shared constants with GeoMapEdge
      strokeColor = SERVICE_PATH_STYLES.protection.color;
      strokeWidth = SERVICE_PATH_STYLES.protection.weight;
      strokeDasharray = SERVICE_PATH_STYLES.protection.dashArray;
    }

    // Selection overrides path highlighting for visibility
    if (selected) {
      strokeColor = '#3182ce';
      strokeWidth = isWorkingPath || isProtectionPath ? 4 : 3;
    }

    // Animation for failed edges
    const isAnimated = state === 'failed';

    // Handle bend point dragging with delta-based calculation
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingRef.current = true;

      // Capture initial positions
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startBendX = bendHandleX;
      const startBendY = bendHandleY;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;

        // Get zoom level to scale the delta
        const { zoom } = getViewport();

        // Calculate delta, scaled by zoom
        const deltaX = (moveEvent.clientX - startMouseX) / zoom;
        const deltaY = (moveEvent.clientY - startMouseY) / zoom;

        // Apply delta to starting position
        updateEdgeBendPoint(id, {
          x: startBendX + deltaX,
          y: startBendY + deltaY
        });
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }, [id, bendHandleX, bendHandleY, getViewport, updateEdgeBendPoint]);

    // Reset bend point on double-click
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      updateEdgeBendPoint(id, null);
    }, [id, updateEdgeBendPoint]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        isDraggingRef.current = false;
      };
    }, []);

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          style={{
            ...style,
            stroke: strokeColor,
            strokeWidth,
            strokeDasharray,
          }}
          className={cn(
            'transition-all duration-150',
            isAnimated && 'animate-pulse'
          )}
        />

        {/* Draggable Bend Point Handle - only visible when edge is selected */}
        {selected && (
          <EdgeLabelRenderer>
            <div
              className={cn(
                'absolute w-4 h-4 rounded-full cursor-move',
                'border-2 border-white shadow-lg',
                'hover:scale-125 transition-transform',
                '-translate-x-1/2 -translate-y-1/2',
                userBendPoint
                  ? 'bg-accent-primary'
                  : 'bg-accent-secondary opacity-60 hover:opacity-100'
              )}
              style={{
                left: bendHandleX,
                top: bendHandleY,
                pointerEvents: 'all',
                zIndex: 1000,
              }}
              onMouseDown={handleMouseDown}
              onDoubleClick={handleDoubleClick}
              title="Drag to adjust edge path, double-click to reset"
            />
          </EdgeLabelRenderer>
        )}

        {/* Edge Label */}
        {data && (
          <EdgeLabelRenderer>
            <div
              className={cn(
                'absolute pointer-events-none px-2 py-1 rounded-md text-xs shadow-sm',
                'transform -translate-x-1/2 -translate-y-1/2',
                state === 'failed'
                  ? 'bg-danger/10 border border-danger text-danger font-medium'
                  : showUtilization && utilizationPercent !== undefined
                    ? 'font-mono font-semibold text-white'
                    : 'bg-elevated border border-border text-text-secondary'
              )}
              style={{
                left: labelX,
                top: labelY + (selected ? 16 : 0), // Offset label when handle is visible
                ...(showUtilization && utilizationPercent !== undefined
                  ? { background: getUtilizationColor(utilizationPercent), border: 'none' }
                  : {}),
              }}
            >
              {state === 'failed' ? (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
                  FIBER CUT
                </span>
              ) : showUtilization && utilizationPercent !== undefined ? (
                `${utilizationUsed}/${utilizationTotal} ch`
              ) : data.properties.distance ? (
                `${data.properties.distance} km`
              ) : (
                data.name
              )}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }
);

NetworkEdgeComponent.displayName = 'NetworkEdgeComponent';
