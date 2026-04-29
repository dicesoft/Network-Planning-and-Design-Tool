import React, { useState, useCallback } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { GraphEngine } from '@/core/graph/GraphEngine';
import { PathFinder } from '@/core/graph/PathFinder';
import { ChannelChecker } from '@/core/services/ChannelChecker';
import { SRLGAnalyzer } from '@/core/services/SRLGAnalyzer';
import type { ServiceType, ServicePath, L1DWDMService, L2L3Service } from '@/types/service';
import { isL1DWDMService, isL2L3Service } from '@/types/service';

// L1 validation imports
import {
  validateEndpoints as validateL1Endpoints,
  validateChannelNumber,
  validateModulationReach,
  validatePath,
  validateSRLGDiversity,
  MODULATION_REACH_KM,
  CHANNEL_RANGE,
} from '@/core/validation/l1ServiceValidation';

// L2/L3 validation imports
import {
  validateUnderlay,
  validateBFDConfig,
  validateSharedPortion,
  DATA_RATE_VALUES,
  SHARED_PORTION_THRESHOLDS,
} from '@/core/validation/l2l3ServiceValidation';

// ============================================================================
// VALIDATION TEST TYPES
// ============================================================================

interface ValidationTestResult {
  name: string;
  category: 'l1' | 'l2l3' | 'lifecycle' | 'integration';
  status: 'pass' | 'fail' | 'warning' | 'skip';
  message: string;
  details: string[];
  elapsedMs: number;
}

type TestStatus = ValidationTestResult['status'];

// Status display configuration
const STATUS_CONFIG: Record<TestStatus, { icon: string; textColor: string; bgColor: string }> = {
  pass: { icon: '✓', textColor: 'text-success', bgColor: 'bg-success' },
  fail: { icon: '✗', textColor: 'text-danger', bgColor: 'bg-danger' },
  warning: { icon: '⚠', textColor: 'text-warning', bgColor: 'bg-warning' },
  skip: { icon: '○', textColor: 'text-text-secondary', bgColor: 'bg-tertiary' },
};

// ============================================================================
// SAMPLE SERVICE TOPOLOGIES
// ============================================================================

type ServiceTopologyName = 'basic-l1' | 'protected-l1' | 'l2-over-l1' | 'multi-layer';

interface ServiceTopologyDef {
  name: string;
  description: string;
  layers: string;
}

const SERVICE_TOPOLOGIES: Record<ServiceTopologyName, ServiceTopologyDef> = {
  'basic-l1': {
    name: 'Basic L1 Service',
    description: '2 nodes with L1 DWDM service',
    layers: 'L1',
  },
  'protected-l1': {
    name: 'Protected L1 (Diamond)',
    description: '4-node diamond with working + protection paths',
    layers: 'L1',
  },
  'l2-over-l1': {
    name: 'L2 over L1',
    description: 'L1 underlay with L2 Ethernet service',
    layers: 'L1 + L2',
  },
  'multi-layer': {
    name: 'Multi-layer Stack',
    description: 'L1 + L2 + L3 layered services',
    layers: 'L1 + L2 + L3',
  },
};

// Default BFD config for L2/L3 services
const defaultBFDConfig = {
  enabled: false,
  minTxInterval: 300000,
  minRxInterval: 300000,
  multiplier: 3,
};

// ============================================================================
// VALIDATION TEST UTILITIES
// ============================================================================

/**
 * Run a validation test with timing
 */
function runValidationTest(
  name: string,
  category: ValidationTestResult['category'],
  testFn: () => { status: TestStatus; message: string; details?: string[] }
): ValidationTestResult {
  const start = performance.now();
  try {
    const result = testFn();
    return {
      name,
      category,
      ...result,
      details: result.details || [],
      elapsedMs: performance.now() - start,
    };
  } catch (error) {
    return {
      name,
      category,
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: [],
      elapsedMs: performance.now() - start,
    };
  }
}

/**
 * Format elapsed time for display
 */
function formatElapsedTime(elapsedMs: number): string {
  if (elapsedMs >= 1) {
    return `${elapsedMs.toFixed(2)}ms`;
  } else if (elapsedMs >= 0.001) {
    return `${(elapsedMs * 1000).toFixed(1)}µs`;
  } else {
    return '<1µs';
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ServiceTester: React.FC = () => {
  // Network store
  const topology = useNetworkStore((state) => state.topology);
  const addNode = useNetworkStore((state) => state.addNode);
  const addEdge = useNetworkStore((state) => state.addEdge);
  const clearTopology = useNetworkStore((state) => state.clearTopology);

  // Service store
  const services = useServiceStore((state) => state.services);
  const addService = useServiceStore((state) => state.addService);
  const activateService = useServiceStore((state) => state.activateService);
  const deactivateService = useServiceStore((state) => state.deactivateService);
  const failService = useServiceStore((state) => state.failService);
  const removeService = useServiceStore((state) => state.removeService);
  const selectServices = useServiceStore((state) => state.selectServices);
  const clearAllServices = useServiceStore((state) => state.clearAllServices);
  const bulkActivate = useServiceStore((state) => state.bulkActivate);
  const bulkDeactivate = useServiceStore((state) => state.bulkDeactivate);
  const getDependentServices = useServiceStore((state) => state.getDependentServices);

  // Local state
  const [selectedTopology, setSelectedTopology] = useState<ServiceTopologyName>('basic-l1');
  const [results, setResults] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  // Quick create form state
  const [quickCreateSource, setQuickCreateSource] = useState<string>('');
  const [quickCreateTarget, setQuickCreateTarget] = useState<string>('');
  const [quickCreateType, setQuickCreateType] = useState<ServiceType>('l1-dwdm');

  // Validation test state
  const [validationResults, setValidationResults] = useState<ValidationTestResult[]>([]);
  const [showValidationTests, setShowValidationTests] = useState(true);
  const [runningTests, setRunningTests] = useState(false);

  // Get topology provider for analysis
  const getTopologyProvider = useCallback(() => {
    return {
      getNode: (id: string) => topology.nodes.find((n) => n.id === id),
      getEdge: (id: string) => topology.edges.find((e) => e.id === id),
      getNodes: () => topology.nodes,
      getEdges: () => topology.edges,
    };
  }, [topology]);

  // Get service provider for validation
  const getServiceProvider = useCallback(() => {
    return {
      getService: (id: string) => services.find((s) => s.id === id),
    };
  }, [services]);

  // Create path finder
  const createPathFinder = useCallback(() => {
    const engine = new GraphEngine();
    engine.loadFromTopology(topology);
    return new PathFinder(engine);
  }, [topology]);

  // ============================================================================
  // SERVICE CREATION HELPERS
  // ============================================================================

  const createBasicL1Service = useCallback((sourceId: string, destId: string, name: string): string => {
    const pathFinder = createPathFinder();
    const pathResult = pathFinder.shortestPath(sourceId, destId);

    if (!pathResult) {
      setResults('Error: No path found between nodes');
      return '';
    }

    // Get edge IDs from path
    const edgeIds: string[] = [];
    for (let i = 0; i < pathResult.path.length - 1; i++) {
      const edge = topology.edges.find(
        (e) =>
          (e.source.nodeId === pathResult.path[i] && e.target.nodeId === pathResult.path[i + 1]) ||
          (e.target.nodeId === pathResult.path[i] && e.source.nodeId === pathResult.path[i + 1])
      );
      if (edge) edgeIds.push(edge.id);
    }

    const workingPath: ServicePath = {
      id: `path-${Date.now()}`,
      type: 'working',
      nodeIds: pathResult.path,
      edgeIds,
      channelNumber: 1,
      totalDistance: pathResult.totalWeight,
      hopCount: pathResult.hopCount,
      status: 'computed',
    };

    const serviceData: Omit<L1DWDMService, 'id' | 'createdAt' | 'modifiedAt'> = {
      type: 'l1-dwdm',
      name,
      sourceNodeId: sourceId,
      sourcePortId: '',
      destinationNodeId: destId,
      destinationPortId: '',
      status: 'planned',
      dataRate: '100G',
      modulationType: 'DP-16QAM',
      channelWidth: '50GHz',
      wavelengthMode: 'continuous',
      workingPath,
      protectionScheme: 'none',
      restorationEnabled: false,
      metadata: {},
    };

    const serviceId = addService(serviceData);
    return serviceId;
  }, [createPathFinder, topology.edges, addService]);

  const createProtectedL1Service = useCallback((
    sourceId: string,
    destId: string,
    workingNodeIds: string[],
    workingEdgeIds: string[],
    protNodeIds: string[],
    protEdgeIds: string[],
    name: string
  ): string => {
    const workingPath: ServicePath = {
      id: `path-w-${Date.now()}`,
      type: 'working',
      nodeIds: workingNodeIds,
      edgeIds: workingEdgeIds,
      channelNumber: 1,
      totalDistance: 100,
      hopCount: workingNodeIds.length - 1,
      status: 'computed',
    };

    const protectionPath: ServicePath = {
      id: `path-p-${Date.now()}`,
      type: 'protection',
      nodeIds: protNodeIds,
      edgeIds: protEdgeIds,
      channelNumber: 2,
      totalDistance: 100,
      hopCount: protNodeIds.length - 1,
      status: 'computed',
    };

    const serviceData: Omit<L1DWDMService, 'id' | 'createdAt' | 'modifiedAt'> = {
      type: 'l1-dwdm',
      name,
      sourceNodeId: sourceId,
      sourcePortId: '',
      destinationNodeId: destId,
      destinationPortId: '',
      status: 'planned',
      dataRate: '100G',
      modulationType: 'DP-16QAM',
      channelWidth: '50GHz',
      wavelengthMode: 'continuous',
      workingPath,
      protectionPath,
      protectionScheme: 'olp',
      restorationEnabled: false,
      metadata: {},
    };

    const serviceId = addService(serviceData);
    return serviceId;
  }, [addService]);

  const createL2Service = useCallback((sourceId: string, destId: string, underlayId: string, name: string): string => {
    const serviceData: Omit<L2L3Service, 'id' | 'createdAt' | 'modifiedAt'> = {
      type: 'l2-ethernet',
      name,
      sourceNodeId: sourceId,
      sourcePortId: '',
      destinationNodeId: destId,
      destinationPortId: '',
      status: 'planned',
      dataRate: '100G',
      underlayServiceId: underlayId,
      underlayAutoCreated: false,
      protectionScheme: 'none',
      bfdConfig: defaultBFDConfig,
      metadata: {},
    };
    const serviceId = addService(serviceData);
    return serviceId;
  }, [addService]);

  const createL3Service = useCallback((sourceId: string, destId: string, underlayId: string, name: string): string => {
    const serviceData: Omit<L2L3Service, 'id' | 'createdAt' | 'modifiedAt'> = {
      type: 'l3-ip',
      name,
      sourceNodeId: sourceId,
      sourcePortId: '',
      destinationNodeId: destId,
      destinationPortId: '',
      status: 'planned',
      dataRate: '100G',
      underlayServiceId: underlayId,
      underlayAutoCreated: false,
      protectionScheme: 'none',
      bfdConfig: defaultBFDConfig,
      metadata: {},
    };
    const serviceId = addService(serviceData);
    return serviceId;
  }, [addService]);

  // ============================================================================
  // SAMPLE TOPOLOGY LOADING
  // ============================================================================

  const loadSampleTopology = useCallback(() => {
    clearTopology();
    clearAllServices();

    const nodeIds: string[] = [];
    let resultText = '';

    switch (selectedTopology) {
      case 'basic-l1': {
        // Simple A-B topology
        const nodeA = addNode({
          type: 'terminal',
          position: { x: 150, y: 200 },
          name: 'Terminal-A',
          vendor: 'generic',
          stacks: [],
          metadata: {},
        });
        const nodeB = addNode({
          type: 'terminal',
          position: { x: 450, y: 200 },
          name: 'Terminal-B',
          vendor: 'generic',
          stacks: [],
          metadata: {},
        });
        addEdge(nodeA, nodeB, 'right-source', 'left-target');
        nodeIds.push(nodeA, nodeB);

        // Create L1 service
        const serviceId = createBasicL1Service(nodeA, nodeB, 'L1-Basic');
        resultText = `Basic L1 topology loaded:\nNodes: A → B\nService: ${serviceId}`;
        break;
      }

      case 'protected-l1': {
        // Diamond: A → B → D, A → C → D
        const nodeA = addNode({
          type: 'terminal',
          position: { x: 100, y: 200 },
          name: 'Terminal-A',
          vendor: 'generic',
          stacks: [],
          metadata: {},
        });
        const nodeB = addNode({
          type: 'oadm',
          position: { x: 250, y: 100 },
          name: 'OADM-B',
          vendor: 'generic',
          stacks: [],
          metadata: {},
        });
        const nodeC = addNode({
          type: 'oadm',
          position: { x: 250, y: 300 },
          name: 'OADM-C',
          vendor: 'generic',
          stacks: [],
          metadata: {},
        });
        const nodeD = addNode({
          type: 'terminal',
          position: { x: 400, y: 200 },
          name: 'Terminal-D',
          vendor: 'generic',
          stacks: [],
          metadata: {},
        });

        const edgeAB = addEdge(nodeA, nodeB, 'right-source', 'left-target');
        const edgeBD = addEdge(nodeB, nodeD, 'right-source', 'left-target');
        const edgeAC = addEdge(nodeA, nodeC, 'right-source', 'left-target');
        const edgeCD = addEdge(nodeC, nodeD, 'right-source', 'left-target');
        nodeIds.push(nodeA, nodeB, nodeC, nodeD);

        // Create protected L1 service - use edge IDs if available
        if (edgeAB && edgeBD && edgeAC && edgeCD) {
          const serviceId = createProtectedL1Service(
            nodeA,
            nodeD,
            [nodeA, nodeB, nodeD],
            [edgeAB, edgeBD],
            [nodeA, nodeC, nodeD],
            [edgeAC, edgeCD],
            'L1-Protected'
          );
          resultText = `Protected L1 (Diamond) topology loaded:\nWorking: A → B → D\nProtection: A → C → D\nService: ${serviceId}`;
        } else {
          resultText = 'Error: Failed to create edges for diamond topology';
        }
        break;
      }

      case 'l2-over-l1': {
        // A-B with L1 underlay and L2 overlay
        const nodeA = addNode({
          type: 'router',
          position: { x: 150, y: 200 },
          name: 'Router-A',
          vendor: 'cisco',
          stacks: [],
          metadata: {},
        });
        const nodeB = addNode({
          type: 'router',
          position: { x: 450, y: 200 },
          name: 'Router-B',
          vendor: 'cisco',
          stacks: [],
          metadata: {},
        });
        addEdge(nodeA, nodeB, 'right-source', 'left-target');
        nodeIds.push(nodeA, nodeB);

        // Create L1 underlay
        const l1ServiceId = createBasicL1Service(nodeA, nodeB, 'L1-Underlay');

        // Create L2 service on top
        const l2ServiceId = createL2Service(nodeA, nodeB, l1ServiceId, 'L2-Ethernet');

        resultText = `L2 over L1 topology loaded:\nL1 Underlay: ${l1ServiceId}\nL2 Service: ${l2ServiceId}`;
        break;
      }

      case 'multi-layer': {
        // A-B with L1, L2, and L3 services
        const nodeA = addNode({
          type: 'router',
          position: { x: 150, y: 200 },
          name: 'Router-A',
          vendor: 'juniper',
          stacks: [],
          metadata: {},
        });
        const nodeB = addNode({
          type: 'router',
          position: { x: 450, y: 200 },
          name: 'Router-B',
          vendor: 'juniper',
          stacks: [],
          metadata: {},
        });
        addEdge(nodeA, nodeB, 'right-source', 'left-target');
        nodeIds.push(nodeA, nodeB);

        // Create L1 underlay
        const l1ServiceId = createBasicL1Service(nodeA, nodeB, 'L1-Transport');

        // Create L2 service
        const l2ServiceId = createL2Service(nodeA, nodeB, l1ServiceId, 'L2-VPLS');

        // Create L3 service
        const l3ServiceId = createL3Service(nodeA, nodeB, l1ServiceId, 'L3-VRF');

        resultText = `Multi-layer topology loaded:\nL1: ${l1ServiceId}\nL2: ${l2ServiceId}\nL3: ${l3ServiceId}`;
        break;
      }
    }

    setQuickCreateSource(nodeIds[0] || '');
    setQuickCreateTarget(nodeIds[nodeIds.length - 1] || '');
    setResults(resultText);
  }, [selectedTopology, clearTopology, clearAllServices, addNode, addEdge, createBasicL1Service, createProtectedL1Service, createL2Service, createL3Service]);

  // ============================================================================
  // QUICK CREATE SERVICE
  // ============================================================================

  const handleQuickCreate = useCallback(() => {
    if (!quickCreateSource || !quickCreateTarget) {
      setResults('Error: Select source and target nodes');
      return;
    }

    if (quickCreateSource === quickCreateTarget) {
      setResults('Error: Source and target must be different');
      return;
    }

    const timestamp = Date.now();

    if (quickCreateType === 'l1-dwdm') {
      const serviceId = createBasicL1Service(
        quickCreateSource,
        quickCreateTarget,
        `L1-${timestamp.toString().slice(-4)}`
      );
      if (serviceId) {
        setResults(`Created L1 DWDM service: ${serviceId}`);
        setSelectedServiceId(serviceId);
      }
    } else {
      // For L2/L3, first check if there's an L1 underlay
      const l1Services = services.filter(
        (s) =>
          isL1DWDMService(s) &&
          s.sourceNodeId === quickCreateSource &&
          s.destinationNodeId === quickCreateTarget
      );

      if (l1Services.length === 0) {
        setResults(`Error: No L1 underlay exists between selected nodes.\nCreate an L1 service first.`);
        return;
      }

      const underlayId = l1Services[0].id;
      const name =
        quickCreateType === 'l2-ethernet'
          ? `L2-${timestamp.toString().slice(-4)}`
          : `L3-${timestamp.toString().slice(-4)}`;

      const serviceId =
        quickCreateType === 'l2-ethernet'
          ? createL2Service(quickCreateSource, quickCreateTarget, underlayId, name)
          : createL3Service(quickCreateSource, quickCreateTarget, underlayId, name);

      setResults(`Created ${quickCreateType} service: ${serviceId}\nUsing underlay: ${underlayId}`);
      setSelectedServiceId(serviceId);
    }
  }, [quickCreateSource, quickCreateTarget, quickCreateType, services, createBasicL1Service, createL2Service, createL3Service]);

  // ============================================================================
  // SERVICE OPERATIONS
  // ============================================================================

  const handleActivate = useCallback(() => {
    if (!selectedServiceId) {
      setResults('Error: No service selected');
      return;
    }
    const result = activateService(selectedServiceId);
    if (result.success) {
      setResults(`Service ${selectedServiceId} activated`);
    } else {
      setResults(`Activation failed: ${result.error || 'Unknown error'}`);
    }
  }, [selectedServiceId, activateService]);

  const handleDeactivate = useCallback(() => {
    if (!selectedServiceId) {
      setResults('Error: No service selected');
      return;
    }
    deactivateService(selectedServiceId);
    setResults(`Service ${selectedServiceId} deactivated`);
  }, [selectedServiceId, deactivateService]);

  const handleFail = useCallback(() => {
    if (!selectedServiceId) {
      setResults('Error: No service selected');
      return;
    }
    failService(selectedServiceId);
    setResults(`Service ${selectedServiceId} marked as failed`);
  }, [selectedServiceId, failService]);

  const handleDelete = useCallback(() => {
    if (!selectedServiceId) {
      setResults('Error: No service selected');
      return;
    }
    const result = removeService(selectedServiceId);
    if (result.success) {
      setResults(`Service ${selectedServiceId} deleted`);
      setSelectedServiceId(null);
    } else {
      setResults(`Delete blocked by dependent services:\n${result.blockers?.join('\n')}`);
    }
  }, [selectedServiceId, removeService]);

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  const handleBulkActivate = useCallback(() => {
    const plannedIds = services.filter((s) => s.status === 'planned').map((s) => s.id);
    if (plannedIds.length === 0) {
      setResults('No planned services to activate');
      return;
    }
    bulkActivate(plannedIds);
    setResults(`Activated ${plannedIds.length} services`);
  }, [services, bulkActivate]);

  const handleBulkDeactivate = useCallback(() => {
    const activeIds = services.filter((s) => s.status === 'active').map((s) => s.id);
    if (activeIds.length === 0) {
      setResults('No active services to deactivate');
      return;
    }
    bulkDeactivate(activeIds);
    setResults(`Deactivated ${activeIds.length} services`);
  }, [services, bulkDeactivate]);

  const handleDeleteAll = useCallback(() => {
    clearAllServices();
    setSelectedServiceId(null);
    setResults('All services deleted');
  }, [clearAllServices]);

  // ============================================================================
  // ANALYSIS OPERATIONS
  // ============================================================================

  const handleCheckChannels = useCallback(() => {
    if (!selectedServiceId) {
      setResults('Error: No service selected');
      return;
    }

    const service = services.find((s) => s.id === selectedServiceId);
    if (!service || !isL1DWDMService(service)) {
      setResults('Error: Selected service is not L1 DWDM');
      return;
    }

    const checker = new ChannelChecker(getTopologyProvider());
    const result = checker.checkChannelAvailability(
      service.workingPath,
      service.wavelengthMode
    );

    const commonChannels = result.commonChannels || [];
    const output = [
      `Channel Availability for ${selectedServiceId}:`,
      `─────────────────────`,
      `Available: ${result.available ? 'Yes' : 'No'}`,
      `Common Channels: ${commonChannels.length > 0 ? commonChannels.slice(0, 10).join(', ') + (commonChannels.length > 10 ? '...' : '') : 'None'}`,
      `Suggested Channel: ${result.suggestedChannel || 'N/A'}`,
    ];

    if (result.blockedEdges && result.blockedEdges.length > 0) {
      output.push(`Blocked Edges: ${result.blockedEdges.join(', ')}`);
    }

    setResults(output.join('\n'));
  }, [selectedServiceId, services, getTopologyProvider]);

  const handleAnalyzeSRLG = useCallback(() => {
    const l1Services = services.filter(isL1DWDMService);
    if (l1Services.length < 2) {
      setResults('Need at least 2 L1 services for SRLG comparison');
      return;
    }

    const service1 = l1Services[0];
    const service2 = l1Services[1];

    const analyzer = new SRLGAnalyzer(getTopologyProvider());
    const analysis = analyzer.comparePaths(service1.workingPath, service2.workingPath);

    const output = [
      `SRLG Analysis: ${service1.id} vs ${service2.id}`,
      `─────────────────────`,
      `Shared SRLGs: ${analysis.sharedSRLGCodes.length > 0 ? analysis.sharedSRLGCodes.join(', ') : 'None'}`,
      `Shared Edges: ${analysis.sharedEdgeIds.length > 0 ? analysis.sharedEdgeIds.join(', ') : 'None'}`,
      `Shared Distance: ${analysis.sharedDistanceKm.toFixed(2)} km`,
      `Risk Score: ${analysis.riskScore.toFixed(1)}%`,
    ];

    if (analysis.warnings.length > 0) {
      output.push(`\nWarnings:`);
      analysis.warnings.forEach((w) => output.push(`  - ${w}`));
    }

    setResults(output.join('\n'));
  }, [services, getTopologyProvider]);

  const handleValidateService = useCallback(() => {
    if (!selectedServiceId) {
      setResults('Error: No service selected');
      return;
    }

    const service = services.find((s) => s.id === selectedServiceId);
    if (!service) {
      setResults('Error: Service not found');
      return;
    }

    // Check dependencies
    const dependents = getDependentServices(selectedServiceId);

    const output = [
      `Validation: ${selectedServiceId}`,
      `─────────────────────`,
      `Type: ${service.type}`,
      `Status: ${service.status}`,
      `Source: ${service.sourceNodeId}`,
      `Destination: ${service.destinationNodeId}`,
      `Data Rate: ${service.dataRate}`,
    ];

    if (isL1DWDMService(service)) {
      output.push(`Protection: ${service.protectionScheme}`);
      output.push(`Wavelength Mode: ${service.wavelengthMode}`);
      output.push(`Working Path Hops: ${service.workingPath.hopCount}`);
      if (service.protectionPath) {
        output.push(`Protection Path Hops: ${service.protectionPath.hopCount}`);
      }
    }

    if (isL2L3Service(service)) {
      output.push(`Underlay Service: ${service.underlayServiceId}`);
      if (service.protectionUnderlayServiceId) {
        output.push(`Protection Underlay: ${service.protectionUnderlayServiceId}`);
      }
    }

    output.push(`\nDependent Services: ${dependents.length > 0 ? dependents.map((d) => d.id).join(', ') : 'None'}`);
    output.push(`Can Delete: ${dependents.length === 0 ? 'Yes' : 'No (has dependents)'}`);

    setResults(output.join('\n'));
  }, [selectedServiceId, services, getDependentServices]);

  // ============================================================================
  // VALIDATION TEST FUNCTIONS
  // ============================================================================

  // L1 Validation Tests
  const testL1EndpointValidation = useCallback((service: L1DWDMService): ValidationTestResult => {
    return runValidationTest('Endpoint Validation', 'l1', () => {
      const topologyProvider = getTopologyProvider();
      const result = validateL1Endpoints(
        service.sourceNodeId,
        service.sourcePortId,
        service.destinationNodeId,
        service.destinationPortId,
        topologyProvider
      );

      if (result.valid) {
        return { status: 'pass', message: 'Endpoints valid' };
      }

      const errors = result.messages.filter((m) => m.severity === 'error');
      const warnings = result.messages.filter((m) => m.severity === 'warning');

      if (errors.length > 0) {
        return {
          status: 'fail',
          message: errors[0].message,
          details: result.messages.map((m) => `${m.severity.toUpperCase()}: ${m.message}`),
        };
      }

      return {
        status: 'warning',
        message: warnings[0].message,
        details: result.messages.map((m) => `${m.severity.toUpperCase()}: ${m.message}`),
      };
    });
  }, [getTopologyProvider]);

  const testL1ChannelValidation = useCallback((service: L1DWDMService): ValidationTestResult => {
    return runValidationTest('Channel Number Range', 'l1', () => {
      // Check both service-level and path-level channel numbers
      const channelNumber = service.workingPath.channelNumber ?? service.channelNumber;

      if (channelNumber === undefined || channelNumber === null) {
        return { status: 'skip', message: 'No channel number assigned' };
      }

      const result = validateChannelNumber(channelNumber);

      if (result.valid) {
        return {
          status: 'pass',
          message: `Channel ${channelNumber} is valid (range: ${CHANNEL_RANGE.min}-${CHANNEL_RANGE.max})`,
        };
      }

      return {
        status: 'fail',
        message: result.messages[0].message,
        details: result.messages.map((m) => m.message),
      };
    });
  }, []);

  const testL1ModulationReach = useCallback((service: L1DWDMService): ValidationTestResult => {
    return runValidationTest('Modulation Reach Check', 'l1', () => {
      const result = validateModulationReach(service.workingPath, service.modulationType);
      const maxReach = MODULATION_REACH_KM[service.modulationType];
      const distance = service.workingPath.totalDistance;
      const percentUsed = ((distance / maxReach) * 100).toFixed(1);

      if (result.valid) {
        return {
          status: 'pass',
          message: `Path ${distance.toFixed(1)}km within ${service.modulationType} limit (${maxReach}km)`,
          details: [`Reach utilization: ${percentUsed}%`],
        };
      }

      const hasWarning = result.messages.some((m) => m.severity === 'warning');
      const hasInfo = result.messages.some((m) => m.severity === 'info');

      if (hasWarning) {
        return {
          status: 'warning',
          message: `Path at ${percentUsed}% of ${service.modulationType} limit`,
          details: result.messages.map((m) => m.message),
        };
      }

      if (hasInfo) {
        return {
          status: 'pass',
          message: `Path ${distance.toFixed(1)}km approaching ${service.modulationType} limit`,
          details: result.messages.map((m) => m.message),
        };
      }

      return { status: 'pass', message: `Path within ${service.modulationType} reach` };
    });
  }, []);

  const testL1PathContinuity = useCallback((service: L1DWDMService): ValidationTestResult => {
    return runValidationTest('Path Continuity', 'l1', () => {
      const topologyProvider = getTopologyProvider();
      const result = validatePath(service.workingPath, 'working', topologyProvider);

      if (result.valid) {
        return {
          status: 'pass',
          message: `Working path valid (${service.workingPath.hopCount} hops, ${service.workingPath.edgeIds.length} edges)`,
        };
      }

      const errors = result.messages.filter((m) => m.severity === 'error');
      return {
        status: 'fail',
        message: errors[0]?.message || 'Path validation failed',
        details: result.messages.map((m) => m.message),
      };
    });
  }, [getTopologyProvider]);

  const testL1SRLGDiversity = useCallback((service: L1DWDMService): ValidationTestResult => {
    return runValidationTest('SRLG Diversity', 'l1', () => {
      if (!service.protectionPath) {
        return { status: 'skip', message: 'No protection path configured' };
      }

      const topologyProvider = getTopologyProvider();
      const analyzer = new SRLGAnalyzer(topologyProvider);
      const analysis = analyzer.comparePaths(service.workingPath, service.protectionPath);

      const result = validateSRLGDiversity(
        analysis.sharedSRLGCodes.length,
        analysis.riskScore
      );

      if (result.valid) {
        return {
          status: 'pass',
          message: 'Paths are SRLG-diverse',
          details: [`Risk score: ${analysis.riskScore.toFixed(1)}%`],
        };
      }

      const errors = result.messages.filter((m) => m.severity === 'error');
      if (errors.length > 0) {
        return {
          status: 'fail',
          message: errors[0].message,
          details: [
            `Risk score: ${analysis.riskScore.toFixed(1)}%`,
            `Shared SRLGs: ${analysis.sharedSRLGCodes.join(', ') || 'None'}`,
            `Shared edges: ${analysis.sharedEdgeIds.length}`,
          ],
        };
      }

      const warnings = result.messages.filter((m) => m.severity === 'warning');
      if (warnings.length > 0) {
        return {
          status: 'warning',
          message: warnings[0].message,
          details: [
            `Risk score: ${analysis.riskScore.toFixed(1)}%`,
            `Shared SRLGs: ${analysis.sharedSRLGCodes.join(', ') || 'None'}`,
          ],
        };
      }

      return { status: 'pass', message: 'Acceptable SRLG diversity' };
    });
  }, [getTopologyProvider]);

  // L2/L3 Validation Tests
  const testL2L3UnderlayValidation = useCallback((service: L2L3Service): ValidationTestResult => {
    return runValidationTest('Underlay Validation', 'l2l3', () => {
      if (!service.underlayServiceId) {
        return { status: 'fail', message: 'No underlay service configured' };
      }

      const serviceProvider = getServiceProvider();
      const result = validateUnderlay(
        service.underlayServiceId,
        serviceProvider,
        service.dataRate
      );

      if (result.valid) {
        return {
          status: 'pass',
          message: `Underlay ${service.underlayServiceId} valid`,
        };
      }

      const errors = result.messages.filter((m) => m.severity === 'error');
      const warnings = result.messages.filter((m) => m.severity === 'warning');

      if (errors.length > 0) {
        return {
          status: 'fail',
          message: errors[0].message,
          details: result.messages.map((m) => m.message),
        };
      }

      return {
        status: 'warning',
        message: warnings[0].message,
        details: result.messages.map((m) => m.message),
      };
    });
  }, [getServiceProvider]);

  const testL2L3CapacityValidation = useCallback((service: L2L3Service): ValidationTestResult => {
    return runValidationTest('Capacity Validation', 'l2l3', () => {
      if (!service.underlayServiceId) {
        return { status: 'skip', message: 'No underlay to check capacity' };
      }

      const underlay = services.find((s) => s.id === service.underlayServiceId);
      if (!underlay) {
        return { status: 'fail', message: 'Underlay service not found' };
      }

      if (!isL1DWDMService(underlay)) {
        return { status: 'fail', message: 'Underlay is not L1 DWDM type' };
      }

      const underlayCapacity = DATA_RATE_VALUES[underlay.dataRate];
      const requiredCapacity = DATA_RATE_VALUES[service.dataRate];

      if (underlayCapacity >= requiredCapacity) {
        return {
          status: 'pass',
          message: `Underlay capacity ${underlay.dataRate} >= required ${service.dataRate}`,
        };
      }

      return {
        status: 'fail',
        message: `Underlay capacity ${underlay.dataRate} < required ${service.dataRate}`,
        details: [`Need ${requiredCapacity}Gbps, have ${underlayCapacity}Gbps`],
      };
    });
  }, [services]);

  const testL2L3BFDConfig = useCallback((service: L2L3Service): ValidationTestResult => {
    return runValidationTest('BFD Configuration', 'l2l3', () => {
      const result = validateBFDConfig(service.bfdConfig);

      if (!service.bfdConfig.enabled) {
        return { status: 'pass', message: 'BFD disabled (no validation needed)' };
      }

      if (result.valid) {
        return {
          status: 'pass',
          message: 'BFD configuration valid',
          details: [
            `TX: ${service.bfdConfig.minTxInterval}µs`,
            `RX: ${service.bfdConfig.minRxInterval}µs`,
            `Multiplier: ${service.bfdConfig.multiplier}`,
          ],
        };
      }

      const errors = result.messages.filter((m) => m.severity === 'error');
      if (errors.length > 0) {
        return {
          status: 'fail',
          message: errors[0].message,
          details: result.messages.map((m) => m.message),
        };
      }

      const warnings = result.messages.filter((m) => m.severity === 'warning');
      return {
        status: 'warning',
        message: warnings[0].message,
        details: result.messages.map((m) => m.message),
      };
    });
  }, []);

  const testL2L3SharedPortion = useCallback((service: L2L3Service): ValidationTestResult => {
    return runValidationTest('Shared Portion Analysis', 'l2l3', () => {
      if (!service.sharedPortionAnalysis) {
        if (!service.protectionUnderlayServiceId) {
          return { status: 'skip', message: 'No protection underlay configured' };
        }
        return { status: 'skip', message: 'No shared portion analysis available' };
      }

      const result = validateSharedPortion(service.sharedPortionAnalysis);
      const percentage = service.sharedPortionAnalysis.sharedPercentage;

      if (result.valid) {
        return {
          status: 'pass',
          message: `Path overlap: ${percentage.toFixed(1)}%`,
          details: [`Below warning threshold (${SHARED_PORTION_THRESHOLDS.warning}%)`],
        };
      }

      if (percentage >= SHARED_PORTION_THRESHOLDS.critical) {
        return {
          status: 'fail',
          message: `Critical path overlap: ${percentage.toFixed(1)}%`,
          details: result.messages.map((m) => m.message),
        };
      }

      return {
        status: 'warning',
        message: `High path overlap: ${percentage.toFixed(1)}%`,
        details: result.messages.map((m) => m.message),
      };
    });
  }, []);

  // Lifecycle Tests
  const testStatusTransitions = useCallback((): ValidationTestResult => {
    return runValidationTest('Status Transitions', 'lifecycle', () => {
      const planned = services.filter((s) => s.status === 'planned');
      const active = services.filter((s) => s.status === 'active');

      if (services.length === 0) {
        return { status: 'skip', message: 'No services to test' };
      }

      const details: string[] = [];
      details.push(`Planned: ${planned.length}`);
      details.push(`Active: ${active.length}`);

      // Check if any L2/L3 services have inactive underlays
      const l2l3WithInactiveUnderlay = services
        .filter(isL2L3Service)
        .filter((s) => {
          if (!s.underlayServiceId) return false;
          const underlay = services.find((u) => u.id === s.underlayServiceId);
          return s.status === 'active' && underlay && underlay.status !== 'active';
        });

      if (l2l3WithInactiveUnderlay.length > 0) {
        return {
          status: 'warning',
          message: `${l2l3WithInactiveUnderlay.length} active L2/L3 service(s) with inactive underlay`,
          details: l2l3WithInactiveUnderlay.map((s) => `${s.id} → ${s.underlayServiceId}`),
        };
      }

      return {
        status: 'pass',
        message: 'Service status transitions valid',
        details,
      };
    });
  }, [services]);

  const testDependencyBlocking = useCallback((): ValidationTestResult => {
    return runValidationTest('Dependency Blocking', 'lifecycle', () => {
      const l1Services = services.filter(isL1DWDMService);
      if (l1Services.length === 0) {
        return { status: 'skip', message: 'No L1 services to test' };
      }

      // Check each L1 service for dependents
      const servicesWithDependents = l1Services.filter((s) => {
        const dependents = getDependentServices(s.id);
        return dependents.length > 0;
      });

      if (servicesWithDependents.length === 0) {
        return {
          status: 'pass',
          message: 'No L1 services have dependents',
          details: [`${l1Services.length} L1 service(s) checked`],
        };
      }

      return {
        status: 'pass',
        message: `${servicesWithDependents.length} L1 service(s) have dependents (deletion blocked)`,
        details: servicesWithDependents.map((s) => {
          const deps = getDependentServices(s.id);
          return `${s.id} → ${deps.map((d) => d.id).join(', ')}`;
        }),
      };
    });
  }, [services, getDependentServices]);

  // Integration Tests
  const testChannelConflictDetection = useCallback((): ValidationTestResult => {
    return runValidationTest('Channel Conflict Detection', 'integration', () => {
      const l1Services = services.filter(isL1DWDMService);
      if (l1Services.length < 2) {
        return { status: 'skip', message: 'Need at least 2 L1 services' };
      }

      const conflicts: string[] = [];

      // Check for channel conflicts on overlapping paths
      for (let i = 0; i < l1Services.length; i++) {
        for (let j = i + 1; j < l1Services.length; j++) {
          const s1 = l1Services[i];
          const s2 = l1Services[j];

          // Find overlapping edges
          const overlap = s1.workingPath.edgeIds.filter((e) =>
            s2.workingPath.edgeIds.includes(e)
          );

          if (overlap.length > 0 && s1.workingPath.channelNumber === s2.workingPath.channelNumber) {
            conflicts.push(`${s1.id} & ${s2.id} share channel ${s1.workingPath.channelNumber} on ${overlap.length} edge(s)`);
          }
        }
      }

      if (conflicts.length > 0) {
        return {
          status: 'fail',
          message: `${conflicts.length} channel conflict(s) detected`,
          details: conflicts,
        };
      }

      return {
        status: 'pass',
        message: 'No channel conflicts detected',
        details: [`Checked ${l1Services.length} L1 services`],
      };
    });
  }, [services]);

  // Run all tests
  const runAllValidationTests = useCallback(() => {
    if (topology.nodes.length === 0) {
      setResults('Error: Load a topology first');
      return;
    }

    if (services.length === 0) {
      setResults('Error: No services to test');
      return;
    }

    setRunningTests(true);
    const results: ValidationTestResult[] = [];

    // Track tested services for summary
    let testedL1Service: L1DWDMService | undefined;
    let testedL2L3Service: L2L3Service | undefined;

    // Run L1 tests on L1 services
    const l1Services = services.filter(isL1DWDMService);
    if (l1Services.length > 0) {
      testedL1Service = selectedServiceId
        ? l1Services.find((s) => s.id === selectedServiceId) || l1Services[0]
        : l1Services[0];

      results.push(testL1EndpointValidation(testedL1Service));
      results.push(testL1ChannelValidation(testedL1Service));
      results.push(testL1ModulationReach(testedL1Service));
      results.push(testL1PathContinuity(testedL1Service));
      results.push(testL1SRLGDiversity(testedL1Service));
    }

    // Run L2/L3 tests on L2/L3 services
    const l2l3Services = services.filter(isL2L3Service);
    if (l2l3Services.length > 0) {
      testedL2L3Service = selectedServiceId
        ? l2l3Services.find((s) => s.id === selectedServiceId) || l2l3Services[0]
        : l2l3Services[0];

      results.push(testL2L3UnderlayValidation(testedL2L3Service));
      results.push(testL2L3CapacityValidation(testedL2L3Service));
      results.push(testL2L3BFDConfig(testedL2L3Service));
      results.push(testL2L3SharedPortion(testedL2L3Service));
    }

    // Run lifecycle and integration tests
    results.push(testStatusTransitions());
    results.push(testDependencyBlocking());
    results.push(testChannelConflictDetection());

    setValidationResults(results);
    setRunningTests(false);

    // Format summary for results display
    const summary = formatValidationSummary(results, testedL1Service, testedL2L3Service);
    setResults(summary);
  }, [
    topology.nodes.length,
    services,
    selectedServiceId,
    testL1EndpointValidation,
    testL1ChannelValidation,
    testL1ModulationReach,
    testL1PathContinuity,
    testL1SRLGDiversity,
    testL2L3UnderlayValidation,
    testL2L3CapacityValidation,
    testL2L3BFDConfig,
    testL2L3SharedPortion,
    testStatusTransitions,
    testDependencyBlocking,
    testChannelConflictDetection,
  ]);

  // Run tests on selected service only
  const runSelectedServiceTests = useCallback(() => {
    if (!selectedServiceId) {
      setResults('Error: No service selected');
      return;
    }

    const service = services.find((s) => s.id === selectedServiceId);
    if (!service) {
      setResults('Error: Service not found');
      return;
    }

    setRunningTests(true);
    const results: ValidationTestResult[] = [];

    // Track tested service for summary
    let testedL1Service: L1DWDMService | undefined;
    let testedL2L3Service: L2L3Service | undefined;

    if (isL1DWDMService(service)) {
      testedL1Service = service;
      results.push(testL1EndpointValidation(service));
      results.push(testL1ChannelValidation(service));
      results.push(testL1ModulationReach(service));
      results.push(testL1PathContinuity(service));
      results.push(testL1SRLGDiversity(service));
    } else if (isL2L3Service(service)) {
      testedL2L3Service = service;
      results.push(testL2L3UnderlayValidation(service));
      results.push(testL2L3CapacityValidation(service));
      results.push(testL2L3BFDConfig(service));
      results.push(testL2L3SharedPortion(service));
    }

    setValidationResults(results);
    setRunningTests(false);

    const summary = formatValidationSummary(results, testedL1Service, testedL2L3Service);
    setResults(summary);
  }, [
    selectedServiceId,
    services,
    testL1EndpointValidation,
    testL1ChannelValidation,
    testL1ModulationReach,
    testL1PathContinuity,
    testL1SRLGDiversity,
    testL2L3UnderlayValidation,
    testL2L3CapacityValidation,
    testL2L3BFDConfig,
    testL2L3SharedPortion,
  ]);

  // Format validation summary for display
  const formatValidationSummary = (
    results: ValidationTestResult[],
    testedL1Service?: L1DWDMService,
    testedL2L3Service?: L2L3Service
  ): string => {
    const pass = results.filter((r) => r.status === 'pass').length;
    const fail = results.filter((r) => r.status === 'fail').length;
    const warn = results.filter((r) => r.status === 'warning').length;
    const skip = results.filter((r) => r.status === 'skip').length;
    const totalTime = results.reduce((sum, r) => sum + r.elapsedMs, 0);

    const lines: string[] = [
      '═══════════════════════════════════════',
      '  VALIDATION TEST RESULTS',
      '═══════════════════════════════════════',
      '',
    ];

    // Add tested services info
    if (testedL1Service || testedL2L3Service) {
      lines.push('Tested Services:');
      if (testedL1Service) {
        lines.push(`  L1: ${testedL1Service.id} (${testedL1Service.name})`);
      }
      if (testedL2L3Service) {
        lines.push(`  L2/L3: ${testedL2L3Service.id} (${testedL2L3Service.name})`);
      }
      lines.push('');
    }

    // Group by category
    const categories = ['l1', 'l2l3', 'lifecycle', 'integration'] as const;
    const categoryNames: Record<typeof categories[number], string> = {
      l1: 'L1 Service Tests',
      l2l3: 'L2/L3 Service Tests',
      lifecycle: 'Lifecycle Tests',
      integration: 'Integration Tests',
    };

    for (const cat of categories) {
      const catResults = results.filter((r) => r.category === cat);
      if (catResults.length === 0) continue;

      lines.push(`${categoryNames[cat]} (${catResults.length} tests)`);
      lines.push('─────────────────────────────────────');

      for (const r of catResults) {
        const statusIcon = STATUS_CONFIG[r.status].icon;
        const statusLabel = `[${r.status.toUpperCase()}]`;
        const time = formatElapsedTime(r.elapsedMs);
        lines.push(`${statusIcon} ${r.name.padEnd(25)} ${statusLabel.padEnd(8)} ${time}`);

        if (r.status !== 'pass' && r.message) {
          lines.push(`  → ${r.message}`);
        }
        for (const detail of r.details.slice(0, 3)) {
          lines.push(`    • ${detail}`);
        }
      }
      lines.push('');
    }

    lines.push('─────────────────────────────────────');
    lines.push(`Summary: ${pass} passed, ${fail} failed, ${warn} warnings, ${skip} skipped`);
    lines.push(`Total Time: ${formatElapsedTime(totalTime)}`);

    return lines.join('\n');
  };

  // ============================================================================
  // SERVICE STATS
  // ============================================================================

  const l1Count = services.filter((s) => s.type === 'l1-dwdm').length;
  const l2Count = services.filter((s) => s.type === 'l2-ethernet').length;
  const l3Count = services.filter((s) => s.type === 'l3-ip').length;

  const plannedCount = services.filter((s) => s.status === 'planned').length;
  const activeCount = services.filter((s) => s.status === 'active').length;
  const failedCount = services.filter((s) => s.status === 'failed').length;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 overflow-auto p-4">
        {/* Service Stats Summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-elevated p-2">
            <div className="text-xs text-text-secondary">By Type</div>
            <div className="mt-1 flex gap-2 text-xs">
              <span className="text-purple-400">L1: {l1Count}</span>
              <span className="text-info">L2: {l2Count}</span>
              <span className="text-success">L3: {l3Count}</span>
            </div>
          </div>
          <div className="rounded bg-elevated p-2">
            <div className="text-xs text-text-secondary">By Status</div>
            <div className="mt-1 flex gap-2 text-xs">
              <span className="text-text-secondary">Plan: {plannedCount}</span>
              <span className="text-success">Act: {activeCount}</span>
              <span className="text-danger">Fail: {failedCount}</span>
            </div>
          </div>
        </div>

        {/* Sample Topology Selection */}
        <div className="space-y-2">
          <label className="block text-xs text-text-secondary">Sample Service Topologies</label>
          <select
            value={selectedTopology}
            onChange={(e) => setSelectedTopology(e.target.value as ServiceTopologyName)}
            className="w-full rounded border border-border bg-canvas px-2 py-1.5 text-sm text-white"
          >
            {(Object.keys(SERVICE_TOPOLOGIES) as ServiceTopologyName[]).map((key) => (
              <option key={key} value={key}>
                {SERVICE_TOPOLOGIES[key].name} - {SERVICE_TOPOLOGIES[key].description}
              </option>
            ))}
          </select>
          <button
            onClick={loadSampleTopology}
            className="w-full rounded bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700"
          >
            Load {SERVICE_TOPOLOGIES[selectedTopology].name}
          </button>
        </div>

        {/* Quick Create Service */}
        <div className="space-y-2">
          <label className="block text-xs text-text-secondary">Quick Create Service</label>
          <div className="space-y-2 rounded bg-elevated p-2">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={quickCreateSource}
                onChange={(e) => setQuickCreateSource(e.target.value)}
                className="rounded border border-border bg-tertiary px-2 py-1 text-xs text-white"
              >
                <option value="">Source...</option>
                {topology.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name || node.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <select
                value={quickCreateTarget}
                onChange={(e) => setQuickCreateTarget(e.target.value)}
                className="rounded border border-border bg-tertiary px-2 py-1 text-xs text-white"
              >
                <option value="">Target...</option>
                {topology.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name || node.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <select
                value={quickCreateType}
                onChange={(e) => setQuickCreateType(e.target.value as ServiceType)}
                className="flex-1 rounded border border-border bg-tertiary px-2 py-1 text-xs text-white"
              >
                <option value="l1-dwdm">L1 DWDM</option>
                <option value="l2-ethernet">L2 Ethernet</option>
                <option value="l3-ip">L3 IP</option>
              </select>
              <button
                onClick={handleQuickCreate}
                disabled={!quickCreateSource || !quickCreateTarget}
                className="rounded bg-success px-3 py-1 text-xs text-white hover:brightness-110 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>

        {/* Service List */}
        <div className="space-y-2">
          <label className="block text-xs text-text-secondary">Services ({services.length})</label>
          <div className="max-h-24 overflow-auto rounded border border-border">
            {services.length === 0 ? (
              <div className="p-2 text-xs text-text-muted">No services</div>
            ) : (
              services.map((service) => (
                <button
                  key={service.id}
                  onClick={() => {
                    setSelectedServiceId(service.id);
                    selectServices([service.id]);
                  }}
                  className={`w-full px-2 py-1 text-left text-xs ${
                    selectedServiceId === service.id
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:bg-elevated'
                  }`}
                >
                  <span className="font-mono">{service.id}</span>
                  <span className="ml-2 text-text-secondary">{service.name}</span>
                  <span
                    className={`ml-2 ${
                      service.status === 'active'
                        ? 'text-success'
                        : service.status === 'failed'
                          ? 'text-danger'
                          : 'text-text-secondary'
                    }`}
                  >
                    [{service.status}]
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Service Operations */}
        <div className="space-y-2">
          <label className="block text-xs text-text-secondary">Service Operations</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleActivate}
              disabled={!selectedServiceId}
              className="rounded bg-success px-3 py-2 text-sm text-white hover:brightness-110 disabled:opacity-50"
            >
              Activate
            </button>
            <button
              onClick={handleDeactivate}
              disabled={!selectedServiceId}
              className="rounded bg-warning px-3 py-2 text-sm text-white hover:brightness-110 disabled:opacity-50"
            >
              Deactivate
            </button>
            <button
              onClick={handleFail}
              disabled={!selectedServiceId}
              className="rounded bg-danger px-3 py-2 text-sm text-white hover:bg-danger-light disabled:opacity-50"
            >
              Mark Failed
            </button>
            <button
              onClick={handleDelete}
              disabled={!selectedServiceId}
              className="rounded bg-tertiary px-3 py-2 text-sm text-white hover:bg-tertiary disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Bulk Operations */}
        <div className="space-y-2">
          <label className="block text-xs text-text-secondary">Bulk Operations</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleBulkActivate}
              disabled={plannedCount === 0}
              className="bg-success/80 rounded px-2 py-1.5 text-xs text-white hover:brightness-110 disabled:opacity-50"
            >
              Activate All
            </button>
            <button
              onClick={handleBulkDeactivate}
              disabled={activeCount === 0}
              className="bg-warning/80 rounded px-2 py-1.5 text-xs text-white hover:brightness-110 disabled:opacity-50"
            >
              Deactivate All
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={services.length === 0}
              className="bg-danger/80 rounded px-2 py-1.5 text-xs text-white hover:bg-danger-light disabled:opacity-50"
            >
              Delete All
            </button>
          </div>
        </div>

        {/* Analysis Operations */}
        <div className="space-y-2">
          <label className="block text-xs text-text-secondary">Analysis</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleCheckChannels}
              disabled={!selectedServiceId}
              className="rounded bg-primary px-2 py-1.5 text-xs text-white hover:bg-primary-light disabled:opacity-50"
            >
              Channels
            </button>
            <button
              onClick={handleAnalyzeSRLG}
              disabled={l1Count < 2}
              className="rounded bg-primary px-2 py-1.5 text-xs text-white hover:bg-primary-light disabled:opacity-50"
            >
              SRLG
            </button>
            <button
              onClick={handleValidateService}
              disabled={!selectedServiceId}
              className="rounded bg-primary px-2 py-1.5 text-xs text-white hover:bg-primary-light disabled:opacity-50"
            >
              Validate
            </button>
          </div>
        </div>

        {/* Validation Tests Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs text-text-secondary">Validation Tests</label>
            <button
              onClick={() => setShowValidationTests(!showValidationTests)}
              className="text-xs text-text-muted hover:text-text-secondary"
            >
              {showValidationTests ? '▼ Hide' : '▶ Show'}
            </button>
          </div>

          {showValidationTests && (
            <div className="bg-elevated/50 space-y-3 rounded border border-border p-3">
              {/* L1 Service Tests */}
              <div>
                <div className="mb-1 text-xs font-medium text-purple-400">L1 Service Tests</div>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => {
                      const l1Service = services.find(isL1DWDMService);
                      if (l1Service) {
                        const result = testL1EndpointValidation(l1Service);
                        setValidationResults([result]);
                        setResults(formatValidationSummary([result]));
                      } else {
                        setResults('No L1 services available');
                      }
                    }}
                    disabled={l1Count === 0}
                    className="rounded bg-purple-700/50 px-2 py-1 text-xs text-purple-200 hover:bg-purple-700 disabled:opacity-50"
                  >
                    Endpoints
                  </button>
                  <button
                    onClick={() => {
                      const l1Service = services.find(isL1DWDMService);
                      if (l1Service) {
                        const result = testL1ChannelValidation(l1Service);
                        setValidationResults([result]);
                        setResults(formatValidationSummary([result]));
                      } else {
                        setResults('No L1 services available');
                      }
                    }}
                    disabled={l1Count === 0}
                    className="rounded bg-purple-700/50 px-2 py-1 text-xs text-purple-200 hover:bg-purple-700 disabled:opacity-50"
                  >
                    Channel
                  </button>
                  <button
                    onClick={() => {
                      const l1Service = services.find(isL1DWDMService);
                      if (l1Service) {
                        const result = testL1ModulationReach(l1Service);
                        setValidationResults([result]);
                        setResults(formatValidationSummary([result]));
                      } else {
                        setResults('No L1 services available');
                      }
                    }}
                    disabled={l1Count === 0}
                    className="rounded bg-purple-700/50 px-2 py-1 text-xs text-purple-200 hover:bg-purple-700 disabled:opacity-50"
                  >
                    Modulation
                  </button>
                  <button
                    onClick={() => {
                      const l1Service = services.find(isL1DWDMService);
                      if (l1Service) {
                        const result = testL1PathContinuity(l1Service);
                        setValidationResults([result]);
                        setResults(formatValidationSummary([result]));
                      } else {
                        setResults('No L1 services available');
                      }
                    }}
                    disabled={l1Count === 0}
                    className="rounded bg-purple-700/50 px-2 py-1 text-xs text-purple-200 hover:bg-purple-700 disabled:opacity-50"
                  >
                    Path
                  </button>
                  <button
                    onClick={() => {
                      const l1Service = services.find(isL1DWDMService);
                      if (l1Service) {
                        const result = testL1SRLGDiversity(l1Service);
                        setValidationResults([result]);
                        setResults(formatValidationSummary([result]));
                      } else {
                        setResults('No L1 services available');
                      }
                    }}
                    disabled={l1Count === 0}
                    className="rounded bg-purple-700/50 px-2 py-1 text-xs text-purple-200 hover:bg-purple-700 disabled:opacity-50"
                  >
                    SRLG
                  </button>
                </div>
              </div>

              {/* L2/L3 Service Tests */}
              <div>
                <div className="mb-1 text-xs font-medium text-info">L2/L3 Service Tests</div>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => {
                      const l2l3Service = services.find(isL2L3Service);
                      if (l2l3Service) {
                        const result = testL2L3UnderlayValidation(l2l3Service);
                        setValidationResults([result]);
                        setResults(formatValidationSummary([result]));
                      } else {
                        setResults('No L2/L3 services available');
                      }
                    }}
                    disabled={l2Count + l3Count === 0}
                    className="rounded bg-blue-700/50 px-2 py-1 text-xs text-blue-200 hover:bg-primary-light disabled:opacity-50"
                  >
                    Underlay
                  </button>
                  <button
                    onClick={() => {
                      const l2l3Service = services.find(isL2L3Service);
                      if (l2l3Service) {
                        const result = testL2L3CapacityValidation(l2l3Service);
                        setValidationResults([result]);
                        setResults(formatValidationSummary([result]));
                      } else {
                        setResults('No L2/L3 services available');
                      }
                    }}
                    disabled={l2Count + l3Count === 0}
                    className="rounded bg-blue-700/50 px-2 py-1 text-xs text-blue-200 hover:bg-primary-light disabled:opacity-50"
                  >
                    Capacity
                  </button>
                  <button
                    onClick={() => {
                      const l2l3Service = services.find(isL2L3Service);
                      if (l2l3Service) {
                        const result = testL2L3BFDConfig(l2l3Service);
                        setValidationResults([result]);
                        setResults(formatValidationSummary([result]));
                      } else {
                        setResults('No L2/L3 services available');
                      }
                    }}
                    disabled={l2Count + l3Count === 0}
                    className="rounded bg-blue-700/50 px-2 py-1 text-xs text-blue-200 hover:bg-primary-light disabled:opacity-50"
                  >
                    BFD Config
                  </button>
                  <button
                    onClick={() => {
                      const l2l3Service = services.find(isL2L3Service);
                      if (l2l3Service) {
                        const result = testL2L3SharedPortion(l2l3Service);
                        setValidationResults([result]);
                        setResults(formatValidationSummary([result]));
                      } else {
                        setResults('No L2/L3 services available');
                      }
                    }}
                    disabled={l2Count + l3Count === 0}
                    className="rounded bg-blue-700/50 px-2 py-1 text-xs text-blue-200 hover:bg-primary-light disabled:opacity-50"
                  >
                    Shared Portion
                  </button>
                </div>
              </div>

              {/* Lifecycle & Integration Tests */}
              <div>
                <div className="mb-1 text-xs font-medium text-amber-400">Lifecycle & Integration</div>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => {
                      const result = testStatusTransitions();
                      setValidationResults([result]);
                      setResults(formatValidationSummary([result]));
                    }}
                    disabled={services.length === 0}
                    className="rounded bg-amber-700/50 px-2 py-1 text-xs text-amber-200 hover:bg-amber-700 disabled:opacity-50"
                  >
                    Status
                  </button>
                  <button
                    onClick={() => {
                      const result = testDependencyBlocking();
                      setValidationResults([result]);
                      setResults(formatValidationSummary([result]));
                    }}
                    disabled={l1Count === 0}
                    className="rounded bg-amber-700/50 px-2 py-1 text-xs text-amber-200 hover:bg-amber-700 disabled:opacity-50"
                  >
                    Dependency
                  </button>
                  <button
                    onClick={() => {
                      const result = testChannelConflictDetection();
                      setValidationResults([result]);
                      setResults(formatValidationSummary([result]));
                    }}
                    disabled={l1Count < 2}
                    className="rounded bg-amber-700/50 px-2 py-1 text-xs text-amber-200 hover:bg-amber-700 disabled:opacity-50"
                  >
                    Conflicts
                  </button>
                </div>
              </div>

              {/* Run All / Run on Selected */}
              <div className="flex gap-2 border-t border-border pt-2">
                <button
                  onClick={runAllValidationTests}
                  disabled={services.length === 0 || runningTests}
                  className="flex-1 rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {runningTests ? 'Running...' : 'Run All Tests'}
                </button>
                <button
                  onClick={runSelectedServiceTests}
                  disabled={!selectedServiceId || runningTests}
                  className="flex-1 rounded bg-tertiary px-3 py-1.5 text-xs text-white hover:bg-tertiary disabled:opacity-50"
                >
                  Run on Selected
                </button>
              </div>

              {/* Quick Results Summary */}
              {validationResults.length > 0 && (
                <div className="flex items-center gap-4 border-t border-border pt-2 text-xs">
                  <span className="text-success">
                    {STATUS_CONFIG.pass.icon} {validationResults.filter((r) => r.status === 'pass').length}
                  </span>
                  <span className="text-danger">
                    {STATUS_CONFIG.fail.icon} {validationResults.filter((r) => r.status === 'fail').length}
                  </span>
                  <span className="text-warning">
                    {STATUS_CONFIG.warning.icon} {validationResults.filter((r) => r.status === 'warning').length}
                  </span>
                  <span className="text-text-secondary">
                    {STATUS_CONFIG.skip.icon} {validationResults.filter((r) => r.status === 'skip').length}
                  </span>
                  <span className="ml-auto text-text-muted">
                    {formatElapsedTime(validationResults.reduce((sum, r) => sum + r.elapsedMs, 0))}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1">
          <label className="mb-1 block text-xs text-text-secondary">Results</label>
          <pre className="min-h-[80px] whitespace-pre-wrap rounded bg-elevated p-3 font-mono text-xs text-success">
            {results || 'Load a sample topology or create a service...'}
          </pre>
        </div>
      </div>
    </div>
  );
};
