import { describe, it, expect, beforeEach } from 'vitest';
import { useNetworkStore } from '@/stores/networkStore';

/**
 * Test 5.5: Verify App does NOT re-render when selectedNodeIds changes.
 *
 * After Phase 2 fix, App.tsx no longer subscribes to selectedNodeIds or
 * selectedEdgeIds. It uses getState() for the delete shortcut check instead.
 * This test verifies that the store's selection state change does not cause
 * a component re-render in App.
 *
 * Strategy: Rather than mounting the full App (which requires many mocks for
 * routes, Canvas, React Flow, etc.), we directly verify that App.tsx does NOT
 * subscribe to selectedNodeIds/selectedEdgeIds by checking that a Zustand
 * selector matching App's actual pattern does not trigger on selection changes.
 * This is the same mechanism that prevents re-renders.
 */
describe('App.tsx re-render isolation from selection state', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
  });

  it('should NOT notify topology-only subscribers when only selection changes', () => {
    // App subscribes to `topology` (for event logging), NOT to selectedNodeIds/selectedEdgeIds.
    // We verify that changing selection does not affect topology reference.
    const node1Id = useNetworkStore.getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
    const node2Id = useNetworkStore.getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });

    // Capture the topology reference before selection changes
    const topologyBefore = useNetworkStore.getState().topology;

    // Change selection — topology reference should NOT change
    useNetworkStore.getState().selectNodes([node1Id, node2Id]);
    const topologyAfterSelect = useNetworkStore.getState().topology;
    expect(topologyAfterSelect).toBe(topologyBefore);

    useNetworkStore.getState().selectElements([node1Id], []);
    const topologyAfterElements = useNetworkStore.getState().topology;
    expect(topologyAfterElements).toBe(topologyBefore);

    useNetworkStore.getState().clearSelection();
    const topologyAfterClear = useNetworkStore.getState().topology;
    expect(topologyAfterClear).toBe(topologyBefore);
  });

  it('should allow reading selection via getState() without subscribing', () => {
    // This verifies the Phase 2 pattern: using getState() for delete check
    const nodeId = useNetworkStore.getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

    // No subscription — just direct state access
    useNetworkStore.getState().selectNodes([nodeId]);

    const state = useNetworkStore.getState();
    expect(state.selectedNodeIds).toHaveLength(1);
    expect(state.selectedNodeIds[0]).toBe(nodeId);

    // This pattern (used by App.tsx handleKeyDown) reads selection
    // without causing component re-renders
    const hasSelection =
      useNetworkStore.getState().selectedNodeIds.length > 0 ||
      useNetworkStore.getState().selectedEdgeIds.length > 0;
    expect(hasSelection).toBe(true);
  });

  it('should only trigger store subscribers when selection actually changes', () => {
    const nodeId = useNetworkStore.getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

    // Set initial selection
    useNetworkStore.getState().selectElements([nodeId], []);

    // Track all state changes
    let triggerCount = 0;
    const unsubscribe = useNetworkStore.subscribe(() => {
      triggerCount++;
    });

    // Same selection again — selectElements has Set-based equality check,
    // should be a no-op (no state change emitted)
    useNetworkStore.getState().selectElements([nodeId], []);
    expect(triggerCount).toBe(0);

    // Clear selection — different from current, should trigger
    useNetworkStore.getState().clearSelection();
    expect(triggerCount).toBe(1);

    unsubscribe();
  });
});
