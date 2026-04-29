/**
 * One-time migration from localStorage to IndexedDB.
 *
 * Strategy:
 *   1. On first load, detect if data exists in localStorage for known store keys.
 *   2. Copy each key's value into IndexedDB.
 *   3. Set a migration flag with session counter.
 *   4. Keep localStorage data for 3 sessions as a safety net.
 *   5. After the safety period, clean up localStorage copies.
 *
 * This module must be called in main.tsx BEFORE stores are initialised,
 * because Zustand persist will read from the configured storage on init.
 */
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { atlasStore } from './idb-store-singleton';
import { flushPendingWrites } from './indexeddb-storage';

/** localStorage keys that hold Zustand-persisted state. */
const STORE_KEYS = [
  'network-topology-storage',
  'service-store',
  'settings-store',
  'theme-storage',
  'event-store',
];

const MIGRATION_FLAG_KEY = 'atlas-idb-migration';
const SAFETY_SESSIONS = 3;

interface MigrationFlag {
  migrated: boolean;
  sessionCount: number;
  localStorageCleared: boolean;
}

function getMigrationFlag(): MigrationFlag | null {
  try {
    const raw = localStorage.getItem(MIGRATION_FLAG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setMigrationFlag(flag: MigrationFlag): void {
  try {
    localStorage.setItem(MIGRATION_FLAG_KEY, JSON.stringify(flag));
  } catch {
    // Ignore
  }
}

/**
 * Run the localStorage -> IndexedDB migration.
 *
 * Returns:
 *  - `'migrated'`  if data was copied this session
 *  - `'already-done'` if migration was already performed
 *  - `'no-data'`   if there was nothing to migrate
 *  - `'unavailable'` if IndexedDB is not usable
 */
export async function migrateLocalStorageToIndexedDB(): Promise<
  'migrated' | 'already-done' | 'no-data' | 'unavailable'
> {
  // Guard: IndexedDB must exist
  if (typeof indexedDB === 'undefined' || !atlasStore) {
    return 'unavailable';
  }

  const flag = getMigrationFlag();

  // --- Already migrated ---
  if (flag?.migrated) {
    // Bump session counter
    const updatedFlag: MigrationFlag = {
      ...flag,
      sessionCount: flag.sessionCount + 1,
      localStorageCleared: flag.localStorageCleared,
    };

    // If user actively chose localStorage, don't clean up localStorage data
    const storageBackend = localStorage.getItem('atlas-storage-backend');
    if (storageBackend === 'localstorage') {
      setMigrationFlag(updatedFlag);
      return 'already-done';
    }

    // Safety period expired — clear old localStorage copies
    if (!flag.localStorageCleared && updatedFlag.sessionCount >= SAFETY_SESSIONS) {
      for (const key of STORE_KEYS) {
        try {
          localStorage.removeItem(key);
        } catch {
          // Ignore
        }
      }
      updatedFlag.localStorageCleared = true;
    }

    setMigrationFlag(updatedFlag);
    return 'already-done';
  }

  // --- Check if there's anything in localStorage to migrate ---
  const keysWithData: string[] = [];
  for (const key of STORE_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value) {
        keysWithData.push(key);
      }
    } catch {
      // Ignore
    }
  }

  if (keysWithData.length === 0) {
    // No localStorage data — mark as migrated (nothing to do)
    setMigrationFlag({ migrated: true, sessionCount: 1, localStorageCleared: true });
    return 'no-data';
  }

  // --- Perform migration ---
  try {
    for (const key of keysWithData) {
      const value = localStorage.getItem(key);
      if (value) {
        // Check if IndexedDB already has data for this key (skip if so)
        const existing = await idbGet<string>(key, atlasStore);
        if (!existing) {
          await idbSet(key, value, atlasStore);
        }
      }
    }

    setMigrationFlag({ migrated: true, sessionCount: 1, localStorageCleared: false });
    return 'migrated';
  } catch (err) {
    console.warn('[StorageMigration] Migration failed, stores will continue using fallback:', err);
    return 'unavailable';
  }
}

/**
 * Transfer data between storage backends (IndexedDB <-> localStorage).
 * Used when the user switches the active storage backend in ResourceMonitor.
 */
export async function transferStorageData(
  from: 'indexeddb' | 'localstorage',
  to: 'indexeddb' | 'localstorage'
): Promise<{ success: boolean; error?: string }> {
  if (from === to) return { success: true };

  try {
    if (!atlasStore) return { success: false, error: 'IndexedDB not available' };

    // Flush any pending debounced writes so IDB has the latest data
    await flushPendingWrites();

    let transferredCount = 0;
    for (const key of STORE_KEYS) {
      if (from === 'indexeddb' && to === 'localstorage') {
        const value = await idbGet<string>(key, atlasStore);
        if (value) {
          localStorage.setItem(key, value);
          transferredCount++;
        }
      } else {
        const value = localStorage.getItem(key);
        if (value) {
          await idbSet(key, value, atlasStore);
          transferredCount++;
        }
      }
    }

    if (transferredCount === 0) {
      return { success: false, error: 'No data found in source backend' };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Transfer failed' };
  }
}
