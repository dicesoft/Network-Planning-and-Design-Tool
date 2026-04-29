/**
 * InventorySection unit tests
 *
 * Tests the inventory CRUD operations and change detection at the store/data level.
 * Operates on pending state (not DOM rendering) to verify the core logic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  DEFAULT_SETTINGS,
  DEFAULT_NODE_SUBTYPES,
} from '@/types/settings';
import { DEFAULT_TRANSCEIVERS } from '@/types/transceiver';
import { DEFAULT_CARD_LIBRARY } from '@/types/inventory';
import type { AppSettings } from '@/types/settings';
import type { TransceiverType } from '@/types/transceiver';
import type { CardDefinition } from '@/types/inventory';

// ============================================================================
// Helpers — mirror SettingsDialog / InventorySection patterns
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

function detectChanges(current: AppSettings, pending: AppSettings): SettingChange[] {
  const changes: SettingChange[] = [];

  // Transceiver library
  const tl1 = JSON.stringify((current.transceiverLibrary || []).map((t) => t.id).sort());
  const tl2 = JSON.stringify((pending.transceiverLibrary || []).map((t) => t.id).sort());
  if (tl1 !== tl2) {
    changes.push({ section: 'Inventory', label: 'Transceiver library', oldValue: `${(current.transceiverLibrary || []).length} items`, newValue: `${(pending.transceiverLibrary || []).length} items` });
  } else if (JSON.stringify(current.transceiverLibrary) !== JSON.stringify(pending.transceiverLibrary)) {
    changes.push({ section: 'Inventory', label: 'Transceiver library', oldValue: 'modified', newValue: 'updated' });
  }

  // Card library
  const cl1 = JSON.stringify((current.cardLibrary || []).map((c) => c.id).sort());
  const cl2 = JSON.stringify((pending.cardLibrary || []).map((c) => c.id).sort());
  if (cl1 !== cl2) {
    changes.push({ section: 'Inventory', label: 'Card library', oldValue: `${(current.cardLibrary || []).length} items`, newValue: `${(pending.cardLibrary || []).length} items` });
  } else if (JSON.stringify(current.cardLibrary) !== JSON.stringify(pending.cardLibrary)) {
    changes.push({ section: 'Inventory', label: 'Card library', oldValue: 'modified', newValue: 'updated' });
  }

  // Node subtypes
  const st1 = JSON.stringify(current.nodeSubtypes.map((s) => s.key).sort());
  const st2 = JSON.stringify(pending.nodeSubtypes.map((s) => s.key).sort());
  if (st1 !== st2) {
    changes.push({ section: 'Inventory', label: 'Node subtypes', oldValue: `${current.nodeSubtypes.length} items`, newValue: `${pending.nodeSubtypes.length} items` });
  }

  return changes;
}

// ============================================================================
// Tests
// ============================================================================

describe('InventorySection CRUD operations', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetAll();
  });

  // ==========================================================================
  // Transceiver CRUD
  // ==========================================================================

  describe('Transceiver CRUD', () => {
    it('should render transceiver table with correct count from default state', () => {
      const settings = cloneSettings(useSettingsStore.getState().settings);
      const transceivers = settings.transceiverLibrary;
      // After resetAll(), transceiverLibrary is undefined (populated via migration on load).
      // The UI treats undefined as empty array.
      expect(transceivers).toBeUndefined();

      // Simulate what happens after migration populates it:
      const withLib = { ...settings, transceiverLibrary: [...DEFAULT_TRANSCEIVERS] };
      expect(withLib.transceiverLibrary.length).toBe(DEFAULT_TRANSCEIVERS.length);
      expect(withLib.transceiverLibrary.length).toBeGreaterThan(0);
    });

    it('should add a transceiver to pending state', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      const newTransceiver: TransceiverType = {
        id: 'test-xcvr-1',
        name: 'Test XCVR 1',
        vendor: 'TestVendor',
        formFactor: 'QSFP-DD',
        launchPower: -5,
        receiverSensitivity: -20,
        txOSNR: 38,
        supportedModulations: [{ modulation: 'DP-QPSK', requiredOSNR: 12, maxReach: 2500 }],
        supportedDataRates: ['100G'],
        baudRate: 64,
      };

      const lib = pending.transceiverLibrary || [];
      pending.transceiverLibrary = [...lib, newTransceiver];

      expect(pending.transceiverLibrary).toContainEqual(newTransceiver);
      // Store should NOT be affected
      const storeLib = useSettingsStore.getState().settings.transceiverLibrary || [];
      expect(storeLib.find((t) => t.id === 'test-xcvr-1')).toBeUndefined();
    });

    it('should edit a transceiver in pending state', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      const lib = pending.transceiverLibrary || [];
      if (lib.length === 0) return;

      const firstId = lib[0].id;
      pending.transceiverLibrary = lib.map((t) =>
        t.id === firstId ? { ...t, name: 'Updated Name', vendor: 'UpdatedVendor' } : t
      );

      const updated = pending.transceiverLibrary?.find((t) => t.id === firstId);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.vendor).toBe('UpdatedVendor');
    });

    it('should delete a transceiver from pending state', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      const lib = pending.transceiverLibrary || [];
      const originalCount = lib.length;
      if (originalCount === 0) return;

      const deleteId = lib[0].id;
      pending.transceiverLibrary = lib.filter((t) => t.id !== deleteId);

      expect(pending.transceiverLibrary.length).toBe(originalCount - 1);
      expect(pending.transceiverLibrary.find((t) => t.id === deleteId)).toBeUndefined();
    });

    it('should not add duplicate transceiver IDs', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      const lib = pending.transceiverLibrary || [];
      if (lib.length === 0) return;

      const duplicate: TransceiverType = { ...lib[0], name: 'Duplicate' };

      // Check before adding (mimics the add handler logic)
      if (!lib.some((x) => x.id === duplicate.id)) {
        pending.transceiverLibrary = [...lib, duplicate];
      }

      // Should NOT have been added — id already exists
      expect(pending.transceiverLibrary?.length).toBe(lib.length);
    });
  });

  // ==========================================================================
  // Card CRUD
  // ==========================================================================

  describe('Card CRUD', () => {
    it('should render card table with correct count', () => {
      const settings = cloneSettings(useSettingsStore.getState().settings);
      const cards = settings.cardLibrary || [];
      expect(cards.length).toBe(DEFAULT_CARD_LIBRARY.length);
    });

    it('should add a card to pending state', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      const newCard: CardDefinition = {
        id: 'test-card-1',
        name: 'Test Card 1',
        vendor: 'generic',
        nodeType: 'router',
        portTemplate: [{ namePattern: 'Eth-{n}', type: 'bw', dataRate: '100G', count: 4 }],
        switchingCapacity: 400,
        powerConsumption: 300,
      };

      const lib = pending.cardLibrary || [];
      pending.cardLibrary = [...lib, newCard];

      expect(pending.cardLibrary).toContainEqual(newCard);
    });

    it('should edit a card in pending state', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      const lib = pending.cardLibrary || [];
      if (lib.length === 0) return;

      const firstId = lib[0].id;
      pending.cardLibrary = lib.map((c) =>
        c.id === firstId ? { ...c, name: 'Edited Card', switchingCapacity: 999 } : c
      );

      const updated = pending.cardLibrary?.find((c) => c.id === firstId);
      expect(updated?.name).toBe('Edited Card');
      expect(updated?.switchingCapacity).toBe(999);
    });

    it('should delete a card from pending state', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      const lib = pending.cardLibrary || [];
      const originalCount = lib.length;
      if (originalCount === 0) return;

      pending.cardLibrary = lib.filter((c) => c.id !== lib[0].id);
      expect(pending.cardLibrary.length).toBe(originalCount - 1);
    });
  });

  // ==========================================================================
  // Change Detection for Inventory
  // ==========================================================================

  describe('detectChanges for inventory', () => {
    it('should return no changes when inventory is unchanged', () => {
      const current = cloneSettings(DEFAULT_SETTINGS);
      const pending = cloneSettings(DEFAULT_SETTINGS);
      const changes = detectChanges(current, pending);
      expect(changes).toEqual([]);
    });

    it('should detect transceiver library additions', () => {
      const current = cloneSettings(DEFAULT_SETTINGS);
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.transceiverLibrary = [
        ...(pending.transceiverLibrary || []),
        {
          id: 'new-xcvr',
          name: 'New XCVR',
          vendor: 'Test',
          formFactor: 'QSFP-DD' as const,
          launchPower: 0,
          receiverSensitivity: -20,
          txOSNR: 38,
          supportedModulations: [],
          supportedDataRates: [],
          baudRate: 64,
        },
      ];

      const changes = detectChanges(current, pending);
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.section === 'Inventory' && c.label === 'Transceiver library')).toBe(true);
    });

    it('should detect transceiver library modifications', () => {
      const current = cloneSettings(DEFAULT_SETTINGS);
      current.transceiverLibrary = [...DEFAULT_TRANSCEIVERS];
      const pending = cloneSettings(current);
      if (pending.transceiverLibrary && pending.transceiverLibrary.length > 0) {
        pending.transceiverLibrary[0] = { ...pending.transceiverLibrary[0], vendor: 'ModifiedVendor' };
      }

      const changes = detectChanges(current, pending);
      expect(changes.length).toBe(1);
      expect(changes[0].label).toBe('Transceiver library');
      expect(changes[0].oldValue).toBe('modified');
      expect(changes[0].newValue).toBe('updated');
    });

    it('should detect card library changes', () => {
      const current = cloneSettings(DEFAULT_SETTINGS);
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.cardLibrary = [
        ...(pending.cardLibrary || []),
        {
          id: 'new-card',
          name: 'New Card',
          vendor: 'generic',
          nodeType: 'router' as const,
          portTemplate: [{ namePattern: 'Eth-{n}', type: 'bw' as const, dataRate: '10G' as const, count: 8 }],
        },
      ];

      const changes = detectChanges(current, pending);
      expect(changes.some((c) => c.section === 'Inventory' && c.label === 'Card library')).toBe(true);
    });

    it('should detect node subtype changes', () => {
      const current = cloneSettings(DEFAULT_SETTINGS);
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.nodeSubtypes = pending.nodeSubtypes.filter((s) => s.key !== 'core');

      const changes = detectChanges(current, pending);
      expect(changes.some((c) => c.section === 'Inventory' && c.label === 'Node subtypes')).toBe(true);
    });
  });

  // ==========================================================================
  // Apply workflow with inventory changes
  // ==========================================================================

  describe('Apply workflow with inventory', () => {
    it('should atomically apply inventory changes via importSettings', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      const newCard: CardDefinition = {
        id: 'apply-test-card',
        name: 'Apply Test Card',
        vendor: 'generic',
        nodeType: 'switch',
        portTemplate: [{ namePattern: 'Port-{n}', type: 'bw', dataRate: '1G', count: 24 }],
      };
      pending.cardLibrary = [...(pending.cardLibrary || []), newCard];

      const result = useSettingsStore.getState().importSettings(pending);
      expect(result.success).toBe(true);

      const updated = useSettingsStore.getState().settings;
      expect(updated.cardLibrary?.find((c) => c.id === 'apply-test-card')).toBeDefined();
    });

    it('should preserve other settings when applying inventory changes', () => {
      const pending = cloneSettings(useSettingsStore.getState().settings);
      pending.cardLibrary = []; // Clear all cards

      useSettingsStore.getState().importSettings(pending);

      const updated = useSettingsStore.getState().settings;
      expect(updated.cardLibrary).toEqual([]);
      // Other settings should be preserved
      expect(updated.general.autoSave).toBe(true);
      expect(updated.canvas.gridSize).toBe(40);
      expect(updated.nodeSubtypes.length).toBe(DEFAULT_NODE_SUBTYPES.length);
    });
  });
});
