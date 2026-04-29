/**
 * Async chunked loading utility for large topologies.
 *
 * Appends nodes and edges in configurable chunks with requestAnimationFrame
 * yielding between chunks to keep the UI responsive.
 */

import { useNetworkStore } from '@/stores/networkStore';
import type { NetworkNode, NetworkTopology } from '@/types/network';
import { PORT_CONSTRAINTS } from '@/types/network';
import { suppressCrossTabSync, resumeCrossTabSync } from '@/lib/cross-tab-sync';
import { suppressPersist, resumePersist } from '@/lib/indexeddb-storage';

// Default chunk sizes
const DEFAULT_NODE_CHUNK_SIZE = 75;
const DEFAULT_EDGE_CHUNK_SIZE = 100;

export interface ChunkedLoadOptions {
  /** Nodes per chunk (default 75) */
  nodeChunkSize?: number;
  /** Edges per chunk (default 100) */
  edgeChunkSize?: number;
  /** Called with progress 0-100 */
  onProgress?: (progress: number, statusText: string) => void;
}

export interface ChunkedLoadResult {
  nodesLoaded: number;
  edgesLoaded: number;
  cancelled: boolean;
  error?: string;
}

/** Yield a frame so the browser can paint */
function yieldFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Migrate a node: ensure ports + spectrum are initialized.
 * This mirrors the migration logic in loadTopology.
 */
function migrateNode(node: NetworkNode): NetworkNode {
  const defaultGridType = PORT_CONSTRAINTS.dwdm.defaultGridType;
  let ports = node.ports;
  if (!ports || ports.length === 0) {
    // No ports — leave as-is for chunked append (they were already created by the generator)
    return node;
  }
  // Initialize spectrum for DWDM ports without it
  ports = ports.map((port) => {
    if (port.type === 'dwdm' && !port.spectrum) {
      return {
        ...port,
        spectrum: { gridType: defaultGridType, allocations: [] },
      };
    }
    return port;
  });
  return { ...node, ports };
}

/**
 * Load a full topology in async chunks.
 *
 * 1. Clears existing topology
 * 2. Sets the topology shell (id, name, metadata) with empty nodes/edges
 * 3. Appends nodes in chunks via batchAppendNodes
 * 4. Appends edges in chunks via batchAppendEdges
 * 5. Saves to history once complete
 *
 * Returns an AbortController-compatible cancel handle via the returned object.
 */
export async function loadTopologyChunked(
  topology: NetworkTopology,
  options: ChunkedLoadOptions = {},
): Promise<ChunkedLoadResult> {
  const {
    nodeChunkSize = DEFAULT_NODE_CHUNK_SIZE,
    edgeChunkSize = DEFAULT_EDGE_CHUNK_SIZE,
    onProgress,
  } = options;

  const store = useNetworkStore.getState();
  let cancelled = false;

  // Create a cancel handle that can be invoked externally
  const cancelHandle = { cancel: () => { cancelled = true; } };
  // Attach cancel to the returned promise
  const resultPromise = (async (): Promise<ChunkedLoadResult> => {
    const totalNodes = topology.nodes.length;
    const totalEdges = topology.edges.length;
    const totalItems = totalNodes + totalEdges;

    if (totalItems === 0) {
      store.loadTopology(topology);
      onProgress?.(100, 'Empty topology loaded');
      return { nodesLoaded: 0, edgesLoaded: 0, cancelled: false };
    }

    // Snapshot pre-import state for rollback
    const preImportTopology = JSON.parse(JSON.stringify(store.topology));

    // Suppress persist writes and cross-tab broadcasts during chunked loading.
    // A single persist write happens at the end after all chunks are loaded.
    suppressCrossTabSync();
    suppressPersist();

    try {
      // Step 1: Clear and create shell topology (no nodes/edges yet)
      const shellTopology: NetworkTopology = {
        ...topology,
        nodes: [],
        edges: [],
      };
      store.loadTopology(shellTopology);

      onProgress?.(0, `Loading ${totalNodes} nodes...`);
      await yieldFrame();

      // Step 2: Append nodes in chunks
      let nodesLoaded = 0;
      const migratedNodes = topology.nodes.map(migrateNode);

      for (let i = 0; i < migratedNodes.length; i += nodeChunkSize) {
        if (cancelled) {
          // Rollback: restore pre-import state
          store.loadTopology(preImportTopology);
          return { nodesLoaded, edgesLoaded: 0, cancelled: true };
        }

        const chunk = migratedNodes.slice(i, i + nodeChunkSize);
        store.batchAppendNodes(chunk);
        nodesLoaded += chunk.length;

        const nodeProgress = (nodesLoaded / totalItems) * 100;
        onProgress?.(
          Math.round(nodeProgress),
          `Loading nodes... ${nodesLoaded}/${totalNodes}`,
        );
        await yieldFrame();
      }

      onProgress?.(
        Math.round((totalNodes / totalItems) * 100),
        `Nodes complete. Loading ${totalEdges} edges...`,
      );
      await yieldFrame();

      // Step 3: Append edges in chunks
      let edgesLoaded = 0;
      for (let i = 0; i < topology.edges.length; i += edgeChunkSize) {
        if (cancelled) {
          store.loadTopology(preImportTopology);
          return { nodesLoaded, edgesLoaded, cancelled: true };
        }

        const chunk = topology.edges.slice(i, i + edgeChunkSize);
        store.batchAppendEdges(chunk);
        edgesLoaded += chunk.length;

        const totalProgress = ((nodesLoaded + edgesLoaded) / totalItems) * 100;
        onProgress?.(
          Math.round(totalProgress),
          `Loading edges... ${edgesLoaded}/${totalEdges}`,
        );
        await yieldFrame();
      }

      // Step 4: Save to history
      store.saveToHistory();
      onProgress?.(100, `Loaded ${nodesLoaded} nodes, ${edgesLoaded} edges`);

      return { nodesLoaded, edgesLoaded, cancelled: false };
    } finally {
      // Resume persist and cross-tab sync — the next Zustand persist cycle
      // will write the final complete state as a single atomic operation.
      resumePersist();
      resumeCrossTabSync();
    }
  })();

  // Attach the cancel function to the promise for external access
  (resultPromise as ChunkedLoadPromise).cancelHandle = cancelHandle;
  return resultPromise;
}

/** Extended promise type with a cancel handle */
export interface ChunkedLoadPromise extends Promise<ChunkedLoadResult> {
  cancelHandle?: { cancel: () => void };
}
