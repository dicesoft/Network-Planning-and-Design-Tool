import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Modal Template - Standard Layout Pattern
 *
 * Usage:
 * <ModalTemplate
 *   open={isOpen}
 *   title="Modal Title"
 *   description="Optional description"
 *   size="md"
 *   onSubmit={handleSubmit}
 *   onClose={handleClose}
 *   submitLabel="Confirm"
 *   cancelLabel="Cancel"
 * >
 *   <ModalTemplate.Section title="Section 1">
 *     {form fields}
 *   </ModalTemplate.Section>
 *   <ModalTemplate.Grid cols={2}>
 *     {2-column layout}
 *   </ModalTemplate.Grid>
 * </ModalTemplate>
 */

// Size mappings for responsive width
const sizeClasses = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[500px] md:max-w-[550px]',
  lg: 'sm:max-w-[550px] md:max-w-[650px]',
  xl: 'sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]',
};

interface ModalTemplateProps {
  open: boolean;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onSubmit?: (e: React.FormEvent) => void;
  onClose: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

const ModalTemplateRoot: React.FC<ModalTemplateProps> = ({
  open,
  title,
  description,
  size = 'md',
  onSubmit,
  onClose,
  submitLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isLoading = false,
  children,
  className,
  'data-testid': testId,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(e);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          sizeClasses[size],
          'animate-bounce-in',
          className
        )}
        data-testid={testId}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-6">{children}</div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Loading...' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Section subcomponent
interface SectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const Section: React.FC<SectionProps> = ({ title, children, className }) => {
  return (
    <div className={cn('space-y-3', className)}>
      {title && (
        <label className="block text-sm font-medium text-text-secondary">{title}</label>
      )}
      {children}
    </div>
  );
};

// Grid subcomponent for responsive layouts
interface GridProps {
  cols?: 1 | 2 | 3 | 4 | 6;
  children: React.ReactNode;
  className?: string;
  gap?: 'sm' | 'md' | 'lg';
}

const colsClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

const gapClasses = {
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
};

const Grid: React.FC<GridProps> = ({ cols = 2, children, className, gap = 'md' }) => {
  return (
    <div className={cn('grid', colsClasses[cols], gapClasses[gap], className)}>
      {children}
    </div>
  );
};

// Divider subcomponent
interface DividerProps {
  className?: string;
}

const Divider: React.FC<DividerProps> = ({ className }) => {
  return <hr className={cn('border-border', className)} />;
};

// Compose the exported component
export const ModalTemplate = Object.assign(ModalTemplateRoot, {
  Section,
  Grid,
  Divider,
});

export type { ModalTemplateProps, SectionProps, GridProps, DividerProps };
