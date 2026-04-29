/**
 * DWDM Channel/Lambda Spectrum Types
 * Based on ITU-T G.694.1 standard for DWDM frequency grids
 */

// Channel grid types (ITU-T G.694.1)
export type ChannelGridType = 'fixed-100ghz' | 'fixed-50ghz' | 'flex-grid';
export type ChannelStatus = 'free' | 'allocated' | 'reserved';

/**
 * Fixed grid channel (50/100 GHz spacing)
 * Based on ITU-T G.694.1 frequency plan
 */
export interface FixedGridChannel {
  /** ITU-T channel number */
  number: number;
  /** Center frequency in THz */
  centerFrequency: number;
  /** Center wavelength in nm (derived from frequency) */
  centerWavelength: number;
  /** Grid spacing in GHz */
  gridSpacing: 50 | 100;
}

/**
 * Flex-grid slot (12.5 GHz granularity)
 * Based on ITU-T G.694.1 flexible DWDM grid
 */
export interface FlexGridSlot {
  /** Central slot number (n value in ITU-T formula: f = 193.1 + n × 0.00625 THz) */
  centralSlotNumber: number;
  /** Central frequency in THz */
  centralFrequency: number;
  /** Slot width (m value - multiples of 12.5 GHz) */
  slotWidth: number;
  /** Effective width in GHz (slotWidth × 12.5) */
  effectiveWidthGHz: number;
}

/**
 * Channel allocation record
 * Represents a single allocation on a port's spectrum
 */
export interface ChannelAllocation {
  /** Unique allocation ID */
  id: string;

  /** Fixed grid: ITU-T channel number */
  channelNumber?: number;

  /** Flex-grid: slot range for spectral allocation */
  slotRange?: {
    startSlot: number;
    endSlot: number;
  };

  /** Allocation status */
  status: ChannelStatus;

  /** Edge ID using this allocation (when allocated to a connection) */
  edgeId?: string;

  /** User-defined label (e.g., "Customer A", "Service-123") */
  label?: string;
}

/**
 * Port spectrum configuration
 * Tracks all channel/slot allocations for a DWDM port
 */
export interface PortSpectrum {
  /** Grid type for this port */
  gridType: ChannelGridType;

  /** All channel/slot allocations on this port */
  allocations: ChannelAllocation[];
}

/**
 * Edge channel assignment
 * Tracks which channels are used at each end of a DWDM connection
 */
export interface EdgeChannelAssignment {
  /** Channels allocated at the source port */
  sourceChannels: ChannelAllocation[];

  /** Channels allocated at the target port */
  targetChannels: ChannelAllocation[];

  /** Express connection flag - same wavelength used end-to-end */
  isExpress: boolean;
}

/**
 * Grid configuration parameters
 */
export interface ChannelGridConfig {
  /** Display label */
  label: string;
  /** Grid spacing in GHz */
  spacing?: number;
  /** Grid spacing in THz */
  spacingTHz?: number;
  /** Number of channels */
  channelCount?: number;
  /** Start frequency in THz */
  startFrequency: number;
  /** End frequency in THz */
  endFrequency: number;
  /** Slot granularity for flex-grid (GHz) */
  slotGranularity?: number;
  /** Number of slots for flex-grid */
  slotCount?: number;
}

/**
 * Channel selection state for UI components
 */
export interface ChannelSelectionState {
  /** Grid type being used for selection */
  gridType: ChannelGridType;

  /** Selected fixed-grid channel numbers */
  selectedChannels: number[];

  /** Selected flex-grid slot range */
  selectedSlotRange?: {
    startSlot: number;
    endSlot: number;
  };

  /** Multi-select mode enabled */
  multiSelect: boolean;
}
