/**
 * Singleton IndexedDB store instance shared across the application.
 *
 * Both `indexeddb-storage.ts` and `storage-migration.ts` previously created
 * their own `createStore()` instances, resulting in dual connections to the
 * same database that can interfere with each other's transactions.
 *
 * This module consolidates them into a single shared instance.
 */
import { createStore } from 'idb-keyval';

/** The shared IDB store instance, or undefined if IndexedDB is not available. */
export const atlasStore = typeof indexedDB !== 'undefined'
  ? createStore('atlas-network-db', 'zustand-persist')
  : undefined;
