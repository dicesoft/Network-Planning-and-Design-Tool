import { describe, it, expect } from 'vitest';
import { VALUE_TRANSFORMERS } from '../ImportTransformer';

describe('ImportTransformer', () => {
  describe('toNodeType', () => {
    it('should map Huawei NE types to internal NodeType', () => {
      const toNodeType = VALUE_TRANSFORMERS.toNodeType;

      expect(toNodeType('OADM')).toBe('oadm');
      expect(toNodeType('oadm')).toBe('oadm');
      expect(toNodeType('ROADM')).toBe('oadm');
      expect(toNodeType('Router')).toBe('router');
      expect(toNodeType('NE40E')).toBe('router');
      expect(toNodeType('NE8000')).toBe('router');
      expect(toNodeType('Switch')).toBe('switch');
      expect(toNodeType('CE6800')).toBe('switch');
      expect(toNodeType('EDFA')).toBe('amplifier');
      expect(toNodeType('Amplifier')).toBe('amplifier');
      expect(toNodeType('Terminal')).toBe('terminal');
      expect(toNodeType('OTN')).toBe('terminal');
      expect(toNodeType('Custom')).toBe('custom');
      expect(toNodeType('Unknown')).toBe('custom');
    });

    it('should handle case-insensitive mapping', () => {
      const toNodeType = VALUE_TRANSFORMERS.toNodeType;

      expect(toNodeType('ROUTER')).toBe('router');
      expect(toNodeType('router')).toBe('router');
      expect(toNodeType('Router')).toBe('router');
    });

    it('should return undefined for unmapped types', () => {
      const toNodeType = VALUE_TRANSFORMERS.toNodeType;

      expect(toNodeType('totally-bogus')).toBeUndefined();
      expect(toNodeType('')).toBeUndefined();
    });
  });

  describe('toVendor', () => {
    it('should normalize vendor names', () => {
      const toVendor = VALUE_TRANSFORMERS.toVendor;

      expect(toVendor('Huawei')).toBe('huawei');
      expect(toVendor('HUAWEI')).toBe('huawei');
      expect(toVendor('hw')).toBe('huawei');
      expect(toVendor('Nokia')).toBe('nokia');
      expect(toVendor('ALU')).toBe('nokia');
      expect(toVendor('Alcatel-Lucent')).toBe('nokia');
      expect(toVendor('Cisco')).toBe('cisco');
      expect(toVendor('Juniper')).toBe('juniper');
      expect(toVendor('JNPR')).toBe('juniper');
      expect(toVendor('Ciena')).toBe('ciena');
    });

    it('should default to generic for unknown vendors', () => {
      const toVendor = VALUE_TRANSFORMERS.toVendor;

      expect(toVendor('Acme Corp')).toBe('generic');
      expect(toVendor('')).toBe('generic');
    });
  });

  describe('toFiberProfile', () => {
    it('should map fiber profile strings', () => {
      const toFiberProfile = VALUE_TRANSFORMERS.toFiberProfile;

      expect(toFiberProfile('G.652.D')).toBe('G.652.D');
      expect(toFiberProfile('G652D')).toBe('G.652.D');
      expect(toFiberProfile('SMF')).toBe('G.652.D');
      expect(toFiberProfile('G.654.E')).toBe('G.654.E');
      expect(toFiberProfile('G.655')).toBe('G.655');
      expect(toFiberProfile('NZDSF')).toBe('G.655');
      expect(toFiberProfile('G.657.A1')).toBe('G.657.A1');
    });

    it('should default to G.652.D for unknown profiles', () => {
      const toFiberProfile = VALUE_TRANSFORMERS.toFiberProfile;

      expect(toFiberProfile('unknown')).toBe('G.652.D');
    });
  });

  describe('toNumber', () => {
    it('should parse valid numbers', () => {
      const toNumber = VALUE_TRANSFORMERS.toNumber;

      expect(toNumber('42')).toBe(42);
      expect(toNumber('3.14')).toBeCloseTo(3.14);
      expect(toNumber('0')).toBe(0);
      expect(toNumber('-10')).toBe(-10);
    });

    it('should return undefined for non-numeric strings', () => {
      const toNumber = VALUE_TRANSFORMERS.toNumber;

      expect(toNumber('abc')).toBeUndefined();
      expect(toNumber('')).toBeUndefined();
    });
  });

  describe('toSrlgArray', () => {
    it('should split SRLG codes by common delimiters', () => {
      const toSrlgArray = VALUE_TRANSFORMERS.toSrlgArray;

      expect(toSrlgArray('SRLG-A,SRLG-B,SRLG-C')).toEqual(['SRLG-A', 'SRLG-B', 'SRLG-C']);
      expect(toSrlgArray('SRLG-A;SRLG-B;SRLG-C')).toEqual(['SRLG-A', 'SRLG-B', 'SRLG-C']);
      expect(toSrlgArray('SRLG-A|SRLG-B|SRLG-C')).toEqual(['SRLG-A', 'SRLG-B', 'SRLG-C']);
    });

    it('should handle single SRLG code', () => {
      const toSrlgArray = VALUE_TRANSFORMERS.toSrlgArray;

      expect(toSrlgArray('SRLG-NILE')).toEqual(['SRLG-NILE']);
    });

    it('should return empty array for empty string', () => {
      const toSrlgArray = VALUE_TRANSFORMERS.toSrlgArray;

      expect(toSrlgArray('')).toEqual([]);
      expect(toSrlgArray('  ')).toEqual([]);
    });

    it('should trim whitespace from individual codes', () => {
      const toSrlgArray = VALUE_TRANSFORMERS.toSrlgArray;

      expect(toSrlgArray(' SRLG-A , SRLG-B ')).toEqual(['SRLG-A', 'SRLG-B']);
    });
  });

  describe('toFiberCount', () => {
    it('should parse valid fiber counts', () => {
      const toFiberCount = VALUE_TRANSFORMERS.toFiberCount;

      expect(toFiberCount('24')).toBe(24);
      expect(toFiberCount('48')).toBe(48);
      expect(toFiberCount('1')).toBe(1);
    });

    it('should default to 1 for invalid values', () => {
      const toFiberCount = VALUE_TRANSFORMERS.toFiberCount;

      expect(toFiberCount('0')).toBe(1);
      expect(toFiberCount('-5')).toBe(1);
      expect(toFiberCount('abc')).toBe(1);
    });
  });

  describe('toChannelList', () => {
    const toChannelList = VALUE_TRANSFORMERS.toChannelList;

    it('should parse comma-separated channel numbers', () => {
      expect(toChannelList('1,2,5')).toEqual([1, 2, 5]);
    });

    it('should parse dash ranges', () => {
      expect(toChannelList('1-5,10')).toEqual([1, 2, 3, 4, 5, 10]);
    });

    it('should filter out-of-range values (0, 97)', () => {
      expect(toChannelList('0,97,50')).toEqual([50]);
    });

    it('should return empty array for empty string', () => {
      expect(toChannelList('')).toEqual([]);
    });

    it('should deduplicate values', () => {
      expect(toChannelList('1,1,2')).toEqual([1, 2]);
    });

    it('should sort ascending', () => {
      expect(toChannelList('5,1,3')).toEqual([1, 3, 5]);
    });

    it('should handle mixed ranges and singles', () => {
      expect(toChannelList('1,2,5,12-18')).toEqual([1, 2, 5, 12, 13, 14, 15, 16, 17, 18]);
    });

    it('should handle whitespace-only string', () => {
      expect(toChannelList('  ')).toEqual([]);
    });

    it('should handle whitespace around values', () => {
      expect(toChannelList(' 1 , 3 , 5 ')).toEqual([1, 3, 5]);
    });

    it('should clamp ranges to 1-96', () => {
      expect(toChannelList('94-100')).toEqual([94, 95, 96]);
    });
  });
});
