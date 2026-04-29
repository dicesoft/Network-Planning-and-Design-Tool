import { describe, it, expect } from 'vitest';
import { migrateSettings, useSettingsStore } from '../settingsStore';
import { DEFAULT_GENERAL_SETTINGS, DEFAULT_SETTINGS } from '@/types/settings';

describe('settingsStore migration v3 → v4', () => {
  it('adds general.showRoadmap (default false) to a v3 persisted state', () => {
    const v3State = {
      settings: {
        version: 3,
        general: {
          autoSave: true,
          distanceUnit: 'km' as const,
          confirmDestructiveActions: true,
        },
        canvas: { ...DEFAULT_SETTINGS.canvas },
        network: { ...DEFAULT_SETTINGS.network },
        simulation: { ...DEFAULT_SETTINGS.simulation },
        advanced: { ...DEFAULT_SETTINGS.advanced },
        nodeSubtypes: [],
        optical: { ...DEFAULT_SETTINGS.optical! },
      },
    };

    const migrated = migrateSettings(v3State, 3);

    expect(migrated.settings.general.showRoadmap).toBe(false);
    expect(migrated.settings.version).toBe(4);
    // Existing v3 fields are preserved.
    expect(migrated.settings.general.autoSave).toBe(true);
    expect(migrated.settings.general.distanceUnit).toBe('km');
  });

  it('preserves a previously-set showRoadmap value if present', () => {
    const stateWithRoadmap = {
      settings: {
        version: 3,
        general: {
          ...DEFAULT_GENERAL_SETTINGS,
          showRoadmap: true,
        },
        canvas: { ...DEFAULT_SETTINGS.canvas },
        network: { ...DEFAULT_SETTINGS.network },
        simulation: { ...DEFAULT_SETTINGS.simulation },
        advanced: { ...DEFAULT_SETTINGS.advanced },
        nodeSubtypes: [],
      },
    };

    const migrated = migrateSettings(stateWithRoadmap, 3);
    expect(migrated.settings.general.showRoadmap).toBe(true);
  });

  it('chains migrations through earlier versions to land at v4 with showRoadmap', () => {
    const v0State = { settings: undefined };
    const migrated = migrateSettings(v0State, 0);

    expect(migrated.settings.general.showRoadmap).toBe(false);
    // After running through every migration step.
    expect(migrated.settings.version).toBe(4);
  });
});

describe('settingsStore — clean install', () => {
  it('initializes general.showRoadmap to false on a fresh store', () => {
    const state = useSettingsStore.getState();
    expect(state.settings.general.showRoadmap).toBe(false);
  });

  it('reports version 4 in DEFAULT_SETTINGS', () => {
    expect(DEFAULT_SETTINGS.version).toBe(4);
  });
});
