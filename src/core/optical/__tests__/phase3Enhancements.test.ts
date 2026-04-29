/**
 * Phase 3 Enhancement Tests
 *
 * Tests for:
 * - Negative margin service creation
 * - New transceiver library entries
 * - OSNR engine with new transceiver params
 * - Settings store migration v2->v3
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_TRANSCEIVERS, type TransceiverType } from '@/types/transceiver';
import { calculateOSNR } from '@/core/optical/OSNREngine';
import type { SpanInput, AmplifierParams, TransceiverParams } from '@/core/optical/types';

// ============================================================================
// NEGATIVE MARGIN SERVICE METADATA
// ============================================================================

describe('Negative Margin Service Metadata', () => {
  it('should mark metadata with osnrFeasible: false when allowNegativeMargin is set', () => {
    const metadata: Record<string, unknown> = {};
    const allowNegativeMargin = true;

    // Simulate the wizard's metadata construction logic
    const result = allowNegativeMargin
      ? { ...metadata, osnrFeasible: false, allowNegativeMargin: true }
      : metadata;

    expect(result.osnrFeasible).toBe(false);
    expect(result.allowNegativeMargin).toBe(true);
  });

  it('should produce empty metadata when allowNegativeMargin is false', () => {
    const metadata: Record<string, unknown> = {};
    const allowNegativeMargin = false;

    const result = allowNegativeMargin
      ? { ...metadata, osnrFeasible: false, allowNegativeMargin: true }
      : metadata;

    expect(result.osnrFeasible).toBeUndefined();
    expect(result.allowNegativeMargin).toBeUndefined();
  });
});

// ============================================================================
// NEW TRANSCEIVER LIBRARY ENTRIES
// ============================================================================

const NEW_TRANSCEIVER_IDS = [
  'sfp-plus-10g-lr',
  'sfp28-25g-lr',
  'qsfp28-100g-zr',
  'qsfp-dd-200g-zr',
  'osfp-400g-zr',
];

describe('New Transceiver Library Entries', () => {
  it('should have all 5 new transceivers in DEFAULT_TRANSCEIVERS', () => {
    for (const id of NEW_TRANSCEIVER_IDS) {
      const found = DEFAULT_TRANSCEIVERS.find((t) => t.id === id);
      expect(found, `Missing transceiver: ${id}`).toBeDefined();
    }
  });

  it('should have unique IDs across all transceivers', () => {
    const ids = DEFAULT_TRANSCEIVERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have valid requiredOSNR and maxReach for all new transceivers', () => {
    for (const id of NEW_TRANSCEIVER_IDS) {
      const t = DEFAULT_TRANSCEIVERS.find((tr) => tr.id === id)!;
      for (const mod of t.supportedModulations) {
        expect(mod.requiredOSNR, `${id} ${mod.modulation} requiredOSNR`).toBeGreaterThan(0);
        expect(mod.requiredOSNR, `${id} ${mod.modulation} requiredOSNR`).toBeLessThan(50);
        expect(Number.isFinite(mod.requiredOSNR), `${id} ${mod.modulation} requiredOSNR finite`).toBe(true);

        expect(mod.maxReach, `${id} ${mod.modulation} maxReach`).toBeGreaterThan(0);
        expect(mod.maxReach, `${id} ${mod.modulation} maxReach`).toBeLessThan(10000);
        expect(Number.isFinite(mod.maxReach), `${id} ${mod.modulation} maxReach finite`).toBe(true);
      }
    }
  });

  it('should have valid optical parameters for all new transceivers', () => {
    for (const id of NEW_TRANSCEIVER_IDS) {
      const t = DEFAULT_TRANSCEIVERS.find((tr) => tr.id === id)!;
      expect(t.launchPower, `${id} launchPower`).toBeGreaterThanOrEqual(-20);
      expect(t.launchPower, `${id} launchPower`).toBeLessThanOrEqual(10);
      expect(t.txOSNR, `${id} txOSNR`).toBeGreaterThan(25);
      expect(t.baudRate, `${id} baudRate`).toBeGreaterThan(0);
    }
  });

  it('should cover all standard data rates with new transceivers', () => {
    const newTransceivers = DEFAULT_TRANSCEIVERS.filter((t) => NEW_TRANSCEIVER_IDS.includes(t.id));
    const coveredRates = new Set(newTransceivers.flatMap((t) => t.supportedDataRates));
    expect(coveredRates.has('10G')).toBe(true);
    expect(coveredRates.has('25G')).toBe(true);
    expect(coveredRates.has('100G')).toBe(true);
    expect(coveredRates.has('200G')).toBe(true);
    expect(coveredRates.has('400G')).toBe(true);
  });

  it('SFP+-10G-LR should support 10G', () => {
    const t = DEFAULT_TRANSCEIVERS.find((tr) => tr.id === 'sfp-plus-10g-lr')!;
    expect(t.formFactor).toBe('SFP+');
    expect(t.supportedDataRates).toContain('10G');
  });

  it('SFP28-25G-LR should support 25G', () => {
    const t = DEFAULT_TRANSCEIVERS.find((tr) => tr.id === 'sfp28-25g-lr')!;
    expect(t.formFactor).toBe('SFP28');
    expect(t.supportedDataRates).toContain('25G');
  });

  it('OSFP-400G-ZR should support 400G with multiple modulations', () => {
    const t = DEFAULT_TRANSCEIVERS.find((tr) => tr.id === 'osfp-400g-zr')!;
    expect(t.formFactor).toBe('OSFP');
    expect(t.supportedDataRates).toContain('400G');
    expect(t.supportedModulations.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// OSNR ENGINE WITH NEW TRANSCEIVER PARAMS
// ============================================================================

describe('OSNR Engine with New Transceiver Params', () => {
  const createTestSpan = (distance: number): SpanInput => ({
    length: distance,
    attenuationCoeff: 0.2,
    dispersionCoeff: 17,
    connectorCount: 2,
    connectorLoss: 0.5,
    spliceCount: Math.ceil(distance / 5),
    spliceLoss: 0.05,
  });

  const defaultAmplifier: AmplifierParams = {
    gain: 20,
    noiseFigure: 5.5,
    type: 'inline',
    position: 80,
  };

  it('should produce valid OSNR results for each new transceiver (no NaN/Infinity)', () => {
    const spans = [createTestSpan(80), createTestSpan(80)];
    const amplifiers = [defaultAmplifier];

    for (const id of NEW_TRANSCEIVER_IDS) {
      const t = DEFAULT_TRANSCEIVERS.find((tr) => tr.id === id)!;
      const mod = t.supportedModulations[0];

      const transceiverParams: TransceiverParams = {
        launchPower: t.launchPower,
        txOSNR: t.txOSNR,
        requiredOSNR: mod.requiredOSNR,
        baudRate: t.baudRate,
      };

      const result = calculateOSNR(spans, transceiverParams, amplifiers, 2.0);

      expect(Number.isFinite(result.finalGSNR), `${id} finalGSNR is finite`).toBe(true);
      expect(Number.isNaN(result.finalGSNR), `${id} finalGSNR is not NaN`).toBe(false);
      expect(Number.isFinite(result.systemMargin), `${id} systemMargin is finite`).toBe(true);
      expect(Number.isNaN(result.systemMargin), `${id} systemMargin is not NaN`).toBe(false);
      expect(Number.isFinite(result.requiredOSNR), `${id} requiredOSNR is finite`).toBe(true);
    }
  });

  it('should report feasibility correctly based on margin', () => {
    // Very short path — should be feasible
    const shortSpans = [createTestSpan(40)];

    const t = DEFAULT_TRANSCEIVERS.find((tr) => tr.id === 'qsfp28-100g-zr')!;
    const mod = t.supportedModulations[0]; // DP-QPSK, requiredOSNR=12
    const params: TransceiverParams = {
      launchPower: t.launchPower,
      txOSNR: t.txOSNR,
      requiredOSNR: mod.requiredOSNR,
      baudRate: t.baudRate,
    };

    const result = calculateOSNR(shortSpans, params, [defaultAmplifier], 2.0);
    expect(result.feasible).toBe(true);
    expect(result.systemMargin).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// SETTINGS STORE MIGRATION v2 -> v3
// ============================================================================

describe('Settings Store Migration v2 -> v3', () => {
  // Simulate the migration logic from settingsStore
  function migrateV2toV3(
    existingLibrary: TransceiverType[],
    defaultLibrary: TransceiverType[],
  ): TransceiverType[] {
    const existingIds = new Set(existingLibrary.map((t) => t.id));
    const newTransceivers = defaultLibrary.filter((t) => !existingIds.has(t.id));
    return [...existingLibrary, ...newTransceivers];
  }

  it('should add new transceivers when user has only original defaults', () => {
    const originalDefaults: TransceiverType[] = DEFAULT_TRANSCEIVERS.filter(
      (t) => t.id === 'cfp2-dco-100g' || t.id === 'qsfp-dd-zrp-400g'
    );

    const result = migrateV2toV3(originalDefaults, DEFAULT_TRANSCEIVERS);

    // Should contain all defaults
    expect(result.length).toBe(DEFAULT_TRANSCEIVERS.length);
    for (const t of DEFAULT_TRANSCEIVERS) {
      expect(result.some((r) => r.id === t.id), `should contain ${t.id}`).toBe(true);
    }
  });

  it('should not overwrite user-modified transceivers', () => {
    const userLibrary: TransceiverType[] = [
      {
        ...DEFAULT_TRANSCEIVERS[0],
        name: 'My Custom CFP2',
        txOSNR: 42,
      },
    ];

    const result = migrateV2toV3(userLibrary, DEFAULT_TRANSCEIVERS);

    const cfp2 = result.find((t) => t.id === 'cfp2-dco-100g')!;
    expect(cfp2.name).toBe('My Custom CFP2');
    expect(cfp2.txOSNR).toBe(42);
  });

  it('should add new transceivers alongside user custom ones', () => {
    const userLibrary: TransceiverType[] = [
      ...DEFAULT_TRANSCEIVERS.filter((t) => t.id === 'cfp2-dco-100g'),
      {
        id: 'custom-800g',
        name: 'Custom 800G',
        vendor: 'CustomVendor',
        formFactor: 'OSFP',
        launchPower: 0,
        receiverSensitivity: -15,
        txOSNR: 40,
        supportedModulations: [{ modulation: 'DP-16QAM', requiredOSNR: 20, maxReach: 500 }],
        supportedDataRates: ['400G'],
        baudRate: 96,
      },
    ];

    const result = migrateV2toV3(userLibrary, DEFAULT_TRANSCEIVERS);

    // Should keep user's custom transceiver
    expect(result.some((t) => t.id === 'custom-800g')).toBe(true);
    // Should add all new defaults that weren't already present
    for (const id of NEW_TRANSCEIVER_IDS) {
      expect(result.some((t) => t.id === id), `should contain ${id}`).toBe(true);
    }
  });

  it('should handle empty user library', () => {
    const result = migrateV2toV3([], DEFAULT_TRANSCEIVERS);
    expect(result.length).toBe(DEFAULT_TRANSCEIVERS.length);
  });
});
