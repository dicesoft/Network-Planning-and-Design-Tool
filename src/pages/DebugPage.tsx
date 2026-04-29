import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { StateInspector, ActionTester, EventLog, DebugToolbar, TabbedTester } from '@/components/debug';

export const DebugPage: React.FC = () => {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshKey, setRefreshKey] = useState(0);

  // Trigger refresh for all debug components
  const handleRefresh = useCallback(() => {
    setLastRefresh(new Date());
    setRefreshKey((k) => k + 1);
  }, []);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      handleRefresh();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, handleRefresh]);

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-elevated px-4 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-text-primary">Debug Dashboard</h1>
          <span className="text-xs text-text-muted">Network Planning Tool</span>
        </div>
        <div className="flex items-center gap-4">
          <DebugToolbar
            onRefresh={handleRefresh}
            autoRefresh={autoRefresh}
            onAutoRefreshChange={setAutoRefresh}
            lastRefresh={lastRefresh}
          />
          <Link
            to="/"
            className="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary-light"
          >
            ← Back to Editor
          </Link>
        </div>
      </header>

      {/* Main Content - 2x2 Grid with TabbedTester spanning 2 columns */}
      <main className="flex-1 overflow-hidden p-4">
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-4">
          {/* State Inspector - Top Left */}
          <div className="overflow-hidden">
            <StateInspector refreshKey={refreshKey} />
          </div>

          {/* Tabbed Tester - Top Center & Right (spans 2 columns) */}
          <div className="col-span-2 overflow-hidden">
            <TabbedTester refreshKey={refreshKey} />
          </div>

          {/* Action Tester - Bottom Left */}
          <div className="overflow-hidden">
            <ActionTester />
          </div>

          {/* Event Log - Bottom Center & Right (spans 2 columns) */}
          <div className="col-span-2 overflow-hidden">
            <EventLog />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex justify-between border-t border-border bg-elevated px-4 py-2 text-xs text-text-muted">
        <span>Debug Mode - State changes are persisted to localStorage</span>
        <span>Press F12 for browser DevTools</span>
      </footer>
    </div>
  );
};

export default DebugPage;
