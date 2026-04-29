import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ReportExportBar } from './ReportExportBar';
import { ArrowLeft, Loader2, Play } from 'lucide-react';
import type { ReportPhase, ExportFormat } from '@/types/reports';

interface ReportShellProps {
  /** Report title displayed in the header */
  title: string;
  /** Called when back button is clicked */
  onBack: () => void;
  /** Configuration UI rendered in the "configure" phase */
  configPanel?: React.ReactNode;
  /** Results UI rendered in the "results" phase */
  resultsPanel?: React.ReactNode;
  /** Called when user clicks "Run Report"; resolves when report is ready */
  onRun: () => Promise<void> | void;
  /** Called when user exports; format is 'pdf', 'csv', or 'json' */
  onExport: (format: ExportFormat) => void;
  /** Skip the configure phase entirely (go straight to running) */
  skipConfigure?: boolean;
}

/**
 * ReportShell provides the Configure -> Running -> Results flow.
 *
 * Phase transitions:
 * - configure: Shows configPanel + "Run Report" button
 * - running: Shows spinner
 * - results: Shows resultsPanel + export bar
 */
export const ReportShell: React.FC<ReportShellProps> = ({
  title,
  onBack,
  configPanel,
  resultsPanel,
  onRun,
  onExport,
  skipConfigure = false,
}) => {
  const [phase, setPhase] = useState<ReportPhase>(
    skipConfigure ? 'running' : 'configure'
  );

  const handleRun = useCallback(async () => {
    setPhase('running');
    try {
      await onRun();
      setPhase('results');
    } catch {
      // On error, go back to configure
      setPhase('configure');
    }
  }, [onRun]);

  // Auto-run if skipConfigure was set
  React.useEffect(() => {
    if (skipConfigure && phase === 'running') {
      handleRun();
    }
    // Only run on mount when skipConfigure is true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-elevated px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        </div>

        {phase === 'results' && <ReportExportBar onExport={onExport} />}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {phase === 'configure' && (
          <div className="mx-auto max-w-2xl p-6">
            {configPanel}
            <div className="mt-6 flex justify-end">
              <Button onClick={handleRun}>
                <Play className="mr-1.5 h-4 w-4" />
                Run Report
              </Button>
            </div>
          </div>
        )}

        {phase === 'running' && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-sm text-text-secondary">Generating report...</p>
          </div>
        )}

        {phase === 'results' && (
          <div className="report-results p-6">{resultsPanel}</div>
        )}
      </div>
    </div>
  );
};
