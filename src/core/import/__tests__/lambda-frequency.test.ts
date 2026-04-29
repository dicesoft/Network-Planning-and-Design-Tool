import { describe, it, expect } from 'vitest';
import { VALUE_TRANSFORMERS } from '../ImportTransformer';
import { validateServiceRow } from '../ImportValidator';
import { runImport } from '../ImportEngine';

describe('toFrequency transformer', () => {
  const toFrequency = VALUE_TRANSFORMERS.toFrequency;

  it('parses valid C-band frequency', () => {
    expect(toFrequency('191.35')).toBe(191.35);
    expect(toFrequency('196.10')).toBe(196.10);
    expect(toFrequency('193.1')).toBe(193.1);
  });

  it('returns undefined for out-of-range frequencies', () => {
    expect(toFrequency('190.0')).toBeUndefined();
    expect(toFrequency('198.0')).toBeUndefined();
  });

  it('returns undefined for non-numeric values', () => {
    expect(toFrequency('')).toBeUndefined();
    expect(toFrequency('abc')).toBeUndefined();
  });

  it('returns undefined for NaN', () => {
    expect(toFrequency('NaN')).toBeUndefined();
  });
});

describe('validateServiceRow — lambda frequency cross-validation', () => {
  const nodeNameToId = new Map([
    ['node-a', 'id-a'],
    ['node-b', 'id-b'],
  ]);

  it('no errors/warnings when only channel_number is provided', () => {
    const row: Record<string, string> = {
      source_node: 'Node-A',
      destination_node: 'Node-B',
      service_type: 'l1-dwdm',
      channel_number: '1',
    };
    const result = validateServiceRow(row, nodeNameToId, 1);
    // Should not have frequency-related warnings
    expect(result.warnings.filter(w => w.includes('frequency'))).toHaveLength(0);
  });

  it('no errors when only lambda_frequency on 50GHz grid', () => {
    const row: Record<string, string> = {
      source_node: 'Node-A',
      destination_node: 'Node-B',
      service_type: 'l1-dwdm',
      lambda_frequency: '191.35',
    };
    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.errors.filter(e => e.includes('frequency'))).toHaveLength(0);
    expect(result.warnings.filter(w => w.includes('off 50GHz'))).toHaveLength(0);
  });

  it('warns when frequency is off 50GHz grid', () => {
    const row: Record<string, string> = {
      source_node: 'Node-A',
      destination_node: 'Node-B',
      service_type: 'l1-dwdm',
      lambda_frequency: '191.37',
    };
    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.warnings.some(w => w.includes('off 50GHz grid'))).toBe(true);
  });

  it('errors when frequency is outside C-band range', () => {
    const row: Record<string, string> = {
      source_node: 'Node-A',
      destination_node: 'Node-B',
      service_type: 'l1-dwdm',
      lambda_frequency: '190.00',
    };
    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.errors.some(e => e.includes('outside C-band'))).toBe(true);
  });

  it('warns when both provided but mismatch', () => {
    const row: Record<string, string> = {
      source_node: 'Node-A',
      destination_node: 'Node-B',
      service_type: 'l1-dwdm',
      channel_number: '1',
      lambda_frequency: '193.10', // This is not CH1
    };
    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.warnings.some(w => w.includes('does not match channel'))).toBe(true);
  });

  it('no warning when both provided and consistent', () => {
    // CH1 on 50GHz grid = ITU -35 = 191.35 THz
    const row: Record<string, string> = {
      source_node: 'Node-A',
      destination_node: 'Node-B',
      service_type: 'l1-dwdm',
      channel_number: '1',
      lambda_frequency: '191.35',
    };
    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.warnings.filter(w => w.includes('does not match'))).toHaveLength(0);
  });
});

describe('runImport — frequency to channel derivation', () => {
  const nodesCsv = 'node_name,node_type,vendor\nNode-A,OADM,Huawei\nNode-B,Router,Huawei';
  const edgesCsv = 'edge_name,source_node,target_node,distance_km\nLink-AB,Node-A,Node-B,100';

  it('derives channel from lambda_frequency when channel_number is absent', () => {
    const servicesCsv = 'service_name,service_type,source_node,destination_node,lambda_frequency\nSvc1,l1-dwdm,Node-A,Node-B,191.35';
    const result = runImport(nodesCsv, edgesCsv, 'huawei-nce', servicesCsv);
    expect(result.services.length).toBe(1);
    const svc = result.services[0] as { workingPath?: { channelNumber?: number }; channelNumber?: number };
    // CH1 on 50GHz grid corresponds to 191.35 THz
    expect(svc.workingPath?.channelNumber ?? svc.channelNumber).toBe(1);
  });

  it('uses channel_number when both are provided', () => {
    const servicesCsv = 'service_name,service_type,source_node,destination_node,channel_number,lambda_frequency\nSvc1,l1-dwdm,Node-A,Node-B,5,191.35';
    const result = runImport(nodesCsv, edgesCsv, 'huawei-nce', servicesCsv);
    expect(result.services.length).toBe(1);
    const svc = result.services[0] as { workingPath?: { channelNumber?: number }; channelNumber?: number };
    expect(svc.workingPath?.channelNumber ?? svc.channelNumber).toBe(5);
  });

  it('handles missing lambda_frequency gracefully', () => {
    const servicesCsv = 'service_name,service_type,source_node,destination_node\nSvc1,l1-dwdm,Node-A,Node-B';
    const result = runImport(nodesCsv, edgesCsv, 'huawei-nce', servicesCsv);
    expect(result.services.length).toBe(1);
    const svc = result.services[0] as { workingPath?: { channelNumber?: number } };
    expect(svc.workingPath?.channelNumber).toBeUndefined();
  });
});
