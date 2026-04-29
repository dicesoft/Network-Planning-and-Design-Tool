import { describe, it, expect } from 'vitest';
import { LambdaForecaster } from '../LambdaForecaster';
import type { NetworkNode, NetworkEdge } from '@/types/network';
import type { Service, L1DWDMService, ServicePath } from '@/types/service';
import type { ServiceForecastConfig } from '@/types/forecast';

function createMockNode(id: string, name: string): NetworkNode {
  return {
    id,
    name,
    type: 'oadm',
    position: { x: 0, y: 0 },
    ports: [],
  } as NetworkNode;
}

function createMockEdge(id: string, sourceId: string, targetId: string): NetworkEdge {
  return {
    id,
    name: `Edge ${id}`,
    source: { nodeId: sourceId },
    target: { nodeId: targetId },
    type: 'fiber',
    state: 'active',
    properties: { distance: 100, weight: 1 },
    metadata: {},
  } as NetworkEdge;
}

function createMockL1Service(
  id: string,
  edgeIds: string[],
  channel: number,
): L1DWDMService {
  return {
    id,
    name: `L1-${id}`,
    type: 'l1-dwdm',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    sourceNodeId: 'n1',
    destinationNodeId: 'n2',
    workingPath: {
      nodeIds: ['n1', 'n2'],
      edgeIds,
      channelNumber: channel,
      status: 'allocated',
    } as ServicePath,
  } as L1DWDMService;
}

describe('LambdaForecaster', () => {
  const nodes = [
    createMockNode('n1', 'Site A'),
    createMockNode('n2', 'Site B'),
    createMockNode('n3', 'Site C'),
  ];

  const edges = [
    createMockEdge('e1', 'n1', 'n2'),
    createMockEdge('e2', 'n2', 'n3'),
  ];

  const baseConfig: ServiceForecastConfig = {
    method: 'compound-growth',
    period: {
      startDate: '2026-01-01',
      endDate: '2029-01-01',
      interval: 'yearly',
    },
    growthRate: 0.20,
  };

  it('forecasts per-section reflecting current lambda utilization', () => {
    const services: Service[] = [
      createMockL1Service('s1', ['e1'], 1),
      createMockL1Service('s2', ['e1'], 2),
      createMockL1Service('s3', ['e1'], 3),
      createMockL1Service('s4', ['e2'], 1),
    ];

    const forecaster = new LambdaForecaster(
      () => nodes,
      () => edges,
      () => services,
      baseConfig,
    );
    const sections = forecaster.forecastPerSection();

    expect(sections.length).toBe(2); // 2 edges

    const e1Section = sections.find((s) => s.sectionId === 'e1');
    const e2Section = sections.find((s) => s.sectionId === 'e2');

    expect(e1Section).toBeDefined();
    expect(e1Section!.currentUsed).toBe(3);
    expect(e1Section!.totalCapacity).toBe(96);

    expect(e2Section).toBeDefined();
    expect(e2Section!.currentUsed).toBe(1);
  });

  it('identifies bottleneck section in E2E forecast (first to exhaust)', () => {
    // Edge e1 has more usage, should exhaust first
    const services: Service[] = [
      createMockL1Service('s1', ['e1'], 1),
      createMockL1Service('s2', ['e1'], 2),
      createMockL1Service('s3', ['e1'], 3),
      createMockL1Service('s4', ['e1'], 4),
      createMockL1Service('s5', ['e1'], 5),
      createMockL1Service('s6', ['e2'], 1),
    ];

    // Use high growth rate to trigger exhaustion within forecast period
    const config: ServiceForecastConfig = {
      ...baseConfig,
      growthRate: 2.0, // Very high growth to trigger exhaustion
      period: {
        startDate: '2026-01-01',
        endDate: '2046-01-01', // 20 years
        interval: 'yearly',
      },
    };

    const forecaster = new LambdaForecaster(
      () => nodes,
      () => edges,
      () => services,
      config,
    );
    const e2e = forecaster.forecastEndToEnd(
      ['n1', 'n2', 'n3'],
      ['e1', 'e2'],
    );

    expect(e2e.sections.length).toBe(2);
    expect(e2e.pathDescription).toBe('Site A -> Site B -> Site C');

    // If both exhaust, bottleneck should be e1 (more used, exhausts first)
    if (e2e.bottleneck) {
      expect(e2e.bottleneck.sectionId).toBe('e1');
    }
  });

  it('handles edges with no services (0 utilization)', () => {
    const forecaster = new LambdaForecaster(
      () => nodes,
      () => edges,
      () => [], // no services
      baseConfig,
    );
    const sections = forecaster.forecastPerSection();

    expect(sections.length).toBe(2);
    for (const section of sections) {
      expect(section.currentUsed).toBe(0);
      expect(section.totalCapacity).toBe(96);
    }
  });

  it('section name reflects source and target node names', () => {
    const forecaster = new LambdaForecaster(
      () => nodes,
      () => edges,
      () => [],
      baseConfig,
    );
    const sections = forecaster.forecastPerSection();

    const e1Section = sections.find((s) => s.sectionId === 'e1');
    expect(e1Section!.sectionName).toBe('Site A - Site B');
  });

  it('uses saturation method correctly (never exceeds capacity)', () => {
    const services: Service[] = [
      createMockL1Service('s1', ['e1'], 1),
      createMockL1Service('s2', ['e1'], 2),
    ];
    const config: ServiceForecastConfig = {
      ...baseConfig,
      method: 'saturation',
      growthRate: 1.0,
      period: {
        startDate: '2026-01-01',
        endDate: '2046-01-01',
        interval: 'yearly',
      },
    };

    const forecaster = new LambdaForecaster(
      () => nodes,
      () => edges,
      () => services,
      config,
    );
    const sections = forecaster.forecastPerSection();
    const e1Section = sections.find((s) => s.sectionId === 'e1')!;

    for (const point of e1Section.forecastPoints) {
      expect(point.value).toBeLessThanOrEqual(96);
    }
  });
});
