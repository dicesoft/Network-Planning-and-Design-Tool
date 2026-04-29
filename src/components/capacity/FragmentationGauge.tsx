/**
 * FragmentationGauge - 180-degree SVG arc gauge for fragmentation index
 *
 * Displays a multi-segment arc from green (0) to red (1) with an animated needle.
 * Uses discrete arc segments with solid colors instead of linearGradient to render
 * correctly along curved paths. Supports reduced-motion preference. Accessible via role="meter".
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface FragmentationGaugeProps {
  value: number; // 0 to 1
  size?: number; // diameter in px
  label?: string;
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ARC_START_ANGLE = Math.PI; // 180 degrees (left)
const ARC_END_ANGLE = 0; // 0 degrees (right)
const STROKE_WIDTH = 12;
const NEEDLE_LENGTH_RATIO = 0.72;
const ARC_SEGMENTS = 20; // Number of segments for the gradient arc

// Gradient color stops along the arc (0 = left/green, 1 = right/red)
const GRADIENT_STOPS: Array<{ position: number; color: string }> = [
  { position: 0, color: '#22c55e' },     // green
  { position: 0.4, color: '#eab308' },   // yellow
  { position: 0.7, color: '#f97316' },   // orange
  { position: 1, color: '#ef4444' },     // red
];

// ============================================================================
// HELPERS
// ============================================================================

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = Math.abs(startAngle - endAngle) >= Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function getValueColor(value: number): string {
  if (value <= 0.2) return '#22c55e';
  if (value <= 0.5) return '#eab308';
  if (value <= 0.7) return '#f97316';
  return '#ef4444';
}

/** Interpolate between gradient color stops at a given position (0-1) */
function getGradientColor(position: number): string {
  const clamped = Math.max(0, Math.min(1, position));

  // Find the two stops surrounding this position
  for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
    const curr = GRADIENT_STOPS[i];
    const next = GRADIENT_STOPS[i + 1];
    if (clamped >= curr.position && clamped <= next.position) {
      const t = (clamped - curr.position) / (next.position - curr.position);
      return interpolateColor(curr.color, next.color, t);
    }
  }
  return GRADIENT_STOPS[GRADIENT_STOPS.length - 1].color;
}

/** Linear interpolation between two hex colors */
function interpolateColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const FragmentationGauge: React.FC<FragmentationGaugeProps> = ({
  value,
  size = 180,
  label = 'Fragmentation Index',
  className,
}) => {
  const clampedValue = isNaN(value) || !isFinite(value) ? 0 : Math.max(0, Math.min(1, value));
  const [animatedValue, setAnimatedValue] = useState(0);
  const animationRef = useRef<number | null>(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (prefersReducedMotion.current) {
      setAnimatedValue(clampedValue);
      return;
    }

    const startValue = animatedValue;
    const startTime = performance.now();
    const duration = 1000; // 1000ms ease-out

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedValue(startValue + (clampedValue - startValue) * eased);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
    // Only re-animate when the target value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedValue]);

  const cx = size / 2;
  const cy = size / 2 + 10; // shift down a bit for label space below
  const radius = (size - STROKE_WIDTH * 2) / 2 - 8;

  // Needle angle: maps 0->left(PI) to 1->right(0)
  const needleAngle = ARC_START_ANGLE - animatedValue * (ARC_START_ANGLE - ARC_END_ANGLE);
  const needleTip = polarToCartesian(cx, cy, radius * NEEDLE_LENGTH_RATIO, needleAngle);
  const needleBase1 = polarToCartesian(cx, cy, 4, needleAngle + Math.PI / 2);
  const needleBase2 = polarToCartesian(cx, cy, 4, needleAngle - Math.PI / 2);

  const arcPath = describeArc(cx, cy, radius, ARC_START_ANGLE, ARC_END_ANGLE);

  // Build multi-segment arc paths with solid colors
  const arcSegments = useMemo(() => {
    const segments: Array<{ path: string; color: string }> = [];
    const totalAngle = ARC_START_ANGLE - ARC_END_ANGLE; // PI

    for (let i = 0; i < ARC_SEGMENTS; i++) {
      const t0 = i / ARC_SEGMENTS;
      const t1 = (i + 1) / ARC_SEGMENTS;
      const angle0 = ARC_START_ANGLE - t0 * totalAngle;
      const angle1 = ARC_START_ANGLE - t1 * totalAngle;
      const midT = (t0 + t1) / 2;
      const color = getGradientColor(midT);
      const path = describeArc(cx, cy, radius, angle0, angle1);
      segments.push({ path, color });
    }
    return segments;
  }, [cx, cy, radius]);

  return (
    <div
      className={cn('flex flex-col items-center', className)}
      role="meter"
      aria-valuenow={Math.round(clampedValue * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${Math.round(clampedValue * 100)}%`}
    >
      <svg width="100%" viewBox={`0 0 ${size} ${size / 2 + 30}`} preserveAspectRatio="xMidYMid meet">
        {/* Background arc (subtle) */}
        <path
          d={arcPath}
          fill="none"
          stroke="var(--color-border, #374151)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          opacity={0.3}
        />

        {/* Multi-segment gradient arc */}
        {arcSegments.map((seg, i) => (
          <path
            key={i}
            d={seg.path}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap={i === 0 || i === arcSegments.length - 1 ? 'round' : 'butt'}
          />
        ))}

        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={getValueColor(animatedValue)}
        />

        {/* Center circle */}
        <circle cx={cx} cy={cy} r={6} fill={getValueColor(animatedValue)} />

        {/* Scale labels */}
        <text
          x={cx - radius - 4}
          y={cy + 18}
          textAnchor="middle"
          className="fill-text-tertiary text-[10px]"
        >
          0%
        </text>
        <text
          x={cx + radius + 4}
          y={cy + 18}
          textAnchor="middle"
          className="fill-text-tertiary text-[10px]"
        >
          100%
        </text>

        {/* Value text */}
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          className="fill-text-primary text-xl font-bold"
          style={{ fontSize: '20px', fontWeight: 700 }}
        >
          {(clampedValue * 100).toFixed(0)}%
        </text>
      </svg>
      <span className="mt-1 text-xs text-text-secondary">{label}</span>
    </div>
  );
};
