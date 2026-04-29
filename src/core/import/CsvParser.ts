/**
 * CSV Parser — Lightweight CSV parsing with encoding detection and sanitization.
 *
 * Handles:
 * - UTF-8 BOM detection/stripping
 * - Quoted value handling (commas within quotes, escaped quotes)
 * - Empty row filtering
 * - Sanitization via existing sanitizeCsvValue()
 *
 * No external dependencies — simple state-machine parser (~50 lines core).
 */

import { sanitizeCsvValue } from '@/lib/csv-utils';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  rawRowCount: number;
}

/** UTF-8 BOM character */
const BOM = '\uFEFF';

/**
 * Strip UTF-8 BOM if present at the start of the string.
 */
function stripBom(content: string): string {
  return content.startsWith(BOM) ? content.slice(1) : content;
}

/**
 * Parse a single CSV line into fields, respecting quoted values.
 * Handles: commas within quotes, doubled quotes ("") as escapes.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  // Push the last field
  fields.push(current.trim());
  return fields;
}

/**
 * Parse CSV content into structured data.
 *
 * @param content - Raw CSV string content (UTF-8, with or without BOM)
 * @returns Parsed CSV with headers, rows as key-value records, and raw row count
 */
export function parseCsv(content: string): ParsedCsv {
  const cleaned = stripBom(content);

  // Normalize line endings (CRLF → LF, CR → LF)
  const normalized = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into lines, filter truly empty lines
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], rawRowCount: 0 };
  }

  // First non-empty line is headers
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rawRowCount = lines.length - 1; // Exclude header

  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);

    // Skip rows where all fields are empty
    if (fields.every((f) => f.trim() === '')) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const rawValue = j < fields.length ? fields[j] : '';
      // Sanitize each value to prevent formula injection
      row[headers[j]] = sanitizeCsvValue(rawValue);
    }
    rows.push(row);
  }

  return { headers, rows, rawRowCount };
}
