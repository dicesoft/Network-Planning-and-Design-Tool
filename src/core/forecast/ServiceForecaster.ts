/**
 * ServiceForecaster — Projects total service count and per-type breakdown
 *
 * Uses the current service count as the starting value and applies the
 * configured growth model to project future service counts.
 */

import type { Service, ServiceType } from '@/types/service';
import type {
  ServiceForecastConfig,
  ForecastDataPoint,
} from '@/types/forecast';
import {
  linearForecast,
  compoundGrowthForecast,
  saturationForecast,
  generateDates,
} from './GrowthModels';

// ============================================================================
// SERVICE FORECASTER
// ============================================================================

export class ServiceForecaster {
  private getServices: () => Service[];
  private config: ServiceForecastConfig;

  constructor(
    getServices: () => Service[],
    config: ServiceForecastConfig,
  ) {
    this.getServices = getServices;
    this.config = config;
  }

  /** Get current filtered service count */
  getCurrentCount(): number {
    return this.filteredServices().length;
  }

  /** Project total service count over time */
  forecast(): ForecastDataPoint[] {
    const services = this.filteredServices();
    const currentCount = services.length;
    return this.applyModel(currentCount);
  }

  /** Project by service type */
  forecastByType(): Partial<Record<ServiceType, ForecastDataPoint[]>> {
    const services = this.getServices();
    const types: ServiceType[] = ['l1-dwdm', 'l2-ethernet', 'l3-ip'];
    const result: Partial<Record<ServiceType, ForecastDataPoint[]>> = {};

    for (const type of types) {
      const count = services.filter((s) => s.type === type).length;
      if (count > 0) {
        result[type] = this.applyModel(count);
      }
    }

    return result;
  }

  private filteredServices(): Service[] {
    const services = this.getServices();
    if (this.config.serviceTypeFilter) {
      return services.filter((s) => s.type === this.config.serviceTypeFilter);
    }
    return services;
  }

  private applyModel(currentValue: number): ForecastDataPoint[] {
    const { method, period } = this.config;
    const startDate = period.startDate;
    const endDate = period.endDate;
    const years = this.yearsBetween(startDate, endDate);
    const dates = generateDates(startDate, years, period.interval);

    switch (method) {
      case 'linear': {
        const historicalData = this.config.historicalData;
        if (historicalData && historicalData.length > 0) {
          // Use historical data for regression
          const xyData = historicalData.map((dp, i) => ({ x: i, y: dp.value }));
          const futureX = dates.map((_, i) => xyData.length + i);
          const projected = linearForecast(xyData, futureX);
          return projected.map((p, i) => ({
            date: dates[i],
            value: Math.max(0, Math.round(p.y)),
            confidence: {
              lower: Math.max(0, Math.round(p.confidence.lower)),
              upper: Math.round(p.confidence.upper),
            },
          }));
        }
        // No historical data: flat projection from current value
        return dates.map((date) => ({
          date,
          value: currentValue,
        }));
      }

      case 'compound-growth': {
        const growthRate = this.config.growthRate ?? 0.1;
        const projected = compoundGrowthForecast(currentValue, growthRate, years, period.interval);
        return projected.slice(0, dates.length).map((p, i) => ({
          date: dates[i],
          value: Math.round(p.value),
          confidence: {
            lower: Math.round(p.confidence.lower),
            upper: Math.round(p.confidence.upper),
          },
        }));
      }

      case 'saturation': {
        const growthRate = this.config.growthRate ?? 0.5;
        // For services, capacity is somewhat arbitrary — use 10x current as default
        const capacity = Math.max(currentValue * 10, 100);
        const projected = saturationForecast(currentValue, capacity, growthRate, years, period.interval);
        return projected.slice(0, dates.length).map((p, i) => ({
          date: dates[i],
          value: Math.round(p.value),
          confidence: {
            lower: Math.round(p.confidence.lower),
            upper: Math.round(p.confidence.upper),
          },
        }));
      }
    }
  }

  private yearsBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    return Math.max(diffMs / (365.25 * 24 * 60 * 60 * 1000), 0);
  }
}
