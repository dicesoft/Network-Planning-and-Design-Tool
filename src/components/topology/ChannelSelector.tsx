/**
 * ChannelSelector Component
 * Main channel selection UI for DWDM connections
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { ChannelGridType, PortSpectrum } from '@/types/spectrum';
import { CHANNEL_GRID_CONFIGS, getChannelRange, getChannelDisplayInfo, getFlexGridSlotInfo, COMMON_FLEX_GRID_WIDTHS, formatChannelLabel, getUserChannelRange } from '@/core/spectrum/channelConfig';
import { SpectrumVisualization } from './SpectrumVisualization';
import { validateChannelAvailability, validateFlexGridSlots } from '@/core/validation/channelValidation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Check, Plus, X } from 'lucide-react';

interface ChannelSelectorProps {
  spectrum: PortSpectrum;
  selectedChannels: number[];
  selectedSlotRange?: { startSlot: number; endSlot: number };
  onChannelSelect: (channels: number[]) => void;
  onSlotRangeSelect?: (range: { startSlot: number; endSlot: number } | undefined) => void;
  onGridTypeChange?: (gridType: ChannelGridType) => void;
  multiSelect?: boolean;
  disabled?: boolean;
  className?: string;
}

export const ChannelSelector: React.FC<ChannelSelectorProps> = ({
  spectrum,
  selectedChannels,
  selectedSlotRange,
  onChannelSelect,
  onSlotRangeSelect,
  onGridTypeChange,
  multiSelect = false,
  disabled = false,
  className,
}) => {
  const [flexSlotStart, setFlexSlotStart] = useState<string>('');
  const [flexSlotEnd, setFlexSlotEnd] = useState<string>('');
  const [quickSelectOpen, setQuickSelectOpen] = useState(false);

  // Get channel range for fixed grids
  const channelRange = useMemo(() => {
    if (spectrum.gridType !== 'flex-grid') {
      return getChannelRange(spectrum.gridType);
    }
    return null;
  }, [spectrum.gridType]);

  // Handle channel click from spectrum visualization
  const handleChannelClick = (channelNumber: number) => {
    if (disabled) return;

    // Validate channel is available
    const validation = validateChannelAvailability(spectrum, channelNumber);
    if (!validation.valid) return;

    if (multiSelect) {
      // Toggle selection
      if (selectedChannels.includes(channelNumber)) {
        onChannelSelect(selectedChannels.filter((c) => c !== channelNumber));
      } else {
        onChannelSelect([...selectedChannels, channelNumber]);
      }
    } else {
      // Single select
      if (selectedChannels.includes(channelNumber)) {
        onChannelSelect([]);
      } else {
        onChannelSelect([channelNumber]);
      }
    }
  };

  // Handle slot click for flex-grid
  const handleSlotClick = (slotNumber: number) => {
    if (disabled || !onSlotRangeSelect) return;

    // If no range selected, start a new range
    if (!selectedSlotRange) {
      setFlexSlotStart(slotNumber.toString());
      setFlexSlotEnd(slotNumber.toString());
    }
  };

  // Apply flex-grid slot range
  const handleApplySlotRange = () => {
    if (!onSlotRangeSelect) return;

    const start = parseInt(flexSlotStart);
    const end = parseInt(flexSlotEnd);

    if (isNaN(start) || isNaN(end)) return;

    const validation = validateFlexGridSlots(spectrum, start, end);
    if (!validation.valid) return;

    onSlotRangeSelect({ startSlot: start, endSlot: end });
  };

  // Clear flex-grid selection
  const handleClearSlotRange = () => {
    if (!onSlotRangeSelect) return;
    setFlexSlotStart('');
    setFlexSlotEnd('');
    onSlotRangeSelect(undefined);
  };

  // Quick select common flex-grid widths
  const handleQuickSelect = (slots: number) => {
    if (!onSlotRangeSelect) return;

    // Find first free range of the requested width
    // Start from center of spectrum
    const centerSlot = 0; // n=0 is 193.1 THz
    const halfWidth = Math.floor(slots / 2);

    // Try to place centered at n=0, then search outward
    for (let offset = 0; offset < 200; offset++) {
      for (const sign of [1, -1]) {
        const start = centerSlot + (sign * offset) - halfWidth;
        const end = start + slots - 1;

        const validation = validateFlexGridSlots(spectrum, start, end);
        if (validation.valid) {
          setFlexSlotStart(start.toString());
          setFlexSlotEnd(end.toString());
          setQuickSelectOpen(false);
          return;
        }
      }
    }

    setQuickSelectOpen(false);
  };

  // Get display info for selected channels
  const selectedChannelInfo = useMemo(() => {
    if (spectrum.gridType === 'flex-grid') {
      if (selectedSlotRange) {
        return getFlexGridSlotInfo(selectedSlotRange.startSlot, selectedSlotRange.endSlot);
      }
      return null;
    } else {
      if (selectedChannels.length === 0) return null;
      return selectedChannels.map((ch) =>
        getChannelDisplayInfo(ch, spectrum.gridType as 'fixed-100ghz' | 'fixed-50ghz')
      ).filter(Boolean);
    }
  }, [spectrum.gridType, selectedChannels, selectedSlotRange]);

  // Validation state
  const slotRangeValidation = useMemo(() => {
    if (spectrum.gridType !== 'flex-grid') return null;
    const start = parseInt(flexSlotStart);
    const end = parseInt(flexSlotEnd);
    if (isNaN(start) || isNaN(end)) return null;
    return validateFlexGridSlots(spectrum, start, end);
  }, [spectrum, flexSlotStart, flexSlotEnd]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Grid type selector - always visible */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text-secondary">Grid Type:</span>
        <div className="flex gap-1.5">
          {(['fixed-100ghz', 'fixed-50ghz', 'flex-grid'] as const).map((gridType) => (
            <button
              key={gridType}
              type="button"
              onClick={() => onGridTypeChange?.(gridType)}
              disabled={disabled || !onGridTypeChange}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                spectrum.gridType === gridType
                  ? 'bg-accent text-white'
                  : onGridTypeChange
                    ? 'bg-tertiary text-text-secondary hover:bg-border'
                    : 'bg-tertiary text-text-muted cursor-default',
                (disabled || !onGridTypeChange) && spectrum.gridType !== gridType && 'opacity-50'
              )}
            >
              {CHANNEL_GRID_CONFIGS[gridType].label}
            </button>
          ))}
        </div>
      </div>

      {/* Spectrum visualization */}
      <SpectrumVisualization
        spectrum={spectrum}
        selectedChannels={selectedChannels}
        selectedSlotRange={selectedSlotRange}
        onChannelClick={handleChannelClick}
        onSlotClick={handleSlotClick}
        showLabels={true}
        height={48}
      />

      {/* Channel selection for fixed grids */}
      {spectrum.gridType !== 'flex-grid' && channelRange && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">
              Select Channel{multiSelect ? '(s)' : ''}
            </span>
            {selectedChannels.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChannelSelect([])}
                className="h-7 text-xs"
              >
                <X className="mr-1 h-3 w-3" />
                Clear
              </Button>
            )}
          </div>

          {/* Quick channel number input - uses user-friendly CH numbering */}
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder={`Channel # (CH1 to CH${getUserChannelRange(spectrum.gridType).max})`}
              className="flex-1"
              disabled={disabled}
              onChange={(e) => {
                const ch = parseInt(e.target.value);
                if (!isNaN(ch)) {
                  const validation = validateChannelAvailability(spectrum, ch);
                  if (validation.valid) {
                    if (multiSelect) {
                      if (!selectedChannels.includes(ch)) {
                        onChannelSelect([...selectedChannels, ch]);
                      }
                    } else {
                      onChannelSelect([ch]);
                    }
                    e.target.value = '';
                  }
                }
              }}
            />
          </div>

          {/* Selected channels display */}
          {selectedChannels.length > 0 && selectedChannelInfo && (
            <div className="bg-accent/10 border-accent/20 space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-accent">
                <Check className="h-4 w-4" />
                {selectedChannels.length} channel{selectedChannels.length > 1 ? 's' : ''} selected
              </div>
              <div className="flex flex-wrap gap-2">
                {(selectedChannelInfo as Array<{ number: number; frequency: string; wavelength: string }>).map((info) => (
                  <div
                    key={info.number}
                    className="bg-accent/20 flex items-center gap-1 rounded px-2 py-1 text-xs"
                  >
                    <span className="font-medium">{formatChannelLabel(info.number, spectrum.gridType as 'fixed-100ghz' | 'fixed-50ghz')}</span>
                    <span className="text-text-muted">({info.wavelength})</span>
                    {multiSelect && (
                      <button
                        type="button"
                        onClick={() => onChannelSelect(selectedChannels.filter((c) => c !== info.number))}
                        className="ml-1 hover:text-danger"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Slot range selection for flex-grid */}
      {spectrum.gridType === 'flex-grid' && onSlotRangeSelect && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">
              Flex-Grid Slot Range
            </span>
            {selectedSlotRange && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClearSlotRange}
                className="h-7 text-xs"
              >
                <X className="mr-1 h-3 w-3" />
                Clear
              </Button>
            )}
          </div>

          {/* Slot range inputs */}
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Start slot"
              value={flexSlotStart}
              onChange={(e) => setFlexSlotStart(e.target.value)}
              disabled={disabled}
              className="w-28"
            />
            <span className="text-text-muted">to</span>
            <Input
              type="number"
              placeholder="End slot"
              value={flexSlotEnd}
              onChange={(e) => setFlexSlotEnd(e.target.value)}
              disabled={disabled}
              className="w-28"
            />
            <Button
              size="sm"
              onClick={handleApplySlotRange}
              disabled={disabled || !flexSlotStart || !flexSlotEnd || (slotRangeValidation !== null && !slotRangeValidation.valid)}
            >
              Apply
            </Button>

            {/* Quick select dropdown */}
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setQuickSelectOpen(!quickSelectOpen)}
                disabled={disabled}
              >
                <Plus className="mr-1 h-4 w-4" />
                Quick
              </Button>
              {quickSelectOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 min-w-[150px] rounded-lg border border-border bg-elevated py-1 shadow-lg">
                  {COMMON_FLEX_GRID_WIDTHS.map((opt) => (
                    <button
                      key={opt.slots}
                      type="button"
                      onClick={() => handleQuickSelect(opt.slots)}
                      className="w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-tertiary"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Validation messages */}
          {slotRangeValidation && !slotRangeValidation.valid && (
            <div className="bg-danger/10 border-danger/20 flex items-start gap-2 rounded-lg border p-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="text-xs text-danger">
                {slotRangeValidation.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            </div>
          )}

          {/* Selected slot range display */}
          {selectedSlotRange && selectedChannelInfo && (
            <div className="bg-accent/10 border-accent/20 space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-accent">
                <Check className="h-4 w-4" />
                Slot range selected
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-text-muted">Slots:</span>{' '}
                  <span className="font-mono">{selectedSlotRange.startSlot} to {selectedSlotRange.endSlot}</span>
                </div>
                <div>
                  <span className="text-text-muted">Bandwidth:</span>{' '}
                  <span className="font-mono">{(selectedChannelInfo as ReturnType<typeof getFlexGridSlotInfo>).bandwidthGHz.toFixed(1)} GHz</span>
                </div>
                <div>
                  <span className="text-text-muted">Center freq:</span>{' '}
                  <span className="font-mono">{(selectedChannelInfo as ReturnType<typeof getFlexGridSlotInfo>).centerFrequency.toFixed(3)} THz</span>
                </div>
                <div>
                  <span className="text-text-muted">Wavelength:</span>{' '}
                  <span className="font-mono">
                    {(selectedChannelInfo as ReturnType<typeof getFlexGridSlotInfo>).startWavelength.toFixed(2)}-
                    {(selectedChannelInfo as ReturnType<typeof getFlexGridSlotInfo>).endWavelength.toFixed(2)} nm
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Simple channel selector for single channel selection
 */
interface SimpleChannelSelectorProps {
  gridType: ChannelGridType;
  allocatedChannels: number[];
  value: number | null;
  onChange: (channel: number | null) => void;
  disabled?: boolean;
  className?: string;
}

export const SimpleChannelSelector: React.FC<SimpleChannelSelectorProps> = ({
  gridType,
  allocatedChannels,
  value,
  onChange,
  disabled = false,
  className,
}) => {
  if (gridType === 'flex-grid') {
    return (
      <div className={cn('text-sm text-text-muted', className)}>
        Use full ChannelSelector for flex-grid
      </div>
    );
  }

  const channelRange = getChannelRange(gridType);
  const allocatedSet = new Set(allocatedChannels);

  return (
    <div className={cn('space-y-2', className)}>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const ch = e.target.value ? parseInt(e.target.value) : null;
          onChange(ch);
        }}
        disabled={disabled}
        className={cn(
          'w-full px-3 py-2 rounded-lg border border-border bg-elevated text-sm',
          'focus:outline-none focus:ring-2 focus:ring-accent/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <option value="">Select channel...</option>
        {Array.from({ length: channelRange.max - channelRange.min + 1 }, (_, i) => {
          const ch = channelRange.min + i;
          const isAllocated = allocatedSet.has(ch);
          const info = getChannelDisplayInfo(ch, gridType);
          if (!info) return null;

          return (
            <option key={ch} value={ch} disabled={isAllocated}>
              {formatChannelLabel(ch, gridType)} - {info.wavelength} {isAllocated ? '(in use)' : ''}
            </option>
          );
        })}
      </select>

      {value !== null && (
        <div className="text-xs text-text-muted">
          {(() => {
            const info = getChannelDisplayInfo(value, gridType);
            if (!info) return null;
            return `${formatChannelLabel(value, gridType)} · ${info.frequency} · ${info.wavelength}`;
          })()}
        </div>
      )}
    </div>
  );
};
