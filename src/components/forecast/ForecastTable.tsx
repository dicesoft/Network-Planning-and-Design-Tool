import React from 'react';
import { cn } from '@/lib/utils';
import type { ForecastDataPoint } from '@/types/forecast';

// ============================================================================
// TYPES
// ============================================================================

interface ForecastTableProps {
  data: ForecastDataPoint[];
  startValue?: number;
  valueLabel?: string;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ForecastTable: React.FC<ForecastTableProps> = ({
  data,
  startValue,
  valueLabel = 'Value',
  className,
}) => {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-text-tertiary">
        No forecast data to display
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const baseValue = startValue ?? data[0]?.value ?? 0;

  return (
    <div className={cn('overflow-auto', className)} data-testid="forecast-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Period
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {valueLabel}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Delta
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Change %
            </th>
            {data.some((d) => d.confidence) && (
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Confidence
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((point, i) => {
            const delta = point.value - baseValue;
            const changePct = baseValue > 0
              ? ((point.value - baseValue) / baseValue) * 100
              : 0;

            return (
              <tr
                key={point.date}
                className={cn(
                  'border-b border-border/50 transition-colors hover:bg-tertiary/50',
                  i === 0 && 'bg-tertiary/30',
                )}
              >
                <td className="px-3 py-2 font-medium text-text-primary">
                  {formatDate(point.date)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-text-primary">
                  {typeof point.value === 'number' ? point.value.toLocaleString() : point.value}
                </td>
                <td className={cn(
                  'px-3 py-2 text-right font-mono',
                  delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-text-tertiary',
                )}>
                  {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                </td>
                <td className={cn(
                  'px-3 py-2 text-right font-mono text-xs',
                  changePct > 0 ? 'text-success' : changePct < 0 ? 'text-danger' : 'text-text-tertiary',
                )}>
                  {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
                </td>
                {data.some((d) => d.confidence) && (
                  <td className="px-3 py-2 text-right text-xs text-text-tertiary">
                    {point.confidence
                      ? `${point.confidence.lower.toLocaleString()} - ${point.confidence.upper.toLocaleString()}`
                      : '-'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
