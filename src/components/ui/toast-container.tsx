/**
 * ToastContainer - Renders toast notifications from uiStore
 *
 * Displays toasts in the bottom-right corner with animation.
 * Supports success, error, warning, and info types.
 */

import * as React from 'react';
import { useUIStore } from '@/stores/uiStore';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Toast } from '@/types/ui';

const toastConfig = {
  success: {
    icon: CheckCircle,
    iconClass: 'text-success',
    bgClass: 'bg-success/10',
    borderClass: 'border-success/30',
  },
  error: {
    icon: XCircle,
    iconClass: 'text-danger',
    bgClass: 'bg-danger/10',
    borderClass: 'border-danger/30',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-warning',
    bgClass: 'bg-warning/10',
    borderClass: 'border-warning/30',
  },
  info: {
    icon: Info,
    iconClass: 'text-accent',
    bgClass: 'bg-accent/10',
    borderClass: 'border-accent/30',
  },
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const config = toastConfig[toast.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg',
        'bg-elevated backdrop-blur-sm',
        'animate-in slide-in-from-right-full fade-in duration-300',
        config.borderClass
      )}
      role="alert"
    >
      <div className={cn('p-1 rounded', config.bgClass)}>
        <Icon className={cn('w-4 h-4', config.iconClass)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{toast.title}</p>
        {toast.message && (
          <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5 text-text-muted" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const toasts = useUIStore((state) => state.toasts);
  const removeToast = useUIStore((state) => state.removeToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-toast flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
};

export default ToastContainer;
