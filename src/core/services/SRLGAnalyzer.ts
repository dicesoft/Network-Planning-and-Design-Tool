/**
 * SRLGAnalyzer - Shared Risk Link Group Analysis
 *
 * Provides methods for analyzing SRLG diversity between working and
 * protection paths to assess failure risk and route diversity.
 */

import type { NetworkEdge } from '@/types/network';
import type { ServicePath, SRLGRiskAnalysis } from '@/types/service';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Topology provider interface for SRLG queries
 */
export interface SRLGTopologyProvider {
  getEdge: (id: string) => NetworkEdge | undefined;
  getEdges: () => NetworkEdge[];
}

/**
 * Detailed edge SRLG information
 */
export interface EdgeSRLGInfo {
  edgeId: string;
  edgeName: string;
  srlgCodes: string[];
  distance: number;
}

/**
 * Path SRLG summary
 */
export interface PathSRLGSummary {
  totalSRLGCount: number;
  uniqueSRLGs: string[];
  edgesWithSRLGs: EdgeSRLGInfo[];
  edgesWithoutSRLGs: string[];
  totalDistance: number;
  srlgCoveredDistance: number;
}

/**
 * Risk level classification
 */
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Extended risk analysis with level classification
 */
export interface ExtendedSRLGRiskAnalysis extends SRLGRiskAnalysis {
  riskLevel: RiskLevel;
  diversityScore: number; // 0-100 (inverse of risk: 100 = fully diverse)
  recommendation: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Risk level thresholds (percentage of shared risk)
 */
export const RISK_THRESHOLDS = {
  none: 0,
  low: 10,
  medium: 30,
  high: 50,
  critical: 70,
};

// ============================================================================
// SRLG ANALYZER CLASS
// ============================================================================

/**
 * SRLGAnalyzer handles SRLG diversity analysis between paths
 */
export class SRLGAnalyzer {
  private topology: SRLGTopologyProvider;

  constructor(topology: SRLGTopologyProvider) {
    this.topology = topology;
  }

  // ==========================================================================
  // SRLG EXTRACTION
  // ==========================================================================

  /**
   * Get all SRLG codes for a path
   *
   * @param edgeIds - Edge IDs in the path
   * @returns Set of unique SRLG codes
   */
  getPathSRLGs(edgeIds: string[]): Set<string> {
    const srlgs = new Set<string>();

    for (const edgeId of edgeIds) {
      const edge = this.topology.getEdge(edgeId);
      if (edge?.properties.srlgCodes) {
        for (const srlg of edge.properties.srlgCodes) {
          srlgs.add(srlg);
        }
      }
    }

    return srlgs;
  }

  /**
   * Get SRLG summary for a path
   *
   * @param path - Service path to analyze
   * @returns Detailed SRLG summary
   */
  getPathSRLGSummary(path: ServicePath): PathSRLGSummary {
    const edgesWithSRLGs: EdgeSRLGInfo[] = [];
    const edgesWithoutSRLGs: string[] = [];
    const allSRLGs = new Set<string>();
    let srlgCoveredDistance = 0;

    for (const edgeId of path.edgeIds) {
      const edge = this.topology.getEdge(edgeId);
      if (!edge) continue;

      const srlgCodes = edge.properties.srlgCodes || [];
      const distance = edge.properties.distance || 0;

      if (srlgCodes.length > 0) {
        edgesWithSRLGs.push({
          edgeId,
          edgeName: edge.name,
          srlgCodes,
          distance,
        });
        srlgCoveredDistance += distance;
        for (const srlg of srlgCodes) {
          allSRLGs.add(srlg);
        }
      } else {
        edgesWithoutSRLGs.push(edgeId);
      }
    }

    return {
      totalSRLGCount: allSRLGs.size,
      uniqueSRLGs: Array.from(allSRLGs).sort(),
      edgesWithSRLGs,
      edgesWithoutSRLGs,
      totalDistance: path.totalDistance,
      srlgCoveredDistance,
    };
  }

  // ==========================================================================
  // PATH COMPARISON
  // ==========================================================================

  /**
   * Compare two paths for SRLG overlap
   *
   * @param workingPath - Working/primary path
   * @param protectionPath - Protection/backup path
   * @returns SRLG risk analysis
   */
  comparePaths(
    workingPath: ServicePath,
    protectionPath: ServicePath
  ): SRLGRiskAnalysis {
    const workingSRLGs = this.getPathSRLGs(workingPath.edgeIds);
    const protectionSRLGs = this.getPathSRLGs(protectionPath.edgeIds);

    // Find shared SRLGs
    const sharedSRLGCodes: string[] = [];
    for (const srlg of workingSRLGs) {
      if (protectionSRLGs.has(srlg)) {
        sharedSRLGCodes.push(srlg);
      }
    }

    // Find edges with shared SRLGs
    const sharedEdgeIds: string[] = [];
    let sharedDistanceKm = 0;

    for (const edgeId of protectionPath.edgeIds) {
      const edge = this.topology.getEdge(edgeId);
      if (!edge) continue;

      const edgeSRLGs = edge.properties.srlgCodes || [];
      const hasSharedSRLG = edgeSRLGs.some((srlg) => sharedSRLGCodes.includes(srlg));

      if (hasSharedSRLG) {
        sharedEdgeIds.push(edgeId);
        sharedDistanceKm += edge.properties.distance || 0;
      }
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(
      sharedSRLGCodes,
      Array.from(new Set([...workingSRLGs, ...protectionSRLGs]))
    );

    // Generate warnings
    const warnings = this.generateWarnings(
      sharedSRLGCodes,
      sharedEdgeIds,
      sharedDistanceKm,
      riskScore,
      protectionPath.totalDistance
    );

    return {
      sharedSRLGCodes,
      sharedEdgeIds,
      sharedDistanceKm,
      riskScore,
      warnings,
    };
  }

  /**
   * Perform extended path comparison with risk classification
   *
   * @param workingPath - Working/primary path
   * @param protectionPath - Protection/backup path
   * @returns Extended SRLG risk analysis with recommendations
   */
  comparePathsExtended(
    workingPath: ServicePath,
    protectionPath: ServicePath
  ): ExtendedSRLGRiskAnalysis {
    const baseAnalysis = this.comparePaths(workingPath, protectionPath);
    const riskLevel = this.classifyRiskLevel(baseAnalysis.riskScore);
    const diversityScore = 100 - baseAnalysis.riskScore;

    return {
      ...baseAnalysis,
      riskLevel,
      diversityScore,
      recommendation: this.getRecommendation(riskLevel, baseAnalysis),
    };
  }

  // ==========================================================================
  // EDGE QUERIES
  // ==========================================================================

  /**
   * Get all edges that share any of the specified SRLGs
   *
   * @param srlgCodes - SRLG codes to search for
   * @returns Array of edge IDs sharing the SRLGs
   */
  getEdgesWithSRLGs(srlgCodes: string[]): string[] {
    if (srlgCodes.length === 0) {
      return [];
    }

    const srlgSet = new Set(srlgCodes);
    const matchingEdges: string[] = [];

    for (const edge of this.topology.getEdges()) {
      const edgeSRLGs = edge.properties.srlgCodes || [];
      if (edgeSRLGs.some((srlg) => srlgSet.has(srlg))) {
        matchingEdges.push(edge.id);
      }
    }

    return matchingEdges;
  }

  /**
   * Get all edges that belong to a specific SRLG
   *
   * @param srlgCode - Single SRLG code to search for
   * @returns Array of edge IDs in the SRLG
   */
  getEdgesInSRLG(srlgCode: string): string[] {
    return this.getEdgesWithSRLGs([srlgCode]);
  }

  /**
   * Get detailed SRLG information for all edges
   *
   * @returns Map of SRLG code to edge IDs
   */
  getSRLGIndex(): Map<string, string[]> {
    const index = new Map<string, string[]>();

    for (const edge of this.topology.getEdges()) {
      const srlgCodes = edge.properties.srlgCodes || [];
      for (const srlg of srlgCodes) {
        const edges = index.get(srlg) || [];
        edges.push(edge.id);
        index.set(srlg, edges);
      }
    }

    return index;
  }

  // ==========================================================================
  // DISTANCE CALCULATIONS
  // ==========================================================================

  /**
   * Calculate total shared distance for edges with specified SRLGs
   *
   * @param sharedEdgeIds - Edge IDs that share SRLGs
   * @returns Total distance in km
   */
  calculateSharedDistance(sharedEdgeIds: string[]): number {
    let total = 0;

    for (const edgeId of sharedEdgeIds) {
      const edge = this.topology.getEdge(edgeId);
      if (edge) {
        total += edge.properties.distance || 0;
      }
    }

    return total;
  }

  // ==========================================================================
  // RISK SCORING
  // ==========================================================================

  /**
   * Calculate risk score (0-100) based on SRLG overlap
   *
   * @param sharedSRLGs - SRLGs common to both paths
   * @param totalSRLGs - All unique SRLGs across both paths
   * @returns Risk score 0-100 (0 = fully diverse, 100 = identical)
   */
  calculateRiskScore(sharedSRLGs: string[], totalSRLGs: string[]): number {
    if (totalSRLGs.length === 0) {
      // No SRLGs defined - consider as zero risk (paths are diverse by default)
      return 0;
    }

    if (sharedSRLGs.length === 0) {
      return 0;
    }

    // Risk based on percentage of shared SRLGs
    const riskRatio = sharedSRLGs.length / totalSRLGs.length;
    return Math.min(100, Math.round(riskRatio * 100));
  }

  /**
   * Classify risk level based on score
   */
  private classifyRiskLevel(riskScore: number): RiskLevel {
    if (riskScore === 0) return 'none';
    if (riskScore < RISK_THRESHOLDS.low) return 'none';
    if (riskScore < RISK_THRESHOLDS.medium) return 'low';
    if (riskScore < RISK_THRESHOLDS.high) return 'medium';
    if (riskScore < RISK_THRESHOLDS.critical) return 'high';
    return 'critical';
  }

  // ==========================================================================
  // WARNINGS AND RECOMMENDATIONS
  // ==========================================================================

  /**
   * Generate human-readable warnings
   */
  private generateWarnings(
    sharedSRLGCodes: string[],
    sharedEdgeIds: string[],
    sharedDistanceKm: number,
    riskScore: number,
    protectionTotalDistance: number
  ): string[] {
    const warnings: string[] = [];

    if (sharedSRLGCodes.length > 0) {
      warnings.push(
        `Protection path shares ${sharedSRLGCodes.length} SRLG(s) with working path: ${sharedSRLGCodes.join(', ')}`
      );
    }

    if (riskScore >= RISK_THRESHOLDS.critical) {
      warnings.push(
        `Critical risk: ${riskScore}% of SRLGs are shared between working and protection paths`
      );
    } else if (riskScore >= RISK_THRESHOLDS.high) {
      const sharedPercent =
        protectionTotalDistance > 0
          ? Math.round((sharedDistanceKm / protectionTotalDistance) * 100)
          : 0;
      warnings.push(
        `High risk: ${sharedPercent}% of protection path (${sharedDistanceKm.toFixed(1)} km) shares SRLGs with working path`
      );
    } else if (riskScore > 0) {
      const sharedPercent =
        protectionTotalDistance > 0
          ? Math.round((sharedDistanceKm / protectionTotalDistance) * 100)
          : 0;
      warnings.push(
        `Partial risk: ${sharedPercent}% of protection path (${sharedDistanceKm.toFixed(1)} km) shares SRLGs with working path`
      );
    }

    if (sharedEdgeIds.length > 0) {
      warnings.push(`Affected edges: ${sharedEdgeIds.join(', ')}`);
    }

    return warnings;
  }

  /**
   * Get recommendation based on risk analysis
   */
  private getRecommendation(
    riskLevel: RiskLevel,
    analysis: SRLGRiskAnalysis
  ): string {
    switch (riskLevel) {
      case 'none':
        return 'Paths are fully SRLG-diverse. No action needed.';
      case 'low':
        return 'Minimal shared risk. Consider documenting for operational awareness.';
      case 'medium':
        return `Moderate shared risk detected. Consider re-routing protection path to avoid SRLGs: ${analysis.sharedSRLGCodes.join(', ')}`;
      case 'high':
        return `Significant shared risk. Strongly recommend finding alternative protection path avoiding edges: ${analysis.sharedEdgeIds.join(', ')}`;
      case 'critical':
        return 'Critical shared risk - paths may fail simultaneously. Immediate re-routing required for redundancy.';
    }
  }

  // ==========================================================================
  // DIVERSITY ANALYSIS
  // ==========================================================================

  /**
   * Check if two paths are fully SRLG-diverse
   *
   * @param path1EdgeIds - First path edge IDs
   * @param path2EdgeIds - Second path edge IDs
   * @returns True if paths share no SRLGs
   */
  arePathsSRLGDiverse(path1EdgeIds: string[], path2EdgeIds: string[]): boolean {
    const srlgs1 = this.getPathSRLGs(path1EdgeIds);
    const srlgs2 = this.getPathSRLGs(path2EdgeIds);

    for (const srlg of srlgs1) {
      if (srlgs2.has(srlg)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find SRLGs that should be avoided for a diverse path
   *
   * @param referencePath - Path to be diverse from
   * @returns Array of SRLG codes to avoid
   */
  getSRLGsToAvoid(referencePath: ServicePath): string[] {
    return Array.from(this.getPathSRLGs(referencePath.edgeIds));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an SRLGAnalyzer instance
 */
export const createSRLGAnalyzer = (topology: SRLGTopologyProvider): SRLGAnalyzer => {
  return new SRLGAnalyzer(topology);
};
