/**
 * AlertDialog - Generic alert/information dialog component
 *
 * Replaces browser alert() with a styled, accessible modal dialog.
 * Supports info, warning, and error variants.
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
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  details?: string[];
  variant?: 'info' | 'warning' | 'error';
  okLabel?: string;
  onOk?: () => void;
}

const variantConfig = {
  info: {
    icon: Info,
    iconClass: 'text-accent',
    bgClass: 'bg-accent/10',
    borderClass: 'border-accent/30',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-warning',
    bgClass: 'bg-warning/10',
    borderClass: 'border-warning/30',
  },
  error: {
    icon: XCircle,
    iconClass: 'text-danger',
    bgClass: 'bg-danger/10',
    borderClass: 'border-danger/30',
  },
};

export const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  details,
  variant = 'info',
  okLabel = 'OK',
  onOk,
}) => {
  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleOk = () => {
    onOk?.();
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
            <ul className={cn(
              'space-y-1.5 text-sm text-text-secondary rounded-lg p-3 border',
              config.bgClass,
              config.borderClass
            )}>
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
          <Button variant="accent" onClick={handleOk}>
            {okLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AlertDialog;
