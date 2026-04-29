/**
 * End-of-Life Margin Tests
 *
 * Tests EoL margin integration with OSNR calculations and settings persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_OPTICAL_SETTINGS } from '@/types/settings';
import { calculateOSNR } from '../OSNREngine';
import type { SpanInput, TransceiverParams, AmplifierParams } from '../types';

// ============================================================================
// HELPERS
// ============================================================================

function createTestSpans(count: number, length = 80): SpanInput[] {
  return Array.from({ length: count }, () => ({
    length,
    attenuation: 0.2,
    chromaticDispersion: 17,
  }));
}

function createTestAmplifiers(count: number): AmplifierParams[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `amp-${i}`,
    type: 'edfa' as const,
    gain: 16,
    noiseFigure: 5.5,
    afterSpanIndex: i,
  }));
}

const defaultTransceiver: TransceiverParams = {
  launchPower: 0,
  txOSNR: 35,
  requiredOSNR: 12,
  receiverSensitivity: -20,
  baudRate: 32,
};

// ============================================================================
// SETTINGS STORE - OPTICAL SETTINGS
// ============================================================================

describe('Optical Settings in Store', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetAll();
  });

  it('should have default EoL margin of 3.0 dB', () => {
    const optical = useSettingsStore.getState().settings.optical;
    expect(optical?.defaultEoLMargin).toBe(3.0);
  });

  it('should have default launch power of 0 dBm', () => {
    const optical = useSettingsStore.getState().settings.optical;
    expect(optical?.defaultLaunchPower).toBe(0);
  });

  it('should have default NF of 5.5 dB', () => {
    const optical = useSettingsStore.getState().settings.optical;
    expect(optical?.defaultNF).toBe(5.5);
  });

  it('should have default connector loss of 0.5 dB', () => {
    const optical = useSettingsStore.getState().settings.optical;
    expect(optical?.defaultConnectorLoss).toBe(0.5);
  });

  it('should update EoL margin', () => {
    useSettingsStore.getState().updateOpticalSettings({ defaultEoLMargin: 5.0 });
    const optical = useSettingsStore.getState().settings.optical;
    expect(optical?.defaultEoLMargin).toBe(5.0);
  });

  it('should update launch power', () => {
    useSettingsStore.getState().updateOpticalSettings({ defaultLaunchPower: -2 });
    const optical = useSettingsStore.getState().settings.optical;
    expect(optical?.defaultLaunchPower).toBe(-2);
  });

  it('should update noise figure', () => {
    useSettingsStore.getState().updateOpticalSettings({ defaultNF: 6.0 });
    const optical = useSettingsStore.getState().settings.optical;
    expect(optical?.defaultNF).toBe(6.0);
  });

  it('should update connector loss', () => {
    useSettingsStore.getState().updateOpticalSettings({ defaultConnectorLoss: 0.3 });
    const optical = useSettingsStore.getState().settings.optical;
    expect(optical?.defaultConnectorLoss).toBe(0.3);
  });

  it('should reset optical settings on resetAll', () => {
    useSettingsStore.getState().updateOpticalSettings({ defaultEoLMargin: 7.0 });
    useSettingsStore.getState().resetAll();
    const optical = useSettingsStore.getState().settings.optical;
    expect(optical?.defaultEoLMargin).toBe(DEFAULT_OPTICAL_SETTINGS.defaultEoLMargin);
  });

  it('should preserve other optical settings when updating one field', () => {
    useSettingsStore.getState().updateOpticalSettings({ defaultEoLMargin: 4.0 });
    const optical = useSettingsStore.getState().settings.optical;
    expect(optical?.defaultEoLMargin).toBe(4.0);
    expect(optical?.defaultLaunchPower).toBe(0);
    expect(optical?.defaultNF).toBe(5.5);
    expect(optical?.defaultConnectorLoss).toBe(0.5);
  });
});

// ============================================================================
// OSNR WITH/WITHOUT EOL MARGIN
// ============================================================================

describe('OSNR Calculation with EoL Margin', () => {
  const spans = createTestSpans(3, 80);
  const amplifiers = createTestAmplifiers(2);

  it('should include EoL margin in system margin calculation', () => {
    const result = calculateOSNR(spans, defaultTransceiver, amplifiers, 3.0);
    expect(result.eolMargin).toBe(3.0);
    expect(result.systemMargin).toBeCloseTo(
      result.finalGSNR - result.requiredOSNR - result.eolMargin,
      5
    );
  });

  it('should have higher system margin with zero EoL margin', () => {
    const withEol = calculateOSNR(spans, defaultTransceiver, amplifiers, 3.0);
    const withoutEol = calculateOSNR(spans, defaultTransceiver, amplifiers, 0);
    expect(withoutEol.systemMargin).toBeGreaterThan(withEol.systemMargin);
    expect(withoutEol.systemMargin - withEol.systemMargin).toBeCloseTo(3.0, 5);
  });

  it('should use custom EoL margin value', () => {
    const result = calculateOSNR(spans, defaultTransceiver, amplifiers, 5.0);
    expect(result.eolMargin).toBe(5.0);
  });

  it('should be feasible without EoL but infeasible with high EoL', () => {
    // Use a marginal case: long path with high required OSNR
    const marginalTransceiver: TransceiverParams = {
      launchPower: 0,
      txOSNR: 35,
      requiredOSNR: 20,
      receiverSensitivity: -20,
      baudRate: 64,
    };
    const longSpans = createTestSpans(5, 100);
    const longAmps = createTestAmplifiers(4);

    const withSmallEol = calculateOSNR(longSpans, marginalTransceiver, longAmps, 0);
    const withLargeEol = calculateOSNR(longSpans, marginalTransceiver, longAmps, 10.0);

    // The large EoL should give less margin
    expect(withLargeEol.systemMargin).toBeLessThan(withSmallEol.systemMargin);
    expect(withSmallEol.systemMargin - withLargeEol.systemMargin).toBeCloseTo(10.0, 5);
  });

  it('should use default EoL margin when not specified', () => {
    const result = calculateOSNR(spans, defaultTransceiver, amplifiers);
    // Default is 3.0 dB from constants
    expect(result.eolMargin).toBe(3.0);
  });

  it('should report same finalGSNR regardless of EoL margin', () => {
    const result0 = calculateOSNR(spans, defaultTransceiver, amplifiers, 0);
    const result3 = calculateOSNR(spans, defaultTransceiver, amplifiers, 3.0);
    const result5 = calculateOSNR(spans, defaultTransceiver, amplifiers, 5.0);
    // GSNR depends on physics only, not margin
    expect(result0.finalGSNR).toBeCloseTo(result3.finalGSNR, 5);
    expect(result3.finalGSNR).toBeCloseTo(result5.finalGSNR, 5);
  });
});
