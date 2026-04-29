/**
 * Shared service path styling constants.
 * Used by both GeoMapEdge (Leaflet) and NetworkEdge (React Flow)
 * to ensure consistent working/protection path appearance across views.
 */

export interface PathStyle {
  color: string;
  weight: number;
  dashArray: string | undefined;
}

export interface GlowStyle {
  color: string;
  weight: number;
  opacity: number;
}

export const SERVICE_PATH_STYLES = {
  working: {
    color: '#3b82f6',     // Blue
    weight: 4,
    dashArray: undefined, // Solid
  } as PathStyle,

  protection: {
    color: '#22c55e',     // Green
    weight: 3,
    dashArray: '8,4',     // Dashed
  } as PathStyle,

  /** Glow/halo styles for GeoMap service path highlights */
  workingGlow: {
    color: '#3b82f6',
    weight: 8,
    opacity: 0.25,
  } as GlowStyle,

  protectionGlow: {
    color: '#22c55e',
    weight: 7,
    opacity: 0.2,
  } as GlowStyle,
} as const;
