/**
 * Import Engine — Orchestrator for the CSV import pipeline.
 *
 * Flow: parse → validate → transform → generate UUIDs → resolve references → result
 *
 * The engine does NOT write to stores. It returns validated, transformed data
 * that the UI can preview and then commit via store actions.
 */

import type {
  ImportSource,
  ImportFileType,
  ImportTemplate,
  ImportValidationResult,
  ImportRowValidation,
} from '@/types/import';
import type {
  NetworkNode,
  NetworkEdge,
  NodeType,
  VendorType,
  FiberProfileType,
  LayerStack,
  Port,
} from '@/types/network';
import type {
  ServiceType,
  ProtectionScheme,
  L1DWDMService,
  L2L3Service,
  Service,
  ServicePath,
} from '@/types/service';
import { parseCsv } from './CsvParser';
import { validateRow, validateServiceRow } from './ImportValidator';
import { VALUE_TRANSFORMERS } from './ImportTransformer';
import type { ServiceRole } from './ImportTransformer';
import { HUAWEI_NCE_TEMPLATES } from './templates/huawei-nce';
import { frequencyToChannelNumber, ituToUserChannel } from '@/core/spectrum/channelConfig';

/** Generate a unique ID (crypto.randomUUID with fallback) */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Get the template for a given source and file type */
function getTemplate(source: ImportSource, fileType: ImportFileType): ImportTemplate | undefined {
  if (source === 'huawei-nce') {
    return HUAWEI_NCE_TEMPLATES[fileType];
  }
  return undefined;
}

/** Default layer stacks by node type */
function defaultStacks(nodeType: NodeType): LayerStack[] {
  const stacks: LayerStack[] = [];

  if (nodeType === 'router' || nodeType === 'switch') {
    stacks.push({
      layer: 'ip',
      enabled: true,
      capacity: { total: 100, unit: 'Gbps', used: 0 },
      properties: {},
    });
  }

  if (nodeType === 'oadm' || nodeType === 'amplifier' || nodeType === 'terminal') {
    stacks.push({
      layer: 'dwdm',
      enabled: true,
      capacity: { total: 96, unit: 'lambdas', used: 0 },
      properties: {},
    });
  }

  if (stacks.length === 0) {
    stacks.push({
      layer: 'ip',
      enabled: true,
      capacity: { total: 10, unit: 'Gbps', used: 0 },
      properties: {},
    });
  }

  return stacks;
}

/** Create default ports for a node type */
function defaultPorts(nodeType: NodeType): Port[] {
  // Import the constant directly to avoid circular dependency issues at runtime
  const portConfigs: Record<string, { name: string; type: string; dataRate: string; channels: number }[]> = {
    router: [
      { name: 'Eth-1', type: 'bw', dataRate: '10G', channels: 1 },
      { name: 'Eth-2', type: 'bw', dataRate: '10G', channels: 1 },
      { name: 'Line-1', type: 'dwdm', dataRate: '100G', channels: 96 },
      { name: 'Line-2', type: 'dwdm', dataRate: '100G', channels: 96 },
    ],
    switch: [
      { name: 'Port-1', type: 'bw', dataRate: '1G', channels: 1 },
      { name: 'Port-2', type: 'bw', dataRate: '1G', channels: 1 },
      { name: 'Uplink-1', type: 'bw', dataRate: '10G', channels: 1 },
      { name: 'Uplink-2', type: 'bw', dataRate: '10G', channels: 1 },
    ],
    oadm: [
      { name: 'Line-1', type: 'dwdm', dataRate: '100G', channels: 96 },
      { name: 'Line-2', type: 'dwdm', dataRate: '100G', channels: 96 },
      { name: 'Add-1', type: 'dwdm', dataRate: '100G', channels: 96 },
      { name: 'Add-2', type: 'dwdm', dataRate: '100G', channels: 96 },
    ],
    amplifier: [
      { name: 'IN', type: 'dwdm', dataRate: '100G', channels: 96 },
      { name: 'OUT', type: 'dwdm', dataRate: '100G', channels: 96 },
    ],
    terminal: [
      { name: 'Client-1', type: 'bw', dataRate: '10G', channels: 1 },
      { name: 'Client-2', type: 'bw', dataRate: '10G', channels: 1 },
      { name: 'Line-1', type: 'dwdm', dataRate: '100G', channels: 96 },
      { name: 'Line-2', type: 'dwdm', dataRate: '100G', channels: 96 },
    ],
    'osp-termination': [
      { name: 'BW-In', type: 'bw', dataRate: '10G', channels: 1 },
      { name: 'BW-Out', type: 'bw', dataRate: '10G', channels: 1 },
    ],
    custom: [
      { name: 'Port-1', type: 'bw', dataRate: '10G', channels: 1 },
      { name: 'Port-2', type: 'bw', dataRate: '10G', channels: 1 },
    ],
  };

  const configs = portConfigs[nodeType] ?? portConfigs['custom'];
  return configs.map((c) => ({
    id: generateId(),
    name: c.name,
    type: c.type as Port['type'],
    dataRate: c.dataRate as Port['dataRate'],
    channels: c.channels,
    status: 'available' as const,
    ...(c.type === 'dwdm' ? { spectrum: { gridType: 'fixed-50ghz' as const, allocations: [] } } : {}),
  }));
}

/**
 * Transform a parsed CSV row into a NetworkNode.
 */
function transformToNode(
  row: Record<string, string>,
  _template: ImportTemplate,
): NetworkNode {
  const toNodeType = VALUE_TRANSFORMERS.toNodeType;
  const toVendor = VALUE_TRANSFORMERS.toVendor;

  const nodeType = (toNodeType(row['node_type'] || '') as NodeType) || 'custom';
  const vendor = (toVendor(row['vendor'] || '') as VendorType) || 'generic';

  // Only parse lat/lng if the CSV actually provided non-empty values
  const rawLat = row['latitude']?.trim();
  const rawLng = row['longitude']?.trim();
  const hasLat = rawLat !== undefined && rawLat !== '';
  const hasLng = rawLng !== undefined && rawLng !== '';
  const lat = hasLat ? parseFloat(rawLat) : NaN;
  const lng = hasLng ? parseFloat(rawLng) : NaN;

  const id = generateId();

  const node: NetworkNode = {
    id,
    name: row['node_name'] || 'Unnamed Node',
    type: nodeType,
    vendor,
    model: row['model'] || undefined,
    subtype: row['subtype'] || undefined,
    sizeFlavor: (['small', 'medium', 'large'].includes(row['size_flavor'] || '')
      ? row['size_flavor']
      : 'medium') as NetworkNode['sizeFlavor'],
    position: { x: 0, y: 0 }, // Will be laid out after import
    location: {
      latitude: isNaN(lat) ? undefined : lat,
      longitude: isNaN(lng) ? undefined : lng,
      address: row['address'] || undefined,
    },
    stacks: defaultStacks(nodeType),
    ports: defaultPorts(nodeType),
    metadata: { importedFrom: 'huawei-nce' },
  };

  return node;
}

/**
 * Allocate (or find by name) a port on a node for an edge connection.
 * Mutates the port in-place (sets status to 'used' and connectedEdgeId).
 */
function allocatePort(
  node: NetworkNode,
  edgeId: string,
  portName?: string,
): string | undefined {
  if (!node.ports) return undefined;

  let port: Port | undefined;

  if (portName) {
    // Find by name (case-insensitive)
    port = node.ports.find(
      p => p.name.toLowerCase() === portName.toLowerCase() && p.status === 'available'
    );
  }

  if (!port) {
    // Auto-allocate: prefer DWDM Line-* ports for fiber edges
    port = node.ports.find(
      p => p.type === 'dwdm' && p.name.startsWith('Line-') && p.status === 'available'
    );
  }

  if (!port) {
    // Fallback: any available DWDM port
    port = node.ports.find(
      p => p.type === 'dwdm' && p.status === 'available'
    );
  }

  if (port) {
    port.status = 'used';
    port.connectedEdgeId = edgeId;
    return port.id;
  }

  return undefined;
}

/**
 * Transform a parsed CSV row into a NetworkEdge.
 * Node name → UUID resolution happens via the nodeNameToId map.
 * Port allocation is NOT done here — it's a separate opt-in step via allocatePortsOnEdges().
 * Only sets portId when the CSV explicitly provides source_port/target_port column values.
 */
function transformToEdge(
  row: Record<string, string>,
  _template: ImportTemplate,
  nodeNameToId: Map<string, string>,
): NetworkEdge | null {
  const sourceName = row['source_node'] || '';
  const targetName = row['target_node'] || '';

  const sourceId = nodeNameToId.get(sourceName.toLowerCase());
  const targetId = nodeNameToId.get(targetName.toLowerCase());

  if (!sourceId || !targetId) {
    return null; // Will be caught by validation
  }

  const toFiberProfile = VALUE_TRANSFORMERS.toFiberProfile;
  const toNumber = VALUE_TRANSFORMERS.toNumber;
  const toSrlgArray = VALUE_TRANSFORMERS.toSrlgArray;
  const toFiberCount = VALUE_TRANSFORMERS.toFiberCount;

  const distance = (toNumber(row['distance_km'] || '0') as number) || 0;
  const fiberProfile = (toFiberProfile(row['fiber_profile'] || 'G.652.D') as FiberProfileType) || 'G.652.D';
  const fiberCount = (toFiberCount(row['fiber_count'] || '1') as number) || 1;
  const srlgCodes = (toSrlgArray(row['srlg_codes'] || '') as string[]) || [];

  const edgeId = generateId();

  const edge: NetworkEdge = {
    id: edgeId,
    name: row['edge_name'] || `${sourceName}-${targetName}`,
    type: 'fiber',
    source: { nodeId: sourceId },
    target: { nodeId: targetId },
    properties: {
      distance,
      fiberCount,
      lambdaCapacity: 96,
      fiberProfile: {
        profileType: fiberProfile,
      },
      srlgCodes: srlgCodes.length > 0 ? srlgCodes : undefined,
    },
    state: 'active',
    metadata: { importedFrom: 'huawei-nce' },
  };

  // Only set portId when the CSV explicitly provides source_port/target_port values
  const sourcePortName = row['source_port']?.trim();
  const targetPortName = row['target_port']?.trim();
  if (sourcePortName) {
    // Store port name temporarily in metadata for later resolution
    edge.metadata = { ...edge.metadata, _sourcePortName: sourcePortName };
  }
  if (targetPortName) {
    edge.metadata = { ...edge.metadata, _targetPortName: targetPortName };
  }

  return edge;
}

export interface ImportResult {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  services: Service[];
  nodeValidation: ImportValidationResult;
  edgeValidation: ImportValidationResult;
  serviceValidation: ImportValidationResult;
  portValidation: ImportValidationResult;
  /** Map from CSV node name (lowercase) to generated UUID */
  nodeNameToId: Map<string, string>;
}

/** Info about a single port allocation for UI display */
export interface PortAllocationInfo {
  edgeId: string;
  edgeName: string;
  sourceNodeName: string;
  sourcePortName: string | null;
  targetNodeName: string;
  targetPortName: string | null;
}

/**
 * Allocate DWDM ports on edges that don't have explicit portId assignments.
 * This is a separate opt-in step — called from the wizard when the user enables auto-assignment.
 *
 * @param edges - Edges to process (may have portId already set from explicit CSV columns)
 * @param allNodes - Combined imported + existing topology nodes (deep-cloned internally)
 * @returns Updated edges, updated nodes, and allocation info for UI display
 */
export function allocatePortsOnEdges(
  edges: NetworkEdge[],
  allNodes: NetworkNode[],
): { updatedEdges: NetworkEdge[]; updatedNodes: NetworkNode[]; allocations: PortAllocationInfo[] } {
  // Deep-clone nodes to avoid mutating store state
  const clonedNodes = allNodes.map((n) => ({
    ...n,
    ports: (n.ports || []).map((p) => ({ ...p })),
  }));

  const nodeMap = new Map<string, NetworkNode>();
  for (const node of clonedNodes) {
    nodeMap.set(node.id, node);
  }

  const allocations: PortAllocationInfo[] = [];
  const modifiedNodeIds = new Set<string>();

  // Deep-clone edges
  const updatedEdges = edges.map((e) => ({
    ...e,
    source: { ...e.source },
    target: { ...e.target },
    metadata: e.metadata ? { ...e.metadata } : {},
  }));

  for (const edge of updatedEdges) {
    const sourceNode = nodeMap.get(edge.source.nodeId);
    const targetNode = nodeMap.get(edge.target.nodeId);

    let sourcePortName: string | null = null;
    let targetPortName: string | null = null;

    // Resolve explicit port names from metadata (set during transform)
    const explicitSrcPort = edge.metadata?._sourcePortName as string | undefined;
    const explicitTgtPort = edge.metadata?._targetPortName as string | undefined;

    if (!edge.source.portId && sourceNode) {
      const portId = allocatePort(sourceNode, edge.id, explicitSrcPort);
      if (portId) {
        edge.source.portId = portId;
        modifiedNodeIds.add(sourceNode.id);
        const port = (sourceNode.ports || []).find((p) => p.id === portId);
        sourcePortName = port?.name || null;
      }
    } else if (edge.source.portId && sourceNode) {
      const port = (sourceNode.ports || []).find((p) => p.id === edge.source.portId);
      sourcePortName = port?.name || null;
    }

    if (!edge.target.portId && targetNode) {
      const portId = allocatePort(targetNode, edge.id, explicitTgtPort);
      if (portId) {
        edge.target.portId = portId;
        modifiedNodeIds.add(targetNode.id);
        const port = (targetNode.ports || []).find((p) => p.id === portId);
        targetPortName = port?.name || null;
      }
    } else if (edge.target.portId && targetNode) {
      const port = (targetNode.ports || []).find((p) => p.id === edge.target.portId);
      targetPortName = port?.name || null;
    }

    allocations.push({
      edgeId: edge.id,
      edgeName: edge.name,
      sourceNodeName: sourceNode?.name || edge.source.nodeId,
      sourcePortName,
      targetNodeName: targetNode?.name || edge.target.nodeId,
      targetPortName,
    });

    // Clean up temporary metadata
    if (edge.metadata?._sourcePortName) delete edge.metadata._sourcePortName;
    if (edge.metadata?._targetPortName) delete edge.metadata._targetPortName;
  }

  // Only return nodes that were actually modified
  const updatedNodes = clonedNodes.filter((n) => modifiedNodeIds.has(n.id));

  return { updatedEdges, updatedNodes, allocations };
}

/**
 * Transform a parsed CSV row into a Port object with its parent node name.
 */
function transformToPort(
  row: Record<string, string>,
): { nodeName: string; port: Port } | null {
  const nodeName = row['node_name'] || '';
  const portName = row['port_name'] || '';
  const portType = (VALUE_TRANSFORMERS.toPortType?.(row['port_type'] || 'bw') as Port['type']) || 'bw';
  const dataRate = (row['data_rate'] || '10G') as Port['dataRate'];
  const channels = (VALUE_TRANSFORMERS.toNumber(row['channels'] || '1') as number) || 1;
  const gridType = row['grid_type'] || 'fixed-50ghz';

  if (!nodeName || !portName) return null;

  const port: Port = {
    id: generateId(),
    name: portName,
    type: portType,
    dataRate,
    channels,
    status: 'available' as const,
    ...(portType === 'dwdm' ? { spectrum: { gridType: gridType as 'fixed-50ghz' | 'fixed-100ghz' | 'flex-grid', allocations: [] } } : {}),
  };

  // Apply pre-allocated channels from used_channels column
  const usedChannels = (VALUE_TRANSFORMERS.toChannelList(row['used_channels'] || '') as number[]) || [];
  if (portType === 'dwdm' && usedChannels.length > 0 && port.spectrum) {
    port.spectrum.allocations = usedChannels.map((ch) => ({
      id: generateId(),
      channelNumber: ch,
      status: 'allocated' as const,
      label: 'Pre-allocated (import)',
    }));
  }

  return { nodeName, port };
}

/**
 * Run the full import pipeline for nodes, edges, services, and ports.
 *
 * @param nodesCsv - Raw CSV content for nodes (can be empty string if not provided)
 * @param edgesCsv - Raw CSV content for edges (can be empty string if not provided)
 * @param source - Import source identifier
 * @param servicesCsv - Raw CSV content for services (can be empty string if not provided)
 * @param existingNodeNameToId - Map of existing topology node names to IDs
 * @param portsCsv - Raw CSV content for ports (can be empty string if not provided)
 * @returns Import result with validated, transformed nodes, edges, services, and ports
 */
export function runImport(
  nodesCsv: string,
  edgesCsv: string,
  source: ImportSource = 'huawei-nce',
  servicesCsv: string = '',
  existingNodeNameToId?: Map<string, string>,
  portsCsv: string = '',
): ImportResult {
  const nodeTemplate = getTemplate(source, 'nodes');
  const edgeTemplate = getTemplate(source, 'edges');

  // Parse nodes
  const parsedNodes = nodesCsv ? parseCsv(nodesCsv) : { headers: [], rows: [], rawRowCount: 0 };
  const parsedEdges = edgesCsv ? parseCsv(edgesCsv) : { headers: [], rows: [], rawRowCount: 0 };

  // Validate nodes
  const nodeResults: ImportRowValidation[] = [];
  if (nodeTemplate) {
    for (let i = 0; i < parsedNodes.rows.length; i++) {
      nodeResults.push(validateRow(parsedNodes.rows[i], nodeTemplate.columns, i + 1));
    }
  }

  // Transform valid nodes and build name → ID map
  const nodes: NetworkNode[] = [];
  const nodeNameToId = new Map<string, string>();

  for (let i = 0; i < parsedNodes.rows.length; i++) {
    const validation = nodeResults[i];
    if (validation && !validation.valid) continue;

    const node = transformToNode(parsedNodes.rows[i], nodeTemplate!);
    nodes.push(node);

    // Map CSV node name (case-insensitive) → generated UUID
    const csvName = parsedNodes.rows[i]['node_name'] || '';
    if (csvName) {
      nodeNameToId.set(csvName.toLowerCase(), node.id);
    }
  }

  // Merge existing topology nodes (CSV takes precedence)
  if (existingNodeNameToId) {
    for (const [name, id] of existingNodeNameToId) {
      if (!nodeNameToId.has(name)) {
        nodeNameToId.set(name, id);
      }
    }
  }

  // Auto-layout nodes in a grid if they have no geo coordinates
  layoutNodes(nodes);

  // ==========================================================================
  // Process ports CSV (add/update ports on nodes)
  // ==========================================================================
  const portTemplate = getTemplate(source, 'ports');
  const parsedPorts = portsCsv ? parseCsv(portsCsv) : { headers: [], rows: [], rawRowCount: 0 };
  const portResults: ImportRowValidation[] = [];
  let portsApplied = 0;

  if (portTemplate && parsedPorts.rows.length > 0) {
    // Build a quick-lookup from node name (lowercase) to node object
    const nodeByName = new Map<string, NetworkNode>();
    for (const node of nodes) {
      nodeByName.set(node.name.toLowerCase(), node);
    }

    for (let i = 0; i < parsedPorts.rows.length; i++) {
      const rowValidation = validateRow(parsedPorts.rows[i], portTemplate.columns, i + 1);

      // Additional port-specific validation: node_name must exist
      const nodeName = (parsedPorts.rows[i]['node_name'] || '').trim();
      if (nodeName && !nodeNameToId.has(nodeName.toLowerCase())) {
        rowValidation.errors.push(`Row ${i + 1}: Node "${nodeName}" not found`);
        rowValidation.valid = false;
      }

      // Validate port_type
      const portTypeRaw = (parsedPorts.rows[i]['port_type'] || '').trim().toLowerCase();
      if (portTypeRaw && !['dwdm', 'wdm', 'lambda', 'optical', 'bw', 'bandwidth', 'ethernet', 'eth'].includes(portTypeRaw)) {
        rowValidation.warnings.push(`Row ${i + 1}: Unknown port_type "${parsedPorts.rows[i]['port_type']}", defaulting to "bw"`);
      }

      portResults.push(rowValidation);

      if (!rowValidation.valid) continue;

      // Transform and apply
      const result = transformToPort(parsedPorts.rows[i]);
      if (!result) continue;

      const targetNode = nodeByName.get(result.nodeName.toLowerCase());
      if (!targetNode) continue;

      // Ensure node has a ports array
      if (!targetNode.ports) {
        targetNode.ports = [];
      }

      // Find existing port by name match
      const existingPortIndex = targetNode.ports.findIndex(
        (p) => p.name.toLowerCase() === result.port.name.toLowerCase()
      );

      if (existingPortIndex >= 0) {
        // Update existing port (preserve id and status)
        const existing = targetNode.ports[existingPortIndex];
        targetNode.ports[existingPortIndex] = {
          ...result.port,
          id: existing.id,
          status: existing.status,
          connectedEdgeId: existing.connectedEdgeId,
        };
      } else {
        // Add new port
        targetNode.ports.push(result.port);
      }
      portsApplied++;
    }
  }

  // Validate edges
  const edgeResults: ImportRowValidation[] = [];
  if (edgeTemplate) {
    for (let i = 0; i < parsedEdges.rows.length; i++) {
      const rowValidation = validateRow(parsedEdges.rows[i], edgeTemplate.columns, i + 1);

      // Additional edge-specific validation: check node references exist
      const sourceName = (parsedEdges.rows[i]['source_node'] || '').toLowerCase();
      const targetName = (parsedEdges.rows[i]['target_node'] || '').toLowerCase();

      if (sourceName && !nodeNameToId.has(sourceName)) {
        rowValidation.errors.push(`Row ${i + 1}: Source node "${parsedEdges.rows[i]['source_node']}" not found`);
        rowValidation.valid = false;
      }
      if (targetName && !nodeNameToId.has(targetName)) {
        rowValidation.errors.push(`Row ${i + 1}: Target node "${parsedEdges.rows[i]['target_node']}" not found`);
        rowValidation.valid = false;
      }

      edgeResults.push(rowValidation);
    }
  }

  // Transform valid edges
  const edges: NetworkEdge[] = [];
  for (let i = 0; i < parsedEdges.rows.length; i++) {
    const validation = edgeResults[i];
    if (validation && !validation.valid) continue;

    const edge = transformToEdge(parsedEdges.rows[i], edgeTemplate!, nodeNameToId);
    if (edge) {
      edges.push(edge);
    }
  }

  // ==========================================================================
  // Process services
  // ==========================================================================
  const serviceTemplate = getTemplate(source, 'services');
  const parsedServices = servicesCsv ? parseCsv(servicesCsv) : { headers: [], rows: [], rawRowCount: 0 };

  // Build edge lookup: for each pair of adjacent nodes, find the edge ID
  const edgeLookup = new Map<string, string>();
  for (const edge of edges) {
    const key1 = `${edge.source.nodeId}:${edge.target.nodeId}`;
    const key2 = `${edge.target.nodeId}:${edge.source.nodeId}`;
    edgeLookup.set(key1, edge.id);
    edgeLookup.set(key2, edge.id);
  }

  // Validate service rows
  const serviceResults: ImportRowValidation[] = [];
  if (serviceTemplate) {
    for (let i = 0; i < parsedServices.rows.length; i++) {
      const rowValidation = validateRow(parsedServices.rows[i], serviceTemplate.columns, i + 1);

      // Additional service-specific validation
      const svcErrors = validateServiceRow(parsedServices.rows[i], nodeNameToId, i + 1);
      rowValidation.errors.push(...svcErrors.errors);
      rowValidation.warnings.push(...svcErrors.warnings);
      if (svcErrors.errors.length > 0) {
        rowValidation.valid = false;
      }

      serviceResults.push(rowValidation);
    }
  }

  // Transform valid service rows into Service objects
  const services: Service[] = [];
  const protectionPairs = new Map<string, { working?: number; protection?: number }>();

  // First pass: identify protection pairs
  for (let i = 0; i < parsedServices.rows.length; i++) {
    const validation = serviceResults[i];
    if (validation && !validation.valid) continue;
    const row = parsedServices.rows[i];
    const pairId = row['protection_pair_id']?.trim();
    const role = (VALUE_TRANSFORMERS.toServiceRole(row['service_role'] || '') as ServiceRole) || 'working';
    if (pairId) {
      const pair = protectionPairs.get(pairId) || {};
      if (role === 'working') pair.working = i;
      else pair.protection = i;
      protectionPairs.set(pairId, pair);
    }
  }

  // Validate protection pair consistency
  for (const [pairId, pair] of protectionPairs) {
    if (pair.working === undefined) {
      // Find the protection row and add a warning
      if (pair.protection !== undefined) {
        const result = serviceResults[pair.protection];
        if (result) {
          result.warnings.push(`Protection pair "${pairId}": no working service found`);
        }
      }
    }
    if (pair.protection === undefined) {
      if (pair.working !== undefined) {
        const result = serviceResults[pair.working];
        if (result) {
          result.warnings.push(`Protection pair "${pairId}": no protection service found`);
        }
      }
    }
  }

  // Second pass: transform services
  for (let i = 0; i < parsedServices.rows.length; i++) {
    const validation = serviceResults[i];
    if (validation && !validation.valid) continue;

    const service = transformToService(
      parsedServices.rows[i],
      serviceTemplate!,
      nodeNameToId,
      edgeLookup,
      edges,
    );
    if (service) {
      services.push(service);
    }
  }

  // Build validation results
  const nodeValidation: ImportValidationResult = {
    source,
    fileType: 'nodes',
    totalRows: parsedNodes.rawRowCount,
    validRows: nodes.length,
    invalidRows: parsedNodes.rows.length - nodes.length,
    rowResults: nodeResults,
    warnings: nodeResults.flatMap((r) => r.warnings),
  };

  const edgeValidation: ImportValidationResult = {
    source,
    fileType: 'edges',
    totalRows: parsedEdges.rawRowCount,
    validRows: edges.length,
    invalidRows: parsedEdges.rows.length - edges.length,
    rowResults: edgeResults,
    warnings: edgeResults.flatMap((r) => r.warnings),
  };

  const serviceValidation: ImportValidationResult = {
    source,
    fileType: 'services',
    totalRows: parsedServices.rawRowCount,
    validRows: services.length,
    invalidRows: parsedServices.rows.length - services.length,
    rowResults: serviceResults,
    warnings: serviceResults.flatMap((r) => r.warnings),
  };

  const portValidation: ImportValidationResult = {
    source,
    fileType: 'ports',
    totalRows: parsedPorts.rawRowCount,
    validRows: portsApplied,
    invalidRows: parsedPorts.rows.length - portsApplied,
    rowResults: portResults,
    warnings: portResults.flatMap((r) => r.warnings),
  };

  return { nodes, edges, services, nodeValidation, edgeValidation, serviceValidation, portValidation, nodeNameToId };
}

/**
 * Resolve a semicolon-separated list of node names to ordered node IDs.
 * Returns the list of node IDs and corresponding edge IDs along the path.
 */
function resolvePathNodes(
  pathNodesStr: string,
  nodeNameToId: Map<string, string>,
  edgeLookup: Map<string, string>,
  edges: NetworkEdge[],
): { nodeIds: string[]; edgeIds: string[]; totalDistance: number } | null {
  if (!pathNodesStr || pathNodesStr.trim() === '') return null;

  const names = pathNodesStr.split(';').map((n) => n.trim()).filter(Boolean);
  if (names.length < 2) return null;

  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  let totalDistance = 0;

  for (const name of names) {
    const nodeId = nodeNameToId.get(name.toLowerCase());
    if (!nodeId) return null; // node not found
    nodeIds.push(nodeId);
  }

  // Find edges between consecutive nodes
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const key = `${nodeIds[i]}:${nodeIds[i + 1]}`;
    const edgeId = edgeLookup.get(key);
    if (edgeId) {
      edgeIds.push(edgeId);
      const edge = edges.find((e) => e.id === edgeId);
      totalDistance += edge?.properties.distance ?? 0;
    }
    // If edge not found, still include the path but with missing edge
  }

  return { nodeIds, edgeIds, totalDistance };
}

/**
 * Transform a parsed CSV row into a Service object.
 */
function transformToService(
  row: Record<string, string>,
  _template: ImportTemplate,
  nodeNameToId: Map<string, string>,
  edgeLookup: Map<string, string>,
  edges: NetworkEdge[],
): Service | null {
  const toServiceType = VALUE_TRANSFORMERS.toServiceType;
  const toProtectionScheme = VALUE_TRANSFORMERS.toProtectionScheme;
  const toNumber = VALUE_TRANSFORMERS.toNumber;

  const serviceType = (toServiceType(row['service_type'] || '') as ServiceType) || 'l1-dwdm';
  const protectionScheme = (toProtectionScheme(row['protection'] || '') as ProtectionScheme) || 'none';
  const channelNumber = toNumber(row['channel_number'] || '') as number | undefined;

  // Lambda frequency → channel derivation
  const toFrequency = VALUE_TRANSFORMERS.toFrequency;
  const lambdaFrequency = toFrequency ? (toFrequency(row['lambda_frequency'] || '') as number | undefined) : undefined;
  let resolvedChannel = channelNumber;
  if (resolvedChannel === undefined && lambdaFrequency !== undefined) {
    const ituCh = frequencyToChannelNumber(lambdaFrequency, 'fixed-50ghz');
    resolvedChannel = ituToUserChannel(ituCh, 'fixed-50ghz');
  }

  const sourceName = row['source_node'] || '';
  const destName = row['destination_node'] || '';
  const sourceId = nodeNameToId.get(sourceName.toLowerCase());
  const destId = nodeNameToId.get(destName.toLowerCase());

  if (!sourceId || !destId) return null;

  // Resolve working path from explicit node list or fallback to direct source→dest
  const workingPathStr = row['working_path_nodes'] || '';
  const protectionPathStr = row['protection_path_nodes'] || '';

  let workingPathResolved = resolvePathNodes(workingPathStr, nodeNameToId, edgeLookup, edges);
  if (!workingPathResolved) {
    // Fallback: direct source → destination
    const directEdgeKey = `${sourceId}:${destId}`;
    const directEdgeId = edgeLookup.get(directEdgeKey);
    const directEdge = directEdgeId ? edges.find((e) => e.id === directEdgeId) : undefined;
    workingPathResolved = {
      nodeIds: [sourceId, destId],
      edgeIds: directEdgeId ? [directEdgeId] : [],
      totalDistance: directEdge?.properties.distance ?? 0,
    };
  }

  const workingPath: ServicePath = {
    id: generateId(),
    type: 'working',
    nodeIds: workingPathResolved.nodeIds,
    edgeIds: workingPathResolved.edgeIds,
    channelNumber: resolvedChannel,
    totalDistance: workingPathResolved.totalDistance,
    hopCount: workingPathResolved.nodeIds.length - 1,
    status: 'computed',
  };

  let protectionPath: ServicePath | undefined;
  const protectionPathResolved = resolvePathNodes(protectionPathStr, nodeNameToId, edgeLookup, edges);
  if (protectionPathResolved) {
    protectionPath = {
      id: generateId(),
      type: 'protection',
      nodeIds: protectionPathResolved.nodeIds,
      edgeIds: protectionPathResolved.edgeIds,
      channelNumber: resolvedChannel,
      totalDistance: protectionPathResolved.totalDistance,
      hopCount: protectionPathResolved.nodeIds.length - 1,
      status: 'computed',
    };
  }

  const dataRate = row['data_rate'] || '100G';
  const modulation = row['modulation'] || 'DP-QPSK';
  const transceiver = row['transceiver'] || undefined;

  if (serviceType === 'l1-dwdm') {
    const service: Omit<L1DWDMService, 'id' | 'createdAt' | 'modifiedAt'> = {
      name: row['service_name'] || 'Unnamed Service',
      type: 'l1-dwdm',
      status: 'planned',
      sourceNodeId: sourceId,
      sourcePortId: '',
      destinationNodeId: destId,
      destinationPortId: '',
      dataRate: dataRate as L1DWDMService['dataRate'],
      modulationType: modulation as L1DWDMService['modulationType'],
      channelWidth: '50GHz',
      wavelengthMode: 'continuous',
      channelNumber: resolvedChannel,
      transceiverTypeId: transceiver,
      workingPath,
      protectionPath,
      protectionScheme,
      restorationEnabled: protectionScheme === 'wson-restoration' || protectionScheme === '1+1+wson',
      metadata: { importedFrom: 'huawei-nce' },
    };
    // Return as a full service object with a generated ID and timestamps
    return {
      ...service,
      id: generateId(),
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    } as L1DWDMService;
  } else {
    // L2/L3 services — create a simplified service (no underlay for import)
    const service: Omit<L2L3Service, 'id' | 'createdAt' | 'modifiedAt'> = {
      name: row['service_name'] || 'Unnamed Service',
      type: serviceType as L2L3Service['type'],
      status: 'planned',
      sourceNodeId: sourceId,
      sourcePortId: '',
      destinationNodeId: destId,
      destinationPortId: '',
      dataRate: dataRate as L2L3Service['dataRate'],
      underlayServiceId: '', // No underlay auto-created during import
      underlayAutoCreated: false,
      protectionScheme: 'none',
      bfdConfig: { enabled: false, minTxInterval: 300000, minRxInterval: 300000, multiplier: 3 },
      metadata: { importedFrom: 'huawei-nce' },
    };
    return {
      ...service,
      id: generateId(),
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    } as L2L3Service;
  }
}

/**
 * Auto-layout nodes in a grid pattern for schematic view.
 * Nodes with geo coordinates get those set as position;
 * nodes without get placed in a grid.
 */
function layoutNodes(nodes: NetworkNode[]): void {
  const GRID_SPACING = 250;
  const COLS = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));

  let gridIndex = 0;
  for (const node of nodes) {
    const hasGeo = node.location?.latitude != null && node.location?.longitude != null;
    if (!hasGeo) {
      const col = gridIndex % COLS;
      const row = Math.floor(gridIndex / COLS);
      node.position = { x: col * GRID_SPACING + 100, y: row * GRID_SPACING + 100 };
      gridIndex++;
    } else {
      // For geo-referenced nodes, set a reasonable schematic position too
      node.position = {
        x: ((node.location!.longitude! + 180) / 360) * 2000,
        y: ((90 - node.location!.latitude!) / 180) * 2000,
      };
    }
  }
}

/**
 * Collect node references that don't exist in the nodeNameToId map.
 * Groups by original value with row numbers and source context.
 */
export function collectUnmatchedReferences(
  edgeRows: Record<string, string>[],
  serviceRows: Record<string, string>[],
  nodeNameToId: Map<string, string>,
): Map<string, { rowNumbers: number[]; fileType: 'edges' | 'services'; fieldName: string }> {
  const unmatched = new Map<string, { rowNumbers: number[]; fileType: 'edges' | 'services'; fieldName: string }>();

  const checkRef = (
    value: string,
    rowNumber: number,
    fileType: 'edges' | 'services',
    fieldName: string,
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (nodeNameToId.has(trimmed.toLowerCase())) return;

    const key = `${fileType}:${fieldName}:${trimmed}`;
    const existing = unmatched.get(key);
    if (existing) {
      existing.rowNumbers.push(rowNumber);
    } else {
      unmatched.set(key, { rowNumbers: [rowNumber], fileType, fieldName });
    }
  };

  // Check edge references
  for (let i = 0; i < edgeRows.length; i++) {
    const row = edgeRows[i];
    checkRef(row['source_node'] || '', i + 1, 'edges', 'source_node');
    checkRef(row['target_node'] || '', i + 1, 'edges', 'target_node');
  }

  // Check service references
  for (let i = 0; i < serviceRows.length; i++) {
    const row = serviceRows[i];
    checkRef(row['source_node'] || '', i + 1, 'services', 'source_node');
    checkRef(row['destination_node'] || '', i + 1, 'services', 'destination_node');

    // Check path node references
    const workingPath = (row['working_path_nodes'] || '').trim();
    if (workingPath) {
      for (const name of workingPath.split(';').map((n) => n.trim()).filter(Boolean)) {
        checkRef(name, i + 1, 'services', 'working_path_nodes');
      }
    }
    const protPath = (row['protection_path_nodes'] || '').trim();
    if (protPath) {
      for (const name of protPath.split(';').map((n) => n.trim()).filter(Boolean)) {
        checkRef(name, i + 1, 'services', 'protection_path_nodes');
      }
    }
  }

  return unmatched;
}
