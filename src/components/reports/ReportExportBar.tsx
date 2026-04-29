import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { FileJson, FileSpreadsheet, Printer } from 'lucide-react';
import type { ExportFormat } from '@/types/reports';

interface ReportExportBarProps {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
}

/**
 * Export bar with PDF, CSV, and JSON export buttons.
 * PDF export temporarily switches to light theme for print readability,
 * then restores the original theme after printing.
 */
export const ReportExportBar: React.FC<ReportExportBarProps> = ({
  onExport,
  disabled = false,
}) => {
  const handlePdfExport = useCallback(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');

    if (wasDark) {
      root.classList.remove('dark');
      root.classList.add('light');
    }

    // Defer print to allow repaint with light theme
    requestAnimationFrame(() => {
      onExport('pdf');

      // Restore original theme after print dialog closes
      if (wasDark) {
        // Use a small timeout to let the print dialog finish
        setTimeout(() => {
          root.classList.remove('light');
          root.classList.add('dark');
        }, 500);
      }
    });
  }, [onExport]);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handlePdfExport}
        disabled={disabled}
      >
        <Printer className="mr-1.5 h-3.5 w-3.5" />
        Print / PDF
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onExport('csv')}
        disabled={disabled}
      >
        <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
        Export CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onExport('json')}
        disabled={disabled}
      >
        <FileJson className="mr-1.5 h-3.5 w-3.5" />
        Export JSON
      </Button>
    </div>
  );
};
