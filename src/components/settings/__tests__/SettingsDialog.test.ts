/**
 * SettingsDialog unit tests
 *
 * Tests the pending state / apply / discard / change-detection pattern.
 * These tests operate at the store level (no DOM rendering) to verify
 * the core logic: detectChanges, cloneSettings, and the importSettings
 * "apply" pathway.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  DEFAULT_SETTINGS,
  DEFAULT_OPTICAL_SETTINGS,
} from '@/types/settings';
import type { AppSettings } from '@/types/settings';

// ============================================================================
// Helpers — mirror what SettingsDialog.tsx does internally
// ============================================================================

function cloneSettings(s: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(s));
}

interface SettingChange {
  section: string;
  label: string;
  oldValue: string;
  newValue: string;
}

function fmt(v: unknown): string {
  if (v === undefined || v === null) return '(none)';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  return String(v);
}

function detectChanges(current: AppSettings, pending: AppSettings): SettingChange[] {
  const changes: SettingChange[] = [];
  const g1 = current.general, g2 = pending.general;
  if (g1.autoSave !== g2.autoSave) changes.push({ section: 'General', label: 'Auto-save', oldValue: fmt(g1.autoSave), newValue: fmt(g2.autoSave) });
  if (g1.distanceUnit !== g2.distanceUnit) changes.push({ section: 'General', label: 'Distance unit', oldValue: g1.distanceUnit, newValue: g2.distanceUnit });
  if (g1.confirmDestructiveActions !== g2.confirmDestructiveActions) changes.push({ section: 'General', label: 'Confirm destructive actions', oldValue: fmt(g1.confirmDestructiveActions), newValue: fmt(g2.confirmDestructiveActions) });
  const c1 = current.canvas, c2 = pending.canvas;
  if (c1.gridVisible !== c2.gridVisible) changes.push({ section: 'Canvas', label: 'Show grid', oldValue: fmt(c1.gridVisible), newValue: fmt(c2.gridVisible) });
  if (c1.gridSize !== c2.gridSize) changes.push({ section: 'Canvas', label: 'Grid size', oldValue: `${c1.gridSize}px`, newValue: `${c2.gridSize}px` });
  if (c1.snapToGrid !== c2.snapToGrid) changes.push({ section: 'Canvas', label: 'Snap to grid', oldValue: fmt(c1.snapToGrid), newValue: fmt(c2.snapToGrid) });
  if (c1.defaultNodeType !== c2.defaultNodeType) changes.push({ section: 'Canvas', label: 'Default node type', oldValue: c1.defaultNodeType, newValue: c2.defaultNodeType });
  if (c1.showMinimap !== c2.showMinimap) changes.push({ section: 'Canvas', label: 'Show minimap', oldValue: fmt(c1.showMinimap), newValue: fmt(c2.showMinimap) });
  if (c1.defaultNodeNamePattern !== c2.defaultNodeNamePattern) changes.push({ section: 'Canvas', label: 'Default node name', oldValue: c1.defaultNodeNamePattern, newValue: c2.defaultNodeNamePattern });
  const n1 = current.network, n2 = pending.network;
  if (n1.defaultFiberProfile !== n2.defaultFiberProfile) changes.push({ section: 'Network', label: 'Default fiber profile', oldValue: n1.defaultFiberProfile, newValue: n2.defaultFiberProfile });
  if (n1.defaultEdgeDistance !== n2.defaultEdgeDistance) changes.push({ section: 'Network', label: 'Default edge distance', oldValue: `${n1.defaultEdgeDistance} km`, newValue: `${n2.defaultEdgeDistance} km` });
  if (n1.maxDWDMChannels !== n2.maxDWDMChannels) changes.push({ section: 'Network', label: 'Max DWDM channels', oldValue: String(n1.maxDWDMChannels), newValue: String(n2.maxDWDMChannels) });
  if (n1.defaultVendor !== n2.defaultVendor) changes.push({ section: 'Network', label: 'Default vendor', oldValue: n1.defaultVendor, newValue: n2.defaultVendor });
  const s1 = current.simulation, s2 = pending.simulation;
  if (s1.defaultMaxEdgeFailures !== s2.defaultMaxEdgeFailures) changes.push({ section: 'Simulation', label: 'Max edge failures', oldValue: String(s1.defaultMaxEdgeFailures), newValue: String(s2.defaultMaxEdgeFailures) });
  if (s1.defaultMaxNodeFailures !== s2.defaultMaxNodeFailures) changes.push({ section: 'Simulation', label: 'Max node failures', oldValue: String(s1.defaultMaxNodeFailures), newValue: String(s2.defaultMaxNodeFailures) });
  const a1 = current.advanced, a2 = pending.advanced;
  if (a1.showDebugPanel !== a2.showDebugPanel) changes.push({ section: 'Advanced', label: 'Show debug panel', oldValue: fmt(a1.showDebugPanel), newValue: fmt(a2.showDebugPanel) });
  if (a1.crossTabSync !== a2.crossTabSync) changes.push({ section: 'Advanced', label: 'Cross-tab sync', oldValue: fmt(a1.crossTabSync), newValue: fmt(a2.crossTabSync) });
  if (a1.historyLimit !== a2.historyLimit) changes.push({ section: 'Advanced', label: 'History limit', oldValue: String(a1.historyLimit), newValue: String(a2.historyLimit) });
  const o1 = current.optical || DEFAULT_OPTICAL_SETTINGS;
  const o2 = pending.optical || DEFAULT_OPTICAL_SETTINGS;
  if (o1.defaultEoLMargin !== o2.defaultEoLMargin) changes.push({ section: 'Optical', label: 'EoL Margin', oldValue: `${o1.defaultEoLMargin} dB`, newValue: `${o2.defaultEoLMargin} dB` });
  if (o1.defaultLaunchPower !== o2.defaultLaunchPower) changes.push({ section: 'Optical', label: 'Launch Power', oldValue: `${o1.defaultLaunchPower} dBm`, newValue: `${o2.defaultLaunchPower} dBm` });
  if (o1.defaultNF !== o2.defaultNF) changes.push({ section: 'Optical', label: 'Noise Figure', oldValue: `${o1.defaultNF} dB`, newValue: `${o2.defaultNF} dB` });
  if (o1.defaultConnectorLoss !== o2.defaultConnectorLoss) changes.push({ section: 'Optical', label: 'Connector Loss', oldValue: `${o1.defaultConnectorLoss} dB`, newValue: `${o2.defaultConnectorLoss} dB` });
  return changes;
}

// ============================================================================
// Tests
// ============================================================================

describe('SettingsDialog pending-state pattern', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useSettingsStore.getState().resetAll();
  });

  describe('cloneSettings', () => {
    it('should create a deep copy that is not the same reference', () => {
      const original = useSettingsStore.getState().settings;
      const clone = cloneSettings(original);
      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone.general).not.toBe(original.general);
    });

    it('should not be affected by mutations to the original', () => {
      const original = useSettingsStore.getState().settings;
      const clone = cloneSettings(original);
      // Mutate via store
      useSettingsStore.getState().updateGeneralSettings({ autoSave: false });
      // Clone should keep original value
      expect(clone.general.autoSave).toBe(true);
    });
  });

  describe('detectChanges', () => {
    it('should return empty array when nothing changed', () => {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      const pending = cloneSettings(DEFAULT_SETTINGS);
      expect(detectChanges(settings, pending)).toEqual([]);
    });

    it('should detect a single general change', () => {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.general.autoSave = false;
      const changes = detectChanges(settings, pending);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        section: 'General',
        label: 'Auto-save',
        oldValue: 'On',
        newValue: 'Off',
      });
    });

    it('should detect multiple changes across sections', () => {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.general.distanceUnit = 'mi';
      pending.canvas.gridSize = 80;
      pending.network.defaultEdgeDistance = 100;
      pending.simulation.defaultMaxEdgeFailures = 3;
      pending.advanced.historyLimit = 100;
      const changes = detectChanges(settings, pending);
      expect(changes).toHaveLength(5);
      expect(changes.map((c) => c.section)).toEqual([
        'General', 'Canvas', 'Network', 'Simulation', 'Advanced',
      ]);
    });

    it('should detect optical settings changes', () => {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.optical = { ...DEFAULT_OPTICAL_SETTINGS, defaultEoLMargin: 5.0 };
      const changes = detectChanges(settings, pending);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        section: 'Optical',
        label: 'EoL Margin',
        oldValue: '3 dB',
        newValue: '5 dB',
      });
    });

    it('should detect boolean formatting correctly', () => {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.canvas.showMinimap = true;
      const changes = detectChanges(settings, pending);
      expect(changes[0].oldValue).toBe('Off');
      expect(changes[0].newValue).toBe('On');
    });
  });

  describe('Apply workflow (importSettings)', () => {
    it('should not affect store until importSettings is called', () => {
      // Simulate: user opens dialog, clones settings into pending state
      const pending = cloneSettings(useSettingsStore.getState().settings);
      pending.general.autoSave = false;
      pending.network.defaultEdgeDistance = 200;

      // Store should still have original values
      const store = useSettingsStore.getState().settings;
      expect(store.general.autoSave).toBe(true);
      expect(store.network.defaultEdgeDistance).toBe(50);
    });

    it('should atomically apply all changes via importSettings', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      pending.general.autoSave = false;
      pending.general.distanceUnit = 'mi';
      pending.network.defaultEdgeDistance = 200;
      pending.canvas.gridSize = 80;

      const result = useSettingsStore.getState().importSettings(pending);
      expect(result.success).toBe(true);

      const updated = useSettingsStore.getState().settings;
      expect(updated.general.autoSave).toBe(false);
      expect(updated.general.distanceUnit).toBe('mi');
      expect(updated.network.defaultEdgeDistance).toBe(200);
      expect(updated.canvas.gridSize).toBe(80);
    });

    it('should preserve unchanged settings after apply', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      pending.general.autoSave = false; // Only change one thing

      useSettingsStore.getState().importSettings(pending);

      const updated = useSettingsStore.getState().settings;
      expect(updated.general.autoSave).toBe(false);
      // All other defaults should be preserved
      expect(updated.canvas.gridSize).toBe(40);
      expect(updated.network.defaultFiberProfile).toBe('G.652.D');
      expect(updated.simulation.defaultMaxEdgeFailures).toBe(1);
      expect(updated.advanced.historyLimit).toBe(50);
    });
  });

  describe('Discard workflow', () => {
    it('should revert pending to store values on discard', () => {
      // Simulate: open dialog
      let pending = cloneSettings(useSettingsStore.getState().settings);
      // User makes changes
      pending.general.autoSave = false;
      pending.network.defaultEdgeDistance = 999;

      // User clicks Discard -> re-clone from store
      pending = cloneSettings(useSettingsStore.getState().settings);
      expect(pending.general.autoSave).toBe(true);
      expect(pending.network.defaultEdgeDistance).toBe(50);
    });

    it('should show zero changes after discard', () => {
      const storeSettings = useSettingsStore.getState().settings;
      let pending = cloneSettings(storeSettings);
      pending.general.autoSave = false;
      expect(detectChanges(storeSettings, pending).length).toBe(1);

      // Discard
      pending = cloneSettings(storeSettings);
      expect(detectChanges(storeSettings, pending).length).toBe(0);
    });
  });

  describe('Reset section workflow', () => {
    it('should reset only the active section in pending state', () => {
      const pending = cloneSettings(DEFAULT_SETTINGS);
      // Modify general and network
      pending.general.autoSave = false;
      pending.network.defaultEdgeDistance = 999;

      // Reset only general (simulating Reset Section for "general" tab)
      const resetPending = {
        ...pending,
        general: { ...DEFAULT_SETTINGS.general },
      };

      expect(resetPending.general.autoSave).toBe(true); // reset
      expect(resetPending.network.defaultEdgeDistance).toBe(999); // preserved
    });
  });

  describe('Optical settings in pending', () => {
    it('should allow modifying optical settings in pending without affecting store', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      pending.optical = {
        ...DEFAULT_OPTICAL_SETTINGS,
        defaultEoLMargin: 5.0,
        defaultNF: 7.0,
      };

      // Store unchanged
      const storeOptical = useSettingsStore.getState().settings.optical;
      expect(storeOptical?.defaultEoLMargin).toBe(3.0);
      expect(storeOptical?.defaultNF).toBe(5.5);

      // Apply
      useSettingsStore.getState().importSettings(pending);
      const updated = useSettingsStore.getState().settings.optical;
      expect(updated?.defaultEoLMargin).toBe(5.0);
      expect(updated?.defaultNF).toBe(7.0);
    });
  });
});
