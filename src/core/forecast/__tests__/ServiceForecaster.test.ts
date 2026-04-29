import { describe, it, expect } from 'vitest';
import { ServiceForecaster } from '../ServiceForecaster';
import type { Service } from '@/types/service';
import type { ServiceForecastConfig } from '@/types/forecast';

function createMockService(id: string, type: 'l1-dwdm' | 'l2-ethernet' | 'l3-ip'): Service {
  return {
    id,
    name: `Service-${id}`,
    type,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    sourceNodeId: 'node-a',
    destinationNodeId: 'node-b',
  } as Service;
}

describe('ServiceForecaster', () => {
  const baseConfig: ServiceForecastConfig = {
    method: 'compound-growth',
    period: {
      startDate: '2026-01-01',
      endDate: '2029-01-01',
      interval: 'yearly',
    },
    growthRate: 0.10,
  };

  it('produces correct number of forecast points for compound growth', () => {
    const services = [
      createMockService('1', 'l1-dwdm'),
      createMockService('2', 'l2-ethernet'),
      createMockService('3', 'l3-ip'),
    ];
    const forecaster = new ServiceForecaster(() => services, baseConfig);
    const points = forecaster.forecast();

    // 3 years yearly = at least 4 points (may be 5 due to date rounding)
    expect(points.length).toBeGreaterThanOrEqual(4);
    expect(points[0].value).toBe(3); // current count
    // Last point should be greater (growth over 3 years)
    expect(points[points.length - 1].value).toBeGreaterThan(3);
  });

  it('separates L1/L2/L3 correctly in forecastByType', () => {
    const services = [
      createMockService('1', 'l1-dwdm'),
      createMockService('2', 'l1-dwdm'),
      createMockService('3', 'l2-ethernet'),
      createMockService('4', 'l3-ip'),
    ];
    const forecaster = new ServiceForecaster(() => services, baseConfig);
    const byType = forecaster.forecastByType();

    expect(byType['l1-dwdm']).toBeDefined();
    expect(byType['l2-ethernet']).toBeDefined();
    expect(byType['l3-ip']).toBeDefined();

    // L1 starts at 2, L2 at 1, L3 at 1
    expect(byType['l1-dwdm']![0].value).toBe(2);
    expect(byType['l2-ethernet']![0].value).toBe(1);
    expect(byType['l3-ip']![0].value).toBe(1);
  });

  it('filters by service type when configured', () => {
    const services = [
      createMockService('1', 'l1-dwdm'),
      createMockService('2', 'l2-ethernet'),
      createMockService('3', 'l3-ip'),
    ];
    const config: ServiceForecastConfig = {
      ...baseConfig,
      serviceTypeFilter: 'l1-dwdm',
    };
    const forecaster = new ServiceForecaster(() => services, config);

    expect(forecaster.getCurrentCount()).toBe(1);
    const points = forecaster.forecast();
    expect(points[0].value).toBe(1);
  });

  it('handles empty services list gracefully', () => {
    const forecaster = new ServiceForecaster(() => [], baseConfig);
    const points = forecaster.forecast();

    expect(points.length).toBeGreaterThanOrEqual(4);
    expect(points[0].value).toBe(0);
  });

  it('uses monthly interval correctly', () => {
    const services = [createMockService('1', 'l1-dwdm')];
    const config: ServiceForecastConfig = {
      ...baseConfig,
      period: {
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        interval: 'monthly',
      },
    };
    const forecaster = new ServiceForecaster(() => services, config);
    const points = forecaster.forecast();

    // 1 year * 12 months + 1 = 13
    expect(points.length).toBe(13);
  });

  it('linear method with no historical data returns flat projection', () => {
    const services = [
      createMockService('1', 'l1-dwdm'),
      createMockService('2', 'l2-ethernet'),
    ];
    const config: ServiceForecastConfig = {
      ...baseConfig,
      method: 'linear',
    };
    const forecaster = new ServiceForecaster(() => services, config);
    const points = forecaster.forecast();

    // Flat at current count
    for (const point of points) {
      expect(point.value).toBe(2);
    }
  });

  it('linear method with historical data projects forward', () => {
    const services = [
      createMockService('1', 'l1-dwdm'),
      createMockService('2', 'l2-ethernet'),
      createMockService('3', 'l3-ip'),
    ];
    const config: ServiceForecastConfig = {
      ...baseConfig,
      method: 'linear',
      historicalData: [
        { date: '2024-01-01', value: 5 },
        { date: '2025-01-01', value: 10 },
        { date: '2026-01-01', value: 15 },
      ],
    };
    const forecaster = new ServiceForecaster(() => services, config);
    const points = forecaster.forecast();

    // Linear trend: 5 per year
    // Points should be increasing
    expect(points[1].value).toBeGreaterThan(points[0].value);
  });
});
