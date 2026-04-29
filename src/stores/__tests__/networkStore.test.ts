import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useNetworkStore, flushHistoryDebounce } from '../networkStore';
import { useSettingsStore } from '../settingsStore';
import { DEFAULT_NODE_SUBTYPES } from '@/types/settings';

// Helper to get current state
const getState = () => useNetworkStore.getState();

describe('NetworkStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useNetworkStore.getState().clearTopology();
  });

  describe('Node Operations', () => {
    it('should add a node with default properties', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 100, y: 100 },
      });

      expect(nodeId).toBeDefined();
      expect(getState().topology.nodes).toHaveLength(1);
      expect(getState().topology.nodes[0].type).toBe('router');
      expect(getState().topology.nodes[0].position).toEqual({ x: 100, y: 100 });
    });

    it('should add a node with custom name', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 100, y: 100 },
        name: 'Custom Router',
      });

      const node = getState().getNode(nodeId);
      expect(node?.name).toBe('Custom Router');
    });

    it('should update a node', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 100, y: 100 },
      });

      getState().updateNode(nodeId, { name: 'Updated Router', vendor: 'cisco' });

      const node = getState().getNode(nodeId);
      expect(node?.name).toBe('Updated Router');
      expect(node?.vendor).toBe('cisco');
    });

    it('should move a node', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 100, y: 100 },
      });

      getState().moveNode(nodeId, { x: 200, y: 300 });

      const node = getState().getNode(nodeId);
      expect(node?.position).toEqual({ x: 200, y: 300 });
    });

    it('should remove a node and its connected edges', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      getState().addEdge(node1Id, node2Id);

      expect(getState().topology.edges).toHaveLength(1);

      getState().removeNode(node1Id);

      expect(getState().topology.nodes).toHaveLength(1);
      expect(getState().topology.edges).toHaveLength(0);
    });

    it('should add default stacks based on node type', () => {
      // Router should have IP stack
      const routerId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const router = getState().getNode(routerId);
      expect(router?.stacks.some((s) => s.layer === 'ip')).toBe(true);

      // OADM should have DWDM stack
      const oadmId = getState().addNode({ type: 'oadm', position: { x: 100, y: 0 } });
      const oadm = getState().getNode(oadmId);
      expect(oadm?.stacks.some((s) => s.layer === 'dwdm')).toBe(true);
    });
  });

  describe('Edge Operations', () => {
    it('should add an edge between two nodes', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });

      const edgeId = getState().addEdge(node1Id, node2Id);

      expect(edgeId).not.toBeNull();
      expect(getState().topology.edges).toHaveLength(1);
      expect(getState().topology.edges[0].source.nodeId).toBe(node1Id);
      expect(getState().topology.edges[0].target.nodeId).toBe(node2Id);
    });

    it('should allow multiple edges between same nodes (parallel edges)', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });

      const edge1Id = getState().addEdge(node1Id, node2Id);
      const edge2Id = getState().addEdge(node1Id, node2Id);
      const edge3Id = getState().addEdge(node1Id, node2Id);

      expect(edge1Id).not.toBeNull();
      expect(edge2Id).not.toBeNull();
      expect(edge3Id).not.toBeNull();
      expect(getState().topology.edges).toHaveLength(3);
    });

    it('should not add self-referencing edges', () => {
      const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

      const edgeId = getState().addEdge(nodeId, nodeId);

      expect(edgeId).toBeNull();
      expect(getState().topology.edges).toHaveLength(0);
    });

    it('should not add edge to non-existent node', () => {
      const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

      const edgeId = getState().addEdge(nodeId, 'non-existent-id');

      expect(edgeId).toBeNull();
      expect(getState().topology.edges).toHaveLength(0);
    });

    it('should update an edge', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(node1Id, node2Id)!;

      getState().updateEdge(edgeId, { state: 'failed', name: 'Failed Link' });

      const edge = getState().getEdge(edgeId);
      expect(edge?.state).toBe('failed');
      expect(edge?.name).toBe('Failed Link');
    });

    it('should remove an edge', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(node1Id, node2Id)!;

      getState().removeEdge(edgeId);

      expect(getState().topology.edges).toHaveLength(0);
      expect(getState().getEdge(edgeId)).toBeUndefined();
    });

    it('should get connected edges for a node', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const node3Id = getState().addNode({ type: 'oadm', position: { x: 200, y: 0 } });
      getState().addEdge(node1Id, node2Id);
      getState().addEdge(node1Id, node3Id);

      const connectedEdges = getState().getConnectedEdges(node1Id);

      expect(connectedEdges).toHaveLength(2);
    });
  });

  describe('Selection Operations', () => {
    it('should select nodes', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });

      getState().selectNodes([node1Id, node2Id]);

      expect(getState().selectedNodeIds).toContain(node1Id);
      expect(getState().selectedNodeIds).toContain(node2Id);
    });

    it('should append to selection', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });

      getState().selectNodes([node1Id]);
      getState().selectNodes([node2Id], true);

      expect(getState().selectedNodeIds).toHaveLength(2);
    });

    it('should preserve node selection when selecting edges (multi-select)', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(node1Id, node2Id)!;

      getState().selectNodes([node1Id]);
      getState().selectEdges([edgeId]);

      // Multi-select: node selection should be preserved
      expect(getState().selectedNodeIds).toHaveLength(1);
      expect(getState().selectedEdgeIds).toHaveLength(1);
    });

    it('should preserve edge selection when selecting nodes (multi-select)', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(node1Id, node2Id)!;

      getState().selectEdges([edgeId]);
      getState().selectNodes([node1Id]);

      // Multi-select: edge selection should be preserved
      expect(getState().selectedNodeIds).toHaveLength(1);
      expect(getState().selectedEdgeIds).toHaveLength(1);
    });

    it('should select multiple elements with selectElements', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(node1Id, node2Id)!;

      getState().selectElements([node1Id, node2Id], [edgeId]);

      expect(getState().selectedNodeIds).toHaveLength(2);
      expect(getState().selectedEdgeIds).toHaveLength(1);
    });

    it('should append with selectElements in append mode', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const node3Id = getState().addNode({ type: 'oadm', position: { x: 200, y: 0 } });
      const edge1Id = getState().addEdge(node1Id, node2Id)!;
      const edge2Id = getState().addEdge(node2Id, node3Id)!;

      // First selection
      getState().selectElements([node1Id], [edge1Id]);
      expect(getState().selectedNodeIds).toHaveLength(1);
      expect(getState().selectedEdgeIds).toHaveLength(1);

      // Append more
      getState().selectElements([node2Id], [edge2Id], true);
      expect(getState().selectedNodeIds).toHaveLength(2);
      expect(getState().selectedEdgeIds).toHaveLength(2);
    });

    it('should clear selection', () => {
      const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      getState().selectNodes([nodeId]);

      getState().clearSelection();

      expect(getState().selectedNodeIds).toHaveLength(0);
      expect(getState().selectedEdgeIds).toHaveLength(0);
    });

    it('should select all', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      getState().addEdge(node1Id, node2Id);

      getState().selectAll();

      expect(getState().selectedNodeIds).toHaveLength(2);
      expect(getState().selectedEdgeIds).toHaveLength(1);
    });

    it('should not trigger state change when selectElements is called with same IDs (idempotency)', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(node1Id, node2Id)!;

      // First call sets the selection
      getState().selectElements([node1Id, node2Id], [edgeId]);
      expect(getState().selectedNodeIds).toHaveLength(2);
      expect(getState().selectedEdgeIds).toHaveLength(1);

      // Count state updates on the second call with same IDs
      let updateCount = 0;
      const unsubscribe = useNetworkStore.subscribe(() => {
        updateCount++;
      });

      // Second call with identical IDs should be a no-op
      getState().selectElements([node1Id, node2Id], [edgeId]);

      expect(updateCount).toBe(0);
      unsubscribe();
    });

    it('should treat selectElements as order-independent (Set-based comparison)', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(node1Id, node2Id)!;

      // Select in order [A, B]
      getState().selectElements([node1Id, node2Id], [edgeId]);
      expect(getState().selectedNodeIds).toContain(node1Id);
      expect(getState().selectedNodeIds).toContain(node2Id);

      // Count state updates when re-selecting in reversed order [B, A]
      let updateCount = 0;
      const unsubscribe = useNetworkStore.subscribe(() => {
        updateCount++;
      });

      getState().selectElements([node2Id, node1Id], [edgeId]);

      // Should be a no-op since the same elements are selected (order-independent)
      expect(updateCount).toBe(0);
      unsubscribe();
    });
  });

  describe('Delete Selected', () => {
    it('should delete selected nodes and their edges', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const node3Id = getState().addNode({ type: 'oadm', position: { x: 200, y: 0 } });
      getState().addEdge(node1Id, node2Id);
      getState().addEdge(node2Id, node3Id);

      getState().selectNodes([node2Id]);
      getState().deleteSelected();

      expect(getState().topology.nodes).toHaveLength(2);
      expect(getState().topology.edges).toHaveLength(0); // Both edges connected to node2
    });

    it('should delete selected edges', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(node1Id, node2Id)!;

      getState().selectEdges([edgeId]);
      getState().deleteSelected();

      expect(getState().topology.nodes).toHaveLength(2);
      expect(getState().topology.edges).toHaveLength(0);
    });
  });

  describe('Topology Operations', () => {
    it('should load topology', () => {
      const newTopology = {
        id: 'test-network',
        name: 'Test Network',
        version: '1.0.0',
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
        },
        nodes: [
          {
            id: 'node-1',
            name: 'Router 1',
            type: 'router' as const,
            vendor: 'cisco' as const,
            position: { x: 0, y: 0 },
            stacks: [],
            metadata: {},
          },
        ],
        edges: [],
      };

      getState().loadTopology(newTopology);

      expect(getState().topology.name).toBe('Test Network');
      expect(getState().topology.nodes).toHaveLength(1);
    });

    it('should clear topology', () => {
      getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });

      getState().clearTopology();

      expect(getState().topology.nodes).toHaveLength(0);
      expect(getState().topology.edges).toHaveLength(0);
    });

    it('should update modified timestamp on changes', async () => {
      const initialModified = getState().topology.metadata.modified;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));
      getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

      expect(getState().topology.metadata.modified).not.toBe(initialModified);
    });
  });

  describe('Undo/Redo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      flushHistoryDebounce();
      vi.useRealTimers();
    });

    it('should seed history on clearTopology so first action is undoable', () => {
      // clearTopology is called in the outer beforeEach, which seeds history
      expect(getState().history).toHaveLength(1);
      expect(getState().historyIndex).toBe(0);
    });

    it('should seed history on loadTopology', () => {
      getState().loadTopology({
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        metadata: { created: new Date().toISOString(), modified: new Date().toISOString() },
        nodes: [],
        edges: [],
      });

      expect(getState().history).toHaveLength(1);
      expect(getState().historyIndex).toBe(0);
    });

    it('should undo addNode (first action is undoable)', () => {
      getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

      expect(getState().topology.nodes).toHaveLength(1);
      expect(getState().historyIndex).toBe(1);

      getState().undo();

      expect(getState().topology.nodes).toHaveLength(0);
      expect(getState().historyIndex).toBe(0);
    });

    it('should redo after undo', () => {
      getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      getState().undo();

      expect(getState().topology.nodes).toHaveLength(0);

      getState().redo();

      expect(getState().topology.nodes).toHaveLength(1);
    });

    it('should undo/redo moveNode', () => {
      const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

      getState().moveNode(nodeId, { x: 200, y: 300 });
      expect(getState().getNode(nodeId)?.position).toEqual({ x: 200, y: 300 });

      getState().undo();
      expect(getState().getNode(nodeId)?.position).toEqual({ x: 0, y: 0 });

      getState().redo();
      expect(getState().getNode(nodeId)?.position).toEqual({ x: 200, y: 300 });
    });

    it('should undo/redo updateNode after debounce', () => {
      const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 }, name: 'Original' });

      getState().updateNode(nodeId, { name: 'Updated' });
      // Debounced — history not saved yet
      vi.advanceTimersByTime(500);

      expect(getState().getNode(nodeId)?.name).toBe('Updated');

      getState().undo();
      expect(getState().getNode(nodeId)?.name).toBe('Original');

      getState().redo();
      expect(getState().getNode(nodeId)?.name).toBe('Updated');
    });

    it('should undo/redo updateEdge after debounce', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(node1Id, node2Id)!;

      getState().updateEdge(edgeId, { name: 'Updated Link' });
      vi.advanceTimersByTime(500);

      expect(getState().getEdge(edgeId)?.name).toBe('Updated Link');

      getState().undo();
      expect(getState().getEdge(edgeId)?.name).not.toBe('Updated Link');
    });

    it('should undo/redo addPort', () => {
      const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const initialPortCount = getState().getNode(nodeId)?.ports?.length ?? 0;

      getState().addPort(nodeId, { name: 'TestPort', type: 'bw', dataRate: '10G' });

      expect(getState().getNode(nodeId)?.ports?.length).toBe(initialPortCount + 1);

      getState().undo();
      expect(getState().getNode(nodeId)?.ports?.length).toBe(initialPortCount);

      getState().redo();
      expect(getState().getNode(nodeId)?.ports?.length).toBe(initialPortCount + 1);
    });

    it('should undo/redo removePort', () => {
      const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const ports = getState().getNode(nodeId)?.ports ?? [];
      const availablePort = ports.find((p) => p.status === 'available');
      if (!availablePort) throw new Error('No available port to test');

      const portCountBefore = ports.length;

      getState().removePort(nodeId, availablePort.id);
      expect(getState().getNode(nodeId)?.ports?.length).toBe(portCountBefore - 1);

      getState().undo();
      expect(getState().getNode(nodeId)?.ports?.length).toBe(portCountBefore);
    });

    it('should truncate future history on new action after undo', () => {
      getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      // history: [initial, +router, +switch], index=2

      getState().undo(); // index=1, future has +switch
      getState().addNode({ type: 'oadm', position: { x: 200, y: 0 } });
      // +switch should be gone, replaced by +oadm

      // Cannot redo to get the switch back
      const nodeCountBefore = getState().topology.nodes.length;
      getState().redo();
      expect(getState().topology.nodes.length).toBe(nodeCountBefore); // No change
    });

    it('should cap history at 50 entries', () => {
      for (let i = 0; i < 55; i++) {
        getState().addNode({ type: 'router', position: { x: i * 10, y: 0 } });
      }

      expect(getState().history.length).toBeLessThanOrEqual(50);
    });

    it('should not corrupt history when undo is called during debounce window', () => {
      // Add a node — this is an immediate history save
      const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 }, name: 'Original' });
      expect(getState().historyIndex).toBe(1);

      // Start a debounced edit (updateNode) — history save is pending
      getState().updateNode(nodeId, { name: 'Edited' });
      // Don't advance timers — debounce hasn't fired yet

      // Undo while debounce is pending — should cancel the debounce and undo addNode
      getState().undo();
      expect(getState().topology.nodes).toHaveLength(0);
      expect(getState().historyIndex).toBe(0);

      // Advance timers past the debounce window — should NOT corrupt history
      vi.advanceTimersByTime(500);

      // History should still be clean — redo should restore the node
      getState().redo();
      expect(getState().topology.nodes).toHaveLength(1);
      expect(getState().getNode(nodeId)?.name).toBe('Original');
    });
  });

  describe('Duplicate Selected', () => {
    it('should duplicate a single selected node with new ID and offset position', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 100, y: 200 },
        name: 'Router-A',
      });
      getState().selectNodes([nodeId]);

      getState().duplicateSelected();

      expect(getState().topology.nodes).toHaveLength(2);
      const duplicate = getState().topology.nodes.find((n) => n.id !== nodeId)!;

      expect(duplicate.id).not.toBe(nodeId);
      expect(duplicate.name).toBe('Router-A (copy)');
      expect(duplicate.type).toBe('router');
      expect(duplicate.position).toEqual({ x: 150, y: 250 });
      // Selection should be on the new node
      expect(getState().selectedNodeIds).toEqual([duplicate.id]);
      expect(getState().selectedNodeIds).not.toContain(nodeId);
    });

    it('should duplicate a connected pair of nodes with their edge', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 }, name: 'R1' });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 }, name: 'S1' });
      const edgeId = getState().addEdge(node1Id, node2Id)!;

      getState().selectElements([node1Id, node2Id], [edgeId]);

      getState().duplicateSelected();

      // 2 original + 2 duplicated
      expect(getState().topology.nodes).toHaveLength(4);
      // 1 original + 1 duplicated
      expect(getState().topology.edges).toHaveLength(2);

      const newEdge = getState().topology.edges.find((e) => e.id !== edgeId)!;
      expect(newEdge).toBeDefined();
      // Edge endpoints should reference new node IDs, not originals
      expect(newEdge.source.nodeId).not.toBe(node1Id);
      expect(newEdge.target.nodeId).not.toBe(node2Id);
      // Verify new edge endpoints are in the duplicated nodes
      const newNodeIds = getState().topology.nodes
        .filter((n) => n.id !== node1Id && n.id !== node2Id)
        .map((n) => n.id);
      expect(newNodeIds).toContain(newEdge.source.nodeId);
      expect(newNodeIds).toContain(newEdge.target.nodeId);
    });

    it('should skip edges connected to only one selected node', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });
      const node3Id = getState().addNode({ type: 'oadm', position: { x: 200, y: 0 } });
      getState().addEdge(node1Id, node2Id);
      getState().addEdge(node2Id, node3Id);

      // Only select node2 — edge to node1 and node3 should NOT be duplicated
      getState().selectNodes([node2Id]);

      getState().duplicateSelected();

      expect(getState().topology.nodes).toHaveLength(4);
      // No new edges — neither edge has both endpoints selected
      expect(getState().topology.edges).toHaveLength(2);
    });

    it('should remap port IDs to new UUIDs', () => {
      const nodeId = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const origNode = getState().getNode(nodeId)!;
      const origPortIds = origNode.ports!.map((p) => p.id);

      getState().selectNodes([nodeId]);
      getState().duplicateSelected();

      const dupNode = getState().topology.nodes.find((n) => n.id !== nodeId)!;
      const dupPortIds = dupNode.ports!.map((p) => p.id);

      // All port IDs should be different
      for (const origPortId of origPortIds) {
        expect(dupPortIds).not.toContain(origPortId);
      }
      // Same number of ports
      expect(dupPortIds.length).toBe(origPortIds.length);
    });

    it('should strip spectrum allocations from duplicated ports', () => {
      const nodeId = getState().addNode({ type: 'oadm', position: { x: 0, y: 0 } });
      const node = getState().getNode(nodeId)!;
      const dwdmPort = node.ports?.find((p) => p.type === 'dwdm');
      if (dwdmPort) {
        // Allocate a channel on the original
        getState().allocateChannels(nodeId, dwdmPort.id, [{
          id: 'test-alloc-1',
          channelNumber: 1,
          status: 'allocated',
          label: 'Test',
        }]);
      }

      getState().selectNodes([nodeId]);
      getState().duplicateSelected();

      const dupNode = getState().topology.nodes.find((n) => n.id !== nodeId)!;
      for (const port of dupNode.ports || []) {
        if (port.spectrum) {
          expect(port.spectrum.allocations).toHaveLength(0);
        }
      }
    });

    it('should undo duplicate in a single step', () => {
      const node1Id = getState().addNode({ type: 'router', position: { x: 0, y: 0 }, name: 'R1' });
      const node2Id = getState().addNode({ type: 'switch', position: { x: 100, y: 0 }, name: 'S1' });
      getState().addEdge(node1Id, node2Id);

      getState().selectElements([node1Id, node2Id], []);
      getState().duplicateSelected();

      expect(getState().topology.nodes).toHaveLength(4);

      getState().undo();

      // Should return to state before duplicate
      expect(getState().topology.nodes).toHaveLength(2);
      expect(getState().topology.edges).toHaveLength(1);
    });

    it('should handle duplicating 50+ nodes without blocking', () => {
      // Create 50 nodes
      const nodeIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        nodeIds.push(getState().addNode({ type: 'router', position: { x: i * 10, y: 0 } }));
      }
      // Add some edges
      for (let i = 0; i < 49; i++) {
        getState().addEdge(nodeIds[i], nodeIds[i + 1]);
      }

      getState().selectAll();

      const start = performance.now();
      getState().duplicateSelected();
      const duration = performance.now() - start;

      expect(getState().topology.nodes).toHaveLength(100);
      expect(getState().topology.edges).toHaveLength(98); // 49 original + 49 duplicated
      // Duplicate should complete in a reasonable time (< 1s)
      expect(duration).toBeLessThan(1000);
    });

    it('should do nothing when no nodes are selected', () => {
      getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

      const nodesBefore = getState().topology.nodes.length;
      getState().duplicateSelected();
      expect(getState().topology.nodes.length).toBe(nodesBefore);
    });

    it('should set duplicated ports connected to duplicated edges as used', () => {
      const node1Id = getState().addNode({ type: 'oadm', position: { x: 0, y: 0 } });
      const node2Id = getState().addNode({ type: 'oadm', position: { x: 100, y: 0 } });
      const node1 = getState().getNode(node1Id)!;
      const node2 = getState().getNode(node2Id)!;
      const srcPort = node1.ports!.find((p) => p.status === 'available')!;
      const tgtPort = node2.ports!.find((p) => p.status === 'available')!;

      getState().addEdgeWithPorts(node1Id, node2Id, srcPort.id, tgtPort.id);

      getState().selectAll();
      getState().duplicateSelected();

      const dupEdge = getState().topology.edges.find(
        (e) => e.source.nodeId !== node1Id && e.target.nodeId !== node2Id
      )!;
      if (dupEdge?.source.portId) {
        const dupSrcNode = getState().getNode(dupEdge.source.nodeId)!;
        const dupSrcPort = dupSrcNode.ports!.find((p) => p.id === dupEdge.source.portId)!;
        expect(dupSrcPort.status).toBe('used');
        expect(dupSrcPort.connectedEdgeId).toBe(dupEdge.id);
      }
    });
  });

  describe('Subtype Port Auto-Provisioning', () => {
    beforeEach(() => {
      // Ensure settings store has default subtypes
      useSettingsStore.getState().resetNodeSubtypes();
    });

    it('should auto-provision ports from subtype preset when subtype + sizeFlavor are set', () => {
      // 'core' router, 'large' size: 16 BW + 8 DWDM = 24 ports, switchingCapacity = 1600
      const corePreset = DEFAULT_NODE_SUBTYPES.find((s) => s.key === 'core' && s.nodeType === 'router')!;
      expect(corePreset).toBeDefined();

      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        subtype: 'core',
        sizeFlavor: 'large',
      });

      const node = getState().getNode(nodeId)!;
      const bwPorts = node.ports!.filter((p) => p.type === 'bw');
      const dwdmPorts = node.ports!.filter((p) => p.type === 'dwdm');

      expect(bwPorts).toHaveLength(corePreset.sizes.large.bwPorts);
      expect(dwdmPorts).toHaveLength(corePreset.sizes.large.dwdmPorts);
      expect(node.switchingCapacity).toBe(corePreset.sizes.large.switchingCapacity);
      expect(node.subtype).toBe('core');
      expect(node.sizeFlavor).toBe('large');
    });

    it('should auto-provision ports for medium size flavor', () => {
      const corePreset = DEFAULT_NODE_SUBTYPES.find((s) => s.key === 'core' && s.nodeType === 'router')!;

      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        subtype: 'core',
        sizeFlavor: 'medium',
      });

      const node = getState().getNode(nodeId)!;
      const bwPorts = node.ports!.filter((p) => p.type === 'bw');
      const dwdmPorts = node.ports!.filter((p) => p.type === 'dwdm');

      expect(bwPorts).toHaveLength(corePreset.sizes.medium.bwPorts);
      expect(dwdmPorts).toHaveLength(corePreset.sizes.medium.dwdmPorts);
      expect(node.switchingCapacity).toBe(corePreset.sizes.medium.switchingCapacity);
    });

    it('should auto-provision ROADM ports (DWDM-only node type)', () => {
      const roadmPreset = DEFAULT_NODE_SUBTYPES.find((s) => s.key === 'roadm' && s.nodeType === 'oadm')!;

      const nodeId = getState().addNode({
        type: 'oadm',
        position: { x: 0, y: 0 },
        subtype: 'roadm',
        sizeFlavor: 'large',
      });

      const node = getState().getNode(nodeId)!;
      const bwPorts = node.ports!.filter((p) => p.type === 'bw');
      const dwdmPorts = node.ports!.filter((p) => p.type === 'dwdm');

      expect(bwPorts).toHaveLength(roadmPreset.sizes.large.bwPorts); // 0
      expect(dwdmPorts).toHaveLength(roadmPreset.sizes.large.dwdmPorts); // 16
      // DWDM ports should have spectrum initialized
      for (const port of dwdmPorts) {
        expect(port.spectrum).toBeDefined();
        expect(port.spectrum!.gridType).toBe('fixed-50ghz');
        expect(port.spectrum!.allocations).toHaveLength(0);
      }
    });

    it('should use DEFAULT_PORTS_BY_NODE_TYPE when no subtype is set', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
      });

      const node = getState().getNode(nodeId)!;
      // Default router ports: 4 BW + 2 DWDM = 6
      expect(node.ports).toHaveLength(6);
      expect(node.ports!.filter((p) => p.type === 'bw')).toHaveLength(4);
      expect(node.ports!.filter((p) => p.type === 'dwdm')).toHaveLength(2);
      expect(node.subtype).toBeUndefined();
      expect(node.sizeFlavor).toBeUndefined();
    });

    it('should fall back to defaults when subtype key does not match node type', () => {
      // 'roadm' is an oadm subtype, not router — should fall back
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        subtype: 'roadm',
        sizeFlavor: 'large',
      });

      const node = getState().getNode(nodeId)!;
      // Falls back to default router ports: 4 BW + 2 DWDM
      expect(node.ports).toHaveLength(6);
    });

    it('should use explicit ports when provided even with subtype', () => {
      const customPorts = [
        { id: 'custom-1', name: 'Custom-1', type: 'bw' as const, dataRate: '100G' as const, channels: 1, status: 'available' as const },
      ];

      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        subtype: 'core',
        sizeFlavor: 'large',
        ports: customPorts,
      });

      const node = getState().getNode(nodeId)!;
      // Explicit ports take precedence
      expect(node.ports).toHaveLength(1);
      expect(node.ports![0].name).toBe('Custom-1');
    });

    it('should work with switch subtypes (L2 Switch)', () => {
      const l2Preset = DEFAULT_NODE_SUBTYPES.find((s) => s.key === 'l2-switch' && s.nodeType === 'switch')!;

      const nodeId = getState().addNode({
        type: 'switch',
        position: { x: 0, y: 0 },
        subtype: 'l2-switch',
        sizeFlavor: 'small',
      });

      const node = getState().getNode(nodeId)!;
      const bwPorts = node.ports!.filter((p) => p.type === 'bw');
      const dwdmPorts = node.ports!.filter((p) => p.type === 'dwdm');

      expect(bwPorts).toHaveLength(l2Preset.sizes.small.bwPorts); // 8
      expect(dwdmPorts).toHaveLength(l2Preset.sizes.small.dwdmPorts); // 0
      expect(node.switchingCapacity).toBe(l2Preset.sizes.small.switchingCapacity); // 10
    });

    it('should work with custom subtypes added to settings', () => {
      // Add a custom subtype
      useSettingsStore.getState().addNodeSubtype({
        key: 'custom-router',
        label: 'Custom Router',
        nodeType: 'router',
        sizes: {
          small: { bwPorts: 2, dwdmPorts: 1, switchingCapacity: 50 },
          medium: { bwPorts: 4, dwdmPorts: 2, switchingCapacity: 200 },
          large: { bwPorts: 8, dwdmPorts: 4, switchingCapacity: 800 },
        },
      });

      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        subtype: 'custom-router',
        sizeFlavor: 'small',
      });

      const node = getState().getNode(nodeId)!;
      expect(node.ports!.filter((p) => p.type === 'bw')).toHaveLength(2);
      expect(node.ports!.filter((p) => p.type === 'dwdm')).toHaveLength(1);
      expect(node.switchingCapacity).toBe(50);
    });
  });

  describe('Settings Wiring', () => {
    it('should use defaultVendor from settings for new nodes', () => {
      const { getState } = useNetworkStore;
      useSettingsStore.getState().updateNetworkSettings({ defaultVendor: 'nokia' });

      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
      });

      const node = getState().getNode(nodeId)!;
      expect(node.vendor).toBe('nokia');

      useSettingsStore.getState().updateNetworkSettings({ defaultVendor: 'generic' });
    });

    it('should use defaultEdgeDistance from settings for new edges', () => {
      const { getState } = useNetworkStore;
      useSettingsStore.getState().updateNetworkSettings({ defaultEdgeDistance: 100 });

      const n1 = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const n2 = getState().addNode({ type: 'router', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(n1, n2);

      const edge = getState().topology.edges.find((e) => e.id === edgeId)!;
      expect(edge.properties.distance).toBe(100);

      useSettingsStore.getState().updateNetworkSettings({ defaultEdgeDistance: 50 });
    });

    it('should use defaultFiberProfile from settings for new edges', () => {
      const { getState } = useNetworkStore;
      useSettingsStore.getState().updateNetworkSettings({ defaultFiberProfile: 'G.655' });

      const n1 = getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      const n2 = getState().addNode({ type: 'router', position: { x: 100, y: 0 } });
      const edgeId = getState().addEdge(n1, n2);

      const edge = getState().topology.edges.find((e) => e.id === edgeId)!;
      expect(edge.properties.fiberProfile?.profileType).toBe('G.655');

      useSettingsStore.getState().updateNetworkSettings({ defaultFiberProfile: 'G.652.D' });
    });

    it('should use maxDWDMChannels from settings for new node DWDM ports', () => {
      const { getState } = useNetworkStore;
      useSettingsStore.getState().updateNetworkSettings({ maxDWDMChannels: 48 });

      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
      });

      const node = getState().getNode(nodeId)!;
      const dwdmPorts = node.ports!.filter((p) => p.type === 'dwdm');
      expect(dwdmPorts.length).toBeGreaterThan(0);
      dwdmPorts.forEach((p) => {
        expect(p.channels).toBe(48);
      });

      useSettingsStore.getState().updateNetworkSettings({ maxDWDMChannels: 96 });
    });

    it('should use maxDWDMChannels for subtype-provisioned DWDM ports', () => {
      const { getState } = useNetworkStore;
      useSettingsStore.getState().updateNetworkSettings({ maxDWDMChannels: 64 });

      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        subtype: 'core-router',
        sizeFlavor: 'small',
      });

      const node = getState().getNode(nodeId)!;
      const dwdmPorts = node.ports!.filter((p) => p.type === 'dwdm');
      expect(dwdmPorts.length).toBeGreaterThan(0);
      dwdmPorts.forEach((p) => {
        expect(p.channels).toBe(64);
      });

      useSettingsStore.getState().updateNetworkSettings({ maxDWDMChannels: 96 });
    });

    it('should respect historyLimit from settings', () => {
      const { getState } = useNetworkStore;
      useSettingsStore.getState().updateAdvancedSettings({ historyLimit: 3 });

      // Add multiple nodes to build up history (each addNode calls saveToHistory)
      for (let i = 0; i < 6; i++) {
        getState().addNode({ type: 'router', position: { x: i * 50, y: 0 } });
      }

      // History array should be capped at 3 entries
      expect(getState().history.length).toBeLessThanOrEqual(3);

      useSettingsStore.getState().updateAdvancedSettings({ historyLimit: 50 });
    });

    it('should allow explicit vendor override even with settings default', () => {
      const { getState } = useNetworkStore;
      useSettingsStore.getState().updateNetworkSettings({ defaultVendor: 'nokia' });

      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        vendor: 'cisco',
      });

      const node = getState().getNode(nodeId)!;
      expect(node.vendor).toBe('cisco');

      useSettingsStore.getState().updateNetworkSettings({ defaultVendor: 'generic' });
    });
  });

  describe('History Stability Hardening (Sprint 5)', () => {
    it('history index 0 should always be a keyframe after truncation', () => {
      const { getState } = useNetworkStore;
      useSettingsStore.getState().updateAdvancedSettings({ historyLimit: 5 });

      // Add enough nodes to trigger truncation (each addNode saves to history)
      for (let i = 0; i < 10; i++) {
        getState().addNode({ type: 'router', position: { x: i * 50, y: 0 } });
      }

      const history = getState().history;
      expect(history.length).toBeGreaterThan(0);
      expect(history.length).toBeLessThanOrEqual(5);
      // First entry must be a keyframe
      expect(history[0].type).toBe('keyframe');

      useSettingsStore.getState().updateAdvancedSettings({ historyLimit: 50 });
    });

    it('partialize should exclude history from persist output', () => {
      const { getState } = useNetworkStore;
      getState().addNode({ type: 'router', position: { x: 0, y: 0 } });

      // The persist config uses partialize to only include topology
      // Verify history is populated in state but wouldn't be persisted
      expect(getState().history.length).toBeGreaterThan(0);
      expect(getState().historyIndex).toBeGreaterThanOrEqual(0);

      // The partialize function only includes topology
      // We can't easily test the persist output directly, but we can verify
      // the state structure: history exists in state but is not in the topology object
      const topology = getState().topology;
      expect(topology).toBeDefined();
      expect((topology as Record<string, unknown>)['history']).toBeUndefined();
      expect((topology as Record<string, unknown>)['historyIndex']).toBeUndefined();
    });

    it('should handle undo/redo after many operations without corruption', () => {
      const { getState } = useNetworkStore;

      // Add several nodes
      const nodeIds: string[] = [];
      for (let i = 0; i < 15; i++) {
        const id = getState().addNode({ type: 'router', position: { x: i * 50, y: 0 } });
        nodeIds.push(id);
      }

      const nodeCountBefore = getState().topology.nodes.length;
      expect(nodeCountBefore).toBe(15);

      // Undo several times
      for (let i = 0; i < 5; i++) {
        getState().undo();
      }

      expect(getState().topology.nodes.length).toBe(10);

      // Redo all
      for (let i = 0; i < 5; i++) {
        getState().redo();
      }

      expect(getState().topology.nodes.length).toBe(15);
    });

    it('reconstruction should validate topology structure', () => {
      const { getState } = useNetworkStore;

      // Build up some history
      getState().addNode({ type: 'router', position: { x: 0, y: 0 } });
      getState().addNode({ type: 'switch', position: { x: 100, y: 0 } });

      // Current state should have valid topology
      const topology = getState().topology;
      expect(Array.isArray(topology.nodes)).toBe(true);
      expect(Array.isArray(topology.edges)).toBe(true);
      expect(topology.nodes.length).toBe(2);
    });
  });
});
