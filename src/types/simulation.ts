/**
 * Simulation Types
 * Types for fiber cut simulation, failure analysis, and survivability assessment
 */

export interface SimulationResult {
  id: string;
  timestamp: string;
  failedEdges: string[];
  failedNodes: string[];
  affectedServices: ServiceImpact[];
  survivedServices: ServiceImpact[];
  downServices: ServiceImpact[];
  totalBandwidthAffected: number;
  totalBandwidthSurvived: number;
  survivabilityScore: number; // 0-100
}

export interface ServiceImpact {
  serviceId: string;
  serviceName: string;
  serviceType: string;
  status: 'survived' | 'down' | 'degraded' | 'at-risk' | 'temporary-outage';
  affectedPathType?: 'working' | 'protection' | 'both';
  hasProtection: boolean;
  protectionActivated: boolean;
  /** Estimated restoration time in seconds (for WSON restoration) */
  restorationTime?: number;
  /** Method used for restoration */
  restorationMethod?: 'instant' | 'wson' | 'none';
  /** Ordered node IDs of the working path (enriched in component layer) */
  workingPathNodes?: string[];
  /** Ordered node IDs of the protection path (enriched in component layer) */
  protectionPathNodes?: string[];
  /** Edge IDs that are in the failure set AND on this service's paths */
  failedEdgeIds?: string[];
  /** Human-readable SRLG notes (e.g. "Shares SRLG 'conduit-A' with failed edge E-001") */
  srlgNotes?: string[];
  /** Data rate of the service (e.g. "100G") */
  dataRate?: string;
}

export interface SurvivabilityResult {
  overallScore: number; // 0-100
  singleFailureScore: number; // % of services surviving any single failure
  edgeResults: EdgeFailureResult[];
}

export interface EdgeFailureResult {
  edgeId: string;
  edgeName: string;
  sourceNodeId: string;
  targetNodeId: string;
  downServiceCount: number;
  survivedServiceCount: number;
  affectedServiceIds: string[];
  downServiceIds: string[];
}

// ============================================================================
// NETWORK HEALTH CHECK TYPES
// ============================================================================

/** Risk level for an edge based on single-failure analysis */
export type EdgeRiskLevel = 'critical' | 'warning' | 'healthy';

/** Per-edge risk assessment for the health check */
export interface EdgeRiskAssessment {
  edgeId: string;
  edgeName: string;
  sourceNodeId: string;
  targetNodeId: string;
  riskLevel: EdgeRiskLevel;
  /** Number of services that would go down if this edge fails */
  downServiceCount: number;
  /** Number of services that would survive (with protection) */
  survivedServiceCount: number;
  /** Total services traversing this edge */
  totalAffectedCount: number;
  /** IDs of services that would go down */
  downServiceIds: string[];
}

/** Single point of failure detection result */
export interface SinglePointOfFailure {
  /** The edge that is a SPOF */
  edgeId: string;
  edgeName: string;
  sourceNodeId: string;
  targetNodeId: string;
  /** Services that would be completely lost with no protection */
  affectedServiceIds: string[];
  /** Recommended fix */
  recommendation: string;
}

/** Actionable recommendation from health check */
export interface HealthCheckRecommendation {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  /** Related edge or node IDs */
  relatedIds?: string[];
}

/** Full Network Health Check result (persisted in store) */
export interface HealthCheckResult {
  /** Overall health score 0-100 */
  healthScore: number;
  /** Percentage of services with protection */
  protectionCoverage: number;
  /** Total services analyzed */
  totalServices: number;
  /** Services with protection paths */
  protectedServiceCount: number;
  /** Services without any protection */
  unprotectedServiceCount: number;
  /** Per-edge risk assessment (sorted by risk) */
  edgeRisks: EdgeRiskAssessment[];
  /** Detected single points of failure */
  singlePointsOfFailure: SinglePointOfFailure[];
  /** Actionable recommendations */
  recommendations: HealthCheckRecommendation[];
  /** Timestamp of analysis */
  timestamp: string;
  /** Duration in ms */
  durationMs: number;
}

// ============================================================================
// EXHAUSTIVE SIMULATION TYPES
// ============================================================================

/**
 * Configuration for exhaustive multi-failure simulation
 */
export interface ExhaustiveConfig {
  /** Max simultaneous edge failures to test (0-3) */
  maxEdgeFailures: number;
  /** Max simultaneous node failures to test (0-2) */
  maxNodeFailures: number;
}

/**
 * Lightweight scenario summary (~100 bytes per entry).
 * Full detail is re-computed on demand when the user expands a row.
 */
export interface ExhaustiveScenarioSummary {
  /** Unique scenario identifier (e.g. "S-0001") */
  scenarioId: string;
  /** Edge IDs that failed in this scenario */
  failedEdgeIds: string[];
  /** Node IDs that failed in this scenario */
  failedNodeIds: string[];
  /** Survivability percentage 0-100 */
  survivabilityScore: number;
  /** Number of services that went down */
  downCount: number;
  /** Number of services that survived (including via protection) */
  survivedCount: number;
  /** Number of services at risk (working OK, protection failed) */
  atRiskCount: number;
  /** Number of services with temporary outage (WSON restoration pending) */
  temporaryOutageCount: number;
  /** Number of services affected (down + survived with switchover) */
  affectedCount: number;
  /** Total bandwidth affected in Gbps */
  bandwidthAffected: number;
}

/**
 * Progress state for an in-flight exhaustive simulation
 */
export interface ExhaustiveProgress {
  /** Scenarios completed so far */
  completed: number;
  /** Total scenarios to simulate */
  total: number;
  /** Currently executing scenario label */
  currentLabel: string;
  /** Timestamp when simulation started (ISO string) */
  startedAt: string;
}

/**
 * Full exhaustive simulation results
 */
export interface ExhaustiveResults {
  /** All scenario summaries */
  scenarios: ExhaustiveScenarioSummary[];
  /** Configuration used */
  config: ExhaustiveConfig;
  /** Timestamp when completed */
  completedAt: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Best survivability score across all scenarios */
  bestScore: number;
  /** Worst survivability score across all scenarios */
  worstScore: number;
  /** Average survivability score */
  avgScore: number;
}
