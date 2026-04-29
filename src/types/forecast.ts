/**
 * Forecasting Tool Types
 *
 * Defines types for network capacity forecasting including growth models,
 * service projections, node capacity, and lambda (wavelength) forecasts.
 */

import type { ServiceType } from './service';

// ============================================================================
// CORE FORECAST TYPES
// ============================================================================

/** Forecasting method */
export type ForecastMethod =
  | 'linear'           // Linear regression (least-squares)
  | 'compound-growth'  // CAGR-based exponential
  | 'saturation';      // Logistic S-curve (approaches capacity asymptotically)

/** Forecast time interval */
export type ForecastInterval = 'monthly' | 'quarterly' | 'yearly';

/** Forecast type selector */
export type ForecastType = 'service' | 'node' | 'lambda';

/** Forecast time period configuration */
export interface ForecastPeriod {
  /** Start date (ISO 8601) */
  startDate: string;
  /** End date (ISO 8601) */
  endDate: string;
  /** Sampling interval */
  interval: ForecastInterval;
}

/** A single data point in a forecast series */
export interface ForecastDataPoint {
  date: string;
  value: number;
  confidence?: { lower: number; upper: number };
}

/** Historical reference data point */
export interface HistoricalDataPoint {
  date: string;
  value: number;
  source?: string; // 'measured' | 'estimated' | 'imported'
}

// ============================================================================
// FORECAST CONFIGURATION
// ============================================================================

/** Service forecast configuration */
export interface ServiceForecastConfig {
  method: ForecastMethod;
  period: ForecastPeriod;
  /** Growth rate per year (for compound-growth and saturation) as decimal, e.g. 0.15 = 15% */
  growthRate?: number;
  /** Service type filter (undefined = all types) */
  serviceTypeFilter?: ServiceType;
  /** Historical data for linear regression */
  historicalData?: HistoricalDataPoint[];
}

// ============================================================================
// FORECAST RESULTS
// ============================================================================

/** Node capacity forecast result */
export interface NodeCapacityForecast {
  nodeId: string;
  nodeName: string;
  currentUtilization: number;
  forecastPoints: ForecastDataPoint[];
  /** ISO date when utilization reaches 100% */
  exhaustionDate?: string;
  recommendations: string[];
}

/** Lambda (wavelength) forecast per section */
export interface LambdaForecast {
  /** Edge ID */
  sectionId: string;
  sectionName: string;
  currentUsed: number;
  totalCapacity: number;
  forecastPoints: ForecastDataPoint[];
  /** ISO date when capacity exhausts */
  exhaustionDate?: string;
}

/** End-to-end lambda forecast for a path */
export interface E2ELambdaForecast {
  pathDescription: string;
  nodeIds: string[];
  edgeIds: string[];
  sections: LambdaForecast[];
  /** Bottleneck section (first to exhaust) */
  bottleneck?: LambdaForecast;
}

/** Complete forecast result */
export interface ForecastResult {
  id: string;
  createdAt: string;
  config: ServiceForecastConfig;
  serviceForecast?: {
    currentCount: number;
    forecastPoints: ForecastDataPoint[];
    byType: Partial<Record<ServiceType, ForecastDataPoint[]>>;
  };
  nodeForecasts?: NodeCapacityForecast[];
  lambdaForecasts?: {
    perSection: LambdaForecast[];
    endToEnd?: E2ELambdaForecast[];
  };
}
