import { describe, it, expect, beforeEach } from 'vitest';
import { useNetworkStore } from '../networkStore';
import type { CardDefinition } from '@/types/inventory';
import { DEFAULT_CARD_LIBRARY } from '@/types/inventory';
import type { ChassisDefinition } from '@/types/inventory';

// Helper to get current state
const getState = () => useNetworkStore.getState();

// Test card definitions
const testRouterCard: CardDefinition = {
  id: 'imm24-10g',
  name: 'IMM24-10G',
  vendor: 'generic',
  nodeType: 'router',
  portTemplate: [
    { namePattern: 'Eth-{n}', type: 'bw', dataRate: '10G', count: 24 },
  ],
  switchingCapacity: 240,
  powerConsumption: 450,
};

const testOadmCard: CardDefinition = {
  id: 'wss-c96',
  name: 'WSS-C96',
  vendor: 'generic',
  nodeType: 'oadm',
  portTemplate: [
    { namePattern: 'Line-{n}', type: 'dwdm', dataRate: '100G', channels: 96, count: 2 },
  ],
  powerConsumption: 80,
};

const testChassis: ChassisDefinition = {
  totalSlots: 8,
  maxPower: 5000,
  description: 'Test chassis',
};

describe('Inventory Store Actions', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
  });

  describe('installCard', () => {
    it('should install a card and create ports', () => {
      // Create a router node with chassis
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });

      const result = getState().installCard(nodeId, testRouterCard, 1);

      expect(result.success).toBe(true);
      expect(result.cardId).toBeDefined();

      const node = getState().getNode(nodeId);
      expect(node?.installedCards).toHaveLength(1);
      expect(node?.installedCards![0].slotNumber).toBe(1);
      expect(node?.installedCards![0].definitionId).toBe('imm24-10g');

      // Should have created 24 BW ports from the card template
      const cardPortIds = new Set(node?.installedCards![0].portIds);
      const cardPorts = node?.ports?.filter((p) => cardPortIds.has(p.id)) || [];
      expect(cardPorts).toHaveLength(24);
      expect(cardPorts[0].type).toBe('bw');
      expect(cardPorts[0].dataRate).toBe('10G');
      expect(cardPorts[0].name).toMatch(/^Eth-1\/\d+$/);
    });

    it('should create DWDM ports with spectrum initialization', () => {
      const nodeId = getState().addNode({
        type: 'oadm',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });

      const result = getState().installCard(nodeId, testOadmCard, 1);
      expect(result.success).toBe(true);

      const node = getState().getNode(nodeId);
      const cardPortIds = new Set(node?.installedCards![0].portIds);
      const cardPorts = node?.ports?.filter((p) => cardPortIds.has(p.id)) || [];

      expect(cardPorts).toHaveLength(2);
      expect(cardPorts[0].type).toBe('dwdm');
      expect(cardPorts[0].channels).toBe(96);
      expect(cardPorts[0].spectrum).toBeDefined();
      expect(cardPorts[0].spectrum?.gridType).toBe('fixed-50ghz');
      expect(cardPorts[0].spectrum?.allocations).toHaveLength(0);
    });

    it('should reject install if node has no chassis', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
      });

      const result = getState().installCard(nodeId, testRouterCard, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('no chassis');
    });

    it('should reject install if slot is out of range', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });

      const result = getState().installCard(nodeId, testRouterCard, 9);
      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });

    it('should reject install if slot is occupied', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });

      getState().installCard(nodeId, testRouterCard, 1);
      const result = getState().installCard(nodeId, testRouterCard, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already occupied');
    });

    it('should reject install if card type is incompatible with node', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });

      // Try to install an OADM card in a router
      const result = getState().installCard(nodeId, testOadmCard, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not compatible');
    });

    it('should reject install if node not found', () => {
      const result = getState().installCard('nonexistent', testRouterCard, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Node not found');
    });

    it('should install multiple cards in different slots', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });

      const result1 = getState().installCard(nodeId, testRouterCard, 1);
      const result2 = getState().installCard(nodeId, testRouterCard, 3);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const node = getState().getNode(nodeId);
      expect(node?.installedCards).toHaveLength(2);
      // Should have 48 total card ports (24 + 24)
      const allCardPortIds = new Set(
        node?.installedCards?.flatMap((c) => c.portIds)
      );
      const cardPorts = node?.ports?.filter((p) => allCardPortIds.has(p.id)) || [];
      expect(cardPorts).toHaveLength(48);
    });
  });

  describe('removeCard', () => {
    it('should remove a card and its ports', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });

      const { cardId } = getState().installCard(nodeId, testRouterCard, 1);
      const nodeBefore = getState().getNode(nodeId);
      const portsBefore = nodeBefore?.ports?.length || 0;

      const result = getState().removeCard(nodeId, cardId!);
      expect(result.success).toBe(true);

      const nodeAfter = getState().getNode(nodeId);
      expect(nodeAfter?.installedCards).toHaveLength(0);
      // Card's 24 ports should have been removed
      expect(nodeAfter?.ports?.length).toBe(portsBefore - 24);
    });

    it('should reject removal if ports are in use', () => {
      const nodeId1 = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });
      const nodeId2 = getState().addNode({
        type: 'router',
        position: { x: 200, y: 0 },
      });

      const { cardId } = getState().installCard(nodeId1, testRouterCard, 1);

      // Get the first card port and connect it via an edge
      const node = getState().getNode(nodeId1);
      const cardPortId = node?.installedCards![0].portIds[0];
      const node2Port = getState().getNode(nodeId2)?.ports?.find((p) => p.type === 'bw');

      if (cardPortId && node2Port) {
        getState().addEdgeWithPorts(nodeId1, nodeId2, cardPortId, node2Port.id);
      }

      const result = getState().removeCard(nodeId1, cardId!);
      expect(result.success).toBe(false);
      expect(result.hasServiceConflicts).toBe(true);
      expect(result.error).toContain('in use');
    });

    it('should reject removal if card not found', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });

      const result = getState().removeCard(nodeId, 'nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Card not found');
    });
  });

  describe('swapCard', () => {
    it('should swap a card with a new one in the same slot', () => {
      const nodeId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });

      const { cardId: oldCardId } = getState().installCard(nodeId, testRouterCard, 3);

      // Create a different card definition for the swap
      const newCard: CardDefinition = {
        id: 'imm8-100g',
        name: 'IMM8-100G',
        vendor: 'generic',
        nodeType: 'router',
        portTemplate: [
          { namePattern: 'Eth-{n}', type: 'bw', dataRate: '100G', count: 8 },
        ],
        switchingCapacity: 800,
        powerConsumption: 600,
      };

      const result = getState().swapCard(nodeId, oldCardId!, newCard);
      expect(result.success).toBe(true);
      expect(result.newCardId).toBeDefined();

      const node = getState().getNode(nodeId);
      // Should still have exactly 1 installed card
      expect(node?.installedCards).toHaveLength(1);
      // New card should be in slot 3
      expect(node?.installedCards![0].slotNumber).toBe(3);
      expect(node?.installedCards![0].definitionId).toBe('imm8-100g');
      // Should have 8 new ports from the new card
      const cardPortIds = new Set(node?.installedCards![0].portIds);
      const cardPorts = node?.ports?.filter((p) => cardPortIds.has(p.id)) || [];
      expect(cardPorts).toHaveLength(8);
      expect(cardPorts[0].dataRate).toBe('100G');
    });

    it('should reject swap if old card ports are in use', () => {
      const nodeId1 = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
        chassis: testChassis,
      });
      const nodeId2 = getState().addNode({
        type: 'router',
        position: { x: 200, y: 0 },
      });

      const { cardId } = getState().installCard(nodeId1, testRouterCard, 1);

      // Connect a card port
      const node = getState().getNode(nodeId1);
      const cardPortId = node?.installedCards![0].portIds[0];
      const node2Port = getState().getNode(nodeId2)?.ports?.find((p) => p.type === 'bw');

      if (cardPortId && node2Port) {
        getState().addEdgeWithPorts(nodeId1, nodeId2, cardPortId, node2Port.id);
      }

      const newCard: CardDefinition = {
        ...testRouterCard,
        id: 'different',
        name: 'Different Card',
      };

      const result = getState().swapCard(nodeId1, cardId!, newCard);
      expect(result.success).toBe(false);
      expect(result.error).toContain('in use');
    });
  });

  describe('Migration and Backward Compatibility', () => {
    it('should load topology with nodes that have no inventory fields', () => {
      const topology = {
        id: 'test-topo',
        name: 'Legacy Topology',
        version: '1.0.0',
        metadata: { created: new Date().toISOString(), modified: new Date().toISOString() },
        nodes: [
          {
            id: 'legacy-node',
            name: 'Legacy Router',
            type: 'router' as const,
            vendor: 'generic' as const,
            position: { x: 0, y: 0 },
            stacks: [],
            ports: [
              { id: 'p1', name: 'Eth-1', type: 'bw' as const, dataRate: '10G' as const, channels: 1, status: 'available' as const },
            ],
            metadata: {},
          },
        ],
        edges: [],
      };

      getState().loadTopology(topology);

      const node = getState().getNode('legacy-node');
      expect(node).toBeDefined();
      expect(node?.ports).toHaveLength(1);
      // Inventory fields should be undefined (not present)
      expect(node?.chassis).toBeUndefined();
      expect(node?.installedCards).toBeUndefined();
    });

    it('should load topology preserving existing inventory fields', () => {
      const topology = {
        id: 'test-topo',
        name: 'Inventory Topology',
        version: '1.0.0',
        metadata: { created: new Date().toISOString(), modified: new Date().toISOString() },
        nodes: [
          {
            id: 'inv-node',
            name: 'Modern Router',
            type: 'router' as const,
            vendor: 'generic' as const,
            position: { x: 0, y: 0 },
            stacks: [],
            ports: [
              { id: 'p1', name: 'Eth-1', type: 'bw' as const, dataRate: '10G' as const, channels: 1, status: 'available' as const },
            ],
            chassis: { totalSlots: 8, maxPower: 5000 },
            installedCards: [
              { id: 'card-1', definitionId: 'imm24-10g', slotNumber: 1, portIds: ['p1'], installedAt: Date.now() },
            ],
            metadata: {},
          },
        ],
        edges: [],
      };

      getState().loadTopology(topology);

      const node = getState().getNode('inv-node');
      expect(node).toBeDefined();
      expect(node?.chassis?.totalSlots).toBe(8);
      expect(node?.installedCards).toHaveLength(1);
      expect(node?.installedCards![0].definitionId).toBe('imm24-10g');
    });

    it('should work with mixed legacy and inventory nodes', () => {
      // Create a legacy node (no chassis)
      const legacyId = getState().addNode({
        type: 'router',
        position: { x: 0, y: 0 },
      });

      // Create an inventory node (with chassis)
      const modernId = getState().addNode({
        type: 'router',
        position: { x: 200, y: 0 },
        chassis: testChassis,
      });

      // Legacy node should work fine with its default ports
      const legacyNode = getState().getNode(legacyId);
      expect(legacyNode?.ports?.length).toBeGreaterThan(0);
      expect(legacyNode?.chassis).toBeUndefined();

      // Modern node should support card installation
      const result = getState().installCard(modernId, testRouterCard, 1);
      expect(result.success).toBe(true);

      // Legacy node should reject card installation (no chassis)
      const legacyResult = getState().installCard(legacyId, testRouterCard, 1);
      expect(legacyResult.success).toBe(false);
    });
  });

  describe('Card Library Defaults', () => {
    it('should have all expected default card definitions', () => {
      expect(DEFAULT_CARD_LIBRARY).toHaveLength(6);

      const ids = DEFAULT_CARD_LIBRARY.map((c) => c.id);
      expect(ids).toContain('imm24-10g');
      expect(ids).toContain('imm8-100g');
      expect(ids).toContain('wss-c96');
      expect(ids).toContain('add-drop-16');
      expect(ids).toContain('transponder-2x100g');
      expect(ids).toContain('line-card-48x1g');
    });

    it('should have correct node types for each card', () => {
      const routerCards = DEFAULT_CARD_LIBRARY.filter((c) => c.nodeType === 'router');
      const oadmCards = DEFAULT_CARD_LIBRARY.filter((c) => c.nodeType === 'oadm');
      const terminalCards = DEFAULT_CARD_LIBRARY.filter((c) => c.nodeType === 'terminal');
      const switchCards = DEFAULT_CARD_LIBRARY.filter((c) => c.nodeType === 'switch');

      expect(routerCards).toHaveLength(2);
      expect(oadmCards).toHaveLength(2);
      expect(terminalCards).toHaveLength(1);
      expect(switchCards).toHaveLength(1);
    });

    it('should have valid port templates for each card', () => {
      for (const card of DEFAULT_CARD_LIBRARY) {
        expect(card.portTemplate.length).toBeGreaterThan(0);
        for (const template of card.portTemplate) {
          expect(template.namePattern).toBeTruthy();
          expect(template.count).toBeGreaterThan(0);
          expect(['bw', 'dwdm']).toContain(template.type);
        }
      }
    });
  });
});
