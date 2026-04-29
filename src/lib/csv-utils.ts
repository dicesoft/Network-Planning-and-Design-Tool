/**
 * CSV Utilities - Sanitization and Export Helpers
 *
 * Prevents CSV injection attacks by escaping dangerous leading characters
 * that spreadsheet applications may interpret as formulas.
 */

/**
 * Characters that are dangerous at the start of a CSV cell value.
 * Spreadsheet apps (Excel, Google Sheets, LibreOffice) interpret these
 * as formula initiators, enabling CSV injection attacks.
 */
const DANGEROUS_LEADING_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Sanitize a single CSV cell value to prevent formula injection.
 *
 * If the value starts with a dangerous character (=, +, -, @, tab, CR),
 * it is prefixed with a single quote to force text interpretation.
 *
 * @param value - The raw cell value
 * @returns The sanitized value safe for CSV output
 */
export function sanitizeCsvValue(value: string): string {
  if (value.length === 0) return value;
  if (DANGEROUS_LEADING_CHARS.has(value[0])) {
    return `'${value}`;
  }
  return value;
}

/**
 * Escape and sanitize a value for CSV output.
 * Combines injection sanitization with standard CSV escaping
 * (quoting values that contain commas, quotes, or newlines).
 *
 * @param value - The raw cell value (will be converted to string)
 * @returns A properly escaped and sanitized CSV cell
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value == null ? '' : String(value);
  const sanitized = sanitizeCsvValue(str);

  // Standard CSV escaping: wrap in quotes if contains special chars
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n') || sanitized.includes('\r')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Convert an array of cell values into a single CSV row string.
 *
 * @param values - Array of cell values
 * @returns A comma-separated row with each cell escaped and sanitized
 */
export function toCsvRow(values: (string | number | boolean | null | undefined)[]): string {
  return values.map(escapeCsvCell).join(',');
}

/**
 * Build a complete CSV string from headers and rows.
 *
 * @param headers - Column header names
 * @param rows - Array of row data (each row is an array of cell values)
 * @returns Complete CSV content string
 */
export function buildCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  return [toCsvRow(headers), ...rows.map(toCsvRow)].join('\n');
}

/**
 * Trigger a browser download of CSV content.
 *
 * @param csvContent - The CSV string content
 * @param filename - Download filename (should end in .csv)
 */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
