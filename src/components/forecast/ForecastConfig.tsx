import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  BarChart3,
  Radio,
  Play,
} from 'lucide-react';
import type {
  ForecastType,
  ForecastMethod,
  ForecastInterval,
} from '@/types/forecast';

// ============================================================================
// TYPES
// ============================================================================

export interface ForecastConfigState {
  type: ForecastType;
  method: ForecastMethod;
  interval: ForecastInterval;
  startDate: string;
  endDate: string;
  growthRate: number;
}

interface ForecastConfigProps {
  config: ForecastConfigState;
  onChange: (config: ForecastConfigState) => void;
  onRun: () => void;
  isRunning?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FORECAST_TYPES: { id: ForecastType; label: string; description: string; icon: React.ElementType }[] = [
  { id: 'service', label: 'Service', description: 'Project service count growth', icon: TrendingUp },
  { id: 'node', label: 'Node Capacity', description: 'Per-node port utilization', icon: BarChart3 },
  { id: 'lambda', label: 'Lambda', description: 'Wavelength channel usage', icon: Radio },
];

const METHODS: { id: ForecastMethod; label: string; description: string }[] = [
  { id: 'linear', label: 'Linear', description: 'Least-squares regression' },
  { id: 'compound-growth', label: 'Compound Growth', description: 'CAGR-based exponential' },
  { id: 'saturation', label: 'Saturation', description: 'Logistic S-curve (capacity-limited)' },
];

const INTERVALS: { id: ForecastInterval; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const ForecastConfig: React.FC<ForecastConfigProps> = ({
  config,
  onChange,
  onRun,
  isRunning,
}) => {
  const update = (partial: Partial<ForecastConfigState>) => {
    onChange({ ...config, ...partial });
  };

  return (
    <div className="flex flex-col gap-5" data-testid="forecast-config">
      {/* Forecast Type */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Forecast Type
        </label>
        <div className="flex flex-col gap-2">
          {FORECAST_TYPES.map((ft) => {
            const Icon = ft.icon;
            const isActive = config.type === ft.id;
            return (
              <button
                key={ft.id}
                data-testid={`forecast-type-${ft.id}`}
                onClick={() => update({ type: ft.id })}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  isActive
                    ? 'border-primary/40 bg-primary/5 text-text-primary'
                    : 'border-border bg-elevated text-text-secondary hover:border-primary/20 hover:bg-tertiary',
                )}
              >
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md',
                  isActive ? 'bg-primary/10' : 'bg-tertiary',
                )}>
                  <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-text-muted')} />
                </div>
                <div>
                  <div className="text-sm font-medium">{ft.label}</div>
                  <div className="text-xs text-text-tertiary">{ft.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Method */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Method
        </label>
        <Select value={config.method} onValueChange={(v) => update({ method: v as ForecastMethod })}>
          <SelectTrigger className="h-9 text-sm" data-testid="forecast-method-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div>
                  <span className="font-medium">{m.label}</span>
                  <span className="ml-2 text-xs text-text-tertiary">{m.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Growth Rate (shown for compound-growth and saturation) */}
      {(config.method === 'compound-growth' || config.method === 'saturation') && (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Annual Growth Rate (%)
          </label>
          <Input
            type="number"
            min={1}
            max={200}
            step={1}
            value={Math.round(config.growthRate * 100)}
            onChange={(e) => update({ growthRate: Number(e.target.value) / 100 })}
            className="h-9 text-sm"
            data-testid="forecast-growth-rate"
          />
        </div>
      )}

      {/* Interval */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Interval
        </label>
        <Select value={config.interval} onValueChange={(v) => update({ interval: v as ForecastInterval })}>
          <SelectTrigger className="h-9 text-sm" data-testid="forecast-interval-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERVALS.map((i) => (
              <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Period */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Start Date
          </label>
          <Input
            type="date"
            value={config.startDate}
            onChange={(e) => update({ startDate: e.target.value })}
            className="h-9 text-sm"
            data-testid="forecast-start-date"
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            End Date
          </label>
          <Input
            type="date"
            value={config.endDate}
            onChange={(e) => update({ endDate: e.target.value })}
            className="h-9 text-sm"
            data-testid="forecast-end-date"
          />
        </div>
      </div>

      {/* Run Button */}
      <Button
        onClick={onRun}
        disabled={isRunning}
        className="mt-2 w-full"
        data-testid="forecast-run-btn"
      >
        <Play className="mr-2 h-4 w-4" />
        {isRunning ? 'Running...' : 'Run Forecast'}
      </Button>
    </div>
  );
};
