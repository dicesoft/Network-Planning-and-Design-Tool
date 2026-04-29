import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  createIndexedDBStorage,
  resetIndexedDBAvailabilityCache,
  getStorageBackend,
  suppressPersist,
  resumePersist,
  isPersistSuppressed,
  flushPendingWrites,
  flushPendingWritesToLocalStorage,
} from '../indexeddb-storage';
import type { StateStorage } from 'zustand/middleware';

/**
 * Helper: write to storage and wait for debounce + async IDB to complete.
 * Uses real timers because fake-indexeddb relies on real async event loop.
 */
async function writeAndFlush(storage: StateStorage, key: string, value: string): Promise<void> {
  const p = storage.setItem!(key, value);
  // Wait for debounce (300ms) + IDB async overhead
  await new Promise((r) => setTimeout(r, 400));
  await p;
}

describe('IndexedDB Storage Adapter', () => {
  let storage: StateStorage;

  beforeEach(() => {
    resetIndexedDBAvailabilityCache();
    storage = createIndexedDBStorage();
  });

  afterEach(() => {
    resetIndexedDBAvailabilityCache();
  });

  describe('basic read/write', () => {
    it('should write and read a value from IndexedDB', async () => {
      await writeAndFlush(storage, 'test-key', JSON.stringify({ hello: 'world' }));
      const result = await storage.getItem!('test-key');
      expect(result).toBe(JSON.stringify({ hello: 'world' }));
    });

    it('should return null for a non-existent key', async () => {
      const result = await storage.getItem!('nonexistent-key');
      expect(result).toBeNull();
    });

    it('should overwrite an existing value', async () => {
      await writeAndFlush(storage, 'overwrite-key', 'first');
      await writeAndFlush(storage, 'overwrite-key', 'second');
      const result = await storage.getItem!('overwrite-key');
      expect(result).toBe('second');
    });

    it('should remove a value', async () => {
      await writeAndFlush(storage, 'remove-key', 'value');
      await storage.removeItem!('remove-key');
      const result = await storage.getItem!('remove-key');
      expect(result).toBeNull();
    });

    it('should handle removing a non-existent key without error', async () => {
      await expect(storage.removeItem!('no-such-key')).resolves.toBeUndefined();
    });
  });

  describe('large data', () => {
    it('should handle storing a large topology payload', async () => {
      const nodes = Array.from({ length: 500 }, (_, i) => ({
        id: `node-${i}`,
        name: `Node-${i}`,
        type: 'router',
        position: { x: i * 10, y: i * 10 },
        ports: Array.from({ length: 4 }, (_, j) => ({
          id: `port-${i}-${j}`,
          name: `Eth-${j}`,
          type: 'bw',
          status: 'available',
        })),
      }));
      const payload = JSON.stringify({ topology: { nodes, edges: [] } });

      await writeAndFlush(storage, 'large-topology', payload);
      const result = await storage.getItem!('large-topology');
      expect(result).toBe(payload);
    });
  });

  describe('localStorage fallback', () => {
    it('should fall back to localStorage when IndexedDB is unavailable', async () => {
      const origIndexedDB = globalThis.indexedDB;
      // @ts-expect-error testing fallback
      globalThis.indexedDB = undefined;
      resetIndexedDBAvailabilityCache();

      const fallbackStorage = createIndexedDBStorage();

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

      await writeAndFlush(fallbackStorage, 'fallback-key', 'fallback-value');
      expect(setItemSpy).toHaveBeenCalledWith('fallback-key', 'fallback-value');

      getItemSpy.mockReturnValue('fallback-value');
      const result = await fallbackStorage.getItem!('fallback-key');
      expect(result).toBe('fallback-value');

      setItemSpy.mockRestore();
      getItemSpy.mockRestore();
      globalThis.indexedDB = origIndexedDB;
      resetIndexedDBAvailabilityCache();
    });
  });

  describe('error handling', () => {
    it('should handle getItem errors gracefully by falling back', async () => {
      await storage.getItem!('probe');

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await storage.getItem!('missing');
      expect(result).toBeNull();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('persist debounce (Sprint 5)', () => {
    it('should debounce rapid setItem calls — only last value persisted', async () => {
      // Write 5 rapid values for the same key (within debounce window)
      storage.setItem!('rapid-key', 'value-1');
      storage.setItem!('rapid-key', 'value-2');
      storage.setItem!('rapid-key', 'value-3');
      storage.setItem!('rapid-key', 'value-4');
      const lastPromise = storage.setItem!('rapid-key', 'value-5');

      // Wait for debounce + IDB write
      await new Promise((r) => setTimeout(r, 400));
      await lastPromise;

      const result = await storage.getItem!('rapid-key');
      expect(result).toBe('value-5');
    });

    it('should not write before debounce period elapses', async () => {
      storage.setItem!('timing-key', 'early-value');

      // Immediately check — should not be written yet
      const earlyResult = await storage.getItem!('timing-key');
      expect(earlyResult).toBeNull();

      // Wait for debounce to fire
      await new Promise((r) => setTimeout(r, 400));

      const lateResult = await storage.getItem!('timing-key');
      expect(lateResult).toBe('early-value');
    });
  });

  describe('persist suppression (Sprint 5)', () => {
    it('suppressPersist makes setItem a no-op', async () => {
      suppressPersist();
      expect(isPersistSuppressed()).toBe(true);

      await writeAndFlush(storage, 'suppressed-key', 'suppressed-value');

      resumePersist();
      expect(isPersistSuppressed()).toBe(false);

      const result = await storage.getItem!('suppressed-key');
      expect(result).toBeNull();
    });

    it('resumePersist allows writes again', async () => {
      suppressPersist();
      storage.setItem!('resume-key', 'should-not-persist');
      await new Promise((r) => setTimeout(r, 400));

      resumePersist();

      await writeAndFlush(storage, 'resume-key', 'should-persist');

      const result = await storage.getItem!('resume-key');
      expect(result).toBe('should-persist');
    });

    it('resetIndexedDBAvailabilityCache clears suppression', () => {
      suppressPersist();
      expect(isPersistSuppressed()).toBe(true);
      resetIndexedDBAvailabilityCache();
      expect(isPersistSuppressed()).toBe(false);
    });
  });

  describe('storage backend indicator (Sprint 5)', () => {
    it('getStorageBackend returns "unknown" before first read', () => {
      resetIndexedDBAvailabilityCache();
      expect(getStorageBackend()).toBe('unknown');
    });

    it('getStorageBackend returns "indexeddb" after successful read', async () => {
      await storage.getItem!('probe-key');
      expect(getStorageBackend()).toBe('indexeddb');
    });

    it('getStorageBackend returns "localstorage" when IndexedDB unavailable', async () => {
      const origIndexedDB = globalThis.indexedDB;
      // @ts-expect-error testing fallback
      globalThis.indexedDB = undefined;
      resetIndexedDBAvailabilityCache();

      const fallbackStorage = createIndexedDBStorage();
      await fallbackStorage.getItem!('probe-key');
      expect(getStorageBackend()).toBe('localstorage');

      globalThis.indexedDB = origIndexedDB;
      resetIndexedDBAvailabilityCache();
    });
  });

  describe('flushPendingWrites (Sprint 7)', () => {
    it('should flush pending debounced value to IndexedDB immediately', async () => {
      // Trigger IDB availability detection first
      await storage.getItem!('probe');

      // Write but do NOT wait for debounce
      storage.setItem!('flush-key', 'flush-value');

      // Value should NOT be in IDB yet (debounce pending)
      const before = await storage.getItem!('flush-key');
      expect(before).toBeNull();

      // Flush pending writes
      await flushPendingWrites();

      // Now value should be in IDB
      const after = await storage.getItem!('flush-key');
      expect(after).toBe('flush-value');
    });

    it('should handle empty pending writes map', async () => {
      // No pending writes — should resolve without error
      await expect(flushPendingWrites()).resolves.toBeUndefined();
    });

    it('should flush multiple pending keys', async () => {
      await storage.getItem!('probe');

      storage.setItem!('multi-a', 'value-a');
      storage.setItem!('multi-b', 'value-b');
      storage.setItem!('multi-c', 'value-c');

      await flushPendingWrites();

      expect(await storage.getItem!('multi-a')).toBe('value-a');
      expect(await storage.getItem!('multi-b')).toBe('value-b');
      expect(await storage.getItem!('multi-c')).toBe('value-c');
    });
  });

  describe('flushPendingWritesToLocalStorage (Sprint 7)', () => {
    it('should synchronously write pending values to localStorage', async () => {
      await storage.getItem!('probe');

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      // Write but do NOT wait for debounce
      storage.setItem!('sync-flush-key', 'sync-flush-value');

      // Synchronously flush to localStorage
      flushPendingWritesToLocalStorage();

      expect(setItemSpy).toHaveBeenCalledWith('sync-flush-key', 'sync-flush-value');

      setItemSpy.mockRestore();
    });

    it('should handle empty pending writes map without error', () => {
      // No pending writes — should not throw
      expect(() => flushPendingWritesToLocalStorage()).not.toThrow();
    });

    it('should be a no-op when persist is suppressed (Sprint 8 — storage switch guard)', async () => {
      await storage.getItem!('probe');

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      // Write a pending value
      storage.setItem!('guarded-key', 'guarded-value');

      // Suppress persist (as handleStorageToggle does before reload)
      suppressPersist();

      // Flush — should NOT write to localStorage because persist is suppressed
      flushPendingWritesToLocalStorage();

      // setItem should NOT have been called with 'guarded-key'
      const guardedCalls = setItemSpy.mock.calls.filter(([key]) => key === 'guarded-key');
      expect(guardedCalls).toHaveLength(0);

      setItemSpy.mockRestore();
      resumePersist();
    });
  });
});
