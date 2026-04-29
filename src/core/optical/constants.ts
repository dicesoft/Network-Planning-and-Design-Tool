/**
 * Optical Engineering Constants
 * Physical constants and default parameters for OSNR calculations
 */

// ============================================================================
// FUNDAMENTAL PHYSICAL CONSTANTS
// ============================================================================

/** Planck's constant in J*s */
export const PLANCK_CONSTANT = 6.626e-34;

/** Speed of light in m/s */
export const SPEED_OF_LIGHT = 3e8;

/** Boltzmann constant in J/K */
export const BOLTZMANN_CONSTANT = 1.38e-23;

// ============================================================================
// OPTICAL REFERENCE VALUES
// ============================================================================

/** Reference bandwidth for OSNR measurement: 12.5 GHz (0.1 nm at 1550 nm) */
export const REFERENCE_BANDWIDTH_HZ = 12.5e9;

/** C-band center frequency in Hz (~193.1 THz, corresponds to ~1552.5 nm) */
export const C_BAND_CENTER_FREQUENCY_HZ = 193.1e12;

/** C-band center wavelength in nm */
export const C_BAND_CENTER_WAVELENGTH_NM = 1552.52;

// ============================================================================
// DEFAULT FIBER PARAMETERS
// ============================================================================

/** Default fiber attenuation for G.652.D in dB/km at 1550 nm */
export const DEFAULT_FIBER_ATTENUATION = 0.2;

/** Default chromatic dispersion for G.652.D in ps/(nm*km) at 1550 nm */
export const DEFAULT_CHROMATIC_DISPERSION = 17;

/** Default effective area for G.652.D in um^2 */
export const DEFAULT_EFFECTIVE_AREA = 80;

/** Default non-linear refractive index (n2) in m^2/W */
export const DEFAULT_NONLINEAR_INDEX = 2.6e-20;

/** Default PMD coefficient in ps/sqrt(km) */
export const DEFAULT_PMD_COEFFICIENT = 0.1;

// ============================================================================
// DEFAULT AMPLIFIER PARAMETERS
// ============================================================================

/** Default EDFA noise figure in dB */
export const DEFAULT_AMPLIFIER_NF = 5.5;

/** Default EDFA gain in dB */
export const DEFAULT_AMPLIFIER_GAIN = 20;

/** Typical EDFA output power in dBm */
export const DEFAULT_AMPLIFIER_OUTPUT_POWER = 17;

// ============================================================================
// DEFAULT LOSS VALUES
// ============================================================================

/** Default connector loss in dB */
export const DEFAULT_CONNECTOR_LOSS = 0.5;

/** Default splice loss in dB */
export const DEFAULT_SPLICE_LOSS = 0.1;

/** Default end-of-life margin in dB */
export const DEFAULT_EOL_MARGIN = 3.0;

// ============================================================================
// SPAN DESIGN GUIDELINES
// ============================================================================

/** Maximum recommended span length in km before requiring amplification */
export const MAX_RECOMMENDED_SPAN_LENGTH = 120;

/** Minimum signal power at receiver in dBm (below this, signal is unreliable) */
export const MIN_RECEIVER_POWER = -28;

/** Maximum number of spans for cascaded OSNR estimation */
export const MAX_SPANS = 50;

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

/** Convert dB to linear scale */
export const dbToLinear = (dB: number): number => Math.pow(10, dB / 10);

/** Convert linear scale to dB */
export const linearToDb = (linear: number): number => 10 * Math.log10(linear);

/** Convert dBm to watts */
export const dbmToWatts = (dBm: number): number => Math.pow(10, (dBm - 30) / 10);

/** Convert watts to dBm */
export const wattsToDbm = (watts: number): number => 10 * Math.log10(watts) + 30;
