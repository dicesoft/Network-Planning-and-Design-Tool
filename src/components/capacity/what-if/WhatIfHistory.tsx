import React from 'react';
import { History, ChevronDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { AnalysisAction } from './WhatIfConfig';

// ============================================================================
// TYPES
// ============================================================================

export interface WhatIfHistoryEntry {
  id: string;
  timestamp: Date;
  action: AnalysisAction;
  serviceCount: number;
  summary: string;
}

export interface WhatIfHistoryProps {
  entries: WhatIfHistoryEntry[];
  onRecall: (entry: WhatIfHistoryEntry) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const WHATIF_HISTORY_MAX = 10;

let nextHistoryId = 1;

export function createHistoryId(): string {
  return `wh-${nextHistoryId++}`;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ============================================================================
// COMPONENT
// ============================================================================

export const WhatIfHistory: React.FC<WhatIfHistoryProps> = ({
  entries,
  onRecall,
}) => {
  if (entries.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <History className="h-3.5 w-3.5" />
          History ({entries.length})
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Recent Analyses</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {entries.map((entry) => (
          <DropdownMenuItem
            key={entry.id}
            onClick={() => onRecall(entry)}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <div className="flex w-full items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                <span
                  className={
                    entry.action === 'add'
                      ? 'bg-success/10 rounded px-1 py-0.5 text-[10px] text-success'
                      : 'bg-danger/10 rounded px-1 py-0.5 text-[10px] text-danger'
                  }
                >
                  {entry.action === 'add' ? 'ADD' : 'REM'}
                </span>
                {entry.serviceCount} service{entry.serviceCount !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-text-muted">
                <Clock className="h-2.5 w-2.5" />
                {formatTimestamp(entry.timestamp)}
              </span>
            </div>
            <span className="text-[11px] text-text-secondary">{entry.summary}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
