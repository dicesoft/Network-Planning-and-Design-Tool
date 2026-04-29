/**
 * Debug Data Generator
 *
 * Pure logic module for generating test data: random channel fills,
 * random services, seed scenarios, and cleanup.
 *
 * Convention: All debug-generated data uses:
 *   - allocation IDs prefixed with "debug-"
 *   - services with metadata.debugGenerated = true
 */

import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { GraphEngine } from '@/core/graph/GraphEngine';
import { PathFinder } from '@/core/graph/PathFinder';
import { ChannelChecker, type ChannelTopologyProvider } from '@/core/services/ChannelChecker';
import { userToItuChannel } from '@/core/spectrum/channelConfig';
import type { ChannelAllocation } from '@/types/spectrum';
import type { Service, ServicePath } from '@/types/service';
import type { NetworkNode, NetworkEdge } from '@/types/network';

// ============================================================================
// TYPES
// ============================================================================

export type FragmentationPattern = 'uniform' | 'clustered' | 'fragmented';
export type AllocationStatus = 'allocated' | 'reserved';
export type StatusMix = 'all-active' | 'all-planned' | 'mixed';
export type ChannelStrategy = 'sequential' | 'random';

export type FillMode = 'utilization' | 'exact';

export interface RandomFillOptions {
  mode?: FillMode;           // default: 'utilization'
  targetUtilization: number; // 0-100 (used when mode='utilization')
  exactCount?: number;       // fill exactly N channels per edge (used when mode='exact')
  allocationStatus: AllocationStatus;
  fragmentationPattern: FragmentationPattern;
  edgeFilter?: string[];
  variation?: number;        // 0-50 percentage variation for non-uniform distribution
}

export interface RandomFillResult {
  totalAllocated: number;
  edgesAffected: number;
  allocationIds: string[];
  errors: string[];
}

/** Per-edge fill preview for showing before apply */
export interface EdgeFillPreview {
  edgeId: string;
  edgeName: string;
  sourceNodeName: string;
  targetNodeName: string;
  currentAllocated: number;
  targetCount: number;
  newChannels: number;
}

export interface RandomServiceOptions {
  count: number; // 1-20
  protectionRatio: number; // 0-100
  statusMix: StatusMix;
  channelStrategy: ChannelStrategy;
  includeL2L3: boolean;
}

/** Options for generating only L1 DWDM services */
export interface L1ServiceGenOptions {
  count: number;
  protectionRatio: number;
  channelStrategy: ChannelStrategy;
  statusMix: StatusMix;
}

/** Options for generating only L2/L3 IP services */
export interface L2L3ServiceGenOptions {
  count: number;
  underlayMode: 'auto' | 'existing';
  bfdEnabled: boolean;
}

export interface RandomServiceResult {
  created: number;
  serviceIds: string[];
  errors: string[];
}

/** Info about channel fill estimation */
export interface ChannelFillEstimate {
  targetChannelsPerEdge: number;
  dwdmEdgeCount: number;
  totalNewChannels: number;
  alreadyAllocatedAvg: number;
}

export interface SeedScenarioResult {
  nodesCreated: number;
  edgesCreated: number;
  servicesCreated: number;
  channelsAllocated: number;
  errors: string[];
}

export interface DebugDataStats {
  debugAllocations: number;
  debugServices: number;
  debugNodes: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTopologyProvider(): ChannelTopologyProvider {
  const state = useNetworkStore.getState();
  return {
    getNode: (id: string) => state.topology.nodes.find((n) => n.id === id),
    getEdge: (id: string) => state.topology.edges.find((e) => e.id === id),
    getEdges: () => state.topology.edges,
  };
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate channel numbers based on fragmentation pattern
 */
function generateChannelsByPattern(
  count: number,
  totalChannels: number,
  pattern: FragmentationPattern,
  existingAllocated: Set<number> = new Set()
): number[] {
  const available: number[] = [];
  for (let ch = 1; ch <= totalChannels; ch++) {
    if (!existingAllocated.has(ch)) available.push(ch);
  }

  if (count >= available.length) return available;
  if (count <= 0) return [];

  switch (pattern) {
    case 'uniform': {
      // Evenly spaced across available spectrum
      const result: number[] = [];
      const step = available.length / count;
      for (let i = 0; i < count; i++) {
        result.push(available[Math.floor(i * step)]);
      }
      return result;
    }

    case 'clustered': {
      // Groups of 5-15 contiguous channels
      const result: number[] = [];
      let remaining = count;
      const shuffled = shuffleArray(available);
      let idx = 0;

      while (remaining > 0 && idx < shuffled.length) {
        const clusterSize = Math.min(
          remaining,
          5 + Math.floor(Math.random() * 11) // 5-15
        );
        // Pick a starting point and grab contiguous from available
        const start = shuffled[idx];
        let added = 0;
        for (let ch = start; ch <= totalChannels && added < clusterSize; ch++) {
          if (!existingAllocated.has(ch) && !result.includes(ch)) {
            result.push(ch);
            added++;
          }
        }
        remaining -= added;
        idx += clusterSize + Math.floor(Math.random() * 5); // gap between clusters
      }
      return result.slice(0, count);
    }

    case 'fragmented': {
      // Random scattered channels
      return shuffleArray(available).slice(0, count);
    }

    default:
      return shuffleArray(available).slice(0, count);
  }
}

/**
 * Find DWDM edges with their endpoint ports
 */
function getDwdmEdgesWithPorts(): Array<{
  edge: NetworkEdge;
  sourceNode: NetworkNode;
  targetNode: NetworkNode;
  sourcePortId: string;
  targetPortId: string;
}> {
  const state = useNetworkStore.getState();
  const results: Array<{
    edge: NetworkEdge;
    sourceNode: NetworkNode;
    targetNode: NetworkNode;
    sourcePortId: string;
    targetPortId: string;
  }> = [];

  for (const edge of state.topology.edges) {
    if (edge.type !== 'fiber') continue;

    const sourceNode = state.topology.nodes.find((n) => n.id === edge.source.nodeId);
    const targetNode = state.topology.nodes.find((n) => n.id === edge.target.nodeId);
    if (!sourceNode || !targetNode) continue;

    const sourcePortId =
      edge.source.portId ||
      sourceNode.ports?.find((p) => p.type === 'dwdm')?.id;
    const targetPortId =
      edge.target.portId ||
      targetNode.ports?.find((p) => p.type === 'dwdm')?.id;
    if (!sourcePortId || !targetPortId) continue;

    results.push({ edge, sourceNode, targetNode, sourcePortId, targetPortId });
  }

  return results;
}

/**
 * Get existing allocated user channels for an edge
 */
function getExistingAllocatedChannels(edgeId: string): Set<number> {
  const checker = new ChannelChecker(getTopologyProvider());
  const available = new Set(checker.getAvailableChannels(edgeId));
  const allocated = new Set<number>();
  for (let ch = 1; ch <= 96; ch++) {
    if (!available.has(ch)) allocated.add(ch);
  }
  return allocated;
}

// ============================================================================
// RANDOM CHANNEL FILL
// ============================================================================

/**
 * Compute per-edge target count based on fill options.
 * Supports both utilization % and exact count modes with optional variation.
 */
function computeTargetCount(options: RandomFillOptions, _edgeIndex: number, totalEdges: number): number {
  const totalChannels = 96;
  const mode = options.mode || 'utilization';
  const variation = options.variation || 0;

  let baseCount: number;
  if (mode === 'exact') {
    baseCount = Math.max(0, Math.min(totalChannels, options.exactCount || 0));
  } else {
    baseCount = Math.round((options.targetUtilization / 100) * totalChannels);
  }

  // Apply variation for non-uniform distribution
  if (variation > 0 && totalEdges > 1) {
    const variationFactor = 1 + ((Math.random() * 2 - 1) * variation) / 100;
    baseCount = Math.round(baseCount * variationFactor);
  }

  return Math.max(0, Math.min(totalChannels, baseCount));
}

export function randomFillChannels(options: RandomFillOptions): RandomFillResult {
  const { allocationStatus, fragmentationPattern, edgeFilter } = options;
  const result: RandomFillResult = { totalAllocated: 0, edgesAffected: 0, allocationIds: [], errors: [] };

  const dwdmEdges = getDwdmEdgesWithPorts();
  const targetEdges = edgeFilter
    ? dwdmEdges.filter((e) => edgeFilter.includes(e.edge.id))
    : dwdmEdges;

  if (targetEdges.length === 0) {
    result.errors.push('No DWDM edges found in topology');
    return result;
  }

  const store = useNetworkStore.getState();
  const totalChannels = 96;

  for (let ei = 0; ei < targetEdges.length; ei++) {
    const { edge, sourcePortId, targetPortId } = targetEdges[ei];
    const existing = getExistingAllocatedChannels(edge.id);
    const targetCount = computeTargetCount(options, ei, targetEdges.length);
    const needed = Math.max(0, targetCount - existing.size);
    if (needed === 0) continue;

    const channels = generateChannelsByPattern(needed, totalChannels, fragmentationPattern, existing);
    if (channels.length === 0) continue;

    let edgeAllocated = 0;
    for (const userCh of channels) {
      const ituCh = userToItuChannel(userCh, 'fixed-50ghz');
      const allocIdSrc = `debug-fill-${edge.id}-src-${userCh}`;
      const allocIdTgt = `debug-fill-${edge.id}-tgt-${userCh}`;

      const srcAlloc: ChannelAllocation = {
        id: allocIdSrc,
        channelNumber: ituCh,
        status: allocationStatus,
        edgeId: edge.id,
        label: `Debug CH${userCh}${allocationStatus === 'reserved' ? ' [reserved]' : ''}`,
      };
      const tgtAlloc: ChannelAllocation = {
        id: allocIdTgt,
        channelNumber: ituCh,
        status: allocationStatus,
        edgeId: edge.id,
        label: `Debug CH${userCh}${allocationStatus === 'reserved' ? ' [reserved]' : ''}`,
      };

      store.allocateChannels(edge.source.nodeId, sourcePortId, [srcAlloc], edge.id);
      store.allocateChannels(edge.target.nodeId, targetPortId, [tgtAlloc], edge.id);

      result.allocationIds.push(allocIdSrc, allocIdTgt);
      edgeAllocated++;
    }

    if (edgeAllocated > 0) {
      result.edgesAffected++;
      result.totalAllocated += edgeAllocated;
    }
  }

  return result;
}

/**
 * Get the list of DWDM edges with summary info for edge filter UI.
 */
export function getDwdmEdgeSummaries(): Array<{
  edgeId: string;
  edgeName: string;
  sourceNodeName: string;
  targetNodeName: string;
  currentAllocated: number;
}> {
  const edges = getDwdmEdgesWithPorts();
  return edges.map(({ edge, sourceNode, targetNode }) => {
    const existing = getExistingAllocatedChannels(edge.id);
    return {
      edgeId: edge.id,
      edgeName: edge.name || `${sourceNode.name} - ${targetNode.name}`,
      sourceNodeName: sourceNode.name,
      targetNodeName: targetNode.name,
      currentAllocated: existing.size,
    };
  });
}

/**
 * Preview the fill result per edge before applying.
 */
export function previewChannelFill(options: RandomFillOptions): EdgeFillPreview[] {
  const dwdmEdges = getDwdmEdgesWithPorts();
  const targetEdges = options.edgeFilter
    ? dwdmEdges.filter((e) => options.edgeFilter!.includes(e.edge.id))
    : dwdmEdges;

  const totalChannels = 96;

  return targetEdges.map(({ edge, sourceNode, targetNode }) => {
    const existing = getExistingAllocatedChannels(edge.id);
    // For preview, don't apply random variation — show the base target
    const mode = options.mode || 'utilization';
    let targetCount: number;
    if (mode === 'exact') {
      targetCount = Math.max(0, Math.min(totalChannels, options.exactCount || 0));
    } else {
      targetCount = Math.round((options.targetUtilization / 100) * totalChannels);
    }

    const newChannels = Math.max(0, targetCount - existing.size);

    return {
      edgeId: edge.id,
      edgeName: edge.name || `${sourceNode.name} - ${targetNode.name}`,
      sourceNodeName: sourceNode.name,
      targetNodeName: targetNode.name,
      currentAllocated: existing.size,
      targetCount,
      newChannels,
    };
  });
}

// ============================================================================
// RANDOM SERVICE GENERATION
// ============================================================================

export function generateRandomServices(options: RandomServiceOptions): RandomServiceResult {
  const { count, protectionRatio, statusMix, channelStrategy, includeL2L3 } = options;
  const result: RandomServiceResult = { created: 0, serviceIds: [], errors: [] };

  const state = useNetworkStore.getState();
  const topology = state.topology;

  // Find L1-capable nodes (terminal, oadm)
  const l1Nodes = topology.nodes.filter(
    (n) => n.type === 'terminal' || n.type === 'oadm'
  );

  if (l1Nodes.length < 2) {
    result.errors.push('Need at least 2 terminal/OADM nodes for service generation');
    return result;
  }

  if (topology.edges.filter((e) => e.type === 'fiber').length === 0) {
    result.errors.push('No fiber edges found in topology');
    return result;
  }

  // Build graph for path computation
  const graphEngine = new GraphEngine();
  graphEngine.loadFromTopology(topology);
  const pathFinder = new PathFinder(graphEngine);
  const topoProvider = getTopologyProvider();

  // Sequential channel counter
  let nextChannel = 1;

  for (let i = 0; i < count; i++) {
    try {
      // Pick random source/dest pair
      const shuffledNodes = shuffleArray(l1Nodes);
      const sourceNode = shuffledNodes[0];
      const destNode = shuffledNodes[1];

      // Compute working path
      const pathResult = pathFinder.shortestPath(sourceNode.id, destNode.id, {
        weightAttribute: 'distance',
      });
      if (!pathResult) {
        result.errors.push(`No path between ${sourceNode.name} and ${destNode.name}`);
        continue;
      }

      // Find available channel
      const checker = new ChannelChecker(topoProvider);
      let channelNumber: number;

      if (channelStrategy === 'sequential') {
        // Find next available channel across path
        const commonAvail = checker.checkChannelAvailability(
          { edgeIds: pathResult.edges } as ServicePath,
          'continuous'
        );
        if (commonAvail.available && commonAvail.commonChannels && commonAvail.commonChannels.length > 0) {
          const availSet = new Set(commonAvail.commonChannels);
          // Start from nextChannel and find first available
          channelNumber = 0;
          for (let ch = nextChannel; ch <= 96; ch++) {
            if (availSet.has(ch)) {
              channelNumber = ch;
              nextChannel = ch + 1;
              break;
            }
          }
          // Wrap around if needed
          if (channelNumber === 0) {
            for (let ch = 1; ch < nextChannel; ch++) {
              if (availSet.has(ch)) {
                channelNumber = ch;
                nextChannel = ch + 1;
                break;
              }
            }
          }
          if (channelNumber === 0) {
            result.errors.push(`No available channel for service ${i + 1}`);
            continue;
          }
        } else {
          result.errors.push(`No common channels on path for service ${i + 1}`);
          continue;
        }
      } else {
        // Random channel
        const commonAvail = checker.checkChannelAvailability(
          { edgeIds: pathResult.edges } as ServicePath,
          'continuous'
        );
        if (commonAvail.available && commonAvail.commonChannels && commonAvail.commonChannels.length > 0) {
          const shuffledChannels = shuffleArray(commonAvail.commonChannels);
          channelNumber = shuffledChannels[0];
        } else {
          result.errors.push(`No common channels on path for service ${i + 1}`);
          continue;
        }
      }

      // Determine if protected
      const isProtected = Math.random() * 100 < protectionRatio;

      // Find source/dest port IDs
      const srcPortId = sourceNode.ports?.find((p) => p.type === 'dwdm')?.id;
      const dstPortId = destNode.ports?.find((p) => p.type === 'dwdm')?.id;
      if (!srcPortId || !dstPortId) {
        result.errors.push(`No DWDM ports on ${sourceNode.name} or ${destNode.name}`);
        continue;
      }

      // Build working path
      const workingPath: ServicePath = {
        id: `debug-wp-${i}`,
        type: 'working',
        nodeIds: pathResult.path,
        edgeIds: pathResult.edges,
        channelNumber,
        totalDistance: pathResult.totalDistance,
        hopCount: pathResult.hopCount,
        status: 'computed',
      };

      // Build protection path if needed
      let protectionPath: ServicePath | undefined;
      let protChannel = channelNumber;
      if (isProtected) {
        const disjointPaths = pathFinder.findEdgeDisjointPaths(sourceNode.id, destNode.id, {
          maxPaths: 2,
          weightAttribute: 'distance',
        });
        if (disjointPaths.length >= 2) {
          // Use the second disjoint path
          const protResult = disjointPaths[1];
          // Find available channel on protection path
          const protAvail = checker.checkChannelAvailability(
            { edgeIds: protResult.edges } as ServicePath,
            'continuous'
          );
          if (protAvail.available && protAvail.commonChannels && protAvail.commonChannels.length > 0) {
            protChannel = protAvail.commonChannels.includes(channelNumber)
              ? channelNumber
              : protAvail.commonChannels[0];
          }

          protectionPath = {
            id: `debug-pp-${i}`,
            type: 'protection',
            nodeIds: protResult.path,
            edgeIds: protResult.edges,
            channelNumber: protChannel,
            totalDistance: protResult.totalDistance,
            hopCount: protResult.hopCount,
            status: 'computed',
          };
        }
      }

      // All services are created as 'planned' first, then status is applied after
      const serviceId = useServiceStore.getState().addService({
        type: 'l1-dwdm',
        name: `Debug-L1-${sourceNode.name}-${destNode.name}-${i + 1}`,
        status: 'planned',
        sourceNodeId: sourceNode.id,
        sourcePortId: srcPortId,
        destinationNodeId: destNode.id,
        destinationPortId: dstPortId,
        dataRate: '100G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        channelNumber,
        workingPath,
        protectionPath,
        protectionScheme: protectionPath ? 'olp' : 'none',
        restorationEnabled: false,
        metadata: { debugGenerated: true },
      } as Omit<Service, 'id' | 'createdAt' | 'modifiedAt'>);

      result.serviceIds.push(serviceId);
      result.created++;

      // Apply final status
      if (statusMix === 'all-active') {
        useServiceStore.getState().activateService(serviceId);
      } else if (statusMix === 'mixed') {
        const roll = Math.random();
        if (roll < 0.6) {
          useServiceStore.getState().activateService(serviceId);
        } else if (roll < 0.8) {
          // stay planned
        } else if (roll < 0.9) {
          useServiceStore.getState().activateService(serviceId);
          useServiceStore.getState().failService(serviceId);
        } else {
          useServiceStore.getState().activateService(serviceId);
          useServiceStore.getState().setServiceStatus(serviceId, 'maintenance');
        }
      }
      // 'all-planned' stays planned
    } catch (err) {
      result.errors.push(`Service ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Generate L2/L3 services over active L1 underlays
  if (includeL2L3) {
    const l2l3Result = generateL2L3Services(result.serviceIds);
    result.serviceIds.push(...l2l3Result.serviceIds);
    result.created += l2l3Result.created;
    result.errors.push(...l2l3Result.errors);
  }

  return result;
}

/**
 * Find an adjacent router or switch node connected to a given node.
 * This is needed because L1 services terminate on OADM/terminal nodes (DWDM-only ports),
 * but L2/L3 services need router/switch nodes with BW ports.
 * Returns the adjacent node and a BW port ID, or undefined if none found.
 */
function findAdjacentRouterOrSwitch(
  nodeId: string,
): { nodeId: string; portId: string } | undefined {
  const networkState = useNetworkStore.getState();
  const node = networkState.topology.nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;

  // If this node already has BW ports (router, switch, terminal), use it directly
  const bwPort = node.ports?.find((p) => p.type === 'bw');
  if (bwPort) {
    return { nodeId: node.id, portId: bwPort.id };
  }

  // Otherwise find adjacent router/switch nodes via edges
  const connectedEdges = networkState.topology.edges.filter(
    (e) => e.source.nodeId === nodeId || e.target.nodeId === nodeId
  );

  for (const edge of connectedEdges) {
    const neighborId = edge.source.nodeId === nodeId ? edge.target.nodeId : edge.source.nodeId;
    const neighbor = networkState.topology.nodes.find((n) => n.id === neighborId);
    if (!neighbor) continue;

    if (neighbor.type === 'router' || neighbor.type === 'switch') {
      const neighborBwPort = neighbor.ports?.find((p) => p.type === 'bw');
      if (neighborBwPort) {
        return { nodeId: neighbor.id, portId: neighborBwPort.id };
      }
    }
  }

  return undefined;
}

function generateL2L3Services(l1ServiceIds: string[]): RandomServiceResult {
  const result: RandomServiceResult = { created: 0, serviceIds: [], errors: [] };

  const serviceStore = useServiceStore.getState();
  const activeL1Services = l1ServiceIds
    .map((id) => serviceStore.getService(id))
    .filter((s) => s && s.type === 'l1-dwdm' && s.status === 'active');

  if (activeL1Services.length === 0) {
    result.errors.push('No active L1 services available for L2/L3 underlay');
    return result;
  }

  // Create one L2 service per active L1 (up to 3)
  const underlays = activeL1Services.slice(0, 3);
  for (let i = 0; i < underlays.length; i++) {
    try {
      const underlay = underlays[i]!;

      // Find adjacent router/switch nodes with BW ports for L2/L3 endpoints
      const srcEndpoint = findAdjacentRouterOrSwitch(underlay.sourceNodeId);
      const dstEndpoint = findAdjacentRouterOrSwitch(underlay.destinationNodeId);

      if (!srcEndpoint || !dstEndpoint) {
        result.errors.push(
          `No adjacent router/switch with BW ports for L2 service ${i + 1}` +
          ` (source: ${underlay.sourceNodeId}, dest: ${underlay.destinationNodeId})`
        );
        continue;
      }

      const serviceId = serviceStore.addService({
        type: 'l2-ethernet',
        name: `Debug-L2-over-${underlay.id}`,
        status: 'active',
        sourceNodeId: srcEndpoint.nodeId,
        sourcePortId: srcEndpoint.portId,
        destinationNodeId: dstEndpoint.nodeId,
        destinationPortId: dstEndpoint.portId,
        dataRate: '10G',
        underlayServiceId: underlay.id,
        underlayAutoCreated: false,
        protectionScheme: 'none',
        protectionUnderlayServiceId: undefined,
        bfdConfig: {
          enabled: true,
          minTxInterval: 300000,
          minRxInterval: 300000,
          multiplier: 3,
        },
        metadata: { debugGenerated: true },
      } as Omit<Service, 'id' | 'createdAt' | 'modifiedAt'>);

      result.serviceIds.push(serviceId);
      result.created++;
    } catch (err) {
      result.errors.push(`L2 service ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// ============================================================================
// SEED SCENARIO: METRO RING
// ============================================================================

export function loadMetroRingSeedScenario(): SeedScenarioResult {
  const result: SeedScenarioResult = {
    nodesCreated: 0,
    edgesCreated: 0,
    servicesCreated: 0,
    channelsAllocated: 0,
    errors: [],
  };

  const store = useNetworkStore.getState();

  // Clear existing topology
  store.clearTopology();

  // Create 9 nodes in a metro ring layout
  const nodeConfigs: Array<{
    name: string;
    type: 'terminal' | 'oadm' | 'amplifier';
    position: { x: number; y: number };
  }> = [
    { name: 'Terminal-A', type: 'terminal', position: { x: 100, y: 200 } },
    { name: 'OADM-B', type: 'oadm', position: { x: 350, y: 100 } },
    { name: 'OADM-C', type: 'oadm', position: { x: 600, y: 100 } },
    { name: 'Terminal-D', type: 'terminal', position: { x: 850, y: 200 } },
    { name: 'OADM-E', type: 'oadm', position: { x: 850, y: 400 } },
    { name: 'OADM-F', type: 'oadm', position: { x: 500, y: 500 } },
    { name: 'Terminal-G', type: 'terminal', position: { x: 200, y: 500 } },
    { name: 'OADM-H', type: 'oadm', position: { x: 100, y: 400 } },
    { name: 'Amplifier-I', type: 'amplifier', position: { x: 500, y: 650 } },
  ];

  const nodeIds: string[] = [];
  for (const config of nodeConfigs) {
    const id = store.addNode({
      type: config.type,
      position: config.position,
      name: config.name,
      vendor: 'generic',
    });
    nodeIds.push(id);
    result.nodesCreated++;
  }

  // Helper to connect two nodes with fiber
  const connectNodes = (
    srcIdx: number,
    tgtIdx: number,
    distance: number,
    srlgCodes: string[] = []
  ): string | null => {
    const srcNode = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeIds[srcIdx]);
    const tgtNode = useNetworkStore.getState().topology.nodes.find((n) => n.id === nodeIds[tgtIdx]);
    if (!srcNode || !tgtNode) return null;

    const srcPort = srcNode.ports?.find((p) => p.type === 'dwdm' && p.status === 'available');
    const tgtPort = tgtNode.ports?.find((p) => p.type === 'dwdm' && p.status === 'available');
    if (!srcPort || !tgtPort) return null;

    const edgeId = useNetworkStore.getState().addEdgeWithPorts(
      nodeIds[srcIdx],
      nodeIds[tgtIdx],
      srcPort.id,
      tgtPort.id,
      'fiber',
      undefined,
      undefined,
      { distance, srlgCodes }
    );

    if (edgeId) result.edgesCreated++;
    return edgeId;
  };

  // Create edges forming the ring + cross-connect + spur
  //   A(0)--B(1)--C(2)--D(3)
  //   |                   |
  //   H(7)              E(4)
  //   |                   |
  //   G(6)--F(5)---------+
  //              |
  //             I(8)
  const edgeConfigs = [
    { src: 0, tgt: 1, distance: 50, srlg: ['SRLG-North'] },     // A-B
    { src: 1, tgt: 2, distance: 60, srlg: ['SRLG-North'] },     // B-C
    { src: 2, tgt: 3, distance: 50, srlg: ['SRLG-North'] },     // C-D
    { src: 3, tgt: 4, distance: 40, srlg: ['SRLG-East'] },      // D-E
    { src: 4, tgt: 5, distance: 80, srlg: ['SRLG-South'] },     // E-F
    { src: 5, tgt: 6, distance: 70, srlg: ['SRLG-South'] },     // F-G
    { src: 6, tgt: 7, distance: 30, srlg: ['SRLG-West'] },      // G-H
    { src: 7, tgt: 0, distance: 25, srlg: ['SRLG-West'] },      // H-A
    { src: 1, tgt: 5, distance: 90, srlg: ['SRLG-Cross'] },     // B-F cross-connect
    { src: 5, tgt: 8, distance: 35, srlg: ['SRLG-Spur'] },      // F-I spur
  ];

  const edgeIds: (string | null)[] = [];
  for (const config of edgeConfigs) {
    const id = connectNodes(config.src, config.tgt, config.distance, config.srlg);
    edgeIds.push(id);
  }

  // Now create services using the topology
  try {
    const servicesResult = createMetroRingServices(nodeIds, edgeIds);
    result.servicesCreated = servicesResult.created;
    result.errors.push(...servicesResult.errors);
  } catch (err) {
    result.errors.push(`Service creation: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fill channels to varied utilization
  try {
    const fillResult = randomFillChannels({
      targetUtilization: 45,
      allocationStatus: 'allocated',
      fragmentationPattern: 'clustered',
    });
    result.channelsAllocated = fillResult.totalAllocated;
    result.errors.push(...fillResult.errors);
  } catch (err) {
    result.errors.push(`Channel fill: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

function createMetroRingServices(
  nodeIds: string[],
  _edgeIds: (string | null)[]
): RandomServiceResult {
  const result: RandomServiceResult = { created: 0, serviceIds: [], errors: [] };

  const state = useNetworkStore.getState();
  const topology = state.topology;
  const graphEngine = new GraphEngine();
  graphEngine.loadFromTopology(topology);
  const pathFinder = new PathFinder(graphEngine);
  const topoProvider = getTopologyProvider();
  const checker = new ChannelChecker(topoProvider);

  // Service definitions for the metro ring
  const serviceDefinitions: Array<{
    srcIdx: number;
    dstIdx: number;
    channel: number;
    hasProtection: boolean;
    finalStatus: 'active' | 'planned' | 'failed' | 'maintenance';
  }> = [
    // 4 protected L1 DWDM services
    { srcIdx: 0, dstIdx: 3, channel: 1, hasProtection: true, finalStatus: 'active' },
    { srcIdx: 0, dstIdx: 6, channel: 5, hasProtection: true, finalStatus: 'active' },
    { srcIdx: 3, dstIdx: 6, channel: 10, hasProtection: true, finalStatus: 'active' },
    { srcIdx: 0, dstIdx: 4, channel: 15, hasProtection: true, finalStatus: 'active' },
    // 4 unprotected L1 DWDM services (various statuses)
    { srcIdx: 1, dstIdx: 5, channel: 20, hasProtection: false, finalStatus: 'active' },
    { srcIdx: 2, dstIdx: 7, channel: 25, hasProtection: false, finalStatus: 'active' },
    { srcIdx: 0, dstIdx: 5, channel: 30, hasProtection: false, finalStatus: 'planned' },
    { srcIdx: 3, dstIdx: 7, channel: 35, hasProtection: false, finalStatus: 'failed' },
  ];

  for (let i = 0; i < serviceDefinitions.length; i++) {
    const def = serviceDefinitions[i];
    try {
      const srcNode = topology.nodes.find((n) => n.id === nodeIds[def.srcIdx]);
      const dstNode = topology.nodes.find((n) => n.id === nodeIds[def.dstIdx]);
      if (!srcNode || !dstNode) {
        result.errors.push(`Service ${i + 1}: source/dest node not found`);
        continue;
      }

      // Compute working path
      const workingResult = pathFinder.shortestPath(srcNode.id, dstNode.id, {
        weightAttribute: 'distance',
      });
      if (!workingResult) {
        result.errors.push(`Service ${i + 1}: no working path`);
        continue;
      }

      // Check channel availability
      const avail = checker.checkChannelAvailability(
        { edgeIds: workingResult.edges } as ServicePath,
        'continuous',
        def.channel
      );

      let channelNumber = def.channel;
      if (!avail.available || !(avail.commonChannels && avail.commonChannels.includes(def.channel))) {
        // Try suggested channel or first available
        if (avail.suggestedChannel) {
          channelNumber = avail.suggestedChannel;
        } else if (avail.commonChannels && avail.commonChannels.length > 0) {
          channelNumber = avail.commonChannels[0];
        } else {
          result.errors.push(`Service ${i + 1}: no available channel`);
          continue;
        }
      }

      const srcPortId = srcNode.ports?.find((p) => p.type === 'dwdm')?.id;
      const dstPortId = dstNode.ports?.find((p) => p.type === 'dwdm')?.id;
      if (!srcPortId || !dstPortId) {
        result.errors.push(`Service ${i + 1}: no DWDM ports`);
        continue;
      }

      const workingPath: ServicePath = {
        id: `debug-metro-wp-${i}`,
        type: 'working',
        nodeIds: workingResult.path,
        edgeIds: workingResult.edges,
        channelNumber,
        totalDistance: workingResult.totalDistance,
        hopCount: workingResult.hopCount,
        status: 'computed',
      };

      // Protection path
      let protectionPath: ServicePath | undefined;
      let protChannel = channelNumber;
      if (def.hasProtection) {
        const disjointPaths = pathFinder.findEdgeDisjointPaths(srcNode.id, dstNode.id, {
          maxPaths: 2,
          weightAttribute: 'distance',
        });
        if (disjointPaths.length >= 2) {
          const protResult = disjointPaths.find(
            (p) => p.edges.some((e) => !workingResult.edges.includes(e))
          ) || disjointPaths[1];

          // Check channel on protection path
          const protAvail = checker.checkChannelAvailability(
            { edgeIds: protResult.edges } as ServicePath,
            'continuous'
          );
          if (protAvail.commonChannels && protAvail.commonChannels.length > 0) {
            protChannel = protAvail.commonChannels.includes(channelNumber)
              ? channelNumber
              : protAvail.commonChannels[0];
          }

          protectionPath = {
            id: `debug-metro-pp-${i}`,
            type: 'protection',
            nodeIds: protResult.path,
            edgeIds: protResult.edges,
            channelNumber: protChannel,
            totalDistance: protResult.totalDistance,
            hopCount: protResult.hopCount,
            status: 'computed',
          };
        }
      }

      const serviceId = useServiceStore.getState().addService({
        type: 'l1-dwdm',
        name: `Metro-L1-${srcNode.name}-${dstNode.name}`,
        status: 'planned',
        sourceNodeId: srcNode.id,
        sourcePortId: srcPortId,
        destinationNodeId: dstNode.id,
        destinationPortId: dstPortId,
        dataRate: '100G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        channelNumber,
        workingPath,
        protectionPath,
        protectionScheme: protectionPath ? 'olp' : 'none',
        restorationEnabled: false,
        metadata: { debugGenerated: true },
      } as Omit<Service, 'id' | 'createdAt' | 'modifiedAt'>);

      result.serviceIds.push(serviceId);
      result.created++;

      // Apply final status
      if (def.finalStatus === 'active') {
        useServiceStore.getState().activateService(serviceId);
      } else if (def.finalStatus === 'failed') {
        useServiceStore.getState().activateService(serviceId);
        useServiceStore.getState().failService(serviceId);
      } else if (def.finalStatus === 'maintenance') {
        useServiceStore.getState().activateService(serviceId);
        useServiceStore.getState().setServiceStatus(serviceId, 'maintenance');
      }
      // 'planned' stays as-is
    } catch (err) {
      result.errors.push(`Service ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Create L2 services over first 2 active L1 services
  const activeL1Ids = result.serviceIds.filter((id) => {
    const svc = useServiceStore.getState().getService(id);
    return svc && svc.status === 'active';
  });

  for (let i = 0; i < Math.min(2, activeL1Ids.length); i++) {
    try {
      const underlay = useServiceStore.getState().getService(activeL1Ids[i]);
      if (!underlay) continue;

      // Find adjacent router/switch nodes with BW ports
      const srcEndpoint = findAdjacentRouterOrSwitch(underlay.sourceNodeId);
      const dstEndpoint = findAdjacentRouterOrSwitch(underlay.destinationNodeId);

      if (!srcEndpoint || !dstEndpoint) {
        result.errors.push(`No adjacent router/switch with BW ports for Metro L2 service`);
        continue;
      }

      const l2Id = useServiceStore.getState().addService({
        type: 'l2-ethernet',
        name: `Metro-L2-over-${underlay.id}`,
        status: 'active',
        sourceNodeId: srcEndpoint.nodeId,
        sourcePortId: srcEndpoint.portId,
        destinationNodeId: dstEndpoint.nodeId,
        destinationPortId: dstEndpoint.portId,
        dataRate: '10G',
        underlayServiceId: underlay.id,
        underlayAutoCreated: false,
        protectionScheme: 'none',
        protectionUnderlayServiceId: undefined,
        bfdConfig: {
          enabled: true,
          minTxInterval: 300000,
          minRxInterval: 300000,
          multiplier: 3,
        },
        metadata: { debugGenerated: true },
      } as Omit<Service, 'id' | 'createdAt' | 'modifiedAt'>);

      result.serviceIds.push(l2Id);
      result.created++;
    } catch (err) {
      result.errors.push(`L2 service: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

export function clearDebugChannelAllocations(): number {
  return useNetworkStore.getState().clearAllocationsByPrefix('debug-');
}

export function clearDebugServices(): number {
  const serviceStore = useServiceStore.getState();
  const debugServices = serviceStore.services.filter(
    (s) => s.metadata?.debugGenerated === true
  );

  let removed = 0;
  for (const svc of debugServices) {
    const result = serviceStore.removeService(svc.id);
    if (result.success) removed++;
  }
  return removed;
}

export function clearAllDebugData(): { allocationsRemoved: number; servicesRemoved: number } {
  const servicesRemoved = clearDebugServices();
  const allocationsRemoved = clearDebugChannelAllocations();
  return { allocationsRemoved, servicesRemoved };
}

export function getDebugDataStats(): DebugDataStats {
  const networkState = useNetworkStore.getState();
  const serviceState = useServiceStore.getState();

  let debugAllocations = 0;
  for (const node of networkState.topology.nodes) {
    if (!node.ports) continue;
    for (const port of node.ports) {
      if (!port.spectrum?.allocations) continue;
      debugAllocations += port.spectrum.allocations.filter(
        (a) => a.id.startsWith('debug-')
      ).length;
    }
  }

  const debugServices = serviceState.services.filter(
    (s) => s.metadata?.debugGenerated === true
  ).length;

  return { debugAllocations, debugServices, debugNodes: 0 };
}

// ============================================================================
// TOPOLOGY PRESETS
// ============================================================================

export interface TopologyPresetInfo {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  serviceCount: number;
}

export const TOPOLOGY_PRESETS: TopologyPresetInfo[] = [
  {
    id: 'national-backbone',
    name: 'National Backbone',
    description: 'US backbone mesh with 18 city nodes, varied distances, and realistic SRLG groups',
    nodeCount: 18,
    edgeCount: 28,
    serviceCount: 12,
  },
  {
    id: 'regional-dwdm',
    name: 'Regional DWDM',
    description: 'Ring+mesh hybrid with OADMs and edge routers, DWDM-focused topology',
    nodeCount: 14,
    edgeCount: 18,
    serviceCount: 8,
  },
  {
    id: 'metro-longhaul',
    name: 'Metro + Long-haul',
    description: 'Multi-layer topology with metro rings connected via long-haul backbone',
    nodeCount: 20,
    edgeCount: 26,
    serviceCount: 10,
  },
  {
    id: 'stress-test',
    name: 'Stress Test',
    description: 'Large topology for performance testing with 60 nodes, 120+ edges, 200+ services',
    nodeCount: 60,
    edgeCount: 120,
    serviceCount: 200,
  },
  {
    id: 'stress-test-plus',
    name: 'Stress Test+',
    description: 'Extra-large async topology: ~1000 nodes, ~2000 edges for extreme performance testing',
    nodeCount: 1000,
    edgeCount: 2000,
    serviceCount: 0,
  },
  {
    id: 'regen-test',
    name: 'Regeneration Test',
    description: 'Long-haul linear: Terminal -> OADM x4 -> Terminal (1500+ km) with varied segment utilization',
    nodeCount: 6,
    edgeCount: 5,
    serviceCount: 0,
  },
];

/**
 * Helper to create a node and return its ID
 */
function createPresetNode(
  name: string,
  type: 'router' | 'switch' | 'oadm' | 'amplifier' | 'terminal',
  x: number,
  y: number,
  location?: { latitude: number; longitude: number }
): string {
  const store = useNetworkStore.getState();
  return store.addNode({
    type,
    position: { x, y },
    name,
    vendor: 'generic',
    location,
  });
}

/**
 * Helper to connect two nodes with fiber
 */
function createPresetEdge(
  srcId: string,
  tgtId: string,
  distance: number,
  srlgCodes: string[] = []
): string | null {
  const store = useNetworkStore.getState();
  const srcNode = store.topology.nodes.find((n) => n.id === srcId);
  const tgtNode = store.topology.nodes.find((n) => n.id === tgtId);
  if (!srcNode || !tgtNode) return null;

  const srcPort = srcNode.ports?.find((p) => p.type === 'dwdm' && p.status === 'available');
  const tgtPort = tgtNode.ports?.find((p) => p.type === 'dwdm' && p.status === 'available');
  if (!srcPort || !tgtPort) return null;

  return store.addEdgeWithPorts(
    srcId, tgtId, srcPort.id, tgtPort.id, 'fiber',
    undefined, undefined, { distance, srlgCodes }
  );
}

/**
 * National Backbone preset - US backbone mesh
 */
export function loadNationalBackbonePreset(): SeedScenarioResult {
  const result: SeedScenarioResult = {
    nodesCreated: 0, edgesCreated: 0, servicesCreated: 0, channelsAllocated: 0, errors: [],
  };

  useNetworkStore.getState().clearTopology();

  // Major US cities as OADM/terminal/router nodes
  const cities: Array<{ name: string; type: 'router' | 'oadm' | 'terminal'; x: number; y: number; lat: number; lng: number }> = [
    { name: 'NYC', type: 'router', x: 900, y: 200, lat: 40.71, lng: -74.01 },
    { name: 'Boston', type: 'oadm', x: 950, y: 100, lat: 42.36, lng: -71.06 },
    { name: 'Washington', type: 'router', x: 850, y: 300, lat: 38.91, lng: -77.04 },
    { name: 'Atlanta', type: 'oadm', x: 750, y: 450, lat: 33.75, lng: -84.39 },
    { name: 'Miami', type: 'terminal', x: 800, y: 600, lat: 25.76, lng: -80.19 },
    { name: 'Chicago', type: 'router', x: 600, y: 200, lat: 41.88, lng: -87.63 },
    { name: 'Dallas', type: 'oadm', x: 500, y: 450, lat: 32.78, lng: -96.80 },
    { name: 'Houston', type: 'terminal', x: 500, y: 550, lat: 29.76, lng: -95.37 },
    { name: 'Denver', type: 'oadm', x: 350, y: 250, lat: 39.74, lng: -104.99 },
    { name: 'Phoenix', type: 'terminal', x: 250, y: 450, lat: 33.45, lng: -112.07 },
    { name: 'Los Angeles', type: 'router', x: 100, y: 400, lat: 34.05, lng: -118.24 },
    { name: 'San Francisco', type: 'oadm', x: 50, y: 250, lat: 37.77, lng: -122.42 },
    { name: 'Seattle', type: 'router', x: 80, y: 80, lat: 47.61, lng: -122.33 },
    { name: 'Minneapolis', type: 'oadm', x: 500, y: 120, lat: 44.98, lng: -93.27 },
    { name: 'Kansas City', type: 'oadm', x: 480, y: 300, lat: 39.10, lng: -94.58 },
    { name: 'St Louis', type: 'terminal', x: 580, y: 320, lat: 38.63, lng: -90.20 },
    { name: 'Nashville', type: 'oadm', x: 680, y: 370, lat: 36.16, lng: -86.78 },
    { name: 'Charlotte', type: 'oadm', x: 810, y: 370, lat: 35.23, lng: -80.84 },
  ];

  const nodeIds: string[] = [];
  for (const c of cities) {
    const id = createPresetNode(c.name, c.type, c.x, c.y, { latitude: c.lat, longitude: c.lng });
    nodeIds.push(id);
    result.nodesCreated++;
  }

  // Build backbone mesh connections
  const connections: Array<{ src: number; tgt: number; dist: number; srlg: string[] }> = [
    // East Coast corridor
    { src: 0, tgt: 1, dist: 350, srlg: ['SRLG-NE-Corridor'] },        // NYC - Boston
    { src: 0, tgt: 2, dist: 370, srlg: ['SRLG-NE-Corridor'] },        // NYC - Washington
    { src: 2, tgt: 17, dist: 540, srlg: ['SRLG-SE-Corridor'] },       // Washington - Charlotte
    { src: 17, tgt: 3, dist: 380, srlg: ['SRLG-SE-Corridor'] },       // Charlotte - Atlanta
    { src: 3, tgt: 4, dist: 1060, srlg: ['SRLG-SE-Coastal'] },        // Atlanta - Miami
    // Midwest
    { src: 0, tgt: 5, dist: 1270, srlg: ['SRLG-Northern'] },          // NYC - Chicago
    { src: 5, tgt: 13, dist: 570, srlg: ['SRLG-Northern'] },          // Chicago - Minneapolis
    { src: 5, tgt: 15, dist: 480, srlg: ['SRLG-Midwest'] },           // Chicago - St Louis
    { src: 15, tgt: 14, dist: 400, srlg: ['SRLG-Midwest'] },          // St Louis - Kansas City
    { src: 14, tgt: 8, dist: 900, srlg: ['SRLG-Central'] },           // Kansas City - Denver
    { src: 5, tgt: 16, dist: 750, srlg: ['SRLG-Midwest-South'] },     // Chicago - Nashville
    { src: 16, tgt: 3, dist: 350, srlg: ['SRLG-Midwest-South'] },     // Nashville - Atlanta
    // Southern corridor
    { src: 3, tgt: 6, dist: 1180, srlg: ['SRLG-Southern'] },          // Atlanta - Dallas
    { src: 6, tgt: 7, dist: 390, srlg: ['SRLG-Texas'] },              // Dallas - Houston
    { src: 6, tgt: 14, dist: 750, srlg: ['SRLG-Central'] },           // Dallas - Kansas City
    // Western corridor
    { src: 8, tgt: 9, dist: 930, srlg: ['SRLG-SW-Corridor'] },        // Denver - Phoenix
    { src: 9, tgt: 10, dist: 600, srlg: ['SRLG-SW-Corridor'] },       // Phoenix - Los Angeles
    { src: 10, tgt: 11, dist: 620, srlg: ['SRLG-Pacific'] },          // LA - San Francisco
    { src: 11, tgt: 12, dist: 1300, srlg: ['SRLG-Pacific'] },         // SF - Seattle
    { src: 12, tgt: 13, dist: 2600, srlg: ['SRLG-Northern-Cross'] },  // Seattle - Minneapolis
    // Cross-connects for redundancy
    { src: 8, tgt: 5, dist: 1470, srlg: ['SRLG-Cross-Central'] },     // Denver - Chicago
    { src: 6, tgt: 9, dist: 1420, srlg: ['SRLG-Cross-South'] },       // Dallas - Phoenix
    { src: 2, tgt: 16, dist: 900, srlg: ['SRLG-Cross-East'] },        // Washington - Nashville
    { src: 15, tgt: 16, dist: 450, srlg: ['SRLG-Midwest'] },          // St Louis - Nashville
    { src: 14, tgt: 6, dist: 750, srlg: ['SRLG-Central'] },           // Kansas City - Dallas (dup check ok)
    { src: 10, tgt: 8, dist: 1400, srlg: ['SRLG-Cross-West'] },       // LA - Denver
    { src: 11, tgt: 8, dist: 1850, srlg: ['SRLG-Cross-West'] },       // SF - Denver
    { src: 7, tgt: 4, dist: 1540, srlg: ['SRLG-Gulf'] },              // Houston - Miami
  ];

  for (const c of connections) {
    const edgeId = createPresetEdge(nodeIds[c.src], nodeIds[c.tgt], c.dist, c.srlg);
    if (edgeId) result.edgesCreated++;
  }

  // Generate services
  try {
    const svcResult = generateRandomServices({
      count: 12,
      protectionRatio: 60,
      statusMix: 'mixed',
      channelStrategy: 'sequential',
      includeL2L3: true,
    });
    result.servicesCreated = svcResult.created;
    result.errors.push(...svcResult.errors);
  } catch (err) {
    result.errors.push(`Services: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fill channels to moderate utilization
  try {
    const fillResult = randomFillChannels({
      targetUtilization: 40,
      allocationStatus: 'allocated',
      fragmentationPattern: 'clustered',
    });
    result.channelsAllocated = fillResult.totalAllocated;
  } catch (err) {
    result.errors.push(`Channel fill: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Regional DWDM preset - ring+mesh with OADMs and edge routers
 */
export function loadRegionalDWDMPreset(): SeedScenarioResult {
  const result: SeedScenarioResult = {
    nodesCreated: 0, edgesCreated: 0, servicesCreated: 0, channelsAllocated: 0, errors: [],
  };

  useNetworkStore.getState().clearTopology();

  // Ring of OADMs with routers on edges
  const nodes: Array<{ name: string; type: 'router' | 'oadm' | 'terminal'; x: number; y: number }> = [
    // Core ring OADMs
    { name: 'OADM-Hub-1', type: 'oadm', x: 400, y: 100 },
    { name: 'OADM-Hub-2', type: 'oadm', x: 700, y: 200 },
    { name: 'OADM-Hub-3', type: 'oadm', x: 750, y: 450 },
    { name: 'OADM-Hub-4', type: 'oadm', x: 550, y: 600 },
    { name: 'OADM-Hub-5', type: 'oadm', x: 250, y: 550 },
    { name: 'OADM-Hub-6', type: 'oadm', x: 150, y: 350 },
    { name: 'OADM-Hub-7', type: 'oadm', x: 200, y: 150 },
    { name: 'OADM-Hub-8', type: 'oadm', x: 500, y: 350 },
    // Edge routers
    { name: 'Router-East', type: 'router', x: 900, y: 300 },
    { name: 'Router-West', type: 'router', x: 0, y: 350 },
    { name: 'Router-North', type: 'router', x: 400, y: 0 },
    { name: 'Router-South', type: 'router', x: 450, y: 700 },
    // Terminals
    { name: 'Terminal-NE', type: 'terminal', x: 850, y: 50 },
    { name: 'Terminal-SW', type: 'terminal', x: 100, y: 650 },
  ];

  const nodeIds: string[] = [];
  for (const n of nodes) {
    const id = createPresetNode(n.name, n.type, n.x, n.y);
    nodeIds.push(id);
    result.nodesCreated++;
  }

  // Ring connections + mesh cross-connects + router spurs
  const edges: Array<{ src: number; tgt: number; dist: number; srlg: string[] }> = [
    // Core ring
    { src: 0, tgt: 1, dist: 80, srlg: ['SRLG-Ring-N'] },
    { src: 1, tgt: 2, dist: 90, srlg: ['SRLG-Ring-E'] },
    { src: 2, tgt: 3, dist: 70, srlg: ['SRLG-Ring-SE'] },
    { src: 3, tgt: 4, dist: 85, srlg: ['SRLG-Ring-S'] },
    { src: 4, tgt: 5, dist: 60, srlg: ['SRLG-Ring-SW'] },
    { src: 5, tgt: 6, dist: 75, srlg: ['SRLG-Ring-W'] },
    { src: 6, tgt: 0, dist: 65, srlg: ['SRLG-Ring-NW'] },
    // Mesh cross-connects through hub
    { src: 0, tgt: 7, dist: 50, srlg: ['SRLG-Cross-1'] },
    { src: 2, tgt: 7, dist: 55, srlg: ['SRLG-Cross-2'] },
    { src: 4, tgt: 7, dist: 45, srlg: ['SRLG-Cross-3'] },
    { src: 6, tgt: 7, dist: 60, srlg: ['SRLG-Cross-4'] },
    // Router connections
    { src: 1, tgt: 8, dist: 40, srlg: ['SRLG-Router-E'] },
    { src: 5, tgt: 9, dist: 35, srlg: ['SRLG-Router-W'] },
    { src: 0, tgt: 10, dist: 30, srlg: ['SRLG-Router-N'] },
    { src: 3, tgt: 11, dist: 45, srlg: ['SRLG-Router-S'] },
    // Terminal connections
    { src: 1, tgt: 12, dist: 55, srlg: ['SRLG-Term-NE'] },
    { src: 5, tgt: 13, dist: 50, srlg: ['SRLG-Term-SW'] },
    // Extra cross-connect
    { src: 1, tgt: 5, dist: 110, srlg: ['SRLG-Diagonal'] },
  ];

  for (const e of edges) {
    const edgeId = createPresetEdge(nodeIds[e.src], nodeIds[e.tgt], e.dist, e.srlg);
    if (edgeId) result.edgesCreated++;
  }

  // Generate services
  try {
    const svcResult = generateRandomServices({
      count: 8,
      protectionRatio: 70,
      statusMix: 'mixed',
      channelStrategy: 'sequential',
      includeL2L3: true,
    });
    result.servicesCreated = svcResult.created;
    result.errors.push(...svcResult.errors);
  } catch (err) {
    result.errors.push(`Services: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const fillResult = randomFillChannels({
      targetUtilization: 50,
      allocationStatus: 'allocated',
      fragmentationPattern: 'fragmented',
    });
    result.channelsAllocated = fillResult.totalAllocated;
  } catch (err) {
    result.errors.push(`Channel fill: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Metro + Long-haul preset - multi-layer with metro rings connected via backbone
 */
export function loadMetroLonghaulPreset(): SeedScenarioResult {
  const result: SeedScenarioResult = {
    nodesCreated: 0, edgesCreated: 0, servicesCreated: 0, channelsAllocated: 0, errors: [],
  };

  useNetworkStore.getState().clearTopology();

  // Metro A (left cluster)
  const metroA: Array<{ name: string; type: 'router' | 'oadm' | 'terminal'; x: number; y: number }> = [
    { name: 'Metro-A Router-1', type: 'router', x: 100, y: 150 },
    { name: 'Metro-A OADM-1', type: 'oadm', x: 200, y: 100 },
    { name: 'Metro-A OADM-2', type: 'oadm', x: 300, y: 150 },
    { name: 'Metro-A OADM-3', type: 'oadm', x: 250, y: 250 },
    { name: 'Metro-A Terminal', type: 'terminal', x: 150, y: 250 },
  ];

  // Long-haul backbone (center)
  const backbone: Array<{ name: string; type: 'router' | 'oadm' | 'terminal'; x: number; y: number }> = [
    { name: 'Backbone-W', type: 'terminal', x: 350, y: 180 },
    { name: 'Amp-1', type: 'oadm', x: 450, y: 180 },
    { name: 'Backbone-Mid', type: 'oadm', x: 550, y: 180 },
    { name: 'Amp-2', type: 'oadm', x: 650, y: 180 },
    { name: 'Backbone-E', type: 'terminal', x: 750, y: 180 },
  ];

  // Metro B (right cluster)
  const metroB: Array<{ name: string; type: 'router' | 'oadm' | 'terminal'; x: number; y: number }> = [
    { name: 'Metro-B Router-1', type: 'router', x: 800, y: 100 },
    { name: 'Metro-B OADM-1', type: 'oadm', x: 850, y: 200 },
    { name: 'Metro-B OADM-2', type: 'oadm', x: 900, y: 300 },
    { name: 'Metro-B OADM-3', type: 'oadm', x: 800, y: 350 },
    { name: 'Metro-B Terminal', type: 'terminal', x: 750, y: 280 },
  ];

  // Metro C (bottom)
  const metroC: Array<{ name: string; type: 'router' | 'oadm' | 'terminal'; x: number; y: number }> = [
    { name: 'Metro-C Router', type: 'router', x: 500, y: 350 },
    { name: 'Metro-C OADM-1', type: 'oadm', x: 450, y: 450 },
    { name: 'Metro-C OADM-2', type: 'oadm', x: 550, y: 450 },
    { name: 'Metro-C Terminal', type: 'terminal', x: 500, y: 520 },
    { name: 'Metro-C Amp', type: 'oadm', x: 600, y: 380 },
  ];

  const allNodes = [...metroA, ...backbone, ...metroB, ...metroC];
  const nodeIds: string[] = [];
  for (const n of allNodes) {
    const id = createPresetNode(n.name, n.type, n.x, n.y);
    nodeIds.push(id);
    result.nodesCreated++;
  }

  // Metro A ring: 0-1-2-3-4-0
  // Backbone: 5-6-7-8-9
  // Metro B ring: 10-11-12-13-14
  // Metro C ring: 15-16-17-18-19
  // Inter-connects: MetroA(2)->Backbone-W(5), Backbone-E(9)->MetroB(14), Backbone-Mid(7)->MetroC(15)
  const edges: Array<{ src: number; tgt: number; dist: number; srlg: string[] }> = [
    // Metro A ring
    { src: 0, tgt: 1, dist: 15, srlg: ['SRLG-Metro-A'] },
    { src: 1, tgt: 2, dist: 20, srlg: ['SRLG-Metro-A'] },
    { src: 2, tgt: 3, dist: 18, srlg: ['SRLG-Metro-A'] },
    { src: 3, tgt: 4, dist: 12, srlg: ['SRLG-Metro-A'] },
    { src: 4, tgt: 0, dist: 10, srlg: ['SRLG-Metro-A'] },
    // Backbone
    { src: 5, tgt: 6, dist: 200, srlg: ['SRLG-Backbone'] },
    { src: 6, tgt: 7, dist: 250, srlg: ['SRLG-Backbone'] },
    { src: 7, tgt: 8, dist: 200, srlg: ['SRLG-Backbone'] },
    { src: 8, tgt: 9, dist: 180, srlg: ['SRLG-Backbone'] },
    // Metro B ring
    { src: 10, tgt: 11, dist: 12, srlg: ['SRLG-Metro-B'] },
    { src: 11, tgt: 12, dist: 18, srlg: ['SRLG-Metro-B'] },
    { src: 12, tgt: 13, dist: 15, srlg: ['SRLG-Metro-B'] },
    { src: 13, tgt: 14, dist: 10, srlg: ['SRLG-Metro-B'] },
    { src: 14, tgt: 10, dist: 14, srlg: ['SRLG-Metro-B'] },
    // Metro C ring
    { src: 15, tgt: 16, dist: 10, srlg: ['SRLG-Metro-C'] },
    { src: 16, tgt: 17, dist: 12, srlg: ['SRLG-Metro-C'] },
    { src: 17, tgt: 18, dist: 8, srlg: ['SRLG-Metro-C'] },
    { src: 18, tgt: 19, dist: 15, srlg: ['SRLG-Metro-C'] },
    { src: 19, tgt: 15, dist: 14, srlg: ['SRLG-Metro-C'] },
    // Inter-connects
    { src: 2, tgt: 5, dist: 30, srlg: ['SRLG-InterA'] },
    { src: 9, tgt: 14, dist: 25, srlg: ['SRLG-InterB'] },
    { src: 7, tgt: 15, dist: 50, srlg: ['SRLG-InterC'] },
    // Redundant backbone
    { src: 5, tgt: 7, dist: 500, srlg: ['SRLG-Backbone-Alt'] },
    { src: 7, tgt: 9, dist: 450, srlg: ['SRLG-Backbone-Alt'] },
    // Metro cross-connects
    { src: 1, tgt: 3, dist: 25, srlg: ['SRLG-Metro-A-Cross'] },
    { src: 11, tgt: 13, dist: 20, srlg: ['SRLG-Metro-B-Cross'] },
  ];

  for (const e of edges) {
    const edgeId = createPresetEdge(nodeIds[e.src], nodeIds[e.tgt], e.dist, e.srlg);
    if (edgeId) result.edgesCreated++;
  }

  try {
    const svcResult = generateRandomServices({
      count: 10,
      protectionRatio: 50,
      statusMix: 'mixed',
      channelStrategy: 'sequential',
      includeL2L3: true,
    });
    result.servicesCreated = svcResult.created;
    result.errors.push(...svcResult.errors);
  } catch (err) {
    result.errors.push(`Services: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const fillResult = randomFillChannels({
      targetUtilization: 35,
      allocationStatus: 'allocated',
      fragmentationPattern: 'clustered',
    });
    result.channelsAllocated = fillResult.totalAllocated;
  } catch (err) {
    result.errors.push(`Channel fill: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Stress Test preset - large topology for performance testing
 */
export function loadStressTestPreset(): SeedScenarioResult {
  const result: SeedScenarioResult = {
    nodesCreated: 0, edgesCreated: 0, servicesCreated: 0, channelsAllocated: 0, errors: [],
  };

  useNetworkStore.getState().clearTopology();

  const nodeIds: string[] = [];

  // Create grid of nodes (8 cols x 7 rows = 56 nodes) + 4 corner terminals = 60
  const cols = 8;
  const rows = 7;
  const spacing = 140;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      // Alternate between oadm and router in checkerboard pattern
      const type: 'router' | 'oadm' = (r + c) % 3 === 0 ? 'router' : 'oadm';
      const name = `N${String(idx + 1).padStart(2, '0')}-${type === 'router' ? 'R' : 'O'}`;
      const id = createPresetNode(name, type, 100 + c * spacing, 80 + r * spacing);
      nodeIds.push(id);
      result.nodesCreated++;
    }
  }

  // Add 4 corner terminals
  const terminals: Array<{ name: string; x: number; y: number }> = [
    { name: 'Term-NW', x: 30, y: 30 },
    { name: 'Term-NE', x: 100 + (cols - 1) * spacing + 70, y: 30 },
    { name: 'Term-SW', x: 30, y: 80 + (rows - 1) * spacing + 50 },
    { name: 'Term-SE', x: 100 + (cols - 1) * spacing + 70, y: 80 + (rows - 1) * spacing + 50 },
  ];

  for (const t of terminals) {
    const id = createPresetNode(t.name, 'terminal', t.x, t.y);
    nodeIds.push(id);
    result.nodesCreated++;
  }

  // Connect grid: horizontal edges
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const src = r * cols + c;
      const tgt = r * cols + c + 1;
      const dist = 40 + Math.floor(Math.random() * 60);
      const edgeId = createPresetEdge(nodeIds[src], nodeIds[tgt], dist, [`SRLG-Row${r}`]);
      if (edgeId) result.edgesCreated++;
    }
  }

  // Vertical edges
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const src = r * cols + c;
      const tgt = (r + 1) * cols + c;
      const dist = 40 + Math.floor(Math.random() * 60);
      const edgeId = createPresetEdge(nodeIds[src], nodeIds[tgt], dist, [`SRLG-Col${c}`]);
      if (edgeId) result.edgesCreated++;
    }
  }

  // Diagonal edges (every other cell for density without overloading ports)
  for (let r = 0; r < rows - 1; r += 2) {
    for (let c = 0; c < cols - 1; c += 2) {
      const src = r * cols + c;
      const tgt = (r + 1) * cols + c + 1;
      const dist = 60 + Math.floor(Math.random() * 80);
      const edgeId = createPresetEdge(nodeIds[src], nodeIds[tgt], dist, ['SRLG-Diag']);
      if (edgeId) result.edgesCreated++;
    }
  }

  // Terminal connections
  const gridSize = rows * cols;
  const termConnections = [
    { term: gridSize, grid: 0 },              // NW terminal to top-left
    { term: gridSize + 1, grid: cols - 1 },   // NE terminal to top-right
    { term: gridSize + 2, grid: (rows - 1) * cols },       // SW terminal to bottom-left
    { term: gridSize + 3, grid: (rows - 1) * cols + cols - 1 }, // SE terminal to bottom-right
  ];

  for (const tc of termConnections) {
    const edgeId = createPresetEdge(nodeIds[tc.term], nodeIds[tc.grid], 20, ['SRLG-Terminal']);
    if (edgeId) result.edgesCreated++;
  }

  // Generate many services in batches to avoid channel exhaustion
  try {
    // Batch 1: 15 services with protection
    let svcResult = generateRandomServices({
      count: 15,
      protectionRatio: 80,
      statusMix: 'all-active',
      channelStrategy: 'sequential',
      includeL2L3: true,
    });
    result.servicesCreated += svcResult.created;
    result.errors.push(...svcResult.errors);

    // Batch 2: 10 more
    svcResult = generateRandomServices({
      count: 10,
      protectionRatio: 40,
      statusMix: 'mixed',
      channelStrategy: 'sequential',
      includeL2L3: false,
    });
    result.servicesCreated += svcResult.created;
    result.errors.push(...svcResult.errors);
  } catch (err) {
    result.errors.push(`Services: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fill channels to heavy utilization
  try {
    const fillResult = randomFillChannels({
      targetUtilization: 65,
      allocationStatus: 'allocated',
      fragmentationPattern: 'fragmented',
    });
    result.channelsAllocated = fillResult.totalAllocated;
  } catch (err) {
    result.errors.push(`Channel fill: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Regeneration Test preset
 * Terminal-A -- OADM-1 -- OADM-2 -- OADM-3 -- OADM-4 -- Terminal-B
 * Linear long-haul topology (1500+ km total) with OADMs as regen-capable nodes.
 * Varying segment channel utilization to demonstrate regen benefit.
 * Includes nodes with spare DWDM ports for regeneration planning.
 */
function loadRegenTestPreset(): SeedScenarioResult {
  const result: SeedScenarioResult = {
    nodesCreated: 0, edgesCreated: 0, servicesCreated: 0, channelsAllocated: 0, errors: [],
  };

  useNetworkStore.getState().clearTopology();

  // Create nodes: Terminal-A, OADM-1 through OADM-4, Terminal-B
  const nodeA = createPresetNode('Terminal-A', 'terminal', 100, 200, { latitude: 40.71, longitude: -74.01 });
  result.nodesCreated++;
  const nodeOADM1 = createPresetNode('OADM-1', 'oadm', 300, 200, { latitude: 41.00, longitude: -73.30 });
  result.nodesCreated++;
  const nodeOADM2 = createPresetNode('OADM-2', 'oadm', 500, 200, { latitude: 41.30, longitude: -72.60 });
  result.nodesCreated++;
  const nodeOADM3 = createPresetNode('OADM-3', 'oadm', 700, 200, { latitude: 41.60, longitude: -71.90 });
  result.nodesCreated++;
  const nodeOADM4 = createPresetNode('OADM-4', 'oadm', 900, 200, { latitude: 41.90, longitude: -71.20 });
  result.nodesCreated++;
  const nodeB = createPresetNode('Terminal-B', 'terminal', 1100, 200, { latitude: 42.20, longitude: -70.50 });
  result.nodesCreated++;

  // Ensure OADM nodes have spare DWDM ports for regeneration
  const store = useNetworkStore.getState();
  for (const oadmId of [nodeOADM1, nodeOADM2, nodeOADM3, nodeOADM4]) {
    const oadmNode = store.topology.nodes.find((n) => n.id === oadmId);
    if (oadmNode) {
      const existingDwdmPorts = oadmNode.ports?.filter((p) => p.type === 'dwdm' && p.status === 'available') || [];
      if (existingDwdmPorts.length < 4) {
        for (let i = 0; i < 4 - existingDwdmPorts.length; i++) {
          store.addPort(oadmId, {
            name: `REGEN-DWDM-${i + 1}`,
            type: 'dwdm',
            dataRate: '100G',
            channels: 96,
          });
        }
      }
    }
  }

  // Create edges with realistic long-haul distances (total: 1600 km)
  const e1 = createPresetEdge(nodeA, nodeOADM1, 280);       // 280 km
  if (e1) result.edgesCreated++;
  const e2 = createPresetEdge(nodeOADM1, nodeOADM2, 350);   // 350 km
  if (e2) result.edgesCreated++;
  const e3 = createPresetEdge(nodeOADM2, nodeOADM3, 320);   // 320 km
  if (e3) result.edgesCreated++;
  const e4 = createPresetEdge(nodeOADM3, nodeOADM4, 370);   // 370 km
  if (e4) result.edgesCreated++;
  const e5 = createPresetEdge(nodeOADM4, nodeB, 280);       // 280 km
  if (e5) result.edgesCreated++;

  // Fill different channel allocations per segment to demonstrate regen benefit
  // Segment 1 (A -> OADM1 -> OADM2): fill 40 channels (high utilization)
  // Segment 2 (OADM2 -> OADM3): fill 20 channels (low utilization)
  // Segment 3 (OADM3 -> OADM4 -> B): fill 35 channels (medium utilization)
  // Without regen: E2E availability limited by worst segment overlap
  // With regen at OADM nodes: each segment assessed independently
  const seg1Edges = [e1, e2].filter((e): e is string => e !== null);
  const seg2Edges = [e3].filter((e): e is string => e !== null);
  const seg3Edges = [e4, e5].filter((e): e is string => e !== null);
  try {
    if (seg1Edges.length > 0) {
      const r1 = randomFillChannels({
        mode: 'exact',
        targetUtilization: 40,
        exactCount: 40,
        allocationStatus: 'allocated',
        fragmentationPattern: 'clustered',
        edgeFilter: seg1Edges,
      });
      result.channelsAllocated += r1.totalAllocated;
    }
    if (seg2Edges.length > 0) {
      const r2 = randomFillChannels({
        mode: 'exact',
        targetUtilization: 20,
        exactCount: 20,
        allocationStatus: 'allocated',
        fragmentationPattern: 'uniform',
        edgeFilter: seg2Edges,
      });
      result.channelsAllocated += r2.totalAllocated;
    }
    if (seg3Edges.length > 0) {
      const r3 = randomFillChannels({
        mode: 'exact',
        targetUtilization: 35,
        exactCount: 35,
        allocationStatus: 'allocated',
        fragmentationPattern: 'fragmented',
        edgeFilter: seg3Edges,
      });
      result.channelsAllocated += r3.totalAllocated;
    }
  } catch (err) {
    result.errors.push(`Channel fill: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Load a topology preset by ID
 */
export function loadTopologyPreset(presetId: string): SeedScenarioResult {
  switch (presetId) {
    case 'national-backbone':
      return loadNationalBackbonePreset();
    case 'regional-dwdm':
      return loadRegionalDWDMPreset();
    case 'metro-longhaul':
      return loadMetroLonghaulPreset();
    case 'stress-test':
      return loadStressTestPreset();
    case 'regen-test':
      return loadRegenTestPreset();
    default:
      return { nodesCreated: 0, edgesCreated: 0, servicesCreated: 0, channelsAllocated: 0, errors: [`Unknown preset: ${presetId}`] };
  }
}

/**
 * Load a topology preset asynchronously with progress callbacks.
 * Wraps the synchronous preset loaders with progress reporting and frame yields.
 */
export async function loadTopologyPresetAsync(
  presetId: string,
  onProgress?: (percent: number, status: string) => void,
): Promise<SeedScenarioResult> {
  const preset = TOPOLOGY_PRESETS.find((p) => p.id === presetId);
  const presetName = preset?.name || presetId;

  onProgress?.(0, `Preparing ${presetName}...`);
  await yieldFrame();

  onProgress?.(10, `Clearing topology...`);
  await yieldFrame();

  onProgress?.(20, `Loading ${presetName} nodes...`);
  await yieldFrame();

  const result = loadTopologyPreset(presetId);

  onProgress?.(80, `Loaded ${result.nodesCreated} nodes, ${result.edgesCreated} edges`);
  await yieldFrame();

  if (result.servicesCreated > 0) {
    onProgress?.(90, `Created ${result.servicesCreated} services`);
    await yieldFrame();
  }

  onProgress?.(100, `${presetName}: ${result.nodesCreated} nodes, ${result.edgesCreated} edges, ${result.servicesCreated} services`);

  return result;
}

// ============================================================================
// STRESS TEST+ ASYNC GENERATOR (Task 4.3)
// ============================================================================

/** Helper to yield a frame for UI responsiveness */
function yieldFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Stress Test+ async generator: ~1000 nodes, ~2000 edges.
 * Uses batchLoadTopology for a single-mutation bulk load.
 * Yields between chunks via requestAnimationFrame for UI responsiveness.
 */
export async function loadStressTestPlusPreset(
  onProgress?: (msg: string) => void
): Promise<SeedScenarioResult> {
  const result: SeedScenarioResult = {
    nodesCreated: 0, edgesCreated: 0, servicesCreated: 0, channelsAllocated: 0, errors: [],
  };

  const store = useNetworkStore.getState();
  store.clearTopology();

  onProgress?.('Generating nodes...');
  await yieldFrame();

  const cols = 33;
  const rows = 30;
  const totalNodes = cols * rows; // 990 nodes
  const spacing = 80;
  const nodeTypeList: Array<'router' | 'oadm' | 'switch' | 'terminal'> = ['router', 'oadm', 'switch', 'terminal'];

  // Build raw node/edge arrays, then batchLoadTopology in one mutation
  const rawNodes: NetworkNode[] = [];
  const rawEdges: NetworkEdge[] = [];

  // Generate grid nodes (33x30 = 990 nodes)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const type = nodeTypeList[idx % nodeTypeList.length];
      const name = `ST+${String(idx + 1).padStart(4, '0')}-${type[0].toUpperCase()}`;
      const nodeId = crypto.randomUUID();

      // Create 4 DWDM ports per node (sufficient for grid connectivity)
      const ports: NetworkNode['ports'] = [];
      for (let p = 0; p < 4; p++) {
        ports.push({
          id: crypto.randomUUID(),
          name: `DWDM-${p + 1}`,
          type: 'dwdm',
          dataRate: '100G',
          channels: 96,
          status: 'available',
          spectrum: { gridType: 'fixed-50ghz', allocations: [] },
        });
      }

      rawNodes.push({
        id: nodeId,
        name,
        type,
        vendor: 'generic',
        model: '',
        position: { x: 40 + c * spacing, y: 40 + r * spacing },
        stacks: [{ layer: 'dwdm', enabled: true, capacity: { used: 0, total: 96, unit: 'lambdas' }, properties: {} }],
        ports,
        metadata: { debugGenerated: true },
      } as NetworkNode);
      result.nodesCreated++;
    }

    // Yield every 3 rows for UI responsiveness
    if (r % 3 === 0) {
      onProgress?.(`Generating nodes... (${result.nodesCreated}/${totalNodes})`);
      await yieldFrame();
    }
  }

  onProgress?.(`Nodes complete (${result.nodesCreated}). Generating edges...`);
  await yieldFrame();

  // Port consumption tracker
  const portIdx = new Map<string, number>();
  function getNextPort(nodeId: string): string | null {
    const node = rawNodes.find((n) => n.id === nodeId);
    if (!node?.ports) return null;
    const idx = portIdx.get(nodeId) || 0;
    const dwdmPorts = node.ports.filter((p) => p.type === 'dwdm');
    if (idx >= dwdmPorts.length) return null;
    portIdx.set(nodeId, idx + 1);
    return dwdmPorts[idx].id;
  }

  function addRawEdge(srcIdx: number, tgtIdx: number, dist: number, srlg: string[]): void {
    const srcNode = rawNodes[srcIdx];
    const tgtNode = rawNodes[tgtIdx];
    if (!srcNode || !tgtNode) return;
    const srcPortId = getNextPort(srcNode.id);
    const tgtPortId = getNextPort(tgtNode.id);
    if (!srcPortId || !tgtPortId) return;

    rawEdges.push({
      id: crypto.randomUUID(),
      name: '',
      type: 'fiber',
      source: { nodeId: srcNode.id, portId: srcPortId, handle: 'right-source' },
      target: { nodeId: tgtNode.id, portId: tgtPortId, handle: 'left-target' },
      properties: { distance: dist, weight: dist, cost: dist, srlgCodes: srlg },
      state: 'active',
      metadata: { debugGenerated: true },
    } as NetworkEdge);
    result.edgesCreated++;
  }

  // Horizontal edges (~960)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      addRawEdge(r * cols + c, r * cols + c + 1, 30 + Math.floor(Math.random() * 70), [`SRLG-R${r}`]);
    }
    if (r % 5 === 0) {
      onProgress?.(`Generating edges... (${result.edgesCreated})`);
      await yieldFrame();
    }
  }

  // Vertical edges (~957)
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      addRawEdge(r * cols + c, (r + 1) * cols + c, 30 + Math.floor(Math.random() * 70), [`SRLG-C${c}`]);
    }
  }

  onProgress?.(`Edges: ${result.edgesCreated}. Loading into store...`);
  await yieldFrame();

  // Use loadTopology for single-mutation bulk load
  try {
    const now = new Date().toISOString();
    store.loadTopology({
      id: crypto.randomUUID(),
      name: 'Stress Test+',
      version: '1.0.0',
      metadata: {
        created: now,
        modified: now,
        author: 'Debug Generator',
        description: `Stress Test+ topology with ${result.nodesCreated} nodes and ${result.edgesCreated} edges`,
      },
      nodes: rawNodes,
      edges: rawEdges,
    });
  } catch (err) {
    result.errors.push(`Load topology: ${err instanceof Error ? err.message : String(err)}`);
  }

  onProgress?.(`Loaded: ${result.nodesCreated} nodes, ${result.edgesCreated} edges`);
  return result;
}

// ============================================================================
// SEPARATE L1 / L2L3 SERVICE GENERATION (Task 8.1)
// ============================================================================

/**
 * Generate only L1 DWDM services (no L2/L3)
 */
export function generateL1Services(options: L1ServiceGenOptions): RandomServiceResult {
  return generateRandomServices({
    count: options.count,
    protectionRatio: options.protectionRatio,
    channelStrategy: options.channelStrategy,
    statusMix: options.statusMix,
    includeL2L3: false,
  });
}

/**
 * Generate only L2/L3 services over existing or auto-created L1 underlays
 */
export function generateL2L3ServicesOnly(options: L2L3ServiceGenOptions): RandomServiceResult {
  const result: RandomServiceResult = { created: 0, serviceIds: [], errors: [] };

  const serviceStore = useServiceStore.getState();

  // Find existing active L1 services
  let activeL1Ids = serviceStore.services
    .filter((s) => s.type === 'l1-dwdm' && s.status === 'active')
    .map((s) => s.id);

  // Auto-create L1 underlays if needed and in auto mode
  if (activeL1Ids.length === 0 && options.underlayMode === 'auto') {
    const neededL1 = Math.max(options.count, 3);
    const l1Result = generateRandomServices({
      count: neededL1,
      protectionRatio: 50,
      statusMix: 'all-active',
      channelStrategy: 'sequential',
      includeL2L3: false,
    });

    if (l1Result.created === 0) {
      result.errors.push('Failed to auto-create L1 underlays: ' + l1Result.errors.join('; '));
      return result;
    }

    result.errors.push(`Auto-created ${l1Result.created} L1 underlays`);
    activeL1Ids = l1Result.serviceIds;
    result.serviceIds.push(...l1Result.serviceIds);
    result.created += l1Result.created;
  }

  if (activeL1Ids.length === 0) {
    result.errors.push('No active L1 services available for L2/L3 underlay. Create L1 services first or use Auto mode.');
    return result;
  }

  // Create L2/L3 services over active L1 underlays
  const underlays = activeL1Ids.slice(0, options.count);
  for (let i = 0; i < Math.min(options.count, underlays.length); i++) {
    try {
      const underlay = serviceStore.getService(underlays[i]);
      if (!underlay) continue;

      const srcEndpoint = findAdjacentRouterOrSwitch(underlay.sourceNodeId);
      const dstEndpoint = findAdjacentRouterOrSwitch(underlay.destinationNodeId);

      if (!srcEndpoint || !dstEndpoint) {
        result.errors.push(`No adjacent router/switch with BW ports for L2/L3 service ${i + 1}`);
        continue;
      }

      const serviceId = serviceStore.addService({
        type: 'l2-ethernet',
        name: `Debug-L2-over-${underlay.id}`,
        status: 'active',
        sourceNodeId: srcEndpoint.nodeId,
        sourcePortId: srcEndpoint.portId,
        destinationNodeId: dstEndpoint.nodeId,
        destinationPortId: dstEndpoint.portId,
        dataRate: '10G',
        underlayServiceId: underlay.id,
        underlayAutoCreated: false,
        protectionScheme: 'none',
        protectionUnderlayServiceId: undefined,
        bfdConfig: options.bfdEnabled
          ? { enabled: true, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 }
          : { enabled: false, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
        metadata: { debugGenerated: true },
      } as Omit<Service, 'id' | 'createdAt' | 'modifiedAt'>);

      result.serviceIds.push(serviceId);
      result.created++;
    } catch (err) {
      result.errors.push(`L2/L3 service ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * Estimate channel fill for display before executing
 */
export function estimateChannelFill(targetUtilization: number): ChannelFillEstimate {
  const dwdmEdges = getDwdmEdgesWithPorts();
  const totalChannels = 96;
  const targetCount = Math.round((targetUtilization / 100) * totalChannels);

  let totalAlreadyAllocated = 0;
  for (const { edge } of dwdmEdges) {
    const existing = getExistingAllocatedChannels(edge.id);
    totalAlreadyAllocated += existing.size;
  }

  const avgAllocated = dwdmEdges.length > 0 ? Math.round(totalAlreadyAllocated / dwdmEdges.length) : 0;
  const newPerEdge = Math.max(0, targetCount - avgAllocated);

  return {
    targetChannelsPerEdge: targetCount,
    dwdmEdgeCount: dwdmEdges.length,
    totalNewChannels: newPerEdge * dwdmEdges.length,
    alreadyAllocatedAvg: avgAllocated,
  };
}

/**
 * Get count of active L1 services (for UI display)
 */
export function getActiveL1ServiceCount(): number {
  return useServiceStore.getState().services
    .filter((s) => s.type === 'l1-dwdm' && s.status === 'active').length;
}

// ============================================================================
// QUICK PRESETS
// ============================================================================

export function presetLight(): RandomFillResult {
  return randomFillChannels({
    targetUtilization: 30,
    allocationStatus: 'allocated',
    fragmentationPattern: 'uniform',
  });
}

export function presetModerate(): RandomFillResult {
  return randomFillChannels({
    targetUtilization: 60,
    allocationStatus: 'allocated',
    fragmentationPattern: 'clustered',
  });
}

export function presetHeavy(): RandomFillResult {
  return randomFillChannels({
    targetUtilization: 90,
    allocationStatus: 'allocated',
    fragmentationPattern: 'fragmented',
  });
}

export function presetBottleneck(): RandomFillResult {
  const edges = getDwdmEdgesWithPorts();
  if (edges.length === 0) {
    return { totalAllocated: 0, edgesAffected: 0, allocationIds: [], errors: ['No DWDM edges'] };
  }

  // Pick one random edge for 95% utilization
  const bottleneckEdge = edges[Math.floor(Math.random() * edges.length)];

  // Fill rest at 20%
  const otherEdgeIds = edges
    .filter((e) => e.edge.id !== bottleneckEdge.edge.id)
    .map((e) => e.edge.id);

  const r1 = randomFillChannels({
    targetUtilization: 95,
    allocationStatus: 'allocated',
    fragmentationPattern: 'clustered',
    edgeFilter: [bottleneckEdge.edge.id],
  });

  const r2 = randomFillChannels({
    targetUtilization: 20,
    allocationStatus: 'allocated',
    fragmentationPattern: 'uniform',
    edgeFilter: otherEdgeIds,
  });

  return {
    totalAllocated: r1.totalAllocated + r2.totalAllocated,
    edgesAffected: r1.edgesAffected + r2.edgesAffected,
    allocationIds: [...r1.allocationIds, ...r2.allocationIds],
    errors: [...r1.errors, ...r2.errors],
  };
}

export function presetFragmented(): RandomFillResult {
  return randomFillChannels({
    targetUtilization: 50,
    allocationStatus: 'allocated',
    fragmentationPattern: 'fragmented',
  });
}

export function presetFiveServicesMixed(): RandomServiceResult {
  return generateRandomServices({
    count: 5,
    protectionRatio: 40,
    statusMix: 'mixed',
    channelStrategy: 'random',
    includeL2L3: false,
  });
}

export function presetTenServicesProtected(): RandomServiceResult {
  return generateRandomServices({
    count: 10,
    protectionRatio: 80,
    statusMix: 'all-active',
    channelStrategy: 'sequential',
    includeL2L3: true,
  });
}
