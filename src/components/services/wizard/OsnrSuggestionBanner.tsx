/**
 * OsnrSuggestionBanner - Amplifier placement suggestion banner
 *
 * Shows when OSNR analysis is infeasible, with suggestions for amplifier placement
 * to improve path feasibility. Recommendation-only mode.
 */

import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Zap, MapPin, Info, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/uiStore';
import type { AmplifierSuggestion } from '@/core/optical/types';

// ============================================================================
// TYPES
// ============================================================================

export interface OsnrSuggestionBannerProps {
  suggestions: AmplifierSuggestion[];
  className?: string;
  onInsertAmplifier?: (suggestion: AmplifierSuggestion) => void;
  onInsertAll?: () => void;
  isInsertingAll?: boolean;
}

// ============================================================================
// SUGGESTION ROW
// ============================================================================

interface SuggestionRowProps {
  suggestion: AmplifierSuggestion;
  index: number;
  onLocate?: (edgeId: string) => void;
  onInsertAmplifier?: (suggestion: AmplifierSuggestion) => void;
}

const SuggestionRow: React.FC<SuggestionRowProps> = ({ suggestion, index, onLocate, onInsertAmplifier }) => (
  <div
    className="bg-secondary/50 flex items-center gap-3 rounded-md px-3 py-2 text-xs"
    data-testid={`amplifier-suggestion-${index}`}
  >
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-400">
      {index + 1}
    </div>
    <div className="min-w-0 flex-1">
      <div className="font-medium text-text-primary">
        After Span {suggestion.afterSpanIndex + 1}
      </div>
      <div className="truncate text-text-muted">{suggestion.reason}</div>
    </div>
    <div className="flex shrink-0 items-center gap-3 text-text-secondary">
      <span title="Recommended gain">
        <Zap className="mr-0.5 inline h-3 w-3 text-green-400" />
        {suggestion.recommendedGain.toFixed(1)} dB
      </span>
      <span title="Expected OSNR improvement">
        +{suggestion.osnrImprovement.toFixed(1)} dB
      </span>
      {suggestion.edgeId && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            title="Show location on canvas"
            data-testid={`suggestion-locate-${index}`}
            onClick={() => onLocate?.(suggestion.edgeId!)}
          >
            <MapPin className="mr-1 h-3 w-3" />
            Locate
          </Button>
          {onInsertAmplifier && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              title="Insert amplifier node on this edge"
              data-testid={`suggestion-insert-${index}`}
              onClick={() => onInsertAmplifier(suggestion)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Insert
            </Button>
          )}
        </>
      )}
    </div>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const OsnrSuggestionBanner: React.FC<OsnrSuggestionBannerProps> = ({
  suggestions,
  className,
  onInsertAmplifier,
  onInsertAll,
  isInsertingAll,
}) => {
  const dispatchCommand = useUIStore((s) => s.dispatchCommand);

  const handleLocate = useCallback((edgeId: string) => {
    dispatchCommand({ type: 'fitToEdge', edgeId });
  }, [dispatchCommand]);

  if (suggestions.length === 0) return null;

  const totalImprovement = suggestions.reduce(
    (sum, s) => sum + s.osnrImprovement,
    0
  );

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-3',
        className,
      )}
      data-testid="osnr-suggestion-banner"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 shrink-0 text-amber-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-400">
            Amplifier Placement Suggestions
          </p>
          <p className="text-xs text-text-muted">
            {suggestions.length} amplifier{suggestions.length > 1 ? 's' : ''} recommended
            {' '}(~{totalImprovement.toFixed(1)} dB total improvement)
          </p>
        </div>
        {suggestions.length > 1 && onInsertAll && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 border-amber-500/30 px-3 text-xs text-amber-400 hover:bg-amber-500/10"
            onClick={onInsertAll}
            disabled={isInsertingAll}
            data-testid="insert-all-amplifiers-btn"
          >
            {isInsertingAll ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3 w-3" />
            )}
            Insert All
          </Button>
        )}
      </div>

      {/* Suggestion list */}
      <div className="space-y-1.5">
        {suggestions.map((suggestion, i) => (
          <SuggestionRow key={suggestion.afterSpanIndex} suggestion={suggestion} index={i} onLocate={handleLocate} onInsertAmplifier={onInsertAmplifier} />
        ))}
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 text-[10px] text-text-muted">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          Suggestions are estimates based on current path parameters. Actual improvement
          may vary. Add amplifier nodes to the topology and re-run the analysis for
          precise results.
        </span>
      </div>
    </div>
  );
};

export default OsnrSuggestionBanner;
