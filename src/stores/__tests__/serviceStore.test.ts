import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useServiceStore, _clearDefragInFlight } from '../serviceStore';
import type { DefragPlan } from '@/core/services/DefragmentationEngine';
import type {
  L1DWDMService,
  L2L3Service,
  ServicePath,
} from '@/types/service';

// Mock eventStore to prevent side effects
vi.mock('../eventStore', () => ({
  logNetworkEvent: vi.fn(),
}));

describe('serviceStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useServiceStore.setState({
      services: [],
      idCounters: { l1: 0, l2: 0, l3: 0 },
      selectedServiceIds: [],
      filters: {},
      sortBy: 'createdAt',
      sortDirection: 'desc',
      defragVersion: 0,
    });
    _clearDefragInFlight();
  });

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  describe('CRUD Operations', () => {
    const mockWorkingPath: ServicePath = {
      id: 'path-1',
      type: 'working',
      nodeIds: ['node-1', 'node-2', 'node-3'],
      edgeIds: ['edge-1', 'edge-2'],
      totalDistance: 100,
      hopCount: 2,
      status: 'computed',
    };

    const mockL1Service: Omit<L1DWDMService, 'id' | 'createdAt' | 'modifiedAt'> = {
      name: 'Test L1 Service',
      type: 'l1-dwdm',
      status: 'planned',
      sourceNodeId: 'node-1',
      sourcePortId: 'port-1',
      destinationNodeId: 'node-3',
      destinationPortId: 'port-2',
      dataRate: '100G',
      modulationType: 'DP-QPSK',
      channelWidth: '50GHz',
      wavelengthMode: 'continuous',
      channelNumber: 35,
      workingPath: mockWorkingPath,
      protectionScheme: 'olp',
      restorationEnabled: false,
      metadata: {},
    };

    const mockL2Service: Omit<L2L3Service, 'id' | 'createdAt' | 'modifiedAt'> = {
      name: 'Test L2 Service',
      type: 'l2-ethernet',
      status: 'planned',
      sourceNodeId: 'node-1',
      sourcePortId: 'port-3',
      destinationNodeId: 'node-3',
      destinationPortId: 'port-4',
      dataRate: '10G',
      underlayServiceId: 'L1-001',
      underlayAutoCreated: false,
      protectionScheme: 'none',
      bfdConfig: {
        enabled: false,
        minTxInterval: 300000,
        minRxInterval: 300000,
        multiplier: 3,
      },
      metadata: {},
    };

    describe('addService', () => {
      it('should add L1 service with auto-generated ID', () => {
        const { addService, getService } = useServiceStore.getState();

        const id = addService(mockL1Service);

        expect(id).toBe('L1-001');

        const service = getService(id);
        expect(service).toBeDefined();
        expect(service?.name).toBe('Test L1 Service');
        expect(service?.type).toBe('l1-dwdm');
        expect(service?.createdAt).toBeDefined();
        expect(service?.modifiedAt).toBeDefined();
      });

      it('should add L2 service with auto-generated ID', () => {
        const { addService, getService } = useServiceStore.getState();

        const id = addService(mockL2Service);

        expect(id).toBe('L2-001');

        const service = getService(id);
        expect(service).toBeDefined();
        expect(service?.name).toBe('Test L2 Service');
        expect(service?.type).toBe('l2-ethernet');
      });

      it('should add L3 service with auto-generated ID', () => {
        const { addService, getService } = useServiceStore.getState();

        const l3Service = { ...mockL2Service, type: 'l3-ip' as const, name: 'Test L3 Service' };
        const id = addService(l3Service);

        expect(id).toBe('L3-001');

        const service = getService(id);
        expect(service?.type).toBe('l3-ip');
      });

      it('should increment ID counters correctly', () => {
        const { addService } = useServiceStore.getState();

        const id1 = addService(mockL1Service);
        const id2 = addService(mockL1Service);
        const id3 = addService(mockL2Service);

        expect(id1).toBe('L1-001');
        expect(id2).toBe('L1-002');
        expect(id3).toBe('L2-001');

        const { idCounters } = useServiceStore.getState();
        expect(idCounters.l1).toBe(2);
        expect(idCounters.l2).toBe(1);
        expect(idCounters.l3).toBe(0);
      });
    });

    describe('updateService', () => {
      it('should update service properties', () => {
        const { addService, updateService, getService } = useServiceStore.getState();

        const id = addService(mockL1Service);

        updateService(id, { name: 'Updated Name', status: 'active' });

        const updated = getService(id);
        expect(updated?.name).toBe('Updated Name');
        expect(updated?.status).toBe('active');
        expect(updated?.id).toBe(id); // ID should not change
        expect(updated?.type).toBe('l1-dwdm'); // Type should not change
        expect(updated?.modifiedAt).toBeDefined(); // modifiedAt should be set
      });

      it('should not allow changing id, type, or createdAt', () => {
        const { addService, updateService, getService } = useServiceStore.getState();

        const id = addService(mockL1Service);
        const original = getService(id);
        const originalCreatedAt = original?.createdAt;

        updateService(id, {
          id: 'hacked-id',
          type: 'l2-ethernet',
          createdAt: '1999-01-01T00:00:00Z',
        } as Partial<L1DWDMService>);

        const updated = getService(id);
        expect(updated?.id).toBe(id);
        expect(updated?.type).toBe('l1-dwdm');
        expect(updated?.createdAt).toBe(originalCreatedAt);
      });
    });

    describe('removeService', () => {
      it('should remove service without dependents', () => {
        const { addService, removeService, getService } = useServiceStore.getState();

        const id = addService(mockL1Service);
        expect(getService(id)).toBeDefined();

        const result = removeService(id);

        expect(result.success).toBe(true);
        expect(getService(id)).toBeUndefined();
      });

      it('should block deletion of L1 service with dependent L2 service', () => {
        const { addService, removeService, getService } = useServiceStore.getState();

        const l1Id = addService(mockL1Service);
        const l2Service = { ...mockL2Service, underlayServiceId: l1Id };
        addService(l2Service);

        const result = removeService(l1Id);

        expect(result.success).toBe(false);
        expect(result.blockers).toBeDefined();
        expect(result.blockers?.length).toBeGreaterThan(0);
        expect(getService(l1Id)).toBeDefined(); // Should still exist
      });

      it('should remove selection when service is deleted', () => {
        const { addService, removeService, selectServices } =
          useServiceStore.getState();

        const id = addService(mockL1Service);
        selectServices([id]);
        expect(useServiceStore.getState().selectedServiceIds).toContain(id);

        removeService(id);
        expect(useServiceStore.getState().selectedServiceIds).not.toContain(id);
      });
    });

    describe('removeServices (bulk)', () => {
      it('should remove multiple services and report blocked ones', () => {
        const { addService, removeServices } = useServiceStore.getState();

        const l1Id = addService(mockL1Service);
        // Use different channel (36 instead of 35) to avoid conflict
        const l1Id2 = addService({ ...mockL1Service, name: 'L1 Service 2', channelNumber: 36 });
        const l2Service = { ...mockL2Service, underlayServiceId: l1Id };
        addService(l2Service);

        const result = removeServices([l1Id, l1Id2]);

        expect(result.removed).toContain(l1Id2);
        expect(result.blocked).toHaveLength(1);
        expect(result.blocked[0].id).toBe(l1Id);
      });
    });
  });

  // ============================================================================
  // QUERY OPERATIONS
  // ============================================================================

  describe('Query Operations', () => {
    const createMockServices = () => {
      const { addService } = useServiceStore.getState();

      // Add L1 services
      addService({
        name: 'L1 Service A-B',
        type: 'l1-dwdm',
        status: 'active',
        sourceNodeId: 'node-a',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-b',
        destinationPortId: 'port-2',
        dataRate: '100G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        workingPath: {
          id: 'path-1',
          type: 'working',
          nodeIds: ['node-a', 'node-c', 'node-b'],
          edgeIds: ['edge-1', 'edge-2'],
          totalDistance: 100,
          hopCount: 2,
          status: 'active',
        },
        protectionScheme: 'olp',
        restorationEnabled: false,
        metadata: {},
      });

      addService({
        name: 'L1 Service A-B 2',
        type: 'l1-dwdm',
        status: 'planned',
        sourceNodeId: 'node-a',
        sourcePortId: 'port-3',
        destinationNodeId: 'node-b',
        destinationPortId: 'port-4',
        dataRate: '10G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        workingPath: {
          id: 'path-2',
          type: 'working',
          nodeIds: ['node-a', 'node-d', 'node-b'],
          edgeIds: ['edge-3', 'edge-4'],
          totalDistance: 150,
          hopCount: 2,
          status: 'computed',
        },
        protectionScheme: 'none',
        restorationEnabled: false,
        metadata: {},
      });
    };

    describe('getServicesByNode', () => {
      it('should return services using a node as endpoint', () => {
        createMockServices();
        const { getServicesByNode } = useServiceStore.getState();

        const services = getServicesByNode('node-a');
        expect(services).toHaveLength(2);
      });

      it('should return services using a node in path', () => {
        createMockServices();
        const { getServicesByNode } = useServiceStore.getState();

        const services = getServicesByNode('node-c');
        expect(services).toHaveLength(1);
      });

      it('should return empty array for unused node', () => {
        createMockServices();
        const { getServicesByNode } = useServiceStore.getState();

        const services = getServicesByNode('node-unused');
        expect(services).toHaveLength(0);
      });
    });

    describe('getServicesByEdge', () => {
      it('should return services using an edge in working path', () => {
        createMockServices();
        const { getServicesByEdge } = useServiceStore.getState();

        const services = getServicesByEdge('edge-1');
        expect(services).toHaveLength(1);
      });

      it('should return empty array for unused edge', () => {
        createMockServices();
        const { getServicesByEdge } = useServiceStore.getState();

        const services = getServicesByEdge('edge-unused');
        expect(services).toHaveLength(0);
      });
    });

    describe('getL1ServicesForEndpoints', () => {
      it('should return active L1 services between endpoints', () => {
        createMockServices();
        const { getL1ServicesForEndpoints } = useServiceStore.getState();

        const services = getL1ServicesForEndpoints('node-a', 'node-b');
        expect(services).toHaveLength(1); // Only active one
        expect(services[0].status).toBe('active');
      });

      it('should filter by minimum data rate', () => {
        createMockServices();
        const { getL1ServicesForEndpoints } = useServiceStore.getState();

        const services = getL1ServicesForEndpoints('node-a', 'node-b', '100G');
        expect(services).toHaveLength(1);
        expect(services[0].dataRate).toBe('100G');
      });

      it('should return services for reversed endpoint order', () => {
        createMockServices();
        const { getL1ServicesForEndpoints } = useServiceStore.getState();

        const services = getL1ServicesForEndpoints('node-b', 'node-a');
        expect(services).toHaveLength(1);
      });
    });

    describe('getDependentServices', () => {
      it('should return L2/L3 services depending on L1 service', () => {
        const { addService, getDependentServices } = useServiceStore.getState();

        const l1Id = addService({
          name: 'L1 Service',
          type: 'l1-dwdm',
          status: 'active',
          sourceNodeId: 'node-a',
          sourcePortId: 'port-1',
          destinationNodeId: 'node-b',
          destinationPortId: 'port-2',
          dataRate: '100G',
          modulationType: 'DP-QPSK',
          channelWidth: '50GHz',
          wavelengthMode: 'continuous',
          workingPath: {
            id: 'path-1',
            type: 'working',
            nodeIds: ['node-a', 'node-b'],
            edgeIds: ['edge-1'],
            totalDistance: 50,
            hopCount: 1,
            status: 'active',
          },
          protectionScheme: 'none',
          restorationEnabled: false,
          metadata: {},
        });

        addService({
          name: 'L2 Service',
          type: 'l2-ethernet',
          status: 'planned',
          sourceNodeId: 'node-a',
          sourcePortId: 'port-3',
          destinationNodeId: 'node-b',
          destinationPortId: 'port-4',
          dataRate: '10G',
          underlayServiceId: l1Id,
          underlayAutoCreated: false,
          protectionScheme: 'none',
          bfdConfig: {
            enabled: false,
            minTxInterval: 300000,
            minRxInterval: 300000,
            multiplier: 3,
          },
          metadata: {},
        });

        const dependents = getDependentServices(l1Id);
        expect(dependents).toHaveLength(1);
        expect(dependents[0].type).toBe('l2-ethernet');
      });
    });
  });

  // ============================================================================
  // SELECTION OPERATIONS
  // ============================================================================

  describe('Selection Operations', () => {
    it('should select services', () => {
      const { addService, selectServices } = useServiceStore.getState();

      const id1 = addService({
        name: 'Service 1',
        type: 'l1-dwdm',
        status: 'planned',
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        workingPath: {
          id: 'path-1',
          type: 'working',
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed',
        },
        protectionScheme: 'none',
        restorationEnabled: false,
        metadata: {},
      });

      selectServices([id1]);
      expect(useServiceStore.getState().selectedServiceIds).toEqual([id1]);
    });

    it('should append to selection', () => {
      const { addService, selectServices } = useServiceStore.getState();

      const mockService = {
        name: 'Service',
        type: 'l1-dwdm' as const,
        status: 'planned' as const,
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G' as const,
        modulationType: 'DP-QPSK' as const,
        channelWidth: '50GHz' as const,
        wavelengthMode: 'continuous' as const,
        workingPath: {
          id: 'path-1',
          type: 'working' as const,
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed' as const,
        },
        protectionScheme: 'none' as const,
        restorationEnabled: false,
        metadata: {},
      };

      const id1 = addService(mockService);
      const id2 = addService({ ...mockService, name: 'Service 2' });

      selectServices([id1]);
      selectServices([id2], true);

      expect(useServiceStore.getState().selectedServiceIds).toContain(id1);
      expect(useServiceStore.getState().selectedServiceIds).toContain(id2);
    });

    it('should clear selection', () => {
      const { addService, selectServices, clearSelection } = useServiceStore.getState();

      const id = addService({
        name: 'Service',
        type: 'l1-dwdm',
        status: 'planned',
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        workingPath: {
          id: 'path-1',
          type: 'working',
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed',
        },
        protectionScheme: 'none',
        restorationEnabled: false,
        metadata: {},
      });

      selectServices([id]);
      clearSelection();

      expect(useServiceStore.getState().selectedServiceIds).toHaveLength(0);
    });

    it('should select all services', () => {
      const { addService, selectAll } = useServiceStore.getState();

      const mockService = {
        name: 'Service',
        type: 'l1-dwdm' as const,
        status: 'planned' as const,
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G' as const,
        modulationType: 'DP-QPSK' as const,
        channelWidth: '50GHz' as const,
        wavelengthMode: 'continuous' as const,
        workingPath: {
          id: 'path-1',
          type: 'working' as const,
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed' as const,
        },
        protectionScheme: 'none' as const,
        restorationEnabled: false,
        metadata: {},
      };

      addService(mockService);
      addService({ ...mockService, name: 'Service 2' });
      addService({ ...mockService, name: 'Service 3' });

      selectAll();

      expect(useServiceStore.getState().selectedServiceIds).toHaveLength(3);
    });
  });

  // ============================================================================
  // FILTERING & SORTING
  // ============================================================================

  describe('Filtering & Sorting', () => {
    const createTestServices = () => {
      const { addService } = useServiceStore.getState();

      const baseL1 = {
        type: 'l1-dwdm' as const,
        sourcePortId: 'port-1',
        destinationPortId: 'port-2',
        modulationType: 'DP-QPSK' as const,
        channelWidth: '50GHz' as const,
        wavelengthMode: 'continuous' as const,
        workingPath: {
          id: 'path-1',
          type: 'working' as const,
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed' as const,
        },
        protectionScheme: 'none' as const,
        restorationEnabled: false,
        metadata: {},
      };

      addService({
        ...baseL1,
        name: 'Alpha Service',
        status: 'active',
        sourceNodeId: 'node-a',
        destinationNodeId: 'node-b',
        dataRate: '100G',
      });

      addService({
        ...baseL1,
        name: 'Beta Service',
        status: 'planned',
        sourceNodeId: 'node-a',
        destinationNodeId: 'node-c',
        dataRate: '10G',
      });

      addService({
        ...baseL1,
        name: 'Gamma Service',
        status: 'failed',
        sourceNodeId: 'node-b',
        destinationNodeId: 'node-c',
        dataRate: '400G',
      });
    };

    describe('setFilters', () => {
      it('should filter by status', () => {
        createTestServices();
        const { setFilters, getFilteredServices } = useServiceStore.getState();

        setFilters({ status: ['active'] });

        const filtered = getFilteredServices();
        expect(filtered).toHaveLength(1);
        expect(filtered[0].status).toBe('active');
      });

      it('should filter by search query', () => {
        createTestServices();
        const { setFilters, getFilteredServices } = useServiceStore.getState();

        setFilters({ searchQuery: 'beta' });

        const filtered = getFilteredServices();
        expect(filtered).toHaveLength(1);
        expect(filtered[0].name).toBe('Beta Service');
      });

      it('should filter by source node', () => {
        createTestServices();
        const { setFilters, getFilteredServices } = useServiceStore.getState();

        setFilters({ sourceNodeId: 'node-a' });

        const filtered = getFilteredServices();
        expect(filtered).toHaveLength(2);
      });

      it('should filter by data rate', () => {
        createTestServices();
        const { setFilters, getFilteredServices } = useServiceStore.getState();

        setFilters({ dataRate: ['100G', '400G'] });

        const filtered = getFilteredServices();
        expect(filtered).toHaveLength(2);
      });

      it('should combine multiple filters', () => {
        createTestServices();
        const { setFilters, getFilteredServices } = useServiceStore.getState();

        setFilters({ status: ['active', 'planned'], sourceNodeId: 'node-a' });

        const filtered = getFilteredServices();
        expect(filtered).toHaveLength(2);
      });
    });

    describe('clearFilters', () => {
      it('should clear all filters', () => {
        createTestServices();
        const { setFilters, clearFilters, getFilteredServices } =
          useServiceStore.getState();

        setFilters({ status: ['active'] });
        expect(getFilteredServices()).toHaveLength(1);

        clearFilters();
        expect(getFilteredServices()).toHaveLength(3);
      });
    });

    describe('setSort', () => {
      it('should sort by name ascending', () => {
        createTestServices();
        const { setSort, getFilteredServices } = useServiceStore.getState();

        setSort('name', 'asc');

        const sorted = getFilteredServices();
        expect(sorted[0].name).toBe('Alpha Service');
        expect(sorted[2].name).toBe('Gamma Service');
      });

      it('should sort by name descending', () => {
        createTestServices();
        const { setSort, getFilteredServices } = useServiceStore.getState();

        setSort('name', 'desc');

        const sorted = getFilteredServices();
        expect(sorted[0].name).toBe('Gamma Service');
        expect(sorted[2].name).toBe('Alpha Service');
      });

      it('should sort by data rate', () => {
        createTestServices();
        const { setSort, getFilteredServices } = useServiceStore.getState();

        setSort('dataRate', 'asc');

        const sorted = getFilteredServices();
        expect(sorted[0].dataRate).toBe('10G');
        expect(sorted[2].dataRate).toBe('400G');
      });

      it('should toggle direction when same field clicked', () => {
        createTestServices();
        const { setSort } = useServiceStore.getState();

        setSort('name', 'asc');
        expect(useServiceStore.getState().sortDirection).toBe('asc');

        setSort('name'); // No direction - should toggle
        expect(useServiceStore.getState().sortDirection).toBe('desc');
      });
    });
  });

  // ============================================================================
  // STATUS MANAGEMENT
  // ============================================================================

  describe('Status Management', () => {
    const addTestService = () => {
      const { addService } = useServiceStore.getState();
      return addService({
        name: 'Test Service',
        type: 'l1-dwdm',
        status: 'planned',
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        workingPath: {
          id: 'path-1',
          type: 'working',
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed',
        },
        protectionScheme: 'none',
        restorationEnabled: false,
        metadata: {},
      });
    };

    it('should activate service', () => {
      const id = addTestService();
      const { activateService, getService } = useServiceStore.getState();

      activateService(id);

      expect(getService(id)?.status).toBe('active');
    });

    it('should deactivate service', () => {
      const id = addTestService();
      const { activateService, deactivateService, getService } =
        useServiceStore.getState();

      activateService(id);
      deactivateService(id);

      expect(getService(id)?.status).toBe('maintenance');
    });

    it('should fail service', () => {
      const id = addTestService();
      const { failService, getService } = useServiceStore.getState();

      failService(id);

      expect(getService(id)?.status).toBe('failed');
    });

    it('should set arbitrary status', () => {
      const id = addTestService();
      const { setServiceStatus, getService } = useServiceStore.getState();

      setServiceStatus(id, 'provisioning');

      expect(getService(id)?.status).toBe('provisioning');
    });
  });

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  describe('Bulk Operations', () => {
    const createBulkServices = () => {
      const { addService } = useServiceStore.getState();

      const baseService = {
        type: 'l1-dwdm' as const,
        status: 'planned' as const,
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G' as const,
        modulationType: 'DP-QPSK' as const,
        channelWidth: '50GHz' as const,
        wavelengthMode: 'continuous' as const,
        workingPath: {
          id: 'path-1',
          type: 'working' as const,
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed' as const,
        },
        protectionScheme: 'none' as const,
        restorationEnabled: false,
        metadata: {},
      };

      const ids = [
        addService({ ...baseService, name: 'Service 1' }),
        addService({ ...baseService, name: 'Service 2' }),
        addService({ ...baseService, name: 'Service 3' }),
      ];

      return ids;
    };

    it('should bulk activate services', () => {
      const ids = createBulkServices();
      const { bulkActivate, getService } = useServiceStore.getState();

      bulkActivate(ids);

      for (const id of ids) {
        expect(getService(id)?.status).toBe('active');
      }
    });

    it('should bulk deactivate services', () => {
      const ids = createBulkServices();
      const { bulkActivate, bulkDeactivate, getService } = useServiceStore.getState();

      bulkActivate(ids);
      bulkDeactivate(ids);

      for (const id of ids) {
        expect(getService(id)?.status).toBe('maintenance');
      }
    });
  });

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  describe('Import/Export', () => {
    it('should export all services', () => {
      const { addService, exportServices } = useServiceStore.getState();

      addService({
        name: 'Service 1',
        type: 'l1-dwdm',
        status: 'planned',
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        workingPath: {
          id: 'path-1',
          type: 'working',
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed',
        },
        protectionScheme: 'none',
        restorationEnabled: false,
        metadata: {},
      });

      const exported = exportServices();
      expect(exported).toHaveLength(1);
      expect(exported[0].id).toBe('L1-001');
    });

    it('should export selected services', () => {
      const { addService, exportServices } = useServiceStore.getState();

      const baseService = {
        type: 'l1-dwdm' as const,
        status: 'planned' as const,
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G' as const,
        modulationType: 'DP-QPSK' as const,
        channelWidth: '50GHz' as const,
        wavelengthMode: 'continuous' as const,
        workingPath: {
          id: 'path-1',
          type: 'working' as const,
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed' as const,
        },
        protectionScheme: 'none' as const,
        restorationEnabled: false,
        metadata: {},
      };

      const id1 = addService({ ...baseService, name: 'Service 1' });
      addService({ ...baseService, name: 'Service 2' });

      const exported = exportServices([id1]);
      expect(exported).toHaveLength(1);
      expect(exported[0].id).toBe(id1);
    });

    it('should import services and update counters', () => {
      const { importServices } = useServiceStore.getState();

      const servicesToImport: L1DWDMService[] = [
        {
          id: 'L1-005',
          name: 'Imported Service',
          type: 'l1-dwdm',
          status: 'active',
          sourceNodeId: 'node-1',
          sourcePortId: 'port-1',
          destinationNodeId: 'node-2',
          destinationPortId: 'port-2',
          dataRate: '100G',
          modulationType: 'DP-QPSK',
          channelWidth: '50GHz',
          wavelengthMode: 'continuous',
          workingPath: {
            id: 'path-1',
            type: 'working',
            nodeIds: ['node-1', 'node-2'],
            edgeIds: ['edge-1'],
            totalDistance: 50,
            hopCount: 1,
            status: 'active',
          },
          protectionScheme: 'none',
          restorationEnabled: false,
          createdAt: '2024-01-01T00:00:00Z',
          modifiedAt: '2024-01-01T00:00:00Z',
          metadata: {},
        },
      ];

      importServices(servicesToImport);

      const state = useServiceStore.getState();
      expect(state.services).toHaveLength(1);
      expect(state.idCounters.l1).toBe(5);
    });

    it('should not import duplicate IDs', () => {
      const { addService, importServices } = useServiceStore.getState();

      addService({
        name: 'Existing Service',
        type: 'l1-dwdm',
        status: 'planned',
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        workingPath: {
          id: 'path-1',
          type: 'working',
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed',
        },
        protectionScheme: 'none',
        restorationEnabled: false,
        metadata: {},
      });

      const servicesToImport: L1DWDMService[] = [
        {
          id: 'L1-001', // Duplicate ID
          name: 'Duplicate Service',
          type: 'l1-dwdm',
          status: 'active',
          sourceNodeId: 'node-1',
          sourcePortId: 'port-1',
          destinationNodeId: 'node-2',
          destinationPortId: 'port-2',
          dataRate: '100G',
          modulationType: 'DP-QPSK',
          channelWidth: '50GHz',
          wavelengthMode: 'continuous',
          workingPath: {
            id: 'path-1',
            type: 'working',
            nodeIds: ['node-1', 'node-2'],
            edgeIds: ['edge-1'],
            totalDistance: 50,
            hopCount: 1,
            status: 'active',
          },
          protectionScheme: 'none',
          restorationEnabled: false,
          createdAt: '2024-01-01T00:00:00Z',
          modifiedAt: '2024-01-01T00:00:00Z',
          metadata: {},
        },
      ];

      importServices(servicesToImport);

      const state = useServiceStore.getState();
      expect(state.services).toHaveLength(1);
      expect(state.services[0].name).toBe('Existing Service'); // Original kept
    });
  });

  // ============================================================================
  // UTILITY OPERATIONS
  // ============================================================================

  describe('Utility Operations', () => {
    it('should clear all services', () => {
      const { addService, clearAllServices } = useServiceStore.getState();

      addService({
        name: 'Service 1',
        type: 'l1-dwdm',
        status: 'planned',
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        workingPath: {
          id: 'path-1',
          type: 'working',
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed',
        },
        protectionScheme: 'none',
        restorationEnabled: false,
        metadata: {},
      });

      clearAllServices();

      const state = useServiceStore.getState();
      expect(state.services).toHaveLength(0);
      expect(state.selectedServiceIds).toHaveLength(0);
      expect(state.idCounters).toEqual({ l1: 0, l2: 0, l3: 0 });
    });
  });

  // ============================================================================
  // DEFRAG VERSION & applyDefragMoves (T025-T027)
  // ============================================================================

  describe('Defragmentation: defragVersion + applyDefragMoves', () => {
    const seedL1Service = (channelNumber = 35): string => {
      return useServiceStore.getState().addService({
        name: 'Defrag Test L1',
        type: 'l1-dwdm',
        status: 'planned',
        sourceNodeId: 'node-1',
        sourcePortId: 'port-1',
        destinationNodeId: 'node-2',
        destinationPortId: 'port-2',
        dataRate: '100G',
        modulationType: 'DP-QPSK',
        channelWidth: '50GHz',
        wavelengthMode: 'continuous',
        channelNumber,
        workingPath: {
          id: 'path-1',
          type: 'working',
          nodeIds: ['node-1', 'node-2'],
          edgeIds: ['edge-1'],
          totalDistance: 50,
          hopCount: 1,
          status: 'computed',
          channelNumber,
        },
        protectionScheme: 'none',
        restorationEnabled: false,
        metadata: {},
      });
    };

    const buildPlan = (id: string, serviceId: string, fromCh: number, toCh: number): DefragPlan => ({
      id,
      strategy: 'minimal_moves',
      targetEdgeIds: ['edge-1'],
      processedEdgeIds: ['edge-1'],
      truncated: false,
      maxMoves: 5000,
      moves: [
        {
          edgeId: 'edge-1',
          serviceId,
          fromChannel: fromCh,
          toChannel: toCh,
          risk: 'low',
          estimatedDowntime: 0,
        },
      ],
      beforeMetrics: { avgFragmentation: 0.5, worstFragmentation: 0.5 },
      afterMetrics: { avgFragmentation: 0.1, worstFragmentation: 0.1 },
      estimatedImpact: {
        servicesAffected: 1,
        totalMoves: 1,
        estimatedDowntime: 0,
        riskSummary: { low: 1, medium: 0, high: 0 },
      },
    });

    beforeEach(() => {
      _clearDefragInFlight();
    });

    it('initializes defragVersion to 0', () => {
      expect(useServiceStore.getState().defragVersion).toBe(0);
    });

    it('bumpDefragVersion() increments the counter', () => {
      const { bumpDefragVersion } = useServiceStore.getState();
      bumpDefragVersion();
      expect(useServiceStore.getState().defragVersion).toBe(1);
      bumpDefragVersion();
      expect(useServiceStore.getState().defragVersion).toBe(2);
    });

    it('increments defragVersion by 1 on a successful applyDefragMoves', () => {
      const serviceId = seedL1Service(35);
      const plan = buildPlan('plan-success-1', serviceId, 35, 40);

      const before = useServiceStore.getState().defragVersion;
      const result = useServiceStore.getState().applyDefragMoves(plan);

      expect(result.success).toBe(true);
      expect(result.appliedMoveCount).toBe(1);
      expect(useServiceStore.getState().defragVersion).toBe(before + 1);

      // Service was actually mutated
      const updated = useServiceStore.getState().getService(serviceId);
      expect(updated?.type === 'l1-dwdm' && updated.channelNumber).toBe(40);
    });

    it('does NOT increment defragVersion on validation failure', () => {
      // Reference an unknown service id — validateDefragMoves marks it invalid
      const plan = buildPlan('plan-fail-1', 'L1-DOES-NOT-EXIST', 35, 40);

      const before = useServiceStore.getState().defragVersion;
      const result = useServiceStore.getState().applyDefragMoves(plan);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(useServiceStore.getState().defragVersion).toBe(before);
    });

    it('is idempotent: a duplicate apply for the same plan id within 500ms does not double-bump', () => {
      const serviceId = seedL1Service(35);
      const plan = buildPlan('plan-idem-1', serviceId, 35, 40);

      const before = useServiceStore.getState().defragVersion;

      const r1 = useServiceStore.getState().applyDefragMoves(plan);
      const r2 = useServiceStore.getState().applyDefragMoves(plan);

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      // Second call short-circuits via the cooldown guard; appliedMoveCount === 0
      expect(r2.appliedMoveCount).toBe(0);

      // Counter only bumped once.
      expect(useServiceStore.getState().defragVersion).toBe(before + 1);
    });

    it('different plan ids each bump defragVersion independently', () => {
      const serviceId = seedL1Service(35);
      const planA = buildPlan('plan-a', serviceId, 35, 40);
      const planB = buildPlan('plan-b', serviceId, 40, 45);

      const before = useServiceStore.getState().defragVersion;

      const ra = useServiceStore.getState().applyDefragMoves(planA);
      expect(ra.success).toBe(true);
      const rb = useServiceStore.getState().applyDefragMoves(planB);
      expect(rb.success).toBe(true);

      expect(useServiceStore.getState().defragVersion).toBe(before + 2);
    });

    // ========================================================================
    // T061 — Phase 9 auto-refresh integration:
    // subscribers observe defragVersion change and react accordingly.
    // ========================================================================
    it('notifies subscribers when defragVersion changes after applyDefragMoves', () => {
      const serviceId = seedL1Service(35);
      const plan = buildPlan('plan-sub-1', serviceId, 35, 40);

      const observed: number[] = [];
      const unsubscribe = useServiceStore.subscribe((state, prev) => {
        if (state.defragVersion !== prev.defragVersion) {
          observed.push(state.defragVersion);
        }
      });

      const before = useServiceStore.getState().defragVersion;
      const result = useServiceStore.getState().applyDefragMoves(plan);
      unsubscribe();

      expect(result.success).toBe(true);
      expect(observed).toEqual([before + 1]);
    });

    it('idempotent re-entrant applies do not emit a second defragVersion change', () => {
      const serviceId = seedL1Service(35);
      const plan = buildPlan('plan-sub-2', serviceId, 35, 40);

      const observed: number[] = [];
      const unsubscribe = useServiceStore.subscribe((state, prev) => {
        if (state.defragVersion !== prev.defragVersion) {
          observed.push(state.defragVersion);
        }
      });

      useServiceStore.getState().applyDefragMoves(plan);
      // Second call within cooldown — must not emit another version change.
      useServiceStore.getState().applyDefragMoves(plan);
      unsubscribe();

      expect(observed.length).toBe(1);
    });
  });
});
