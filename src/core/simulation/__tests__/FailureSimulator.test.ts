/**
 * FailureSimulator Tests - WSON & 1+1+WSON Classification
 *
 * Tests cover:
 * - Standard protection (OLP/SNCP): survived, at-risk, down
 * - WSON-restoration: temporary-outage on working failure
 * - 1+1+WSON: all 5 failure classification cases
 * - Survivability scoring with WSON weighting (0.8)
 * - Mixed service scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FailureSimulator } from '../FailureSimulator';
import type { NetworkNode, NetworkEdge } from '@/types/network';
import type { Service, L1DWDMService, ServicePath } from '@/types/service';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createNode(id: string, name: string): NetworkNode {
  return {
    id,
    name,
    type: 'router',
    vendor: 'generic',
    position: { x: 0, y: 0 },
    stacks: [],
    metadata: {},
  };
}

function createEdge(id: string, sourceNodeId: string, targetNodeId: string): NetworkEdge {
  return {
    id,
    name: `${sourceNodeId}-${targetNodeId}`,
    type: 'fiber',
    source: { nodeId: sourceNodeId },
    target: { nodeId: targetNodeId },
    properties: { distance: 100 },
    state: { status: 'active', lastUpdated: new Date().toISOString() },
    metadata: {},
  };
}

function createPath(nodeIds: string[], edgeIds: string[], type: 'working' | 'protection' | 'restoration' = 'working'): ServicePath {
  return {
    id: `path-${type}`,
    type,
    nodeIds,
    edgeIds,
    totalDistance: edgeIds.length * 100,
    hopCount: nodeIds.length - 1,
    status: 'active',
  };
}

function createL1Service(overrides: Partial<L1DWDMService> = {}): L1DWDMService {
  return {
    id: 'svc-1',
    name: 'Test Service',
    type: 'l1-dwdm',
    status: 'active',
    sourceNodeId: 'A',
    sourcePortId: 'p1',
    destinationNodeId: 'D',
    destinationPortId: 'p2',
    dataRate: '100G',
    modulationType: 'DP-QPSK',
    channelWidth: '50GHz',
    wavelengthMode: 'continuous',
    workingPath: createPath(['A', 'B', 'D'], ['e1', 'e2']),
    protectionScheme: 'none',
    restorationEnabled: false,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

// ============================================================================
// TOPOLOGY: A -- B -- D (working)
//           A -- C -- D (protection)
//           A -- E -- D (restoration / WSON)
// ============================================================================

const nodes: NetworkNode[] = [
  createNode('A', 'Node-A'),
  createNode('B', 'Node-B'),
  createNode('C', 'Node-C'),
  createNode('D', 'Node-D'),
  createNode('E', 'Node-E'),
];

const edges: NetworkEdge[] = [
  createEdge('e1', 'A', 'B'),
  createEdge('e2', 'B', 'D'),
  createEdge('e3', 'A', 'C'),
  createEdge('e4', 'C', 'D'),
  createEdge('e5', 'A', 'E'),
  createEdge('e6', 'E', 'D'),
];

const protectionPath = createPath(['A', 'C', 'D'], ['e3', 'e4'], 'protection');
const restorationPath = createPath(['A', 'E', 'D'], ['e5', 'e6'], 'restoration');

// ============================================================================
// TESTS
// ============================================================================

describe('FailureSimulator', () => {
  let simulator: FailureSimulator;

  beforeEach(() => {
    // Will be overridden per test with specific services
  });

  // --------------------------------------------------------------------------
  // STANDARD PROTECTION (OLP/SNCP)
  // --------------------------------------------------------------------------

  describe('Standard protection (OLP)', () => {
    it('should classify as survived when no paths affected', () => {
      const services: Service[] = [
        createL1Service({
          protectionScheme: 'olp',
          protectionPath,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      // Fail an edge not on any path
      const result = simulator.simulate(['e5']);
      expect(result.affectedServices).toHaveLength(0);
      expect(result.survivabilityScore).toBe(100);
    });

    it('should classify as survived with protection switchover when working fails', () => {
      const services: Service[] = [
        createL1Service({
          protectionScheme: 'olp',
          protectionPath,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1']); // fails working path edge
      expect(result.affectedServices).toHaveLength(1);
      expect(result.affectedServices[0].status).toBe('survived');
      expect(result.affectedServices[0].protectionActivated).toBe(true);
      expect(result.affectedServices[0].affectedPathType).toBe('working');
      expect(result.survivabilityScore).toBe(100);
    });

    it('should classify as at-risk when protection path fails', () => {
      const services: Service[] = [
        createL1Service({
          protectionScheme: 'olp',
          protectionPath,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e3']); // fails protection path edge
      expect(result.affectedServices).toHaveLength(1);
      expect(result.affectedServices[0].status).toBe('at-risk');
      expect(result.affectedServices[0].affectedPathType).toBe('protection');
    });

    it('should classify as down when both paths fail', () => {
      const services: Service[] = [
        createL1Service({
          protectionScheme: 'olp',
          protectionPath,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1', 'e3']); // both paths affected
      expect(result.affectedServices).toHaveLength(1);
      expect(result.affectedServices[0].status).toBe('down');
      expect(result.affectedServices[0].affectedPathType).toBe('both');
      expect(result.survivabilityScore).toBe(0);
    });

    it('should classify as down with no protection when working fails', () => {
      const services: Service[] = [
        createL1Service({ protectionScheme: 'none' }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1']);
      expect(result.affectedServices).toHaveLength(1);
      expect(result.affectedServices[0].status).toBe('down');
      expect(result.affectedServices[0].hasProtection).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // WSON RESTORATION
  // --------------------------------------------------------------------------

  describe('WSON restoration', () => {
    it('should classify as survived when working path is not affected', () => {
      const services: Service[] = [
        createL1Service({
          protectionScheme: 'wson-restoration',
          restorationEnabled: true,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e5']); // unrelated edge
      expect(result.affectedServices).toHaveLength(0);
      expect(result.survivabilityScore).toBe(100);
    });

    it('should classify as temporary-outage when working path fails', () => {
      const services: Service[] = [
        createL1Service({
          protectionScheme: 'wson-restoration',
          restorationEnabled: true,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1']); // working path edge
      expect(result.affectedServices).toHaveLength(1);

      const impact = result.affectedServices[0];
      expect(impact.status).toBe('temporary-outage');
      expect(impact.restorationTime).toBe(300);
      expect(impact.restorationMethod).toBe('wson');
      expect(impact.affectedPathType).toBe('working');
    });

    it('should weight temporary-outage at 0.8 in survivability scoring', () => {
      const services: Service[] = [
        createL1Service({
          id: 'wson-svc',
          protectionScheme: 'wson-restoration',
          restorationEnabled: true,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1']);
      // 1 service affected, temporary-outage weighted at 0.8
      // score = (0.8 / 1) * 100 = 80
      expect(result.survivabilityScore).toBe(80);
    });

    it('should correctly score mixed WSON and OLP services', () => {
      const services: Service[] = [
        createL1Service({
          id: 'olp-svc',
          protectionScheme: 'olp',
          protectionPath,
        }),
        createL1Service({
          id: 'wson-svc',
          name: 'WSON Service',
          protectionScheme: 'wson-restoration',
          restorationEnabled: true,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      // Fail working edge (e1) - OLP switches to protection, WSON gets temporary-outage
      const result = simulator.simulate(['e1']);
      expect(result.affectedServices).toHaveLength(2);

      const olpImpact = result.affectedServices.find(s => s.serviceId === 'olp-svc')!;
      const wsonImpact = result.affectedServices.find(s => s.serviceId === 'wson-svc')!;

      expect(olpImpact.status).toBe('survived');
      expect(wsonImpact.status).toBe('temporary-outage');

      // score = (1.0 + 0.8) / 2 * 100 = 90
      expect(result.survivabilityScore).toBe(90);
    });
  });

  // --------------------------------------------------------------------------
  // 1+1+WSON PROTECTION (5-case classification)
  // --------------------------------------------------------------------------

  describe('1+1+WSON protection', () => {
    const create1plus1WsonService = (overrides: Partial<L1DWDMService> = {}): L1DWDMService =>
      createL1Service({
        id: 'svc-1plus1wson',
        name: '1+1+WSON Service',
        protectionScheme: '1+1+wson',
        protectionPath,
        restorationEnabled: true,
        restorationPath,
        ...overrides,
      });

    it('Case 1: neither affected -> survived', () => {
      const services: Service[] = [create1plus1WsonService()];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e5']); // only restoration path edge
      // Restoration path IS affected but neither working nor protection is,
      // so it doesn't count as "affected" — the service is fine
      // Wait: e5 is on restoration path. Let's re-check. Working = e1,e2. Protection = e3,e4.
      // e5 is NOT on working or protection. Service is survived with no affectedPathType.
      expect(result.affectedServices).toHaveLength(0);
      expect(result.survivabilityScore).toBe(100);
    });

    it('Case 2: working affected, protection OK -> survived (instant 1+1)', () => {
      const services: Service[] = [create1plus1WsonService()];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1']); // working path fails
      expect(result.affectedServices).toHaveLength(1);

      const impact = result.affectedServices[0];
      expect(impact.status).toBe('survived');
      expect(impact.protectionActivated).toBe(true);
      expect(impact.affectedPathType).toBe('working');
      expect(impact.restorationTime).toBeUndefined();
    });

    it('Case 3: working OK, protection affected -> at-risk', () => {
      const services: Service[] = [create1plus1WsonService()];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e3']); // protection path fails
      expect(result.affectedServices).toHaveLength(1);

      const impact = result.affectedServices[0];
      expect(impact.status).toBe('at-risk');
      expect(impact.affectedPathType).toBe('protection');
      expect(impact.protectionActivated).toBe(false);
    });

    it('Case 4: both working and protection affected -> temporary-outage (WSON restoration)', () => {
      const services: Service[] = [create1plus1WsonService()];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1', 'e3']); // working + protection fail
      expect(result.affectedServices).toHaveLength(1);

      const impact = result.affectedServices[0];
      expect(impact.status).toBe('temporary-outage');
      expect(impact.restorationTime).toBe(300);
      expect(impact.restorationMethod).toBe('wson');
      expect(impact.affectedPathType).toBe('both');
      // Score: 0.8 weight
      expect(result.survivabilityScore).toBe(80);
    });

    it('Case 5: all three paths affected -> down', () => {
      const services: Service[] = [create1plus1WsonService()];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      // Fail all three paths: working (e1), protection (e3), restoration (e5)
      const result = simulator.simulate(['e1', 'e3', 'e5']);
      expect(result.affectedServices).toHaveLength(1);

      const impact = result.affectedServices[0];
      expect(impact.status).toBe('down');
      expect(impact.affectedPathType).toBe('both');
      expect(result.survivabilityScore).toBe(0);
    });

    it('Case 4 variant: 1+1+WSON without explicit restoration path -> temporary-outage (dynamic WSON)', () => {
      // When no restorationPath is set, WSON is assumed to find a dynamic path
      const services: Service[] = [create1plus1WsonService({ restorationPath: undefined })];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1', 'e3']); // working + protection fail
      expect(result.affectedServices).toHaveLength(1);

      const impact = result.affectedServices[0];
      expect(impact.status).toBe('temporary-outage');
      expect(impact.restorationMethod).toBe('wson');
    });
  });

  // --------------------------------------------------------------------------
  // SURVIVABILITY SCORING
  // --------------------------------------------------------------------------

  describe('Survivability scoring', () => {
    it('should score 100 when all services survive', () => {
      const services: Service[] = [
        createL1Service({
          id: 'svc-1',
          protectionScheme: 'olp',
          protectionPath,
        }),
        createL1Service({
          id: 'svc-2',
          name: 'Service 2',
          protectionScheme: 'olp',
          protectionPath,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1']); // both switch to protection
      expect(result.survivabilityScore).toBe(100);
    });

    it('should score 0 when all services are down', () => {
      const services: Service[] = [
        createL1Service({ id: 'svc-1', protectionScheme: 'none' }),
        createL1Service({ id: 'svc-2', name: 'Service 2', protectionScheme: 'none' }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1']);
      expect(result.survivabilityScore).toBe(0);
    });

    it('should correctly weight mixed survived + temporary-outage + down', () => {
      const services: Service[] = [
        // Service 1: OLP -> survived (weight 1.0)
        createL1Service({
          id: 'svc-olp',
          protectionScheme: 'olp',
          protectionPath,
        }),
        // Service 2: WSON -> temporary-outage (weight 0.8)
        createL1Service({
          id: 'svc-wson',
          name: 'WSON Service',
          protectionScheme: 'wson-restoration',
          restorationEnabled: true,
        }),
        // Service 3: No protection -> down (weight 0.0)
        createL1Service({
          id: 'svc-none',
          name: 'Unprotected Service',
          protectionScheme: 'none',
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1']); // working path fails
      expect(result.affectedServices).toHaveLength(3);

      // score = (1.0 + 0.8 + 0.0) / 3 * 100 = 60
      expect(result.survivabilityScore).toBe(60);
    });

    it('should include temporary-outage in survivedServices (still carrying traffic)', () => {
      const services: Service[] = [
        createL1Service({
          protectionScheme: 'wson-restoration',
          restorationEnabled: true,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate(['e1']);
      expect(result.survivedServices).toHaveLength(1);
      expect(result.downServices).toHaveLength(0);
      expect(result.survivedServices[0].status).toBe('temporary-outage');
    });
  });

  // --------------------------------------------------------------------------
  // NODE FAILURE SCENARIOS
  // --------------------------------------------------------------------------

  describe('Node failures', () => {
    it('should affect edges connected to failed node', () => {
      const services: Service[] = [
        createL1Service({ protectionScheme: 'none' }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      // Fail node B (intermediate on working path A-B-D)
      const result = simulator.simulate([], ['B']);
      expect(result.affectedServices).toHaveLength(1);
      expect(result.affectedServices[0].status).toBe('down');
    });

    it('should trigger WSON for 1+1+WSON when node failure affects both working and protection', () => {
      // Working: A-B-D, Protection: A-C-D
      // If both B and C fail, both paths affected -> temporary-outage via WSON
      const services: Service[] = [
        createL1Service({
          protectionScheme: '1+1+wson',
          protectionPath,
          restorationEnabled: true,
          restorationPath,
        }),
      ];
      simulator = new FailureSimulator(() => nodes, () => edges, () => services);

      const result = simulator.simulate([], ['B', 'C']);
      expect(result.affectedServices).toHaveLength(1);
      expect(result.affectedServices[0].status).toBe('temporary-outage');
      expect(result.affectedServices[0].restorationMethod).toBe('wson');
    });
  });
});
