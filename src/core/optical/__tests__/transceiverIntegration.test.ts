/**
 * Transceiver Library Integration Tests
 *
 * Tests transceiver filtering logic, compatibility checks, and parameter extraction.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_TRANSCEIVERS, type TransceiverType } from '@/types/transceiver';
import type { L1DataRate, ModulationType } from '@/types/service';

// ============================================================================
// HELPERS (mirrors the filtering logic in ServiceWizardParameters.tsx)
// ============================================================================

function filterTransceivers(
  transceivers: TransceiverType[],
  dataRate: L1DataRate,
  modulationType: ModulationType,
): TransceiverType[] {
  return transceivers.filter((t) => {
    const rateMatch = t.supportedDataRates.includes(dataRate);
    const modMatch = t.supportedModulations.some(
      (m) => m.modulation === modulationType
    );
    return rateMatch && modMatch;
  });
}

function getModulationInfo(
  transceiver: TransceiverType,
  modulationType: ModulationType,
) {
  return transceiver.supportedModulations.find(
    (m) => m.modulation === modulationType
  ) || null;
}

// ============================================================================
// DEFAULT TRANSCEIVERS SANITY
// ============================================================================

describe('Default Transceiver Library', () => {
  it('should have at least two default transceivers', () => {
    expect(DEFAULT_TRANSCEIVERS.length).toBeGreaterThanOrEqual(2);
  });

  it('should have unique IDs', () => {
    const ids = DEFAULT_TRANSCEIVERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have valid optical parameters', () => {
    for (const t of DEFAULT_TRANSCEIVERS) {
      expect(t.launchPower).toBeLessThanOrEqual(10); // Realistic range
      expect(t.launchPower).toBeGreaterThanOrEqual(-20);
      expect(t.txOSNR).toBeGreaterThan(25); // Minimum reasonable TX OSNR
      expect(t.baudRate).toBeGreaterThan(0);
      expect(t.supportedModulations.length).toBeGreaterThan(0);
      expect(t.supportedDataRates.length).toBeGreaterThan(0);
    }
  });

  it('should have CFP2-DCO-100G supporting DP-QPSK', () => {
    const cfp2 = DEFAULT_TRANSCEIVERS.find((t) => t.id === 'cfp2-dco-100g');
    expect(cfp2).toBeDefined();
    expect(cfp2!.supportedDataRates).toContain('100G');
    const dpqpsk = cfp2!.supportedModulations.find((m) => m.modulation === 'DP-QPSK');
    expect(dpqpsk).toBeDefined();
    expect(dpqpsk!.requiredOSNR).toBe(12);
    expect(dpqpsk!.maxReach).toBe(2500);
  });

  it('should have QSFP-DD-ZR+-400G supporting DP-16QAM', () => {
    const qsfp = DEFAULT_TRANSCEIVERS.find((t) => t.id === 'qsfp-dd-zrp-400g');
    expect(qsfp).toBeDefined();
    expect(qsfp!.supportedDataRates).toContain('400G');
    const dp16qam = qsfp!.supportedModulations.find((m) => m.modulation === 'DP-16QAM');
    expect(dp16qam).toBeDefined();
    expect(dp16qam!.requiredOSNR).toBe(22);
  });
});

// ============================================================================
// FILTERING BY DATA RATE + MODULATION
// ============================================================================

describe('Transceiver Filtering', () => {
  it('should filter by 100G + DP-QPSK (matches CFP2-DCO-100G and QSFP28-100G-ZR)', () => {
    const result = filterTransceivers(DEFAULT_TRANSCEIVERS, '100G', 'DP-QPSK');
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some((t) => t.id === 'cfp2-dco-100g')).toBe(true);
    expect(result.some((t) => t.id === 'qsfp28-100g-zr')).toBe(true);
  });

  it('should filter by 400G + DP-16QAM (matches QSFP-DD-ZR+-400G and OSFP-400G-ZR)', () => {
    const result = filterTransceivers(DEFAULT_TRANSCEIVERS, '400G', 'DP-16QAM');
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some((t) => t.id === 'qsfp-dd-zrp-400g')).toBe(true);
    expect(result.some((t) => t.id === 'osfp-400g-zr')).toBe(true);
  });

  it('should filter by 100G + DP-16QAM (matches CFP2-DCO-100G and QSFP28-100G-ZR)', () => {
    const result = filterTransceivers(DEFAULT_TRANSCEIVERS, '100G', 'DP-16QAM');
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some((t) => t.id === 'cfp2-dco-100g')).toBe(true);
    expect(result.some((t) => t.id === 'qsfp28-100g-zr')).toBe(true);
  });

  it('should filter by 400G + DP-QPSK (matches OSFP-400G-ZR)', () => {
    const result = filterTransceivers(DEFAULT_TRANSCEIVERS, '400G', 'DP-QPSK');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((t) => t.id === 'osfp-400g-zr')).toBe(true);
  });

  it('should return empty for 100G + DP-64QAM (no default transceiver supports this)', () => {
    const result = filterTransceivers(DEFAULT_TRANSCEIVERS, '100G', 'DP-64QAM');
    expect(result.length).toBe(0);
  });

  it('should filter 10G transceivers by data rate', () => {
    const result = filterTransceivers(DEFAULT_TRANSCEIVERS, '10G', 'DP-QPSK');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((t) => t.id === 'sfp-plus-10g-lr')).toBe(true);
  });

  it('should filter 25G transceivers by data rate', () => {
    const result = filterTransceivers(DEFAULT_TRANSCEIVERS, '25G', 'DP-QPSK');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((t) => t.id === 'sfp28-25g-lr')).toBe(true);
  });

  it('should filter 200G transceivers by data rate', () => {
    const result = filterTransceivers(DEFAULT_TRANSCEIVERS, '200G', 'DP-QPSK');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((t) => t.id === 'qsfp-dd-200g-zr')).toBe(true);
  });
});

// ============================================================================
// MODULATION INFO EXTRACTION
// ============================================================================

describe('Transceiver Modulation Info', () => {
  const cfp2 = DEFAULT_TRANSCEIVERS.find((t) => t.id === 'cfp2-dco-100g')!;
  const qsfp = DEFAULT_TRANSCEIVERS.find((t) => t.id === 'qsfp-dd-zrp-400g')!;

  it('should extract DP-QPSK info from CFP2-DCO-100G', () => {
    const info = getModulationInfo(cfp2, 'DP-QPSK');
    expect(info).not.toBeNull();
    expect(info!.requiredOSNR).toBe(12);
    expect(info!.maxReach).toBe(2500);
  });

  it('should extract DP-8QAM info from CFP2-DCO-100G', () => {
    const info = getModulationInfo(cfp2, 'DP-8QAM');
    expect(info).not.toBeNull();
    expect(info!.requiredOSNR).toBe(18);
    expect(info!.maxReach).toBe(1500);
  });

  it('should return null for unsupported modulation (DP-64QAM on CFP2)', () => {
    const info = getModulationInfo(cfp2, 'DP-64QAM');
    expect(info).toBeNull();
  });

  it('should extract DP-16QAM info from QSFP-DD-ZR+-400G', () => {
    const info = getModulationInfo(qsfp, 'DP-16QAM');
    expect(info).not.toBeNull();
    expect(info!.requiredOSNR).toBe(22);
    expect(info!.maxReach).toBe(800);
  });

  it('should have increasing OSNR requirements for higher modulations', () => {
    const qpsk = getModulationInfo(cfp2, 'DP-QPSK')!;
    const _8qam = getModulationInfo(cfp2, 'DP-8QAM')!;
    const _16qam = getModulationInfo(cfp2, 'DP-16QAM')!;

    expect(_8qam.requiredOSNR).toBeGreaterThan(qpsk.requiredOSNR);
    expect(_16qam.requiredOSNR).toBeGreaterThan(_8qam.requiredOSNR);
  });

  it('should have decreasing reach for higher modulations', () => {
    const qpsk = getModulationInfo(cfp2, 'DP-QPSK')!;
    const _8qam = getModulationInfo(cfp2, 'DP-8QAM')!;
    const _16qam = getModulationInfo(cfp2, 'DP-16QAM')!;

    expect(_8qam.maxReach).toBeLessThan(qpsk.maxReach);
    expect(_16qam.maxReach).toBeLessThan(_8qam.maxReach);
  });
});

// ============================================================================
// USER TRANSCEIVER LIBRARY MERGE
// ============================================================================

describe('Transceiver Library Merge', () => {
  function mergeTransceivers(
    defaults: TransceiverType[],
    user?: TransceiverType[],
  ): TransceiverType[] {
    const merged = [...defaults];
    if (user) {
      for (const ut of user) {
        const idx = merged.findIndex((t) => t.id === ut.id);
        if (idx >= 0) merged[idx] = ut;
        else merged.push(ut);
      }
    }
    return merged;
  }

  it('should return defaults when no user transceivers', () => {
    const result = mergeTransceivers(DEFAULT_TRANSCEIVERS);
    expect(result).toEqual(DEFAULT_TRANSCEIVERS);
  });

  it('should add new user transceivers', () => {
    const custom: TransceiverType = {
      id: 'custom-osfp-800g',
      name: 'Custom OSFP 800G',
      vendor: 'CustomVendor',
      formFactor: 'OSFP',
      launchPower: 1,
      receiverSensitivity: -16,
      txOSNR: 38,
      supportedModulations: [
        { modulation: 'DP-16QAM', requiredOSNR: 21, maxReach: 1000 },
      ],
      supportedDataRates: ['400G'],
      baudRate: 96,
    };

    const result = mergeTransceivers(DEFAULT_TRANSCEIVERS, [custom]);
    expect(result.length).toBe(DEFAULT_TRANSCEIVERS.length + 1);
    expect(result.find((t) => t.id === 'custom-osfp-800g')).toBeDefined();
  });

  it('should override defaults with matching IDs', () => {
    const override: TransceiverType = {
      ...DEFAULT_TRANSCEIVERS[0],
      name: 'Overridden CFP2',
      txOSNR: 42,
    };

    const result = mergeTransceivers(DEFAULT_TRANSCEIVERS, [override]);
    expect(result.length).toBe(DEFAULT_TRANSCEIVERS.length); // Same count
    const found = result.find((t) => t.id === override.id)!;
    expect(found.name).toBe('Overridden CFP2');
    expect(found.txOSNR).toBe(42);
  });
});
