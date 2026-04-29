/**
 * NodeCapacityForecaster — Per-node utilization projection with exhaustion dates
 *
 * Uses current port utilization as the starting value and projects forward
 * using the configured growth model to estimate when nodes will reach capacity.
 */

import type { NetworkNode } from '@/types/network';
import type { Service } from '@/types/service';
import type {
  ServiceForecastConfig,
  NodeCapacityForecast,
  ForecastDataPoint,
} from '@/types/forecast';
import {
  compoundGrowthForecast,
  saturationForecast,
  linearForecast,
  generateDates,
} from './GrowthModels';

// ============================================================================
// NODE CAPACITY FORECASTER
// ============================================================================

export class NodeCapacityForecaster {
  private getNodes: () => NetworkNode[];
  private config: ServiceForecastConfig;

  constructor(
    getNodes: () => NetworkNode[],
    _getServices: () => Service[],
    config: ServiceForecastConfig,
  ) {
    this.getNodes = getNodes;
    this.config = config;
  }

  /** Forecast all nodes */
  forecastAll(): NodeCapacityForecast[] {
    const nodes = this.getNodes();
    return nodes.map((node) => this.forecastNode(node));
  }

  /** Forecast a single node */
  private forecastNode(node: NetworkNode): NodeCapacityForecast {
    const totalPorts = (node.ports || []).length;
    const usedPorts = (node.ports || []).filter(
      (p) => p.status === 'used' || p.connectedEdgeId,
    ).length;

    const currentUtilization = totalPorts > 0
      ? (usedPorts / totalPorts) * 100
      : 0;

    const forecastPoints = this.projectUtilization(currentUtilization, 100);
    const exhaustionDate = this.findExhaustionDate(forecastPoints, 100);
    const recommendations = this.generateRecommendations(
      node,
      currentUtilization,
      exhaustionDate,
    );

    return {
      nodeId: node.id,
      nodeName: node.name,
      currentUtilization: Math.round(currentUtilization * 10) / 10,
      forecastPoints,
      exhaustionDate,
      recommendations,
    };
  }

  /** Project utilization using the configured model */
  private projectUtilization(
    currentUtil: number,
    capacity: number,
  ): ForecastDataPoint[] {
    const { method, period } = this.config;
    const years = this.yearsBetween(period.startDate, period.endDate);
    const dates = generateDates(period.startDate, years, period.interval);

    switch (method) {
      case 'linear': {
        const historicalData = this.config.historicalData;
        if (historicalData && historicalData.length > 0) {
          const xyData = historicalData.map((dp, i) => ({ x: i, y: dp.value }));
          const futureX = dates.map((_, i) => xyData.length + i);
          const projected = linearForecast(xyData, futureX);
          return projected.map((p, i) => ({
            date: dates[i],
            value: Math.min(capacity, Math.max(0, Math.round(p.y * 10) / 10)),
            confidence: {
              lower: Math.max(0, Math.round(p.confidence.lower * 10) / 10),
              upper: Math.min(capacity, Math.round(p.confidence.upper * 10) / 10),
            },
          }));
        }
        // No historical data: flat at current
        return dates.map((date) => ({
          date,
          value: Math.round(currentUtil * 10) / 10,
        }));
      }

      case 'compound-growth': {
        const growthRate = this.config.growthRate ?? 0.1;
        const projected = compoundGrowthForecast(
          currentUtil,
          growthRate,
          years,
          period.interval,
        );
        return projected.slice(0, dates.length).map((p, i) => ({
          date: dates[i],
          value: Math.min(capacity, Math.round(p.value * 10) / 10),
          confidence: {
            lower: Math.max(0, Math.round(p.confidence.lower * 10) / 10),
            upper: Math.min(capacity, Math.round(p.confidence.upper * 10) / 10),
          },
        }));
      }

      case 'saturation': {
        const growthRate = this.config.growthRate ?? 0.5;
        const projected = saturationForecast(
          currentUtil,
          capacity,
          growthRate,
          years,
          period.interval,
        );
        return projected.slice(0, dates.length).map((p, i) => ({
          date: dates[i],
          value: Math.round(p.value * 10) / 10,
          confidence: {
            lower: Math.round(p.confidence.lower * 10) / 10,
            upper: Math.round(p.confidence.upper * 10) / 10,
          },
        }));
      }
    }
  }

  /** Find the first date when a forecast point reaches or exceeds the threshold */
  private findExhaustionDate(
    points: ForecastDataPoint[],
    threshold: number,
  ): string | undefined {
    for (const point of points) {
      if (point.value >= threshold) {
        return point.date;
      }
    }
    return undefined;
  }

  /** Generate recommendations based on current and projected utilization */
  private generateRecommendations(
    node: NetworkNode,
    currentUtil: number,
    exhaustionDate?: string,
  ): string[] {
    const recommendations: string[] = [];

    if (currentUtil >= 90) {
      recommendations.push(
        `Node "${node.name}" is at ${Math.round(currentUtil)}% utilization — consider adding capacity immediately.`,
      );
    } else if (currentUtil >= 70) {
      recommendations.push(
        `Node "${node.name}" is at ${Math.round(currentUtil)}% utilization — plan capacity expansion.`,
      );
    }

    if (exhaustionDate) {
      const exhaustionMs = new Date(exhaustionDate).getTime();
      const nowMs = Date.now();
      const monthsUntil = Math.round(
        (exhaustionMs - nowMs) / (30.44 * 24 * 60 * 60 * 1000),
      );
      if (monthsUntil <= 6) {
        recommendations.push(
          `Capacity exhaustion projected within ${monthsUntil} months (${exhaustionDate}).`,
        );
      } else if (monthsUntil <= 12) {
        recommendations.push(
          `Capacity exhaustion projected within ${monthsUntil} months — start planning expansion.`,
        );
      }
    }

    return recommendations;
  }

  private yearsBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    return Math.max(diffMs / (365.25 * 24 * 60 * 60 * 1000), 0);
  }
}
