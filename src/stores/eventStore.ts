import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { setupCrossTabSync, notifyCrossTabSync, markStoreRehydrated } from '@/lib/cross-tab-sync';
import { createIndexedDBStorage } from '@/lib/indexeddb-storage';

/**
 * Event log entry interface
 */
export interface EventLogEntry {
  id: number;
  timestamp: string; // ISO string for serialization
  type: 'network' | 'ui' | 'algorithm' | 'system';
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Event store state interface
 */
interface EventState {
  // Event log entries
  events: EventLogEntry[];
  maxEvents: number;
  eventIdCounter: number;

  // Actions
  addEvent: (
    type: EventLogEntry['type'],
    category: string,
    message: string,
    details?: Record<string, unknown>
  ) => void;
  clearEvents: () => void;
  setMaxEvents: (max: number) => void;
}

/**
 * Global event store for cross-page event capture
 * Events persist in sessionStorage across route changes
 *
 * NOTE: No hydration guard needed - Zustand persist handles merging automatically
 */
export const useEventStore = create<EventState>()(
  devtools(
    persist(
      (set) => ({
        events: [],
        maxEvents: 200,
        eventIdCounter: 0,

        addEvent: (type, category, message, details) => {
          // Always add events - no hydration guard needed
          console.log(`[eventStore] Adding event: [${type}] ${category}: ${message}`);

          set((state) => {
            const newEvent: EventLogEntry = {
              id: state.eventIdCounter,
              timestamp: new Date().toISOString(),
              type,
              category,
              message,
              details,
            };

            // Keep only the last maxEvents entries
            const newEvents = [...state.events, newEvent].slice(-state.maxEvents);

            console.log(`[eventStore] Total events now: ${newEvents.length}`);

            return {
              events: newEvents,
              eventIdCounter: state.eventIdCounter + 1,
            };
          });
        },

        clearEvents: () => {
          console.log('[eventStore] Clearing all events');
          set({ events: [], eventIdCounter: 0 });
        },

        setMaxEvents: (max) => {
          set((state) => ({
            maxEvents: max,
            events: state.events.slice(-max),
          }));
        },
      }),
      {
        name: 'event-store',
        storage: createJSONStorage(() => createIndexedDBStorage()),
        onRehydrateStorage: () => () => {
          markStoreRehydrated('event-store');
        },
      }
    ),
    { name: 'eventStore' }
  )
);

/**
 * Helper function to log network events
 */
export const logNetworkEvent = (category: string, message: string, details?: Record<string, unknown>) => {
  console.log(`[App] logNetworkEvent called: ${category} - ${message}`);
  useEventStore.getState().addEvent('network', category, message, details);
};

/**
 * Helper function to log UI events
 */
export const logUIEvent = (category: string, message: string, details?: Record<string, unknown>) => {
  console.log(`[App] logUIEvent called: ${category} - ${message}`);
  useEventStore.getState().addEvent('ui', category, message, details);
};

/**
 * Helper function to log algorithm events
 */
export const logAlgorithmEvent = (category: string, message: string, details?: Record<string, unknown>) => {
  console.log(`[App] logAlgorithmEvent called: ${category} - ${message}`);
  useEventStore.getState().addEvent('algorithm', category, message, details);
};

/**
 * Helper function to log system events
 */
export const logSystemEvent = (category: string, message: string, details?: Record<string, unknown>) => {
  console.log(`[App] logSystemEvent called: ${category} - ${message}`);
  useEventStore.getState().addEvent('system', category, message, details);
};

/**
 * Setup cross-tab synchronization for event store.
 * Uses BroadcastChannel (with storage event fallback).
 */
export const setupEventStoreCrossTabSync = () => {
  if (typeof window === 'undefined') return;

  const cleanupSync = setupCrossTabSync('event-store', useEventStore);
  const unsubscribe = useEventStore.subscribe(() => {
    notifyCrossTabSync('event-store');
  });

  return () => {
    cleanupSync();
    unsubscribe();
  };
};
