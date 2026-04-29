/**
 * SurvivabilityAnalyzer - Network Health Check Assessment
 *
 * Analyzes network health by iterating through all edges,
 * simulating each single failure, and producing:
 * - Per-edge risk assessments (critical/warning/healthy)
 * - Single point of failure detection
 * - Protection coverage analysis
 * - Actionable recommendations
 */

import type { NetworkNode, NetworkEdge } from '@/types/network';
import type { Service } from '@/types/service';
import { isL1DWDMService, isL2L3Service } from '@/types/service';
import type {
  SurvivabilityResult,
  EdgeFailureResult,
  HealthCheckResult,
  EdgeRiskAssessment,
  EdgeRiskLevel,
  SinglePointOfFailure,
  HealthCheckRecommendation,
} from '@/types/simulation';
import { FailureSimulator } from './FailureSimulator';

// ============================================================================
// SURVIVABILITY ANALYZER
// ============================================================================

export class SurvivabilityAnalyzer {
  private simulator: FailureSimulator;

  constructor(
    private getNodes: () => NetworkNode[],
    private getEdges: () => NetworkEdge[],
    private getServices: () => Service[]
  ) {
    this.simulator = new FailureSimulator(getNodes, getEdges, getServices);
  }

  /**
   * Run single failure analysis - simulate failing each edge one at a time.
   * Returns per-edge results and overall score.
   */
  runSingleFailureAnalysis(): SurvivabilityResult {
    const edges = this.getEdges();
    const services = this.getServices();

    if (services.length === 0) {
      return { overallScore: 100, singleFailureScore: 100, edgeResults: [] };
    }

    const edgeResults: EdgeFailureResult[] = [];
    let totalSurvived = 0;
    let totalAffected = 0;

    for (const edge of edges) {
      const result = this.simulator.simulate([edge.id]);

      const edgeResult: EdgeFailureResult = {
        edgeId: edge.id,
        edgeName: edge.name,
        sourceNodeId: edge.source.nodeId,
        targetNodeId: edge.target.nodeId,
        downServiceCount: result.downServices.length,
        survivedServiceCount: result.survivedServices.length,
        affectedServiceIds: result.affectedServices.map((s) => s.serviceId),
        downServiceIds: result.downServices.map((s) => s.serviceId),
      };
      edgeResults.push(edgeResult);

      totalAffected += result.affectedServices.length;
      totalSurvived += result.survivedServices.length;
    }

    // Sort by most impactful (most down services)
    edgeResults.sort((a, b) => b.downServiceCount - a.downServiceCount);

    const singleFailureScore =
      totalAffected > 0
        ? Math.round((totalSurvived / totalAffected) * 100)
        : 100;

    return {
      overallScore: singleFailureScore,
      singleFailureScore,
      edgeResults,
    };
  }

  /**
   * Run full Network Health Check.
   * Performs single-failure analysis on all edges, then computes
   * risk levels, SPOFs, protection coverage, and recommendations.
   */
  runHealthCheck(): HealthCheckResult {
    const startTime = performance.now();
    const edges = this.getEdges();
    const services = this.getServices();
    const nodes = this.getNodes();

    // Protection coverage analysis
    const { protectedCount, unprotectedCount } = this.analyzeProtectionCoverage(services);
    const protectionCoverage =
      services.length > 0 ? Math.round((protectedCount / services.length) * 100) : 100;

    // If no services or no edges, return quick result
    if (services.length === 0 || edges.length === 0) {
      return {
        healthScore: 100,
        protectionCoverage,
        totalServices: services.length,
        protectedServiceCount: protectedCount,
        unprotectedServiceCount: unprotectedCount,
        edgeRisks: [],
        singlePointsOfFailure: [],
        recommendations: this.generateEmptyNetworkRecommendations(nodes, edges, services),
        timestamp: new Date().toISOString(),
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    // Run single-failure analysis per edge
    const edgeRisks: EdgeRiskAssessment[] = [];
    const spofs: SinglePointOfFailure[] = [];

    for (const edge of edges) {
      const result = this.simulator.simulate([edge.id]);

      const downCount = result.downServices.length;
      const survivedCount = result.survivedServices.length;
      const totalAffected = result.affectedServices.length;
      const downServiceIds = result.downServices.map((s) => s.serviceId);

      const riskLevel = this.classifyEdgeRisk(downCount, totalAffected);

      edgeRisks.push({
        edgeId: edge.id,
        edgeName: edge.name,
        sourceNodeId: edge.source.nodeId,
        targetNodeId: edge.target.nodeId,
        riskLevel,
        downServiceCount: downCount,
        survivedServiceCount: survivedCount,
        totalAffectedCount: totalAffected,
        downServiceIds,
      });

      // Detect single points of failure: edges where ALL affected services go down
      if (downCount > 0 && downCount === totalAffected && totalAffected > 0) {
        spofs.push({
          edgeId: edge.id,
          edgeName: edge.name,
          sourceNodeId: edge.source.nodeId,
          targetNodeId: edge.target.nodeId,
          affectedServiceIds: downServiceIds,
          recommendation: `Add protection paths for ${downCount} unprotected service${downCount > 1 ? 's' : ''} traversing this edge`,
        });
      }
    }

    // Sort: critical first, then warning, then healthy
    const riskOrder: Record<EdgeRiskLevel, number> = { critical: 0, warning: 1, healthy: 2 };
    edgeRisks.sort((a, b) => {
      const levelDiff = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      if (levelDiff !== 0) return levelDiff;
      return b.downServiceCount - a.downServiceCount;
    });

    // Compute health score
    const healthScore = this.computeHealthScore(edgeRisks, protectionCoverage, spofs.length);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      edgeRisks, spofs, protectionCoverage, unprotectedCount, nodes, edges
    );

    return {
      healthScore,
      protectionCoverage,
      totalServices: services.length,
      protectedServiceCount: protectedCount,
      unprotectedServiceCount: unprotectedCount,
      edgeRisks,
      singlePointsOfFailure: spofs,
      recommendations,
      timestamp: new Date().toISOString(),
      durationMs: Math.round(performance.now() - startTime),
    };
  }

  private analyzeProtectionCoverage(services: Service[]): {
    protectedCount: number;
    unprotectedCount: number;
  } {
    let protectedCount = 0;
    let unprotectedCount = 0;

    for (const service of services) {
      if (isL1DWDMService(service)) {
        if (service.protectionScheme !== 'none' && service.protectionPath) {
          protectedCount++;
        } else {
          unprotectedCount++;
        }
      } else if (isL2L3Service(service)) {
        if (service.protectionScheme !== 'none' && service.protectionUnderlayServiceId) {
          protectedCount++;
        } else {
          unprotectedCount++;
        }
      }
    }

    return { protectedCount, unprotectedCount };
  }

  private classifyEdgeRisk(downCount: number, totalAffected: number): EdgeRiskLevel {
    if (downCount === 0) return 'healthy';
    // Critical: any services go down with no protection
    if (downCount >= 2 || (downCount > 0 && downCount === totalAffected)) return 'critical';
    return 'warning';
  }

  private computeHealthScore(
    edgeRisks: EdgeRiskAssessment[],
    protectionCoverage: number,
    spofCount: number
  ): number {
    if (edgeRisks.length === 0) return 100;

    const criticalEdges = edgeRisks.filter((e) => e.riskLevel === 'critical').length;
    const warningEdges = edgeRisks.filter((e) => e.riskLevel === 'warning').length;
    const totalEdges = edgeRisks.length;

    // Base score from edge risk distribution (60% weight)
    const healthyRatio = 1 - (criticalEdges * 1.0 + warningEdges * 0.3) / totalEdges;
    const edgeScore = Math.max(0, healthyRatio * 100);

    // Protection coverage factor (30% weight)
    const protectionScore = protectionCoverage;

    // SPOF penalty (10% weight)
    const spofPenalty = spofCount > 0 ? Math.min(100, spofCount * 20) : 0;
    const spofScore = 100 - spofPenalty;

    const composite = edgeScore * 0.6 + protectionScore * 0.3 + spofScore * 0.1;
    return Math.round(Math.max(0, Math.min(100, composite)));
  }

  private generateEmptyNetworkRecommendations(
    nodes: NetworkNode[],
    edges: NetworkEdge[],
    services: Service[]
  ): HealthCheckRecommendation[] {
    const recs: HealthCheckRecommendation[] = [];

    if (services.length === 0) {
      recs.push({
        severity: 'info',
        title: 'No services configured',
        description: 'Add services to the network to enable health check analysis.',
      });
    }
    if (edges.length === 0 && nodes.length > 1) {
      recs.push({
        severity: 'warning',
        title: 'Disconnected nodes',
        description: 'Connect nodes with edges to form a network topology.',
      });
    }

    return recs;
  }

  private generateRecommendations(
    edgeRisks: EdgeRiskAssessment[],
    spofs: SinglePointOfFailure[],
    protectionCoverage: number,
    unprotectedCount: number,
    nodes: NetworkNode[],
    edges: NetworkEdge[]
  ): HealthCheckRecommendation[] {
    const recs: HealthCheckRecommendation[] = [];

    // SPOF recommendations
    if (spofs.length > 0) {
      recs.push({
        severity: 'critical',
        title: `${spofs.length} single point${spofs.length > 1 ? 's' : ''} of failure detected`,
        description: `${spofs.length} edge${spofs.length > 1 ? 's carry' : ' carries'} services with no protection. A single failure would cause complete service loss.`,
        relatedIds: spofs.map((s) => s.edgeId),
      });
    }

    // Protection coverage recommendation
    if (protectionCoverage < 100 && unprotectedCount > 0) {
      const severity = protectionCoverage < 50 ? 'critical' as const : 'warning' as const;
      recs.push({
        severity,
        title: `${unprotectedCount} service${unprotectedCount > 1 ? 's' : ''} without protection`,
        description: `Only ${protectionCoverage}% of services have protection paths. Consider adding protection for critical services.`,
      });
    }

    // Critical edges recommendation
    const criticalEdges = edgeRisks.filter((e) => e.riskLevel === 'critical');
    if (criticalEdges.length > 0) {
      const topCritical = criticalEdges.slice(0, 3);
      recs.push({
        severity: 'warning',
        title: `${criticalEdges.length} high-risk edge${criticalEdges.length > 1 ? 's' : ''}`,
        description: `These edges would cause service outages if they fail. Consider adding redundant paths or protection.`,
        relatedIds: topCritical.map((e) => e.edgeId),
      });
    }

    // Check for nodes with only one edge (leaf nodes with services)
    const nodeEdgeCount = new Map<string, number>();
    for (const edge of edges) {
      nodeEdgeCount.set(edge.source.nodeId, (nodeEdgeCount.get(edge.source.nodeId) ?? 0) + 1);
      nodeEdgeCount.set(edge.target.nodeId, (nodeEdgeCount.get(edge.target.nodeId) ?? 0) + 1);
    }
    const leafNodes = nodes.filter((n) => (nodeEdgeCount.get(n.id) ?? 0) === 1);
    if (leafNodes.length > 0) {
      recs.push({
        severity: 'info',
        title: `${leafNodes.length} leaf node${leafNodes.length > 1 ? 's' : ''} with single connection`,
        description: 'Nodes with only one link have no path diversity. Consider adding backup connections.',
        relatedIds: leafNodes.map((n) => n.id),
      });
    }

    // All healthy
    if (recs.length === 0) {
      recs.push({
        severity: 'info',
        title: 'Network is well protected',
        description: 'All services have protection and no single points of failure were detected.',
      });
    }

    return recs;
  }
}
