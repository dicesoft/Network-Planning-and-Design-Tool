/**
 * SpectrumModal Component
 * Dedicated modal for viewing and interacting with DWDM spectrum visualization
 */

import React, { useState, useMemo } from 'react';
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
import type { ChannelGridType, PortSpectrum } from '@/types/spectrum';
import {
  CHANNEL_GRID_CONFIGS,
  getChannelRange,
  getChannelDisplayInfo,
  getSlotRange,
  formatChannelLabel,
  getUserChannelRange,
} from '@/core/spectrum/channelConfig';
import { SpectrumVisualization } from './SpectrumVisualization';
import { getSpectrumUtilization } from '@/core/validation/channelValidation';
import { Radio, Info } from 'lucide-react';

interface SpectrumModalProps {
  isOpen: boolean;
  onClose: () => void;
  spectrum: PortSpectrum;
  title: string;
  subtitle?: string;
  readOnly?: boolean;
  onChannelSelect?: (channels: number[]) => void;
  onGridTypeChange?: (gridType: ChannelGridType) => void;
  onReserveChannels?: (channels: number[]) => void;
  onUnreserveChannels?: (channels: number[]) => void;
}

export const SpectrumModal: React.FC<SpectrumModalProps> = ({
  isOpen,
  onClose,
  spectrum,
  title,
  subtitle,
  readOnly = true,
  onChannelSelect,
  onGridTypeChange,
  onReserveChannels,
  onUnreserveChannels,
}) => {
  const [selectedChannels, setSelectedChannels] = useState<number[]>([]);

  // Spectrum utilization info
  const utilizationInfo = useMemo(() => {
    return getSpectrumUtilization(spectrum);
  }, [spectrum]);

  // Channel range info
  const rangeInfo = useMemo(() => {
    if (spectrum.gridType === 'flex-grid') {
      return getSlotRange();
    }
    return getUserChannelRange(spectrum.gridType as 'fixed-100ghz' | 'fixed-50ghz');
  }, [spectrum.gridType]);

  // Handle channel click
  const handleChannelClick = (channelNumber: number) => {
    if (readOnly) return;

    const newSelection = selectedChannels.includes(channelNumber)
      ? selectedChannels.filter((c) => c !== channelNumber)
      : [...selectedChannels, channelNumber];

    setSelectedChannels(newSelection);
    onChannelSelect?.(newSelection);
  };

  // Handle grid type change
  const handleGridTypeChange = (gridType: ChannelGridType) => {
    if (onGridTypeChange) {
      onGridTypeChange(gridType);
      setSelectedChannels([]); // Clear selection when grid changes
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] sm:max-w-[800px]" hideClose>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-purple-500" />
            {title}
          </DialogTitle>
          {subtitle && (
            <DialogDescription>{subtitle}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-6 px-6 py-6">
          {/* Grid Type Selector */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-text-secondary">Grid Type:</span>
            <div className="flex gap-1.5">
              {(['fixed-100ghz', 'fixed-50ghz', 'flex-grid'] as const).map((gridType) => (
                <button
                  key={gridType}
                  type="button"
                  onClick={() => onGridTypeChange && handleGridTypeChange(gridType)}
                  disabled={!onGridTypeChange}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    spectrum.gridType === gridType
                      ? 'bg-purple-500 text-white'
                      : onGridTypeChange
                        ? 'bg-tertiary text-text-secondary hover:bg-border'
                        : 'bg-tertiary text-text-muted cursor-default',
                    !onGridTypeChange && spectrum.gridType !== gridType && 'opacity-50'
                  )}
                >
                  {CHANNEL_GRID_CONFIGS[gridType].label}
                </button>
              ))}
            </div>
          </div>

          {/* Spectrum Visualization */}
          <div className="bg-tertiary/30 rounded-lg border border-border p-4">
            <SpectrumVisualization
              spectrum={spectrum}
              selectedChannels={selectedChannels}
              onChannelClick={readOnly ? undefined : handleChannelClick}
              showLabels={true}
              height={64}
            />
          </div>

          {/* Statistics Panel */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-tertiary p-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-text-muted">Total</div>
              <div className="text-lg font-semibold text-text-primary">
                {spectrum.gridType === 'flex-grid' ? `${rangeInfo.count} slots` : `${rangeInfo.count} channels`}
              </div>
              <div className="text-xs text-text-tertiary">
                {spectrum.gridType === 'flex-grid'
                  ? 'CH1 - CH' + rangeInfo.count
                  : `CH1 - CH${rangeInfo.max}`}
              </div>
            </div>

            <div className="rounded-lg bg-emerald-500/10 p-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-emerald-400">Available</div>
              <div className="text-lg font-semibold text-emerald-400">
                {utilizationInfo.freeChannels}
              </div>
              <div className="text-xs text-emerald-400/70">
                {((utilizationInfo.freeChannels / utilizationInfo.totalChannels) * 100).toFixed(0)}% free
              </div>
            </div>

            <div className="rounded-lg bg-rose-500/10 p-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-rose-400">Allocated</div>
              <div className="text-lg font-semibold text-rose-400">
                {utilizationInfo.allocatedChannels}
              </div>
              <div className="text-xs text-rose-400/70">
                {utilizationInfo.utilizationPercent.toFixed(0)}% used
              </div>
            </div>

            <div className="rounded-lg bg-purple-500/10 p-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-purple-400">Grid Type</div>
              <div className="text-lg font-semibold text-purple-400">
                {CHANNEL_GRID_CONFIGS[spectrum.gridType].spacing || '12.5'} GHz
              </div>
              <div className="text-xs text-purple-400/70">
                {spectrum.gridType === 'flex-grid' ? 'Flex Grid' : 'Fixed Grid'}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 border-t border-border pt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-emerald-500/70" />
              <span className="text-text-secondary">Free</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-rose-500/80" />
              <span className="text-text-secondary">Allocated</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-amber-500/80" />
              <span className="text-text-secondary">Reserved</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-blue-500" />
              <span className="text-text-secondary">Selected</span>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-info/10 border-info/20 flex items-start gap-2 rounded-lg border p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <div className="text-xs text-text-secondary">
              <p className="mb-1 font-medium text-info">Channel Numbering</p>
              <p>
                Channels are displayed as CH1, CH2, etc. for easy reference.
                {spectrum.gridType !== 'flex-grid' && (
                  <> CH1 corresponds to {(() => {
                    const range = getChannelRange(spectrum.gridType as 'fixed-100ghz' | 'fixed-50ghz');
                    const info = getChannelDisplayInfo(range.min, spectrum.gridType as 'fixed-100ghz' | 'fixed-50ghz');
                    return info ? `${info.frequency} (${info.wavelength})` : '';
                  })()}.</>
                )}
              </p>
            </div>
          </div>

          {/* Selection Info (when not read-only) */}
          {!readOnly && selectedChannels.length > 0 && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-400">
                  {selectedChannels.length} channel{selectedChannels.length > 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedChannels([]);
                      onChannelSelect?.([]);
                    }}
                    className="h-7 text-xs"
                  >
                    Clear
                  </Button>
                  {/* Unreserve button - show if any selected channels are reserved */}
                  {onUnreserveChannels && selectedChannels.some(ch =>
                    spectrum.allocations.some(a => a.channelNumber === ch && a.status === 'reserved')
                  ) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onUnreserveChannels(selectedChannels);
                        setSelectedChannels([]);
                        onChannelSelect?.([]);
                      }}
                      className="h-7 border-amber-500/30 text-xs text-amber-500 hover:bg-amber-500/10"
                    >
                      Unreserve
                    </Button>
                  )}
                  {/* Reserve button - show if any selected channels are free */}
                  {onReserveChannels && selectedChannels.some(ch =>
                    !spectrum.allocations.some(a => a.channelNumber === ch)
                  ) && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onReserveChannels(selectedChannels);
                        setSelectedChannels([]);
                        onChannelSelect?.([]);
                      }}
                      className="h-7 bg-amber-500 text-xs text-white hover:bg-amber-600"
                    >
                      Reserve
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedChannels.map((ch) => (
                  <span
                    key={ch}
                    className="rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400"
                  >
                    {spectrum.gridType !== 'flex-grid'
                      ? formatChannelLabel(ch, spectrum.gridType as 'fixed-100ghz' | 'fixed-50ghz')
                      : `Slot ${ch}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
