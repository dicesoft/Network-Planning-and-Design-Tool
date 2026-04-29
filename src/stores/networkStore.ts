import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  NetworkNode,
  NetworkEdge,
  NetworkTopology,
  Position,
  NodeType,
  EdgeType,
  EdgeProperties,
  LayerStack,
  Port,
  PortType,
  DEFAULT_PORTS_BY_NODE_TYPE,
  PORT_CONSTRAINTS,
} from '@/types';
import type {
  ChannelGridType,
  ChannelAllocation,
  PortSpectrum,
} from '@/types/spectrum';
import type { NodeSubtypePreset, NodeSizeFlavor } from '@/types/settings';
import type { CardDefinition, InstalledCard } from '@/types/inventory';
import { logNetworkEvent } from './eventStore';
import { useSettingsStore } from './settingsStore';
import { createIndexedDBStorage } from '@/lib/indexeddb-storage';
import { setupCrossTabSync, notifyCrossTabSync, getIsRehydrating, markStoreRehydrated } from '@/lib/cross-tab-sync';
import { compare as jsonPatchCompare, applyPatch, type Operation } from 'fast-json-patch';

/** IndexedDB-backed storage adapter with automatic localStorage fallback. */
const indexedDBStorage = createIndexedDBStorage();

/**
 * History entry: either a full keyframe snapshot or a forward/reverse JSON patch set.
 * Keyframes are stored every KEYFRAME_INTERVAL entries as a safety net.
 */
export type HistoryEntry =
  | { type: 'keyframe'; snapshot: NetworkTopology }
  | { type: 'patch'; forward: Operation[]; reverse: Operation[] };

/** Store a full keyframe every N entries. */
const KEYFRAME_INTERVAL = 10;

/** If a patch has more than this many operations, store a keyframe instead. */
const MAX_PATCH_OPS = 100;

/**
 * Reconstruct a topology at a given index by walking from the nearest keyframe.
 * Returns the topology or null if reconstruction fails.
 */
function reconstructTopologyAtIndex(
  history: HistoryEntry[],
  targetIndex: number,
): NetworkTopology | null {
  // Walk backward to find the nearest keyframe at or before targetIndex
  let keyframeIndex = targetIndex;
  while (keyframeIndex >= 0) {
    if (history[keyframeIndex].type === 'keyframe') break;
    keyframeIndex--;
  }

  if (keyframeIndex < 0 || history[keyframeIndex].type !== 'keyframe') {
    return null; // No keyframe found — should never happen
  }

  // Start from the keyframe snapshot (deep clone)
  let topology = JSON.parse(JSON.stringify(
    (history[keyframeIndex] as { type: 'keyframe'; snapshot: NetworkTopology }).snapshot,
  )) as NetworkTopology;

  // Apply forward patches from keyframe+1 to targetIndex
  for (let i = keyframeIndex + 1; i <= targetIndex; i++) {
    const entry = history[i];
    if (entry.type === 'keyframe') {
      // Another keyframe — just use its snapshot
      topology = JSON.parse(JSON.stringify(entry.snapshot));
    } else {
      try {
        const result = applyPatch(topology, entry.forward, true, false);
        topology = result.newDocument;
      } catch {
        // Patch apply failed — fall back to scanning for a closer keyframe
        let recovered = false;
        for (let j = i + 1; j <= targetIndex; j++) {
          if (history[j].type === 'keyframe') {
            topology = JSON.parse(JSON.stringify(
              (history[j] as { type: 'keyframe'; snapshot: NetworkTopology }).snapshot,
            ));
            // Continue applying from j+1
            i = j;
            recovered = true;
            break;
          }
        }
        // If no forward keyframe found, return what we have
        if (!recovered) break;
      }
    }
  }

  // Sanity check: verify reconstruction produced valid topology structure
  if (!topology || !Array.isArray(topology.nodes) || !Array.isArray(topology.edges)) {
    return null;
  }

  return topology;
}

/**
 * Debounced history save for actions called per-keystroke (e.g., text field edits).
 * Waits 500ms after the last call before saving to history.
 */
let pendingHistoryTimeout: ReturnType<typeof setTimeout> | null = null;

function saveToHistoryDebounced(store: { saveToHistory: () => void }) {
  if (pendingHistoryTimeout) clearTimeout(pendingHistoryTimeout);
  pendingHistoryTimeout = setTimeout(() => {
    store.saveToHistory();
    pendingHistoryTimeout = null;
  }, 500);
}

/**
 * Cancel any pending debounced history save without saving.
 * Used internally before undo/redo to prevent stale saves from corrupting history.
 */
function cancelHistoryDebounce() {
  if (pendingHistoryTimeout) {
    clearTimeout(pendingHistoryTimeout);
    pendingHistoryTimeout = null;
  }
}

/**
 * Flush any pending debounced history save — actually saves before clearing.
 * Exported for testing and for callers that need to ensure pending edits are captured.
 */
export function flushHistoryDebounce() {
  if (pendingHistoryTimeout) {
    clearTimeout(pendingHistoryTimeout);
    pendingHistoryTimeout = null;
    useNetworkStore.getState().saveToHistory();
  }
}

/**
 * Network store state interface
 */
interface NetworkState {
  // Data
  topology: NetworkTopology;

  // Selection
  selectedNodeIds: string[];
  selectedEdgeIds: string[];

  // History (for undo/redo) — compressed with JSON patches + periodic keyframes
  history: HistoryEntry[];
  historyIndex: number;

  // Actions - Nodes
  addNode: (node: Partial<NetworkNode> & { type: NodeType; position: Position }) => string;
  updateNode: (id: string, updates: Partial<NetworkNode>) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, position: Position) => void;

  // Actions - Edges
  addEdge: (sourceId: string, targetId: string, sourceHandle?: string, targetHandle?: string, type?: EdgeType) => string | null;
  addEdgeWithPorts: (sourceId: string, targetId: string, sourcePortId: string, targetPortId: string, type?: EdgeType, sourceHandle?: string, targetHandle?: string, initialProperties?: Partial<EdgeProperties>) => string | null;
  updateEdge: (id: string, updates: Partial<NetworkEdge>) => void;
  updateEdgeBendPoint: (edgeId: string, bendPoint: Position | null) => void;
  removeEdge: (id: string) => void;

  // Actions - Ports
  addPort: (nodeId: string, port: Omit<Port, 'id' | 'status' | 'connectedEdgeId'>) => string | null;
  updatePort: (nodeId: string, portId: string, updates: Partial<Omit<Port, 'id' | 'status' | 'connectedEdgeId'>>) => void;
  removePort: (nodeId: string, portId: string) => boolean;
  getAvailablePorts: (nodeId: string, portType?: PortType) => Port[];
  allocatePort: (nodeId: string, portId: string, edgeId: string) => boolean;
  deallocatePort: (nodeId: string, portId: string) => boolean;

  // Actions - Channel/Spectrum Management
  initializePortSpectrum: (nodeId: string, portId: string, gridType: ChannelGridType) => void;
  setPortGridType: (nodeId: string, portId: string, gridType: ChannelGridType) => void;
  allocateChannels: (nodeId: string, portId: string, channels: ChannelAllocation[], edgeId?: string) => boolean;
  deallocateChannels: (nodeId: string, portId: string, allocationIds: string[]) => boolean;
  deallocateChannelsByEdge: (nodeId: string, portId: string, edgeId: string) => boolean;
  clearAllocationsByPrefix: (prefix: string) => number;
  promoteReservationToAllocation: (nodeId: string, portId: string, allocationIds: string[]) => void;
  getPortSpectrum: (nodeId: string, portId: string) => PortSpectrum | null;
  getFreeChannels: (nodeId: string, portId: string) => number[];

  // Actions - Selection
  selectNodes: (ids: string[], append?: boolean) => void;
  selectEdges: (ids: string[], append?: boolean) => void;
  selectElements: (nodeIds: string[], edgeIds: string[], append?: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Actions - Topology
  loadTopology: (topology: NetworkTopology) => void;
  clearTopology: () => void;
  getNode: (id: string) => NetworkNode | undefined;
  getEdge: (id: string) => NetworkEdge | undefined;
  getConnectedEdges: (nodeId: string) => NetworkEdge[];

  // Actions - Batch append (chunked async loading)
  batchAppendNodes: (nodes: NetworkNode[]) => void;
  batchAppendEdges: (edges: NetworkEdge[]) => void;

  // Actions - Duplicate selected
  duplicateSelected: () => void;

  // Actions - Inventory (Card Management)
  installCard: (nodeId: string, cardDef: CardDefinition, slotNumber: number) => { success: boolean; cardId?: string; error?: string };
  removeCard: (nodeId: string, cardId: string) => { success: boolean; error?: string; hasServiceConflicts?: boolean };
  swapCard: (nodeId: string, oldCardId: string, newCardDef: CardDefinition) => { success: boolean; newCardId?: string; error?: string };

  // Actions - Amplifier insertion (edge splitting)
  insertAmplifierOnEdge: (edgeId: string, kmOffset: number) => { success: boolean; amplifierNodeId?: string; error?: string };

  // Actions - Delete selected
  deleteSelected: () => void;

  // Actions - History
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
  initializeHistory: () => void;
}

/**
 * Generate a unique ID
 */
const generateId = (): string => {
  return crypto.randomUUID();
};

/**
 * Get current timestamp
 */
const now = (): string => new Date().toISOString();

/**
 * Create default empty topology
 */
const createEmptyTopology = (): NetworkTopology => ({
  id: generateId(),
  name: 'New Network',
  version: '1.0.0',
  metadata: {
    created: now(),
    modified: now(),
  },
  nodes: [],
  edges: [],
});

/**
 * Create ports from a subtype preset configuration.
 * Generates the prescribed number of BW and DWDM ports for the given size flavor.
 */
const createPortsFromSubtypePreset = (preset: NodeSubtypePreset, sizeFlavor: NodeSizeFlavor): Port[] => {
  const sizeConfig = preset.sizes[sizeFlavor];
  if (!sizeConfig) return [];

  const defaultGridType = PORT_CONSTRAINTS.dwdm.defaultGridType;
  const maxDWDMChannels = useSettingsStore.getState().settings.network.maxDWDMChannels || 96;
  const ports: Port[] = [];

  // Generate BW ports
  for (let i = 1; i <= sizeConfig.bwPorts; i++) {
    ports.push({
      id: generateId(),
      name: `Eth-${i}`,
      type: 'bw',
      dataRate: '10G',
      channels: 1,
      status: 'available',
    });
  }

  // Generate DWDM ports
  for (let i = 1; i <= sizeConfig.dwdmPorts; i++) {
    ports.push({
      id: generateId(),
      name: `Line-${i}`,
      type: 'dwdm',
      dataRate: '100G',
      channels: maxDWDMChannels,
      status: 'available',
      spectrum: {
        gridType: defaultGridType,
        allocations: [],
      },
    });
  }

  return ports;
};

/**
 * Create default ports for a node type
 * Includes spectrum initialization for DWDM ports
 */
const createDefaultPorts = (type: NodeType): Port[] => {
  const portTemplates = DEFAULT_PORTS_BY_NODE_TYPE[type] || DEFAULT_PORTS_BY_NODE_TYPE['custom'];
  const defaultGridType = PORT_CONSTRAINTS.dwdm.defaultGridType;
  const maxDWDMChannels = useSettingsStore.getState().settings.network.maxDWDMChannels || 96;

  return portTemplates.map((template) => {
    const port: Port = {
      ...template,
      id: generateId(),
      status: 'available' as const,
    };
    // Apply maxDWDMChannels setting for DWDM ports
    if (template.type === 'dwdm') {
      port.channels = maxDWDMChannels;
      port.spectrum = {
        gridType: defaultGridType,
        allocations: [],
      };
    }
    return port;
  });
};

/**
 * Create a new node with defaults
 */
const createDefaultNode = (
  type: NodeType,
  position: Position,
  overrides: Partial<NetworkNode> = {}
): NetworkNode => {
  const defaultStacks: LayerStack[] = [];

  // Add default stacks based on node type
  if (type === 'router' || type === 'switch') {
    defaultStacks.push({
      layer: 'ip',
      enabled: true,
      capacity: { total: 100, unit: 'Gbps', used: 0 },
      properties: {},
    });
  }

  if (type === 'oadm' || type === 'amplifier' || type === 'terminal') {
    defaultStacks.push({
      layer: 'dwdm',
      enabled: true,
      capacity: { total: 88, unit: 'lambdas', used: 0 },
      properties: {},
    });
  }

  // Determine ports and switching capacity:
  // Priority: explicit ports override > subtype preset > node-type defaults
  let resolvedPorts: Port[];
  let resolvedSwitchingCapacity: number | undefined = overrides.switchingCapacity;

  if (overrides.ports) {
    // Explicit ports provided — use them as-is
    resolvedPorts = overrides.ports;
  } else if (overrides.subtype && overrides.sizeFlavor) {
    // Look up subtype preset from settings store
    const subtypes = useSettingsStore.getState().settings.nodeSubtypes;
    const preset = subtypes.find(
      (s) => s.key === overrides.subtype && s.nodeType === type
    );
    const sizeFlavor = overrides.sizeFlavor as NodeSizeFlavor;
    if (preset && preset.sizes[sizeFlavor]) {
      resolvedPorts = createPortsFromSubtypePreset(preset, sizeFlavor);
      if (resolvedSwitchingCapacity === undefined) {
        resolvedSwitchingCapacity = preset.sizes[sizeFlavor].switchingCapacity;
      }
    } else {
      // Preset not found — fall back to node-type defaults
      resolvedPorts = createDefaultPorts(type);
    }
  } else {
    // No subtype — use node-type defaults
    resolvedPorts = createDefaultPorts(type);
  }

  // Read defaults from settings (only applies to new nodes)
  const networkSettings = useSettingsStore.getState().settings.network;
  const defaultVendor = (networkSettings.defaultVendor || 'generic') as NetworkNode['vendor'];

  return {
    id: generateId(),
    name: `${type.charAt(0).toUpperCase() + type.slice(1)}-${Math.floor(Math.random() * 1000)}`,
    type,
    vendor: defaultVendor,
    position,
    stacks: defaultStacks,
    switchingCapacity: resolvedSwitchingCapacity,
    metadata: {},
    ...overrides,
    // Ensure subtype-provisioned ports are not overwritten by spread of overrides
    ports: resolvedPorts,
  };
};

/**
 * Create a new edge with defaults.
 * Uses defaultEdgeDistance and defaultFiberProfile from settings.
 */
const createDefaultEdge = (
  sourceId: string,
  targetId: string,
  sourceHandle?: string,
  targetHandle?: string,
  type: EdgeType = 'fiber'
): NetworkEdge => {
  const networkSettings = useSettingsStore.getState().settings.network;
  return {
    id: generateId(),
    name: `Link-${sourceId.slice(0, 4)}-${targetId.slice(0, 4)}`,
    type,
    source: { nodeId: sourceId, handle: sourceHandle },
    target: { nodeId: targetId, handle: targetHandle },
    properties: {
      distance: networkSettings.defaultEdgeDistance || 50,
      fiberProfile: {
        profileType: networkSettings.defaultFiberProfile || 'G.652.D',
      },
    },
    state: 'active',
    metadata: {},
  };
};

/**
 * Network store
 */
export const useNetworkStore = create<NetworkState>()(
  devtools(
    persist(
      immer((set, get) => ({
        // Initial state
        topology: createEmptyTopology(),
        selectedNodeIds: [],
        selectedEdgeIds: [],
        history: [],
        historyIndex: -1,

        // Node actions
        addNode: (nodeData) => {
          const node = createDefaultNode(nodeData.type, nodeData.position, nodeData);
          set((state) => {
            state.topology.nodes.push(node);
            state.topology.metadata.modified = now();
          });
          get().saveToHistory();
          logNetworkEvent('node', `Added ${node.type}: ${node.name}`, { nodeId: node.id, type: node.type });
          return node.id;
        },

        updateNode: (id, updates) => {
          set((state) => {
            const index = state.topology.nodes.findIndex((n) => n.id === id);
            if (index !== -1) {
              Object.assign(state.topology.nodes[index], updates);
              state.topology.metadata.modified = now();
            }
          });
          saveToHistoryDebounced(get());
        },

        removeNode: (id) => {
          const node = get().topology.nodes.find((n) => n.id === id);
          const nodeName = node?.name || id;
          set((state) => {
            // Remove the node
            state.topology.nodes = state.topology.nodes.filter((n) => n.id !== id);
            // Remove connected edges
            state.topology.edges = state.topology.edges.filter(
              (e) => e.source.nodeId !== id && e.target.nodeId !== id
            );
            // Clear from selection
            state.selectedNodeIds = state.selectedNodeIds.filter((nid) => nid !== id);
            state.topology.metadata.modified = now();
          });
          get().saveToHistory();
          logNetworkEvent('node', `Removed node: ${nodeName}`, { nodeId: id });
        },

        moveNode: (id, position) => {
          set((state) => {
            const node = state.topology.nodes.find((n) => n.id === id);
            if (node) {
              node.position = position;
              state.topology.metadata.modified = now();
            }
          });
          get().saveToHistory();
        },

        // Edge actions
        addEdge: (sourceId, targetId, sourceHandle, targetHandle, type = 'fiber') => {
          const state = get();

          // Validate nodes exist
          const sourceExists = state.topology.nodes.some((n) => n.id === sourceId);
          const targetExists = state.topology.nodes.some((n) => n.id === targetId);

          if (!sourceExists || !targetExists || sourceId === targetId) {
            return null;
          }

          const edge = createDefaultEdge(sourceId, targetId, sourceHandle, targetHandle, type);
          const sourceNode = get().topology.nodes.find((n) => n.id === sourceId);
          const targetNode = get().topology.nodes.find((n) => n.id === targetId);
          set((s) => {
            s.topology.edges.push(edge);
            s.topology.metadata.modified = now();
          });
          get().saveToHistory();
          logNetworkEvent('edge', `Added edge: ${sourceNode?.name || sourceId} → ${targetNode?.name || targetId}`, {
            edgeId: edge.id,
            sourceId,
            targetId
          });
          return edge.id;
        },

        updateEdge: (id, updates) => {
          set((state) => {
            const index = state.topology.edges.findIndex((e) => e.id === id);
            if (index !== -1) {
              Object.assign(state.topology.edges[index], updates);
              state.topology.metadata.modified = now();
            }
          });
          saveToHistoryDebounced(get());
        },

        updateEdgeBendPoint: (edgeId, bendPoint) => {
          set((state) => {
            const edge = state.topology.edges.find((e) => e.id === edgeId);
            if (edge) {
              if (bendPoint) {
                edge.properties.bendPoint = bendPoint;
              } else {
                delete edge.properties.bendPoint;
              }
              state.topology.metadata.modified = now();
            }
          });
          get().saveToHistory();
        },

        removeEdge: (id) => {
          const edge = get().topology.edges.find((e) => e.id === id);
          const edgeName = edge?.name || id;

          // Deallocate ports and channels before removing edge
          if (edge) {
            if (edge.source.portId) {
              // Deallocate channels first (if DWDM)
              get().deallocateChannelsByEdge(edge.source.nodeId, edge.source.portId, id);
              get().deallocatePort(edge.source.nodeId, edge.source.portId);
            }
            if (edge.target.portId) {
              // Deallocate channels first (if DWDM)
              get().deallocateChannelsByEdge(edge.target.nodeId, edge.target.portId, id);
              get().deallocatePort(edge.target.nodeId, edge.target.portId);
            }
          }

          set((state) => {
            state.topology.edges = state.topology.edges.filter((e) => e.id !== id);
            state.selectedEdgeIds = state.selectedEdgeIds.filter((eid) => eid !== id);
            state.topology.metadata.modified = now();
          });
          get().saveToHistory();
          logNetworkEvent('edge', `Removed edge: ${edgeName}`, { edgeId: id });
        },

        // Add edge with port selection
        addEdgeWithPorts: (sourceId, targetId, sourcePortId, targetPortId, type = 'fiber', sourceHandle, targetHandle, initialProperties) => {
          const state = get();

          // Validate nodes exist
          const sourceNode = state.topology.nodes.find((n) => n.id === sourceId);
          const targetNode = state.topology.nodes.find((n) => n.id === targetId);

          if (!sourceNode || !targetNode || sourceId === targetId) {
            return null;
          }

          // Validate ports exist and are available
          const sourcePort = sourceNode.ports?.find((p) => p.id === sourcePortId);
          const targetPort = targetNode.ports?.find((p) => p.id === targetPortId);

          if (!sourcePort || !targetPort) {
            return null;
          }

          if (sourcePort.status === 'used' || targetPort.status === 'used') {
            return null;
          }

          // Validate port type compatibility
          if (sourcePort.type !== targetPort.type) {
            return null;
          }

          // Check if edge already exists between the same ports
          const edgeExists = state.topology.edges.some(
            (e) =>
              (e.source.nodeId === sourceId &&
               e.target.nodeId === targetId &&
               e.source.portId === sourcePortId &&
               e.target.portId === targetPortId) ||
              (e.source.nodeId === targetId &&
               e.target.nodeId === sourceId &&
               e.source.portId === targetPortId &&
               e.target.portId === sourcePortId)
          );

          if (edgeExists) {
            return null;
          }

          // Create edge with port info
          const edgeId = generateId();
          const edge: NetworkEdge = {
            id: edgeId,
            name: `Link-${sourceNode.name}-${targetNode.name}`,
            type,
            source: { nodeId: sourceId, portId: sourcePortId, handle: sourceHandle },
            target: { nodeId: targetId, portId: targetPortId, handle: targetHandle },
            properties: {
              distance: 5, // Default distance, can be edited later
              sourcePortType: sourcePort.type,
              targetPortType: targetPort.type,
              ...initialProperties,
            },
            state: 'active',
            metadata: {},
          };

          set((s) => {
            s.topology.edges.push(edge);
            s.topology.metadata.modified = now();
          });

          // Allocate ports
          get().allocatePort(sourceId, sourcePortId, edgeId);
          get().allocatePort(targetId, targetPortId, edgeId);

          // Handle channel assignments if provided (for DWDM ports)
          if (initialProperties?.channelAssignment && sourcePort.type === 'dwdm') {
            const { sourceChannels, targetChannels } = initialProperties.channelAssignment;
            if (sourceChannels && sourceChannels.length > 0) {
              get().allocateChannels(sourceId, sourcePortId, sourceChannels, edgeId);
            }
            if (targetChannels && targetChannels.length > 0) {
              get().allocateChannels(targetId, targetPortId, targetChannels, edgeId);
            }
          }

          get().saveToHistory();
          logNetworkEvent('edge', `Added edge with ports: ${sourceNode.name}:${sourcePort.name} → ${targetNode.name}:${targetPort.name}`, {
            edgeId,
            sourceId,
            targetId,
            sourcePortId,
            targetPortId,
            channelAssignment: initialProperties?.channelAssignment ? true : false
          });
          return edgeId;
        },

        // Port actions
        addPort: (nodeId, portData) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node) return null;

          const portId = generateId();
          const port: Port = {
            ...portData,
            id: portId,
            status: 'available',
          };

          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1) {
              if (!state.topology.nodes[nodeIndex].ports) {
                state.topology.nodes[nodeIndex].ports = [];
              }
              state.topology.nodes[nodeIndex].ports!.push(port);
              state.topology.metadata.modified = now();
            }
          });

          get().saveToHistory();
          logNetworkEvent('port', `Added port ${port.name} to ${node.name}`, { nodeId, portId, portType: port.type });
          return portId;
        },

        updatePort: (nodeId, portId, updates) => {
          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1 && state.topology.nodes[nodeIndex].ports) {
              const portIndex = state.topology.nodes[nodeIndex].ports!.findIndex((p) => p.id === portId);
              if (portIndex !== -1) {
                Object.assign(state.topology.nodes[nodeIndex].ports![portIndex], updates);
                state.topology.metadata.modified = now();
              }
            }
          });
          saveToHistoryDebounced(get());
        },

        removePort: (nodeId, portId) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node || !node.ports) return false;

          const port = node.ports.find((p) => p.id === portId);
          if (!port) return false;

          // Cannot remove a port that is in use
          if (port.status === 'used') {
            return false;
          }

          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1 && state.topology.nodes[nodeIndex].ports) {
              state.topology.nodes[nodeIndex].ports = state.topology.nodes[nodeIndex].ports!.filter(
                (p) => p.id !== portId
              );
              state.topology.metadata.modified = now();
            }
          });

          get().saveToHistory();
          logNetworkEvent('port', `Removed port ${port.name} from ${node.name}`, { nodeId, portId });
          return true;
        },

        getAvailablePorts: (nodeId, portType) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node || !node.ports) return [];

          return node.ports.filter(
            (p) => p.status === 'available' && (portType === undefined || p.type === portType)
          );
        },

        allocatePort: (nodeId, portId, edgeId) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node || !node.ports) return false;

          const port = node.ports.find((p) => p.id === portId);
          if (!port || port.status === 'used') return false;

          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1 && state.topology.nodes[nodeIndex].ports) {
              const portIndex = state.topology.nodes[nodeIndex].ports!.findIndex((p) => p.id === portId);
              if (portIndex !== -1) {
                state.topology.nodes[nodeIndex].ports![portIndex].status = 'used';
                state.topology.nodes[nodeIndex].ports![portIndex].connectedEdgeId = edgeId;
                state.topology.metadata.modified = now();
              }
            }
          });

          return true;
        },

        deallocatePort: (nodeId, portId) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node || !node.ports) return false;

          const port = node.ports.find((p) => p.id === portId);
          if (!port) return false;

          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1 && state.topology.nodes[nodeIndex].ports) {
              const portIndex = state.topology.nodes[nodeIndex].ports!.findIndex((p) => p.id === portId);
              if (portIndex !== -1) {
                state.topology.nodes[nodeIndex].ports![portIndex].status = 'available';
                state.topology.nodes[nodeIndex].ports![portIndex].connectedEdgeId = undefined;
                state.topology.metadata.modified = now();
              }
            }
          });

          return true;
        },

        // Channel/Spectrum Management actions
        initializePortSpectrum: (nodeId, portId, gridType) => {
          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1 && state.topology.nodes[nodeIndex].ports) {
              const portIndex = state.topology.nodes[nodeIndex].ports!.findIndex((p) => p.id === portId);
              if (portIndex !== -1) {
                const port = state.topology.nodes[nodeIndex].ports![portIndex];
                // Only initialize spectrum for DWDM ports
                if (port.type === 'dwdm') {
                  port.spectrum = {
                    gridType,
                    allocations: [],
                  };
                  state.topology.metadata.modified = now();
                }
              }
            }
          });
        },

        setPortGridType: (nodeId, portId, gridType) => {
          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1 && state.topology.nodes[nodeIndex].ports) {
              const portIndex = state.topology.nodes[nodeIndex].ports!.findIndex((p) => p.id === portId);
              if (portIndex !== -1) {
                const port = state.topology.nodes[nodeIndex].ports![portIndex];
                if (port.spectrum) {
                  // Clear allocations when changing grid type (incompatible)
                  port.spectrum = {
                    gridType,
                    allocations: [],
                  };
                  state.topology.metadata.modified = now();
                }
              }
            }
          });
        },

        allocateChannels: (nodeId, portId, channels, edgeId) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node || !node.ports) return false;

          const port = node.ports.find((p) => p.id === portId);
          if (!port || port.type !== 'dwdm') return false;

          // Initialize spectrum if needed
          if (!port.spectrum) {
            const defaultGridType = PORT_CONSTRAINTS.dwdm.defaultGridType;
            get().initializePortSpectrum(nodeId, portId, defaultGridType);
          }

          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1 && state.topology.nodes[nodeIndex].ports) {
              const portIndex = state.topology.nodes[nodeIndex].ports!.findIndex((p) => p.id === portId);
              if (portIndex !== -1) {
                const portRef = state.topology.nodes[nodeIndex].ports![portIndex];
                if (portRef.spectrum) {
                  // Add new allocations with edge reference
                  const newAllocations = channels.map((ch) => ({
                    ...ch,
                    edgeId: edgeId || ch.edgeId,
                  }));
                  portRef.spectrum.allocations.push(...newAllocations);
                  state.topology.metadata.modified = now();
                }
              }
            }
          });

          return true;
        },

        deallocateChannels: (nodeId, portId, allocationIds) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node || !node.ports) return false;

          const port = node.ports.find((p) => p.id === portId);
          if (!port || !port.spectrum) return false;

          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1 && state.topology.nodes[nodeIndex].ports) {
              const portIndex = state.topology.nodes[nodeIndex].ports!.findIndex((p) => p.id === portId);
              if (portIndex !== -1) {
                const portRef = state.topology.nodes[nodeIndex].ports![portIndex];
                if (portRef.spectrum) {
                  portRef.spectrum.allocations = portRef.spectrum.allocations.filter(
                    (a) => !allocationIds.includes(a.id)
                  );
                  state.topology.metadata.modified = now();
                }
              }
            }
          });

          return true;
        },

        deallocateChannelsByEdge: (nodeId, portId, edgeId) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node || !node.ports) return false;

          const port = node.ports.find((p) => p.id === portId);
          if (!port || !port.spectrum) return false;

          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1 && state.topology.nodes[nodeIndex].ports) {
              const portIndex = state.topology.nodes[nodeIndex].ports!.findIndex((p) => p.id === portId);
              if (portIndex !== -1) {
                const portRef = state.topology.nodes[nodeIndex].ports![portIndex];
                if (portRef.spectrum) {
                  portRef.spectrum.allocations = portRef.spectrum.allocations.filter(
                    (a) => a.edgeId !== edgeId
                  );
                  state.topology.metadata.modified = now();
                }
              }
            }
          });

          return true;
        },

        clearAllocationsByPrefix: (prefix) => {
          let removedCount = 0;
          set((state) => {
            for (const node of state.topology.nodes) {
              if (!node.ports) continue;
              for (const port of node.ports) {
                if (!port.spectrum?.allocations) continue;
                const before = port.spectrum.allocations.length;
                port.spectrum.allocations = port.spectrum.allocations.filter(
                  (a) => !a.id.startsWith(prefix)
                );
                removedCount += before - port.spectrum.allocations.length;
              }
            }
            if (removedCount > 0) {
              state.topology.metadata.modified = now();
            }
          });
          return removedCount;
        },

        promoteReservationToAllocation: (nodeId, portId, allocationIds) => {
          set((state) => {
            const node = state.topology.nodes.find((n) => n.id === nodeId);
            if (!node?.ports) return;

            const port = node.ports.find((p) => p.id === portId);
            if (!port?.spectrum?.allocations) return;

            for (const alloc of port.spectrum.allocations) {
              if (allocationIds.includes(alloc.id) && alloc.status === 'reserved') {
                alloc.status = 'allocated';
                // Remove "[reserved]" suffix from label if present
                if (alloc.label) {
                  alloc.label = alloc.label.replace(' [reserved]', '');
                }
              }
            }
            state.topology.metadata.modified = now();
          });
        },

        getPortSpectrum: (nodeId, portId) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node || !node.ports) return null;

          const port = node.ports.find((p) => p.id === portId);
          if (!port || port.type !== 'dwdm') return null;

          return port.spectrum || null;
        },

        getFreeChannels: (nodeId, portId) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node || !node.ports) return [];

          const port = node.ports.find((p) => p.id === portId);
          if (!port || port.type !== 'dwdm' || !port.spectrum) return [];

          const spectrum = port.spectrum;
          const allocatedChannels = new Set(
            spectrum.allocations
              .filter((a) => a.channelNumber !== undefined)
              .map((a) => a.channelNumber!)
          );

          // Return free channel numbers based on grid type
          const freeChannels: number[] = [];
          if (spectrum.gridType === 'fixed-100ghz') {
            // 100 GHz grid: channels roughly -14 to 61 (common C-band range)
            for (let ch = -14; ch <= 61; ch++) {
              if (!allocatedChannels.has(ch)) {
                freeChannels.push(ch);
              }
            }
          } else if (spectrum.gridType === 'fixed-50ghz') {
            // 50 GHz grid: more channels available
            for (let ch = -35; ch <= 61; ch++) {
              if (!allocatedChannels.has(ch)) {
                freeChannels.push(ch);
              }
            }
          }
          // For flex-grid, channel numbers don't apply in the same way

          return freeChannels;
        },

        // Selection actions
        selectNodes: (ids, append = false) => {
          set((state) => {
            if (append) {
              state.selectedNodeIds = [...new Set([...state.selectedNodeIds, ...ids])];
            } else {
              state.selectedNodeIds = ids;
            }
          });
        },

        selectEdges: (ids, append = false) => {
          set((state) => {
            if (append) {
              state.selectedEdgeIds = [...new Set([...state.selectedEdgeIds, ...ids])];
            } else {
              state.selectedEdgeIds = ids;
            }
          });
        },

        selectElements: (nodeIds, edgeIds, append = false) => {
          const current = get();
          if (append) {
            const mergedNodes = [...new Set([...current.selectedNodeIds, ...nodeIds])];
            const mergedEdges = [...new Set([...current.selectedEdgeIds, ...edgeIds])];
            // Set-based equality check: O(1) lookups instead of O(n) Array.includes
            const currentNodeSet = new Set(current.selectedNodeIds);
            const currentEdgeSet = new Set(current.selectedEdgeIds);
            const nodesChanged =
              mergedNodes.length !== current.selectedNodeIds.length ||
              mergedNodes.some((id) => !currentNodeSet.has(id));
            const edgesChanged =
              mergedEdges.length !== current.selectedEdgeIds.length ||
              mergedEdges.some((id) => !currentEdgeSet.has(id));
            if (!nodesChanged && !edgesChanged) return;
            set((state) => {
              state.selectedNodeIds = mergedNodes;
              state.selectedEdgeIds = mergedEdges;
            });
          } else {
            // Set-based equality check: O(1) lookups instead of O(n) Array.includes
            const currentNodeSet = new Set(current.selectedNodeIds);
            const currentEdgeSet = new Set(current.selectedEdgeIds);
            const nodesChanged =
              nodeIds.length !== current.selectedNodeIds.length ||
              nodeIds.some((id) => !currentNodeSet.has(id));
            const edgesChanged =
              edgeIds.length !== current.selectedEdgeIds.length ||
              edgeIds.some((id) => !currentEdgeSet.has(id));
            if (!nodesChanged && !edgesChanged) return;
            set((state) => {
              state.selectedNodeIds = nodeIds;
              state.selectedEdgeIds = edgeIds;
            });
          }
        },

        clearSelection: () => {
          set((state) => {
            state.selectedNodeIds = [];
            state.selectedEdgeIds = [];
          });
        },

        selectAll: () => {
          set((state) => {
            state.selectedNodeIds = state.topology.nodes.map((n) => n.id);
            state.selectedEdgeIds = state.topology.edges.map((e) => e.id);
          });
        },

        // Topology actions
        loadTopology: (topology) => {
          // Migrate legacy topologies: add default ports to nodes without them
          // Also initialize spectrum for DWDM ports that don't have it
          const defaultGridType = PORT_CONSTRAINTS.dwdm.defaultGridType;
          const migratedTopology = {
            ...topology,
            nodes: topology.nodes.map((node) => {
              let ports = node.ports;
              if (!ports || ports.length === 0) {
                ports = createDefaultPorts(node.type);
              }
              // Initialize spectrum for DWDM ports without it
              ports = ports.map((port) => {
                if (port.type === 'dwdm' && !port.spectrum) {
                  return {
                    ...port,
                    spectrum: {
                      gridType: defaultGridType,
                      allocations: [],
                    },
                  };
                }
                return port;
              });
              return {
                ...node,
                ports,
              };
            }),
          };

          set((state) => {
            state.topology = migratedTopology;
            state.selectedNodeIds = [];
            state.selectedEdgeIds = [];
            // Seed history with a keyframe of the loaded topology
            state.history = [{ type: 'keyframe', snapshot: JSON.parse(JSON.stringify(migratedTopology)) }];
            state.historyIndex = 0;
          });
          logNetworkEvent('topology', `Loaded topology: ${topology.name}`, {
            nodeCount: topology.nodes.length,
            edgeCount: topology.edges.length
          });
        },

        clearTopology: () => {
          const emptyTopology = createEmptyTopology();
          set((state) => {
            state.topology = emptyTopology;
            state.selectedNodeIds = [];
            state.selectedEdgeIds = [];
            // Seed history with a keyframe of the empty topology
            state.history = [{ type: 'keyframe', snapshot: JSON.parse(JSON.stringify(emptyTopology)) }];
            state.historyIndex = 0;
          });
          logNetworkEvent('topology', 'Cleared topology');
        },

        getNode: (id) => get().topology.nodes.find((n) => n.id === id),

        getEdge: (id) => get().topology.edges.find((e) => e.id === id),

        getConnectedEdges: (nodeId) =>
          get().topology.edges.filter(
            (e) => e.source.nodeId === nodeId || e.target.nodeId === nodeId
          ),

        // Batch append — synchronously push a chunk of nodes into the existing topology
        batchAppendNodes: (nodes) => {
          if (nodes.length === 0) return;
          set((state) => {
            state.topology.nodes.push(...nodes);
            state.topology.metadata.modified = now();
          });
          get().saveToHistory();
        },

        // Batch append — synchronously push a chunk of edges into the existing topology
        batchAppendEdges: (edges) => {
          if (edges.length === 0) return;
          set((state) => {
            state.topology.edges.push(...edges);
            state.topology.metadata.modified = now();
          });
          get().saveToHistory();
        },

        // Inventory (Card Management) actions
        installCard: (nodeId, cardDef, slotNumber) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node) return { success: false, error: 'Node not found' };

          // Validate chassis exists
          if (!node.chassis) {
            return { success: false, error: 'Node has no chassis configured' };
          }

          // Validate slot number is within range
          if (slotNumber < 1 || slotNumber > node.chassis.totalSlots) {
            return { success: false, error: `Slot ${slotNumber} is out of range (1-${node.chassis.totalSlots})` };
          }

          // Check slot is not already occupied
          const existingCards = node.installedCards || [];
          if (existingCards.some((c) => c.slotNumber === slotNumber)) {
            return { success: false, error: `Slot ${slotNumber} is already occupied` };
          }

          // Validate card compatibility with node type
          if (cardDef.nodeType !== node.type) {
            return { success: false, error: `Card ${cardDef.name} is not compatible with ${node.type} nodes` };
          }

          // Create ports from card port templates
          const defaultGridType = PORT_CONSTRAINTS.dwdm.defaultGridType;
          const maxDWDMChannels = useSettingsStore.getState().settings.network.maxDWDMChannels || 96;
          const newPorts: Port[] = [];
          const portIds: string[] = [];

          for (const template of cardDef.portTemplate) {
            for (let i = 1; i <= template.count; i++) {
              const portId = generateId();
              portIds.push(portId);
              const port: Port = {
                id: portId,
                name: template.namePattern.replace('{n}', `${slotNumber}/${i}`),
                type: template.type,
                dataRate: template.dataRate,
                channels: template.type === 'dwdm' ? (template.channels || maxDWDMChannels) : 1,
                status: 'available',
              };
              if (template.type === 'dwdm') {
                port.spectrum = {
                  gridType: defaultGridType,
                  allocations: [],
                };
              }
              newPorts.push(port);
            }
          }

          const cardId = generateId();
          const installedCard: InstalledCard = {
            id: cardId,
            definitionId: cardDef.id,
            slotNumber,
            portIds,
            installedAt: Date.now(),
          };

          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1) {
              const nodeRef = state.topology.nodes[nodeIndex];
              if (!nodeRef.installedCards) {
                nodeRef.installedCards = [];
              }
              nodeRef.installedCards.push(installedCard);
              if (!nodeRef.ports) {
                nodeRef.ports = [];
              }
              nodeRef.ports.push(...newPorts);
              state.topology.metadata.modified = now();
            }
          });

          get().saveToHistory();
          logNetworkEvent('inventory', `Installed card ${cardDef.name} in slot ${slotNumber} on ${node.name}`, {
            nodeId, cardId, slotNumber, portCount: newPorts.length,
          });

          return { success: true, cardId };
        },

        removeCard: (nodeId, cardId) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node) return { success: false, error: 'Node not found' };

          const card = node.installedCards?.find((c) => c.id === cardId);
          if (!card) return { success: false, error: 'Card not found' };

          // Check if any ports from this card are in use (connected to edges or used by services)
          const cardPortIds = new Set(card.portIds);
          const usedPorts = (node.ports || []).filter(
            (p) => cardPortIds.has(p.id) && p.status === 'used'
          );

          if (usedPorts.length > 0) {
            return {
              success: false,
              error: `Cannot remove card: ${usedPorts.length} port(s) are in use`,
              hasServiceConflicts: true,
            };
          }

          set((state) => {
            const nodeIndex = state.topology.nodes.findIndex((n) => n.id === nodeId);
            if (nodeIndex !== -1) {
              const nodeRef = state.topology.nodes[nodeIndex];
              // Remove the card entry
              nodeRef.installedCards = (nodeRef.installedCards || []).filter(
                (c) => c.id !== cardId
              );
              // Remove ports created by this card
              nodeRef.ports = (nodeRef.ports || []).filter(
                (p) => !cardPortIds.has(p.id)
              );
              state.topology.metadata.modified = now();
            }
          });

          get().saveToHistory();
          logNetworkEvent('inventory', `Removed card from slot ${card.slotNumber} on ${node.name}`, {
            nodeId, cardId, slotNumber: card.slotNumber,
          });

          return { success: true };
        },

        swapCard: (nodeId, oldCardId, newCardDef) => {
          const node = get().topology.nodes.find((n) => n.id === nodeId);
          if (!node) return { success: false, error: 'Node not found' };

          const oldCard = node.installedCards?.find((c) => c.id === oldCardId);
          if (!oldCard) return { success: false, error: 'Old card not found' };

          // Check port usage on old card
          const oldCardPortIds = new Set(oldCard.portIds);
          const usedPorts = (node.ports || []).filter(
            (p) => oldCardPortIds.has(p.id) && p.status === 'used'
          );

          if (usedPorts.length > 0) {
            return {
              success: false,
              error: `Cannot swap card: ${usedPorts.length} port(s) are in use`,
            };
          }

          // Remove old card first (reuse slotNumber for new card)
          const slotNumber = oldCard.slotNumber;
          const removeResult = get().removeCard(nodeId, oldCardId);
          if (!removeResult.success) {
            return { success: false, error: removeResult.error };
          }

          // Install new card in the same slot
          const installResult = get().installCard(nodeId, newCardDef, slotNumber);
          if (!installResult.success) {
            return { success: false, error: installResult.error };
          }

          logNetworkEvent('inventory', `Swapped card in slot ${slotNumber} on ${node.name} to ${newCardDef.name}`, {
            nodeId, oldCardId, newCardId: installResult.cardId, slotNumber,
          });

          return { success: true, newCardId: installResult.cardId };
        },

        insertAmplifierOnEdge: (edgeId, kmOffset) => {
          const state = get();
          const edge = state.topology.edges.find((e) => e.id === edgeId);
          if (!edge) return { success: false, error: 'Edge not found' };

          const sourceNode = state.topology.nodes.find((n) => n.id === edge.source.nodeId);
          const targetNode = state.topology.nodes.find((n) => n.id === edge.target.nodeId);
          if (!sourceNode || !targetNode) return { success: false, error: 'Source or target node not found' };

          const totalDistance = edge.properties.distance || 50;
          if (kmOffset <= 0 || kmOffset >= totalDistance) {
            return { success: false, error: `kmOffset must be between 0 and ${totalDistance}` };
          }

          // Calculate position by interpolating between source and target
          const ratio = kmOffset / totalDistance;
          const ampPosition = {
            x: sourceNode.position.x + (targetNode.position.x - sourceNode.position.x) * ratio,
            y: sourceNode.position.y + (targetNode.position.y - sourceNode.position.y) * ratio,
          };

          // Create amplifier node with 2 DWDM line ports
          const ampNodeId = generateId();
          const defaultGridType = PORT_CONSTRAINTS.dwdm.defaultGridType;
          const maxDWDMChannels = useSettingsStore.getState().settings.network.maxDWDMChannels || 96;
          const ampPorts: Port[] = [
            {
              id: generateId(),
              name: 'LINE-IN',
              type: 'dwdm',
              dataRate: '100G',
              channels: maxDWDMChannels,
              status: 'available',
              spectrum: { gridType: defaultGridType, allocations: [] },
            },
            {
              id: generateId(),
              name: 'LINE-OUT',
              type: 'dwdm',
              dataRate: '100G',
              channels: maxDWDMChannels,
              status: 'available',
              spectrum: { gridType: defaultGridType, allocations: [] },
            },
          ];

          const ampNode: NetworkNode = {
            id: ampNodeId,
            name: `Amp-${sourceNode.name}-${targetNode.name}`,
            type: 'amplifier',
            vendor: 'generic',
            position: ampPosition,
            stacks: [{ layer: 'dwdm', enabled: true, capacity: { total: 88, unit: 'lambdas', used: 0 }, properties: {} }],
            ports: ampPorts,
            metadata: {},
          };

          // Create two new edges: source→amplifier, amplifier→target
          const edge1Id = generateId();
          const edge2Id = generateId();

          const sharedProps = {
            fiberProfile: edge.properties.fiberProfile ? { ...edge.properties.fiberProfile } : undefined,
            srlgCodes: edge.properties.srlgCodes ? [...edge.properties.srlgCodes] : undefined,
          };

          const edge1: NetworkEdge = {
            id: edge1Id,
            name: `Link-${sourceNode.name}-${ampNode.name}`,
            type: edge.type,
            source: { nodeId: edge.source.nodeId },
            target: { nodeId: ampNodeId },
            properties: {
              distance: Math.round(kmOffset * 100) / 100,
              ...sharedProps,
            },
            state: 'active',
            metadata: {},
          };

          const edge2: NetworkEdge = {
            id: edge2Id,
            name: `Link-${ampNode.name}-${targetNode.name}`,
            type: edge.type,
            source: { nodeId: ampNodeId },
            target: { nodeId: edge.target.nodeId },
            properties: {
              distance: Math.round((totalDistance - kmOffset) * 100) / 100,
              ...sharedProps,
            },
            state: 'active',
            metadata: {},
          };

          // Apply all changes atomically via a single immer mutation
          set((s) => {
            // Remove original edge
            s.topology.edges = s.topology.edges.filter((e) => e.id !== edgeId);
            // Add amplifier node and two new edges
            s.topology.nodes.push(ampNode);
            s.topology.edges.push(edge1, edge2);
            s.topology.metadata.modified = now();
          });

          get().saveToHistory();
          logNetworkEvent('amplifier', `Inserted amplifier on edge ${edge.name} at ${kmOffset} km`, {
            edgeId, amplifierNodeId: ampNodeId, kmOffset, edge1Id, edge2Id,
          });

          return { success: true, amplifierNodeId: ampNodeId };
        },

        duplicateSelected: () => {
          const state = get();
          const { selectedNodeIds, selectedEdgeIds } = state;

          if (selectedNodeIds.length === 0) return;

          const selectedNodeSet = new Set(selectedNodeIds);

          // Build ID remap tables: old -> new
          const nodeIdMap = new Map<string, string>();
          const portIdMap = new Map<string, string>();

          // Clone selected nodes with new IDs and offset positions
          const newNodes: NetworkNode[] = [];
          for (const nodeId of selectedNodeIds) {
            const origNode = state.topology.nodes.find((n) => n.id === nodeId);
            if (!origNode) continue;

            const newNodeId = generateId();
            nodeIdMap.set(origNode.id, newNodeId);

            // Deep-clone and remap port IDs, strip spectrum allocations
            const newPorts: Port[] = (origNode.ports || []).map((port) => {
              const newPortId = generateId();
              portIdMap.set(port.id, newPortId);
              const clonedPort: Port = {
                ...JSON.parse(JSON.stringify(port)),
                id: newPortId,
                status: 'available' as const,
                connectedEdgeId: undefined,
              };
              // Strip spectrum allocations but keep grid type
              if (clonedPort.spectrum) {
                clonedPort.spectrum = {
                  gridType: clonedPort.spectrum.gridType,
                  allocations: [],
                };
              }
              return clonedPort;
            });

            const newNode: NetworkNode = {
              ...JSON.parse(JSON.stringify(origNode)),
              id: newNodeId,
              name: `${origNode.name} (copy)`,
              position: {
                x: origNode.position.x + 50,
                y: origNode.position.y + 50,
              },
              ports: newPorts,
            };
            newNodes.push(newNode);
          }

          // Clone edges where BOTH endpoints are in the selection
          const newEdges: NetworkEdge[] = [];
          const edgeCandidates = state.topology.edges.filter(
            (e) =>
              selectedNodeSet.has(e.source.nodeId) &&
              selectedNodeSet.has(e.target.nodeId)
          );
          // Also include explicitly selected edges that qualify
          for (const edgeId of selectedEdgeIds) {
            const edge = state.topology.edges.find((e) => e.id === edgeId);
            if (
              edge &&
              selectedNodeSet.has(edge.source.nodeId) &&
              selectedNodeSet.has(edge.target.nodeId) &&
              !edgeCandidates.some((e) => e.id === edge.id)
            ) {
              edgeCandidates.push(edge);
            }
          }

          for (const edge of edgeCandidates) {
            const newEdgeId = generateId();
            const newSourceNodeId = nodeIdMap.get(edge.source.nodeId);
            const newTargetNodeId = nodeIdMap.get(edge.target.nodeId);
            if (!newSourceNodeId || !newTargetNodeId) continue;

            const clonedEdge: NetworkEdge = {
              ...JSON.parse(JSON.stringify(edge)),
              id: newEdgeId,
              name: `${edge.name} (copy)`,
              source: {
                ...edge.source,
                nodeId: newSourceNodeId,
                portId: edge.source.portId ? portIdMap.get(edge.source.portId) : undefined,
              },
              target: {
                ...edge.target,
                nodeId: newTargetNodeId,
                portId: edge.target.portId ? portIdMap.get(edge.target.portId) : undefined,
              },
            };
            // Strip channel assignment from properties
            if (clonedEdge.properties.channelAssignment) {
              delete clonedEdge.properties.channelAssignment;
            }
            newEdges.push(clonedEdge);
          }

          // Mark ports as used for cloned edges
          const portUsageMap = new Map<string, string>(); // portId -> edgeId
          for (const edge of newEdges) {
            if (edge.source.portId) {
              portUsageMap.set(edge.source.portId, edge.id);
            }
            if (edge.target.portId) {
              portUsageMap.set(edge.target.portId, edge.id);
            }
          }

          // Apply port usage to new nodes
          for (const node of newNodes) {
            if (node.ports) {
              for (const port of node.ports) {
                const edgeId = portUsageMap.get(port.id);
                if (edgeId) {
                  port.status = 'used';
                  port.connectedEdgeId = edgeId;
                }
              }
            }
          }

          const newNodeIds = newNodes.map((n) => n.id);
          const newEdgeIds = newEdges.map((e) => e.id);

          // Apply as a single batch mutation
          set((s) => {
            s.topology.nodes.push(...newNodes);
            s.topology.edges.push(...newEdges);
            // Select new elements, deselect originals
            s.selectedNodeIds = newNodeIds;
            s.selectedEdgeIds = newEdgeIds;
            s.topology.metadata.modified = now();
          });

          get().saveToHistory();
          logNetworkEvent('duplicate', `Duplicated ${newNodes.length} node(s), ${newEdges.length} edge(s)`, {
            duplicatedNodes: newNodes.length,
            duplicatedEdges: newEdges.length,
          });
        },

        deleteSelected: () => {
          const state = get();
          const nodeCount = state.selectedNodeIds.length;
          const edgeCount = state.selectedEdgeIds.length;

          if (nodeCount === 0 && edgeCount === 0) return;

          // Collect all edges to be deleted (selected edges + edges connected to selected nodes)
          const edgesToDelete = state.topology.edges.filter(
            (e) =>
              state.selectedEdgeIds.includes(e.id) ||
              state.selectedNodeIds.includes(e.source.nodeId) ||
              state.selectedNodeIds.includes(e.target.nodeId)
          );

          // Deallocate ports for all edges being deleted
          // Only deallocate ports on nodes that are NOT being deleted
          for (const edge of edgesToDelete) {
            if (edge.source.portId && !state.selectedNodeIds.includes(edge.source.nodeId)) {
              get().deallocatePort(edge.source.nodeId, edge.source.portId);
            }
            if (edge.target.portId && !state.selectedNodeIds.includes(edge.target.nodeId)) {
              get().deallocatePort(edge.target.nodeId, edge.target.portId);
            }
          }

          set((s) => {
            // Remove selected nodes and their connected edges
            s.topology.nodes = s.topology.nodes.filter(
              (n) => !s.selectedNodeIds.includes(n.id)
            );
            s.topology.edges = s.topology.edges.filter(
              (e) =>
                !s.selectedEdgeIds.includes(e.id) &&
                !s.selectedNodeIds.includes(e.source.nodeId) &&
                !s.selectedNodeIds.includes(e.target.nodeId)
            );
            s.selectedNodeIds = [];
            s.selectedEdgeIds = [];
            s.topology.metadata.modified = now();
          });
          get().saveToHistory();
          logNetworkEvent('delete', `Deleted ${nodeCount} node(s), ${edgeCount} edge(s)`, {
            deletedNodes: nodeCount,
            deletedEdges: edgeCount
          });
        },

        // History actions
        saveToHistory: () => {
          const historyLimit = useSettingsStore.getState().settings.advanced.historyLimit || 50;
          // Need to read current state outside immer to reconstruct the previous topology
          const currentHistory = get().history;
          const currentIndex = get().historyIndex;
          const currentTopology = JSON.parse(JSON.stringify(get().topology)) as NetworkTopology;

          // Reconstruct previous topology for diffing
          const previousTopology = reconstructTopologyAtIndex(currentHistory, currentIndex);

          set((state) => {
            // Remove any future history if we're not at the end
            const newHistory = state.history.slice(0, state.historyIndex + 1) as HistoryEntry[];
            const newIndex = newHistory.length; // This will be the index of the new entry

            // Decide whether to store as keyframe or patch
            let forceKeyframe = newIndex % KEYFRAME_INTERVAL === 0 || !previousTopology;

            if (!forceKeyframe) {
              // Compute forward (prev -> current) and reverse (current -> prev) patches
              const forward = jsonPatchCompare(previousTopology!, currentTopology);
              const reverse = jsonPatchCompare(currentTopology, previousTopology!);

              // (b) If patch has >100 ops, promote to keyframe instead
              if (forward.length > MAX_PATCH_OPS || reverse.length > MAX_PATCH_OPS) {
                forceKeyframe = true;
              } else {
                newHistory.push({ type: 'patch', forward, reverse });
              }
            }

            if (forceKeyframe) {
              newHistory.push({ type: 'keyframe', snapshot: currentTopology });
            }

            // Keep only last N entries (from settings)
            // When trimming, ensure the first entry is always a keyframe
            while (newHistory.length > historyLimit) {
              // If entry at index 1 (will become index 0 after shift) is a patch,
              // reconstruct topology BEFORE shifting so we have access to the keyframe
              if (newHistory.length > 1 && newHistory[1].type === 'patch') {
                const reconstructed = reconstructTopologyAtIndex(newHistory, 1);
                if (reconstructed) {
                  newHistory[1] = { type: 'keyframe', snapshot: reconstructed };
                }
              }
              newHistory.shift();
            }

            // (a) After truncation, ensure index 0 is always a keyframe
            if (newHistory.length > 0 && newHistory[0].type !== 'keyframe') {
              const reconstructed = reconstructTopologyAtIndex(newHistory, 0);
              if (reconstructed) {
                newHistory[0] = { type: 'keyframe', snapshot: reconstructed };
              }
            }

            state.history = newHistory;
            state.historyIndex = newHistory.length - 1;
          });
        },

        undo: () => {
          // Cancel any pending debounced save to prevent history corruption
          cancelHistoryDebounce();
          const currentState = get();
          const canUndo = currentState.historyIndex > 0;
          if (!canUndo) return;

          const targetIndex = currentState.historyIndex - 1;
          const entry = currentState.history[currentState.historyIndex];

          // Fast path: use reverse patch if available
          let targetTopology: NetworkTopology | null = null;
          if (entry.type === 'patch') {
            try {
              const current = JSON.parse(JSON.stringify(currentState.topology)) as NetworkTopology;
              const result = applyPatch(current, entry.reverse, true, false);
              targetTopology = result.newDocument;
            } catch {
              // Patch failed — fall back to reconstruction
              targetTopology = null;
            }
          }

          // Slow path: reconstruct from keyframe
          if (!targetTopology) {
            targetTopology = reconstructTopologyAtIndex(currentState.history, targetIndex);
          }

          if (targetTopology) {
            set((state) => {
              state.historyIndex = targetIndex;
              state.topology = targetTopology!;
              state.selectedNodeIds = [];
              state.selectedEdgeIds = [];
            });
            logNetworkEvent('history', `Undo (index: ${get().historyIndex})`);
          }
        },

        redo: () => {
          // Cancel any pending debounced save to prevent history corruption
          cancelHistoryDebounce();
          const currentState = get();
          const canRedo = currentState.historyIndex < currentState.history.length - 1;
          if (!canRedo) return;

          const targetIndex = currentState.historyIndex + 1;
          const entry = currentState.history[targetIndex];

          // Fast path: use forward patch if available
          let targetTopology: NetworkTopology | null = null;
          if (entry.type === 'patch') {
            try {
              const current = JSON.parse(JSON.stringify(currentState.topology)) as NetworkTopology;
              const result = applyPatch(current, entry.forward, true, false);
              targetTopology = result.newDocument;
            } catch {
              // Patch failed — fall back to reconstruction
              targetTopology = null;
            }
          }

          // Slow path: reconstruct from keyframe
          if (!targetTopology) {
            targetTopology = reconstructTopologyAtIndex(currentState.history, targetIndex);
          }

          if (targetTopology) {
            set((state) => {
              state.historyIndex = targetIndex;
              state.topology = targetTopology!;
              state.selectedNodeIds = [];
              state.selectedEdgeIds = [];
            });
            logNetworkEvent('history', `Redo (index: ${get().historyIndex})`);
          }
        },

        initializeHistory: () => {
          const state = get();
          // Only seed if history is empty (first app load)
          if (state.history.length === 0) {
            set((s) => {
              s.history = [{ type: 'keyframe', snapshot: JSON.parse(JSON.stringify(s.topology)) }];
              s.historyIndex = 0;
            });
          }
        },
      })),
      {
        name: 'network-topology-storage',
        storage: createJSONStorage(() => indexedDBStorage),
        partialize: (state) => ({ topology: state.topology } as unknown as NetworkState),
        onRehydrateStorage: () => () => {
          markStoreRehydrated('network-topology-storage');
        },
      }
    ),
    { name: 'NetworkStore' }
  )
);

/**
 * Setup cross-tab synchronization for network store.
 * Uses BroadcastChannel (with storage event fallback).
 */
export const setupNetworkStoreCrossTabSync = () => {
  if (typeof window === 'undefined') return;

  const cleanupSync = setupCrossTabSync('network-topology-storage', useNetworkStore);

  // Only broadcast on topology data changes (not selection or history changes).
  // This prevents feedback loops where selection/history state changes trigger
  // cross-tab rehydration that overwrites user edits.
  let prevTopologyRef = useNetworkStore.getState().topology;
  const unsubscribe = useNetworkStore.subscribe((state) => {
    // Skip broadcast if we are inside a rehydrate cycle
    if (getIsRehydrating()) return;
    // Only broadcast if the topology reference actually changed
    if (state.topology !== prevTopologyRef) {
      prevTopologyRef = state.topology;
      notifyCrossTabSync('network-topology-storage');
    }
  });

  return () => {
    cleanupSync();
    unsubscribe();
  };
};
