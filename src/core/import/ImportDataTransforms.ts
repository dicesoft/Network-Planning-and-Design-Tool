/**
 * Import Data Transforms — Built-in CSV data transforms for the import wizard.
 *
 * Each transform modifies in-memory CSV row data before re-running the import pipeline.
 */

/**
 * Trim leading/trailing whitespace from all cell values.
 */
export function trimWhitespace(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((row) => {
    const trimmed: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      trimmed[key] = value.trim();
    }
    return trimmed;
  });
}

/** Columns that contain node name references */
const NODE_NAME_COLUMNS = [
  'node_name',
  'source_node',
  'target_node',
  'destination_node',
  'working_path_nodes',
  'protection_path_nodes',
];

/**
 * Normalize delimiters in node name columns.
 * Converts underscores, dots, and spaces to hyphens.
 */
export function normalizeDelimiters(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((row) => {
    const result: Record<string, string> = { ...row };
    for (const col of NODE_NAME_COLUMNS) {
      if (result[col]) {
        // For path columns (semicolon-separated), normalize each name individually
        if (col === 'working_path_nodes' || col === 'protection_path_nodes') {
          result[col] = result[col]
            .split(';')
            .map((name) =>
              name
                .trim()
                .replace(/[_.\s]+/g, '-')
                .replace(/-{2,}/g, '-')
                .replace(/^-|-$/g, ''),
            )
            .join(';');
        } else {
          result[col] = result[col]
            .trim()
            .replace(/[_.\s]+/g, '-')
            .replace(/-{2,}/g, '-')
            .replace(/^-|-$/g, '');
        }
      }
    }
    return result;
  });
}

/**
 * Apply fuzzy remappings to specific columns in CSV rows.
 * Replaces unmatched values with accepted suggestions.
 *
 * @param rows - CSV rows to modify
 * @param remappings - Map of original value -> replacement value
 * @param columns - Columns to apply remappings to
 */
export function applyFuzzyRemapping(
  rows: Record<string, string>[],
  remappings: Map<string, string>,
  columns: string[] = NODE_NAME_COLUMNS,
): Record<string, string>[] {
  return rows.map((row) => {
    const result: Record<string, string> = { ...row };
    for (const col of columns) {
      if (!result[col]) continue;

      // For path columns (semicolon-separated), remap each name individually
      if (col === 'working_path_nodes' || col === 'protection_path_nodes') {
        result[col] = result[col]
          .split(';')
          .map((name) => {
            const trimmedName = name.trim();
            return remappings.get(trimmedName) ?? trimmedName;
          })
          .join(';');
      } else {
        const trimmedValue = result[col].trim();
        if (remappings.has(trimmedValue)) {
          result[col] = remappings.get(trimmedValue)!;
        }
      }
    }
    return result;
  });
}

// ============================================================================
// Validation Data Tools
// ============================================================================

/**
 * Type mismatch descriptor for cells that don't match expected column types.
 */
export interface TypeMismatch {
  rowIndex: number;
  column: string;
  value: string;
  expectedType: 'number' | 'integer' | 'string';
}

/**
 * Type check: find cells that don't match expected column types.
 * Returns array of { row, column, value, expected } for mismatches.
 */
export function typeCheck(
  rows: Record<string, string>[],
  columnTypes: Record<string, 'number' | 'integer' | 'string'>,
): TypeMismatch[] {
  const mismatches: TypeMismatch[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (const [col, expectedType] of Object.entries(columnTypes)) {
      const val = rows[i][col];
      if (!val || val.trim() === '') continue;
      if (expectedType === 'number' && isNaN(parseFloat(val))) {
        mismatches.push({ rowIndex: i, column: col, value: val, expectedType });
      } else if (expectedType === 'integer' && (!Number.isInteger(Number(val)) || isNaN(Number(val)))) {
        mismatches.push({ rowIndex: i, column: col, value: val, expectedType });
      }
    }
  }
  return mismatches;
}

/**
 * Clear invalid values from type-mismatched cells.
 */
export function clearTypeMismatches(
  rows: Record<string, string>[],
  mismatches: TypeMismatch[],
): Record<string, string>[] {
  const result = rows.map((r) => ({ ...r }));
  for (const m of mismatches) {
    result[m.rowIndex][m.column] = '';
  }
  return result;
}

/**
 * Find & Replace across all cells in rows.
 * Supports regex when isRegex is true.
 */
export function findAndReplace(
  rows: Record<string, string>[],
  find: string,
  replace: string,
  options: { isRegex?: boolean; caseSensitive?: boolean; columns?: string[] } = {},
): { rows: Record<string, string>[]; replacementCount: number } {
  const { isRegex = false, caseSensitive = false, columns } = options;
  let count = 0;
  const flags = caseSensitive ? 'g' : 'gi';
  const pattern = isRegex
    ? new RegExp(find, flags)
    : new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

  const result = rows.map((row) => {
    const newRow: Record<string, string> = { ...row };
    for (const [key, val] of Object.entries(newRow)) {
      if (columns && !columns.includes(key)) continue;
      const newVal = val.replace(pattern, replace);
      if (newVal !== val) {
        count++;
        newRow[key] = newVal;
      }
    }
    return newRow;
  });
  return { rows: result, replacementCount: count };
}

/**
 * Case conversion modes.
 */
export type CaseMode = 'upper' | 'lower' | 'title';

/**
 * Case conversion for specific columns.
 */
export function convertCase(
  rows: Record<string, string>[],
  columns: string[],
  mode: CaseMode,
): Record<string, string>[] {
  return rows.map((row) => {
    const newRow: Record<string, string> = { ...row };
    for (const col of columns) {
      if (!newRow[col]) continue;
      switch (mode) {
        case 'upper': newRow[col] = newRow[col].toUpperCase(); break;
        case 'lower': newRow[col] = newRow[col].toLowerCase(); break;
        case 'title': newRow[col] = newRow[col].replace(/\b\w/g, (c) => c.toUpperCase()); break;
      }
    }
    return newRow;
  });
}

/**
 * Strip units from numeric columns (e.g., "100 km" -> "100", "10Gbps" -> "10").
 */
export function stripUnits(
  rows: Record<string, string>[],
  columns: string[],
): Record<string, string>[] {
  return rows.map((row) => {
    const newRow: Record<string, string> = { ...row };
    for (const col of columns) {
      if (!newRow[col]) continue;
      const match = newRow[col].match(/^([0-9]*\.?[0-9]+)\s*[a-zA-Z%]+/);
      if (match) {
        newRow[col] = match[1];
      }
    }
    return newRow;
  });
}

/**
 * Filter rows by column value.
 */
export function filterRows(
  rows: Record<string, string>[],
  column: string,
  pattern: string,
  mode: 'equals' | 'contains' | 'regex' = 'contains',
): Record<string, string>[] {
  return rows.filter((row) => {
    const val = row[column] || '';
    switch (mode) {
      case 'equals': return val === pattern;
      case 'contains': return val.toLowerCase().includes(pattern.toLowerCase());
      case 'regex': return new RegExp(pattern, 'i').test(val);
      default: return true;
    }
  });
}

/**
 * Remove duplicate rows (based on all columns or specified key columns).
 */
export function removeDuplicates(
  rows: Record<string, string>[],
  keyColumns?: string[],
): Record<string, string>[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = keyColumns
      ? keyColumns.map((c) => row[c] || '').join('|')
      : Object.values(row).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Remove rows where all values are empty.
 */
export function removeEmptyRows(
  rows: Record<string, string>[],
): Record<string, string>[] {
  return rows.filter((row) =>
    Object.values(row).some((v) => v.trim() !== ''),
  );
}

/**
 * Sort rows by a column.
 */
export function sortRows(
  rows: Record<string, string>[],
  column: string,
  direction: 'asc' | 'desc' = 'asc',
): Record<string, string>[] {
  const sorted = [...rows].sort((a, b) => {
    const va = a[column] || '';
    const vb = b[column] || '';
    // Try numeric comparison first
    const na = parseFloat(va);
    const nb = parseFloat(vb);
    if (!isNaN(na) && !isNaN(nb)) {
      return direction === 'asc' ? na - nb : nb - na;
    }
    // Fall back to string comparison
    return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });
  return sorted;
}
