/**
 * ConfirmDialog - Generic confirmation dialog component
 *
 * Replaces browser confirm() with a styled, accessible modal dialog.
 * Supports destructive variant for delete confirmations.
 */

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive' | 'warning';
  onConfirm: () => void;
  onCancel?: () => void;
}

const variantConfig = {
  default: {
    icon: HelpCircle,
    iconClass: 'text-accent',
    bgClass: 'bg-accent/10',
  },
  destructive: {
    icon: Trash2,
    iconClass: 'text-danger',
    bgClass: 'bg-danger/10',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-warning',
    bgClass: 'bg-warning/10',
  },
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}) => {
  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" hideClose>
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className={cn('p-2 rounded-lg', config.bgClass)}>
              <Icon className={cn('w-5 h-5', config.iconClass)} />
            </div>
            <div className="flex-1 pt-0.5">
              <DialogTitle>{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-2">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        {details && details.length > 0 && (
          <div className="px-6 py-3">
            <ul className="bg-secondary/30 space-y-1.5 rounded-lg border border-border p-3 text-sm text-text-secondary">
              {details.map((detail, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="mt-0.5 text-text-muted">•</span>
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'accent'}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmDialog;
