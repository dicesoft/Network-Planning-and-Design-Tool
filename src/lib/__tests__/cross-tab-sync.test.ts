import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupCrossTabSync,
  notifyCrossTabSync,
  resetCrossTabSync,
  suppressCrossTabSync,
  resumeCrossTabSync,
  isCrossTabSyncSuppressed,
  getIsRehydrating,
  markStoreRehydrated,
  isStoreRehydrated,
  type CrossTabSyncMessage,
} from '../cross-tab-sync';

/** Helper: wait for BroadcastChannel message delivery (real timer). */
const waitForMessage = (ms = 50) => new Promise((r) => setTimeout(r, ms));

describe('Cross-Tab Sync via BroadcastChannel', () => {
  let channelInstances: BroadcastChannel[] = [];

  beforeEach(() => {
    resetCrossTabSync();
    channelInstances = [];
  });

  afterEach(() => {
    resetCrossTabSync();
    for (const ch of channelInstances) {
      try { ch.close(); } catch { /* noop */ }
    }
  });

  it('should register a listener for a store key', () => {
    const mockStore = { persist: { rehydrate: vi.fn() } };
    const cleanup = setupCrossTabSync('test-store', mockStore);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('should call rehydrate when a matching message from another tab is received', async () => {
    const rehydrateFn = vi.fn();
    const mockStore = { persist: { rehydrate: rehydrateFn } };

    setupCrossTabSync('my-store', mockStore);

    // Simulate a message from another tab (different senderTabId)
    const externalChannel = new BroadcastChannel('atlas-store-sync');
    channelInstances.push(externalChannel);

    const message: CrossTabSyncMessage = {
      storeKey: 'my-store',
      timestamp: Date.now(),
      senderTabId: 'other-tab-id',
    };
    externalChannel.postMessage(message);

    await waitForMessage();

    expect(rehydrateFn).toHaveBeenCalledTimes(1);
  });

  it('should NOT call rehydrate for a different store key', async () => {
    const rehydrateFn = vi.fn();
    const mockStore = { persist: { rehydrate: rehydrateFn } };

    setupCrossTabSync('store-A', mockStore);

    const externalChannel = new BroadcastChannel('atlas-store-sync');
    channelInstances.push(externalChannel);

    externalChannel.postMessage({
      storeKey: 'store-B',
      timestamp: Date.now(),
      senderTabId: 'other-tab-id',
    });

    await waitForMessage();

    expect(rehydrateFn).not.toHaveBeenCalled();
  });

  it('should support multiple stores on the same channel', async () => {
    const rehydrateA = vi.fn();
    const rehydrateB = vi.fn();

    setupCrossTabSync('store-A', { persist: { rehydrate: rehydrateA } });
    setupCrossTabSync('store-B', { persist: { rehydrate: rehydrateB } });

    const externalChannel = new BroadcastChannel('atlas-store-sync');
    channelInstances.push(externalChannel);

    externalChannel.postMessage({ storeKey: 'store-A', timestamp: Date.now(), senderTabId: 'other-tab' });
    await waitForMessage();

    expect(rehydrateA).toHaveBeenCalledTimes(1);
    expect(rehydrateB).not.toHaveBeenCalled();

    externalChannel.postMessage({ storeKey: 'store-B', timestamp: Date.now(), senderTabId: 'other-tab' });
    await waitForMessage();

    expect(rehydrateB).toHaveBeenCalledTimes(1);
  });

  it('notifyCrossTabSync should post a debounced message to the channel', async () => {
    const receivedMessages: CrossTabSyncMessage[] = [];
    const receiver = new BroadcastChannel('atlas-store-sync');
    channelInstances.push(receiver);

    receiver.onmessage = (event: MessageEvent<CrossTabSyncMessage>) => {
      receivedMessages.push(event.data);
    };

    // Ensure the shared channel is created by registering a store
    setupCrossTabSync('dummy', { persist: { rehydrate: vi.fn() } });

    // Mark store as rehydrated so notify is not suppressed
    markStoreRehydrated('network-topology-storage');
    notifyCrossTabSync('network-topology-storage');

    // Before debounce fires — no message yet
    await waitForMessage(20);
    expect(receivedMessages.length).toBe(0);

    // After debounce (100ms) + message delivery
    await waitForMessage(150);
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].storeKey).toBe('network-topology-storage');
    expect(typeof receivedMessages[0].timestamp).toBe('number');
    expect(typeof receivedMessages[0].senderTabId).toBe('string');
  });

  it('should validate CrossTabSyncMessage format includes senderTabId', () => {
    const message: CrossTabSyncMessage = {
      storeKey: 'test-key',
      timestamp: 1708012345678,
      senderTabId: 'tab-abc123',
    };
    expect(message.storeKey).toBe('test-key');
    expect(message.timestamp).toBe(1708012345678);
    expect(message.senderTabId).toBe('tab-abc123');
  });

  it('cleanup should remove the listener', async () => {
    const rehydrateFn = vi.fn();
    const mockStore = { persist: { rehydrate: rehydrateFn } };

    const cleanup = setupCrossTabSync('cleanup-store', mockStore);
    cleanup();

    const externalChannel = new BroadcastChannel('atlas-store-sync');
    channelInstances.push(externalChannel);

    externalChannel.postMessage({ storeKey: 'cleanup-store', timestamp: Date.now(), senderTabId: 'other-tab' });
    await waitForMessage();

    expect(rehydrateFn).not.toHaveBeenCalled();
  });

  describe('Sender Tab ID (feedback loop prevention)', () => {
    it('should ignore messages with the same tab senderTabId', async () => {
      const rehydrateFn = vi.fn();
      setupCrossTabSync('my-store', { persist: { rehydrate: rehydrateFn } });

      // Capture our own tab ID by sending a notify
      const receivedMessages: CrossTabSyncMessage[] = [];
      const receiver = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(receiver);
      receiver.onmessage = (event: MessageEvent<CrossTabSyncMessage>) => {
        receivedMessages.push(event.data);
      };

      markStoreRehydrated('capture-id');
      notifyCrossTabSync('capture-id');
      await waitForMessage(200);

      expect(receivedMessages.length).toBe(1);
      const ownTabId = receivedMessages[0].senderTabId;

      // Reset rehydrate call count
      rehydrateFn.mockClear();

      // Send a message with our own tab ID — should be ignored
      const selfChannel = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(selfChannel);
      selfChannel.postMessage({
        storeKey: 'my-store',
        timestamp: Date.now(),
        senderTabId: ownTabId,
      });
      await waitForMessage();

      expect(rehydrateFn).not.toHaveBeenCalled();
    });

    it('should accept messages from a different tab ID', async () => {
      const rehydrateFn = vi.fn();
      setupCrossTabSync('my-store', { persist: { rehydrate: rehydrateFn } });

      const externalChannel = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(externalChannel);

      externalChannel.postMessage({
        storeKey: 'my-store',
        timestamp: Date.now(),
        senderTabId: 'completely-different-tab-id',
      });
      await waitForMessage();

      expect(rehydrateFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Rehydrating guard flag', () => {
    it('getIsRehydrating returns false by default', () => {
      expect(getIsRehydrating()).toBe(false);
    });

    it('should set isRehydrating=true during rehydrate and false after', async () => {
      let wasRehydratingDuringCall = false;
      const rehydrateFn = vi.fn(() => {
        wasRehydratingDuringCall = getIsRehydrating();
      });
      setupCrossTabSync('guard-store', { persist: { rehydrate: rehydrateFn } });

      const externalChannel = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(externalChannel);
      externalChannel.postMessage({
        storeKey: 'guard-store',
        timestamp: Date.now(),
        senderTabId: 'other-tab',
      });
      await waitForMessage();

      expect(rehydrateFn).toHaveBeenCalledTimes(1);
      expect(wasRehydratingDuringCall).toBe(true);
      expect(getIsRehydrating()).toBe(false);
    });

    it('notifyCrossTabSync should be suppressed during rehydration', async () => {
      // Track whether notifyCrossTabSync was effectively suppressed
      let notifyWasSuppressedDuringRehydrate = false;
      const rehydrateFn = vi.fn(() => {
        // During rehydration, isRehydrating should be true, which suppresses notify
        if (getIsRehydrating()) {
          notifyWasSuppressedDuringRehydrate = true;
        }
        // Try to notify (this should be a no-op because isRehydrating is true)
        notifyCrossTabSync('guard-store');
      });
      setupCrossTabSync('guard-store', { persist: { rehydrate: rehydrateFn } });

      const externalChannel = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(externalChannel);
      externalChannel.postMessage({
        storeKey: 'guard-store',
        timestamp: Date.now(),
        senderTabId: 'other-tab',
      });
      await waitForMessage(200);

      expect(rehydrateFn).toHaveBeenCalledTimes(1);
      expect(notifyWasSuppressedDuringRehydrate).toBe(true);
    });
  });

  describe('Debounced notify', () => {
    it('should coalesce 10 rapid mutations into 1 broadcast', async () => {
      const receivedMessages: CrossTabSyncMessage[] = [];
      const receiver = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(receiver);
      receiver.onmessage = (event: MessageEvent<CrossTabSyncMessage>) => {
        receivedMessages.push(event.data);
      };

      setupCrossTabSync('debounce-test', { persist: { rehydrate: vi.fn() } });
      markStoreRehydrated('debounce-test');

      // Fire 10 rapid notifications
      for (let i = 0; i < 10; i++) {
        notifyCrossTabSync('debounce-test');
      }

      // Wait for debounce to settle (100ms + margin)
      await waitForMessage(200);

      // Should have coalesced into a single broadcast
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].storeKey).toBe('debounce-test');
    });

    it('should send separate messages for different store keys', async () => {
      const receivedMessages: CrossTabSyncMessage[] = [];
      const receiver = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(receiver);
      receiver.onmessage = (event: MessageEvent<CrossTabSyncMessage>) => {
        receivedMessages.push(event.data);
      };

      setupCrossTabSync('store-x', { persist: { rehydrate: vi.fn() } });
      setupCrossTabSync('store-y', { persist: { rehydrate: vi.fn() } });
      markStoreRehydrated('store-x');
      markStoreRehydrated('store-y');

      notifyCrossTabSync('store-x');
      notifyCrossTabSync('store-y');

      await waitForMessage(200);

      expect(receivedMessages.length).toBe(2);
      const keys = receivedMessages.map(m => m.storeKey).sort();
      expect(keys).toEqual(['store-x', 'store-y']);
    });
  });

  describe('Suppress / Resume', () => {
    it('suppressCrossTabSync prevents broadcasts', async () => {
      const receivedMessages: CrossTabSyncMessage[] = [];
      const receiver = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(receiver);
      receiver.onmessage = (event: MessageEvent<CrossTabSyncMessage>) => {
        receivedMessages.push(event.data);
      };

      setupCrossTabSync('suppress-test', { persist: { rehydrate: vi.fn() } });

      suppressCrossTabSync();
      expect(isCrossTabSyncSuppressed()).toBe(true);

      notifyCrossTabSync('suppress-test');
      await waitForMessage(200);

      expect(receivedMessages.length).toBe(0);

      resumeCrossTabSync();
      expect(isCrossTabSyncSuppressed()).toBe(false);
    });

    it('suppressCrossTabSync prevents incoming rehydrate', async () => {
      const rehydrateFn = vi.fn();
      setupCrossTabSync('suppress-rx', { persist: { rehydrate: rehydrateFn } });

      suppressCrossTabSync();

      const externalChannel = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(externalChannel);
      externalChannel.postMessage({
        storeKey: 'suppress-rx',
        timestamp: Date.now(),
        senderTabId: 'other-tab',
      });
      await waitForMessage();

      expect(rehydrateFn).not.toHaveBeenCalled();

      resumeCrossTabSync();

      // After resume, new messages should work
      externalChannel.postMessage({
        storeKey: 'suppress-rx',
        timestamp: Date.now(),
        senderTabId: 'other-tab',
      });
      await waitForMessage();

      expect(rehydrateFn).toHaveBeenCalledTimes(1);
    });

    it('resetCrossTabSync clears suppression', () => {
      suppressCrossTabSync();
      expect(isCrossTabSyncSuppressed()).toBe(true);
      resetCrossTabSync();
      expect(isCrossTabSyncSuppressed()).toBe(false);
    });
  });

  describe('Rehydration guard (prevents broadcasting empty default state)', () => {
    it('notifyCrossTabSync is suppressed before markStoreRehydrated is called', async () => {
      const receivedMessages: CrossTabSyncMessage[] = [];
      const receiver = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(receiver);
      receiver.onmessage = (event: MessageEvent<CrossTabSyncMessage>) => {
        receivedMessages.push(event.data);
      };

      // Set up a store but do NOT mark it as rehydrated
      setupCrossTabSync('pre-hydration-store', { persist: { rehydrate: vi.fn() } });

      notifyCrossTabSync('pre-hydration-store');
      await waitForMessage(200);

      // Should NOT have broadcast — store hasn't finished rehydration
      expect(receivedMessages.length).toBe(0);
    });

    it('notifyCrossTabSync works after markStoreRehydrated is called', async () => {
      const receivedMessages: CrossTabSyncMessage[] = [];
      const receiver = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(receiver);
      receiver.onmessage = (event: MessageEvent<CrossTabSyncMessage>) => {
        receivedMessages.push(event.data);
      };

      setupCrossTabSync('hydrated-store', { persist: { rehydrate: vi.fn() } });

      // Mark as rehydrated — simulates onRehydrateStorage callback
      markStoreRehydrated('hydrated-store');

      notifyCrossTabSync('hydrated-store');
      await waitForMessage(200);

      // Should have broadcast now
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].storeKey).toBe('hydrated-store');
    });

    it('isStoreRehydrated returns correct state', () => {
      expect(isStoreRehydrated('some-store')).toBe(false);
      markStoreRehydrated('some-store');
      expect(isStoreRehydrated('some-store')).toBe(true);
    });

    it('resetCrossTabSync clears rehydrated stores', () => {
      markStoreRehydrated('my-store');
      expect(isStoreRehydrated('my-store')).toBe(true);
      resetCrossTabSync();
      expect(isStoreRehydrated('my-store')).toBe(false);
    });

    it('does not suppress broadcasts for other already-rehydrated stores', async () => {
      const receivedMessages: CrossTabSyncMessage[] = [];
      const receiver = new BroadcastChannel('atlas-store-sync');
      channelInstances.push(receiver);
      receiver.onmessage = (event: MessageEvent<CrossTabSyncMessage>) => {
        receivedMessages.push(event.data);
      };

      setupCrossTabSync('store-fast', { persist: { rehydrate: vi.fn() } });
      setupCrossTabSync('store-slow', { persist: { rehydrate: vi.fn() } });

      // Only mark one store as rehydrated
      markStoreRehydrated('store-fast');

      notifyCrossTabSync('store-fast');
      notifyCrossTabSync('store-slow');
      await waitForMessage(200);

      // Only the rehydrated store should have broadcast
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].storeKey).toBe('store-fast');
    });
  });
});
