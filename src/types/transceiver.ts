/**
 * Transceiver Types
 * Defines coherent transceiver models with optical parameters for OSNR analysis
 */

import type { ModulationType, L1DataRate } from './service';

// ============================================================================
// FORM FACTOR
// ============================================================================

/**
 * Pluggable transceiver form factors
 */
export type TransceiverFormFactor = 'CFP' | 'CFP2' | 'QSFP28' | 'QSFP-DD' | 'OSFP' | 'SFP+' | 'SFP28';

// ============================================================================
// MODULATION SUPPORT
// ============================================================================

/**
 * Per-modulation optical parameters for a transceiver
 */
export interface TransceiverModulationSupport {
  /** Modulation format */
  modulation: ModulationType;
  /** Required OSNR for this modulation in dB (at reference BER, e.g. pre-FEC 1e-2) */
  requiredOSNR: number;
  /** Maximum reach in km for this modulation (without amplification, typical fiber) */
  maxReach: number;
}

// ============================================================================
// TRANSCEIVER TYPE
// ============================================================================

/**
 * Coherent transceiver type definition.
 * Represents a specific transceiver model with its optical capabilities.
 */
export interface TransceiverType {
  /** Unique identifier (e.g., 'cfp2-dco-100g') */
  id: string;
  /** Display name (e.g., 'CFP2-DCO-100G') */
  name: string;
  /** Vendor name */
  vendor: string;
  /** Pluggable form factor */
  formFactor: TransceiverFormFactor;

  // Optical parameters
  /** Transmitter launch power in dBm */
  launchPower: number;
  /** Receiver sensitivity in dBm */
  receiverSensitivity: number;
  /** Transmitter OSNR in dB (Tx noise floor contribution) */
  txOSNR: number;

  // Modulation and rate capabilities
  /** Supported modulation formats with per-modulation OSNR requirements */
  supportedModulations: TransceiverModulationSupport[];
  /** Supported data rates */
  supportedDataRates: L1DataRate[];
  /** Symbol rate in GBaud */
  baudRate: number;
}

// ============================================================================
// DEFAULT TRANSCEIVER LIBRARY
// ============================================================================

/**
 * Built-in transceiver definitions.
 * Users can extend this via settingsStore.transceiverLibrary.
 */
export const DEFAULT_TRANSCEIVERS: TransceiverType[] = [
  {
    id: 'cfp2-dco-100g',
    name: 'CFP2-DCO-100G',
    vendor: 'Generic',
    formFactor: 'CFP2',
    launchPower: 0,
    receiverSensitivity: -22,
    txOSNR: 40,
    supportedModulations: [
      { modulation: 'DP-QPSK', requiredOSNR: 12, maxReach: 2500 },
      { modulation: 'DP-8QAM', requiredOSNR: 18, maxReach: 1500 },
      { modulation: 'DP-16QAM', requiredOSNR: 22, maxReach: 800 },
    ],
    supportedDataRates: ['100G'],
    baudRate: 32,
  },
  {
    id: 'qsfp-dd-zrp-400g',
    name: 'QSFP-DD-ZR+-400G',
    vendor: 'Generic',
    formFactor: 'QSFP-DD',
    launchPower: -10,
    receiverSensitivity: -18,
    txOSNR: 36,
    supportedModulations: [
      { modulation: 'DP-16QAM', requiredOSNR: 22, maxReach: 800 },
      { modulation: 'DP-8QAM', requiredOSNR: 18, maxReach: 1500 },
    ],
    supportedDataRates: ['400G'],
    baudRate: 64,
  },
  {
    id: 'sfp-plus-10g-lr',
    name: 'SFP+-10G-LR',
    vendor: 'Generic',
    formFactor: 'SFP+',
    launchPower: -1,
    receiverSensitivity: -20,
    txOSNR: 35,
    supportedModulations: [
      { modulation: 'DP-QPSK', requiredOSNR: 10, maxReach: 40 },
    ],
    supportedDataRates: ['10G'],
    baudRate: 10.3,
  },
  {
    id: 'sfp28-25g-lr',
    name: 'SFP28-25G-LR',
    vendor: 'Generic',
    formFactor: 'SFP28',
    launchPower: -3,
    receiverSensitivity: -18,
    txOSNR: 34,
    supportedModulations: [
      { modulation: 'DP-QPSK', requiredOSNR: 11, maxReach: 30 },
    ],
    supportedDataRates: ['25G'],
    baudRate: 25.78,
  },
  {
    id: 'qsfp28-100g-zr',
    name: 'QSFP28-100G-ZR',
    vendor: 'Generic',
    formFactor: 'QSFP28',
    launchPower: -2,
    receiverSensitivity: -23,
    txOSNR: 38,
    supportedModulations: [
      { modulation: 'DP-QPSK', requiredOSNR: 12, maxReach: 2500 },
      { modulation: 'DP-8QAM', requiredOSNR: 18, maxReach: 1200 },
      { modulation: 'DP-16QAM', requiredOSNR: 22, maxReach: 600 },
    ],
    supportedDataRates: ['100G'],
    baudRate: 32,
  },
  {
    id: 'qsfp-dd-200g-zr',
    name: 'QSFP-DD-200G-ZR',
    vendor: 'Generic',
    formFactor: 'QSFP-DD',
    launchPower: -5,
    receiverSensitivity: -20,
    txOSNR: 37,
    supportedModulations: [
      { modulation: 'DP-QPSK', requiredOSNR: 12, maxReach: 2000 },
      { modulation: 'DP-8QAM', requiredOSNR: 18, maxReach: 1000 },
      { modulation: 'DP-16QAM', requiredOSNR: 22, maxReach: 500 },
    ],
    supportedDataRates: ['200G'],
    baudRate: 32,
  },
  {
    id: 'osfp-400g-zr',
    name: 'OSFP-400G-ZR',
    vendor: 'Generic',
    formFactor: 'OSFP',
    launchPower: -8,
    receiverSensitivity: -19,
    txOSNR: 37,
    supportedModulations: [
      { modulation: 'DP-16QAM', requiredOSNR: 22, maxReach: 900 },
      { modulation: 'DP-8QAM', requiredOSNR: 18, maxReach: 1800 },
      { modulation: 'DP-QPSK', requiredOSNR: 12, maxReach: 3000 },
    ],
    supportedDataRates: ['400G'],
    baudRate: 64,
  },
];
