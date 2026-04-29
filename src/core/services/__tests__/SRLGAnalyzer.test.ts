import { describe, it, expect, beforeEach } from 'vitest';
import {
  SRLGAnalyzer,
  SRLGTopologyProvider,
  RISK_THRESHOLDS,
  createSRLGAnalyzer,
} from '../SRLGAnalyzer';
import type { ServicePath } from '@/types/service';
import type { NetworkEdge } from '@/types/network';

// ============================================================================
// MOCK DATA FACTORIES
// ============================================================================

const createMockEdge = (overrides: Partial<NetworkEdge> = {}): NetworkEdge => ({
  id: 'edge-1',
  name: 'Edge 1',
  type: 'fiber',
  source: { nodeId: 'node-1', portId: 'port-1' },
  target: { nodeId: 'node-2', portId: 'port-1' },
  properties: {
    distance: 50,
    srlgCodes: [],
  },
  state: 'active',
  metadata: {},
  ...overrides,
});

const createMockPath = (overrides: Partial<ServicePath> = {}): ServicePath => ({
  id: 'path-1',
  type: 'working',
  nodeIds: ['node-1', 'node-2'],
  edgeIds: ['edge-1'],
  totalDistance: 50,
  hopCount: 1,
  status: 'computed',
  ...overrides,
});

// ============================================================================
// MOCK TOPOLOGY PROVIDER
// ============================================================================

const createMockTopologyProvider = (edges: NetworkEdge[] = []): SRLGTopologyProvider => ({
  getEdge: (id) => edges.find((e) => e.id === id),
  getEdges: () => edges,
});

// ============================================================================
// TESTS
// ============================================================================

describe('SRLGAnalyzer', () => {
  let analyzer: SRLGAnalyzer;
  let edges: NetworkEdge[];

  // --------------------------------------------------------------------------
  // Setup
  // --------------------------------------------------------------------------

  beforeEach(() => {
    // Create edges with various SRLG configurations
    edges = [
      createMockEdge({
        id: 'edge-1',
        name: 'Edge A-B',
        properties: { distance: 50, srlgCodes: ['SRLG-A', 'SRLG-X'] },
      }),
      createMockEdge({
        id: 'edge-2',
        name: 'Edge B-C',
        properties: { distance: 30, srlgCodes: ['SRLG-A', 'SRLG-Y'] },
      }),
      createMockEdge({
        id: 'edge-3',
        name: 'Edge C-D',
        properties: { distance: 40, srlgCodes: ['SRLG-B'] },
      }),
      createMockEdge({
        id: 'edge-4',
        name: 'Edge A-D',
        properties: { distance: 100, srlgCodes: ['SRLG-C'] },
      }),
      createMockEdge({
        id: 'edge-5',
        name: 'Edge B-D',
        properties: { distance: 60, srlgCodes: [] }, // No SRLGs
      }),
    ];

    const topology = createMockTopologyProvider(edges);
    analyzer = new SRLGAnalyzer(topology);
  });

  // --------------------------------------------------------------------------
  // getPathSRLGs Tests
  // --------------------------------------------------------------------------

  describe('getPathSRLGs', () => {
    it('should return all unique SRLGs for a path', () => {
      const srlgs = analyzer.getPathSRLGs(['edge-1', 'edge-2']);

      expect(srlgs.size).toBe(3);
      expect(srlgs.has('SRLG-A')).toBe(true);
      expect(srlgs.has('SRLG-X')).toBe(true);
      expect(srlgs.has('SRLG-Y')).toBe(true);
    });

    it('should return empty set for path with no SRLGs', () => {
      const srlgs = analyzer.getPathSRLGs(['edge-5']);
      expect(srlgs.size).toBe(0);
    });

    it('should return empty set for empty edge list', () => {
      const srlgs = analyzer.getPathSRLGs([]);
      expect(srlgs.size).toBe(0);
    });

    it('should handle non-existent edges', () => {
      const srlgs = analyzer.getPathSRLGs(['non-existent']);
      expect(srlgs.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // getPathSRLGSummary Tests
  // --------------------------------------------------------------------------

  describe('getPathSRLGSummary', () => {
    it('should return detailed SRLG summary', () => {
      const path = createMockPath({
        edgeIds: ['edge-1', 'edge-2', 'edge-5'],
        totalDistance: 140,
      });

      const summary = analyzer.getPathSRLGSummary(path);

      expect(summary.totalSRLGCount).toBe(3);
      expect(summary.uniqueSRLGs).toEqual(['SRLG-A', 'SRLG-X', 'SRLG-Y']);
      expect(summary.edgesWithSRLGs.length).toBe(2);
      expect(summary.edgesWithoutSRLGs).toContain('edge-5');
      expect(summary.srlgCoveredDistance).toBe(80); // 50 + 30
    });
  });

  // --------------------------------------------------------------------------
  // comparePaths Tests
  // --------------------------------------------------------------------------

  describe('comparePaths', () => {
    it('should return zero risk for fully diverse paths', () => {
      const workingPath = createMockPath({
        edgeIds: ['edge-1', 'edge-2'], // SRLG-A, SRLG-X, SRLG-Y
        totalDistance: 80,
      });

      const protectionPath = createMockPath({
        id: 'path-2',
        type: 'protection',
        edgeIds: ['edge-3', 'edge-4'], // SRLG-B, SRLG-C
        totalDistance: 140,
      });

      const analysis = analyzer.comparePaths(workingPath, protectionPath);

      expect(analysis.sharedSRLGCodes).toEqual([]);
      expect(analysis.sharedEdgeIds).toEqual([]);
      expect(analysis.sharedDistanceKm).toBe(0);
      expect(analysis.riskScore).toBe(0);
      expect(analysis.warnings.length).toBe(0);
    });

    it('should detect shared SRLGs between paths', () => {
      const workingPath = createMockPath({
        edgeIds: ['edge-1'], // SRLG-A, SRLG-X
        totalDistance: 50,
      });

      const protectionPath = createMockPath({
        id: 'path-2',
        type: 'protection',
        edgeIds: ['edge-2'], // SRLG-A, SRLG-Y
        totalDistance: 30,
      });

      const analysis = analyzer.comparePaths(workingPath, protectionPath);

      expect(analysis.sharedSRLGCodes).toContain('SRLG-A');
      expect(analysis.sharedSRLGCodes.length).toBe(1);
      expect(analysis.sharedEdgeIds).toContain('edge-2');
      expect(analysis.sharedDistanceKm).toBe(30);
      expect(analysis.riskScore).toBeGreaterThan(0);
      expect(analysis.warnings.length).toBeGreaterThan(0);
    });

    it('should calculate 100% risk for identical SRLG paths', () => {
      const workingPath = createMockPath({
        edgeIds: ['edge-1'],
        totalDistance: 50,
      });

      // Same edge = 100% SRLG overlap
      const protectionPath = createMockPath({
        id: 'path-2',
        type: 'protection',
        edgeIds: ['edge-1'],
        totalDistance: 50,
      });

      const analysis = analyzer.comparePaths(workingPath, protectionPath);

      expect(analysis.riskScore).toBe(100);
    });

    it('should handle paths with no SRLGs', () => {
      const workingPath = createMockPath({
        edgeIds: ['edge-5'], // No SRLGs
        totalDistance: 60,
      });

      const protectionPath = createMockPath({
        id: 'path-2',
        type: 'protection',
        edgeIds: ['edge-5'],
        totalDistance: 60,
      });

      const analysis = analyzer.comparePaths(workingPath, protectionPath);

      // No SRLGs = no risk from SRLG perspective
      expect(analysis.riskScore).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // comparePathsExtended Tests
  // --------------------------------------------------------------------------

  describe('comparePathsExtended', () => {
    it('should return extended analysis with risk level and recommendation', () => {
      const workingPath = createMockPath({
        edgeIds: ['edge-1'],
        totalDistance: 50,
      });

      const protectionPath = createMockPath({
        id: 'path-2',
        type: 'protection',
        edgeIds: ['edge-3', 'edge-4'],
        totalDistance: 140,
      });

      const analysis = analyzer.comparePathsExtended(workingPath, protectionPath);

      expect(analysis.riskLevel).toBe('none');
      expect(analysis.diversityScore).toBe(100);
      expect(analysis.recommendation).toContain('fully SRLG-diverse');
    });

    it('should classify high risk correctly', () => {
      const workingPath = createMockPath({
        edgeIds: ['edge-1', 'edge-2'], // SRLG-A, SRLG-X, SRLG-Y
        totalDistance: 80,
      });

      const protectionPath = createMockPath({
        id: 'path-2',
        type: 'protection',
        edgeIds: ['edge-2', 'edge-3'], // SRLG-A, SRLG-Y, SRLG-B
        totalDistance: 70,
      });

      const analysis = analyzer.comparePathsExtended(workingPath, protectionPath);

      expect(analysis.riskScore).toBeGreaterThan(0);
      expect(analysis.diversityScore).toBeLessThan(100);
    });
  });

  // --------------------------------------------------------------------------
  // getEdgesWithSRLGs Tests
  // --------------------------------------------------------------------------

  describe('getEdgesWithSRLGs', () => {
    it('should find all edges containing specified SRLGs', () => {
      const edgeIds = analyzer.getEdgesWithSRLGs(['SRLG-A']);

      expect(edgeIds).toContain('edge-1');
      expect(edgeIds).toContain('edge-2');
      expect(edgeIds.length).toBe(2);
    });

    it('should find edges with any of multiple SRLGs', () => {
      const edgeIds = analyzer.getEdgesWithSRLGs(['SRLG-B', 'SRLG-C']);

      expect(edgeIds).toContain('edge-3');
      expect(edgeIds).toContain('edge-4');
      expect(edgeIds.length).toBe(2);
    });

    it('should return empty array for non-existent SRLGs', () => {
      const edgeIds = analyzer.getEdgesWithSRLGs(['NON-EXISTENT']);
      expect(edgeIds).toEqual([]);
    });

    it('should return empty array for empty SRLG list', () => {
      const edgeIds = analyzer.getEdgesWithSRLGs([]);
      expect(edgeIds).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getEdgesInSRLG Tests
  // --------------------------------------------------------------------------

  describe('getEdgesInSRLG', () => {
    it('should find all edges in a specific SRLG', () => {
      const edgeIds = analyzer.getEdgesInSRLG('SRLG-A');

      expect(edgeIds).toContain('edge-1');
      expect(edgeIds).toContain('edge-2');
    });
  });

  // --------------------------------------------------------------------------
  // getSRLGIndex Tests
  // --------------------------------------------------------------------------

  describe('getSRLGIndex', () => {
    it('should build index of all SRLGs', () => {
      const index = analyzer.getSRLGIndex();

      expect(index.get('SRLG-A')).toEqual(['edge-1', 'edge-2']);
      expect(index.get('SRLG-X')).toEqual(['edge-1']);
      expect(index.get('SRLG-Y')).toEqual(['edge-2']);
      expect(index.get('SRLG-B')).toEqual(['edge-3']);
      expect(index.get('SRLG-C')).toEqual(['edge-4']);
    });
  });

  // --------------------------------------------------------------------------
  // calculateSharedDistance Tests
  // --------------------------------------------------------------------------

  describe('calculateSharedDistance', () => {
    it('should sum distances of shared edges', () => {
      const distance = analyzer.calculateSharedDistance(['edge-1', 'edge-2']);
      expect(distance).toBe(80); // 50 + 30
    });

    it('should return 0 for empty edge list', () => {
      const distance = analyzer.calculateSharedDistance([]);
      expect(distance).toBe(0);
    });

    it('should handle non-existent edges gracefully', () => {
      const distance = analyzer.calculateSharedDistance(['non-existent']);
      expect(distance).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // calculateRiskScore Tests
  // --------------------------------------------------------------------------

  describe('calculateRiskScore', () => {
    it('should return 0 for no shared SRLGs', () => {
      const score = analyzer.calculateRiskScore([], ['SRLG-A', 'SRLG-B']);
      expect(score).toBe(0);
    });

    it('should return 0 when no SRLGs defined', () => {
      const score = analyzer.calculateRiskScore([], []);
      expect(score).toBe(0);
    });

    it('should return 100 for all shared SRLGs', () => {
      const score = analyzer.calculateRiskScore(['SRLG-A'], ['SRLG-A']);
      expect(score).toBe(100);
    });

    it('should calculate percentage correctly', () => {
      const score = analyzer.calculateRiskScore(['SRLG-A'], ['SRLG-A', 'SRLG-B']);
      expect(score).toBe(50);
    });
  });

  // --------------------------------------------------------------------------
  // arePathsSRLGDiverse Tests
  // --------------------------------------------------------------------------

  describe('arePathsSRLGDiverse', () => {
    it('should return true for diverse paths', () => {
      const diverse = analyzer.arePathsSRLGDiverse(['edge-1'], ['edge-3']);
      expect(diverse).toBe(true);
    });

    it('should return false for paths sharing SRLGs', () => {
      const diverse = analyzer.arePathsSRLGDiverse(['edge-1'], ['edge-2']); // Both have SRLG-A
      expect(diverse).toBe(false);
    });

    it('should return true for empty paths', () => {
      const diverse = analyzer.arePathsSRLGDiverse([], []);
      expect(diverse).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // getSRLGsToAvoid Tests
  // --------------------------------------------------------------------------

  describe('getSRLGsToAvoid', () => {
    it('should return SRLGs from reference path', () => {
      const path = createMockPath({
        edgeIds: ['edge-1', 'edge-2'],
      });

      const toAvoid = analyzer.getSRLGsToAvoid(path);

      expect(toAvoid).toContain('SRLG-A');
      expect(toAvoid).toContain('SRLG-X');
      expect(toAvoid).toContain('SRLG-Y');
    });
  });

  // --------------------------------------------------------------------------
  // Factory Function Tests
  // --------------------------------------------------------------------------

  describe('createSRLGAnalyzer', () => {
    it('should create SRLGAnalyzer instance', () => {
      const topology = createMockTopologyProvider(edges);
      const instance = createSRLGAnalyzer(topology);

      expect(instance).toBeInstanceOf(SRLGAnalyzer);
    });
  });

  // --------------------------------------------------------------------------
  // Risk Level Thresholds Tests
  // --------------------------------------------------------------------------

  describe('risk thresholds', () => {
    it('should have correct threshold values', () => {
      expect(RISK_THRESHOLDS.none).toBe(0);
      expect(RISK_THRESHOLDS.low).toBe(10);
      expect(RISK_THRESHOLDS.medium).toBe(30);
      expect(RISK_THRESHOLDS.high).toBe(50);
      expect(RISK_THRESHOLDS.critical).toBe(70);
    });
  });
});
