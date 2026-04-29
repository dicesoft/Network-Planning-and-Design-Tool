import { describe, it, expect } from 'vitest';
import {
  trimWhitespace,
  normalizeDelimiters,
  applyFuzzyRemapping,
  typeCheck,
  clearTypeMismatches,
  findAndReplace,
  convertCase,
  stripUnits,
  filterRows,
  removeDuplicates,
  removeEmptyRows,
  sortRows,
} from '../ImportDataTransforms';

describe('trimWhitespace', () => {
  it('trims all cell values', () => {
    const rows = [{ name: '  Node-A  ', type: 'OADM ' }];
    const result = trimWhitespace(rows);
    expect(result[0].name).toBe('Node-A');
    expect(result[0].type).toBe('OADM');
  });

  it('handles empty rows', () => {
    expect(trimWhitespace([])).toEqual([]);
  });
});

describe('normalizeDelimiters', () => {
  it('converts underscores to hyphens in node name columns', () => {
    const rows = [{ node_name: 'OADM_Cairo_01', source_node: 'Router_Alex_01' }];
    const result = normalizeDelimiters(rows);
    expect(result[0].node_name).toBe('OADM-Cairo-01');
    expect(result[0].source_node).toBe('Router-Alex-01');
  });

  it('converts dots to hyphens', () => {
    const rows = [{ source_node: 'Router.Alex.01' }];
    const result = normalizeDelimiters(rows);
    expect(result[0].source_node).toBe('Router-Alex-01');
  });

  it('normalizes path columns (semicolon-separated)', () => {
    const rows = [{ working_path_nodes: 'Node_A;Node.B;Node C' }];
    const result = normalizeDelimiters(rows);
    expect(result[0].working_path_nodes).toBe('Node-A;Node-B;Node-C');
  });

  it('does not modify non-node-name columns', () => {
    const rows = [{ edge_name: 'Link_A_B', source_node: 'Node_A' }];
    const result = normalizeDelimiters(rows);
    expect(result[0].edge_name).toBe('Link_A_B'); // unchanged
    expect(result[0].source_node).toBe('Node-A'); // normalized
  });
});

describe('applyFuzzyRemapping', () => {
  it('remaps exact values in node name columns', () => {
    const rows = [{ source_node: 'OADM_Cairo_01', target_node: 'Router-Alex-01' }];
    const remappings = new Map([['OADM_Cairo_01', 'OADM-Cairo-01']]);
    const result = applyFuzzyRemapping(rows, remappings);
    expect(result[0].source_node).toBe('OADM-Cairo-01');
    expect(result[0].target_node).toBe('Router-Alex-01'); // unchanged
  });

  it('remaps values in path columns', () => {
    const rows = [{ working_path_nodes: 'Node_A;Node_B;Node_C' }];
    const remappings = new Map([
      ['Node_A', 'Node-A'],
      ['Node_C', 'Node-C'],
    ]);
    const result = applyFuzzyRemapping(rows, remappings);
    expect(result[0].working_path_nodes).toBe('Node-A;Node_B;Node-C');
  });

  it('returns unchanged rows when no remappings match', () => {
    const rows = [{ source_node: 'Node-A' }];
    const remappings = new Map([['Node-X', 'Node-Y']]);
    const result = applyFuzzyRemapping(rows, remappings);
    expect(result[0].source_node).toBe('Node-A');
  });

  it('handles empty rows', () => {
    expect(applyFuzzyRemapping([], new Map())).toEqual([]);
  });
});

// ============================================================================
// typeCheck
// ============================================================================
describe('typeCheck', () => {
  it('finds numeric type mismatches', () => {
    const rows = [
      { distance_km: '100', fiber_count: '48' },
      { distance_km: 'abc', fiber_count: '24' },
      { distance_km: '200', fiber_count: 'xyz' },
    ];
    const mismatches = typeCheck(rows, { distance_km: 'number', fiber_count: 'integer' });
    expect(mismatches).toHaveLength(2);
    expect(mismatches[0]).toEqual({ rowIndex: 1, column: 'distance_km', value: 'abc', expectedType: 'number' });
    expect(mismatches[1]).toEqual({ rowIndex: 2, column: 'fiber_count', value: 'xyz', expectedType: 'integer' });
  });

  it('rejects floats for integer type', () => {
    const rows = [{ count: '3.5' }];
    const mismatches = typeCheck(rows, { count: 'integer' });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].expectedType).toBe('integer');
  });

  it('accepts floats for number type', () => {
    const rows = [{ distance: '3.5' }];
    const mismatches = typeCheck(rows, { distance: 'number' });
    expect(mismatches).toHaveLength(0);
  });

  it('skips empty values', () => {
    const rows = [{ distance: '', count: '  ' }];
    const mismatches = typeCheck(rows, { distance: 'number', count: 'integer' });
    expect(mismatches).toHaveLength(0);
  });

  it('returns empty array when no mismatches', () => {
    const rows = [{ a: '10', b: '20' }];
    const mismatches = typeCheck(rows, { a: 'number', b: 'integer' });
    expect(mismatches).toHaveLength(0);
  });
});

// ============================================================================
// clearTypeMismatches
// ============================================================================
describe('clearTypeMismatches', () => {
  it('clears values at mismatch positions', () => {
    const rows = [
      { distance: 'abc', name: 'Node-A' },
      { distance: '100', name: 'Node-B' },
    ];
    const mismatches = [{ rowIndex: 0, column: 'distance', value: 'abc', expectedType: 'number' as const }];
    const result = clearTypeMismatches(rows, mismatches);

    expect(result[0].distance).toBe('');
    expect(result[0].name).toBe('Node-A'); // untouched
    expect(result[1].distance).toBe('100'); // untouched
  });

  it('does not mutate original rows', () => {
    const rows = [{ val: 'bad' }];
    const mismatches = [{ rowIndex: 0, column: 'val', value: 'bad', expectedType: 'number' as const }];
    clearTypeMismatches(rows, mismatches);
    expect(rows[0].val).toBe('bad');
  });
});

// ============================================================================
// findAndReplace
// ============================================================================
describe('findAndReplace', () => {
  it('performs literal find and replace', () => {
    const rows = [{ name: 'OADM_Cairo_01' }, { name: 'OADM_Alex_01' }];
    const { rows: result, replacementCount } = findAndReplace(rows, '_', '-');
    expect(result[0].name).toBe('OADM-Cairo-01');
    expect(result[1].name).toBe('OADM-Alex-01');
    expect(replacementCount).toBe(2);
  });

  it('performs regex find and replace', () => {
    const rows = [{ name: 'Node123' }];
    const { rows: result } = findAndReplace(rows, '\\d+', 'X', { isRegex: true });
    expect(result[0].name).toBe('NodeX');
  });

  it('respects case-sensitive option', () => {
    const rows = [{ name: 'OADM oadm Oadm' }];
    const { rows: result, replacementCount } = findAndReplace(rows, 'OADM', 'X', { caseSensitive: true });
    expect(result[0].name).toBe('X oadm Oadm');
    expect(replacementCount).toBe(1);
  });

  it('scopes replacements to specified columns only', () => {
    const rows = [{ name: 'foo', type: 'foo' }];
    const { rows: result } = findAndReplace(rows, 'foo', 'bar', { columns: ['name'] });
    expect(result[0].name).toBe('bar');
    expect(result[0].type).toBe('foo'); // untouched
  });

  it('returns zero replacementCount when nothing matches', () => {
    const rows = [{ name: 'Hello' }];
    const { replacementCount } = findAndReplace(rows, 'zzz', 'x');
    expect(replacementCount).toBe(0);
  });
});

// ============================================================================
// convertCase
// ============================================================================
describe('convertCase', () => {
  it('converts to uppercase', () => {
    const rows = [{ name: 'hello world' }];
    const result = convertCase(rows, ['name'], 'upper');
    expect(result[0].name).toBe('HELLO WORLD');
  });

  it('converts to lowercase', () => {
    const rows = [{ name: 'HELLO WORLD' }];
    const result = convertCase(rows, ['name'], 'lower');
    expect(result[0].name).toBe('hello world');
  });

  it('converts to title case', () => {
    const rows = [{ name: 'hello world' }];
    const result = convertCase(rows, ['name'], 'title');
    expect(result[0].name).toBe('Hello World');
  });

  it('only affects specified columns', () => {
    const rows = [{ name: 'hello', type: 'hello' }];
    const result = convertCase(rows, ['name'], 'upper');
    expect(result[0].name).toBe('HELLO');
    expect(result[0].type).toBe('hello'); // untouched
  });

  it('skips empty values', () => {
    const rows = [{ name: '' }];
    const result = convertCase(rows, ['name'], 'upper');
    expect(result[0].name).toBe('');
  });
});

// ============================================================================
// stripUnits
// ============================================================================
describe('stripUnits', () => {
  it('strips unit suffix from numeric values', () => {
    const rows = [{ distance: '100 km', rate: '10Gbps' }];
    const result = stripUnits(rows, ['distance', 'rate']);
    expect(result[0].distance).toBe('100');
    expect(result[0].rate).toBe('10');
  });

  it('handles decimal values', () => {
    const rows = [{ distance: '3.5 km' }];
    const result = stripUnits(rows, ['distance']);
    expect(result[0].distance).toBe('3.5');
  });

  it('handles percentage units', () => {
    const rows = [{ loss: '0.25dB' }];
    const result = stripUnits(rows, ['loss']);
    expect(result[0].loss).toBe('0.25');
  });

  it('leaves pure numeric values unchanged', () => {
    const rows = [{ distance: '100' }];
    const result = stripUnits(rows, ['distance']);
    expect(result[0].distance).toBe('100');
  });

  it('leaves empty values unchanged', () => {
    const rows = [{ distance: '' }];
    const result = stripUnits(rows, ['distance']);
    expect(result[0].distance).toBe('');
  });

  it('does not affect columns not in the list', () => {
    const rows = [{ distance: '100 km', name: '100 km' }];
    const result = stripUnits(rows, ['distance']);
    expect(result[0].distance).toBe('100');
    expect(result[0].name).toBe('100 km'); // untouched
  });
});

// ============================================================================
// filterRows
// ============================================================================
describe('filterRows', () => {
  const rows = [
    { name: 'OADM-Cairo', type: 'oadm' },
    { name: 'Router-Alex', type: 'router' },
    { name: 'AMP-Nile', type: 'amplifier' },
  ];

  it('filters by equals mode', () => {
    const result = filterRows(rows, 'type', 'oadm', 'equals');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('OADM-Cairo');
  });

  it('filters by contains mode (case-insensitive)', () => {
    const result = filterRows(rows, 'name', 'alex', 'contains');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Router-Alex');
  });

  it('filters by regex mode', () => {
    const result = filterRows(rows, 'name', '^(OADM|AMP)', 'regex');
    expect(result).toHaveLength(2);
  });

  it('defaults to contains mode', () => {
    const result = filterRows(rows, 'name', 'cairo');
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no matches', () => {
    const result = filterRows(rows, 'name', 'NonExistent', 'equals');
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// removeDuplicates
// ============================================================================
describe('removeDuplicates', () => {
  it('removes duplicate rows based on all columns', () => {
    const rows = [
      { name: 'Node-A', type: 'oadm' },
      { name: 'Node-A', type: 'oadm' },
      { name: 'Node-B', type: 'router' },
    ];
    const result = removeDuplicates(rows);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Node-A');
    expect(result[1].name).toBe('Node-B');
  });

  it('removes duplicates based on specified key columns', () => {
    const rows = [
      { name: 'Node-A', type: 'oadm', vendor: 'huawei' },
      { name: 'Node-A', type: 'oadm', vendor: 'cisco' },
      { name: 'Node-B', type: 'router', vendor: 'huawei' },
    ];
    // Dedup by name+type only — the two Node-A rows are duplicates
    const result = removeDuplicates(rows, ['name', 'type']);
    expect(result).toHaveLength(2);
  });

  it('keeps first occurrence and removes later duplicates', () => {
    const rows = [
      { name: 'A', val: 'first' },
      { name: 'A', val: 'second' },
    ];
    const result = removeDuplicates(rows, ['name']);
    expect(result).toHaveLength(1);
    expect(result[0].val).toBe('first');
  });

  it('returns all rows when there are no duplicates', () => {
    const rows = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    const result = removeDuplicates(rows);
    expect(result).toHaveLength(3);
  });
});

// ============================================================================
// removeEmptyRows
// ============================================================================
describe('removeEmptyRows', () => {
  it('removes rows where all values are empty', () => {
    const rows = [
      { name: 'Node-A', type: 'oadm' },
      { name: '', type: '' },
      { name: 'Node-B', type: '' },
    ];
    const result = removeEmptyRows(rows);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Node-A');
    expect(result[1].name).toBe('Node-B');
  });

  it('treats whitespace-only values as empty', () => {
    const rows = [
      { name: '   ', type: '  ' },
      { name: 'Node-A', type: '' },
    ];
    const result = removeEmptyRows(rows);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Node-A');
  });

  it('returns all rows when none are empty', () => {
    const rows = [{ name: 'A' }, { name: 'B' }];
    const result = removeEmptyRows(rows);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when all rows are empty', () => {
    const rows = [{ name: '', type: '' }, { name: '', type: '' }];
    const result = removeEmptyRows(rows);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// sortRows
// ============================================================================
describe('sortRows', () => {
  it('sorts numerically in ascending order', () => {
    const rows = [
      { name: 'C', distance: '300' },
      { name: 'A', distance: '100' },
      { name: 'B', distance: '200' },
    ];
    const result = sortRows(rows, 'distance', 'asc');
    expect(result.map((r) => r.name)).toEqual(['A', 'B', 'C']);
  });

  it('sorts numerically in descending order', () => {
    const rows = [
      { name: 'A', distance: '100' },
      { name: 'B', distance: '200' },
      { name: 'C', distance: '300' },
    ];
    const result = sortRows(rows, 'distance', 'desc');
    expect(result.map((r) => r.name)).toEqual(['C', 'B', 'A']);
  });

  it('sorts strings alphabetically', () => {
    const rows = [
      { name: 'Charlie', type: 'oadm' },
      { name: 'Alpha', type: 'router' },
      { name: 'Bravo', type: 'amplifier' },
    ];
    const result = sortRows(rows, 'name', 'asc');
    expect(result.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts strings in descending order', () => {
    const rows = [
      { name: 'Alpha' },
      { name: 'Charlie' },
      { name: 'Bravo' },
    ];
    const result = sortRows(rows, 'name', 'desc');
    expect(result.map((r) => r.name)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('defaults to ascending order', () => {
    const rows = [{ val: '3' }, { val: '1' }, { val: '2' }];
    const result = sortRows(rows, 'val');
    expect(result.map((r) => r.val)).toEqual(['1', '2', '3']);
  });

  it('does not mutate the original array', () => {
    const rows = [{ val: '3' }, { val: '1' }];
    sortRows(rows, 'val');
    expect(rows[0].val).toBe('3'); // original unchanged
  });
});
