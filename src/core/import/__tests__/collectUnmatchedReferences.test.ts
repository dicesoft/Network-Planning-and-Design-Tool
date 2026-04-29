import { describe, it, expect } from 'vitest';
import { collectUnmatchedReferences } from '../ImportEngine';

describe('collectUnmatchedReferences', () => {
  const nodeNameToId = new Map([
    ['node-a', 'id-a'],
    ['node-b', 'id-b'],
  ]);

  it('finds unmatched edge source/target references', () => {
    const edgeRows = [{ source_node: 'Node-A', target_node: 'Unknown-Node' }];
    const result = collectUnmatchedReferences(edgeRows, [], nodeNameToId);
    // Node-A matches (case-insensitive), Unknown-Node does not
    const entries = Array.from(result.entries());
    expect(entries.length).toBe(1);
    expect(entries[0][1].fileType).toBe('edges');
  });

  it('finds unmatched service references', () => {
    const serviceRows = [{ source_node: 'Unknown-Src', destination_node: 'Node-B' }];
    const result = collectUnmatchedReferences([], serviceRows, nodeNameToId);
    const entries = Array.from(result.entries());
    expect(entries.length).toBe(1);
    expect(entries[0][1].fileType).toBe('services');
  });

  it('groups multiple rows referencing the same unmatched name', () => {
    const edgeRows = [
      { source_node: 'Unknown-Node', target_node: 'Node-A' },
      { source_node: 'Unknown-Node', target_node: 'Node-B' },
    ];
    const result = collectUnmatchedReferences(edgeRows, [], nodeNameToId);
    const entries = Array.from(result.entries());
    expect(entries.length).toBe(1);
    expect(entries[0][1].rowNumbers).toEqual([1, 2]);
  });

  it('finds unmatched path node references', () => {
    const serviceRows = [
      {
        source_node: 'Node-A',
        destination_node: 'Node-B',
        working_path_nodes: 'Node-A;Unknown-Mid;Node-B',
      },
    ];
    const result = collectUnmatchedReferences([], serviceRows, nodeNameToId);
    const entries = Array.from(result.entries());
    expect(entries.length).toBe(1);
    expect(entries[0][1].fieldName).toBe('working_path_nodes');
  });

  it('returns empty map when all references match', () => {
    const edgeRows = [{ source_node: 'Node-A', target_node: 'Node-B' }];
    const result = collectUnmatchedReferences(edgeRows, [], nodeNameToId);
    expect(result.size).toBe(0);
  });

  it('skips empty values', () => {
    const edgeRows = [{ source_node: '', target_node: 'Node-A' }];
    const result = collectUnmatchedReferences(edgeRows, [], nodeNameToId);
    expect(result.size).toBe(0);
  });
});
