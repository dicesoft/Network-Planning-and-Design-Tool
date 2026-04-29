/**
 * ForecastEngine — Orchestrator for capacity forecasting
 *
 * Reads current state from provided data sources, applies the selected
 * growth model, and returns a complete ForecastResult.
 */

import type { NetworkNode, NetworkEdge } from '@/types/network';
import type { Service } from '@/types/service';
import type {
  ServiceForecastConfig,
  ForecastResult,
  ForecastType,
} from '@/types/forecast';
import { ServiceForecaster } from './ServiceForecaster';
import { NodeCapacityForecaster } from './NodeCapacityForecaster';
import { LambdaForecaster } from './LambdaForecaster';

// ============================================================================
// DATA PROVIDER INTERFACE
// ============================================================================

export interface ForecastDataProvider {
  getNodes: () => NetworkNode[];
  getEdges: () => NetworkEdge[];
  getServices: () => Service[];
}

// ============================================================================
// FORECAST ENGINE
// ============================================================================

let forecastIdCounter = 0;

export class ForecastEngine {
  private provider: ForecastDataProvider;

  constructor(provider: ForecastDataProvider) {
    this.provider = provider;
  }

  /**
   * Run a forecast of the specified type with the given configuration.
   */
  run(type: ForecastType, config: ServiceForecastConfig): ForecastResult {
    const id = `forecast-${Date.now()}-${++forecastIdCounter}`;
    const result: ForecastResult = {
      id,
      createdAt: new Date().toISOString(),
      config,
    };

    switch (type) {
      case 'service':
        result.serviceForecast = this.runServiceForecast(config);
        break;
      case 'node':
        result.nodeForecasts = this.runNodeForecast(config);
        break;
      case 'lambda':
        result.lambdaForecasts = this.runLambdaForecast(config);
        break;
    }

    return result;
  }

  private runServiceForecast(config: ServiceForecastConfig) {
    const forecaster = new ServiceForecaster(
      this.provider.getServices,
      config,
    );
    return {
      currentCount: forecaster.getCurrentCount(),
      forecastPoints: forecaster.forecast(),
      byType: forecaster.forecastByType(),
    };
  }

  private runNodeForecast(config: ServiceForecastConfig) {
    const forecaster = new NodeCapacityForecaster(
      this.provider.getNodes,
      this.provider.getServices,
      config,
    );
    return forecaster.forecastAll();
  }

  private runLambdaForecast(config: ServiceForecastConfig) {
    const forecaster = new LambdaForecaster(
      this.provider.getNodes,
      this.provider.getEdges,
      this.provider.getServices,
      config,
    );
    return {
      perSection: forecaster.forecastPerSection(),
    };
  }
}
