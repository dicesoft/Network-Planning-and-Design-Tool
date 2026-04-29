import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ============================================================================
// VARIANTS
// ============================================================================

const progressVariants = cva(
  'relative overflow-hidden rounded-full bg-tertiary',
  {
    variants: {
      size: {
        sm: 'h-1.5',
        md: 'h-2.5',
        lg: 'h-4',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

const progressBarVariants = cva(
  'h-full rounded-full transition-all duration-300 ease-in-out',
  {
    variants: {
      variant: {
        auto: '',
        success: 'bg-success',
        warning: 'bg-warning',
        danger: 'bg-danger',
      },
    },
    defaultVariants: {
      variant: 'auto',
    },
  }
);

// ============================================================================
// HELPERS
// ============================================================================

function getAutoColor(value: number): string {
  if (value > 85) return 'bg-danger';
  if (value >= 60) return 'bg-warning';
  return 'bg-success';
}

function clampValue(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

// ============================================================================
// TYPES
// ============================================================================

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressVariants>,
    VariantProps<typeof progressBarVariants> {
  value: number;
  showLabel?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, variant = 'auto', size = 'md', showLabel = false, ...props }, ref) => {
    const clamped = clampValue(value);
    const autoColor = variant === 'auto' ? getAutoColor(clamped) : '';

    return (
      <div className={cn('flex items-center gap-2', showLabel && 'w-full')}>
        <div
          ref={ref}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          className={cn(progressVariants({ size }), 'flex-1', className)}
          {...props}
        >
          <div
            className={cn(
              progressBarVariants({ variant: variant === 'auto' ? 'auto' : variant }),
              autoColor,
            )}
            style={{ width: `${clamped}%` }}
          />
        </div>
        {showLabel && (
          <span className="shrink-0 text-xs font-medium text-text-secondary">
            {Math.round(clamped)}%
          </span>
        )}
      </div>
    );
  }
);
Progress.displayName = 'Progress';

export { Progress, progressVariants };
