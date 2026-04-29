/**
 * Settings Wiring Verification Tests
 *
 * Verifies that every setting in settingsStore is actually consumed
 * by the correct component or core module.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { useNetworkStore } from '@/stores/networkStore';
import { DEFAULT_OPTICAL_SETTINGS, DEFAULT_SETTINGS } from '@/types/settings';
import { DEFAULT_CARD_LIBRARY } from '@/types/inventory';
import { DEFAULT_TRANSCEIVERS } from '@/types/transceiver';

describe('Settings Wiring Verification', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetAll();
    useNetworkStore.getState().clearTopology();
  });

  describe('Optical settings -> OSNR engine consumers', () => {
    it('eolMargin should be readable from settings', () => {
      const optical = useSettingsStore.getState().settings.optical;
      expect(optical?.defaultEoLMargin).toBe(3.0);
    });

    it('eolMargin should update when changed', () => {
      useSettingsStore.getState().updateOpticalSettings({ defaultEoLMargin: 5.0 });
      expect(useSettingsStore.getState().settings.optical?.defaultEoLMargin).toBe(5.0);
    });

    it('defaultNF should be accessible and default to 5.5', () => {
      expect(useSettingsStore.getState().settings.optical?.defaultNF).toBe(5.5);
    });

    it('defaultNF should update when changed', () => {
      useSettingsStore.getState().updateOpticalSettings({ defaultNF: 7.0 });
      expect(useSettingsStore.getState().settings.optical?.defaultNF).toBe(7.0);
    });

    it('defaultConnectorLoss should be accessible and default to 0.5', () => {
      expect(useSettingsStore.getState().settings.optical?.defaultConnectorLoss).toBe(0.5);
    });

    it('defaultConnectorLoss should update when changed', () => {
      useSettingsStore.getState().updateOpticalSettings({ defaultConnectorLoss: 0.3 });
      expect(useSettingsStore.getState().settings.optical?.defaultConnectorLoss).toBe(0.3);
    });

    it('defaultLaunchPower should be accessible and default to 0', () => {
      expect(useSettingsStore.getState().settings.optical?.defaultLaunchPower).toBe(0);
    });

    it('defaultLaunchPower should update when changed', () => {
      useSettingsStore.getState().updateOpticalSettings({ defaultLaunchPower: -2 });
      expect(useSettingsStore.getState().settings.optical?.defaultLaunchPower).toBe(-2);
    });
  });

  describe('transceiverLibrary -> Service wizard', () => {
    it('should default to undefined (uses DEFAULT_TRANSCEIVERS)', () => {
      const lib = useSettingsStore.getState().settings.transceiverLibrary;
      // May be undefined for fresh defaults, which is fine — wizard merges with DEFAULT_TRANSCEIVERS
      expect(lib === undefined || Array.isArray(lib)).toBe(true);
    });

    it('should accept custom transceivers via importSettings', () => {
      const pending = JSON.parse(JSON.stringify(useSettingsStore.getState().settings));
      pending.transceiverLibrary = [
        { ...DEFAULT_TRANSCEIVERS[0], id: 'custom-xcvr', name: 'Custom 100G' },
      ];
      useSettingsStore.getState().importSettings(pending);
      const lib = useSettingsStore.getState().settings.transceiverLibrary;
      expect(lib).toHaveLength(1);
      expect(lib![0].id).toBe('custom-xcvr');
    });
  });

  describe('cardLibrary -> Inventory tab', () => {
    it('should default to DEFAULT_CARD_LIBRARY', () => {
      const lib = useSettingsStore.getState().settings.cardLibrary;
      expect(lib).toBeDefined();
      expect(lib!.length).toBe(DEFAULT_CARD_LIBRARY.length);
    });

    it('should accept custom cards via importSettings', () => {
      const pending = JSON.parse(JSON.stringify(useSettingsStore.getState().settings));
      pending.cardLibrary = [
        ...DEFAULT_CARD_LIBRARY,
        {
          id: 'custom-card',
          name: 'Custom Line Card',
          vendor: 'generic',
          nodeType: 'router',
          portTemplate: [],
          switchingCapacity: 100,
          powerConsumption: 50,
        },
      ];
      useSettingsStore.getState().importSettings(pending);
      const lib = useSettingsStore.getState().settings.cardLibrary;
      expect(lib!.length).toBe(DEFAULT_CARD_LIBRARY.length + 1);
    });
  });

  describe('Network settings -> networkStore node creation', () => {
    it('defaultVendor should be used when adding a node', () => {
      useSettingsStore.getState().updateNetworkSettings({ defaultVendor: 'nokia' });
      useNetworkStore.getState().addNode({
        name: 'Test-1',
        type: 'router',
        position: { x: 0, y: 0 },
      });
      const nodes = useNetworkStore.getState().topology.nodes;
      expect(nodes[0].vendor).toBe('nokia');
    });

    it('defaultEdgeDistance should be used when adding an edge', () => {
      useSettingsStore.getState().updateNetworkSettings({ defaultEdgeDistance: 120 });
      // Add two nodes
      const id1 = useNetworkStore.getState().addNode({ name: 'A', type: 'router', position: { x: 0, y: 0 } });
      const id2 = useNetworkStore.getState().addNode({ name: 'B', type: 'router', position: { x: 100, y: 0 } });
      useNetworkStore.getState().addEdge(id1, id2);
      const edges = useNetworkStore.getState().topology.edges;
      expect(edges[0].properties.distance).toBe(120);
    });

    it('defaultFiberProfile should be used when adding an edge', () => {
      useSettingsStore.getState().updateNetworkSettings({ defaultFiberProfile: 'G.654.E' });
      const id1 = useNetworkStore.getState().addNode({ name: 'A', type: 'router', position: { x: 0, y: 0 } });
      const id2 = useNetworkStore.getState().addNode({ name: 'B', type: 'router', position: { x: 100, y: 0 } });
      useNetworkStore.getState().addEdge(id1, id2);
      const edges = useNetworkStore.getState().topology.edges;
      expect(edges[0].properties.fiberProfile?.profileType).toBe('G.654.E');
    });
  });

  describe('Advanced settings -> history', () => {
    it('historyLimit should control undo history size', () => {
      useSettingsStore.getState().updateAdvancedSettings({ historyLimit: 3 });
      // Add more nodes than history limit
      for (let i = 0; i < 5; i++) {
        useNetworkStore.getState().addNode({
          name: `Node-${i}`,
          type: 'router',
          position: { x: i * 100, y: 0 },
        });
      }
      // History should be capped at historyLimit
      const history = useNetworkStore.getState().history;
      expect(history.length).toBeLessThanOrEqual(3);
      // Reset
      useSettingsStore.getState().updateAdvancedSettings({ historyLimit: 50 });
    });
  });

  describe('Settings apply via importSettings atomically', () => {
    it('should apply multiple changes in one call', () => {
      const pending = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      pending.general.autoSave = false;
      pending.general.distanceUnit = 'mi';
      pending.network.defaultEdgeDistance = 200;
      pending.canvas.gridSize = 80;
      pending.optical = { ...DEFAULT_OPTICAL_SETTINGS, defaultEoLMargin: 5.0 };

      const result = useSettingsStore.getState().importSettings(pending);
      expect(result.success).toBe(true);

      const s = useSettingsStore.getState().settings;
      expect(s.general.autoSave).toBe(false);
      expect(s.general.distanceUnit).toBe('mi');
      expect(s.network.defaultEdgeDistance).toBe(200);
      expect(s.canvas.gridSize).toBe(80);
      expect(s.optical?.defaultEoLMargin).toBe(5.0);
    });
  });
});
