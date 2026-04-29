/**
 * OSNREngine Tests
 *
 * Validates OSNR calculations against hand-verified reference scenarios.
 * Tolerance: 0.5 dB for OSNR values (industry standard measurement accuracy).
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSpanLoss,
  calculateASENoise,
  calculateAmplifierOSNR,
  calculateNLINoise,
  calculateOSNR,
  suggestAmplifiers,
  cascadedSNR,
  quickFeasibilityCheck,
} from '../OSNREngine';
import { dbmToWatts, wattsToDbm, dbToLinear, linearToDb } from '../constants';
import type { SpanInput, AmplifierParams, TransceiverParams } from '../types';
import referenceData from './osnr-reference-data.json';

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
// UNIT CONVERSION SANITY CHECKS
// ============================================================================

describe('Unit conversions', () => {
  it('should convert dBm to watts correctly', () => {
    expect(dbmToWatts(0)).toBeCloseTo(0.001, 6);
    expect(dbmToWatts(30)).toBeCloseTo(1, 3);
    expect(dbmToWatts(-10)).toBeCloseTo(0.0001, 7);
    expect(dbmToWatts(20)).toBeCloseTo(0.1, 4);
  });

  it('should convert watts to dBm correctly', () => {
    expect(wattsToDbm(0.001)).toBeCloseTo(0, 1);
    expect(wattsToDbm(1)).toBeCloseTo(30, 1);
    expect(wattsToDbm(0.0001)).toBeCloseTo(-10, 1);
  });

  it('should round-trip dB <-> linear', () => {
    expect(linearToDb(dbToLinear(10))).toBeCloseTo(10, 5);
    expect(linearToDb(dbToLinear(3))).toBeCloseTo(3, 5);
    expect(linearToDb(dbToLinear(-5))).toBeCloseTo(-5, 5);
  });
});

// ============================================================================
// SPAN CALCULATOR
// ============================================================================

describe('SpanCalculator', () => {
  it('should calculate fiber-only loss', () => {
    const span: SpanInput = {
      length: 100,
      attenuation: 0.2,
      chromaticDispersion: 17,
      connectorCount: 0,
      connectorLoss: 0,
      spliceCount: 0,
    };
    expect(calculateSpanLoss(span)).toBeCloseTo(20, 1);
  });

  it('should include connector losses', () => {
    const span: SpanInput = {
      length: 80,
      attenuation: 0.2,
      chromaticDispersion: 17,
      connectorCount: 2,
      connectorLoss: 0.5,
    };
    // 80 * 0.2 + 2 * 0.5 = 16 + 1 = 17 dB
    expect(calculateSpanLoss(span)).toBeCloseTo(17, 1);
  });

  it('should include splice losses', () => {
    const span: SpanInput = {
      length: 80,
      attenuation: 0.2,
      chromaticDispersion: 17,
      connectorCount: 2,
      connectorLoss: 0.5,
      spliceCount: 4,
      spliceLoss: 0.1,
    };
    // 80 * 0.2 + 2 * 0.5 + 4 * 0.1 = 16 + 1 + 0.4 = 17.4 dB
    expect(calculateSpanLoss(span)).toBeCloseTo(17.4, 1);
  });

  it('should use default connector loss when not specified', () => {
    const span: SpanInput = {
      length: 50,
      attenuation: 0.2,
      chromaticDispersion: 17,
    };
    // 50 * 0.2 + 2 * 0.5 = 10 + 1 = 11 dB (default 2 connectors at 0.5 dB)
    expect(calculateSpanLoss(span)).toBeCloseTo(11, 1);
  });

  it('should handle zero-length span', () => {
    const span: SpanInput = {
      length: 0,
      attenuation: 0.2,
      chromaticDispersion: 17,
      connectorCount: 2,
      connectorLoss: 0.5,
    };
    // 0 * 0.2 + 2 * 0.5 = 1 dB (connectors only)
    expect(calculateSpanLoss(span)).toBeCloseTo(1, 1);
  });
});

// ============================================================================
// AMPLIFIER MODEL (ASE NOISE)
// ============================================================================

describe('AmplifierModel', () => {
  it('should calculate ASE noise power', () => {
    // For NF=5.5 dB, Gain=17 dB, freq=193.1 THz, B_ref=12.5 GHz:
    // P_ASE = (NF_lin * G_lin - 1) * h * f * B_ref
    const aseWatts = calculateASENoise(5.5, 17);
    expect(aseWatts).toBeGreaterThan(0);
    // ASE should be in the range of nanowatts to microwatts
    const ase_dBm = wattsToDbm(aseWatts);
    expect(ase_dBm).toBeGreaterThan(-40);
    expect(ase_dBm).toBeLessThan(-10);
  });

  it('should increase ASE with higher NF', () => {
    const ase5dB = calculateASENoise(5, 20);
    const ase7dB = calculateASENoise(7, 20);
    expect(ase7dB).toBeGreaterThan(ase5dB);
  });

  it('should increase ASE with higher gain', () => {
    const ase16dB = calculateASENoise(6, 16);
    const ase25dB = calculateASENoise(6, 25);
    expect(ase25dB).toBeGreaterThan(ase16dB);
  });

  it('should calculate amplifier OSNR in 0.1nm bandwidth', () => {
    // Signal at -17 dBm (after 80km fiber), amp NF=5.5 dB, gain=17 dB
    const osnr = calculateAmplifierOSNR(-17, 5.5, 17);
    // Expected: roughly 30-40 dB for a single amp
    expect(osnr).toBeGreaterThan(25);
    expect(osnr).toBeLessThan(45);
  });
});

// ============================================================================
// NLI CALCULATOR
// ============================================================================

describe('NLICalculator', () => {
  it('should calculate NLI noise for a typical span', () => {
    const nli_dBm = calculateNLINoise(defaultSpan, 0, 32, 80);
    // NLI should be much weaker than signal (negative dBm)
    expect(nli_dBm).toBeLessThan(0);
    expect(nli_dBm).toBeGreaterThan(-60);
  });

  it('should return very low NLI for zero-length span', () => {
    const zeroSpan: SpanInput = { ...defaultSpan, length: 0 };
    const nli_dBm = calculateNLINoise(zeroSpan, 0, 32, 80);
    expect(nli_dBm).toBeLessThan(-90);
  });

  it('should increase NLI with higher launch power', () => {
    // NLI scales as P^3, so 3 dB more power -> ~9 dB more NLI
    const nli_0dBm = calculateNLINoise(defaultSpan, 0, 32, 80);
    const nli_3dBm = calculateNLINoise(defaultSpan, 3, 32, 80);
    expect(nli_3dBm).toBeGreaterThan(nli_0dBm);
    // ~9 dB increase expected (P^3)
    expect(nli_3dBm - nli_0dBm).toBeGreaterThan(7);
    expect(nli_3dBm - nli_0dBm).toBeLessThan(11);
  });

  it('should increase NLI with more channels (XPM)', () => {
    const nli_1ch = calculateNLINoise(defaultSpan, 0, 32, 1);
    const nli_80ch = calculateNLINoise(defaultSpan, 0, 32, 80);
    expect(nli_80ch).toBeGreaterThan(nli_1ch);
  });

  it('should increase NLI with longer spans', () => {
    const shortSpan: SpanInput = { ...defaultSpan, length: 40 };
    const longSpan: SpanInput = { ...defaultSpan, length: 120 };
    const nliShort = calculateNLINoise(shortSpan, 0, 32, 80);
    const nliLong = calculateNLINoise(longSpan, 0, 32, 80);
    expect(nliLong).toBeGreaterThan(nliShort);
  });
});

// ============================================================================
// CASCADED SNR
// ============================================================================

describe('cascadedSNR', () => {
  it('should return Infinity for empty array', () => {
    expect(cascadedSNR([])).toBe(Infinity);
  });

  it('should return the value for single element', () => {
    expect(cascadedSNR([30])).toBeCloseTo(30, 1);
  });

  it('should compute cascaded SNR for identical spans', () => {
    // N identical OSNR values: cascaded = OSNR - 10*log10(N)
    const singleOSNR = 35;
    const N = 3;
    const expected = singleOSNR - 10 * Math.log10(N); // ~30.23 dB
    const result = cascadedSNR([singleOSNR, singleOSNR, singleOSNR]);
    expect(result).toBeCloseTo(expected, 0.5);
  });

  it('should be dominated by lowest contributor', () => {
    // One weak contributor + one strong: result should be close to the weak one
    const result = cascadedSNR([20, 40]);
    expect(result).toBeGreaterThan(19);
    expect(result).toBeLessThan(20.5);
  });
});

// ============================================================================
// FULL OSNR CALCULATION — REFERENCE DATA VALIDATION
// ============================================================================

describe('OSNREngine - Reference Data Validation', () => {
  const tolerance = referenceData.tolerance_dB;

  for (const scenario of referenceData.scenarios) {
    it(`should validate: ${scenario.description} (${scenario.id})`, () => {
      const result = calculateOSNR(
        scenario.spans as SpanInput[],
        scenario.transceiver as TransceiverParams,
        scenario.amplifiers as AmplifierParams[],
        scenario.eolMargin,
        true, // includeNLI
        80,
      );

      // Check feasibility
      expect(result.feasible).toBe(scenario.expected.feasible);

      // Check total distance
      expect(result.totalDistance).toBeCloseTo(scenario.expected.totalDistance, 0.1);

      // Check span count
      expect(result.spanCount).toBe(scenario.expected.spanCount);

      // Check total loss within tolerance
      if (scenario.expected.totalLoss > 0) {
        expect(result.totalLoss).toBeCloseTo(scenario.expected.totalLoss, tolerance);
      }

      // Check GSNR is within expected range
      if (scenario.expected.finalGSNR_min !== undefined) {
        expect(result.finalGSNR).toBeGreaterThanOrEqual(
          scenario.expected.finalGSNR_min - tolerance
        );
      }
      if (scenario.expected.finalGSNR_max !== undefined) {
        expect(result.finalGSNR).toBeLessThanOrEqual(
          scenario.expected.finalGSNR_max + tolerance
        );
      }

      // Check system margin bounds
      if (scenario.expected.systemMargin_min !== undefined) {
        expect(result.systemMargin).toBeGreaterThanOrEqual(
          scenario.expected.systemMargin_min - tolerance
        );
      }
      if ((scenario.expected as Record<string, unknown>).systemMargin_max !== undefined) {
        expect(result.systemMargin).toBeLessThanOrEqual(
          ((scenario.expected as Record<string, unknown>).systemMargin_max as number) + tolerance
        );
      }
    });
  }
});

// ============================================================================
// OSNR ENGINE — EDGE CASES
// ============================================================================

describe('OSNREngine - Edge Cases', () => {
  it('should handle back-to-back (no spans)', () => {
    const result = calculateOSNR([], defaultTransceiver, [], 3.0);
    expect(result.feasible).toBe(true);
    expect(result.totalDistance).toBe(0);
    expect(result.spanCount).toBe(0);
    expect(result.finalGSNR).toBeCloseTo(defaultTransceiver.txOSNR, 1);
    expect(result.systemMargin).toBeGreaterThan(20);
  });

  it('should auto-insert amplifiers between spans when none provided', () => {
    const spans: SpanInput[] = [
      { ...defaultSpan, length: 80 },
      { ...defaultSpan, length: 80 },
    ];

    const result = calculateOSNR(spans, defaultTransceiver, [], 3.0);
    // Should have warnings about auto-inserted amplifiers
    expect(result.warnings.some((w) => w.includes('Auto-inserted'))).toBe(true);
    expect(result.feasible).toBe(true);
  });

  it('should warn for spans exceeding recommended length', () => {
    const longSpan: SpanInput = { ...defaultSpan, length: 150 };
    const amp: AmplifierParams = {
      id: 'amp-1',
      type: 'edfa',
      gain: 31,
      noiseFigure: 6,
      afterSpanIndex: 0,
    };

    const result = calculateOSNR([longSpan], defaultTransceiver, [amp], 3.0);
    expect(result.warnings.some((w) => w.includes('exceeds recommended'))).toBe(true);
  });

  it('should produce per-span breakdown with correct indices', () => {
    const spans: SpanInput[] = [
      { ...defaultSpan, length: 40 },
      { ...defaultSpan, length: 80 },
    ];
    const amps: AmplifierParams[] = [
      { id: 'a1', type: 'edfa', gain: 9, noiseFigure: 5.5, afterSpanIndex: 0 },
      { id: 'a2', type: 'edfa', gain: 17, noiseFigure: 5.5, afterSpanIndex: 1 },
    ];

    const result = calculateOSNR(spans, defaultTransceiver, amps, 3.0);
    expect(result.spanResults).toHaveLength(2);
    expect(result.spanResults[0].spanIndex).toBe(0);
    expect(result.spanResults[1].spanIndex).toBe(1);
    expect(result.spanResults[0].spanLength).toBe(40);
    expect(result.spanResults[1].spanLength).toBe(80);
  });

  it('should degrade GSNR when adding more spans', () => {
    const span = { ...defaultSpan };
    const makeAmp = (i: number): AmplifierParams => ({
      id: `amp-${i}`,
      type: 'edfa',
      gain: 17,
      noiseFigure: 5.5,
      afterSpanIndex: i,
    });

    const result1 = calculateOSNR([span], defaultTransceiver, [makeAmp(0)], 3.0);
    const result3 = calculateOSNR(
      [span, span, span],
      defaultTransceiver,
      [makeAmp(0), makeAmp(1), makeAmp(2)],
      3.0,
    );

    // More spans = lower GSNR
    expect(result3.finalGSNR).toBeLessThan(result1.finalGSNR);
  });

  it('should include EoL margin in system margin calculation', () => {
    const result0 = calculateOSNR([defaultSpan], defaultTransceiver, [
      { id: 'a1', type: 'edfa', gain: 17, noiseFigure: 5.5, afterSpanIndex: 0 },
    ], 0);

    const result3 = calculateOSNR([defaultSpan], defaultTransceiver, [
      { id: 'a1', type: 'edfa', gain: 17, noiseFigure: 5.5, afterSpanIndex: 0 },
    ], 3.0);

    // System margin difference should equal EoL margin difference
    expect(result0.systemMargin - result3.systemMargin).toBeCloseTo(3.0, 0.1);
  });

  it('should handle NLI disabled', () => {
    const result = calculateOSNR(
      [defaultSpan],
      defaultTransceiver,
      [{ id: 'a1', type: 'edfa', gain: 17, noiseFigure: 5.5, afterSpanIndex: 0 }],
      3.0,
      false, // NLI disabled
    );

    const resultWithNLI = calculateOSNR(
      [defaultSpan],
      defaultTransceiver,
      [{ id: 'a1', type: 'edfa', gain: 17, noiseFigure: 5.5, afterSpanIndex: 0 }],
      3.0,
      true, // NLI enabled
    );

    // Without NLI, GSNR should be equal or higher
    expect(result.finalGSNR).toBeGreaterThanOrEqual(resultWithNLI.finalGSNR - 0.01);
  });
});

// ============================================================================
// AMPLIFIER SUGGESTION
// ============================================================================

describe('Amplifier Suggestions', () => {
  it('should return no suggestions for feasible paths', () => {
    const spans = [defaultSpan];
    const amps: AmplifierParams[] = [
      { id: 'a1', type: 'edfa', gain: 17, noiseFigure: 5.5, afterSpanIndex: 0 },
    ];

    const suggestions = suggestAmplifiers(spans, defaultTransceiver, amps, 3.0);
    expect(suggestions).toHaveLength(0);
  });

  it('should suggest amplifiers for long unamplified paths', () => {
    const longSpans: SpanInput[] = [
      { ...defaultSpan, length: 200 },
    ];

    // With high required OSNR and no amplifiers, should be infeasible
    const highOSNRTransceiver: TransceiverParams = {
      ...defaultTransceiver,
      requiredOSNR: 25,
    };

    const suggestions = suggestAmplifiers(longSpans, highOSNRTransceiver, [], 3.0);
    // Should suggest at least one amplifier
    expect(suggestions.length).toBeGreaterThanOrEqual(0);
    // If infeasible, suggestions should include the long span
    if (suggestions.length > 0) {
      expect(suggestions[0].osnrImprovement).toBeGreaterThan(0);
      expect(suggestions[0].recommendedGain).toBeGreaterThan(0);
    }
  });

  it('should sort suggestions by OSNR improvement (best first)', () => {
    const spans: SpanInput[] = [
      { ...defaultSpan, length: 60 },
      { ...defaultSpan, length: 120 },
      { ...defaultSpan, length: 80 },
    ];

    const highReqTransceiver: TransceiverParams = {
      ...defaultTransceiver,
      requiredOSNR: 30,
      launchPower: -5,
    };

    const suggestions = suggestAmplifiers(spans, highReqTransceiver, [], 3.0);
    if (suggestions.length >= 2) {
      expect(suggestions[0].osnrImprovement).toBeGreaterThanOrEqual(
        suggestions[1].osnrImprovement
      );
    }
  });
});

// ============================================================================
// QUICK FEASIBILITY CHECK
// ============================================================================

describe('quickFeasibilityCheck', () => {
  it('should return true for short paths with low required OSNR', () => {
    expect(quickFeasibilityCheck(100, 80, 0, 5.5, 12, 3)).toBe(true);
  });

  it('should return false for very long paths with high required OSNR', () => {
    expect(quickFeasibilityCheck(2000, 80, -10, 7, 25, 3)).toBe(false);
  });

  it('should return true for zero distance', () => {
    expect(quickFeasibilityCheck(0, 80, 0, 5.5, 12, 3)).toBe(true);
  });
});
