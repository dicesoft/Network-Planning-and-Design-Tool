/**
 * Cross-Tab Synchronization via BroadcastChannel.
 *
 * Replaces the old window `storage` event listeners with BroadcastChannel
 * for faster, more reliable cross-tab sync. Falls back to the `storage`
 * event when BroadcastChannel is unavailable (e.g. older Safari).
 *
 * Key stability features (Sprint 5):
 *   - Sender tab ID: tabs ignore their own broadcasts to prevent feedback loops
 *   - Rehydrating guard: skips outgoing broadcasts during rehydrate
 *   - Debounced notify: coalesces rapid mutations into a single broadcast
 *   - Suppress/resume API: disables sync during bulk operations (chunked loading)
 *
 * Usage:
 *   setupCrossTabSync('network-topology-storage', useNetworkStore);
 *
 * The returned cleanup function removes the listener / closes the channel.
 */

/** Message format sent between tabs. */
export interface CrossTabSyncMessage {
  /** The Zustand persist storage key that was updated. */
  storeKey: string;
  /** Timestamp to aid dedup and debugging. */
  timestamp: number;
  /** Unique sender tab ID so the originator can ignore its own broadcast. */
  senderTabId: string;
}

/** Whether BroadcastChannel is supported in this environment. */
const broadcastChannelSupported =
  typeof BroadcastChannel !== 'undefined';

/**
 * Shared channel name for all store syncs.
 * Using a single channel avoids opening many channels.
 */
const CHANNEL_NAME = 'atlas-store-sync';

/** Unique ID for this tab, generated once at module load. */
let tabId: string =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

/** Lazily-created singleton channel. */
let sharedChannel: BroadcastChannel | null = null;

function getSharedChannel(): BroadcastChannel | null {
  if (!broadcastChannelSupported) return null;
  if (!sharedChannel) {
    sharedChannel = new BroadcastChannel(CHANNEL_NAME);
  }
  return sharedChannel;
}

/** Registry of rehydrate callbacks keyed by storeKey. */
const listeners = new Map<string, () => void>();

/**
 * Tracks which stores have completed their initial Zustand persist rehydration.
 * Before a store is marked as rehydrated, outgoing cross-tab broadcasts are
 * suppressed to prevent broadcasting empty default state.
 */
const rehydratedStores = new Set<string>();

/** Mark a store as having completed its initial rehydration from IndexedDB/localStorage. */
export function markStoreRehydrated(storeKey: string): void {
  rehydratedStores.add(storeKey);
}

/** Check if a store has completed initial rehydration (for testing). */
export function isStoreRehydrated(storeKey: string): boolean {
  return rehydratedStores.has(storeKey);
}

/** Whether the shared listener has been initialised. */
let listenerInitialised = false;

/**
 * Guard flag: true while a rehydrate() call is in progress.
 * When true, outgoing broadcasts from subscribe() should be suppressed
 * to prevent feedback loops.
 */
let isRehydrating = false;

/** Check whether we are currently inside a rehydrate cycle. */
export function getIsRehydrating(): boolean {
  return isRehydrating;
}

/**
 * Suppression flag for bulk operations (e.g. chunked loading).
 * When true, both broadcasts and incoming rehydrates are suspended.
 */
let suppressed = false;

/** Suppress cross-tab sync broadcasts and incoming rehydrates. */
export function suppressCrossTabSync(): void {
  suppressed = true;
}

/** Resume cross-tab sync after suppression. */
export function resumeCrossTabSync(): void {
  suppressed = false;
}

/** Check if cross-tab sync is currently suppressed. */
export function isCrossTabSyncSuppressed(): boolean {
  return suppressed;
}

function ensureSharedListener(): void {
  if (listenerInitialised) return;
  listenerInitialised = true;

  const channel = getSharedChannel();
  if (channel) {
    channel.onmessage = (event: MessageEvent<CrossTabSyncMessage>) => {
      const { storeKey, senderTabId } = event.data;

      // Ignore our own broadcasts
      if (senderTabId === tabId) return;

      // Ignore if sync is suppressed (bulk loading in progress)
      if (suppressed) return;

      const rehydrate = listeners.get(storeKey);
      if (rehydrate) {
        isRehydrating = true;
        try {
          rehydrate();
        } finally {
          isRehydrating = false;
        }
      }
    };
  }
}

/**
 * Debounce timers per storeKey for notifyCrossTabSync.
 * Coalesces rapid state changes into a single broadcast.
 */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const NOTIFY_DEBOUNCE_MS = 100;

/**
 * Notify other tabs that a store has been updated.
 * Debounced at 100ms — rapid mutations coalesce into a single broadcast.
 * Suppressed during rehydration and bulk loading to prevent feedback loops.
 */
export function notifyCrossTabSync(storeKey: string): void {
  // Skip if we are inside a rehydrate cycle or sync is suppressed
  if (isRehydrating || suppressed) return;
  // Skip if the store hasn't completed its initial rehydration yet —
  // prevents broadcasting empty default state before IndexedDB data loads
  if (!rehydratedStores.has(storeKey)) return;

  const channel = getSharedChannel();
  if (!channel) return;

  // Clear any pending debounce for this key
  const existing = debounceTimers.get(storeKey);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    storeKey,
    setTimeout(() => {
      debounceTimers.delete(storeKey);
      const message: CrossTabSyncMessage = {
        storeKey,
        timestamp: Date.now(),
        senderTabId: tabId,
      };
      try {
        channel.postMessage(message);
      } catch {
        // Channel may be closed; ignore
      }
    }, NOTIFY_DEBOUNCE_MS),
  );
}

/**
 * Set up cross-tab synchronization for a Zustand persist store.
 *
 * @param storeKey  The `name` used in the Zustand persist config.
 * @param store     The Zustand store (must have `.persist.rehydrate()`).
 * @returns A cleanup function that removes the listener.
 */
export function setupCrossTabSync(
  storeKey: string,
  store: { persist: { rehydrate: () => void | Promise<void> } },
): () => void {
  const rehydrate = () => {
    store.persist.rehydrate();
  };

  if (broadcastChannelSupported) {
    // BroadcastChannel path
    ensureSharedListener();
    listeners.set(storeKey, rehydrate);

    return () => {
      listeners.delete(storeKey);
      // Don't close the shared channel — other stores may still use it
    };
  }

  // Fallback: `storage` event (only fires for localStorage changes, not IndexedDB)
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === storeKey && event.newValue) {
      isRehydrating = true;
      try {
        rehydrate();
      } finally {
        isRehydrating = false;
      }
    }
  };
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener('storage', handleStorageEvent);
  };
}

/**
 * Close the shared BroadcastChannel and reset internal state.
 * Primarily for testing.
 */
export function resetCrossTabSync(): void {
  listeners.clear();
  rehydratedStores.clear();
  listenerInitialised = false;
  isRehydrating = false;
  suppressed = false;
  // Clear all debounce timers
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
  // Reset tab ID for test isolation
  tabId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;
  if (sharedChannel) {
    try {
      sharedChannel.close();
    } catch {
      // Ignore
    }
    sharedChannel = null;
  }
}
