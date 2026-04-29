import React from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DebugToolbarProps {
  onRefresh: () => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (enabled: boolean) => void;
  lastRefresh: Date;
  isRefreshing?: boolean;
}

export const DebugToolbar: React.FC<DebugToolbarProps> = ({
  onRefresh,
  autoRefresh,
  onAutoRefreshChange,
  lastRefresh,
  isRefreshing = false,
}) => {
  return (
    <div className="flex items-center gap-4">
      <span className="text-xs text-text-muted">
        Last refresh: {lastRefresh.toLocaleTimeString()}
      </span>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => onAutoRefreshChange(e.target.checked)}
          className="h-3 w-3 rounded"
        />
        Auto-refresh (5s)
      </label>
      <button
        onClick={onRefresh}
        className="flex items-center gap-2 rounded bg-tertiary px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-elevated"
        title="Refresh all debug panels"
      >
        <RefreshCw
          size={14}
          className={cn(isRefreshing && 'animate-spin')}
        />
        Refresh All
      </button>
    </div>
  );
};
