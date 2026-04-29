/**
 * Network Topology Data Model Types
 * Based on Design.md JSON Schema definitions
 */

// Node Types
export type NodeType = 'router' | 'switch' | 'oadm' | 'amplifier' | 'terminal' | 'osp-termination' | 'olt' | 'ont' | 'custom';
export type VendorType = 'nokia' | 'huawei' | 'cisco' | 'juniper' | 'ciena' | 'generic';

/**
 * Node types that can terminate L2/L3 IP services (Ethernet, IP routing)
 * These are packet-switching capable devices that can process L2 frames or L3 packets.
 */
export const IP_CAPABLE_NODE_TYPES: readonly NodeType[] = ['router', 'switch'] as const;

/**
 * Node types that are purely optical/DWDM equipment
 * These nodes handle wavelengths only and cannot process IP/Ethernet traffic.
 */
export const OPTICAL_ONLY_NODE_TYPES: readonly NodeType[] = ['oadm', 'amplifier', 'terminal'] as const;

/**
 * Node types that are "Coming Soon" — visible in UI but not fully functional.
 * Used to gate drag-and-drop, selection, and display "Coming Soon" badges.
 */
export const COMING_SOON_NODE_TYPES: readonly NodeType[] = ['olt', 'ont'] as const;

/**
 * Helper function to check if a node type is a "Coming Soon" placeholder
 */
export const isComingSoonNodeType = (nodeType: NodeType): boolean =>
  (COMING_SOON_NODE_TYPES as readonly string[]).includes(nodeType);

/**
 * Node types that can terminate L1 DWDM services (wavelength services)
 * Includes OADMs, terminals, and amplifiers. Note: Routers with DWDM ports can
 * also participate in L1 services but primarily as client endpoints.
 */
export const DWDM_CAPABLE_NODE_TYPES: readonly NodeType[] = ['oadm', 'terminal', 'amplifier'] as const;

/**
 * Node types that are valid as L1 DWDM service ENDPOINTS (source/destination)
 * Only OADMs and terminals can be L1 service endpoints.
 * Amplifiers are intermediate nodes only (signal regeneration).
 * Routers/switches are L2/L3 endpoints and should use L1 as underlay.
 */
export const L1_ENDPOINT_NODE_TYPES: readonly NodeType[] = ['oadm', 'terminal'] as const;

/**
 * Helper function to check if a node type can terminate L2/L3 services
 */
export const isIPCapableNodeType = (nodeType: NodeType): boolean =>
  IP_CAPABLE_NODE_TYPES.includes(nodeType);

/**
 * Helper function to check if a node type is optical-only (no IP capability)
 */
export const isOpticalOnlyNodeType = (nodeType: NodeType): boolean =>
  OPTICAL_ONLY_NODE_TYPES.includes(nodeType);

/**
 * Helper function to check if a node type can terminate L1 DWDM services
 */
export const isDWDMCapableNodeType = (nodeType: NodeType): boolean =>
  DWDM_CAPABLE_NODE_TYPES.includes(nodeType);

/**
 * Helper function to check if a node type is valid as an L1 service endpoint
 */
export const isL1EndpointNodeType = (nodeType: NodeType): boolean =>
  L1_ENDPOINT_NODE_TYPES.includes(nodeType);
export type LayerType = 'application' | 'ip' | 'dwdm';
export type CapacityUnit = 'Gbps' | 'lambdas' | 'ports';
export type EdgeType = 'fiber' | 'ethernet' | 'virtual';
export type EdgeState = 'active' | 'planned' | 'failed';

// Fiber Profile Types
export type FiberProfileType = 'G.652.D' | 'G.654.E' | 'G.655' | 'G.657.A1' | 'custom';

/**
 * Fiber profile with optical parameters
 */
export interface FiberProfile {
  type: FiberProfileType;
  label: string;
  description: string;
  attenuation: number;           // dB/km at 1550nm
  chromaticDispersion: number;   // ps/(nm·km) at 1550nm
  pmd: number;                   // ps/√km (PMD coefficient)
  effectiveArea?: number;        // μm² (for non-linear calculations)
  nonLinearIndex?: number;       // n2 in m²/W (for non-linear calculations)
}

/**
 * Fiber parameters for an edge with optional overrides
 */
export interface FiberParameters {
  profileType: FiberProfileType;
  attenuationOverride?: number;
  chromaticDispersionOverride?: number;
  pmdOverride?: number;
  effectiveAreaOverride?: number;
  nonLinearIndexOverride?: number;
}

/**
 * Fiber profile configurations with ITU-T standard values
 */
export const FIBER_PROFILE_CONFIGS: Record<FiberProfileType, FiberProfile> = {
  'G.652.D': {
    type: 'G.652.D',
    label: 'ITU-T G.652.D',
    description: 'Standard single-mode fiber (SMF)',
    attenuation: 0.20,
    chromaticDispersion: 17,
    pmd: 0.1,
    effectiveArea: 80,
    nonLinearIndex: 2.6e-20,
  },
  'G.654.E': {
    type: 'G.654.E',
    label: 'ITU-T G.654.E',
    description: 'Submarine/Long-haul fiber with low loss',
    attenuation: 0.17,
    chromaticDispersion: 20,
    pmd: 0.1,
    effectiveArea: 125,
    nonLinearIndex: 2.3e-20,
  },
  'G.655': {
    type: 'G.655',
    label: 'ITU-T G.655',
    description: 'Non-zero dispersion-shifted fiber (NZDSF) for DWDM',
    attenuation: 0.22,
    chromaticDispersion: 4.5,
    pmd: 0.1,
    effectiveArea: 72,
    nonLinearIndex: 2.7e-20,
  },
  'G.657.A1': {
    type: 'G.657.A1',
    label: 'ITU-T G.657.A1',
    description: 'Bend-insensitive fiber for access networks',
    attenuation: 0.25,
    chromaticDispersion: 17,
    pmd: 0.2,
    effectiveArea: 80,
    nonLinearIndex: 2.6e-20,
  },
  'custom': {
    type: 'custom',
    label: 'Custom Profile',
    description: 'User-defined fiber parameters',
    attenuation: 0.20,
    chromaticDispersion: 17,
    pmd: 0.1,
    effectiveArea: 80,
    nonLinearIndex: 2.6e-20,
  },
};

// ============================================================================
// OSP Termination Types
// ============================================================================

/**
 * OSP (Outside Plant) termination types
 */
export type OSPTerminationType =
  | 'splice-closure'
  | 'fdf'              // Fiber Distribution Frame
  | 'patch-panel'
  | 'handhole'
  | 'manhole'
  | 'splitter'         // Passive optical splitter (1:N)
  | 'generic';

/**
 * Splitter ratio options for passive optical splitters
 */
export type SplitterRatio = '1:2' | '1:4' | '1:8' | '1:16' | '1:32' | '1:64';

/**
 * Splitter configuration (only when terminationType === 'splitter')
 */
export interface SplitterConfig {
  splitRatio: SplitterRatio;
  splitterLoss: number;  // dB (derived from ratio, but can override)
}

/**
 * Typical splitter insertion losses by ratio (dB)
 */
export const SPLITTER_LOSS_TABLE: Record<SplitterRatio, number> = {
  '1:2': 3.5,
  '1:4': 7.0,
  '1:8': 10.5,
  '1:16': 14.0,
  '1:32': 17.5,
  '1:64': 21.0,
};

/**
 * Maps which input port connects to which output port(s)
 */
export interface PortMapping {
  inputPortId: string;
  outputPortIds: string[];  // Array for splitter (1:N), single for pass-through
}

/**
 * OSP Termination properties for passive fiber breakpoints
 */
export interface OSPTerminationProperties {
  terminationType: OSPTerminationType;
  insertionLoss: number;           // dB (typical: 0.1-0.5 dB per splice, 0.3-1.0 for connectors)
  reflectance?: number;            // dB (typical: -40 to -60 dB)
  fiberCount?: number;             // Number of fiber pairs passing through
  isWeatherproof?: boolean;        // For outdoor installations
  splitterConfig?: SplitterConfig; // Only for splitter type
  portMappings?: PortMapping[];    // How ports connect internally
}

/**
 * Default OSP properties by termination type
 */
export const DEFAULT_OSP_PROPERTIES: Record<OSPTerminationType, Partial<OSPTerminationProperties>> = {
  'splice-closure': {
    terminationType: 'splice-closure',
    insertionLoss: 0.1,
    isWeatherproof: true,
  },
  'fdf': {
    terminationType: 'fdf',
    insertionLoss: 0.5,
    isWeatherproof: false,
  },
  'patch-panel': {
    terminationType: 'patch-panel',
    insertionLoss: 0.5,
    isWeatherproof: false,
  },
  'handhole': {
    terminationType: 'handhole',
    insertionLoss: 0.1,
    isWeatherproof: true,
  },
  'manhole': {
    terminationType: 'manhole',
    insertionLoss: 0.1,
    isWeatherproof: true,
  },
  'splitter': {
    terminationType: 'splitter',
    insertionLoss: 3.5,  // Default 1:2 splitter
    isWeatherproof: false,
    splitterConfig: {
      splitRatio: '1:2',
      splitterLoss: 3.5,
    },
  },
  'generic': {
    terminationType: 'generic',
    insertionLoss: 0.3,
    isWeatherproof: false,
  },
};

/**
 * OSP termination type display configurations
 */
export const OSP_TERMINATION_TYPE_CONFIGS: Record<OSPTerminationType, { label: string; description: string }> = {
  'splice-closure': {
    label: 'Splice Closure',
    description: 'Weatherproof enclosure for fiber splices',
  },
  'fdf': {
    label: 'Fiber Distribution Frame',
    description: 'Indoor fiber management and patching point',
  },
  'patch-panel': {
    label: 'Patch Panel',
    description: 'Fiber patch and cross-connect panel',
  },
  'handhole': {
    label: 'Handhole',
    description: 'Underground access point for fiber splices',
  },
  'manhole': {
    label: 'Manhole',
    description: 'Large underground access chamber',
  },
  'splitter': {
    label: 'Passive Splitter',
    description: 'Optical power splitter (1:N)',
  },
  'generic': {
    label: 'Generic OSP',
    description: 'Generic outside plant termination point',
  },
};

// ============================================================================
// Node Location Types
// ============================================================================

/**
 * Installation type for physical location
 */
export type InstallationType = 'indoor' | 'outdoor' | 'underground' | 'aerial';

/**
 * Physical location metadata for network nodes
 */
export interface NodeLocation {
  latitude?: number;          // Decimal degrees (-90 to 90)
  longitude?: number;         // Decimal degrees (-180 to 180)
  address?: string;           // Street address
  building?: string;          // Building/facility name
  floor?: string;             // Floor/level
  room?: string;              // Room/cabinet identifier
  installationType?: InstallationType;
}

// Port Types
export type PortType = 'bw' | 'dwdm';
export type PortDataRate = '1G' | '10G' | '25G' | '100G' | '400G';
export type PortStatus = 'available' | 'used';

// Import spectrum types for Port interface
import type { PortSpectrum } from './spectrum';
import type { ChassisDefinition, InstalledCard } from './inventory';

/**
 * Port interface for optical port management
 */
export interface Port {
  id: string;
  name: string;
  type: PortType;
  dataRate: PortDataRate;
  channels: number;           // B/W: 1 only, DWDM: up to 96
  status: PortStatus;
  connectedEdgeId?: string;   // Edge ID when used
  spectrum?: PortSpectrum;    // DWDM channel/slot allocations (for DWDM ports)
}

/**
 * Port constraints by type
 */
export const PORT_CONSTRAINTS = {
  bw: {
    maxDistance: 10,
    maxChannels: 1,
    wavelength: '1310nm',
    label: 'B/W (1310nm)',
    supportsSpectrum: false,
  },
  dwdm: {
    maxDistance: 150,
    maxChannels: 96,
    wavelength: '1550nm',
    label: 'DWDM (1550nm)',
    supportsSpectrum: true,
    defaultGridType: 'fixed-50ghz' as const,
    supportedGridTypes: ['fixed-100ghz', 'fixed-50ghz', 'flex-grid'] as const,
  },
} as const;

/**
 * Default port configurations by node type
 */
export const DEFAULT_PORTS_BY_NODE_TYPE: Record<NodeType, Omit<Port, 'id' | 'status' | 'connectedEdgeId'>[]> = {
  router: [
    { name: 'Eth-1', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Eth-2', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Eth-3', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Eth-4', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Line-1', type: 'dwdm', dataRate: '100G', channels: 96 },
    { name: 'Line-2', type: 'dwdm', dataRate: '100G', channels: 96 },
  ],
  switch: [
    { name: 'Port-1', type: 'bw', dataRate: '1G', channels: 1 },
    { name: 'Port-2', type: 'bw', dataRate: '1G', channels: 1 },
    { name: 'Port-3', type: 'bw', dataRate: '1G', channels: 1 },
    { name: 'Port-4', type: 'bw', dataRate: '1G', channels: 1 },
    { name: 'Port-5', type: 'bw', dataRate: '1G', channels: 1 },
    { name: 'Port-6', type: 'bw', dataRate: '1G', channels: 1 },
    { name: 'Port-7', type: 'bw', dataRate: '1G', channels: 1 },
    { name: 'Port-8', type: 'bw', dataRate: '1G', channels: 1 },
    { name: 'Uplink-1', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Uplink-2', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Uplink-3', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Uplink-4', type: 'bw', dataRate: '10G', channels: 1 },
  ],
  oadm: [
    { name: 'Line-1', type: 'dwdm', dataRate: '100G', channels: 96 },
    { name: 'Line-2', type: 'dwdm', dataRate: '100G', channels: 96 },
    { name: 'Add-1', type: 'dwdm', dataRate: '100G', channels: 96 },
    { name: 'Add-2', type: 'dwdm', dataRate: '100G', channels: 96 },
    { name: 'Add-3', type: 'dwdm', dataRate: '100G', channels: 96 },
    { name: 'Add-4', type: 'dwdm', dataRate: '100G', channels: 96 },
  ],
  amplifier: [
    { name: 'IN', type: 'dwdm', dataRate: '100G', channels: 96 },
    { name: 'OUT', type: 'dwdm', dataRate: '100G', channels: 96 },
  ],
  terminal: [
    { name: 'Client-1', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Client-2', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Client-3', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Client-4', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Line-1', type: 'dwdm', dataRate: '100G', channels: 96 },
    { name: 'Line-2', type: 'dwdm', dataRate: '100G', channels: 96 },
  ],
  'osp-termination': [
    // 2x B/W ports for short-reach connections
    { name: 'BW-In', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'BW-Out', type: 'bw', dataRate: '10G', channels: 1 },
    // 2x DWDM ports for long-haul connections
    { name: 'DWDM-In', type: 'dwdm', dataRate: '100G', channels: 96 },
    { name: 'DWDM-Out', type: 'dwdm', dataRate: '100G', channels: 96 },
  ],
  olt: [
    { name: 'Uplink-1', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Uplink-2', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'PON-1', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'PON-2', type: 'bw', dataRate: '10G', channels: 1 },
  ],
  ont: [
    { name: 'PON', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'LAN-1', type: 'bw', dataRate: '1G', channels: 1 },
  ],
  custom: [
    { name: 'Port-1', type: 'bw', dataRate: '10G', channels: 1 },
    { name: 'Port-2', type: 'bw', dataRate: '10G', channels: 1 },
  ],
};

/**
 * Position in 2D space
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Stack capacity tracking
 */
export interface StackCapacity {
  total: number;
  unit: CapacityUnit;
  used: number;
}

/**
 * Layer stack configuration per node
 */
export interface LayerStack {
  layer: LayerType;
  enabled: boolean;
  capacity: StackCapacity;
  properties: Record<string, unknown>;
}

/**
 * Network Node - represents a device in the topology
 */
export interface NetworkNode {
  id: string;
  name: string;
  type: NodeType;
  vendor: VendorType;
  model?: string;
  subtype?: string;  // Optional subtype (e.g., 'core', 'edge', 'pe' for routers)
  sizeFlavor?: 'small' | 'medium' | 'large';  // Size flavor within the subtype preset
  position: Position;
  location?: NodeLocation;  // Physical location metadata
  stacks: LayerStack[];
  ports?: Port[];  // Optional for backward compatibility - will be auto-populated
  switchingCapacity?: number;  // Total switching capacity in Gbps
  chassis?: ChassisDefinition;       // Optional chassis hardware definition
  installedCards?: InstalledCard[];   // Optional installed card instances
  metadata: Record<string, unknown>;
}

/**
 * Edge endpoint - connects to a node
 */
export interface EdgeEndpoint {
  nodeId: string;
  port?: string;           // Legacy port name field
  portId?: string;         // Port ID for optical port tracking
  handle?: string;
}

// Import EdgeChannelAssignment for edge properties
import type { EdgeChannelAssignment } from './spectrum';

/**
 * Edge properties
 */
export interface EdgeProperties {
  distance?: number; // km
  weight?: number;
  cost?: number;
  fiberCount?: number;
  lambdaCapacity?: number;
  sourcePortType?: PortType;     // Type of source port for validation
  targetPortType?: PortType;     // Type of target port for validation
  usedChannels?: number;         // Number of channels used on this connection
  bendPoint?: Position;          // User-defined control point for edge path adjustment
  fiberProfile?: FiberParameters; // Fiber optical parameters with profile selection
  srlgCodes?: string[];          // Shared Risk Link Group codes
  channelAssignment?: EdgeChannelAssignment; // DWDM channel assignments at each endpoint
}

/**
 * Network Edge - represents a connection between nodes
 */
export interface NetworkEdge {
  id: string;
  name: string;
  type: EdgeType;
  source: EdgeEndpoint;
  target: EdgeEndpoint;
  properties: EdgeProperties;
  state: EdgeState;
  metadata: Record<string, unknown>;
}

/**
 * Network metadata
 */
export interface NetworkMetadata {
  created: string; // ISO8601
  modified: string; // ISO8601
  author?: string;
  description?: string;
}

/**
 * Complete network topology structure
 */
export interface NetworkTopology {
  id: string;
  name: string;
  version: string;
  metadata: NetworkMetadata;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

/**
 * Node type display configuration
 */
export interface NodeTypeConfig {
  type: NodeType;
  label: string;
  shortLabel: string;
  icon: string;  // lucide-react icon name
  color: string;
  gradient: string;
}

/**
 * Vendor display configuration
 */
export interface VendorConfig {
  vendor: VendorType;
  label: string;
  logo?: string;
}

/**
 * Node type configurations for UI display
 */
export const NODE_TYPE_CONFIGS: Record<NodeType, NodeTypeConfig> = {
  router: {
    type: 'router',
    label: 'Router',
    shortLabel: 'R',
    icon: 'Router',
    color: '#3182ce',
    gradient: 'from-blue-400 to-blue-600',
  },
  switch: {
    type: 'switch',
    label: 'Switch',
    shortLabel: 'S',
    icon: 'Network',
    color: '#e53e3e',
    gradient: 'from-red-400 to-red-600',
  },
  oadm: {
    type: 'oadm',
    label: 'OADM',
    shortLabel: 'O',
    icon: 'Waypoints',
    color: '#805ad5',
    gradient: 'from-purple-400 to-purple-600',
  },
  amplifier: {
    type: 'amplifier',
    label: 'Amplifier',
    shortLabel: 'A',
    icon: 'Signal',
    color: '#38a169',
    gradient: 'from-green-400 to-green-600',
  },
  terminal: {
    type: 'terminal',
    label: 'Terminal',
    shortLabel: 'T',
    icon: 'Server',
    color: '#dd6b20',
    gradient: 'from-orange-400 to-orange-600',
  },
  'osp-termination': {
    type: 'osp-termination',
    label: 'OSP Termination',
    shortLabel: 'OSP',
    icon: 'Cable',
    color: '#a855f7',
    gradient: 'from-purple-400 to-purple-600',
  },
  olt: {
    type: 'olt',
    label: 'OLT',
    shortLabel: 'OLT',
    icon: 'OLT',
    color: '#0891b2',
    gradient: 'from-cyan-400 to-cyan-600',
  },
  ont: {
    type: 'ont',
    label: 'ONT',
    shortLabel: 'ONT',
    icon: 'ONT',
    color: '#06b6d4',
    gradient: 'from-sky-400 to-sky-600',
  },
  custom: {
    type: 'custom',
    label: 'Custom',
    shortLabel: 'C',
    icon: 'Box',
    color: '#718096',
    gradient: 'from-gray-400 to-gray-600',
  },
};

/**
 * Vendor configurations for UI display
 */
export const VENDOR_CONFIGS: Record<VendorType, VendorConfig> = {
  nokia: { vendor: 'nokia', label: 'Nokia' },
  huawei: { vendor: 'huawei', label: 'Huawei' },
  cisco: { vendor: 'cisco', label: 'Cisco' },
  juniper: { vendor: 'juniper', label: 'Juniper' },
  ciena: { vendor: 'ciena', label: 'Ciena' },
  generic: { vendor: 'generic', label: 'Generic' },
};

/**
 * Edge state configurations for UI display
 */
export const EDGE_STATE_CONFIGS: Record<EdgeState, { color: string; dashed: boolean }> = {
  active: { color: '#cbd5e0', dashed: false },
  planned: { color: '#3182ce', dashed: true },
  failed: { color: '#e53e3e', dashed: true },
};
