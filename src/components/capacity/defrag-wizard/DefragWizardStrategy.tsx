/**
 * DefragWizardStrategy - Step 2: Strategy selection
 *
 * 3 radio cards for strategy selection.
 * Auto-skipped if single edge selected (per plan).
 */

import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useDefragWizard } from './DefragWizardContext';
import type { DefragStrategy } from '@/core/services/DefragmentationEngine';
import { Layers, Maximize2, ScatterChart } from 'lucide-react';

// ============================================================================
// STRATEGY CARDS CONFIG
// ============================================================================

const STRATEGY_OPTIONS: Array<{
  value: DefragStrategy;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'minimal_moves',
    label: 'Minimal Moves',
    description: 'Fewest channel relocations. Best for minimizing service disruption during maintenance windows.',
    icon: <Layers className="h-5 w-5" />,
  },
  {
    value: 'maximize_contiguous',
    label: 'Maximize Contiguous',
    description: 'Compacts all allocations to create the largest possible free spectrum block.',
    icon: <Maximize2 className="h-5 w-5" />,
  },
  {
    value: 'balance_spectrum',
    label: 'Balance Spectrum',
    description: 'Distributes allocations evenly across the spectrum for future flexibility.',
    icon: <ScatterChart className="h-5 w-5" />,
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const DefragWizardStrategy: React.FC = () => {
  const { state, dispatch } = useDefragWizard();
  const { strategy, selectedEdgeIds } = state;

  const handleSetStrategy = useCallback(
    (s: DefragStrategy) => {
      dispatch({ type: 'SET_STRATEGY', strategy: s });
    },
    [dispatch]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          Defragmentation Strategy
        </h3>
        <span className="text-xs text-text-muted">
          {selectedEdgeIds.length} edge{selectedEdgeIds.length !== 1 ? 's' : ''} selected
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {STRATEGY_OPTIONS.map((opt) => {
          const isSelected = strategy === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSetStrategy(opt.value)}
              className={cn(
                'flex flex-col gap-2 rounded-lg border-2 p-4 text-left transition-all',
                isSelected
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-elevated hover:border-accent/50'
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    isSelected ? 'bg-accent/15 text-accent' : 'bg-tertiary text-text-secondary'
                  )}
                >
                  {opt.icon}
                </div>
                <span className="text-sm font-medium text-text-primary">{opt.label}</span>
              </div>
              <p className="text-xs leading-relaxed text-text-secondary">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
