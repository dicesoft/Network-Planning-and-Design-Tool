/**
 * ITU-T G.694.1 DWDM Channel Configuration
 * Provides constants and helper functions for DWDM frequency grids
 */

import type {
  ChannelGridType,
  FixedGridChannel,
  FlexGridSlot,
  ChannelGridConfig,
} from '@/types/spectrum';

// Physical constants
/** Speed of light in vacuum - used for frequency/wavelength conversion */
export const SPEED_OF_LIGHT = 299792.458; // km/s → for nm·THz calculation

/** ITU-T G.694.1 anchor frequency (193.1 THz = 1552.52 nm) */
export const C_BAND_REFERENCE = 193.1; // THz

/** Flex-grid slot granularity */
export const FLEX_GRID_SLOT_GHZ = 12.5; // GHz
export const FLEX_GRID_SLOT_THZ = 0.0125; // THz

/** C-band typical range */
export const C_BAND_START = 191.3; // THz (~1567 nm)
export const C_BAND_END = 196.2; // THz (~1528 nm)

/**
 * Grid configurations for each supported grid type
 */
export const CHANNEL_GRID_CONFIGS: Record<ChannelGridType, ChannelGridConfig> = {
  'fixed-100ghz': {
    label: '100 GHz Fixed Grid',
    spacing: 100,
    spacingTHz: 0.1,
    channelCount: 48,
    startFrequency: 191.7, // Channel 21 (lowest common 100 GHz channel)
    endFrequency: 196.1,   // Channel 61
  },
  'fixed-50ghz': {
    label: '50 GHz Fixed Grid',
    spacing: 50,
    spacingTHz: 0.05,
    channelCount: 96,
    startFrequency: 191.35, // Channel 17 at 50 GHz
    endFrequency: 196.10,   // Channel 60
  },
  'flex-grid': {
    label: 'Flex Grid (12.5 GHz)',
    slotGranularity: 12.5,
    slotCount: 384,
    startFrequency: 191.325, // n = -284
    endFrequency: 196.125,   // n = +484
  },
};

/**
 * Convert frequency (THz) to wavelength (nm)
 * Using: λ = c / f where c = 299792.458 km/s
 */
export function frequencyToWavelength(freqTHz: number): number {
  if (freqTHz <= 0) return 0;
  return SPEED_OF_LIGHT / freqTHz;
}

/**
 * Convert wavelength (nm) to frequency (THz)
 * Using: f = c / λ
 */
export function wavelengthToFrequency(wavelengthNm: number): number {
  if (wavelengthNm <= 0) return 0;
  return SPEED_OF_LIGHT / wavelengthNm;
}

/**
 * Calculate ITU-T channel number for a given frequency on a fixed grid
 * Channel numbering follows: f = 193.1 + n × Δf (THz)
 * where Δf = 0.1 THz for 100 GHz or 0.05 THz for 50 GHz
 */
export function frequencyToChannelNumber(
  freqTHz: number,
  gridType: 'fixed-100ghz' | 'fixed-50ghz'
): number {
  const spacingTHz = gridType === 'fixed-100ghz' ? 0.1 : 0.05;
  return Math.round((freqTHz - C_BAND_REFERENCE) / spacingTHz);
}

/**
 * Calculate frequency for a given ITU-T channel number on a fixed grid
 */
export function channelNumberToFrequency(
  channelNumber: number,
  gridType: 'fixed-100ghz' | 'fixed-50ghz'
): number {
  const spacingTHz = gridType === 'fixed-100ghz' ? 0.1 : 0.05;
  return C_BAND_REFERENCE + channelNumber * spacingTHz;
}

/**
 * Calculate flex-grid central frequency from slot number
 * f = 193.1 + n × 0.00625 THz (where 0.00625 = 6.25 GHz = half of 12.5 GHz slot)
 */
export function slotNumberToFrequency(slotNumber: number): number {
  return C_BAND_REFERENCE + slotNumber * 0.00625;
}

/**
 * Calculate flex-grid slot number from frequency
 */
export function frequencyToSlotNumber(freqTHz: number): number {
  return Math.round((freqTHz - C_BAND_REFERENCE) / 0.00625);
}

/**
 * Generate all fixed grid channels for a given grid type
 */
export function generateFixedGridChannels(
  gridType: 'fixed-100ghz' | 'fixed-50ghz'
): FixedGridChannel[] {
  const config = CHANNEL_GRID_CONFIGS[gridType];
  const gridSpacing = config.spacing as 50 | 100;
  const channels: FixedGridChannel[] = [];

  // Calculate start and end channel numbers
  const startChannel = frequencyToChannelNumber(config.startFrequency, gridType);
  const endChannel = frequencyToChannelNumber(config.endFrequency, gridType);

  for (let n = startChannel; n <= endChannel; n++) {
    const centerFrequency = channelNumberToFrequency(n, gridType);
    channels.push({
      number: n,
      centerFrequency,
      centerWavelength: frequencyToWavelength(centerFrequency),
      gridSpacing,
    });
  }

  return channels;
}

/**
 * Generate flex-grid slot information
 * Slots are numbered from the reference frequency (193.1 THz)
 */
export function generateFlexGridSlots(): FlexGridSlot[] {
  const config = CHANNEL_GRID_CONFIGS['flex-grid'];
  const slots: FlexGridSlot[] = [];

  // Calculate slot range
  const startSlot = frequencyToSlotNumber(config.startFrequency);
  const endSlot = frequencyToSlotNumber(config.endFrequency);

  for (let n = startSlot; n <= endSlot; n++) {
    const centralFrequency = slotNumberToFrequency(n);
    slots.push({
      centralSlotNumber: n,
      centralFrequency,
      slotWidth: 1, // Default single slot width
      effectiveWidthGHz: FLEX_GRID_SLOT_GHZ,
    });
  }

  return slots;
}

/**
 * Get a specific channel by number for a given grid type
 */
export function getChannelByNumber(
  channelNumber: number,
  gridType: 'fixed-100ghz' | 'fixed-50ghz'
): FixedGridChannel | null {
  const config = CHANNEL_GRID_CONFIGS[gridType];
  const startChannel = frequencyToChannelNumber(config.startFrequency, gridType);
  const endChannel = frequencyToChannelNumber(config.endFrequency, gridType);

  if (channelNumber < startChannel || channelNumber > endChannel) {
    return null;
  }

  const centerFrequency = channelNumberToFrequency(channelNumber, gridType);
  return {
    number: channelNumber,
    centerFrequency,
    centerWavelength: frequencyToWavelength(centerFrequency),
    gridSpacing: gridType === 'fixed-100ghz' ? 100 : 50,
  };
}

/**
 * Get channel information with formatted display strings
 */
export function getChannelDisplayInfo(
  channelNumber: number,
  gridType: 'fixed-100ghz' | 'fixed-50ghz'
): {
  number: number;
  frequency: string;
  wavelength: string;
  spacing: string;
} | null {
  const channel = getChannelByNumber(channelNumber, gridType);
  if (!channel) return null;

  return {
    number: channel.number,
    frequency: `${channel.centerFrequency.toFixed(2)} THz`,
    wavelength: `${channel.centerWavelength.toFixed(2)} nm`,
    spacing: `${channel.gridSpacing} GHz`,
  };
}

/**
 * Get flex-grid slot range information
 */
export function getFlexGridSlotInfo(
  startSlot: number,
  endSlot: number
): {
  startFrequency: number;
  endFrequency: number;
  centerFrequency: number;
  bandwidthGHz: number;
  startWavelength: number;
  endWavelength: number;
} {
  const startFreq = slotNumberToFrequency(startSlot);
  const endFreq = slotNumberToFrequency(endSlot);
  const slots = endSlot - startSlot + 1;

  return {
    startFrequency: startFreq,
    endFrequency: endFreq,
    centerFrequency: (startFreq + endFreq) / 2,
    bandwidthGHz: slots * FLEX_GRID_SLOT_GHZ,
    startWavelength: frequencyToWavelength(startFreq),
    endWavelength: frequencyToWavelength(endFreq),
  };
}

/**
 * Get valid channel number range for a grid type
 */
export function getChannelRange(gridType: 'fixed-100ghz' | 'fixed-50ghz'): {
  min: number;
  max: number;
  count: number;
} {
  const config = CHANNEL_GRID_CONFIGS[gridType];
  const min = frequencyToChannelNumber(config.startFrequency, gridType);
  const max = frequencyToChannelNumber(config.endFrequency, gridType);
  return {
    min,
    max,
    count: max - min + 1,
  };
}

/**
 * Get valid slot number range for flex-grid
 */
export function getSlotRange(): {
  min: number;
  max: number;
  count: number;
} {
  const config = CHANNEL_GRID_CONFIGS['flex-grid'];
  const min = frequencyToSlotNumber(config.startFrequency);
  const max = frequencyToSlotNumber(config.endFrequency);
  return {
    min,
    max,
    count: max - min + 1,
  };
}

/**
 * Check if a channel number is valid for the given grid type
 */
export function isValidChannelNumber(
  channelNumber: number,
  gridType: 'fixed-100ghz' | 'fixed-50ghz'
): boolean {
  const range = getChannelRange(gridType);
  return channelNumber >= range.min && channelNumber <= range.max;
}

/**
 * Check if a slot number is valid for flex-grid
 */
export function isValidSlotNumber(slotNumber: number): boolean {
  const range = getSlotRange();
  return slotNumber >= range.min && slotNumber <= range.max;
}

/**
 * Common channel widths for flex-grid (in number of 12.5 GHz slots)
 */
export const COMMON_FLEX_GRID_WIDTHS = [
  { slots: 2, ghz: 25, label: '25 GHz (2 slots)' },
  { slots: 3, ghz: 37.5, label: '37.5 GHz (3 slots)' },
  { slots: 4, ghz: 50, label: '50 GHz (4 slots)' },
  { slots: 6, ghz: 75, label: '75 GHz (6 slots)' },
  { slots: 8, ghz: 100, label: '100 GHz (8 slots)' },
] as const;

/**
 * Convert ITU-T channel number to user-friendly display number (CH1, CH2, ...)
 * The ITU-T numbering is centered at 193.1 THz (channel 0) and can be negative.
 * User-friendly numbering starts from CH1 at the lowest frequency channel.
 */
export function ituToUserChannel(
  ituChannel: number,
  gridType: 'fixed-100ghz' | 'fixed-50ghz'
): number {
  const range = getChannelRange(gridType);
  // User channel 1 corresponds to the minimum ITU-T channel
  return ituChannel - range.min + 1;
}

/**
 * Convert user-friendly display number back to ITU-T channel number
 * CH1 maps to the lowest frequency ITU-T channel in the C-band
 */
export function userToItuChannel(
  userChannel: number,
  gridType: 'fixed-100ghz' | 'fixed-50ghz'
): number {
  const range = getChannelRange(gridType);
  // User channel 1 corresponds to the minimum ITU-T channel
  return userChannel + range.min - 1;
}

/**
 * Format channel label for display (returns "CH1", "CH2", etc.)
 * Takes an ITU-T channel number and returns user-friendly label
 */
export function formatChannelLabel(
  ituChannel: number,
  gridType: 'fixed-100ghz' | 'fixed-50ghz'
): string {
  const userChannel = ituToUserChannel(ituChannel, gridType);
  return `CH${userChannel}`;
}

/**
 * Get user channel range info (returns {min: 1, max: count, count})
 * Unlike getChannelRange which returns ITU-T numbers, this returns
 * the user-friendly 1-based numbering range
 */
export function getUserChannelRange(gridType: 'fixed-100ghz' | 'fixed-50ghz'): {
  min: number;
  max: number;
  count: number;
} {
  const range = getChannelRange(gridType);
  return {
    min: 1,
    max: range.count,
    count: range.count,
  };
}
