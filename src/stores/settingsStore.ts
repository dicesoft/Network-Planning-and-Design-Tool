import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { setupCrossTabSync, notifyCrossTabSync, markStoreRehydrated } from '@/lib/cross-tab-sync';
import { createIndexedDBStorage } from '@/lib/indexeddb-storage';
import type {
  AppSettings,
  GeneralSettings,
  CanvasSettings,
  NetworkSettings,
  SimulationSettings,
  AdvancedSettings,
  OpticalSettings,
  NodeSubtypePreset,
  SettingsTab,
} from '@/types/settings';
import {
  DEFAULT_SETTINGS,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_CANVAS_SETTINGS,
  DEFAULT_NETWORK_SETTINGS,
  DEFAULT_SIMULATION_SETTINGS,
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_NODE_SUBTYPES,
  DEFAULT_OPTICAL_SETTINGS,
} from '@/types/settings';
import { DEFAULT_CARD_LIBRARY } from '@/types/inventory';
import { DEFAULT_TRANSCEIVERS } from '@/types/transceiver';

// ============================================================================
// STORE STATE INTERFACE
// ============================================================================

/**
 * Settings store state interface
 */
interface SettingsState {
  // Settings data
  settings: AppSettings;

  // UI state (not persisted)
  activeTab: SettingsTab;

  // Actions - General
  updateGeneralSettings: (updates: Partial<GeneralSettings>) => void;
  updateCanvasSettings: (updates: Partial<CanvasSettings>) => void;
  updateNetworkSettings: (updates: Partial<NetworkSettings>) => void;
  updateSimulationSettings: (updates: Partial<SimulationSettings>) => void;
  updateAdvancedSettings: (updates: Partial<AdvancedSettings>) => void;
  updateOpticalSettings: (updates: Partial<OpticalSettings>) => void;

  // Actions - Node Subtypes
  addNodeSubtype: (preset: NodeSubtypePreset) => void;
  updateNodeSubtype: (key: string, updates: Partial<NodeSubtypePreset>) => void;
  removeNodeSubtype: (key: string) => void;
  resetNodeSubtypes: () => void;

  // Actions - Tab navigation
  setActiveTab: (tab: SettingsTab) => void;

  // Actions - Reset
  resetSection: (section: 'general' | 'canvas' | 'network' | 'simulation' | 'advanced') => void;
  resetAll: () => void;

  // Actions - Import/Export
  exportSettings: () => AppSettings;
  importSettings: (settings: AppSettings) => { success: boolean; error?: string };

  // Selectors
  getSubtypesForNodeType: (nodeType: string) => NodeSubtypePreset[];
}

// ============================================================================
// MIGRATION
// ============================================================================

/**
 * Migrate settings from one schema version to another.
 * Called by zustand persist middleware when loading from localStorage.
 *
 * IMPORTANT: Always add migration cases when bumping the version number.
 * Each case handles migrating from version N to N+1.
 */
export const migrateSettings = (
  persistedState: unknown,
  version: number
): { settings: AppSettings } => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let state = persistedState as any;

  // Migration from version 0 (no version field) to version 1
  if (version === 0) {
    state = {
      settings: {
        ...DEFAULT_SETTINGS,
        ...(state?.settings || {}),
      },
    };
  }

  // Migration from version 1 to version 2: add optical, transceiverLibrary, cardLibrary
  if (version === 1) {
    if (state?.settings) {
      state.settings.optical = state.settings.optical || { ...DEFAULT_OPTICAL_SETTINGS };
      state.settings.cardLibrary = state.settings.cardLibrary || [...DEFAULT_CARD_LIBRARY];
      state.settings.version = 2;
    }
  }

  // Migration from version 2 to version 3: merge new default transceivers into user library
  if (version === 2) {
    if (state?.settings) {
      const existingLibrary: Array<{ id: string }> = state.settings.transceiverLibrary || [];
      const existingIds = new Set(existingLibrary.map((t: { id: string }) => t.id));
      // Only add transceivers with IDs that don't already exist in the user's library
      const newTransceivers = DEFAULT_TRANSCEIVERS.filter((t) => !existingIds.has(t.id));
      state.settings.transceiverLibrary = [...existingLibrary, ...newTransceivers];
      state.settings.version = 3;
    }
  }

  // Migration from version 3 to version 4: add general.showRoadmap (default false)
  if (version <= 3) {
    if (state?.settings) {
      state.settings.general = {
        ...DEFAULT_GENERAL_SETTINGS,
        ...(state.settings.general || {}),
        // Preserve any pre-existing value if a user manually set one in dev tools.
        showRoadmap: state.settings.general?.showRoadmap ?? false,
      };
      state.settings.version = 4;
    }
  }

  return state;
};

// ============================================================================
// STORE CREATION
// ============================================================================

/**
 * Settings store for application configuration
 * Uses zustand + immer + persist pattern matching other stores
 */
export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      immer((set, get) => ({
        // Initial state
        settings: { ...DEFAULT_SETTINGS },
        activeTab: 'general' as SettingsTab,

        // ==================================================================
        // SECTION UPDATE ACTIONS
        // ==================================================================

        updateGeneralSettings: (updates) => {
          set((state) => {
            Object.assign(state.settings.general, updates);
          });
        },

        updateCanvasSettings: (updates) => {
          set((state) => {
            Object.assign(state.settings.canvas, updates);
          });
        },

        updateNetworkSettings: (updates) => {
          set((state) => {
            Object.assign(state.settings.network, updates);
          });
        },

        updateSimulationSettings: (updates) => {
          set((state) => {
            Object.assign(state.settings.simulation, updates);
          });
        },

        updateAdvancedSettings: (updates) => {
          set((state) => {
            Object.assign(state.settings.advanced, updates);
          });
        },

        updateOpticalSettings: (updates) => {
          set((state) => {
            if (!state.settings.optical) {
              state.settings.optical = { ...DEFAULT_OPTICAL_SETTINGS };
            }
            Object.assign(state.settings.optical, updates);
          });
        },

        // ==================================================================
        // NODE SUBTYPE ACTIONS
        // ==================================================================

        addNodeSubtype: (preset) => {
          set((state) => {
            // Prevent duplicate keys
            const exists = state.settings.nodeSubtypes.some((s) => s.key === preset.key);
            if (!exists) {
              state.settings.nodeSubtypes.push(preset);
            }
          });
        },

        updateNodeSubtype: (key, updates) => {
          set((state) => {
            const index = state.settings.nodeSubtypes.findIndex((s) => s.key === key);
            if (index !== -1) {
              Object.assign(state.settings.nodeSubtypes[index], updates);
            }
          });
        },

        removeNodeSubtype: (key) => {
          set((state) => {
            state.settings.nodeSubtypes = state.settings.nodeSubtypes.filter(
              (s) => s.key !== key
            );
          });
        },

        resetNodeSubtypes: () => {
          set((state) => {
            state.settings.nodeSubtypes = [...DEFAULT_NODE_SUBTYPES];
          });
        },

        // ==================================================================
        // TAB NAVIGATION
        // ==================================================================

        setActiveTab: (tab) => {
          set((state) => {
            state.activeTab = tab;
          });
        },

        // ==================================================================
        // RESET ACTIONS
        // ==================================================================

        resetSection: (section) => {
          set((state) => {
            switch (section) {
              case 'general':
                state.settings.general = { ...DEFAULT_GENERAL_SETTINGS };
                break;
              case 'canvas':
                state.settings.canvas = { ...DEFAULT_CANVAS_SETTINGS };
                break;
              case 'network':
                state.settings.network = { ...DEFAULT_NETWORK_SETTINGS };
                break;
              case 'simulation':
                state.settings.simulation = { ...DEFAULT_SIMULATION_SETTINGS };
                break;
              case 'advanced':
                state.settings.advanced = { ...DEFAULT_ADVANCED_SETTINGS };
                break;
            }
          });
        },

        resetAll: () => {
          set((state) => {
            state.settings = { ...DEFAULT_SETTINGS };
          });
        },

        // ==================================================================
        // IMPORT/EXPORT
        // ==================================================================

        exportSettings: () => {
          return JSON.parse(JSON.stringify(get().settings));
        },

        importSettings: (imported) => {
          // Validate version
          if (typeof imported.version !== 'number') {
            return { success: false, error: 'Invalid settings: missing version field' };
          }

          // Validate required sections exist
          const requiredSections = ['general', 'canvas', 'network', 'simulation', 'advanced'] as const;
          for (const section of requiredSections) {
            if (!imported[section] || typeof imported[section] !== 'object') {
              return { success: false, error: `Invalid settings: missing "${section}" section` };
            }
          }

          set((state) => {
            // Merge with defaults to ensure all fields exist
            state.settings = {
              version: DEFAULT_SETTINGS.version,
              general: { ...DEFAULT_GENERAL_SETTINGS, ...imported.general },
              canvas: { ...DEFAULT_CANVAS_SETTINGS, ...imported.canvas },
              network: { ...DEFAULT_NETWORK_SETTINGS, ...imported.network },
              simulation: { ...DEFAULT_SIMULATION_SETTINGS, ...imported.simulation },
              advanced: { ...DEFAULT_ADVANCED_SETTINGS, ...imported.advanced },
              nodeSubtypes: imported.nodeSubtypes || [...DEFAULT_NODE_SUBTYPES],
              optical: imported.optical ? { ...DEFAULT_OPTICAL_SETTINGS, ...imported.optical } : { ...DEFAULT_OPTICAL_SETTINGS },
              transceiverLibrary: imported.transceiverLibrary,
              cardLibrary: imported.cardLibrary,
            };
          });

          return { success: true };
        },

        // ==================================================================
        // SELECTORS
        // ==================================================================

        getSubtypesForNodeType: (nodeType) => {
          return get().settings.nodeSubtypes.filter((s) => s.nodeType === nodeType);
        },
      })),
      {
        name: 'settings-store',
        storage: createJSONStorage(() => createIndexedDBStorage()),
        version: 4,
        migrate: migrateSettings,
        partialize: (state) => ({
          settings: state.settings,
        }),
        onRehydrateStorage: () => () => {
          markStoreRehydrated('settings-store');
        },
      }
    ),
    { name: 'SettingsStore' }
  )
);

// ============================================================================
// CROSS-TAB SYNC
// ============================================================================

/**
 * Setup cross-tab synchronization for settings store.
 * Uses BroadcastChannel (with storage event fallback).
 */
export const setupSettingsStoreCrossTabSync = (): (() => void) => {
  const cleanupSync = setupCrossTabSync('settings-store', useSettingsStore);
  const unsubscribe = useSettingsStore.subscribe(() => {
    notifyCrossTabSync('settings-store');
  });

  return () => {
    cleanupSync();
    unsubscribe();
  };
};

// ============================================================================
// SELECTORS (for optimized re-renders)
// ============================================================================

/**
 * Select general settings
 */
export const selectGeneralSettings = (state: SettingsState) => state.settings.general;

/**
 * Select canvas settings
 */
export const selectCanvasSettings = (state: SettingsState) => state.settings.canvas;

/**
 * Select network settings
 */
export const selectNetworkSettings = (state: SettingsState) => state.settings.network;

/**
 * Select simulation settings
 */
export const selectSimulationSettings = (state: SettingsState) => state.settings.simulation;

/**
 * Select advanced settings
 */
export const selectAdvancedSettings = (state: SettingsState) => state.settings.advanced;

/**
 * Select node subtypes
 */
export const selectNodeSubtypes = (state: SettingsState) => state.settings.nodeSubtypes;

/**
 * Select optical settings
 */
export const selectOpticalSettings = (state: SettingsState) =>
  state.settings.optical || DEFAULT_OPTICAL_SETTINGS;

/**
 * Select active settings tab
 */
export const selectActiveTab = (state: SettingsState) => state.activeTab;
