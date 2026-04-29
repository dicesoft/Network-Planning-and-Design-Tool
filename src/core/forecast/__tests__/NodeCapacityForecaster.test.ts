import { describe, it, expect } from 'vitest';
import { NodeCapacityForecaster } from '../NodeCapacityForecaster';
import type { NetworkNode, Port } from '@/types/network';
import type { ServiceForecastConfig } from '@/types/forecast';

function createMockNode(
  id: string,
  name: string,
  totalPorts: number,
  usedPorts: number,
): NetworkNode {
  const ports: Port[] = [];
  for (let i = 0; i < totalPorts; i++) {
    ports.push({
      id: `port-${id}-${i}`,
      name: `Port ${i + 1}`,
      type: 'dwdm',
      direction: 'bidirectional',
      dataRate: '100G',
      status: i < usedPorts ? 'used' : 'available',
      connectedEdgeId: i < usedPorts ? `edge-${i}` : undefined,
    } as Port);
  }

  return {
    id,
    name,
    type: 'oadm',
    position: { x: 0, y: 0 },
    ports,
  } as NetworkNode;
}

describe('NodeCapacityForecaster', () => {
  const baseConfig: ServiceForecastConfig = {
    method: 'compound-growth',
    period: {
      startDate: '2026-01-01',
      endDate: '2029-01-01',
      interval: 'yearly',
    },
    growthRate: 0.20,
  };

  it('calculates current utilization correctly', () => {
    const nodes = [
      createMockNode('n1', 'Node A', 10, 7),
      createMockNode('n2', 'Node B', 20, 5),
    ];
    const forecaster = new NodeCapacityForecaster(() => nodes, () => [], baseConfig);
    const results = forecaster.forecastAll();

    expect(results.length).toBe(2);
    expect(results[0].currentUtilization).toBe(70);
    expect(results[1].currentUtilization).toBe(25);
  });

  it('detects exhaustion date when utilization trends toward 100%', () => {
    // High utilization + high growth rate should trigger exhaustion
    const nodes = [createMockNode('n1', 'High Util Node', 10, 8)]; // 80%
    const config: ServiceForecastConfig = {
      ...baseConfig,
      growthRate: 0.30, // 30% growth
    };
    const forecaster = new NodeCapacityForecaster(() => nodes, () => [], config);
    const results = forecaster.forecastAll();

    expect(results[0].exhaustionDate).toBeDefined();
    expect(new Date(results[0].exhaustionDate!).getTime()).toBeGreaterThan(
      new Date('2026-01-01').getTime(),
    );
  });

  it('does not set exhaustion date for low utilization', () => {
    const nodes = [createMockNode('n1', 'Low Util Node', 100, 5)]; // 5%
    const config: ServiceForecastConfig = {
      ...baseConfig,
      growthRate: 0.05, // low growth
      period: {
        startDate: '2026-01-01',
        endDate: '2028-01-01',
        interval: 'yearly',
      },
    };
    const forecaster = new NodeCapacityForecaster(() => nodes, () => [], config);
    const results = forecaster.forecastAll();

    // With only 5% utilization and low growth over 2 years, shouldn't hit 100%
    expect(results[0].exhaustionDate).toBeUndefined();
  });

  it('handles nodes with zero ports', () => {
    const nodes = [createMockNode('n1', 'Empty Node', 0, 0)];
    const forecaster = new NodeCapacityForecaster(() => nodes, () => [], baseConfig);
    const results = forecaster.forecastAll();

    expect(results.length).toBe(1);
    expect(results[0].currentUtilization).toBe(0);
  });

  it('generates recommendations for high utilization', () => {
    const nodes = [createMockNode('n1', 'Full Node', 10, 9)]; // 90%
    const forecaster = new NodeCapacityForecaster(() => nodes, () => [], baseConfig);
    const results = forecaster.forecastAll();

    expect(results[0].recommendations.length).toBeGreaterThan(0);
    expect(results[0].recommendations.some((r) => r.includes('90%'))).toBe(true);
  });

  it('handles empty nodes list', () => {
    const forecaster = new NodeCapacityForecaster(() => [], () => [], baseConfig);
    const results = forecaster.forecastAll();
    expect(results).toEqual([]);
  });
});
