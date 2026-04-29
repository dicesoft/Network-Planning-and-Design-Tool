import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon: Icon, title, description, actionLabel, onAction, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center gap-3 py-16 text-center',
          className
        )}
        {...props}
      >
        {Icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-tertiary">
            <Icon className="h-6 w-6 text-text-muted" />
          </div>
        )}
        <div className="max-w-sm">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {description}
            </p>
          )}
        </div>
        {actionLabel && onAction && (
          <Button variant="outline" size="sm" onClick={onAction} className="mt-1">
            {actionLabel}
          </Button>
        )}
      </div>
    );
  }
);
EmptyState.displayName = 'EmptyState';

export { EmptyState };
