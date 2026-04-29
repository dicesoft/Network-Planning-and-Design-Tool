/**
 * ExhaustiveProgress - Progress UI for In-Flight Exhaustive Simulation
 *
 * Shows: progress bar with absolute count ("340/1225"),
 * current scenario label, elapsed time, cancel button.
 */

import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { useSimulationStore } from '@/stores/simulationStore';
import { Loader2 } from 'lucide-react';

export const ExhaustiveProgress: React.FC = () => {
  const progress = useSimulationStore((s) => s.exhaustiveProgress);
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    if (!progress?.startedAt) {
      setElapsed(0);
      return;
    }

    const startTime = new Date(progress.startedAt).getTime();
    const tick = () => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [progress?.startedAt]);

  if (!progress) return null;

  const pct = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const formatElapsed = (secs: number): string => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="border-accent/30 bg-accent/5 rounded-lg border p-4">
      {/* Header with spinner */}
      <div className="mb-3 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        <span className="text-sm font-semibold text-text-primary">
          Running Exhaustive Analysis
        </span>
      </div>

      {/* Progress bar */}
      <Progress value={pct} variant="auto" size="md" />

      {/* Stats row */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">
          {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}
        </span>
        <span className="text-xs text-text-tertiary">
          {pct}%
        </span>
        <span className="text-xs text-text-tertiary">
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* Current scenario label */}
      {progress.currentLabel && (
        <div className="mt-2 truncate text-[11px] text-text-muted">
          {progress.currentLabel}
        </div>
      )}
    </div>
  );
};

export default ExhaustiveProgress;
