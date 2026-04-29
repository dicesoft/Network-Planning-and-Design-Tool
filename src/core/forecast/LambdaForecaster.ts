/**
 * LambdaForecaster — Per-edge channel usage projection
 *
 * Projects lambda (wavelength channel) usage per edge, supports end-to-end
 * path forecasting, and identifies bottleneck sections (first to exhaust).
 */

import type { NetworkNode, NetworkEdge } from '@/types/network';
import type { Service } from '@/types/service';
import { isL1DWDMService } from '@/types/service';
import type {
  ServiceForecastConfig,
  LambdaForecast,
  E2ELambdaForecast,
  ForecastDataPoint,
} from '@/types/forecast';
import {
  compoundGrowthForecast,
  saturationForecast,
  linearForecast,
  generateDates,
} from './GrowthModels';

/** Default C-band channels */
const DEFAULT_TOTAL_CHANNELS = 96;

// ============================================================================
// LAMBDA FORECASTER
// ============================================================================

export class LambdaForecaster {
  private getNodes: () => NetworkNode[];
  private getEdges: () => NetworkEdge[];
  private getServices: () => Service[];
  private config: ServiceForecastConfig;

  constructor(
    getNodes: () => NetworkNode[],
    getEdges: () => NetworkEdge[],
    getServices: () => Service[],
    config: ServiceForecastConfig,
  ) {
    this.getNodes = getNodes;
    this.getEdges = getEdges;
    this.getServices = getServices;
    this.config = config;
  }

  /** Per-edge (section) lambda forecast */
  forecastPerSection(): LambdaForecast[] {
    const edges = this.getEdges();
    const edgeUsage = this.computeEdgeUsage();

    return edges.map((edge) => {
      const used = edgeUsage.get(edge.id) ?? 0;
      const total = edge.properties?.lambdaCapacity ?? DEFAULT_TOTAL_CHANNELS;
      const edgeName = this.getEdgeName(edge);
      const forecastPoints = this.projectLambdaUsage(used, total);
      const exhaustionDate = this.findExhaustionDate(forecastPoints, total);

      return {
        sectionId: edge.id,
        sectionName: edgeName,
        currentUsed: used,
        totalCapacity: total,
        forecastPoints,
        exhaustionDate,
      };
    });
  }

  /** End-to-end forecast for a specific path */
  forecastEndToEnd(
    nodeIds: string[],
    edgeIds: string[],
  ): E2ELambdaForecast {
    const nodes = this.getNodes();
    const edges = this.getEdges();
    const edgeUsage = this.computeEdgeUsage();

    const sections: LambdaForecast[] = edgeIds.map((edgeId) => {
      const edge = edges.find((e) => e.id === edgeId);
      const used = edgeUsage.get(edgeId) ?? 0;
      const total = edge?.properties?.lambdaCapacity ?? DEFAULT_TOTAL_CHANNELS;
      const forecastPoints = this.projectLambdaUsage(used, total);
      const exhaustionDate = this.findExhaustionDate(forecastPoints, total);

      return {
        sectionId: edgeId,
        sectionName: edge ? this.getEdgeName(edge) : edgeId,
        currentUsed: used,
        totalCapacity: total,
        forecastPoints,
        exhaustionDate,
      };
    });

    // Find bottleneck: section with earliest exhaustion date
    const sectionsWithExhaustion = sections.filter((s) => s.exhaustionDate);
    sectionsWithExhaustion.sort((a, b) =>
      (a.exhaustionDate ?? '').localeCompare(b.exhaustionDate ?? ''),
    );
    const bottleneck = sectionsWithExhaustion[0];

    // Build path description from node names
    const nodeNames = nodeIds.map((nid) => {
      const n = nodes.find((nd) => nd.id === nid);
      return n?.name ?? nid.slice(0, 8);
    });
    const pathDescription = nodeNames.join(' -> ');

    return {
      pathDescription,
      nodeIds,
      edgeIds,
      sections,
      bottleneck,
    };
  }

  /** Compute current channel usage per edge from L1 services */
  private computeEdgeUsage(): Map<string, number> {
    const services = this.getServices();
    const usage = new Map<string, number>();

    for (const service of services) {
      if (!isL1DWDMService(service)) continue;

      const paths = [service.workingPath, service.protectionPath].filter(
        Boolean,
      );
      for (const path of paths) {
        if (!path) continue;
        for (const edgeId of path.edgeIds) {
          usage.set(edgeId, (usage.get(edgeId) ?? 0) + 1);
        }
      }
    }

    return usage;
  }

  /** Project lambda usage forward using the configured model */
  private projectLambdaUsage(
    currentUsed: number,
    totalCapacity: number,
  ): ForecastDataPoint[] {
    const { method, period } = this.config;
    const years = this.yearsBetween(period.startDate, period.endDate);
    const dates = generateDates(period.startDate, years, period.interval);

    switch (method) {
      case 'linear': {
        const historicalData = this.config.historicalData;
        if (historicalData && historicalData.length > 0) {
          const xyData = historicalData.map((dp, i) => ({
            x: i,
            y: dp.value,
          }));
          const futureX = dates.map((_, i) => xyData.length + i);
          const projected = linearForecast(xyData, futureX);
          return projected.map((p, i) => ({
            date: dates[i],
            value: Math.min(totalCapacity, Math.max(0, Math.round(p.y))),
            confidence: {
              lower: Math.max(0, Math.round(p.confidence.lower)),
              upper: Math.min(totalCapacity, Math.round(p.confidence.upper)),
            },
          }));
        }
        // No historical data: flat at current
        return dates.map((date) => ({
          date,
          value: currentUsed,
        }));
      }

      case 'compound-growth': {
        const growthRate = this.config.growthRate ?? 0.15;
        // Use at least 1 to project from (avoid 0 growth from 0)
        const startValue = Math.max(currentUsed, 1);
        const projected = compoundGrowthForecast(
          startValue,
          growthRate,
          years,
          period.interval,
        );
        return projected.slice(0, dates.length).map((p, i) => ({
          date: dates[i],
          value: Math.min(totalCapacity, Math.round(p.value)),
          confidence: {
            lower: Math.max(0, Math.round(p.confidence.lower)),
            upper: Math.min(totalCapacity, Math.round(p.confidence.upper)),
          },
        }));
      }

      case 'saturation': {
        const growthRate = this.config.growthRate ?? 0.5;
        const projected = saturationForecast(
          currentUsed,
          totalCapacity,
          growthRate,
          years,
          period.interval,
        );
        return projected.slice(0, dates.length).map((p, i) => ({
          date: dates[i],
          value: Math.min(totalCapacity, Math.round(p.value)),
          confidence: {
            lower: Math.max(0, Math.round(p.confidence.lower)),
            upper: Math.min(totalCapacity, Math.round(p.confidence.upper)),
          },
        }));
      }
    }
  }

  /** Find the first date when a forecast reaches the threshold */
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

  /** Get a human-readable name for an edge */
  private getEdgeName(edge: NetworkEdge): string {
    const nodes = this.getNodes();
    const src = nodes.find((n) => n.id === edge.source.nodeId);
    const tgt = nodes.find((n) => n.id === edge.target.nodeId);
    const srcName = src?.name ?? edge.source.nodeId.slice(0, 8);
    const tgtName = tgt?.name ?? edge.target.nodeId.slice(0, 8);
    return `${srcName} - ${tgtName}`;
  }

  private yearsBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    return Math.max(diffMs / (365.25 * 24 * 60 * 60 * 1000), 0);
  }
}
