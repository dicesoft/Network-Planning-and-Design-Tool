/**
 * autoInsertAmplifiers parameter tests
 *
 * Validates the `autoInsertAmplifiers` parameter added to `calculateOSNR()`.
 * When false, virtual amplifiers are NOT inserted for intermediate spans,
 * causing signal to degrade unamplified.
 */

import { describe, it, expect } from 'vitest';
import { calculateOSNR } from '../OSNREngine';
import type { SpanInput, TransceiverParams } from '../types';

// ============================================================================
// HELPERS
// ============================================================================

const defaultSpan: SpanInput = {
  length: 80,
  attenuation: 0.2,
  chromaticDispersion: 17,
  connectorCount: 2,
  connectorLoss: 0.5,
};

const defaultTransceiver: TransceiverParams = {
  launchPower: 0,
  txOSNR: 40,
  requiredOSNR: 12,
  receiverSensitivity: -22,
  baudRate: 32,
};

// ============================================================================
// TESTS
// ============================================================================

describe('calculateOSNR autoInsertAmplifiers parameter', () => {
  it('with autoInsertAmplifiers=true should match existing default behavior', () => {
    const spans: SpanInput[] = [
      { ...defaultSpan, length: 80 },
      { ...defaultSpan, length: 80 },
    ];

    // Default call (no parameter) should match explicit true
    const resultDefault = calculateOSNR(spans, defaultTransceiver, [], 3.0);
    const resultTrue = calculateOSNR(spans, defaultTransceiver, [], 3.0, true, 80, true);

    expect(resultTrue.finalGSNR).toBeCloseTo(resultDefault.finalGSNR, 5);
    expect(resultTrue.systemMargin).toBeCloseTo(resultDefault.systemMargin, 5);
    expect(resultTrue.feasible).toBe(resultDefault.feasible);
    expect(resultTrue.warnings).toEqual(resultDefault.warnings);
  });

  it('with autoInsertAmplifiers=false should differ from auto=true on multi-span paths', () => {
    const spans: SpanInput[] = [
      { ...defaultSpan, length: 80 },
      { ...defaultSpan, length: 80 },
    ];

    const resultAuto = calculateOSNR(spans, defaultTransceiver, [], 3.0, true, 80, true);
    const resultManual = calculateOSNR(spans, defaultTransceiver, [], 3.0, true, 80, false);

    // Without auto-inserted amplifiers, NO ASE noise is added for intermediate spans,
    // so cascaded OSNR is higher (fewer noise contributors). However, the signal
    // power at receiver is much lower (degraded across unamplified spans).
    // The GSNR values should differ — manual mode has HIGHER GSNR because
    // no ASE noise is added, despite severe signal degradation.
    expect(resultManual.finalGSNR).not.toBeCloseTo(resultAuto.finalGSNR, 1);

    // Auto-insert adds ASE noise warnings; manual shows degradation warnings
    expect(resultAuto.warnings.some((w) => w.includes('Auto-inserted'))).toBe(true);
    expect(resultManual.warnings.some((w) => w.includes('No amplifier'))).toBe(true);

    // Signal power at span output should be much lower without amplifiers
    // The last span result shows the final signal power
    const autoLastSpan = resultAuto.spanResults[resultAuto.spanResults.length - 1];
    const manualLastSpan = resultManual.spanResults[resultManual.spanResults.length - 1];
    expect(manualLastSpan.signalPowerOut).toBeLessThan(autoLastSpan.signalPowerOut);
  });

  it('multi-span path without amplifiers shows degraded signal warnings', () => {
    const spans: SpanInput[] = [
      { ...defaultSpan, length: 80 },
      { ...defaultSpan, length: 80 },
      { ...defaultSpan, length: 80 },
    ];

    const result = calculateOSNR(spans, defaultTransceiver, [], 3.0, true, 80, false);

    // Should have warnings about signal degradation (not auto-inserted amplifiers)
    expect(result.warnings.some((w) => w.includes('No amplifier after span'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('signal degraded'))).toBe(true);
    // Should NOT have auto-inserted amplifier warnings
    expect(result.warnings.some((w) => w.includes('Auto-inserted'))).toBe(false);
  });

  it('with explicit amplifiers, autoInsertAmplifiers flag should not matter', () => {
    const spans: SpanInput[] = [
      { ...defaultSpan, length: 80 },
      { ...defaultSpan, length: 80 },
    ];
    const amps = [
      { id: 'a1', type: 'edfa' as const, gain: 17, noiseFigure: 5.5, afterSpanIndex: 0 },
      { id: 'a2', type: 'edfa' as const, gain: 17, noiseFigure: 5.5, afterSpanIndex: 1 },
    ];

    const resultTrue = calculateOSNR(spans, defaultTransceiver, amps, 3.0, true, 80, true);
    const resultFalse = calculateOSNR(spans, defaultTransceiver, amps, 3.0, true, 80, false);

    // With explicit amps on all spans, flag shouldn't matter
    expect(resultTrue.finalGSNR).toBeCloseTo(resultFalse.finalGSNR, 5);
  });

  it('single span should be unaffected by autoInsertAmplifiers (no intermediate spans)', () => {
    const spans: SpanInput[] = [{ ...defaultSpan, length: 80 }];

    const resultTrue = calculateOSNR(spans, defaultTransceiver, [], 3.0, true, 80, true);
    const resultFalse = calculateOSNR(spans, defaultTransceiver, [], 3.0, true, 80, false);

    // Single span has no intermediate spans, so auto-insert doesn't apply
    expect(resultTrue.finalGSNR).toBeCloseTo(resultFalse.finalGSNR, 5);
    expect(resultTrue.systemMargin).toBeCloseTo(resultFalse.systemMargin, 5);
  });
});
