import * as React from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';

export interface LoadingOverlayProps {
  /** Whether the overlay is visible */
  open: boolean;
  /** 0-100 progress value. Pass -1 for indeterminate. */
  progress: number;
  /** Status message shown below the progress bar */
  statusText?: string;
  /** Title shown at the top */
  title?: string;
  /** Called when the user clicks Cancel */
  onCancel?: () => void;
}

/**
 * Full-screen modal overlay with a progress bar, status text, and optional cancel button.
 * Used during large topology imports, preset loading, and batch operations.
 */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  open,
  progress,
  statusText,
  title = 'Loading...',
  onCancel,
}) => {
  if (!open) return null;

  const isIndeterminate = progress < 0;
  const clampedProgress = isIndeterminate ? 0 : Math.min(100, Math.max(0, progress));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-testid="loading-overlay"
    >
      <div className="relative w-full max-w-md rounded-lg border border-border bg-canvas p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        </div>

        {/* Progress bar */}
        {isIndeterminate ? (
          <div className="mb-3 h-2.5 overflow-hidden rounded-full bg-tertiary">
            <div className="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        ) : (
          <div className="mb-3">
            <Progress value={clampedProgress} size="md" variant="success" showLabel />
          </div>
        )}

        {/* Status text */}
        {statusText && (
          <p className="mb-4 text-xs text-text-secondary">{statusText}</p>
        )}

        {/* Cancel button */}
        {onCancel && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              data-testid="loading-overlay-cancel"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
