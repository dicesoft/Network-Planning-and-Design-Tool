import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export type ChannelState = 'free' | 'allocated' | 'reserved' | 'moving' | 'moved-to';

export interface SpectrumGridProps {
  channels: ChannelState[];
  mode: 'linear' | 'grid';
  label?: string;
  compact?: boolean;
  /** When true, disables the internal overflow-x-auto so a parent container can handle shared scrolling */
  noInternalScroll?: boolean;
  onChannelClick?: (index: number) => void;
  onChannelHover?: (index: number | null) => void;
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CHANNEL_COLORS: Record<ChannelState, { fill: string; darkFill: string; label: string }> = {
  free: { fill: '#22c55e', darkFill: '#16a34a', label: 'Free' },
  allocated: { fill: '#ef4444', darkFill: '#dc2626', label: 'Allocated' },
  reserved: { fill: '#f97316', darkFill: '#ea580c', label: 'Reserved' },
  moving: { fill: '#eab308', darkFill: '#ca8a04', label: 'Moving' },
  'moved-to': { fill: '#3b82f6', darkFill: '#2563eb', label: 'Moved To' },
};

const GRID_COLUMNS = 16;
const CELL_SIZE = 14;
const CELL_GAP = 2;
const CELL_RADIUS = 2;

// ============================================================================
// COMPONENT
// ============================================================================

export const SpectrumGrid: React.FC<SpectrumGridProps> = ({
  channels,
  mode,
  label,
  compact = false,
  noInternalScroll = false,
  onChannelClick,
  onChannelHover,
  className,
}) => {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<SVGSVGElement>(null);

  // For large row counts, use IntersectionObserver for virtualization
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 0, end: channels.length });
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelTopRef = useRef<HTMLDivElement>(null);
  const sentinelBottomRef = useRef<HTMLDivElement>(null);

  const totalChannels = channels.length;
  const rows = Math.ceil(totalChannels / GRID_COLUMNS);
  const needsVirtualization = mode === 'grid' && rows > 50;

  // Summary for screen readers
  const summary = useMemo(() => {
    const counts: Record<ChannelState, number> = {
      free: 0, allocated: 0, reserved: 0, moving: 0, 'moved-to': 0,
    };
    for (const ch of channels) {
      counts[ch]++;
    }
    const freeCount = counts.free;
    const labelPart = label ? `${label}: ` : '';
    return `${labelPart}${freeCount} of ${totalChannels} channels free`;
  }, [channels, totalChannels, label]);

  // IntersectionObserver for virtualization on grid mode with many rows
  useEffect(() => {
    if (!needsVirtualization) {
      setVisibleRange({ start: 0, end: totalChannels });
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Show all by default, refine when observer fires
    setVisibleRange({ start: 0, end: totalChannels });

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Expand visible range based on scroll position
            const scrollTop = container.scrollTop;
            const clientHeight = container.clientHeight;
            const rowHeight = CELL_SIZE + CELL_GAP;
            const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 5);
            const endRow = Math.min(rows, Math.ceil((scrollTop + clientHeight) / rowHeight) + 5);
            setVisibleRange({
              start: startRow * GRID_COLUMNS,
              end: Math.min(endRow * GRID_COLUMNS, totalChannels),
            });
          }
        }
      },
      { root: container, threshold: 0 }
    );

    if (sentinelTopRef.current) observerRef.current.observe(sentinelTopRef.current);
    if (sentinelBottomRef.current) observerRef.current.observe(sentinelBottomRef.current);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [needsVirtualization, rows, totalChannels]);

  // Arrow-key navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (focusedIndex < 0) return;

      let newIndex = focusedIndex;
      if (mode === 'linear') {
        if (e.key === 'ArrowRight') newIndex = Math.min(focusedIndex + 1, totalChannels - 1);
        else if (e.key === 'ArrowLeft') newIndex = Math.max(focusedIndex - 1, 0);
      } else {
        if (e.key === 'ArrowRight') newIndex = Math.min(focusedIndex + 1, totalChannels - 1);
        else if (e.key === 'ArrowLeft') newIndex = Math.max(focusedIndex - 1, 0);
        else if (e.key === 'ArrowDown') newIndex = Math.min(focusedIndex + GRID_COLUMNS, totalChannels - 1);
        else if (e.key === 'ArrowUp') newIndex = Math.max(focusedIndex - GRID_COLUMNS, 0);
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onChannelClick?.(focusedIndex);
        return;
      }

      if (newIndex !== focusedIndex) {
        e.preventDefault();
        setFocusedIndex(newIndex);
      }
    },
    [focusedIndex, mode, totalChannels, onChannelClick]
  );

  const handleCellClick = useCallback(
    (index: number) => {
      setFocusedIndex(index);
      onChannelClick?.(index);
    },
    [onChannelClick]
  );

  const handleCellHover = useCallback(
    (index: number | null) => {
      setHoveredIndex(index);
      onChannelHover?.(index);
    },
    [onChannelHover]
  );

  // Determine if dark mode is active
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const getChannelFill = useCallback(
    (state: ChannelState, index: number): string => {
      const colors = CHANNEL_COLORS[state];
      if (state === 'free') {
        // Free channels: green-tinted with reduced opacity
        return isDark ? colors.darkFill : colors.fill;
      }
      const isHovered = hoveredIndex === index;
      const isFocused = focusedIndex === index;
      if (isHovered || isFocused) {
        return isDark ? colors.fill : colors.fill;
      }
      return isDark ? colors.darkFill : colors.fill;
    },
    [isDark, hoveredIndex, focusedIndex]
  );

  const getChannelOpacity = useCallback(
    (state: ChannelState, index: number): number => {
      if (state === 'free') return isDark ? 0.4 : 0.3;
      const isHovered = hoveredIndex === index;
      const isFocused = focusedIndex === index;
      if (isHovered || isFocused) return 1;
      return 0.85;
    },
    [isDark, hoveredIndex, focusedIndex]
  );

  // ============================================================================
  // LINEAR MODE
  // ============================================================================

  if (mode === 'linear') {
    const cellWidth = compact ? 6 : CELL_SIZE;
    const cellHeight = compact ? 16 : 20;
    const svgWidth = totalChannels * (cellWidth + CELL_GAP) - CELL_GAP;
    const svgHeight = cellHeight;

    return (
      <div className={cn('flex flex-col gap-1', className)}>
        {label && (
          <span className="text-xs font-medium text-text-secondary">{label}</span>
        )}
        <div
          ref={containerRef}
          className={noInternalScroll ? undefined : 'overflow-x-auto'}
          role="grid"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (focusedIndex < 0) setFocusedIndex(0); }}
        >
          <span className="sr-only">{summary}</span>
          <svg
            ref={gridRef}
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            role="presentation"
          >
            {channels.map((state, i) => (
              <rect
                key={i}
                role="gridcell"
                aria-label={`Channel ${i + 1}: ${CHANNEL_COLORS[state].label}`}
                x={i * (cellWidth + CELL_GAP)}
                y={0}
                width={cellWidth}
                height={cellHeight}
                rx={CELL_RADIUS}
                fill={getChannelFill(state, i)}
                opacity={getChannelOpacity(state, i)}
                stroke={focusedIndex === i ? 'var(--color-accent)' : 'none'}
                strokeWidth={focusedIndex === i ? 1.5 : 0}
                className="cursor-pointer transition-opacity"
                onClick={() => handleCellClick(i)}
                onMouseEnter={() => handleCellHover(i)}
                onMouseLeave={() => handleCellHover(null)}
              />
            ))}
          </svg>
        </div>
        {/* Tooltip for hovered channel — fixed height to prevent layout shift */}
        <div className="h-5">
          <span
            className={cn(
              'text-xs text-text-tertiary transition-opacity',
              hoveredIndex !== null ? 'opacity-100' : 'opacity-0'
            )}
          >
            {hoveredIndex !== null
              ? `Ch ${hoveredIndex + 1}: ${CHANNEL_COLORS[channels[hoveredIndex]].label}`
              : '\u00A0'}
          </span>
        </div>
      </div>
    );
  }

  // ============================================================================
  // GRID MODE (16 columns)
  // ============================================================================

  const gridWidth = GRID_COLUMNS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const gridHeight = rows * (CELL_SIZE + CELL_GAP) - CELL_GAP;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      )}
      <div
        ref={containerRef}
        className={cn('overflow-auto', needsVirtualization && 'max-h-64')}
        role="grid"
        aria-label={summary}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (focusedIndex < 0) setFocusedIndex(0); }}
      >
        <span className="sr-only">{summary}</span>
        {needsVirtualization && <div ref={sentinelTopRef} className="h-px" />}
        <svg
          ref={gridRef}
          width={gridWidth}
          height={gridHeight}
          viewBox={`0 0 ${gridWidth} ${gridHeight}`}
          role="presentation"
        >
          {channels.map((state, i) => {
            // Skip non-visible cells in virtualized mode
            if (needsVirtualization && (i < visibleRange.start || i >= visibleRange.end)) {
              return null;
            }

            const col = i % GRID_COLUMNS;
            const row = Math.floor(i / GRID_COLUMNS);
            return (
              <rect
                key={i}
                role="gridcell"
                aria-label={`Channel ${i + 1}: ${CHANNEL_COLORS[state].label}`}
                x={col * (CELL_SIZE + CELL_GAP)}
                y={row * (CELL_SIZE + CELL_GAP)}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={CELL_RADIUS}
                fill={getChannelFill(state, i)}
                opacity={getChannelOpacity(state, i)}
                stroke={focusedIndex === i ? 'var(--color-accent)' : 'none'}
                strokeWidth={focusedIndex === i ? 1.5 : 0}
                className="cursor-pointer transition-opacity"
                onClick={() => handleCellClick(i)}
                onMouseEnter={() => handleCellHover(i)}
                onMouseLeave={() => handleCellHover(null)}
              />
            );
          })}
        </svg>
        {needsVirtualization && <div ref={sentinelBottomRef} className="h-px" />}
      </div>
      {/* Tooltip for hovered channel — fixed height to prevent layout shift */}
      <div className="h-5">
        <span
          className={cn(
            'text-xs text-text-tertiary transition-opacity',
            hoveredIndex !== null ? 'opacity-100' : 'opacity-0'
          )}
        >
          {hoveredIndex !== null
            ? `Ch ${hoveredIndex + 1}: ${CHANNEL_COLORS[channels[hoveredIndex]].label}`
            : '\u00A0'}
        </span>
      </div>
      {/* Legend */}
      {!compact && (
        <div className="flex flex-wrap gap-3 pt-1">
          {Object.entries(CHANNEL_COLORS).map(([state, colors]) => (
            <div key={state} className="flex items-center gap-1.5">
              <div
                className="h-3 w-3 rounded-sm"
                style={{
                  backgroundColor: colors.fill,
                  opacity: state === 'free' ? 0.6 : 0.85,
                }}
              />
              <span className="text-xs text-text-tertiary">{colors.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
