/**
 * UI-specific types for the application
 */

import { NodeType } from './network';

/**
 * Current tool mode for the canvas
 */
export type ToolMode = 'select' | 'add' | 'connect' | 'pan';

/**
 * Node display mode for the canvas
 */
export type NodeDisplayMode = 'expanded' | 'compact' | 'icon-only';

/**
 * Canvas viewport state
 */
export interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Selection state
 */
export interface SelectionState {
  selectedNodes: string[];
  selectedEdges: string[];
}

/**
 * Inspector panel state
 */
export interface InspectorState {
  isOpen: boolean;
  type: 'node' | 'edge' | 'service' | null;
  targetId: string | null;
}

/**
 * Palette item for sidebar node palette
 */
export interface PaletteItem {
  type: NodeType;
  label: string;
  shortLabel: string;
  icon?: string;
  color: string;
  gradient: string;
}

/**
 * Registered modal types. Single source of truth — every value MUST have
 * exactly one mounted consumer in App.tsx (see contracts/modal-registry.contract.md).
 *
 * Intentionally OUT-OF-REGISTRY dialogs (FR-002 spirit, not letter):
 * the following modals are owned and rendered locally by their parent
 * surface rather than dispatched through `uiStore.openModal()`. They are
 * tightly coupled to a specific feature flow and have no value as
 * registry-routable singletons:
 *
 * - `LocationPickerModal`        — owned by NodeInspector / GeoMapView
 *                                  (per-node coordinate picker).
 * - `ScenarioDetailModal`        — owned by ExhaustiveResults
 *                                  (drill-down for a selected scenario row).
 * - `SpectrumModal`              — owned by EdgeInspector / SpectrumGrid
 *                                  (per-edge channel detail viewer).
 * - Inventory chassis dialogs    — owned by `InventoryTab.tsx`
 *                                  (per-slot card add/swap, stack edit).
 * - Wizard sub-dialogs           — owned by ServiceWizard / DefragWizard
 *                                  (`CancelConfirmDialog`, `ApplyConfirmDialog`,
 *                                  step-scoped pickers): they belong to the
 *                                  parent wizard's lifecycle, not a global
 *                                  modal stack.
 *
 * Adding a new top-level modal that is reachable from multiple surfaces
 * MUST go through this list (and the `MODAL_REGISTRY` mount in App.tsx).
 * Local feature dialogs in the categories above MAY remain inline.
 */
export const MODAL_TYPES = [
  'add-node',
  'edit-service',
  'service-wizard',
  'import',
  'export',
  'settings',
  'shortcuts',
  'confirm-delete',
  'confirm-dialog',
  'alert-dialog',
  'select-ports',
  'wiki',
] as const;

/**
 * Modal types in the application. Derived from {@link MODAL_TYPES}; `null` means
 * no modal is currently active.
 */
export type ModalType = (typeof MODAL_TYPES)[number] | null;

/**
 * Toast notification type
 */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

/**
 * Shortcut category for grouping in the shortcuts modal
 */
export type ShortcutCategory = 'general' | 'tools' | 'view' | 'editing';

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcut {
  key: string;
  modifiers?: ('ctrl' | 'shift' | 'alt' | 'meta')[];
  action: string;
  description: string;
  category: ShortcutCategory;
  enabled: boolean;
}

/**
 * Default keyboard shortcuts
 */
export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // General
  { key: 'Escape', action: 'deselect', description: 'Deselect all / Cancel', category: 'general', enabled: true },
  { key: 'Delete', action: 'delete', description: 'Delete selected', category: 'general', enabled: true },
  { key: 'Backspace', action: 'delete', description: 'Delete selected', category: 'general', enabled: true },
  { key: 'a', modifiers: ['ctrl'], action: 'selectAll', description: 'Select all', category: 'general', enabled: true },
  { key: 's', modifiers: ['ctrl'], action: 'save', description: 'Export topology', category: 'general', enabled: true },
  { key: '?', action: 'showShortcuts', description: 'Show keyboard shortcuts', category: 'general', enabled: true },

  // Editing
  { key: 'z', modifiers: ['ctrl'], action: 'undo', description: 'Undo', category: 'editing', enabled: true },
  { key: 'y', modifiers: ['ctrl'], action: 'redo', description: 'Redo', category: 'editing', enabled: true },
  { key: 'z', modifiers: ['ctrl', 'shift'], action: 'redo', description: 'Redo', category: 'editing', enabled: true },
  { key: 'c', modifiers: ['ctrl'], action: 'copy', description: 'Copy', category: 'editing', enabled: false },
  { key: 'v', modifiers: ['ctrl'], action: 'paste', description: 'Paste', category: 'editing', enabled: false },
  { key: 'd', modifiers: ['ctrl'], action: 'duplicate', description: 'Duplicate', category: 'editing', enabled: true },

  // Tools
  { key: 'v', action: 'selectMode', description: 'Select mode', category: 'tools', enabled: true },
  { key: 'n', action: 'addMode', description: 'Add node mode', category: 'tools', enabled: true },
  { key: 'e', action: 'connectMode', description: 'Connect mode', category: 'tools', enabled: true },

  // View
  { key: '=', modifiers: ['ctrl'], action: 'zoomIn', description: 'Zoom in', category: 'view', enabled: true },
  { key: '-', modifiers: ['ctrl'], action: 'zoomOut', description: 'Zoom out', category: 'view', enabled: true },
  { key: '0', modifiers: ['ctrl'], action: 'fitView', description: 'Fit to screen', category: 'view', enabled: true },
];

/**
 * Tool configuration for sidebar
 */
export interface ToolConfig {
  mode: ToolMode;
  label: string;
  shortcut: string;
  icon: string;
}

/**
 * Available tools
 */
export const TOOL_CONFIGS: ToolConfig[] = [
  { mode: 'select', label: 'Select', shortcut: 'V', icon: 'mouse-pointer-2' },
  { mode: 'add', label: 'Add Node', shortcut: 'N', icon: 'plus-circle' },
  { mode: 'connect', label: 'Connect', shortcut: 'E', icon: 'arrow-right' },
  { mode: 'pan', label: 'Pan', shortcut: 'Space', icon: 'move' },
];
