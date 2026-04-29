import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { SpectrumGrid, type ChannelState } from '@/components/capacity/SpectrumGrid';
import type { PathLambdaAnalysis, EdgeChannelDetail } from '@/core/services/LambdaAnalyzer';
import { DEFAULT_CHANNEL_RANGE } from '@/core/services/ChannelChecker';
import { getLambdaCountColor } from './lambda-utils';

// ============================================================================
// TYPES
// ============================================================================

export interface PathSpectrumViewProps {
  path: PathLambdaAnalysis;
  edgeNameMap: Map<string, string>;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a ChannelState[] array from edge channel detail
 */
function buildChannelStates(detail: EdgeChannelDetail): ChannelState[] {
  const totalChannels = DEFAULT_CHANNEL_RANGE.max - DEFAULT_CHANNEL_RANGE.min + 1;
  const availableSet = new Set(detail.availableChannels);
  const states: ChannelState[] = [];

  for (let ch = DEFAULT_CHANNEL_RANGE.min; ch < DEFAULT_CHANNEL_RANGE.min + totalChannels; ch++) {
    states.push(availableSet.has(ch) ? 'free' : 'allocated');
  }

  return states;
}

/**
 * Build the "Common E2E" channel states: channels available on ALL edges.
 * Unavailable channels are shown dimmed (allocated with reduced opacity).
 */
function buildCommonE2EStates(path: PathLambdaAnalysis): ChannelState[] {
  const totalChannels = DEFAULT_CHANNEL_RANGE.max - DEFAULT_CHANNEL_RANGE.min + 1;
  const commonSet = new Set(path.availableLambdas);
  const states: ChannelState[] = [];

  for (let ch = DEFAULT_CHANNEL_RANGE.min; ch < DEFAULT_CHANNEL_RANGE.min + totalChannels; ch++) {
    states.push(commonSet.has(ch) ? 'free' : 'allocated');
  }

  return states;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const PathSpectrumView: React.FC<PathSpectrumViewProps> = ({
  path,
  edgeNameMap,
  className,
}) => {
  const perEdgeStates = useMemo(
    () =>
      path.perEdgeAvailability.map((detail) => ({
        edgeId: detail.edgeId,
        states: buildChannelStates(detail),
        freeCount: detail.availableChannels.length,
        totalChannels: detail.totalChannels,
      })),
    [path.perEdgeAvailability]
  );

  const commonE2EStates = useMemo(() => buildCommonE2EStates(path), [path]);
  const commonFreeCount = path.availableLambdaCount;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Single shared scroll container for all spectrum rows */}
      <div className="max-h-80 overflow-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: 'minmax(7rem, max-content) 1fr' }}
        >
          {/* Per-edge spectrum rows */}
          {perEdgeStates.map((edge) => (
            <React.Fragment key={edge.edgeId}>
              {/* Label column — sticky left so it stays visible on horizontal scroll */}
              <div className="sticky left-0 z-10 flex items-center border-b border-border bg-canvas py-2 pr-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-text-primary" title={edgeNameMap.get(edge.edgeId) || edge.edgeId}>
                    {edgeNameMap.get(edge.edgeId) || edge.edgeId.slice(0, 12)}
                  </div>
                  <div
                    className={cn(
                      'text-[10px] font-medium',
                      getLambdaCountColor(edge.freeCount)
                    )}
                  >
                    {edge.freeCount} free
                  </div>
                </div>
              </div>
              {/* Spectrum column */}
              <div className="flex items-center border-b border-border py-2">
                <SpectrumGrid
                  channels={edge.states}
                  mode="linear"
                  compact
                  noInternalScroll
                />
              </div>
            </React.Fragment>
          ))}

          {/* Common E2E row — visually distinct */}
          <div className="sticky left-0 z-10 flex items-center rounded-bl-md border-t-2 border-border bg-elevated py-2 pr-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text-primary">
                Common E2E
              </div>
              <div
                className={cn(
                  'text-[10px] font-medium',
                  getLambdaCountColor(commonFreeCount)
                )}
              >
                {commonFreeCount} free
              </div>
            </div>
          </div>
          <div className="flex items-center rounded-br-md border-t-2 border-border bg-elevated py-2">
            <SpectrumGrid
              channels={commonE2EStates}
              mode="linear"
              compact
              noInternalScroll
            />
          </div>
        </div>
      </div>
    </div>
  );
};
