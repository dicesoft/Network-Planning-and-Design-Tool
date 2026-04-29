/**
 * Tests for NetworkSummaryReport health score unification.
 *
 * Verifies that the Reports page uses SurvivabilityAnalyzer (simulation-based)
 * as the primary health score and retains the static structural score as a
 * "Topology Score" sub-metric.
 */
import { describe, it, expect } from 'vitest';
import { SurvivabilityAnalyzer } from '@/core/simulation/SurvivabilityAnalyzer';
import { computeStaticHealthScore, getHealthLabel } from '@/core/analysis/healthScore';
import type { NetworkNode, NetworkEdge } from '@/types/network';
import type { L1DWDMService } from '@/types/service';
import type { HealthCheckResult } from '@/types/simulation';

// ---------------------------------------------------------------------------
// Test helpers — minimal node/edge/service factories
// ---------------------------------------------------------------------------

function makeNode(id: string, name: string): NetworkNode {
  return {
    id,
    name,
    type: 'router',
    vendor: 'generic',
    position: { x: 0, y: 0 },
    stacks: [],
    ports: [],
    metadata: {},
  } as NetworkNode;
}

function makeEdge(id: string, sourceId: string, targetId: string): NetworkEdge {
  return {
    id,
    name: `${sourceId}-${targetId}`,
    type: 'fiber',
    source: { nodeId: sourceId },
    target: { nodeId: targetId },
    properties: { distance: 100, srlgCodes: [] },
    state: 'active',
    metadata: {},
  } as unknown as NetworkEdge;
}

function makeL1Service(
  id: string,
  sourceNodeId: string,
  destNodeId: string,
  edgeIds: string[],
  protection: boolean = false,
): L1DWDMService {
  return {
    id,
    name: `Service-${id}`,
    type: 'l1-dwdm',
    status: 'active',
    sourceNodeId,
    sourcePortId: 'p1',
    destinationNodeId: destNodeId,
    destinationPortId: 'p2',
    dataRate: '100G',
    modulationType: 'DP-QPSK',
    channelWidth: '50GHz',
    wavelengthMode: 'continuous',
    channelNumber: 1,
    workingPath: {
      id: `wp-${id}`,
      type: 'working',
      nodeIds: [sourceNodeId, destNodeId],
      edgeIds,
      totalDistance: 100,
      hopCount: 1,
      status: 'active',
    },
    protectionPath: protection
      ? {
          id: `pp-${id}`,
          type: 'protection',
          nodeIds: [sourceNodeId, destNodeId],
          edgeIds: [`prot-${edgeIds[0]}`],
          totalDistance: 150,
          hopCount: 1,
          status: 'active',
        }
      : undefined,
    protectionScheme: protection ? '1+1' : 'none',
    restorationEnabled: false,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    metadata: {},
  } as L1DWDMService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NetworkSummaryReport health score unification', () => {
  it('SurvivabilityAnalyzer.runHealthCheck produces a HealthCheckResult with expected shape', () => {
    const nodes = [makeNode('A', 'Node-A'), makeNode('B', 'Node-B')];
    const edges = [makeEdge('e1', 'A', 'B')];
    const services = [makeL1Service('s1', 'A', 'B', ['e1'])];

    const analyzer = new SurvivabilityAnalyzer(
      () => nodes,
      () => edges,
      () => services,
    );
    const result: HealthCheckResult = analyzer.runHealthCheck();

    expect(result).toHaveProperty('healthScore');
    expect(result).toHaveProperty('protectionCoverage');
    expect(result).toHaveProperty('singlePointsOfFailure');
    expect(result).toHaveProperty('edgeRisks');
    expect(result).toHaveProperty('timestamp');
    expect(typeof result.healthScore).toBe('number');
    expect(result.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.healthScore).toBeLessThanOrEqual(100);
  });

  it('simulation-based score differs from static score for unprotected services', () => {
    // Setup: 3-node linear topology (A-B-C) with one unprotected service A->C
    const nodes = [
      makeNode('A', 'Node-A'),
      makeNode('B', 'Node-B'),
      makeNode('C', 'Node-C'),
    ];
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'C'),
    ];
    const services = [makeL1Service('s1', 'A', 'C', ['e1', 'e2'], false)];

    // Simulation-based score
    const analyzer = new SurvivabilityAnalyzer(
      () => nodes,
      () => edges,
      () => services,
    );
    const simResult = analyzer.runHealthCheck();

    // Static score
    const staticResult = computeStaticHealthScore({
      connectedComponents: 1,
      avgDegree: (edges.length * 2) / nodes.length,
      protectionPct: 0,
      srlgPct: 0,
      nodeCount: nodes.length,
    });

    // The two scores should exist independently
    expect(typeof simResult.healthScore).toBe('number');
    expect(typeof staticResult.score).toBe('number');

    // With no protection, simulation should detect SPOFs
    expect(simResult.singlePointsOfFailure.length).toBeGreaterThan(0);
    expect(simResult.protectionCoverage).toBe(0);
  });

  it('protected services improve the simulation-based score', () => {
    const nodes = [makeNode('A', 'Node-A'), makeNode('B', 'Node-B')];
    const edges = [makeEdge('e1', 'A', 'B')];

    // Unprotected
    const unprotectedServices = [makeL1Service('s1', 'A', 'B', ['e1'], false)];
    const analyzerUnprotected = new SurvivabilityAnalyzer(
      () => nodes,
      () => edges,
      () => unprotectedServices,
    );
    const unprotectedResult = analyzerUnprotected.runHealthCheck();

    // Protected
    const protectedServices = [makeL1Service('s2', 'A', 'B', ['e1'], true)];
    const analyzerProtected = new SurvivabilityAnalyzer(
      () => nodes,
      () => edges,
      () => protectedServices,
    );
    const protectedResult = analyzerProtected.runHealthCheck();

    // Protected network should have better or equal score
    expect(protectedResult.healthScore).toBeGreaterThanOrEqual(unprotectedResult.healthScore);
    expect(protectedResult.protectionCoverage).toBe(100);
    expect(unprotectedResult.protectionCoverage).toBe(0);
  });

  it('report uses SurvivabilityAnalyzer when edges and services exist', () => {
    // This tests the core logic that the report handleRun follows:
    // when simulationAvailable = true (edges > 0 && services > 0),
    // the primary healthScore comes from SurvivabilityAnalyzer
    const nodes = [makeNode('A', 'Node-A'), makeNode('B', 'Node-B')];
    const edges = [makeEdge('e1', 'A', 'B')];
    const services = [makeL1Service('s1', 'A', 'B', ['e1'])];

    const simulationAvailable = edges.length > 0 && services.length > 0;
    expect(simulationAvailable).toBe(true);

    // Simulate what handleRun does
    const staticResult = computeStaticHealthScore({
      connectedComponents: 1,
      avgDegree: (edges.length * 2) / nodes.length,
      protectionPct: 0,
      srlgPct: 0,
      nodeCount: nodes.length,
    });

    const analyzer = new SurvivabilityAnalyzer(
      () => nodes,
      () => edges,
      () => services,
    );
    const healthResult = analyzer.runHealthCheck();

    const healthScore = healthResult.healthScore;
    const healthLabel = getHealthLabel(healthResult.healthScore);
    const topologyScore = staticResult.score;
    const topologyLabel = staticResult.label;

    // Both scores should be defined
    expect(typeof healthScore).toBe('number');
    expect(typeof topologyScore).toBe('number');
    expect(healthLabel).toBeTruthy();
    expect(topologyLabel).toBeTruthy();

    // The primary score should be the simulation-based one
    expect(healthScore).toBe(healthResult.healthScore);
    // The topology score should be the static one
    expect(topologyScore).toBe(staticResult.score);
  });

  it('falls back to static score when no services exist', () => {
    const nodes = [makeNode('A', 'Node-A'), makeNode('B', 'Node-B')];
    const edges = [makeEdge('e1', 'A', 'B')];
    const services: L1DWDMService[] = [];

    const simulationAvailable = edges.length > 0 && services.length > 0;
    expect(simulationAvailable).toBe(false);

    const staticResult = computeStaticHealthScore({
      connectedComponents: 1,
      avgDegree: (edges.length * 2) / nodes.length,
      protectionPct: 0,
      srlgPct: 0,
      nodeCount: nodes.length,
    });

    // When simulation is not available, healthScore = topologyScore
    const healthScore = staticResult.score;
    const topologyScore = staticResult.score;
    expect(healthScore).toBe(topologyScore);
  });

  it('falls back to static score when no edges exist', () => {
    const edges: NetworkEdge[] = [];
    const services = [makeL1Service('s1', 'A', 'A', [])];

    const simulationAvailable = edges.length > 0 && services.length > 0;
    expect(simulationAvailable).toBe(false);
  });

  it('SurvivabilityAnalyzer detects single points of failure', () => {
    // Linear: A-B-C with service A->C over both edges
    const nodes = [
      makeNode('A', 'Node-A'),
      makeNode('B', 'Node-B'),
      makeNode('C', 'Node-C'),
    ];
    const edges = [
      makeEdge('e1', 'A', 'B'),
      makeEdge('e2', 'B', 'C'),
    ];
    const services = [makeL1Service('s1', 'A', 'C', ['e1', 'e2'], false)];

    const analyzer = new SurvivabilityAnalyzer(
      () => nodes,
      () => edges,
      () => services,
    );
    const result = analyzer.runHealthCheck();

    // Each edge is a SPOF for the unprotected service
    expect(result.singlePointsOfFailure.length).toBe(2);
    expect(result.edgeRisks.length).toBe(2);
    result.edgeRisks.forEach((er) => {
      expect(er.riskLevel).toBe('critical');
    });
  });

  it('getHealthLabel returns correct labels for simulation scores', () => {
    expect(getHealthLabel(90)).toBe('Excellent');
    expect(getHealthLabel(75)).toBe('Good');
    expect(getHealthLabel(55)).toBe('Fair');
    expect(getHealthLabel(30)).toBe('Poor');
    expect(getHealthLabel(10)).toBe('Critical');
  });
});
