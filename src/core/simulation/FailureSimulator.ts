/**
 * FailureSimulator - Fiber Cut & Node Failure Simulation Engine
 *
 * Simulates network failures (fiber cuts, node outages) and analyzes
 * impact on L1 DWDM and L2/L3 IP services, including protection switchover.
 *
 * WSON Restoration Model:
 * - Services with wson-restoration or 1+1+wson protection can be dynamically
 *   restored after failure via Wavelength Switched Optical Network signaling.
 * - WSON restoration is modeled as a classification (temporary-outage) with a
 *   5-minute (300s) restoration timer, NOT as an actual path computation.
 * - Survivability scoring weights temporary-outage at 0.8 (partial credit).
 */

import type { NetworkNode, NetworkEdge } from '@/types/network';
import type { Service, L1DWDMService, L2L3Service } from '@/types/service';
import { isL1DWDMService, isL2L3Service } from '@/types/service';
import type { SimulationResult, ServiceImpact } from '@/types/simulation';

/** WSON restoration time in seconds (5 minutes) */
const WSON_RESTORATION_TIME_S = 300;

/** Survivability weight for temporary-outage services (0.8 = 80% credit) */
const TEMPORARY_OUTAGE_WEIGHT = 0.8;

export class FailureSimulator {
  constructor(
    _getNodes: () => NetworkNode[],
    private getEdges: () => NetworkEdge[],
    private getServices: () => Service[]
  ) {}

  /**
   * Simulate failure of specific edges and/or nodes.
   * Returns a SimulationResult with full impact analysis.
   */
  simulate(failedEdgeIds: string[], failedNodeIds: string[] = []): SimulationResult {
    const allServices = this.getServices();
    const edges = this.getEdges();

    const affectedEdgeIds = new Set(failedEdgeIds);
    const affectedNodeIds = new Set(failedNodeIds);

    // Edges connected to failed nodes are also affected
    for (const edge of edges) {
      if (affectedNodeIds.has(edge.source.nodeId) || affectedNodeIds.has(edge.target.nodeId)) {
        affectedEdgeIds.add(edge.id);
      }
    }

    const affectedServices: ServiceImpact[] = [];
    const survivedServices: ServiceImpact[] = [];
    const downServices: ServiceImpact[] = [];

    let totalBandwidthAffected = 0;
    let totalBandwidthSurvived = 0;

    for (const service of allServices) {
      const impact = this.classifyServiceImpact(service, allServices, affectedEdgeIds, affectedNodeIds);

      if (impact.status === 'survived' || impact.status === 'down' || impact.status === 'degraded' || impact.status === 'at-risk' || impact.status === 'temporary-outage') {
        if (impact.affectedPathType) {
          affectedServices.push(impact);
          const bw = this.parseDataRate(service.dataRate);
          totalBandwidthAffected += bw;

          if (impact.status === 'down') {
            downServices.push(impact);
          } else {
            // survived, degraded, at-risk, and temporary-outage services are still carrying traffic
            survivedServices.push(impact);
            totalBandwidthSurvived += bw;
          }
        }
      }
    }

    // Survivability scoring with WSON weighting:
    // - survived/degraded/at-risk: weight 1.0
    // - temporary-outage: weight 0.8 (partial credit for delayed restoration)
    // - down: weight 0.0
    const survivabilityScore = this.computeSurvivabilityScore(affectedServices);

    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      failedEdges: failedEdgeIds,
      failedNodes: failedNodeIds,
      affectedServices,
      survivedServices,
      downServices,
      totalBandwidthAffected,
      totalBandwidthSurvived,
      survivabilityScore,
    };
  }

  /**
   * Compute survivability score with WSON weighting.
   * temporary-outage services receive partial credit (0.8).
   */
  private computeSurvivabilityScore(affectedServices: ServiceImpact[]): number {
    if (affectedServices.length === 0) return 100;

    let weightedSurvived = 0;
    for (const svc of affectedServices) {
      if (svc.status === 'temporary-outage') {
        weightedSurvived += TEMPORARY_OUTAGE_WEIGHT;
      } else if (svc.status !== 'down') {
        weightedSurvived += 1.0;
      }
    }

    return Math.round((weightedSurvived / affectedServices.length) * 100);
  }

  /**
   * Classify the impact of failures on a single service
   */
  private classifyServiceImpact(
    service: Service,
    allServices: Service[],
    affectedEdgeIds: Set<string>,
    affectedNodeIds: Set<string>
  ): ServiceImpact {
    if (isL1DWDMService(service)) {
      return this.classifyL1Impact(service, affectedEdgeIds, affectedNodeIds);
    }

    if (isL2L3Service(service)) {
      return this.classifyL2L3Impact(service, allServices, affectedEdgeIds, affectedNodeIds);
    }

    return this.createImpact(service, 'down', undefined, false, false);
  }

  private classifyL1Impact(
    service: L1DWDMService,
    affectedEdgeIds: Set<string>,
    affectedNodeIds: Set<string>
  ): ServiceImpact {
    const workingAffected = this.isPathAffected(
      service.workingPath.edgeIds,
      service.workingPath.nodeIds,
      affectedEdgeIds,
      affectedNodeIds
    );

    const hasProtection = service.protectionScheme !== 'none' && !!service.protectionPath;

    const protectionAffected = hasProtection
      ? this.isPathAffected(
          service.protectionPath!.edgeIds,
          service.protectionPath!.nodeIds,
          affectedEdgeIds,
          affectedNodeIds
        )
      : false;

    // --- 1+1+WSON: 5-case classification ---
    if (service.protectionScheme === '1+1+wson') {
      const hasRestorationPath = !!service.restorationPath;
      const restorationAffected = hasRestorationPath
        ? this.isPathAffected(
            service.restorationPath!.edgeIds,
            service.restorationPath!.nodeIds,
            affectedEdgeIds,
            affectedNodeIds
          )
        : false;

      // Case 1: Neither working nor protection affected -> survived
      if (!workingAffected && !protectionAffected) {
        return this.createImpact(service, 'survived', undefined, true, false);
      }

      // Case 2: Working affected, protection OK -> survived (instant 1+1 switchover)
      if (workingAffected && !protectionAffected) {
        return this.createImpact(service, 'survived', 'working', true, true);
      }

      // Case 3: Working OK, protection affected -> at-risk
      if (!workingAffected && protectionAffected) {
        return this.createImpact(service, 'at-risk', 'protection', true, false);
      }

      // Case 4: Both working and protection affected -> temporary-outage (WSON restoration)
      // WSON restoration path is dynamic, so if no explicit path or path not affected, assume WSON can restore
      if (workingAffected && protectionAffected) {
        // If restoration path exists and is also affected -> down
        if (hasRestorationPath && restorationAffected) {
          return this.createImpact(service, 'down', 'both', true, false);
        }
        // WSON can restore (dynamically or explicit path not affected)
        return this.createImpactWithRestoration(
          service, 'temporary-outage', 'both', true, false,
          WSON_RESTORATION_TIME_S, 'wson'
        );
      }
    }

    // --- WSON-restoration only: 2-case (no OLP protection path) ---
    if (service.protectionScheme === 'wson-restoration') {
      if (!workingAffected) {
        return this.createImpact(service, 'survived', undefined, false, false);
      }
      // Working affected -> temporary-outage (WSON restores dynamically)
      return this.createImpactWithRestoration(
        service, 'temporary-outage', 'working', false, false,
        WSON_RESTORATION_TIME_S, 'wson'
      );
    }

    // --- Standard protection schemes (none, olp, sncp) ---
    if (!workingAffected && !protectionAffected) {
      return this.createImpact(service, 'survived', undefined, hasProtection, false);
    }

    if (workingAffected && !protectionAffected && hasProtection) {
      return this.createImpact(service, 'survived', 'working', true, true);
    }

    if (!workingAffected && protectionAffected) {
      return this.createImpact(service, 'at-risk', 'protection', true, false);
    }

    if (workingAffected && protectionAffected) {
      return this.createImpact(service, 'down', 'both', true, false);
    }

    // Working affected, no protection
    return this.createImpact(service, 'down', 'working', false, false);
  }

  private classifyL2L3Impact(
    service: L2L3Service,
    allServices: Service[],
    affectedEdgeIds: Set<string>,
    affectedNodeIds: Set<string>
  ): ServiceImpact {
    const underlayService = allServices.find((s) => s.id === service.underlayServiceId);
    const hasProtectionUnderlay = !!service.protectionUnderlayServiceId;

    if (!underlayService || !isL1DWDMService(underlayService)) {
      return this.createImpact(service, 'down', 'working', hasProtectionUnderlay, false);
    }

    const underlayImpact = this.classifyL1Impact(underlayService, affectedEdgeIds, affectedNodeIds);
    const underlayDown = underlayImpact.status === 'down';

    if (!underlayDown) {
      // Primary underlay is alive (either unaffected or survived via its own protection)
      return this.createImpact(
        service,
        underlayImpact.affectedPathType ? underlayImpact.status : 'survived',
        underlayImpact.affectedPathType,
        hasProtectionUnderlay,
        underlayImpact.protectionActivated
      );
    }

    // Primary underlay is down - check protection underlay
    if (!hasProtectionUnderlay) {
      return this.createImpact(service, 'down', 'working', false, false);
    }

    const protectionUnderlay = allServices.find(
      (s) => s.id === service.protectionUnderlayServiceId
    );

    if (!protectionUnderlay || !isL1DWDMService(protectionUnderlay)) {
      return this.createImpact(service, 'down', 'both', true, false);
    }

    const protectionUnderlayImpact = this.classifyL1Impact(
      protectionUnderlay,
      affectedEdgeIds,
      affectedNodeIds
    );

    if (protectionUnderlayImpact.status === 'down') {
      return this.createImpact(service, 'down', 'both', true, false);
    }

    return this.createImpact(service, 'survived', 'working', true, true);
  }

  private isPathAffected(
    edgeIds: string[],
    nodeIds: string[],
    affectedEdgeIds: Set<string>,
    affectedNodeIds: Set<string>
  ): boolean {
    for (const edgeId of edgeIds) {
      if (affectedEdgeIds.has(edgeId)) return true;
    }
    for (const nodeId of nodeIds) {
      if (affectedNodeIds.has(nodeId)) return true;
    }
    return false;
  }

  private createImpact(
    service: Service,
    status: ServiceImpact['status'],
    affectedPathType: ServiceImpact['affectedPathType'],
    hasProtection: boolean,
    protectionActivated: boolean
  ): ServiceImpact {
    return {
      serviceId: service.id,
      serviceName: service.name,
      serviceType: service.type,
      status,
      affectedPathType,
      hasProtection,
      protectionActivated,
      dataRate: service.dataRate,
    };
  }

  private createImpactWithRestoration(
    service: Service,
    status: ServiceImpact['status'],
    affectedPathType: ServiceImpact['affectedPathType'],
    hasProtection: boolean,
    protectionActivated: boolean,
    restorationTime: number,
    restorationMethod: 'instant' | 'wson' | 'none'
  ): ServiceImpact {
    return {
      serviceId: service.id,
      serviceName: service.name,
      serviceType: service.type,
      status,
      affectedPathType,
      hasProtection,
      protectionActivated,
      dataRate: service.dataRate,
      restorationTime,
      restorationMethod,
    };
  }

  /**
   * Parse data rate string to numeric Gbps value
   */
  private parseDataRate(rate: string): number {
    const match = rate.match(/^(\d+)G$/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
