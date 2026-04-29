/**
 * SpectrumVisualization Component
 * Visual C-band spectrum display with color-coded channel/slot segments
 */

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { PortSpectrum, ChannelStatus } from '@/types/spectrum';
import {
  CHANNEL_GRID_CONFIGS,
  frequencyToWavelength,
  channelNumberToFrequency,
  slotNumberToFrequency,
  getChannelRange,
  getSlotRange,
  formatChannelLabel,
} from '@/core/spectrum/channelConfig';

interface SpectrumVisualizationProps {
  spectrum: PortSpectrum;
  selectedChannels?: number[];
  selectedSlotRange?: { startSlot: number; endSlot: number };
  onChannelClick?: (channelNumber: number) => void;
  onSlotClick?: (slotNumber: number) => void;
  showLabels?: boolean;
  height?: number;
  className?: string;
}

/**
 * Get status color for a channel/slot
 */
function getStatusColor(status: ChannelStatus | 'selected' | 'free'): string {
  switch (status) {
    case 'free':
      return 'bg-emerald-500/70 hover:bg-emerald-500';
    case 'allocated':
      return 'bg-rose-500/80';
    case 'reserved':
      return 'bg-amber-500/80';
    case 'selected':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500/50';
  }
}

/**
 * Tooltip component for channel/slot info
 */
interface TooltipProps {
  visible: boolean;
  x: number;
  y: number;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ visible, x, y, children }) => {
  if (!visible) return null;

  // Tooltip dimensions (approximate)
  const tooltipWidth = 140;
  const tooltipHeight = 100;
  const offset = 12;

  // Boundary detection - flip position when near edges
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

  // Position tooltip to the right and below cursor by default
  let left = x + offset;
  let top = y + 8;

  // Flip to left side if too close to right edge
  if (x + offset + tooltipWidth > viewportWidth - 20) {
    left = x - tooltipWidth - offset;
  }

  // Flip to above cursor if too close to bottom edge
  if (y + 8 + tooltipHeight > viewportHeight - 20) {
    top = y - tooltipHeight - 8;
  }

  // Ensure tooltip doesn't go off left or top edges
  left = Math.max(8, left);
  top = Math.max(8, top);

  return (
    <div
      className="pointer-events-none fixed z-tooltip rounded-md border border-border bg-elevated px-2 py-1.5 text-xs shadow-lg"
      style={{ left, top }}
    >
      {children}
    </div>
  );
};

export const SpectrumVisualization: React.FC<SpectrumVisualizationProps> = ({
  spectrum,
  selectedChannels = [],
  selectedSlotRange,
  onChannelClick,
  onSlotClick,
  showLabels = true,
  height = 40,
  className,
}) => {
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: React.ReactNode;
  }>({ visible: false, x: 0, y: 0, content: null });

  // Build channel/slot map with status
  const { segments, config } = useMemo(() => {
    const config = CHANNEL_GRID_CONFIGS[spectrum.gridType];

    if (spectrum.gridType === 'flex-grid') {
      // Flex-grid: create slot-based segments
      const slotRange = getSlotRange();
      const segments: Array<{
        id: string;
        type: 'slot';
        slotNumber: number;
        frequency: number;
        wavelength: number;
        status: ChannelStatus | 'selected';
        label?: string;
        width: number;
      }> = [];

      // Create segments for each slot
      for (let n = slotRange.min; n <= slotRange.max; n++) {
        const freq = slotNumberToFrequency(n);
        const wavelength = frequencyToWavelength(freq);

        // Check if slot is selected
        const isSelected =
          selectedSlotRange &&
          n >= selectedSlotRange.startSlot &&
          n <= selectedSlotRange.endSlot;

        // Check if slot is allocated
        let status: ChannelStatus | 'selected' = 'free';
        let label: string | undefined;

        if (isSelected) {
          status = 'selected';
        } else {
          for (const allocation of spectrum.allocations) {
            if (
              allocation.slotRange &&
              n >= allocation.slotRange.startSlot &&
              n <= allocation.slotRange.endSlot
            ) {
              status = allocation.status;
              label = allocation.label;
              break;
            }
          }
        }

        segments.push({
          id: `slot-${n}`,
          type: 'slot',
          slotNumber: n,
          frequency: freq,
          wavelength,
          status,
          label,
          width: 1 / slotRange.count,
        });
      }

      return { segments, config };
    } else {
      // Fixed grid: create channel-based segments
      const channelRange = getChannelRange(spectrum.gridType as 'fixed-100ghz' | 'fixed-50ghz');
      const segments: Array<{
        id: string;
        type: 'channel';
        channelNumber: number;
        frequency: number;
        wavelength: number;
        status: ChannelStatus | 'selected';
        label?: string;
        width: number;
      }> = [];

      for (let ch = channelRange.min; ch <= channelRange.max; ch++) {
        const freq = channelNumberToFrequency(ch, spectrum.gridType as 'fixed-100ghz' | 'fixed-50ghz');
        const wavelength = frequencyToWavelength(freq);

        // Check if channel is selected
        const isSelected = selectedChannels.includes(ch);

        // Check if channel is allocated
        let status: ChannelStatus | 'selected' = 'free';
        let label: string | undefined;

        if (isSelected) {
          status = 'selected';
        } else {
          const allocation = spectrum.allocations.find((a) => a.channelNumber === ch);
          if (allocation) {
            status = allocation.status;
            label = allocation.label;
          }
        }

        segments.push({
          id: `ch-${ch}`,
          type: 'channel',
          channelNumber: ch,
          frequency: freq,
          wavelength,
          status,
          label,
          width: 1 / channelRange.count,
        });
      }

      return { segments, config };
    }
  }, [spectrum, selectedChannels, selectedSlotRange]);

  const handleMouseEnter = (
    e: React.MouseEvent,
    segment: (typeof segments)[0]
  ) => {
    const content = (
      <div className="space-y-0.5">
        {'channelNumber' in segment && (
          <div className="font-medium">
            {formatChannelLabel(segment.channelNumber, spectrum.gridType as 'fixed-100ghz' | 'fixed-50ghz')}
          </div>
        )}
        {'slotNumber' in segment && (
          <div className="font-medium">Slot {segment.slotNumber}</div>
        )}
        <div className="text-text-secondary">
          {segment.frequency.toFixed(3)} THz
        </div>
        <div className="text-text-secondary">
          {segment.wavelength.toFixed(2)} nm
        </div>
        <div className={cn(
          'capitalize',
          segment.status === 'free' && 'text-emerald-400',
          segment.status === 'allocated' && 'text-rose-400',
          segment.status === 'reserved' && 'text-amber-400',
          segment.status === 'selected' && 'text-blue-400'
        )}>
          {segment.status}
          {segment.label && ` (${segment.label})`}
        </div>
      </div>
    );

    setTooltip({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      content,
    });
  };

  const handleMouseLeave = () => {
    setTooltip({ visible: false, x: 0, y: 0, content: null });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tooltip.visible) {
      setTooltip((prev) => ({ ...prev, x: e.clientX, y: e.clientY }));
    }
  };

  const handleClick = (segment: (typeof segments)[0]) => {
    if ('channelNumber' in segment && segment.type === 'channel' && onChannelClick) {
      onChannelClick(segment.channelNumber);
    } else if ('slotNumber' in segment && segment.type === 'slot' && onSlotClick) {
      onSlotClick(segment.slotNumber);
    }
  };

  // Calculate utilization
  const freeCount = segments.filter((s) => s.status === 'free').length;
  const allocatedCount = segments.filter((s) => s.status === 'allocated').length;
  const utilizationPercent = Math.round((allocatedCount / segments.length) * 100);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Spectrum bar */}
      <div
        className="relative overflow-hidden rounded-md border border-border bg-tertiary"
        style={{ height }}
        onMouseMove={handleMouseMove}
      >
        <div className="absolute inset-0 flex">
          {segments.map((segment) => (
            <div
              key={segment.id}
              className={cn(
                'h-full transition-all cursor-pointer',
                getStatusColor(segment.status),
                'border-r border-black/10 last:border-r-0',
                segment.status === 'free' && (onChannelClick || onSlotClick) && 'hover:opacity-100'
              )}
              style={{ flex: `0 0 ${segment.width * 100}%` }}
              onMouseEnter={(e) => handleMouseEnter(e, segment)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleClick(segment)}
            />
          ))}
        </div>
      </div>

      {/* Labels */}
      {showLabels && (
        <div className="flex justify-between text-xs text-text-muted">
          <span>{config.startFrequency.toFixed(2)} THz</span>
          <span className="text-text-tertiary">
            {spectrum.gridType === 'flex-grid'
              ? 'Flex Grid (12.5 GHz)'
              : `${CHANNEL_GRID_CONFIGS[spectrum.gridType].spacing} GHz Grid`}
          </span>
          <span>{config.endFrequency.toFixed(2)} THz</span>
        </div>
      )}

      {/* Utilization info */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-emerald-500/70" />
          <span className="text-text-secondary">Free ({freeCount})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-rose-500/80" />
          <span className="text-text-secondary">Allocated ({allocatedCount})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-blue-500" />
          <span className="text-text-secondary">Selected</span>
        </div>
        <span className="ml-auto text-text-muted">{utilizationPercent}% utilized</span>
      </div>

      {/* Tooltip - rendered via portal to avoid clipping by parent overflow */}
      {typeof document !== 'undefined' && createPortal(
        <Tooltip
          visible={tooltip.visible}
          x={tooltip.x}
          y={tooltip.y}
        >
          {tooltip.content}
        </Tooltip>,
        document.body
      )}
    </div>
  );
};

/**
 * Mini spectrum bar for compact display
 */
interface MiniSpectrumBarProps {
  spectrum: PortSpectrum;
  width?: number;
  height?: number;
  className?: string;
}

export const MiniSpectrumBar: React.FC<MiniSpectrumBarProps> = ({
  spectrum,
  width = 100,
  height = 8,
  className,
}) => {
  const segments = useMemo(() => {
    if (spectrum.gridType === 'flex-grid') {
      const slotRange = getSlotRange();
      const totalSlots = slotRange.count;
      let allocatedSlots = 0;

      for (const allocation of spectrum.allocations) {
        if (allocation.slotRange && allocation.status !== 'free') {
          allocatedSlots += allocation.slotRange.endSlot - allocation.slotRange.startSlot + 1;
        }
      }

      const freePercent = ((totalSlots - allocatedSlots) / totalSlots) * 100;
      const allocatedPercent = (allocatedSlots / totalSlots) * 100;

      return { freePercent, allocatedPercent };
    } else {
      const channelRange = getChannelRange(spectrum.gridType as 'fixed-100ghz' | 'fixed-50ghz');
      const totalChannels = channelRange.count;
      const allocatedChannels = spectrum.allocations.filter(
        (a) => a.channelNumber !== undefined && a.status !== 'free'
      ).length;

      const freePercent = ((totalChannels - allocatedChannels) / totalChannels) * 100;
      const allocatedPercent = (allocatedChannels / totalChannels) * 100;

      return { freePercent, allocatedPercent };
    }
  }, [spectrum]);

  return (
    <div
      className={cn('rounded overflow-hidden flex', className)}
      style={{ width, height }}
    >
      <div
        className="h-full bg-emerald-500/70"
        style={{ width: `${segments.freePercent}%` }}
      />
      <div
        className="h-full bg-rose-500/80"
        style={{ width: `${segments.allocatedPercent}%` }}
      />
    </div>
  );
};
