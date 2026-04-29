import { describe, it, expect } from 'vitest';
import { validateRow } from '../ImportValidator';
import type { ColumnMapping } from '@/types/import';

const nodeColumns: ColumnMapping[] = [
  { csvColumn: 'node_name', targetField: 'name', required: true },
  { csvColumn: 'node_type', targetField: 'type', required: true, transform: 'toNodeType' },
  { csvColumn: 'vendor', targetField: 'vendor', required: false, transform: 'toVendor', defaultValue: 'huawei' },
  { csvColumn: 'latitude', targetField: 'location.latitude', required: false },
  { csvColumn: 'longitude', targetField: 'location.longitude', required: false },
];

describe('ImportValidator', () => {
  it('should accept a valid complete row', () => {
    const row = {
      node_name: 'OADM-Cairo-01',
      node_type: 'OADM',
      vendor: 'Huawei',
      latitude: '30.0444',
      longitude: '31.2357',
    };

    const result = validateRow(row, nodeColumns, 1);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing required fields', () => {
    const row = {
      node_name: '',
      node_type: '',
      vendor: 'Huawei',
    };

    const result = validateRow(row, nodeColumns, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.includes('node_name'))).toBe(true);
    expect(result.errors.some((e) => e.includes('node_type'))).toBe(true);
  });

  it('should warn on missing optional fields with defaults', () => {
    const row = {
      node_name: 'Node1',
      node_type: 'router',
      vendor: '', // has default
    };

    const result = validateRow(row, nodeColumns, 1);
    // vendor is optional, so no error
    expect(result.valid).toBe(true);
  });

  it('should reject invalid latitude (out of range)', () => {
    const row = {
      node_name: 'Node1',
      node_type: 'router',
      latitude: '95.0', // > 90
      longitude: '31.0',
    };

    const result = validateRow(row, nodeColumns, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Latitude'))).toBe(true);
  });

  it('should reject invalid longitude (out of range)', () => {
    const row = {
      node_name: 'Node1',
      node_type: 'router',
      latitude: '30.0',
      longitude: '200.0', // > 180
    };

    const result = validateRow(row, nodeColumns, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Longitude'))).toBe(true);
  });

  it('should reject negative latitude below -90', () => {
    const row = {
      node_name: 'Node1',
      node_type: 'router',
      latitude: '-91.0',
      longitude: '0',
    };

    const result = validateRow(row, nodeColumns, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Latitude'))).toBe(true);
  });

  it('should warn on unknown node type transform', () => {
    const row = {
      node_name: 'Node1',
      node_type: 'totally-unknown-device',
      vendor: 'Huawei',
    };

    const result = validateRow(row, nodeColumns, 1);
    // toNodeType returns undefined for unknown, which triggers a warning
    expect(result.warnings.some((w) => w.includes('could not be mapped'))).toBe(true);
  });

  it('should reject overly long strings', () => {
    const row = {
      node_name: 'A'.repeat(300), // > 256
      node_type: 'router',
    };

    const result = validateRow(row, nodeColumns, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds'))).toBe(true);
  });

  it('should validate edge distance_km as positive number', () => {
    const edgeColumns: ColumnMapping[] = [
      { csvColumn: 'edge_name', targetField: 'name', required: true },
    ];

    const row = {
      edge_name: 'Link1',
      distance_km: '-10',
    };

    const result = validateRow(row, edgeColumns, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Distance'))).toBe(true);
  });

  it('should accept valid coordinates at boundary values', () => {
    const row = {
      node_name: 'Node1',
      node_type: 'router',
      latitude: '90',
      longitude: '-180',
    };

    const result = validateRow(row, nodeColumns, 1);
    expect(result.valid).toBe(true);
  });
});
