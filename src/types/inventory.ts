/**
 * Inventory Types
 * Types for card/chassis-based node hardware inventory management
 */

import type { NodeType, PortType, PortDataRate } from './network';

// ============================================================================
// CARD PORT TEMPLATE
// ============================================================================

/**
 * Template for ports provisioned by a card.
 * When a card is installed, ports are auto-created from these templates.
 */
export interface CardPortTemplate {
  /** Port naming pattern (e.g., 'Eth-{n}', 'Line-{n}') */
  namePattern: string;
  /** Port type */
  type: PortType;
  /** Data rate per port */
  dataRate: PortDataRate;
  /** Number of DWDM channels per port (for DWDM ports; default: 96) */
  channels?: number;
  /** Number of ports this template creates */
  count: number;
}

// ============================================================================
// CARD DEFINITION
// ============================================================================

/**
 * A card model definition from the card library.
 * Describes a type of line card / interface module that can be installed in a chassis.
 */
export interface CardDefinition {
  /** Unique card definition ID (e.g., 'imm24-10g') */
  id: string;
  /** Display name (e.g., 'IMM24-10G') */
  name: string;
  /** Card vendor */
  vendor: string;
  /** Which node type(s) this card is compatible with */
  nodeType: NodeType;
  /** Port templates provisioned by this card */
  portTemplate: CardPortTemplate[];
  /** Total switching capacity in Gbps (if applicable) */
  switchingCapacity?: number;
  /** Power consumption in watts */
  powerConsumption?: number;
}

// ============================================================================
// INSTALLED CARD
// ============================================================================

/**
 * A card instance installed in a specific chassis slot.
 * References a CardDefinition and tracks the provisioned port IDs.
 */
export interface InstalledCard {
  /** Unique instance ID (UUID) */
  id: string;
  /** Reference to the CardDefinition.id */
  definitionId: string;
  /** Chassis slot number (1-based) */
  slotNumber: number;
  /** IDs of the Port objects created from this card's templates */
  portIds: string[];
  /** Timestamp when the card was installed (epoch ms) */
  installedAt: number;
}

// ============================================================================
// CHASSIS DEFINITION
// ============================================================================

/**
 * Chassis hardware definition for a node.
 * Describes the physical chassis that holds cards.
 */
export interface ChassisDefinition {
  /** Total number of card slots */
  totalSlots: number;
  /** Maximum power budget in watts */
  maxPower?: number;
  /** Chassis description */
  description?: string;
}

// ============================================================================
// DEFAULT CARD LIBRARY
// ============================================================================

/**
 * Default card definitions for each node type.
 * These populate the card library in settingsStore.
 */
export const DEFAULT_CARD_LIBRARY: CardDefinition[] = [
  // Router cards
  {
    id: 'imm24-10g',
    name: 'IMM24-10G',
    vendor: 'generic',
    nodeType: 'router',
    portTemplate: [
      { namePattern: 'Eth-{n}', type: 'bw', dataRate: '10G', count: 24 },
    ],
    switchingCapacity: 240,
    powerConsumption: 450,
  },
  {
    id: 'imm8-100g',
    name: 'IMM8-100G',
    vendor: 'generic',
    nodeType: 'router',
    portTemplate: [
      { namePattern: 'Eth-{n}', type: 'bw', dataRate: '100G', count: 8 },
    ],
    switchingCapacity: 800,
    powerConsumption: 600,
  },
  // OADM cards
  {
    id: 'wss-c96',
    name: 'WSS-C96',
    vendor: 'generic',
    nodeType: 'oadm',
    portTemplate: [
      { namePattern: 'Line-{n}', type: 'dwdm', dataRate: '100G', channels: 96, count: 2 },
    ],
    powerConsumption: 80,
  },
  {
    id: 'add-drop-16',
    name: 'ADD-DROP-16',
    vendor: 'generic',
    nodeType: 'oadm',
    portTemplate: [
      { namePattern: 'Add-{n}', type: 'dwdm', dataRate: '100G', channels: 16, count: 2 },
    ],
    powerConsumption: 40,
  },
  // Terminal cards
  {
    id: 'transponder-2x100g',
    name: 'TRANSPONDER-2x100G',
    vendor: 'generic',
    nodeType: 'terminal',
    portTemplate: [
      { namePattern: 'Line-{n}', type: 'dwdm', dataRate: '100G', channels: 96, count: 2 },
    ],
    powerConsumption: 120,
  },
  // Switch cards
  {
    id: 'line-card-48x1g',
    name: 'LINE-CARD-48x1G',
    vendor: 'generic',
    nodeType: 'switch',
    portTemplate: [
      { namePattern: 'Port-{n}', type: 'bw', dataRate: '1G', count: 48 },
    ],
    switchingCapacity: 48,
    powerConsumption: 200,
  },
];
