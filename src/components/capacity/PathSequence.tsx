import React from 'react';
import { cn } from '@/lib/utils';

export interface PathSequenceProps {
  nodes: { id: string; label: string }[];
  highlightIndex?: number;
  compact?: boolean;
  className?: string;
}

/**
 * Renders a node path sequence as badges with arrows:
 * "NYC > CHI > DEN > LAX"
 */
export const PathSequence: React.FC<PathSequenceProps> = ({
  nodes,
  highlightIndex,
  compact = false,
  className,
}) => {
  if (nodes.length === 0) {
    return (
      <span className="text-xs italic text-text-muted">No path</span>
    );
  }

  return (
    <div
      className={cn('flex flex-wrap items-center gap-1', className)}
      aria-label={`Path: ${nodes.map((n) => n.label).join(' to ')}`}
    >
      {nodes.map((node, i) => (
        <React.Fragment key={node.id + '-' + i}>
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono',
              compact ? 'text-[10px]' : 'text-xs',
              highlightIndex === i
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-tertiary text-text-secondary',
            )}
          >
            {node.label}
          </span>
          {i < nodes.length - 1 && (
            <span className="select-none text-xs text-text-muted">&gt;</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
