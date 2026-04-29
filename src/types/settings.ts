/**
 * Settings types for the application
 */

import type { NodeType } from './network';
import type { GridSize } from '@/stores/uiStore';
import type { TransceiverType } from './transceiver';
import type { CardDefinition } from './inventory';
import { DEFAULT_CARD_LIBRARY } from './inventory';

// ============================================================================
// General Settings
// ============================================================================

/**
 * Distance/length unit preference
 */
export type DistanceUnit = 'km' | 'mi';

/**
 * General application settings
 */
export interface GeneralSettings {
  /** Auto-save topology to localStorage (default: true) */
  autoSave: boolean;
  /** Distance unit for display (default: 'km') */
  distanceUnit: DistanceUnit;
  /** Show confirmation dialogs before destructive actions (default: true) */
  confirmDestructiveActions: boolean;
  /** Show "Coming Soon" / roadmap surfaces (default: false) */
  showRoadmap: boolean;
}

// ============================================================================
// Canvas Settings
// ============================================================================

/**
 * Canvas/topology editor settings
 */
export interface CanvasSettings {
  /** Show grid on canvas (default: true) */
  gridVisible: boolean;
  /** Grid spacing in pixels (default: 40) */
  gridSize: GridSize;
  /** Snap nodes to grid when moving (default: true) */
  snapToGrid: boolean;
  /** Default node type when adding via double-click (default: 'router') */
  defaultNodeType: NodeType;
  /** Show minimap overlay (default: false) */
  showMinimap: boolean;
  /** Default node name pattern (default: '{type}-{n}') */
  defaultNodeNamePattern: string;
}

// ============================================================================
// Network Settings
// ============================================================================

/**
 * Default fiber profile for new edges
 */
export type DefaultFiberProfile = 'G.652.D' | 'G.654.E' | 'G.655' | 'G.657.A1';

/**
 * Network configuration defaults
 */
export interface NetworkSettings {
  /** Default fiber profile for new edges (default: 'G.652.D') */
  defaultFiberProfile: DefaultFiberProfile;
  /** Default edge distance in km (default: 50) */
  defaultEdgeDistance: number;
  /** Maximum channels per DWDM port (default: 96) */
  maxDWDMChannels: number;
  /** Default vendor for new nodes (default: 'generic') */
  defaultVendor: string;
  /** Default node subtype key for new nodes (default: '') */
  defaultNodeSubtype: string;
}

// ============================================================================
// Simulation Settings
// ============================================================================

/**
 * Simulation default configuration
 */
export interface SimulationSettings {
  /** Default max simultaneous edge failures for exhaustive analysis (default: 1) */
  defaultMaxEdgeFailures: number;
  /** Default max simultaneous node failures for exhaustive analysis (default: 0) */
  defaultMaxNodeFailures: number;
  /** Maximum scenarios before warning user (default: 10000) */
  maxScenariosWarningThreshold: number;
}

// ============================================================================
// Advanced Settings
// ============================================================================

/**
 * Advanced/developer settings
 */
export interface AdvancedSettings {
  /** Enable debug panel in navigation (default: true) */
  showDebugPanel: boolean;
  /** Enable cross-tab synchronization (default: true) */
  crossTabSync: boolean;
  /** History limit for undo/redo (default: 50) */
  historyLimit: number;
}

// ============================================================================
// Node Subtype System
// ============================================================================

/**
 * Size flavor controlling port counts and switching capacity
 */
export type NodeSizeFlavor = 'small' | 'medium' | 'large';

/**
 * Node subtype preset definition
 */
export interface NodeSubtypePreset {
  /** Unique key for this subtype (e.g., 'core', 'edge', 'pe') */
  key: string;
  /** Display label (e.g., 'Core Router', 'Edge Router') */
  label: string;
  /** Which node type this subtype applies to */
  nodeType: NodeType;
  /** Size flavors with their configurations */
  sizes: Record<NodeSizeFlavor, NodeSizeConfig>;
}

/**
 * Configuration for a node size flavor
 */
export interface NodeSizeConfig {
  /** Number of BW ports */
  bwPorts: number;
  /** Number of DWDM ports */
  dwdmPorts: number;
  /** Switching capacity in Gbps */
  switchingCapacity: number;
}

// ============================================================================
// Optical Settings
// ============================================================================

/**
 * Default optical engineering parameters for OSNR calculations
 */
export interface OpticalSettings {
  /** Default transmitter launch power in dBm (default: 0) */
  defaultLaunchPower: number;
  /** Default amplifier noise figure in dB (default: 5.5) */
  defaultNF: number;
  /** Default end-of-life margin in dB (default: 3.0) */
  defaultEoLMargin: number;
  /** Default connector loss in dB (default: 0.5) */
  defaultConnectorLoss: number;
}

// ============================================================================
// Combined Settings
// ============================================================================

/**
 * Complete application settings
 */
export interface AppSettings {
  /** Schema version for migration support */
  version: number;
  general: GeneralSettings;
  canvas: CanvasSettings;
  network: NetworkSettings;
  simulation: SimulationSettings;
  advanced: AdvancedSettings;
  /** Custom node subtype presets (user-configurable) */
  nodeSubtypes: NodeSubtypePreset[];
  /** Optical engineering defaults for OSNR calculations */
  optical?: OpticalSettings;
  /** User transceiver library (extends DEFAULT_TRANSCEIVERS) */
  transceiverLibrary?: TransceiverType[];
  /** User card library for inventory management */
  cardLibrary?: CardDefinition[];
}

// ============================================================================
// Settings Tab
// ============================================================================

/**
 * Available settings dialog tabs
 */
export type SettingsTab = 'general' | 'canvas' | 'network' | 'simulation' | 'advanced' | 'optical' | 'inventory';

// ============================================================================
// Defaults
// ============================================================================

/**
 * Default general settings
 */
export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  autoSave: true,
  distanceUnit: 'km',
  confirmDestructiveActions: true,
  showRoadmap: false,
};

/**
 * Default canvas settings
 */
export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  gridVisible: true,
  gridSize: 40,
  snapToGrid: true,
  defaultNodeType: 'router',
  showMinimap: false,
  defaultNodeNamePattern: '{type}-{n}',
};

/**
 * Default network settings
 */
export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  defaultFiberProfile: 'G.652.D',
  defaultEdgeDistance: 50,
  maxDWDMChannels: 96,
  defaultVendor: 'generic',
  defaultNodeSubtype: '',
};

/**
 * Default simulation settings
 */
export const DEFAULT_SIMULATION_SETTINGS: SimulationSettings = {
  defaultMaxEdgeFailures: 1,
  defaultMaxNodeFailures: 0,
  maxScenariosWarningThreshold: 10000,
};

/**
 * Default advanced settings
 */
export const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  showDebugPanel: true,
  crossTabSync: true,
  historyLimit: 50,
};

/**
 * Default optical settings
 */
export const DEFAULT_OPTICAL_SETTINGS: OpticalSettings = {
  defaultLaunchPower: 0,
  defaultNF: 5.5,
  defaultEoLMargin: 3.0,
  defaultConnectorLoss: 0.5,
};

/**
 * Built-in node subtype presets
 */
export const DEFAULT_NODE_SUBTYPES: NodeSubtypePreset[] = [
  // Router subtypes
  {
    key: 'core',
    label: 'Core Router',
    nodeType: 'router',
    sizes: {
      small: { bwPorts: 4, dwdmPorts: 2, switchingCapacity: 100 },
      medium: { bwPorts: 8, dwdmPorts: 4, switchingCapacity: 400 },
      large: { bwPorts: 16, dwdmPorts: 8, switchingCapacity: 1600 },
    },
  },
  {
    key: 'edge',
    label: 'Edge Router',
    nodeType: 'router',
    sizes: {
      small: { bwPorts: 4, dwdmPorts: 1, switchingCapacity: 40 },
      medium: { bwPorts: 8, dwdmPorts: 2, switchingCapacity: 100 },
      large: { bwPorts: 12, dwdmPorts: 4, switchingCapacity: 400 },
    },
  },
  {
    key: 'pe',
    label: 'PE Router',
    nodeType: 'router',
    sizes: {
      small: { bwPorts: 4, dwdmPorts: 1, switchingCapacity: 40 },
      medium: { bwPorts: 8, dwdmPorts: 2, switchingCapacity: 200 },
      large: { bwPorts: 16, dwdmPorts: 4, switchingCapacity: 800 },
    },
  },
  {
    key: 'p',
    label: 'P Router',
    nodeType: 'router',
    sizes: {
      small: { bwPorts: 2, dwdmPorts: 2, switchingCapacity: 100 },
      medium: { bwPorts: 4, dwdmPorts: 4, switchingCapacity: 400 },
      large: { bwPorts: 8, dwdmPorts: 8, switchingCapacity: 1600 },
    },
  },
  {
    key: 'generic-router',
    label: 'Generic Router',
    nodeType: 'router',
    sizes: {
      small: { bwPorts: 4, dwdmPorts: 0, switchingCapacity: 80 },
      medium: { bwPorts: 10, dwdmPorts: 2, switchingCapacity: 280 },
      large: { bwPorts: 36, dwdmPorts: 4, switchingCapacity: 720 },
    },
  },
  // Switch subtypes
  {
    key: 'l2-switch',
    label: 'L2 Switch',
    nodeType: 'switch',
    sizes: {
      small: { bwPorts: 8, dwdmPorts: 0, switchingCapacity: 10 },
      medium: { bwPorts: 24, dwdmPorts: 0, switchingCapacity: 48 },
      large: { bwPorts: 48, dwdmPorts: 0, switchingCapacity: 176 },
    },
  },
  {
    key: 'l3-switch',
    label: 'L3 Switch',
    nodeType: 'switch',
    sizes: {
      small: { bwPorts: 8, dwdmPorts: 0, switchingCapacity: 24 },
      medium: { bwPorts: 24, dwdmPorts: 2, switchingCapacity: 96 },
      large: { bwPorts: 48, dwdmPorts: 4, switchingCapacity: 384 },
    },
  },
  {
    key: 'generic-switch',
    label: 'Generic Switch',
    nodeType: 'switch',
    sizes: {
      small: { bwPorts: 24, dwdmPorts: 0, switchingCapacity: 48 },
      medium: { bwPorts: 52, dwdmPorts: 0, switchingCapacity: 88 },
      large: { bwPorts: 54, dwdmPorts: 6, switchingCapacity: 1080 },
    },
  },
  // OADM subtypes
  {
    key: 'roadm',
    label: 'ROADM',
    nodeType: 'oadm',
    sizes: {
      small: { bwPorts: 0, dwdmPorts: 4, switchingCapacity: 0 },
      medium: { bwPorts: 0, dwdmPorts: 8, switchingCapacity: 0 },
      large: { bwPorts: 0, dwdmPorts: 16, switchingCapacity: 0 },
    },
  },
  {
    key: 'fixed-oadm',
    label: 'Fixed OADM',
    nodeType: 'oadm',
    sizes: {
      small: { bwPorts: 0, dwdmPorts: 2, switchingCapacity: 0 },
      medium: { bwPorts: 0, dwdmPorts: 4, switchingCapacity: 0 },
      large: { bwPorts: 0, dwdmPorts: 6, switchingCapacity: 0 },
    },
  },
  {
    key: 'generic-oadm',
    label: 'Generic OADM',
    nodeType: 'oadm',
    sizes: {
      small: { bwPorts: 0, dwdmPorts: 6, switchingCapacity: 0 },
      medium: { bwPorts: 0, dwdmPorts: 12, switchingCapacity: 0 },
      large: { bwPorts: 0, dwdmPorts: 24, switchingCapacity: 0 },
    },
  },
];

/**
 * Complete default settings
 */
export const DEFAULT_SETTINGS: AppSettings = {
  version: 4,
  general: { ...DEFAULT_GENERAL_SETTINGS },
  canvas: { ...DEFAULT_CANVAS_SETTINGS },
  network: { ...DEFAULT_NETWORK_SETTINGS },
  simulation: { ...DEFAULT_SIMULATION_SETTINGS },
  advanced: { ...DEFAULT_ADVANCED_SETTINGS },
  nodeSubtypes: [...DEFAULT_NODE_SUBTYPES],
  optical: { ...DEFAULT_OPTICAL_SETTINGS },
  cardLibrary: [...DEFAULT_CARD_LIBRARY],
};
