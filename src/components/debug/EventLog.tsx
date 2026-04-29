import React, { useEffect, useRef } from 'react';
import { useEventStore, EventLogEntry } from '@/stores/eventStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const EventLog: React.FC = () => {
  const events = useEventStore((state) => state.events);
  const clearEvents = useEventStore((state) => state.clearEvents);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const getTypeColor = (type: EventLogEntry['type']) => {
    switch (type) {
      case 'network':
        return 'text-success';
      case 'ui':
        return 'text-info';
      case 'algorithm':
        return 'text-accent';
      case 'system':
        return 'text-warning';
      default:
        return 'text-text-muted';
    }
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-elevated">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-text-primary">
          Event Log ({events.length})
        </h2>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3 w-3"
            />
            Auto-scroll
          </label>
          <Button variant="secondary" size="sm" onClick={clearEvents}>
            Clear
          </Button>
        </div>
      </div>
      <div
        ref={logContainerRef}
        className="flex-1 space-y-1 overflow-auto p-2 font-mono text-xs"
      >
        {events.length === 0 ? (
          <div className="py-4 text-center text-text-muted">
            Waiting for events...
            <div className="mt-1 text-[10px] text-text-muted">
              Events from main app and debug page are captured here
            </div>
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className={cn('flex gap-2', getTypeColor(event.type))}
            >
              <span className="shrink-0 text-text-muted">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span className="shrink-0 text-text-tertiary">[{event.type}]</span>
              <span className="shrink-0 text-text-muted">{event.category}:</span>
              <span className="break-all">{event.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
