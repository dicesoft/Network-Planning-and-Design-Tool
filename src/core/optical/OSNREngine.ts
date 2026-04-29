/**
 * OSNREngine - Core OSNR Calculation Engine
 *
 * Implements span-by-span OSNR calculation for DWDM optical paths including:
 * - SpanCalculator: fiber loss computation (attenuation + connector + splice losses)
 * - AmplifierModel: ASE noise calculation per ITU-T / Desurvire formulas
 * - NLICalculator: Simplified GN model for SPM + XPM nonlinear interference
 * - OSNREngine: Cascaded OSNR via reciprocal addition with TX OSNR and EoL margin
 *
 * Reference: DWDM-Knowledge-Base-v2.md sections 2, 3, 5, 6
 */

import type {
  SpanInput,
  AmplifierParams,
  TransceiverParams,
  SpanOSNRResult,
  OSNRResult,
  AmplifierSuggestion,
} from './types';

import {
  PLANCK_CONSTANT,
  SPEED_OF_LIGHT,
  C_BAND_CENTER_FREQUENCY_HZ,
  REFERENCE_BANDWIDTH_HZ,
  DEFAULT_CONNECTOR_LOSS,
  DEFAULT_SPLICE_LOSS,
  DEFAULT_AMPLIFIER_NF,
  DEFAULT_EOL_MARGIN,
  DEFAULT_EFFECTIVE_AREA,
  DEFAULT_NONLINEAR_INDEX,
  MAX_RECOMMENDED_SPAN_LENGTH,
  dbToLinear,
  linearToDb,
  dbmToWatts,
  wattsToDbm,
} from './constants';

// ============================================================================
// SPAN CALCULATOR
// ============================================================================

/**
 * Calculate total fiber span loss in dB.
 *
 * Total loss = (attenuation_dB_per_km * distance_km) + connector_losses + splice_losses
 */
export function calculateSpanLoss(span: SpanInput): number {
  const fiberLoss = span.attenuation * span.length;
  const connectorLoss =
    (span.connectorCount ?? 2) * (span.connectorLoss ?? DEFAULT_CONNECTOR_LOSS);
  const spliceLoss =
    (span.spliceCount ?? 0) * (span.spliceLoss ?? DEFAULT_SPLICE_LOSS);
  return fiberLoss + connectorLoss + spliceLoss;
}

// ============================================================================
// AMPLIFIER MODEL
// ============================================================================

/**
 * Calculate ASE noise power from an EDFA in watts.
 *
 * Formula (Desurvire, dual-polarization):
 *   P_ASE = (NF_lin * G_lin - 1) * h * f * B_ref
 *
 * Where:
 *   NF_lin = 10^(NF_dB / 10)
 *   G_lin  = 10^(G_dB / 10)
 *   h      = Planck's constant (6.626e-34 J*s)
 *   f      = center frequency (Hz)
 *   B_ref  = reference bandwidth (Hz) - using baud rate for signal BW OSNR
 *
 * Note: For OSNR in 0.1nm reference bandwidth, B_ref = 12.5 GHz.
 *
 * @param noiseFigure_dB - amplifier noise figure in dB
 * @param gain_dB - amplifier gain in dB
 * @param frequency_Hz - signal center frequency in Hz
 * @param bandwidth_Hz - reference bandwidth in Hz (default: 12.5 GHz for 0.1nm OSNR)
 * @returns ASE noise power in watts
 */
export function calculateASENoise(
  noiseFigure_dB: number,
  gain_dB: number,
  frequency_Hz: number = C_BAND_CENTER_FREQUENCY_HZ,
  bandwidth_Hz: number = REFERENCE_BANDWIDTH_HZ,
): number {
  const nfLinear = dbToLinear(noiseFigure_dB);
  const gainLinear = dbToLinear(gain_dB);
  // (NF_lin * G_lin - 1) * h * f * B_ref
  return (nfLinear * gainLinear - 1) * PLANCK_CONSTANT * frequency_Hz * bandwidth_Hz;
}

/**
 * Calculate OSNR contribution (in dB) from a single amplifier in 0.1nm ref BW.
 *
 * OSNR_amp = P_signal / P_ASE (both in linear, then convert to dB)
 *
 * @param signalPower_dBm - signal power at amplifier input in dBm
 * @param noiseFigure_dB - amplifier noise figure in dB
 * @param gain_dB - amplifier gain in dB
 * @param frequency_Hz - signal center frequency in Hz
 * @returns OSNR contribution from this amplifier in dB
 */
export function calculateAmplifierOSNR(
  signalPower_dBm: number,
  noiseFigure_dB: number,
  gain_dB: number,
  frequency_Hz: number = C_BAND_CENTER_FREQUENCY_HZ,
): number {
  const signalPowerWatts = dbmToWatts(signalPower_dBm + gain_dB); // signal after amplification
  const aseNoiseWatts = calculateASENoise(noiseFigure_dB, gain_dB, frequency_Hz, REFERENCE_BANDWIDTH_HZ);

  if (aseNoiseWatts <= 0) return 60; // Effectively infinite OSNR

  return linearToDb(signalPowerWatts / aseNoiseWatts);
}

// ============================================================================
// NLI CALCULATOR (Simplified GN Model)
// ============================================================================

/**
 * Calculate nonlinear interference (NLI) noise power using simplified GN model.
 *
 * Simplified closed-form SPM contribution for a single span:
 *   P_NLI = (16/27) * gamma^2 * L_eff^2 * P_ch^3 / (pi * |beta2| * L_asym * B_ch^2)
 *
 * Where:
 *   gamma = nonlinear coefficient (1/(W*m))
 *   L_eff = effective length (m)
 *   L_asym = asymptotic effective length = 1/alpha (m)
 *   P_ch = channel power (W)
 *   beta2 = GVD parameter (s^2/m)
 *   B_ch = baud rate (Hz)
 *
 * The XPM contribution from N_ch neighboring channels adds approximately:
 *   P_NLI_XPM ~ P_NLI_SPM * 2 * ln(N_ch)  (rough scaling)
 *
 * @param span - fiber span parameters
 * @param launchPower_dBm - per-channel launch power in dBm
 * @param baudRate_GBd - baud rate in GBaud
 * @param numChannels - number of WDM channels (for XPM scaling)
 * @returns NLI noise power in dBm (in signal bandwidth)
 */
export function calculateNLINoise(
  span: SpanInput,
  launchPower_dBm: number,
  baudRate_GBd: number,
  numChannels: number = 80,
): number {
  const length_m = span.length * 1e3; // km to m
  const alpha_Np_per_m = (span.attenuation / (10 * Math.log10(Math.E))) / 1e3; // dB/km -> Np/m

  if (alpha_Np_per_m <= 0 || length_m <= 0) return -100; // No NLI for zero-length spans

  // Fiber parameters
  const Aeff_m2 = (span.effectiveArea ?? DEFAULT_EFFECTIVE_AREA) * 1e-12; // um^2 -> m^2
  const n2 = span.nonLinearIndex ?? DEFAULT_NONLINEAR_INDEX;

  // Nonlinear coefficient gamma = 2*pi*f*n2 / (c * Aeff)
  const freq = C_BAND_CENTER_FREQUENCY_HZ;
  const gamma = (2 * Math.PI * freq * n2) / (SPEED_OF_LIGHT * Aeff_m2);

  // Effective length
  const L_eff = (1 - Math.exp(-alpha_Np_per_m * length_m)) / alpha_Np_per_m;
  const L_asym = 1 / alpha_Np_per_m;

  // GVD parameter beta2 from chromatic dispersion D
  // beta2 = -(c/f)^2 * D / (2*pi*c)
  // D in ps/(nm*km) -> convert to s/m^2: D * 1e-6
  const D_s_per_m2 = span.chromaticDispersion * 1e-6;
  const beta2 = -((SPEED_OF_LIGHT / freq) ** 2) * D_s_per_m2 / (2 * Math.PI * SPEED_OF_LIGHT);
  const absBeta2 = Math.abs(beta2);

  if (absBeta2 === 0) return -100; // No dispersion -> NLI model breaks down

  // Channel power in watts
  const P_ch = dbmToWatts(launchPower_dBm);
  const B_ch = baudRate_GBd * 1e9; // GBaud to Hz

  // SPM contribution: (16/27) * gamma^2 * L_eff^2 * P_ch^3 / (pi * |beta2| * L_asym * B_ch^2)
  const P_NLI_SPM =
    (16 / 27) *
    gamma ** 2 *
    L_eff ** 2 *
    P_ch ** 3 /
    (Math.PI * absBeta2 * L_asym * B_ch ** 2);

  // XPM scaling: approximately ln(N_ch) times SPM for N_ch channels at 50 GHz spacing
  // with high-dispersion fiber (G.652.D, 17 ps/nm/km). The classical 2*ln(N_ch)
  // factor applies to zero-dispersion fiber; with high dispersion, XPM is
  // significantly reduced due to walk-off decorrelation.
  // Using conservative ln(N_ch) scaling for G.652.D planning estimates.
  const xpmFactor = numChannels > 1 ? 1 + Math.log(numChannels) : 1;

  const P_NLI_total = P_NLI_SPM * xpmFactor;

  if (P_NLI_total <= 0) return -100;

  return wattsToDbm(P_NLI_total);
}

// ============================================================================
// OSNR ENGINE
// ============================================================================

/**
 * Calculate end-to-end OSNR/GSNR for a multi-span optical path.
 *
 * Algorithm:
 * 1. For each span, compute span loss and output signal power
 * 2. Apply amplifier at span output (if present), compute ASE noise OSNR contribution
 * 3. Optionally compute NLI noise per span
 * 4. Cascaded OSNR via reciprocal addition: 1/OSNR_total = sum(1/OSNR_i)
 * 5. Include TX OSNR: 1/GSNR_final = 1/txOSNR + 1/OSNR_cascaded
 * 6. Feasibility check: margin = GSNR_final - requiredOSNR - eolMargin
 *
 * @param spans - array of fiber span parameters
 * @param transceiver - transceiver optical parameters
 * @param amplifiers - array of amplifier parameters (indexed by afterSpanIndex)
 * @param eolMargin - end-of-life margin in dB (default: 3.0)
 * @param includeNLI - whether to include NLI noise (default: true)
 * @param numChannels - number of WDM channels for NLI calculation (default: 80)
 * @returns Complete OSNR calculation result
 */
export function calculateOSNR(
  spans: SpanInput[],
  transceiver: TransceiverParams,
  amplifiers: AmplifierParams[] = [],
  eolMargin: number = DEFAULT_EOL_MARGIN,
  includeNLI: boolean = true,
  numChannels: number = 80,
  autoInsertAmplifiers: boolean = true,
): OSNRResult {
  const warnings: string[] = [];
  const spanResults: SpanOSNRResult[] = [];

  if (spans.length === 0) {
    return {
      feasible: true,
      finalGSNR: transceiver.txOSNR,
      requiredOSNR: transceiver.requiredOSNR,
      systemMargin: transceiver.txOSNR - transceiver.requiredOSNR - eolMargin,
      eolMargin,
      totalDistance: 0,
      totalLoss: 0,
      spanCount: 0,
      spanResults: [],
      cascadedOSNR: Infinity,
      warnings: ['No spans in path - back-to-back connection'],
    };
  }

  // Build amplifier lookup by afterSpanIndex
  const ampMap = new Map<number, AmplifierParams>();
  for (const amp of amplifiers) {
    ampMap.set(amp.afterSpanIndex, amp);
  }

  let currentPower_dBm = transceiver.launchPower;
  let totalDistance = 0;
  let totalLoss = 0;

  // Collect per-span OSNR contributions for cascaded calculation
  // Each entry is the OSNR (dB) contribution from that span's amplifier
  const osnrContributions: number[] = [];
  const nliContributions_dBm: number[] = [];

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];

    // Warn for long spans
    if (span.length > MAX_RECOMMENDED_SPAN_LENGTH) {
      warnings.push(
        `Span ${i + 1} (${span.length.toFixed(1)} km) exceeds recommended max length of ${MAX_RECOMMENDED_SPAN_LENGTH} km`
      );
    }

    // Calculate span loss
    const spanLoss = calculateSpanLoss(span);
    totalDistance += span.length;
    totalLoss += spanLoss;

    // Signal power at span output (before amplification)
    const signalPowerAfterSpan = currentPower_dBm - spanLoss;

    // NLI noise for this span
    let nliNoisePower_dBm: number | undefined;
    if (includeNLI) {
      nliNoisePower_dBm = calculateNLINoise(
        span,
        currentPower_dBm, // launch power into span
        transceiver.baudRate,
        numChannels
      );
      nliContributions_dBm.push(nliNoisePower_dBm);
    }

    // Check for amplifier after this span
    const amp = ampMap.get(i);
    let amplifierGain = 0;
    let amplifierNF = DEFAULT_AMPLIFIER_NF;
    let osnrAfterSpan = Infinity;
    let signalPowerOut = signalPowerAfterSpan;

    if (amp) {
      amplifierGain = amp.gain;
      amplifierNF = amp.noiseFigure;

      // Signal power after amplification
      signalPowerOut = signalPowerAfterSpan + amplifierGain;

      // OSNR contribution from this amplifier
      osnrAfterSpan = calculateAmplifierOSNR(
        signalPowerAfterSpan,
        amplifierNF,
        amplifierGain
      );
      osnrContributions.push(osnrAfterSpan);

      currentPower_dBm = signalPowerOut;
    } else if (i < spans.length - 1) {
      if (autoInsertAmplifiers) {
        // No amplifier between spans — auto-insert one with gain = spanLoss
        // This models an inline EDFA compensating span loss
        amplifierGain = spanLoss;
        amplifierNF = DEFAULT_AMPLIFIER_NF;
        signalPowerOut = signalPowerAfterSpan + amplifierGain;

        osnrAfterSpan = calculateAmplifierOSNR(
          signalPowerAfterSpan,
          amplifierNF,
          amplifierGain
        );
        osnrContributions.push(osnrAfterSpan);

        currentPower_dBm = signalPowerOut;
        warnings.push(
          `Auto-inserted amplifier after span ${i + 1} (gain=${amplifierGain.toFixed(1)} dB, NF=${amplifierNF} dB)`
        );
      } else {
        // No amplifier — signal continues at degraded power
        signalPowerOut = signalPowerAfterSpan;
        currentPower_dBm = signalPowerAfterSpan;
        warnings.push(
          `No amplifier after span ${i + 1} — signal degraded to ${signalPowerAfterSpan.toFixed(1)} dBm`
        );
      }
    } else {
      // Last span, no amplifier — signal arrives at receiver unamplified
      signalPowerOut = signalPowerAfterSpan;
      currentPower_dBm = signalPowerAfterSpan;
    }

    // Cumulative OSNR up to this point
    const cumulativeOSNR = cascadedSNR(osnrContributions);

    spanResults.push({
      spanIndex: i,
      spanLength: span.length,
      spanLoss,
      signalPowerOut,
      aseNoisePower: amp || (i < spans.length - 1 && autoInsertAmplifiers)
        ? wattsToDbm(calculateASENoise(amplifierNF, amplifierGain))
        : -Infinity,
      nliNoisePower: nliNoisePower_dBm,
      osnrAfterSpan,
      cumulativeOSNR,
      amplifierGain,
      amplifierNF,
    });
  }

  // Calculate cascaded ASE OSNR
  const cascadedASE_OSNR = cascadedSNR(osnrContributions);

  // Calculate cascaded NLI OSNR (if applicable)
  let cascadedNLI_OSNR = Infinity;
  if (includeNLI && nliContributions_dBm.length > 0) {
    // Total NLI power = sum of individual NLI powers (in linear domain)
    const totalNLI_watts = nliContributions_dBm.reduce(
      (sum, nli_dBm) => sum + (nli_dBm > -90 ? dbmToWatts(nli_dBm) : 0),
      0
    );
    if (totalNLI_watts > 0) {
      const signalPower_watts = dbmToWatts(transceiver.launchPower);
      cascadedNLI_OSNR = linearToDb(signalPower_watts / totalNLI_watts);
    }
  }

  // Cascaded OSNR combining ASE and NLI: 1/GSNR_cascaded = 1/OSNR_ASE + 1/OSNR_NLI
  const cascadedOSNR = cascadedSNR(
    [cascadedASE_OSNR, cascadedNLI_OSNR].filter((v) => isFinite(v))
  );

  // Include TX OSNR: 1/GSNR_final = 1/txOSNR + 1/GSNR_cascaded
  const finalGSNR = cascadedSNR(
    [transceiver.txOSNR, cascadedOSNR].filter((v) => isFinite(v))
  );

  // Feasibility check
  const systemMargin = finalGSNR - transceiver.requiredOSNR - eolMargin;
  const feasible = systemMargin >= 0;

  if (!feasible) {
    warnings.push(
      `Insufficient system margin: ${systemMargin.toFixed(1)} dB (need >= 0 dB)`
    );
  }

  return {
    feasible,
    finalGSNR,
    requiredOSNR: transceiver.requiredOSNR,
    systemMargin,
    eolMargin,
    totalDistance,
    totalLoss,
    spanCount: spans.length,
    spanResults,
    cascadedOSNR,
    warnings,
  };
}

// ============================================================================
// AMPLIFIER SUGGESTION
// ============================================================================

/**
 * Suggest amplifier placements for infeasible paths.
 *
 * Greedy algorithm:
 * 1. Find spans where the signal drops to the lowest power
 * 2. Suggest amplifier at the worst span first
 * 3. Calculate required gain and expected OSNR improvement
 *
 * @param spans - fiber span parameters
 * @param transceiver - transceiver optical parameters
 * @param existingAmplifiers - already placed amplifiers
 * @param eolMargin - end-of-life margin in dB
 * @param edgeIds - edge IDs corresponding to each span (for location reference)
 * @returns Array of amplifier suggestions sorted by priority
 */
export function suggestAmplifiers(
  spans: SpanInput[],
  transceiver: TransceiverParams,
  existingAmplifiers: AmplifierParams[] = [],
  eolMargin: number = DEFAULT_EOL_MARGIN,
  edgeIds: string[] = [],
): AmplifierSuggestion[] {
  // First, calculate baseline OSNR without any new amplifiers
  const baseline = calculateOSNR(spans, transceiver, existingAmplifiers, eolMargin);

  if (baseline.feasible) {
    return []; // No suggestions needed
  }

  const suggestions: AmplifierSuggestion[] = [];
  const ampIndices = new Set(existingAmplifiers.map((a) => a.afterSpanIndex));

  // Find spans without amplifiers and rank by span loss (worst first)
  const unamplifiedSpans = spans
    .map((span, index) => ({
      span,
      index,
      loss: calculateSpanLoss(span),
    }))
    .filter(({ index }) => !ampIndices.has(index))
    .sort((a, b) => b.loss - a.loss);

  for (const { span, index, loss } of unamplifiedSpans) {
    // Simulate adding an amplifier after this span
    const newAmp: AmplifierParams = {
      id: `suggested-amp-${index}`,
      type: 'edfa',
      gain: loss, // Set gain equal to span loss
      noiseFigure: DEFAULT_AMPLIFIER_NF,
      afterSpanIndex: index,
    };

    const testAmps = [...existingAmplifiers, newAmp];
    const improved = calculateOSNR(spans, transceiver, testAmps, eolMargin);
    const improvement = improved.finalGSNR - baseline.finalGSNR;

    if (improvement > 0.1) {
      // Only suggest if meaningful improvement
      suggestions.push({
        afterSpanIndex: index,
        edgeId: edgeIds[index] || '',
        kmOffset: span.length / 2, // Midpoint of span as approximate location
        recommendedGain: loss,
        recommendedNF: DEFAULT_AMPLIFIER_NF,
        osnrImprovement: improvement,
        reason:
          loss > MAX_RECOMMENDED_SPAN_LENGTH * 0.2
            ? `High span loss (${loss.toFixed(1)} dB) over ${span.length.toFixed(1)} km`
            : `Span ${index + 1} contributes significant loss (${loss.toFixed(1)} dB)`,
      });
    }
  }

  // Sort by OSNR improvement (best first)
  suggestions.sort((a, b) => b.osnrImprovement - a.osnrImprovement);

  return suggestions;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Cascaded SNR via reciprocal addition.
 *
 * 1/SNR_total = 1/SNR_1 + 1/SNR_2 + ... + 1/SNR_N
 * (all values in dB)
 *
 * @param snrValues_dB - array of SNR values in dB
 * @returns Total cascaded SNR in dB
 */
export function cascadedSNR(snrValues_dB: number[]): number {
  if (snrValues_dB.length === 0) return Infinity;

  const inverseSum = snrValues_dB.reduce((sum, snr_dB) => {
    if (!isFinite(snr_dB)) return sum;
    return sum + 1 / dbToLinear(snr_dB);
  }, 0);

  if (inverseSum <= 0) return Infinity;

  return linearToDb(1 / inverseSum);
}

/**
 * Quick feasibility check without full span-by-span calculation.
 * Uses simplified formula for N identical spans.
 *
 * OSNR ~ P_launch - NF - 10*log10(N_spans) - 10*log10(h*f*B_ref) + 30
 *
 * @param totalDistance - total path distance in km
 * @param spanLength - average span length in km
 * @param launchPower_dBm - launch power per channel in dBm
 * @param noiseFigure_dB - amplifier noise figure in dB
 * @param requiredOSNR_dB - required OSNR for modulation format in dB
 * @param margin_dB - system margin in dB
 * @returns true if path is likely feasible
 */
export function quickFeasibilityCheck(
  totalDistance: number,
  spanLength: number,
  launchPower_dBm: number,
  noiseFigure_dB: number,
  requiredOSNR_dB: number,
  margin_dB: number = DEFAULT_EOL_MARGIN,
): boolean {
  if (totalDistance <= 0) return true;

  const numSpans = Math.max(1, Math.ceil(totalDistance / spanLength));
  const hfBref = PLANCK_CONSTANT * C_BAND_CENTER_FREQUENCY_HZ * REFERENCE_BANDWIDTH_HZ;
  const hfBref_dBm = 10 * Math.log10(hfBref) + 30; // Convert to dBm

  // Simplified OSNR estimate for N identical spans
  const estimatedOSNR =
    launchPower_dBm - noiseFigure_dB - 10 * Math.log10(numSpans) - hfBref_dBm;

  return estimatedOSNR >= requiredOSNR_dB + margin_dB;
}
