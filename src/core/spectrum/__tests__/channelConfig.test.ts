import { describe, it, expect } from 'vitest';
import {
  SPEED_OF_LIGHT,
  C_BAND_REFERENCE,
  CHANNEL_GRID_CONFIGS,
  frequencyToWavelength,
  wavelengthToFrequency,
  frequencyToChannelNumber,
  channelNumberToFrequency,
  slotNumberToFrequency,
  frequencyToSlotNumber,
  generateFixedGridChannels,
  generateFlexGridSlots,
  getChannelByNumber,
  getChannelDisplayInfo,
  getFlexGridSlotInfo,
  getChannelRange,
  getSlotRange,
  isValidChannelNumber,
  isValidSlotNumber,
} from '../channelConfig';

describe('channelConfig', () => {
  describe('constants', () => {
    it('should have correct speed of light constant', () => {
      expect(SPEED_OF_LIGHT).toBe(299792.458);
    });

    it('should have correct C-band reference frequency', () => {
      expect(C_BAND_REFERENCE).toBe(193.1);
    });

    it('should have grid configurations for all types', () => {
      expect(CHANNEL_GRID_CONFIGS['fixed-100ghz']).toBeDefined();
      expect(CHANNEL_GRID_CONFIGS['fixed-50ghz']).toBeDefined();
      expect(CHANNEL_GRID_CONFIGS['flex-grid']).toBeDefined();
    });
  });

  describe('frequencyToWavelength', () => {
    it('should convert reference frequency to wavelength', () => {
      // 193.1 THz should be ~1552.52 nm
      const wavelength = frequencyToWavelength(C_BAND_REFERENCE);
      expect(wavelength).toBeCloseTo(1552.52, 1);
    });

    it('should convert 191.35 THz to correct wavelength', () => {
      const wavelength = frequencyToWavelength(191.35);
      expect(wavelength).toBeCloseTo(1566.72, 1);
    });

    it('should convert 196.1 THz to correct wavelength', () => {
      const wavelength = frequencyToWavelength(196.1);
      expect(wavelength).toBeCloseTo(1528.77, 1);
    });

    it('should handle invalid input', () => {
      expect(frequencyToWavelength(0)).toBe(0);
      expect(frequencyToWavelength(-1)).toBe(0);
    });
  });

  describe('wavelengthToFrequency', () => {
    it('should convert wavelength to frequency', () => {
      // 1552.52 nm should be ~193.1 THz
      const freq = wavelengthToFrequency(1552.52);
      expect(freq).toBeCloseTo(193.1, 1);
    });

    it('should be inverse of frequencyToWavelength', () => {
      const originalFreq = 193.5;
      const wavelength = frequencyToWavelength(originalFreq);
      const backToFreq = wavelengthToFrequency(wavelength);
      expect(backToFreq).toBeCloseTo(originalFreq, 5);
    });

    it('should handle invalid input', () => {
      expect(wavelengthToFrequency(0)).toBe(0);
      expect(wavelengthToFrequency(-1)).toBe(0);
    });
  });

  describe('frequencyToChannelNumber', () => {
    it('should return 0 for reference frequency on 100 GHz grid', () => {
      const ch = frequencyToChannelNumber(C_BAND_REFERENCE, 'fixed-100ghz');
      expect(ch).toBe(0);
    });

    it('should return 0 for reference frequency on 50 GHz grid', () => {
      const ch = frequencyToChannelNumber(C_BAND_REFERENCE, 'fixed-50ghz');
      expect(ch).toBe(0);
    });

    it('should return positive channel number for higher frequency', () => {
      const ch = frequencyToChannelNumber(193.2, 'fixed-100ghz');
      expect(ch).toBe(1);
    });

    it('should return negative channel number for lower frequency', () => {
      const ch = frequencyToChannelNumber(193.0, 'fixed-100ghz');
      expect(ch).toBe(-1);
    });

    it('should handle 50 GHz spacing', () => {
      const ch = frequencyToChannelNumber(193.15, 'fixed-50ghz');
      expect(ch).toBe(1);
    });
  });

  describe('channelNumberToFrequency', () => {
    it('should return reference frequency for channel 0', () => {
      const freq = channelNumberToFrequency(0, 'fixed-100ghz');
      expect(freq).toBe(C_BAND_REFERENCE);
    });

    it('should calculate correct frequency for positive channel', () => {
      const freq = channelNumberToFrequency(1, 'fixed-100ghz');
      expect(freq).toBe(193.2);
    });

    it('should calculate correct frequency for negative channel', () => {
      const freq = channelNumberToFrequency(-1, 'fixed-100ghz');
      expect(freq).toBe(193.0);
    });

    it('should be inverse of frequencyToChannelNumber', () => {
      const ch = 10;
      const freq = channelNumberToFrequency(ch, 'fixed-100ghz');
      const backToCh = frequencyToChannelNumber(freq, 'fixed-100ghz');
      expect(backToCh).toBe(ch);
    });
  });

  describe('slotNumberToFrequency / frequencyToSlotNumber', () => {
    it('should return reference frequency for slot 0', () => {
      const freq = slotNumberToFrequency(0);
      expect(freq).toBe(C_BAND_REFERENCE);
    });

    it('should calculate correct frequency for positive slot', () => {
      const freq = slotNumberToFrequency(1);
      expect(freq).toBeCloseTo(193.10625, 5);
    });

    it('should be inverse operations', () => {
      const slot = 100;
      const freq = slotNumberToFrequency(slot);
      const backToSlot = frequencyToSlotNumber(freq);
      expect(backToSlot).toBe(slot);
    });
  });

  describe('generateFixedGridChannels', () => {
    it('should generate 100 GHz grid channels', () => {
      const channels = generateFixedGridChannels('fixed-100ghz');
      expect(channels.length).toBeGreaterThan(0);
      expect(channels[0].gridSpacing).toBe(100);
    });

    it('should generate 50 GHz grid channels', () => {
      const channels = generateFixedGridChannels('fixed-50ghz');
      expect(channels.length).toBeGreaterThan(0);
      expect(channels[0].gridSpacing).toBe(50);
    });

    it('should generate more channels for 50 GHz grid than 100 GHz', () => {
      const channels100 = generateFixedGridChannels('fixed-100ghz');
      const channels50 = generateFixedGridChannels('fixed-50ghz');
      expect(channels50.length).toBeGreaterThan(channels100.length);
    });

    it('should include center frequency and wavelength for each channel', () => {
      const channels = generateFixedGridChannels('fixed-100ghz');
      channels.forEach((ch) => {
        expect(ch.centerFrequency).toBeGreaterThan(0);
        expect(ch.centerWavelength).toBeGreaterThan(0);
        expect(ch.number).toBeDefined();
      });
    });
  });

  describe('generateFlexGridSlots', () => {
    it('should generate flex-grid slots', () => {
      const slots = generateFlexGridSlots();
      expect(slots.length).toBeGreaterThan(0);
    });

    it('should have correct slot properties', () => {
      const slots = generateFlexGridSlots();
      slots.forEach((slot) => {
        expect(slot.centralSlotNumber).toBeDefined();
        expect(slot.centralFrequency).toBeGreaterThan(0);
        expect(slot.slotWidth).toBe(1);
        expect(slot.effectiveWidthGHz).toBe(12.5);
      });
    });
  });

  describe('getChannelByNumber', () => {
    it('should return channel info for valid channel number', () => {
      const ch = getChannelByNumber(0, 'fixed-100ghz');
      expect(ch).not.toBeNull();
      expect(ch?.number).toBe(0);
      expect(ch?.centerFrequency).toBe(C_BAND_REFERENCE);
    });

    it('should return null for out-of-range channel', () => {
      const ch = getChannelByNumber(1000, 'fixed-100ghz');
      expect(ch).toBeNull();
    });
  });

  describe('getChannelDisplayInfo', () => {
    it('should return formatted display info for valid channel', () => {
      const info = getChannelDisplayInfo(0, 'fixed-100ghz');
      expect(info).not.toBeNull();
      expect(info?.number).toBe(0);
      expect(info?.frequency).toContain('THz');
      expect(info?.wavelength).toContain('nm');
      expect(info?.spacing).toBe('100 GHz');
    });

    it('should return null for invalid channel', () => {
      const info = getChannelDisplayInfo(1000, 'fixed-100ghz');
      expect(info).toBeNull();
    });
  });

  describe('getFlexGridSlotInfo', () => {
    it('should return correct info for slot range', () => {
      const info = getFlexGridSlotInfo(0, 4);
      expect(info.startFrequency).toBeGreaterThan(0);
      expect(info.endFrequency).toBeGreaterThan(info.startFrequency);
      expect(info.bandwidthGHz).toBe(62.5); // 5 slots * 12.5 GHz
    });

    it('should calculate center frequency correctly', () => {
      const info = getFlexGridSlotInfo(-2, 2);
      expect(info.centerFrequency).toBeCloseTo(C_BAND_REFERENCE, 3);
    });
  });

  describe('getChannelRange', () => {
    it('should return range for 100 GHz grid', () => {
      const range = getChannelRange('fixed-100ghz');
      expect(range.min).toBeDefined();
      expect(range.max).toBeDefined();
      expect(range.count).toBe(range.max - range.min + 1);
    });

    it('should return range for 50 GHz grid', () => {
      const range = getChannelRange('fixed-50ghz');
      expect(range.count).toBeGreaterThan(getChannelRange('fixed-100ghz').count);
    });
  });

  describe('getSlotRange', () => {
    it('should return slot range for flex-grid', () => {
      const range = getSlotRange();
      expect(range.min).toBeDefined();
      expect(range.max).toBeDefined();
      expect(range.count).toBe(range.max - range.min + 1);
    });
  });

  describe('isValidChannelNumber', () => {
    it('should return true for valid channel', () => {
      expect(isValidChannelNumber(0, 'fixed-100ghz')).toBe(true);
    });

    it('should return false for out-of-range channel', () => {
      expect(isValidChannelNumber(1000, 'fixed-100ghz')).toBe(false);
    });
  });

  describe('isValidSlotNumber', () => {
    it('should return true for valid slot', () => {
      expect(isValidSlotNumber(0)).toBe(true);
    });

    it('should return false for out-of-range slot', () => {
      expect(isValidSlotNumber(10000)).toBe(false);
    });
  });
});
