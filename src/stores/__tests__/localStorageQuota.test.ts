import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNetworkStore } from '../networkStore';

const getState = () => useNetworkStore.getState();

describe('storage quota handling', () => {
  beforeEach(() => {
    getState().clearTopology();
  });

  it('should not crash when storage operations work normally', () => {
    // Normal operations should work fine with IndexedDB adapter
    const id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    expect(id).toBeDefined();
    expect(getState().topology.nodes).toHaveLength(1);
  });

  it('should continue functioning when localStorage setItem fails (fallback path)', () => {
    // Mock localStorage.setItem to throw QuotaExceededError
    const quotaError = new DOMException('Storage quota exceeded', 'QuotaExceededError');
    const originalSetItem = Storage.prototype.setItem;
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    Storage.prototype.setItem = function(key: string, value: string) {
      if (key === 'network-topology-storage') {
        throw quotaError;
      }
      return originalSetItem.call(this, key, value);
    };

    try {
      // Trigger a store mutation that causes persist to write
      getState().addNode({ type: 'router', position: { x: 100, y: 100 } });

      // The store should still function correctly even when persist fails
      expect(getState().topology.nodes).toHaveLength(1);
    } finally {
      Storage.prototype.setItem = originalSetItem;
      consoleSpy.mockRestore();
    }
  });

  it('should handle getItem failure gracefully', () => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key: string) {
      if (key === 'network-topology-storage') {
        throw new Error('getItem failed');
      }
      return originalGetItem.call(this, key);
    };

    try {
      // Store should still work even if reading from localStorage fails
      const id = getState().addNode({ type: 'switch', position: { x: 50, y: 50 } });
      expect(id).toBeDefined();
    } finally {
      Storage.prototype.getItem = originalGetItem;
    }
  });
});
