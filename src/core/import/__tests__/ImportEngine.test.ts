import { describe, it, expect } from 'vitest';
import { runImport, allocatePortsOnEdges } from '../ImportEngine';

describe('ImportEngine', () => {
  const sampleNodesCsv = [
    'node_name,node_type,vendor,model,latitude,longitude,address,subtype,size_flavor',
    'OADM-Cairo-01,OADM,Huawei,OptiX OSN 9800,30.0444,31.2357,Cairo DC,roadm,medium',
    'Router-Alex-01,Router,Huawei,NE40E-X16,31.2001,29.9187,Alex POP,core,large',
    'AMP-Nile-01,EDFA,Huawei,OSN 8800,30.5500,30.6000,Nile Repeater,,small',
  ].join('\n');

  const sampleEdgesCsv = [
    'edge_name,source_node,target_node,distance_km,fiber_profile,fiber_count,srlg_codes',
    'Link-Cairo-Alex,OADM-Cairo-01,Router-Alex-01,220,G.652.D,48,SRLG-NILE-DELTA',
    'Link-Cairo-AMP,OADM-Cairo-01,AMP-Nile-01,110,G.652.D,24,SRLG-NILE-ROUTE',
  ].join('\n');

  it('should parse and transform nodes with unique UUIDs', () => {
    const result = runImport(sampleNodesCsv, '', 'huawei-nce');

    expect(result.nodes).toHaveLength(3);

    // All nodes should have unique IDs
    const ids = result.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(3);

    // Check node properties
    const oadm = result.nodes.find((n) => n.name === 'OADM-Cairo-01');
    expect(oadm).toBeDefined();
    expect(oadm!.type).toBe('oadm');
    expect(oadm!.vendor).toBe('huawei');
    expect(oadm!.location?.latitude).toBeCloseTo(30.0444);
    expect(oadm!.location?.longitude).toBeCloseTo(31.2357);

    const router = result.nodes.find((n) => n.name === 'Router-Alex-01');
    expect(router).toBeDefined();
    expect(router!.type).toBe('router');
    expect(router!.sizeFlavor).toBe('large');

    const amp = result.nodes.find((n) => n.name === 'AMP-Nile-01');
    expect(amp).toBeDefined();
    expect(amp!.type).toBe('amplifier');
  });

  it('should resolve node name references in edges', () => {
    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce');

    expect(result.edges).toHaveLength(2);

    // Edge source/target should reference the generated node UUIDs
    const link1 = result.edges.find((e) => e.name === 'Link-Cairo-Alex');
    expect(link1).toBeDefined();

    const oadmId = result.nodeNameToId.get('oadm-cairo-01');
    const routerId = result.nodeNameToId.get('router-alex-01');
    expect(link1!.source.nodeId).toBe(oadmId);
    expect(link1!.target.nodeId).toBe(routerId);

    // Check edge properties
    expect(link1!.properties.distance).toBe(220);
    expect(link1!.properties.fiberProfile?.profileType).toBe('G.652.D');
    expect(link1!.properties.fiberCount).toBe(48);
  });

  it('should build nodeNameToId map correctly', () => {
    const result = runImport(sampleNodesCsv, '', 'huawei-nce');

    expect(result.nodeNameToId.size).toBe(3);
    // Map keys should be lowercase
    expect(result.nodeNameToId.has('oadm-cairo-01')).toBe(true);
    expect(result.nodeNameToId.has('router-alex-01')).toBe(true);
    expect(result.nodeNameToId.has('amp-nile-01')).toBe(true);
  });

  it('should generate validation results', () => {
    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce');

    expect(result.nodeValidation.source).toBe('huawei-nce');
    expect(result.nodeValidation.fileType).toBe('nodes');
    expect(result.nodeValidation.validRows).toBe(3);
    expect(result.nodeValidation.invalidRows).toBe(0);

    expect(result.edgeValidation.source).toBe('huawei-nce');
    expect(result.edgeValidation.fileType).toBe('edges');
    expect(result.edgeValidation.validRows).toBe(2);
    expect(result.edgeValidation.invalidRows).toBe(0);
  });

  it('should report errors for edges referencing non-existent nodes', () => {
    const badEdgesCsv = [
      'edge_name,source_node,target_node,distance_km',
      'Link-Bad,NonExistentNode,AlsoNonExistent,100',
    ].join('\n');

    const result = runImport(sampleNodesCsv, badEdgesCsv, 'huawei-nce');

    expect(result.edgeValidation.invalidRows).toBe(1);
    expect(result.edges).toHaveLength(0);

    const edgeErrors = result.edgeValidation.rowResults[0].errors;
    expect(edgeErrors.some((e) => e.includes('not found'))).toBe(true);
  });

  it('should handle empty CSV inputs gracefully', () => {
    const result = runImport('', '', 'huawei-nce');

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.nodeValidation.totalRows).toBe(0);
    expect(result.edgeValidation.totalRows).toBe(0);
  });

  it('should assign default ports to imported nodes', () => {
    const result = runImport(sampleNodesCsv, '', 'huawei-nce');

    const oadm = result.nodes.find((n) => n.name === 'OADM-Cairo-01');
    expect(oadm!.ports).toBeDefined();
    expect(oadm!.ports!.length).toBeGreaterThan(0);

    // OADM should have DWDM ports
    const dwdmPorts = oadm!.ports!.filter((p) => p.type === 'dwdm');
    expect(dwdmPorts.length).toBeGreaterThan(0);

    // Amplifier should have IN/OUT ports
    const amp = result.nodes.find((n) => n.name === 'AMP-Nile-01');
    expect(amp!.ports).toBeDefined();
    const portNames = amp!.ports!.map((p) => p.name);
    expect(portNames).toContain('IN');
    expect(portNames).toContain('OUT');
  });

  it('should set default stacks based on node type', () => {
    const result = runImport(sampleNodesCsv, '', 'huawei-nce');

    const router = result.nodes.find((n) => n.name === 'Router-Alex-01');
    expect(router!.stacks.some((s) => s.layer === 'ip')).toBe(true);

    const oadm = result.nodes.find((n) => n.name === 'OADM-Cairo-01');
    expect(oadm!.stacks.some((s) => s.layer === 'dwdm')).toBe(true);
  });

  it('should set edge type to fiber and state to active', () => {
    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce');

    for (const edge of result.edges) {
      expect(edge.type).toBe('fiber');
      expect(edge.state).toBe('active');
    }
  });

  it('should handle SRLG codes in edges', () => {
    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce');

    const link1 = result.edges.find((e) => e.name === 'Link-Cairo-Alex');
    expect(link1!.properties.srlgCodes).toEqual(['SRLG-NILE-DELTA']);

    const link2 = result.edges.find((e) => e.name === 'Link-Cairo-AMP');
    expect(link2!.properties.srlgCodes).toEqual(['SRLG-NILE-ROUTE']);
  });

  it('should assign positions to nodes (grid layout)', () => {
    const noGeoCsv = [
      'node_name,node_type',
      'Node-A,router',
      'Node-B,oadm',
      'Node-C,amplifier',
    ].join('\n');

    const result = runImport(noGeoCsv, '', 'huawei-nce');

    // All nodes should have non-zero positions (grid layout)
    for (const node of result.nodes) {
      expect(node.position.x).toBeGreaterThanOrEqual(0);
      expect(node.position.y).toBeGreaterThanOrEqual(0);
    }

    // Positions should be different
    const positions = result.nodes.map((n) => `${n.position.x},${n.position.y}`);
    expect(new Set(positions).size).toBe(3);
  });

  describe('existingNodeNameToId parameter', () => {
    it('should resolve edge references against existing topology nodes', () => {
      // Edges-only import: no nodes CSV, but existing topology has the nodes
      const existingMap = new Map<string, string>([
        ['oadm-cairo-01', 'existing-id-1'],
        ['router-alex-01', 'existing-id-2'],
      ]);

      const edgesCsv = [
        'edge_name,source_node,target_node,distance_km,fiber_profile',
        'Link-1,OADM-Cairo-01,Router-Alex-01,220,G.652.D',
      ].join('\n');

      const result = runImport('', edgesCsv, 'huawei-nce', '', existingMap);

      // Edge should resolve successfully using existing topology nodes
      expect(result.edgeValidation.invalidRows).toBe(0);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source.nodeId).toBe('existing-id-1');
      expect(result.edges[0].target.nodeId).toBe('existing-id-2');
    });

    it('should give CSV nodes precedence over existing topology nodes', () => {
      const existingMap = new Map<string, string>([
        ['oadm-cairo-01', 'old-existing-id'],
      ]);

      // CSV also defines OADM-Cairo-01 — CSV should take precedence
      const nodesCsv = [
        'node_name,node_type',
        'OADM-Cairo-01,OADM',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', existingMap);

      // The nodeNameToId should have the CSV-generated ID, not the existing one
      const csvNodeId = result.nodes[0].id;
      expect(result.nodeNameToId.get('oadm-cairo-01')).toBe(csvNodeId);
      expect(result.nodeNameToId.get('oadm-cairo-01')).not.toBe('old-existing-id');
    });

    it('should merge existing nodes into nodeNameToId without overwriting CSV entries', () => {
      const existingMap = new Map<string, string>([
        ['oadm-cairo-01', 'existing-id-1'],
        ['extra-node', 'existing-id-extra'],
      ]);

      const nodesCsv = [
        'node_name,node_type',
        'OADM-Cairo-01,OADM',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', existingMap);

      // CSV node takes precedence
      expect(result.nodeNameToId.get('oadm-cairo-01')).toBe(result.nodes[0].id);
      // Existing-only node is also available
      expect(result.nodeNameToId.get('extra-node')).toBe('existing-id-extra');
      expect(result.nodeNameToId.size).toBe(2);
    });

    it('should resolve service references against existing topology nodes', () => {
      const existingMap = new Map<string, string>([
        ['node-a', 'existing-a'],
        ['node-b', 'existing-b'],
      ]);

      const servicesCsv = [
        'service_name,service_type,source_node,destination_node,data_rate',
        'Svc-1,l1-dwdm,Node-A,Node-B,100G',
      ].join('\n');

      const result = runImport('', '', 'huawei-nce', servicesCsv, existingMap);

      // Service should resolve successfully
      expect(result.serviceValidation.invalidRows).toBe(0);
      expect(result.services).toHaveLength(1);
      expect(result.services[0].sourceNodeId).toBe('existing-a');
      expect(result.services[0].destinationNodeId).toBe('existing-b');
    });

    it('should still report errors when node is not in CSV or existing topology', () => {
      const existingMap = new Map<string, string>([
        ['node-a', 'existing-a'],
      ]);

      const edgesCsv = [
        'edge_name,source_node,target_node,distance_km',
        'Link-1,Node-A,Unknown-Node,100',
      ].join('\n');

      const result = runImport('', edgesCsv, 'huawei-nce', '', existingMap);

      // Node-A resolves, Unknown-Node does not
      expect(result.edgeValidation.invalidRows).toBe(1);
      expect(result.edges).toHaveLength(0);
      const errors = result.edgeValidation.rowResults[0].errors;
      expect(errors.some((e) => e.includes('Unknown-Node') && e.includes('not found'))).toBe(true);
    });
  });

  // ==========================================================================
  // Phase 1: DWDM Spectrum Initialization
  // ==========================================================================
  describe('DWDM spectrum initialization', () => {
    it('should initialize spectrum on OADM DWDM ports', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce');
      const oadm = result.nodes[0];
      const dwdmPorts = oadm.ports.filter((p) => p.type === 'dwdm');

      expect(dwdmPorts.length).toBeGreaterThan(0);
      for (const port of dwdmPorts) {
        expect(port.spectrum).toBeDefined();
        expect(port.spectrum!.gridType).toBe('fixed-50ghz');
        expect(port.spectrum!.allocations).toEqual([]);
      }
    });

    it('should initialize spectrum on router Line-* ports but not on Eth-* ports', () => {
      const nodesCsv = [
        'node_name,node_type',
        'Router-A,Router',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce');
      const router = result.nodes[0];

      const linePorts = router.ports.filter((p) => p.name.startsWith('Line-'));
      const ethPorts = router.ports.filter((p) => p.name.startsWith('Eth-'));

      expect(linePorts.length).toBeGreaterThan(0);
      expect(ethPorts.length).toBeGreaterThan(0);

      for (const port of linePorts) {
        expect(port.type).toBe('dwdm');
        expect(port.spectrum).toBeDefined();
        expect(port.spectrum!.gridType).toBe('fixed-50ghz');
        expect(port.spectrum!.allocations).toEqual([]);
      }

      for (const port of ethPorts) {
        expect(port.type).toBe('bw');
        expect(port.spectrum).toBeUndefined();
      }
    });

    it('should initialize spectrum on amplifier ports', () => {
      const nodesCsv = [
        'node_name,node_type',
        'AMP-A,EDFA',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce');
      const amp = result.nodes[0];

      expect(amp.ports.length).toBe(2);
      for (const port of amp.ports) {
        expect(port.type).toBe('dwdm');
        expect(port.spectrum).toBeDefined();
        expect(port.spectrum!.gridType).toBe('fixed-50ghz');
        expect(port.spectrum!.allocations).toEqual([]);
      }
    });

    it('should NOT initialize spectrum on BW-type ports', () => {
      const nodesCsv = [
        'node_name,node_type',
        'Switch-A,Switch',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce');
      const sw = result.nodes[0];

      // Switch has all BW ports
      for (const port of sw.ports) {
        expect(port.type).toBe('bw');
        expect(port.spectrum).toBeUndefined();
      }
    });
  });

  // ==========================================================================
  // Phase 2: Edge Port Allocation (decoupled from transformToEdge)
  // ==========================================================================
  describe('edge port allocation', () => {
    it('should NOT auto-allocate ports during runImport (ports are undefined)', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
        'OADM-B,OADM',
      ].join('\n');

      const edgesCsv = [
        'edge_name,source_node,target_node,distance_km',
        'Link-AB,OADM-A,OADM-B,100',
      ].join('\n');

      const result = runImport(nodesCsv, edgesCsv, 'huawei-nce');
      const edge = result.edges[0];

      // Port allocation is decoupled — transformToEdge no longer auto-assigns
      expect(edge.source.portId).toBeUndefined();
      expect(edge.target.portId).toBeUndefined();
    });

    it('should store explicit port names in metadata when source_port/target_port provided', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
        'OADM-B,OADM',
      ].join('\n');

      const edgesCsv = [
        'edge_name,source_node,target_node,distance_km,source_port,target_port',
        'Link-AB,OADM-A,OADM-B,100,Line-1,Line-2',
      ].join('\n');

      const result = runImport(nodesCsv, edgesCsv, 'huawei-nce');
      const edge = result.edges[0];

      // Port names stored in metadata for later allocation
      expect(edge.metadata?._sourcePortName).toBe('Line-1');
      expect(edge.metadata?._targetPortName).toBe('Line-2');
      // But no portId assigned yet
      expect(edge.source.portId).toBeUndefined();
      expect(edge.target.portId).toBeUndefined();
    });
  });

  // ==========================================================================
  // allocatePortsOnEdges() — separate opt-in function
  // ==========================================================================
  describe('allocatePortsOnEdges', () => {
    it('should allocate DWDM Line-* ports when edges have no portId', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
        'OADM-B,OADM',
      ].join('\n');

      const edgesCsv = [
        'edge_name,source_node,target_node,distance_km',
        'Link-AB,OADM-A,OADM-B,100',
      ].join('\n');

      const result = runImport(nodesCsv, edgesCsv, 'huawei-nce');
      const { updatedEdges, updatedNodes, allocations } = allocatePortsOnEdges(
        result.edges,
        result.nodes,
      );

      expect(updatedEdges[0].source.portId).toBeDefined();
      expect(updatedEdges[0].target.portId).toBeDefined();
      expect(updatedNodes.length).toBeGreaterThan(0);
      expect(allocations).toHaveLength(1);
      expect(allocations[0].sourcePortName).toMatch(/^Line-/);
      expect(allocations[0].targetPortName).toMatch(/^Line-/);
    });

    it('should resolve explicit port names from metadata', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
        'OADM-B,OADM',
      ].join('\n');

      const edgesCsv = [
        'edge_name,source_node,target_node,distance_km,source_port,target_port',
        'Link-AB,OADM-A,OADM-B,100,Line-1,Line-2',
      ].join('\n');

      const result = runImport(nodesCsv, edgesCsv, 'huawei-nce');
      const { updatedEdges, allocations } = allocatePortsOnEdges(
        result.edges,
        result.nodes,
      );

      expect(updatedEdges[0].source.portId).toBeDefined();
      expect(updatedEdges[0].target.portId).toBeDefined();
      expect(allocations[0].sourcePortName).toBe('Line-1');
      expect(allocations[0].targetPortName).toBe('Line-2');
      // Temporary metadata should be cleaned up
      expect(updatedEdges[0].metadata?._sourcePortName).toBeUndefined();
      expect(updatedEdges[0].metadata?._targetPortName).toBeUndefined();
    });

    it('should allocate different ports for multiple edges to the same node', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
        'OADM-B,OADM',
        'OADM-C,OADM',
      ].join('\n');

      const edgesCsv = [
        'edge_name,source_node,target_node,distance_km',
        'Link-AB,OADM-A,OADM-B,100',
        'Link-AC,OADM-A,OADM-C,200',
      ].join('\n');

      const result = runImport(nodesCsv, edgesCsv, 'huawei-nce');
      const { updatedEdges } = allocatePortsOnEdges(result.edges, result.nodes);

      expect(updatedEdges).toHaveLength(2);
      expect(updatedEdges[0].source.portId).toBeDefined();
      expect(updatedEdges[1].source.portId).toBeDefined();
      expect(updatedEdges[0].source.portId).not.toBe(updatedEdges[1].source.portId);
    });

    it('should return undefined portId when no DWDM ports are available', () => {
      const nodesCsv = [
        'node_name,node_type',
        'Switch-A,Switch',
        'Switch-B,Switch',
      ].join('\n');

      const edgesCsv = [
        'edge_name,source_node,target_node,distance_km',
        'Link-AB,Switch-A,Switch-B,10',
      ].join('\n');

      const result = runImport(nodesCsv, edgesCsv, 'huawei-nce');
      const { updatedEdges } = allocatePortsOnEdges(result.edges, result.nodes);

      expect(updatedEdges[0].source.portId).toBeUndefined();
      expect(updatedEdges[0].target.portId).toBeUndefined();
    });

    it('should only include modified nodes in updatedNodes', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
        'OADM-B,OADM',
        'OADM-C,OADM',
      ].join('\n');

      // Only one edge: OADM-A → OADM-B. OADM-C should not appear in updatedNodes.
      const edgesCsv = [
        'edge_name,source_node,target_node,distance_km',
        'Link-AB,OADM-A,OADM-B,100',
      ].join('\n');

      const result = runImport(nodesCsv, edgesCsv, 'huawei-nce');
      const { updatedNodes } = allocatePortsOnEdges(result.edges, result.nodes);

      const nodeNames = updatedNodes.map((n) => n.name);
      expect(nodeNames).toContain('OADM-A');
      expect(nodeNames).toContain('OADM-B');
      expect(nodeNames).not.toContain('OADM-C');
    });

    it('should work with a mix of imported and existing topology nodes', () => {
      // Simulate: OADM-A is imported, OADM-B is an existing topology node
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
      ].join('\n');

      const existingMap = new Map<string, string>([
        ['oadm-b', 'existing-oadm-b'],
      ]);

      const edgesCsv = [
        'edge_name,source_node,target_node,distance_km',
        'Link-AB,OADM-A,OADM-B,100',
      ].join('\n');

      const result = runImport(nodesCsv, edgesCsv, 'huawei-nce', '', existingMap);

      // Create a mock existing node with DWDM ports
      const existingNode = {
        id: 'existing-oadm-b',
        name: 'OADM-B',
        type: 'oadm' as const,
        vendor: 'generic' as const,
        position: { x: 0, y: 0 },
        stacks: [],
        ports: [
          { id: 'port-b-1', name: 'Line-1', type: 'dwdm' as const, dataRate: '100G' as const, channels: 96, status: 'available' as const, spectrum: { gridType: 'fixed-50ghz' as const, allocations: [] } },
          { id: 'port-b-2', name: 'Line-2', type: 'dwdm' as const, dataRate: '100G' as const, channels: 96, status: 'available' as const, spectrum: { gridType: 'fixed-50ghz' as const, allocations: [] } },
        ],
      };

      const allNodes = [...result.nodes, existingNode];
      const { updatedEdges, allocations } = allocatePortsOnEdges(result.edges, allNodes);

      expect(updatedEdges[0].source.portId).toBeDefined();
      expect(updatedEdges[0].target.portId).toBeDefined();
      expect(allocations[0].sourceNodeName).toBe('OADM-A');
      expect(allocations[0].targetNodeName).toBe('OADM-B');
      expect(allocations[0].targetPortName).toBe('Line-1');
    });

    it('should not re-allocate edges that already have portId', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
        'OADM-B,OADM',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce');

      // Manually set portId on an edge
      const edge = {
        id: 'test-edge',
        name: 'Test',
        type: 'fiber' as const,
        source: { nodeId: result.nodes[0].id, portId: result.nodes[0].ports[0].id },
        target: { nodeId: result.nodes[1].id, portId: result.nodes[1].ports[0].id },
        properties: { distance: 100, fiberCount: 1, lambdaCapacity: 96 },
        state: 'active' as const,
      };

      const { updatedEdges } = allocatePortsOnEdges([edge], result.nodes);

      // Should preserve existing portId, not re-allocate
      expect(updatedEdges[0].source.portId).toBe(result.nodes[0].ports[0].id);
      expect(updatedEdges[0].target.portId).toBe(result.nodes[1].ports[0].id);
    });
  });

  // ==========================================================================
  // Phase 3: Port Import
  // ==========================================================================
  describe('port import (portsCsv)', () => {
    it('should add ports from portsCsv to matching nodes', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
      ].join('\n');

      const portsCsv = [
        'node_name,port_name,port_type,data_rate,channels,grid_type',
        'OADM-A,Line-5,dwdm,100G,96,fixed-50ghz',
        'OADM-A,Line-6,dwdm,100G,96,fixed-50ghz',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', undefined, portsCsv);
      const oadm = result.nodes.find((n) => n.name === 'OADM-A')!;

      const line5 = oadm.ports.find((p) => p.name === 'Line-5');
      const line6 = oadm.ports.find((p) => p.name === 'Line-6');
      expect(line5).toBeDefined();
      expect(line6).toBeDefined();
    });

    it('should initialize spectrum on DWDM ports from portsCsv', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
      ].join('\n');

      const portsCsv = [
        'node_name,port_name,port_type,data_rate,channels,grid_type',
        'OADM-A,Line-10,dwdm,100G,96,fixed-50ghz',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', undefined, portsCsv);
      const oadm = result.nodes.find((n) => n.name === 'OADM-A')!;

      const line10 = oadm.ports.find((p) => p.name === 'Line-10');
      expect(line10).toBeDefined();
      expect(line10!.type).toBe('dwdm');
      expect(line10!.spectrum).toBeDefined();
      expect(line10!.spectrum!.gridType).toBe('fixed-50ghz');
      expect(line10!.spectrum!.allocations).toEqual([]);
    });

    it('should NOT initialize spectrum on BW ports from portsCsv', () => {
      const nodesCsv = [
        'node_name,node_type',
        'Router-A,Router',
      ].join('\n');

      const portsCsv = [
        'node_name,port_name,port_type,data_rate,channels',
        'Router-A,Eth-10,bw,10G,1',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', undefined, portsCsv);
      const router = result.nodes.find((n) => n.name === 'Router-A')!;

      const eth10 = router.ports.find((p) => p.name === 'Eth-10');
      expect(eth10).toBeDefined();
      expect(eth10!.type).toBe('bw');
      expect(eth10!.spectrum).toBeUndefined();
    });

    it('should report validation error when node_name does not exist', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
      ].join('\n');

      const portsCsv = [
        'node_name,port_name,port_type',
        'NonExistent-Node,Line-1,dwdm',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', undefined, portsCsv);

      expect(result.portValidation.invalidRows).toBe(1);
      expect(result.portValidation.validRows).toBe(0);
      const errors = result.portValidation.rowResults[0].errors;
      expect(errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('should return portValidation in the result', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
      ].join('\n');

      const portsCsv = [
        'node_name,port_name,port_type',
        'OADM-A,Line-5,dwdm',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', undefined, portsCsv);

      expect(result.portValidation).toBeDefined();
      expect(result.portValidation.source).toBe('huawei-nce');
      expect(result.portValidation.fileType).toBe('ports');
      expect(result.portValidation.validRows).toBe(1);
      expect(result.portValidation.invalidRows).toBe(0);
    });

    it('should update existing ports by name match instead of duplicating', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
      ].join('\n');

      // Line-1 already exists as a default port on OADM
      const portsCsv = [
        'node_name,port_name,port_type,data_rate',
        'OADM-A,Line-1,dwdm,400G',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', undefined, portsCsv);
      const oadm = result.nodes.find((n) => n.name === 'OADM-A')!;

      // Should not duplicate Line-1
      const line1Ports = oadm.ports.filter((p) => p.name.toLowerCase() === 'line-1');
      expect(line1Ports).toHaveLength(1);

      // Should have updated data rate
      expect(line1Ports[0].dataRate).toBe('400G');
    });

    it('should apply used_channels allocations on DWDM ports', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
      ].join('\n');

      const portsCsv = [
        'node_name,port_name,port_type,data_rate,channels,grid_type,used_channels',
        'OADM-A,Line-5,dwdm,100G,96,fixed-50ghz,"1,2,5"',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', undefined, portsCsv);
      const oadm = result.nodes.find((n) => n.name === 'OADM-A')!;
      const line5 = oadm.ports.find((p) => p.name === 'Line-5')!;

      expect(line5.spectrum).toBeDefined();
      expect(line5.spectrum!.allocations).toHaveLength(3);
      expect(line5.spectrum!.allocations[0].channelNumber).toBe(1);
      expect(line5.spectrum!.allocations[1].channelNumber).toBe(2);
      expect(line5.spectrum!.allocations[2].channelNumber).toBe(5);
      for (const alloc of line5.spectrum!.allocations) {
        expect(alloc.status).toBe('allocated');
        expect(alloc.label).toBe('Pre-allocated (import)');
        expect(alloc.id).toBeDefined();
      }
    });

    it('should apply used_channels with dash ranges', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
      ].join('\n');

      const portsCsv = [
        'node_name,port_name,port_type,data_rate,channels,grid_type,used_channels',
        'OADM-A,Line-5,dwdm,100G,96,fixed-50ghz,"1-5,10"',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', undefined, portsCsv);
      const oadm = result.nodes.find((n) => n.name === 'OADM-A')!;
      const line5 = oadm.ports.find((p) => p.name === 'Line-5')!;

      expect(line5.spectrum!.allocations).toHaveLength(6);
      const channels = line5.spectrum!.allocations.map((a) => a.channelNumber);
      expect(channels).toEqual([1, 2, 3, 4, 5, 10]);
    });

    it('should ignore used_channels on BW ports', () => {
      const nodesCsv = [
        'node_name,node_type',
        'Router-A,Router',
      ].join('\n');

      const portsCsv = [
        'node_name,port_name,port_type,data_rate,channels,used_channels',
        'Router-A,Eth-5,bw,10G,1,"1,2,3"',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', undefined, portsCsv);
      const router = result.nodes.find((n) => n.name === 'Router-A')!;
      const eth5 = router.ports.find((p) => p.name === 'Eth-5')!;

      // BW port should have no spectrum
      expect(eth5.spectrum).toBeUndefined();
    });

    it('should handle empty used_channels gracefully', () => {
      const nodesCsv = [
        'node_name,node_type',
        'OADM-A,OADM',
      ].join('\n');

      const portsCsv = [
        'node_name,port_name,port_type,data_rate,channels,grid_type,used_channels',
        'OADM-A,Line-5,dwdm,100G,96,fixed-50ghz,',
      ].join('\n');

      const result = runImport(nodesCsv, '', 'huawei-nce', '', undefined, portsCsv);
      const oadm = result.nodes.find((n) => n.name === 'OADM-A')!;
      const line5 = oadm.ports.find((p) => p.name === 'Line-5')!;

      expect(line5.spectrum).toBeDefined();
      expect(line5.spectrum!.allocations).toEqual([]);
    });
  });
});
