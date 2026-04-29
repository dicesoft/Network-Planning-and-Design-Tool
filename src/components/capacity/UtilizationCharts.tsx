import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { EdgeUtilization } from '@/core/services/CapacityTracker';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface UtilizationChartsProps {
  edgeUtilizations: EdgeUtilization[];
  getEdgeEndpoints: (edgeId: string) => { source: string; target: string } | null;
}

interface HistogramBin {
  range: string;
  count: number;
  fill: string;
}

interface BusiestEdge {
  label: string;
  percentage: number;
}

interface BandDistribution {
  label: string;
  count: number;
  percent: number;
  color: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function getBinColor(rangeStart: number): string {
  if (rangeStart >= 80) return 'var(--color-danger, #ef4444)';
  if (rangeStart >= 60) return 'var(--color-warning, #f59e0b)';
  return 'var(--color-success, #10b981)';
}

function getBarBgClass(percent: number): string {
  if (percent > 80) return 'bg-danger';
  if (percent >= 50) return 'bg-warning';
  return 'bg-success';
}

function getBarTextClass(percent: number): string {
  if (percent > 80) return 'text-danger';
  if (percent >= 50) return 'text-warning';
  return 'text-success';
}

// ============================================================================
// COMPONENT
// ============================================================================

export const UtilizationCharts: React.FC<UtilizationChartsProps> = ({
  edgeUtilizations,
  getEdgeEndpoints,
}) => {
  // Histogram bins
  const histogramData = useMemo((): HistogramBin[] => {
    const bins: HistogramBin[] = [
      { range: '0-20%', count: 0, fill: getBinColor(0) },
      { range: '21-40%', count: 0, fill: getBinColor(20) },
      { range: '41-60%', count: 0, fill: getBinColor(40) },
      { range: '61-80%', count: 0, fill: getBinColor(60) },
      { range: '81-100%', count: 0, fill: getBinColor(80) },
    ];

    for (const eu of edgeUtilizations) {
      if (eu.percentage <= 20) bins[0].count++;
      else if (eu.percentage <= 40) bins[1].count++;
      else if (eu.percentage <= 60) bins[2].count++;
      else if (eu.percentage <= 80) bins[3].count++;
      else bins[4].count++;
    }

    return bins;
  }, [edgeUtilizations]);

  // Band distribution for stacked bar (0-25%, 25-50%, 50-75%, 75-100%)
  const bandDistribution = useMemo((): BandDistribution[] => {
    const bands = [
      { label: '0-25%', count: 0, color: 'var(--color-success, #10b981)' },
      { label: '25-50%', count: 0, color: 'var(--color-info, #3b82f6)' },
      { label: '50-75%', count: 0, color: 'var(--color-warning, #f59e0b)' },
      { label: '75-100%', count: 0, color: 'var(--color-danger, #ef4444)' },
    ];

    for (const eu of edgeUtilizations) {
      if (eu.percentage <= 25) bands[0].count++;
      else if (eu.percentage <= 50) bands[1].count++;
      else if (eu.percentage <= 75) bands[2].count++;
      else bands[3].count++;
    }

    const total = edgeUtilizations.length;
    return bands.map((b) => ({
      ...b,
      percent: total > 0 ? Math.round((b.count / total) * 100) : 0,
    }));
  }, [edgeUtilizations]);

  // Top 5 busiest edges
  const topEdges = useMemo((): BusiestEdge[] => {
    const sorted = [...edgeUtilizations].sort((a, b) => b.percentage - a.percentage);
    return sorted.slice(0, 5).map((eu) => {
      const endpoints = getEdgeEndpoints(eu.edgeId);
      return {
        label: endpoints ? `${endpoints.source} - ${endpoints.target}` : eu.edgeId.slice(0, 10),
        percentage: eu.percentage,
      };
    });
  }, [edgeUtilizations, getEdgeEndpoints]);

  if (edgeUtilizations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Utilization Distribution Histogram */}
      <div className="rounded-lg border border-border bg-elevated">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Utilization Distribution</h3>
        </div>
        <div className="p-3">
          <div style={{ minWidth: 200 }}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={histogramData} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #374151)" />
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 10, fill: 'var(--color-text-muted, #64748b)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--color-text-muted, #64748b)' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-elevated, #1f2937)',
                    border: '1px solid var(--color-border, #374151)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: 'var(--color-text-primary, #f8fafc)',
                  }}
                  formatter={(value) => [`${value} edges`, 'Count']}
                />
                <Bar
                  dataKey="count"
                  radius={[3, 3, 0, 0]}
                  fill="var(--color-accent, #6366f1)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Utilization Band Distribution - Horizontal stacked bar */}
      <div className="rounded-lg border border-border bg-elevated">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Utilization Bands</h3>
        </div>
        <div className="space-y-2 p-3">
          {/* Stacked bar */}
          <div className="flex h-5 overflow-hidden rounded-full bg-tertiary">
            {bandDistribution.map(
              (band) =>
                band.percent > 0 && (
                  <div
                    key={band.label}
                    className="h-full transition-all"
                    style={{
                      width: `${band.percent}%`,
                      backgroundColor: band.color,
                    }}
                    title={`${band.label}: ${band.count} edge${band.count !== 1 ? 's' : ''} (${band.percent}%)`}
                  />
                ),
            )}
          </div>
          {/* Legend */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {bandDistribution.map((band) => (
              <div key={band.label} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: band.color }}
                />
                <span className="truncate">{band.label}</span>
                <span className="ml-auto font-medium text-text-primary">{band.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top 5 Busiest Edges - CSS bars */}
      {topEdges.length > 0 && (
        <div className="rounded-lg border border-border bg-elevated">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-text-primary">Top 5 Busiest Edges</h3>
          </div>
          <div className="space-y-2.5 p-3">
            {topEdges.map((edge, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="truncate text-xs text-text-secondary">{edge.label}</span>
                  <span className={cn('text-xs font-medium', getBarTextClass(edge.percentage))}>
                    {edge.percentage}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-tertiary">
                  <div
                    className={cn('h-full rounded-full transition-all', getBarBgClass(edge.percentage))}
                    style={{ width: `${Math.min(edge.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
