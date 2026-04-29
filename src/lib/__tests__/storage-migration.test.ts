import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { get as idbGet, del as idbDel, createStore } from 'idb-keyval';
import { migrateLocalStorageToIndexedDB, transferStorageData } from '../storage-migration';

const atlasStore = createStore('atlas-network-db', 'zustand-persist');
const MIGRATION_FLAG_KEY = 'atlas-idb-migration';

const STORE_KEYS = [
  'network-topology-storage',
  'service-store',
  'settings-store',
  'theme-storage',
  'event-store',
];

describe('Storage Migration (localStorage -> IndexedDB)', () => {
  beforeEach(async () => {
    // Clear localStorage
    localStorage.clear();
    // Clear IDB keys to isolate tests (fake-indexeddb shares global state)
    for (const key of STORE_KEYS) {
      await idbDel(key, atlasStore);
    }
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return "no-data" when localStorage is empty', async () => {
    const result = await migrateLocalStorageToIndexedDB();
    expect(result).toBe('no-data');
  });

  it('should migrate localStorage data to IndexedDB', async () => {
    // Pre-populate localStorage
    const topologyData = JSON.stringify({ state: { topology: { nodes: [], edges: [] } } });
    localStorage.setItem('network-topology-storage', topologyData);

    const result = await migrateLocalStorageToIndexedDB();
    expect(result).toBe('migrated');

    // Verify data is in IndexedDB
    const idbValue = await idbGet<string>('network-topology-storage', atlasStore);
    expect(idbValue).toBe(topologyData);

    // Verify localStorage still has data (safety period)
    expect(localStorage.getItem('network-topology-storage')).toBe(topologyData);
  });

  it('should return "already-done" on subsequent calls', async () => {
    localStorage.setItem('network-topology-storage', '{"state":{}}');

    const first = await migrateLocalStorageToIndexedDB();
    expect(first).toBe('migrated');

    const second = await migrateLocalStorageToIndexedDB();
    expect(second).toBe('already-done');
  });

  it('should set migration flag after migration', async () => {
    localStorage.setItem('service-store', '{"services":[]}');

    await migrateLocalStorageToIndexedDB();

    const flag = JSON.parse(localStorage.getItem(MIGRATION_FLAG_KEY) || '{}');
    expect(flag.migrated).toBe(true);
    expect(flag.sessionCount).toBe(1);
    expect(flag.localStorageCleared).toBe(false);
  });

  it('should increment session counter on repeated calls', async () => {
    localStorage.setItem('settings-store', '{"settings":{}}');

    await migrateLocalStorageToIndexedDB(); // session 1
    await migrateLocalStorageToIndexedDB(); // session 2
    await migrateLocalStorageToIndexedDB(); // session 3

    const flag = JSON.parse(localStorage.getItem(MIGRATION_FLAG_KEY) || '{}');
    expect(flag.sessionCount).toBe(3);
  });

  it('should clear localStorage after safety period (3 sessions)', async () => {
    const data = '{"state":"value"}';
    localStorage.setItem('network-topology-storage', data);
    localStorage.setItem('service-store', data);

    await migrateLocalStorageToIndexedDB(); // session 1 (migrated)
    expect(localStorage.getItem('network-topology-storage')).toBe(data); // still there

    await migrateLocalStorageToIndexedDB(); // session 2
    expect(localStorage.getItem('network-topology-storage')).toBe(data); // still there

    await migrateLocalStorageToIndexedDB(); // session 3 -- clears
    expect(localStorage.getItem('network-topology-storage')).toBeNull();
    expect(localStorage.getItem('service-store')).toBeNull();

    const flag = JSON.parse(localStorage.getItem(MIGRATION_FLAG_KEY) || '{}');
    expect(flag.localStorageCleared).toBe(true);
  });

  it('should not overwrite existing IndexedDB data', async () => {
    // Pre-populate IndexedDB with newer data
    const { set: idbSet } = await import('idb-keyval');
    await idbSet('network-topology-storage', '{"newer":"data"}', atlasStore);

    // Put older data in localStorage
    localStorage.setItem('network-topology-storage', '{"older":"data"}');

    await migrateLocalStorageToIndexedDB();

    // IndexedDB should retain the newer data
    const idbValue = await idbGet<string>('network-topology-storage', atlasStore);
    expect(idbValue).toBe('{"newer":"data"}');
  });

  it('should migrate multiple store keys', async () => {
    localStorage.setItem('network-topology-storage', '{"net":"data"}');
    localStorage.setItem('service-store', '{"svc":"data"}');
    localStorage.setItem('settings-store', '{"set":"data"}');
    localStorage.setItem('theme-storage', '{"theme":"light"}');

    const result = await migrateLocalStorageToIndexedDB();
    expect(result).toBe('migrated');

    // Verify all keys are in IndexedDB
    expect(await idbGet<string>('network-topology-storage', atlasStore)).toBe('{"net":"data"}');
    expect(await idbGet<string>('service-store', atlasStore)).toBe('{"svc":"data"}');
    expect(await idbGet<string>('settings-store', atlasStore)).toBe('{"set":"data"}');
    expect(await idbGet<string>('theme-storage', atlasStore)).toBe('{"theme":"light"}');
  });
});

describe('transferStorageData', () => {
  beforeEach(async () => {
    localStorage.clear();
    for (const key of STORE_KEYS) {
      await idbDel(key, atlasStore);
    }
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return success when from and to are the same', async () => {
    const result = await transferStorageData('indexeddb', 'indexeddb');
    expect(result).toEqual({ success: true });
  });

  it('should transfer data from IndexedDB to localStorage', async () => {
    const { set: idbSet } = await import('idb-keyval');
    await idbSet('network-topology-storage', '{"nodes":[]}', atlasStore);
    await idbSet('service-store', '{"services":[]}', atlasStore);

    const result = await transferStorageData('indexeddb', 'localstorage');
    expect(result.success).toBe(true);

    expect(localStorage.getItem('network-topology-storage')).toBe('{"nodes":[]}');
    expect(localStorage.getItem('service-store')).toBe('{"services":[]}');
  });

  it('should transfer data from localStorage to IndexedDB', async () => {
    localStorage.setItem('network-topology-storage', '{"net":"value"}');
    localStorage.setItem('settings-store', '{"set":"value"}');

    const result = await transferStorageData('localstorage', 'indexeddb');
    expect(result.success).toBe(true);

    expect(await idbGet<string>('network-topology-storage', atlasStore)).toBe('{"net":"value"}');
    expect(await idbGet<string>('settings-store', atlasStore)).toBe('{"set":"value"}');
  });

  it('should skip keys that have no data in the source', async () => {
    // Only set one key in localStorage
    localStorage.setItem('network-topology-storage', '{"data":"here"}');

    const result = await transferStorageData('localstorage', 'indexeddb');
    expect(result.success).toBe(true);

    // Only the key with data should be in IDB
    expect(await idbGet<string>('network-topology-storage', atlasStore)).toBe('{"data":"here"}');
    expect(await idbGet<string>('service-store', atlasStore)).toBeUndefined();
  });

  it('should transfer all known store keys', async () => {
    const { set: idbSet } = await import('idb-keyval');
    for (const key of STORE_KEYS) {
      await idbSet(key, `{"key":"${key}"}`, atlasStore);
    }

    const result = await transferStorageData('indexeddb', 'localstorage');
    expect(result.success).toBe(true);

    for (const key of STORE_KEYS) {
      expect(localStorage.getItem(key)).toBe(`{"key":"${key}"}`);
    }
  });

  it('should return error when source backend has no data', async () => {
    // Both localStorage and IDB are empty
    const result = await transferStorageData('indexeddb', 'localstorage');
    expect(result.success).toBe(false);
    expect(result.error).toBe('No data found in source backend');
  });

  it('should return error when localStorage source is empty', async () => {
    const result = await transferStorageData('localstorage', 'indexeddb');
    expect(result.success).toBe(false);
    expect(result.error).toBe('No data found in source backend');
  });
});
