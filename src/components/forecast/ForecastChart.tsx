import React, { useMemo } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  ComposedChart,
  Legend,
} from 'recharts';
import type { ForecastDataPoint } from '@/types/forecast';

// ============================================================================
// TYPES
// ============================================================================

interface ForecastChartProps {
  title: string;
  data: ForecastDataPoint[];
  historicalData?: ForecastDataPoint[];
  capacity?: number;
  yAxisLabel?: string;
  color?: string;
}

interface ChartDataPoint {
  date: string;
  historical?: number;
  forecast?: number;
  confidenceLower?: number;
  confidenceUpper?: number;
  capacity?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ForecastChart: React.FC<ForecastChartProps> = ({
  title,
  data,
  historicalData,
  capacity,
  yAxisLabel = 'Value',
  color = 'var(--color-primary, #6366f1)',
}) => {
  const chartData = useMemo(() => {
    const points: ChartDataPoint[] = [];

    // Add historical data points
    if (historicalData) {
      for (const h of historicalData) {
        points.push({
          date: h.date,
          historical: h.value,
          capacity,
        });
      }
    }

    // Add forecast data points
    for (const f of data) {
      points.push({
        date: f.date,
        forecast: f.value,
        confidenceLower: f.confidence?.lower,
        confidenceUpper: f.confidence?.upper,
        capacity,
      });
    }

    return points;
  }, [data, historicalData, capacity]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-text-tertiary">
        No forecast data to display
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  return (
    <div data-testid="forecast-chart">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e2e8f0)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: 'var(--color-text-tertiary, #94a3b8)', fontSize: 11 }}
            stroke="var(--color-border, #e2e8f0)"
          />
          <YAxis
            tick={{ fill: 'var(--color-text-tertiary, #94a3b8)', fontSize: 11 }}
            stroke="var(--color-border, #e2e8f0)"
            label={{
              value: yAxisLabel,
              angle: -90,
              position: 'insideLeft',
              fill: 'var(--color-text-tertiary, #94a3b8)',
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-elevated, #fff)',
              border: '1px solid var(--color-border, #e2e8f0)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(label) => formatDate(String(label))}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px' }}
          />

          {/* Confidence band (area between lower and upper) */}
          {chartData.some((d) => d.confidenceLower !== undefined) && (
            <>
              <Area
                type="monotone"
                dataKey="confidenceUpper"
                stroke="none"
                fill={color}
                fillOpacity={0.1}
                name="Confidence Upper"
                legendType="none"
              />
              <Area
                type="monotone"
                dataKey="confidenceLower"
                stroke="none"
                fill="var(--color-canvas, #fff)"
                fillOpacity={1}
                name="Confidence Lower"
                legendType="none"
              />
            </>
          )}

          {/* Historical (solid line) */}
          {historicalData && historicalData.length > 0 && (
            <Line
              type="monotone"
              dataKey="historical"
              stroke="var(--color-text-secondary, #64748b)"
              strokeWidth={2}
              dot={{ fill: 'var(--color-text-secondary, #64748b)', r: 3 }}
              name="Historical"
            />
          )}

          {/* Forecast (dashed line) */}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke={color}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ fill: color, r: 3 }}
            name="Forecast"
          />

          {/* Capacity line */}
          {capacity !== undefined && (
            <Line
              type="monotone"
              dataKey="capacity"
              stroke="var(--color-danger, #ef4444)"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              name="Capacity"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
