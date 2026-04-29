/**
 * Optical Engineering Types
 * Types for OSNR calculation, amplifier modeling, and span analysis
 */

// ============================================================================
// SPAN INPUT
// ============================================================================

/**
 * Input parameters for a single fiber span between amplification points.
 * A span is the fiber segment between two amplifiers (or between
 * a transmitter/amplifier and an amplifier/receiver).
 */
export interface SpanInput {
  /** Span length in km */
  length: number;
  /** Fiber attenuation in dB/km (default: 0.2 for G.652.D) */
  attenuation: number;
  /** Chromatic dispersion in ps/(nm*km) (default: 17 for G.652.D) */
  chromaticDispersion: number;
  /** Number of connectors in this span */
  connectorCount?: number;
  /** Loss per connector in dB (default: 0.5) */
  connectorLoss?: number;
  /** Number of splices in this span */
  spliceCount?: number;
  /** Loss per splice in dB (default: 0.1) */
  spliceLoss?: number;
  /** Effective area in um^2 (for NLI calculations) */
  effectiveArea?: number;
  /** Non-linear refractive index n2 in m^2/W */
  nonLinearIndex?: number;
}

// ============================================================================
// AMPLIFIER PARAMETERS
// ============================================================================

/**
 * Parameters for an inline optical amplifier (EDFA/Raman).
 */
export interface AmplifierParams {
  /** Amplifier ID (matches node ID if placed at a node) */
  id: string;
  /** Amplifier type */
  type: 'edfa' | 'raman' | 'hybrid';
  /** Gain in dB (typically 15-30 dB) */
  gain: number;
  /** Noise figure in dB (typical EDFA: 5-6 dB) */
  noiseFigure: number;
  /** Output power in dBm (typical: 17-21 dBm) */
  outputPower?: number;
  /** Gain flatness in dB (variation across C-band) */
  gainFlatness?: number;
  /** Position: after which span index this amplifier sits */
  afterSpanIndex: number;
}

// ============================================================================
// TRANSCEIVER PARAMETERS (for OSNR calculation)
// ============================================================================

/**
 * Transceiver optical parameters needed for OSNR calculation.
 * This is a subset of the full TransceiverType (in types/transceiver.ts)
 * used by the OSNR engine for calculation purposes.
 */
export interface TransceiverParams {
  /** Transmitter launch power in dBm */
  launchPower: number;
  /** Transmitter OSNR in dB (Tx contribution to noise floor) */
  txOSNR: number;
  /** Required OSNR for the selected modulation format in dB */
  requiredOSNR: number;
  /** Receiver sensitivity in dBm */
  receiverSensitivity: number;
  /** Baud rate in GBaud */
  baudRate: number;
}

// ============================================================================
// RESULTS
// ============================================================================

/**
 * OSNR result for a single span.
 */
export interface SpanOSNRResult {
  /** Span index (0-based) */
  spanIndex: number;
  /** Span length in km */
  spanLength: number;
  /** Total span loss in dB (fiber + connectors + splices) */
  spanLoss: number;
  /** Signal power at span output in dBm */
  signalPowerOut: number;
  /** ASE noise power contribution from this span's amplifier in dBm */
  aseNoisePower: number;
  /** NLI noise power contribution from this span in dBm */
  nliNoisePower?: number;
  /** OSNR at the output of this span's amplifier in dB */
  osnrAfterSpan: number;
  /** Cumulative OSNR up to this point in dB */
  cumulativeOSNR: number;
  /** Amplifier gain applied in dB */
  amplifierGain: number;
  /** Amplifier noise figure in dB */
  amplifierNF: number;
}

/**
 * Complete OSNR calculation result for an end-to-end path.
 */
export interface OSNRResult {
  /** Whether the path is feasible (margin >= 0) */
  feasible: boolean;
  /** Final generalized SNR (GSNR) in dB, including Tx OSNR */
  finalGSNR: number;
  /** Required OSNR for the modulation format in dB */
  requiredOSNR: number;
  /** System margin in dB (finalGSNR - requiredOSNR - eolMargin) */
  systemMargin: number;
  /** End-of-life margin applied in dB */
  eolMargin: number;
  /** Total path distance in km */
  totalDistance: number;
  /** Total path loss in dB */
  totalLoss: number;
  /** Number of spans */
  spanCount: number;
  /** Per-span breakdown */
  spanResults: SpanOSNRResult[];
  /** Cascaded OSNR before Tx OSNR contribution in dB */
  cascadedOSNR: number;
  /** Warnings (e.g., "span exceeds recommended length") */
  warnings: string[];
}

// ============================================================================
// AMPLIFIER SUGGESTION
// ============================================================================

/**
 * Suggestion for placing an amplifier to improve link feasibility.
 */
export interface AmplifierSuggestion {
  /** Suggested position: after which span index */
  afterSpanIndex: number;
  /** Edge ID where the amplifier should be placed */
  edgeId: string;
  /** Approximate km offset from the span start */
  kmOffset: number;
  /** Recommended gain in dB */
  recommendedGain: number;
  /** Recommended noise figure in dB */
  recommendedNF: number;
  /** Expected OSNR improvement in dB */
  osnrImprovement: number;
  /** Reason for suggestion */
  reason: string;
}
