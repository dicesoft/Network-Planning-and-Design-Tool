import * as React from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './tooltip';
import { cn } from '@/lib/utils';
import metricExplanations from '@/lib/metric-explanations.json';

type MetricExplanation = {
  label: string;
  description: string;
  formula?: string;
  denominator?: string;
};

const EXPLANATIONS = metricExplanations.explanations as Record<string, MetricExplanation>;

export interface MetricTooltipProps {
  /** Key into `metric-explanations.json#explanations`. */
  metric: string;
  /** Element rendered as the trigger. Defaults to a small ⓘ icon. */
  children?: React.ReactNode;
  /** Tooltip open delay in ms (Radix default: 300). */
  delayDuration?: number;
  className?: string;
}

/**
 * Wraps a Radix Tooltip whose content is sourced from
 * `src/lib/metric-explanations.json`. Falls back gracefully when an unknown
 * metric key is passed (renders the trigger only — no tooltip body).
 *
 * Accessibility: Radix wires up `aria-describedby` on focus.
 */
export const MetricTooltip: React.FC<MetricTooltipProps> = ({
  metric,
  children,
  delayDuration = 300,
  className,
}) => {
  const explanation = EXPLANATIONS[metric];

  const trigger = children ?? (
    <button
      type="button"
      aria-label={explanation ? `${explanation.label}: explain` : 'Explain'}
      className={cn(
        'inline-flex h-4 w-4 items-center justify-center rounded-full text-text-tertiary',
        'hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        className
      )}
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  );

  if (!explanation) {
    return <>{trigger}</>;
  }

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="max-w-xs whitespace-normal text-left" sideOffset={6}>
          <div className="space-y-1.5">
            <div className="text-sm font-semibold">{explanation.label}</div>
            <div className="text-xs leading-relaxed">{explanation.description}</div>
            {explanation.formula && (
              <div className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[11px]">
                {explanation.formula}
              </div>
            )}
            {explanation.denominator && (
              <div className="text-[11px] italic opacity-80">
                Denominator: {explanation.denominator}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

MetricTooltip.displayName = 'MetricTooltip';
