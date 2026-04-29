/**
 * IndexedDB Storage Adapter for Zustand persist middleware.
 *
 * Uses idb-keyval for a tiny (~600B) abstraction over IndexedDB.
 * Falls back to localStorage when IndexedDB is unavailable.
 *
 * Key stability features (Sprint 5):
 *   - 300ms debounced writes: coalesces rapid setItem calls
 *   - Monotonic version counter: detects and rejects stale writes
 *   - Write error events: emits 'indexeddb-write-error' for toast notifications
 *   - Auto-fallback: switches to localStorage on write failure
 *
 * Zustand's persist StateStorage interface expects:
 *   getItem(name: string): string | null | Promise<string | null>
 *   setItem(name: string, value: string): void | Promise<void>
 *   removeItem(name: string): void | Promise<void>
 */
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';
import { atlasStore } from './idb-store-singleton';

/** Feature-detect IndexedDB availability. */
let indexedDBAvailable: boolean | null = null;

/** Whether persist writes are temporarily suppressed (e.g. during chunked loading). */
let persistSuppressed = false;

/** Suppress persist writes. Calls to setItem become no-ops. */
export function suppressPersist(): void {
  persistSuppressed = true;
}

/** Resume persist writes after suppression. */
export function resumePersist(): void {
  persistSuppressed = false;
}

/** Check if persist writes are currently suppressed. */
export function isPersistSuppressed(): boolean {
  return persistSuppressed;
}

async function isIndexedDBAvailable(): Promise<boolean> {
  if (indexedDBAvailable !== null) return indexedDBAvailable;

  // Check user preference for storage backend (set via debug ResourceMonitor)
  if (typeof localStorage !== 'undefined') {
    const preference = localStorage.getItem('atlas-storage-backend');
    if (preference === 'localstorage') {
      indexedDBAvailable = false;
      return false;
    }
  }

  if (typeof indexedDB === 'undefined') {
    indexedDBAvailable = false;
    return false;
  }

  try {
    // Probe with a real read to detect private browsing / disabled IDB
    await idbGet('__probe__', atlasStore!);
    indexedDBAvailable = true;
  } catch {
    indexedDBAvailable = false;
  }

  return indexedDBAvailable;
}

/** Retrieve the current storage backend status. */
export function getStorageBackend(): 'indexeddb' | 'localstorage' | 'unknown' {
  if (indexedDBAvailable === true) return 'indexeddb';
  if (indexedDBAvailable === false) return 'localstorage';
  return 'unknown';
}

/**
 * Safe localStorage fallback (same as the existing safeLocalStorage in networkStore).
 */
const localStorageFallback: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
        console.warn(`[IndexedDB-Storage] localStorage fallback quota exceeded for key "${name}".`);
        window.dispatchEvent(new CustomEvent('localStorage-quota-exceeded', {
          detail: { store: name, sizeBytes: value.length },
        }));
      }
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Ignore
    }
  },
};

/**
 * Debounce state per store key for setItem.
 * Coalesces rapid writes into a single IndexedDB write.
 */
interface PendingWrite {
  timer: ReturnType<typeof setTimeout>;
  version: number;
  value: string;
  resolve: () => void;
  reject: (err: unknown) => void;
}

const pendingWrites = new Map<string, PendingWrite>();
const PERSIST_DEBOUNCE_MS = 300;

/**
 * Monotonic version counter per key.
 * Incremented on each setItem call; stale writes (with older versions) are rejected.
 */
const writeVersions = new Map<string, number>();

function getNextVersion(name: string): number {
  const current = writeVersions.get(name) ?? 0;
  const next = current + 1;
  writeVersions.set(name, next);
  return next;
}

/**
 * Create an IndexedDB-backed StateStorage adapter for a given store name.
 * Falls back transparently to localStorage if IndexedDB is not available.
 *
 * setItem is debounced at 300ms — rapid writes coalesce into the last value.
 */
export function createIndexedDBStorage(): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      const available = await isIndexedDBAvailable();
      if (!available) {
        return localStorageFallback.getItem(name) as string | null;
      }
      try {
        const value = await idbGet<string>(name, atlasStore!);
        return value ?? null;
      } catch (err) {
        console.warn(`[IndexedDB-Storage] getItem("${name}") failed, falling back to localStorage:`, err);
        return localStorageFallback.getItem(name) as string | null;
      }
    },

    setItem: (name: string, value: string): Promise<void> => {
      // Suppressed during bulk loading — no-op
      if (persistSuppressed) return Promise.resolve();

      const version = getNextVersion(name);

      // Cancel any pending debounce for this key
      const existing = pendingWrites.get(name);
      if (existing) {
        clearTimeout(existing.timer);
        // Resolve the previous promise (it was superseded, not failed)
        existing.resolve();
        pendingWrites.delete(name);
      }

      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(async () => {
          pendingWrites.delete(name);

          // Stale write check: if a newer version was requested, skip
          const currentVersion = writeVersions.get(name) ?? 0;
          if (version < currentVersion) {
            resolve();
            return;
          }

          const available = await isIndexedDBAvailable();
          if (!available) {
            localStorageFallback.setItem(name, value);
            resolve();
            return;
          }

          try {
            await idbSet(name, value, atlasStore!);
            resolve();
          } catch (err) {
            console.warn(`[IndexedDB-Storage] setItem("${name}") failed, falling back to localStorage:`, err);
            // Reset availability so future operations can re-probe
            indexedDBAvailable = false;
            // Emit error event for toast notification
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('indexeddb-write-error', {
                detail: { store: name, error: err },
              }));
            }
            localStorageFallback.setItem(name, value);
            resolve();
          }
        }, PERSIST_DEBOUNCE_MS);

        pendingWrites.set(name, { timer, version, value, resolve, reject });
      });
    },

    removeItem: async (name: string): Promise<void> => {
      const available = await isIndexedDBAvailable();
      if (!available) {
        localStorageFallback.removeItem(name);
        return;
      }
      try {
        await idbDel(name, atlasStore!);
      } catch (err) {
        console.warn(`[IndexedDB-Storage] removeItem("${name}") failed, falling back to localStorage:`, err);
        localStorageFallback.removeItem(name);
      }
    },
  };
}

/**
 * Flush all pending debounced writes to IndexedDB immediately.
 * Use before operations that read from IDB (e.g., transferStorageData)
 * to ensure all in-flight data is persisted.
 */
export async function flushPendingWrites(): Promise<void> {
  const entries = Array.from(pendingWrites.entries());
  pendingWrites.clear();

  for (const [name, pending] of entries) {
    clearTimeout(pending.timer);

    const available = await isIndexedDBAvailable();
    if (!available) {
      localStorageFallback.setItem(name, pending.value);
    } else {
      try {
        await idbSet(name, pending.value, atlasStore!);
      } catch {
        localStorageFallback.setItem(name, pending.value);
      }
    }
    pending.resolve();
  }
}

/**
 * Flush all pending debounced writes to localStorage synchronously.
 * Designed for the `beforeunload` handler where async operations cannot be awaited.
 * This ensures data is not lost when the user closes or refreshes the page.
 */
export function flushPendingWritesToLocalStorage(): void {
  // Skip if persist is suppressed (e.g. during storage backend switch)
  if (persistSuppressed) return;

  const entries = Array.from(pendingWrites.entries());
  pendingWrites.clear();

  for (const [name, pending] of entries) {
    clearTimeout(pending.timer);
    localStorageFallback.setItem(name, pending.value);
    pending.resolve();
  }
}

/**
 * Estimate IndexedDB storage usage in bytes.
 * Uses the StorageManager API if available, otherwise returns 0.
 */
export async function getIndexedDBUsageBytes(): Promise<number> {
  if (navigator?.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return estimate.usage ?? 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Reset the cached availability flag (useful for tests).
 * Also clears any pending writes and version counters.
 */
export function resetIndexedDBAvailabilityCache(): void {
  indexedDBAvailable = null;
  persistSuppressed = false;
  // Clear pending writes
  for (const pending of pendingWrites.values()) {
    clearTimeout(pending.timer);
    pending.resolve();
  }
  pendingWrites.clear();
  writeVersions.clear();
}
