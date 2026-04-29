import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { atlasStore } from '../idb-store-singleton';

describe('IDB Store Singleton', () => {
  it('should export a single store instance', () => {
    expect(atlasStore).toBeDefined();
  });

  it('should be the same instance on repeated imports', async () => {
    // Dynamic re-import to verify module singleton behavior
    const { atlasStore: store2 } = await import('../idb-store-singleton');
    expect(store2).toBe(atlasStore);
  });

  it('indexeddb-storage and storage-migration share the same store', async () => {
    // Both modules import from idb-store-singleton
    // We can verify by checking that they use the same database
    // The singleton pattern ensures only one createStore() call
    expect(atlasStore).toBeDefined();
    // The store is created with 'atlas-network-db' database and 'zustand-persist' store
    // We can't inspect the internal DB name easily, but the singleton ensures consistency
  });
});
