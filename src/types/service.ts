/**
 * Service Management Types
 * Defines types for L1 (DWDM) and L2/L3 (IP) network services
 */

import type { PortDataRate } from './network';
import type { OSNRResult } from '@/core/optical/types';

// ============================================================================
// SERVICE CORE TYPES
// ============================================================================

/**
 * Service type - L1 optical or L2/L3 IP layer
 */
export type ServiceType = 'l1-dwdm' | 'l2-ethernet' | 'l3-ip';

/**
 * Service lifecycle status
 */
export type ServiceStatus =
  | 'planned'
  | 'provisioning'
  | 'active'
  | 'failed'
  | 'maintenance'
  | 'decommissioned';

/**
 * Status display configuration for UI
 */
export const SERVICE_STATUS_CONFIGS: Record<
  ServiceStatus,
  { label: string; color: string; bgColor: string }
> = {
  planned: { label: 'Planned', color: '#64748b', bgColor: '#f1f5f9' },
  provisioning: { label: 'Provisioning', color: '#d97706', bgColor: '#fef3c7' },
  active: { label: 'Active', color: '#059669', bgColor: '#d1fae5' },
  failed: { label: 'Failed', color: '#dc2626', bgColor: '#fee2e2' },
  maintenance: { label: 'Maintenance', color: '#2563eb', bgColor: '#dbeafe' },
  decommissioned: { label: 'Decommissioned', color: '#374151', bgColor: '#e5e7eb' },
};

/**
 * Service type display configuration
 */
export const SERVICE_TYPE_CONFIGS: Record<
  ServiceType,
  { label: string; shortLabel: string; color: string; description: string }
> = {
  'l1-dwdm': {
    label: 'L1 DWDM',
    shortLabel: 'L1',
    color: '#8b5cf6',
    description: 'Layer 1 optical DWDM service',
  },
  'l2-ethernet': {
    label: 'L2 Ethernet',
    shortLabel: 'L2',
    color: '#3b82f6',
    description: 'Layer 2 Ethernet service',
  },
  'l3-ip': {
    label: 'L3 IP',
    shortLabel: 'L3',
    color: '#10b981',
    description: 'Layer 3 IP service',
  },
};

// ============================================================================
// PROTECTION SCHEMES
// ============================================================================

/**
 * L1 (Optical) protection schemes
 */
export type ProtectionScheme = 'none' | 'olp' | 'sncp' | 'wson-restoration' | '1+1+wson';

/**
 * Protection scheme display configuration
 */
export const PROTECTION_SCHEME_CONFIGS: Record<
  ProtectionScheme,
  { label: string; description: string }
> = {
  none: {
    label: 'None',
    description: 'No protection - single path only',
  },
  olp: {
    label: 'OLP (1+1)',
    description: 'Optical Line Protection - 1+1 at optical layer with splitter/switch',
  },
  sncp: {
    label: 'SNCP',
    description: 'Sub-Network Connection Protection - 1+1 at SONET/SDH level',
  },
  'wson-restoration': {
    label: 'WSON Restoration',
    description: 'Dynamic restoration computed on-demand after failure',
  },
  '1+1+wson': {
    label: '1+1 + WSON',
    description: 'OLP 1+1 protection with WSON dynamic restoration as tertiary backup',
  },
};

/**
 * L2/L3 (IP) protection schemes
 */
export type IPProtectionScheme = 'none' | 'bfd-failover' | 'ecmp' | 'fast-reroute';

/**
 * IP protection scheme display configuration
 */
export const IP_PROTECTION_SCHEME_CONFIGS: Record<
  IPProtectionScheme,
  { label: string; description: string }
> = {
  none: {
    label: 'None',
    description: 'No IP-layer protection',
  },
  'bfd-failover': {
    label: 'BFD Failover',
    description: 'Bidirectional Forwarding Detection with automatic failover',
  },
  ecmp: {
    label: 'ECMP',
    description: 'Equal-Cost Multi-Path routing',
  },
  'fast-reroute': {
    label: 'Fast Reroute',
    description: 'MPLS Fast Reroute (FRR) protection',
  },
};

// ============================================================================
// PATH COMPUTATION
// ============================================================================

/**
 * Path computation algorithm mode
 */
export type PathComputationMode =
  | 'manual'
  | 'shortest-path'
  | 'k-shortest'
  | 'edge-disjoint'
  | 'srlg-diverse';

/**
 * Path computation mode display configuration
 */
export const PATH_COMPUTATION_MODE_CONFIGS: Record<
  PathComputationMode,
  { label: string; description: string }
> = {
  manual: {
    label: 'Manual',
    description: 'Manually specify the path',
  },
  'shortest-path': {
    label: 'Shortest Path',
    description: 'Dijkstra algorithm for optimal single path',
  },
  'k-shortest': {
    label: 'K-Shortest Paths',
    description: "Yen's algorithm for multiple alternative paths",
  },
  'edge-disjoint': {
    label: 'Edge-Disjoint',
    description: 'Find paths with no shared edges',
  },
  'srlg-diverse': {
    label: 'SRLG-Diverse',
    description: 'Find paths avoiding shared risk link groups',
  },
};

/**
 * Wavelength/channel mode for L1 services
 */
export type WavelengthMode = 'continuous' | 'conversion-allowed';

/**
 * Wavelength mode display configuration
 */
export const WAVELENGTH_MODE_CONFIGS: Record<
  WavelengthMode,
  { label: string; description: string }
> = {
  continuous: {
    label: 'Wavelength Continuous',
    description: 'Same channel number across all edges (default)',
  },
  'conversion-allowed': {
    label: 'Conversion Allowed',
    description: 'Channel can change at intermediate OADMs',
  },
};

// ============================================================================
// OPTICAL PARAMETERS
// ============================================================================

/**
 * L1 service data rates
 */
export type L1DataRate = '10G' | '25G' | '100G' | '200G' | '400G';

/**
 * Data rate display configuration with numeric value
 */
export const L1_DATA_RATE_CONFIGS: Record<
  L1DataRate,
  { label: string; value: number; unit: string }
> = {
  '10G': { label: '10 Gbps', value: 10, unit: 'Gbps' },
  '25G': { label: '25 Gbps', value: 25, unit: 'Gbps' },
  '100G': { label: '100 Gbps', value: 100, unit: 'Gbps' },
  '200G': { label: '200 Gbps', value: 200, unit: 'Gbps' },
  '400G': { label: '400 Gbps', value: 400, unit: 'Gbps' },
};

/**
 * Modulation types for optical transmission
 */
export type ModulationType = 'DP-QPSK' | 'DP-8QAM' | 'DP-16QAM' | 'DP-32QAM' | 'DP-64QAM';

/**
 * Modulation type configuration with spectral efficiency
 */
export const MODULATION_TYPE_CONFIGS: Record<
  ModulationType,
  { label: string; bitsPerSymbol: number; reach: string }
> = {
  'DP-QPSK': { label: 'DP-QPSK', bitsPerSymbol: 4, reach: 'Long-haul (>2000km)' },
  'DP-8QAM': { label: 'DP-8QAM', bitsPerSymbol: 6, reach: 'Regional (~1000km)' },
  'DP-16QAM': { label: 'DP-16QAM', bitsPerSymbol: 8, reach: 'Metro (~500km)' },
  'DP-32QAM': { label: 'DP-32QAM', bitsPerSymbol: 10, reach: 'Short (~200km)' },
  'DP-64QAM': { label: 'DP-64QAM', bitsPerSymbol: 12, reach: 'Very short (~100km)' },
};

/**
 * Channel width options
 */
export type ChannelWidth = '50GHz' | '75GHz' | '100GHz' | '150GHz';

/**
 * Channel width configuration
 */
export const CHANNEL_WIDTH_CONFIGS: Record<
  ChannelWidth,
  { label: string; value: number; unit: string }
> = {
  '50GHz': { label: '50 GHz', value: 50, unit: 'GHz' },
  '75GHz': { label: '75 GHz', value: 75, unit: 'GHz' },
  '100GHz': { label: '100 GHz', value: 100, unit: 'GHz' },
  '150GHz': { label: '150 GHz', value: 150, unit: 'GHz' },
};

// ============================================================================
// SERVICE PATH DEFINITION
// ============================================================================

/**
 * Path type within a service
 */
export type ServicePathType = 'working' | 'protection' | 'restoration';

/**
 * Path status
 */
export type ServicePathStatus = 'computed' | 'allocated' | 'active' | 'failed';

/**
 * Per-edge channel assignment (for wavelength conversion mode)
 */
export interface PathChannelAssignment {
  edgeId: string;
  channelNumber: number;
  sourcePortId: string;
  targetPortId: string;
}

/**
 * Service path - represents a route through the network
 */
export interface ServicePath {
  id: string;
  type: ServicePathType;
  nodeIds: string[]; // Ordered list of nodes in path
  edgeIds: string[]; // Ordered list of edges in path
  channelNumber?: number; // For L1: assigned channel (continuous mode)
  channelAssignments?: PathChannelAssignment[]; // Per-edge channel (conversion mode)
  totalDistance: number; // km
  hopCount: number;
  latency?: number; // ms (calculated)
  status: ServicePathStatus;
}

// ============================================================================
// SRLG RISK ANALYSIS
// ============================================================================

/**
 * SRLG (Shared Risk Link Group) risk analysis between paths
 */
export interface SRLGRiskAnalysis {
  sharedSRLGCodes: string[]; // SRLG codes common to working & protection
  sharedEdgeIds: string[]; // Edge IDs that share SRLGs
  sharedDistanceKm: number; // Total km of shared risk
  riskScore: number; // 0-100% (0 = fully diverse, 100 = identical)
  warnings: string[]; // Human-readable warnings
}

/**
 * Create empty SRLG risk analysis
 */
export const createEmptySRLGRiskAnalysis = (): SRLGRiskAnalysis => ({
  sharedSRLGCodes: [],
  sharedEdgeIds: [],
  sharedDistanceKm: 0,
  riskScore: 0,
  warnings: [],
});

// ============================================================================
// BFD CONFIGURATION
// ============================================================================

/**
 * BFD (Bidirectional Forwarding Detection) configuration
 */
export interface BFDConfig {
  enabled: boolean;
  minTxInterval: number; // microseconds (default: 300000 = 300ms)
  minRxInterval: number; // microseconds (default: 300000 = 300ms)
  multiplier: number; // detection multiplier (default: 3)
}

/**
 * Default BFD configuration
 */
export const DEFAULT_BFD_CONFIG: BFDConfig = {
  enabled: false,
  minTxInterval: 300000,
  minRxInterval: 300000,
  multiplier: 3,
};

// ============================================================================
// L1 DWDM SERVICE
// ============================================================================

/**
 * L1 DWDM Service - optical layer service
 */
export interface L1DWDMService {
  id: string;
  name: string;
  type: 'l1-dwdm';
  status: ServiceStatus;

  // Endpoints
  sourceNodeId: string;
  sourcePortId: string;
  destinationNodeId: string;
  destinationPortId: string;

  // Optical Parameters
  dataRate: L1DataRate;
  baudRate?: number; // GBaud
  modulationType: ModulationType;
  channelWidth: ChannelWidth;
  wavelengthMode: WavelengthMode;
  channelNumber?: number; // Exact channel (if continuous mode)

  // Transceiver & OSNR
  transceiverTypeId?: string; // Reference to transceiver from library
  osnrResult?: OSNRResult; // OSNR calculation result for this service

  // Paths
  workingPath: ServicePath;
  protectionPath?: ServicePath;

  // Protection Configuration
  protectionScheme: ProtectionScheme;
  protectionServiceId?: string; // Reference to protection service (if separate)
  restorationEnabled: boolean; // WSON dynamic restoration
  restorationPath?: ServicePath; // WSON dynamic restoration path (for 1+1+wson)

  // SRLG Analysis
  srlgAnalysis?: SRLGRiskAnalysis;

  // Metadata
  createdAt: string;
  modifiedAt: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// L2/L3 IP SERVICE
// ============================================================================

/**
 * Shared portion analysis between working and protection underlays
 */
export interface SharedPortionAnalysis {
  sharedEdgeIds: string[];
  sharedDistanceKm: number;
  sharedPercentage: number; // 0-100%
}

/**
 * L2/L3 Service - IP layer service
 */
export interface L2L3Service {
  id: string;
  name: string;
  type: 'l2-ethernet' | 'l3-ip';
  status: ServiceStatus;

  // Endpoints
  sourceNodeId: string;
  sourcePortId: string;
  destinationNodeId: string;
  destinationPortId: string;

  // Capacity
  dataRate: L1DataRate;

  // Underlay L1 Service
  underlayServiceId: string; // Required L1 DWDM service
  underlayAutoCreated: boolean; // Was L1 auto-created?

  // Protection
  protectionScheme: IPProtectionScheme;
  protectionUnderlayServiceId?: string;
  bfdConfig: BFDConfig;

  // Shared Risk Analysis (with protection)
  sharedPortionAnalysis?: SharedPortionAnalysis;

  // Metadata
  createdAt: string;
  modifiedAt: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// UNIFIED SERVICE TYPE
// ============================================================================

/**
 * Union type for all service types
 */
export type Service = L1DWDMService | L2L3Service;

/**
 * Type guard for L1 DWDM service
 */
export const isL1DWDMService = (service: Service): service is L1DWDMService => {
  return service.type === 'l1-dwdm';
};

/**
 * Type guard for L2/L3 service
 */
export const isL2L3Service = (service: Service): service is L2L3Service => {
  return service.type === 'l2-ethernet' || service.type === 'l3-ip';
};

// ============================================================================
// PATH COMPUTATION OPTIONS
// ============================================================================

/**
 * Options for path computation
 */
export interface ServicePathOptions {
  mode: PathComputationMode;
  weightAttribute: 'distance' | 'weight' | 'cost';

  // Constraints
  excludeNodes?: string[];
  excludeEdges?: string[];
  excludeSRLGs?: string[]; // For protection path computation
  maxHops?: number;
  maxDistance?: number;

  // L1 Specific
  wavelengthMode?: WavelengthMode;
  requiredChannel?: number; // Force specific channel

  // K-shortest specific
  k?: number; // Number of alternatives

  // SRLG-diverse specific
  referencePath?: ServicePath; // Path to be diverse from
  maxSRLGOverlap?: number; // Max acceptable overlap (0-100%)
}

/**
 * Default path computation options
 */
export const DEFAULT_PATH_OPTIONS: ServicePathOptions = {
  mode: 'shortest-path',
  weightAttribute: 'distance',
  wavelengthMode: 'continuous',
  k: 3,
  maxSRLGOverlap: 0,
};

// ============================================================================
// SERVICE FILTERING & SORTING
// ============================================================================

/**
 * Service table filter options
 */
export interface ServiceFilters {
  type?: ServiceType[];
  status?: ServiceStatus[];
  sourceNodeId?: string;
  destinationNodeId?: string;
  protectionScheme?: ProtectionScheme[];
  dataRate?: L1DataRate[];
  searchQuery?: string;
}

/**
 * Sortable fields for service table
 */
export type ServiceSortField =
  | 'id'
  | 'name'
  | 'type'
  | 'status'
  | 'sourceNodeId'
  | 'destinationNodeId'
  | 'dataRate'
  | 'createdAt'
  | 'modifiedAt';

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

// ============================================================================
// SERVICE ID GENERATION
// ============================================================================

/**
 * Service ID counter tracking for prefixed IDs
 */
export interface ServiceIdCounters {
  l1: number;
  l2: number;
  l3: number;
}

/**
 * Generate a prefixed service ID
 */
export const generateServiceId = (
  type: ServiceType,
  counters: ServiceIdCounters
): { id: string; updatedCounters: ServiceIdCounters } => {
  const newCounters = { ...counters };
  let prefix: string;
  let count: number;

  switch (type) {
    case 'l1-dwdm':
      newCounters.l1 += 1;
      prefix = 'L1';
      count = newCounters.l1;
      break;
    case 'l2-ethernet':
      newCounters.l2 += 1;
      prefix = 'L2';
      count = newCounters.l2;
      break;
    case 'l3-ip':
      newCounters.l3 += 1;
      prefix = 'L3';
      count = newCounters.l3;
      break;
  }

  const id = `${prefix}-${count.toString().padStart(3, '0')}`;
  return { id, updatedCounters: newCounters };
};

// ============================================================================
// VALIDATION RESULT
// ============================================================================

/**
 * Validation severity level
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Single validation message
 */
export interface ValidationMessage {
  severity: ValidationSeverity;
  field?: string;
  message: string;
  code?: string;
}

/**
 * Validation result for service operations
 */
export interface ServiceValidationResult {
  valid: boolean;
  messages: ValidationMessage[];
}

/**
 * Create a successful validation result
 */
export const createValidResult = (): ServiceValidationResult => ({
  valid: true,
  messages: [],
});

/**
 * Create a failed validation result with messages
 */
export const createInvalidResult = (
  messages: ValidationMessage[]
): ServiceValidationResult => ({
  valid: messages.every((m) => m.severity !== 'error'),
  messages,
});

// ============================================================================
// CHANNEL AVAILABILITY
// ============================================================================

/**
 * Channel availability check result
 */
export interface ChannelAvailabilityResult {
  available: boolean;
  mode: WavelengthMode;

  // For continuous mode
  commonChannels?: number[]; // Channels free on ALL edges
  suggestedChannel?: number; // Best available channel

  // For conversion mode
  perEdgeChannels?: Map<string, number[]>; // Available per edge
  conversionPoints?: string[]; // Nodes where conversion needed

  // Blocking issues
  blockedEdges?: string[]; // Edges with no channels
  blockedReason?: string;
}

// ============================================================================
// SERVICE CREATION CONFIGS
// ============================================================================

/**
 * Configuration for creating a new L1 DWDM service
 */
export interface L1ServiceConfig {
  name: string;
  sourceNodeId: string;
  sourcePortId: string;
  destinationNodeId: string;
  destinationPortId: string;
  dataRate: L1DataRate;
  modulationType: ModulationType;
  channelWidth: ChannelWidth;
  wavelengthMode: WavelengthMode;
  channelNumber?: number;
  protectionScheme: ProtectionScheme;
  restorationEnabled: boolean;
  pathOptions: ServicePathOptions;
  transceiverTypeId?: string;
}

/**
 * Configuration for creating a new L2/L3 service
 */
export interface L2L3ServiceConfig {
  name: string;
  type: 'l2-ethernet' | 'l3-ip';
  sourceNodeId: string;
  sourcePortId: string;
  destinationNodeId: string;
  destinationPortId: string;
  dataRate: L1DataRate;
  underlayServiceId?: string; // If provided, use existing L1
  autoCreateUnderlay: boolean;
  protectionScheme: IPProtectionScheme;
  protectionUnderlayServiceId?: string;
  bfdConfig: BFDConfig;
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

// Re-export PortDataRate as it's commonly used with services
export type { PortDataRate };
