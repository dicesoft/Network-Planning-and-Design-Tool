import React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

// ============================================================================
// TYPES
// ============================================================================

export interface StatCardProps {
  title: string;
  value: string | number;
  subLabel?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'accent-top';
  progress?: {
    value: number;
    variant?: 'auto' | 'success' | 'warning' | 'danger';
  };
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subLabel,
  icon,
  variant = 'default',
  progress,
  className,
}) => {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-elevated p-4',
        variant === 'accent-top' && 'border-t-2 border-t-accent',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tertiary">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-tertiary">{title}</p>
          <p className="text-lg font-semibold text-text-primary">{value}</p>
          {subLabel && (
            <p className="text-xs text-text-muted">{subLabel}</p>
          )}
        </div>
      </div>
      {progress && (
        <div className="mt-3">
          <Progress
            value={progress.value}
            variant={progress.variant ?? 'auto'}
            size="sm"
            showLabel
          />
        </div>
      )}
    </div>
  );
};
