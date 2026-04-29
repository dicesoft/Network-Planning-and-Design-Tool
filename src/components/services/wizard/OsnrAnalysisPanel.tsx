/**
 * OsnrAnalysisPanel - OSNR analysis display for the Service Wizard
 *
 * Shows link budget table, summary stats, OSNR gauge, and pass/fail indicator
 * after path computation in the service wizard.
 */

import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, AlertTriangle, Activity, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { OSNRResult, SpanOSNRResult } from '@/core/optical/types';

// ============================================================================
// FORMULA TOOLTIP HELPER
// ============================================================================

const FormulaTooltip: React.FC<{ formula: string }> = ({ formula }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <HelpCircle className="ml-1 inline h-3 w-3 cursor-help text-text-muted" />
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-xs font-normal normal-case tracking-normal">
      {formula}
    </TooltipContent>
  </Tooltip>
);

// ============================================================================
// TYPES
// ============================================================================

export interface OsnrAnalysisPanelProps {
  result: OSNRResult;
  className?: string;
}

// ============================================================================
// OSNR GAUGE (180-degree arc, dB scale)
// ============================================================================

interface OsnrGaugeProps {
  gsnr: number;
  requiredOsnr: number;
  margin: number;
  maxValue?: number;
}

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

const GAUGE_TICKS = [0, 15, 30, 45];

const OsnrGauge: React.FC<OsnrGaugeProps> = ({ gsnr, requiredOsnr, margin, maxValue = 45 }) => {
  // Layout constants
  const width = 160;
  const padding = 16;
  const cx = width / 2;
  const cy = 72;
  const radius = 58;
  const bgStroke = 4;
  const valueStroke = 6;

  const ARC_START = Math.PI; // left (180 degrees)
  const ARC_END = 0;        // right (0 degrees)

  // Map a dB value to an angle on the arc
  const dbToAngle = (db: number) => {
    const norm = Math.max(0, Math.min(1, db / maxValue));
    return ARC_START - norm * (ARC_START - ARC_END);
  };

  // Value arc
  const clampedGsnr = Math.max(0, Math.min(maxValue, gsnr));
  const valueAngle = dbToAngle(clampedGsnr);

  // Threshold
  const thresholdAngle = dbToAngle(Math.min(requiredOsnr, maxValue));

  // Needle (reuse valueAngle — same position as value arc end)
  const needleLength = radius * 0.9;
  const needleTip = polarToCartesian(cx, cy, needleLength, valueAngle);

  // Color based on margin
  const gaugeColor = margin >= 3 ? '#22c55e' : margin >= 0 ? '#eab308' : '#ef4444';

  // Threshold marker endpoints (crosses through the track)
  const threshInner = polarToCartesian(cx, cy, radius - 8, thresholdAngle);
  const threshOuter = polarToCartesian(cx, cy, radius + 8, thresholdAngle);
  const threshLabel = polarToCartesian(cx, cy, radius + 16, thresholdAngle);

  // viewBox with padding so edge labels don't clip
  const vbX = -padding;
  const vbY = -padding;
  const vbW = width + padding * 2;
  const vbH = cy + 36 + padding;

  return (
    <div
      className="flex flex-col items-center"
      role="meter"
      aria-valuenow={Math.round(gsnr * 10) / 10}
      aria-valuemin={0}
      aria-valuemax={maxValue}
      aria-label={`OSNR: ${gsnr.toFixed(1)} dB`}
      data-testid="osnr-gauge"
    >
      <svg width="100%" viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet">
        {/* Background track (thin, low opacity) */}
        <path
          d={describeArc(cx, cy, radius, ARC_START, ARC_END)}
          fill="none"
          stroke="var(--color-border, #6b7280)"
          strokeWidth={bgStroke}
          strokeLinecap="round"
          opacity={0.25}
        />

        {/* Value arc (slightly thicker, health color) */}
        {clampedGsnr > 0.5 && (
          <path
            d={describeArc(cx, cy, radius, ARC_START, valueAngle)}
            fill="none"
            stroke={gaugeColor}
            strokeWidth={valueStroke}
            strokeLinecap="round"
          />
        )}

        {/* Tick marks and labels */}
        {GAUGE_TICKS.map((tick) => {
          const angle = dbToAngle(tick);
          const inner = polarToCartesian(cx, cy, radius - 6, angle);
          const outer = polarToCartesian(cx, cy, radius + 6, angle);
          const labelPt = polarToCartesian(cx, cy, radius + 16, angle);
          return (
            <g key={tick}>
              <line
                x1={inner.x} y1={inner.y}
                x2={outer.x} y2={outer.y}
                stroke="var(--color-border, #6b7280)"
                strokeWidth={1}
                opacity={0.4}
              />
              <text
                x={labelPt.x}
                y={labelPt.y + 3}
                textAnchor="middle"
                className="fill-text-muted"
                style={{ fontSize: '9px' }}
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Required OSNR threshold marker (orange) */}
        <line
          x1={threshInner.x} y1={threshInner.y}
          x2={threshOuter.x} y2={threshOuter.y}
          stroke="#f97316"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <text
          x={threshLabel.x}
          y={threshLabel.y - 2}
          textAnchor="middle"
          fill="#f97316"
          style={{ fontSize: '8px', fontWeight: 600 }}
        >
          Req
        </text>

        {/* Needle (dark, thin, distinct from colored arc) */}
        <line
          x1={cx} y1={cy}
          x2={needleTip.x} y2={needleTip.y}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        {/* Needle center dot */}
        <circle cx={cx} cy={cy} r={3} fill="currentColor" />

        {/* Center value text */}
        <text
          x={cx} y={cy + 20}
          textAnchor="middle"
          className="fill-text-primary"
          style={{ fontSize: '16px', fontWeight: 700 }}
        >
          {gsnr.toFixed(1)} dB
        </text>

        {/* GSNR sub-label */}
        <text
          x={cx} y={cy + 33}
          textAnchor="middle"
          className="fill-text-muted"
          style={{ fontSize: '10px' }}
        >
          GSNR
        </text>
      </svg>
    </div>
  );
};

// ============================================================================
// LINK BUDGET TABLE
// ============================================================================

interface LinkBudgetRowProps {
  span: SpanOSNRResult;
}

const LinkBudgetRow: React.FC<LinkBudgetRowProps> = ({ span }) => (
  <tr className="border-border/50 border-b text-xs">
    <td className="px-2 py-1.5 text-text-muted">Span {span.spanIndex + 1}</td>
    <td className="px-2 py-1.5 text-right text-text-primary">{span.spanLength.toFixed(1)}</td>
    <td className="px-2 py-1.5 text-right text-red-400">-{span.spanLoss.toFixed(1)}</td>
    <td className="px-2 py-1.5 text-right text-green-400">
      {span.amplifierGain > 0 ? `+${span.amplifierGain.toFixed(1)}` : '-'}
    </td>
    <td className="px-2 py-1.5 text-right text-text-primary">{span.signalPowerOut.toFixed(1)}</td>
    <td className="px-2 py-1.5 text-right text-text-primary">
      {isFinite(span.osnrAfterSpan) ? span.osnrAfterSpan.toFixed(1) : '-'}
    </td>
    <td className="px-2 py-1.5 text-right text-text-primary">
      {isFinite(span.cumulativeOSNR) ? span.cumulativeOSNR.toFixed(1) : '-'}
    </td>
  </tr>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const OsnrAnalysisPanel: React.FC<OsnrAnalysisPanelProps> = ({ result, className }) => {
  const [eolMargin, setEolMargin] = useState(result.eolMargin);

  // Effective margin changes based on EoL slider
  const effectiveEol = eolMargin;
  const effectiveMargin = result.finalGSNR - result.requiredOSNR - effectiveEol;
  const effectiveFeasible = effectiveMargin >= 0;

  const marginColor = useMemo(() => {
    if (effectiveMargin >= 3) return 'text-green-400';
    if (effectiveMargin >= 0) return 'text-yellow-400';
    return 'text-red-400';
  }, [effectiveMargin]);

  return (
    <TooltipProvider>
    <div className={cn('space-y-4', className)} data-testid="osnr-analysis-panel">
      {/* Pass/Fail Banner */}
      <div
        className={cn(
          'p-3 rounded-lg border flex items-center gap-3',
          effectiveFeasible
            ? 'bg-green-500/5 border-green-500/20'
            : 'bg-red-500/5 border-red-500/20'
        )}
      >
        {effectiveFeasible ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
        ) : (
          <XCircle className="h-5 w-5 shrink-0 text-red-400" />
        )}
        <div className="flex-1">
          <p className={cn('font-medium text-sm', effectiveFeasible ? 'text-green-400' : 'text-red-400')}>
            {effectiveFeasible ? 'OSNR Feasible' : 'OSNR Infeasible'}
          </p>
          <p className="text-xs text-text-muted">
            System margin: <span className={marginColor}>{effectiveMargin.toFixed(1)} dB</span>
            {' '}(required: {result.requiredOSNR.toFixed(1)} dB + {eolMargin.toFixed(1)} dB EoL)
          </p>
        </div>
      </div>

      {/* EoL Margin Slider */}
      <div className="space-y-2" data-testid="osnr-eol-toggle">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="osnr-eol-slider" className="text-text-secondary">
            End-of-Life Margin
          </label>
          <span className="font-mono text-text-primary">{eolMargin.toFixed(1)} dB</span>
        </div>
        <input
          id="osnr-eol-slider"
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={eolMargin}
          onChange={(e) => setEolMargin(parseFloat(e.target.value))}
          className="h-1.5 w-full accent-accent"
          data-testid="osnr-eol-slider"
        />
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>0 dB</span>
          <span>10 dB</span>
        </div>
      </div>

      {/* Stats Row + Gauge */}
      <div className="flex gap-4">
        {/* Stats */}
        <div className="grid flex-1 grid-cols-2 gap-2">
          <StatMini label="Total Distance" value={`${result.totalDistance.toFixed(1)} km`} />
          <StatMini label="Total Loss" value={`${result.totalLoss.toFixed(1)} dB`} />
          <StatMini label="Final GSNR" value={`${result.finalGSNR.toFixed(1)} dB`} accent tooltip="1/GSNR = 1/Tx_OSNR + 1/Cascaded_OSNR + 1/NLI_SNR" />
          <StatMini label="System Margin" value={`${effectiveMargin.toFixed(1)} dB`} color={marginColor} tooltip="Margin = GSNR − Required OSNR − EoL Margin" />
        </div>

        {/* Gauge */}
        <div className="w-36 shrink-0">
          <OsnrGauge
            gsnr={result.finalGSNR}
            requiredOsnr={result.requiredOSNR + effectiveEol}
            margin={effectiveMargin}
          />
        </div>
      </div>

      {/* Link Budget Table */}
      {result.spanResults.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-medium text-text-secondary">Link Budget</span>
          </div>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full">
              <thead>
                <tr className="bg-secondary/50 text-[10px] uppercase text-text-muted">
                  <th className="px-2 py-1.5 text-left font-medium">Element</th>
                  <th className="px-2 py-1.5 text-right font-medium">Length (km)</th>
                  <th className="px-2 py-1.5 text-right font-medium">Loss (dB)<FormulaTooltip formula="Span Loss = α (dB/km) × distance + connector losses + splice losses" /></th>
                  <th className="px-2 py-1.5 text-right font-medium">Gain (dB)<FormulaTooltip formula="EDFA gain compensating span loss" /></th>
                  <th className="px-2 py-1.5 text-right font-medium">Pwr Out (dBm)</th>
                  <th className="px-2 py-1.5 text-right font-medium">Span OSNR<FormulaTooltip formula="OSNR_amp = P_signal / P_ASE, where P_ASE = (NF × G − 1) × h × f × B_ref" /></th>
                  <th className="px-2 py-1.5 text-right font-medium">Cumulative<FormulaTooltip formula="Cascaded: 1/OSNR_total = Σ(1/OSNR_i)" /></th>
                </tr>
              </thead>
              <tbody>
                {result.spanResults.map((span) => (
                  <LinkBudgetRow key={span.spanIndex} span={span} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-1">
          {result.warnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-yellow-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};

// ============================================================================
// MINI STAT CARD
// ============================================================================

interface StatMiniProps {
  label: string;
  value: string;
  accent?: boolean;
  color?: string;
  tooltip?: string;
}

const StatMini: React.FC<StatMiniProps> = ({ label, value, accent, color, tooltip }) => (
  <div className="bg-secondary/50 rounded border border-border p-2">
    <div className="text-[10px] uppercase text-text-muted">
      {label}
      {tooltip && <FormulaTooltip formula={tooltip} />}
    </div>
    <div className={cn('text-sm font-semibold', color || (accent ? 'text-accent' : 'text-text-primary'))}>
      {value}
    </div>
  </div>
);

export default OsnrAnalysisPanel;
