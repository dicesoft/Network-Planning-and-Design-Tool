import React from 'react';
import { cn } from '@/lib/utils';

function getUtilizationColor(percent: number): string {
  if (percent > 80) return 'text-danger';
  if (percent >= 50) return 'text-warning';
  return 'text-success';
}

interface QuickStatRowProps {
  label: string;
  value: string | number;
  valueColor?: string;
}

const QuickStatRow: React.FC<QuickStatRowProps> = ({ label, value, valueColor }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-text-tertiary">{label}</span>
    <span className={cn('text-sm font-medium text-text-primary', valueColor)}>{value}</span>
  </div>
);

interface QuickStatsPanelProps {
  avgUtilization: number;
  activeServiceCount: number;
  plannedServiceCount: number;
  edgesAbove80: number;
  edgesAtZero: number;
}

export const QuickStatsPanel: React.FC<QuickStatsPanelProps> = ({
  avgUtilization,
  activeServiceCount,
  plannedServiceCount,
  edgesAbove80,
  edgesAtZero,
}) => {
  return (
    <div className="rounded-lg border border-border bg-elevated">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">Quick Stats</h3>
      </div>
      <div className="space-y-3 p-4">
        <QuickStatRow
          label="Avg utilization"
          value={`${avgUtilization}%`}
          valueColor={getUtilizationColor(avgUtilization)}
        />
        <QuickStatRow
          label="Active services"
          value={activeServiceCount}
          valueColor="text-accent"
        />
        <QuickStatRow
          label="Planned services"
          value={plannedServiceCount}
          valueColor="text-info"
        />
        <QuickStatRow
          label="Edges at >80%"
          value={edgesAbove80}
          valueColor={edgesAbove80 > 0 ? 'text-danger' : undefined}
        />
        <QuickStatRow
          label="Edges at 0%"
          value={edgesAtZero}
        />
      </div>
    </div>
  );
};
