/**
 * Service Management Module
 *
 * Exports all service-related classes, types, and utilities
 */

// ServiceManager - Core service operations
export {
  ServiceManager,
  createServiceManager,
  isDataRateSufficient,
  getDataRateValue,
  type TopologyProvider,
  type ServiceProvider,
  type PathFinderProvider,
  type PathResult,
} from './ServiceManager';

// ChannelChecker - DWDM channel availability analysis
export {
  ChannelChecker,
  createChannelChecker,
  DEFAULT_CHANNEL_RANGE,
  LOW_AVAILABILITY_THRESHOLD,
  type ChannelTopologyProvider,
  type ChannelAllocationResult,
  type ChannelExhaustionWarning,
} from './ChannelChecker';

// SRLGAnalyzer - Shared Risk Link Group analysis
export {
  SRLGAnalyzer,
  createSRLGAnalyzer,
  RISK_THRESHOLDS,
  type SRLGTopologyProvider,
  type EdgeSRLGInfo,
  type PathSRLGSummary,
  type RiskLevel,
  type ExtendedSRLGRiskAnalysis,
} from './SRLGAnalyzer';

// L1ServiceManager - L1 DWDM service creation and management
export {
  L1ServiceManager,
  createL1ServiceManager,
  MODULATION_REACH_LIMITS,
  type L1TopologyProvider,
  type L1PathFinderProvider,
  type L1ServiceCreateResult,
} from './L1ServiceManager';

// L2L3ServiceManager - L2/L3 IP service creation and management
export {
  L2L3ServiceManager,
  createL2L3ServiceManager,
  type L2L3TopologyProvider,
  type L2L3ServiceProvider,
  type L2L3ServiceCreateResult,
} from './L2L3ServiceManager';

// UnderlaySelector - L1 underlay selection for L2/L3 services
export {
  UnderlaySelector,
  createUnderlaySelector,
  type UnderlayTopologyProvider,
  type UnderlayServiceProvider,
  type UnderlaySelectionResult,
  type UnderlayUtilization,
} from './UnderlaySelector';
