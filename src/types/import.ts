/**
 * Import Types — CSV Import Tool
 *
 * Standardized types for importing network topology data from external NMS platforms.
 * Designed for extensibility: Huawei NCE first, others (Nokia NSP, Cisco EPNM) later.
 */

import type { NetworkNode, NetworkEdge } from './network';
import type { Service } from './service';

/** Import source identifier for future extensibility */
export type ImportSource = 'huawei-nce' | 'nokia-nsp' | 'cisco-epnm' | 'generic-csv';

/** Import file type */
export type ImportFileType = 'nodes' | 'edges' | 'services' | 'ports';

/** Column mapping for CSV import */
export interface ColumnMapping {
  /** CSV column name (header) */
  csvColumn: string;
  /** Target field in the data model */
  targetField: string;
  /** Whether the column is required */
  required: boolean;
  /** Transform function name (e.g., 'toNodeType', 'toVendor') */
  transform?: string;
  /** Default value if CSV column is empty */
  defaultValue?: unknown;
}

/** Import template definition */
export interface ImportTemplate {
  id: string;
  source: ImportSource;
  fileType: ImportFileType;
  name: string;
  description: string;
  /** Expected CSV columns with mappings to internal types */
  columns: ColumnMapping[];
  /** Sample CSV headers for downloadable template */
  sampleHeaders: string[];
  /** Sample data rows for downloadable template */
  sampleRows: string[][];
}

/** Validation result for a single row */
export interface ImportRowValidation {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Sanitized data ready for import */
  data?: Partial<NetworkNode> | Partial<NetworkEdge> | Partial<Service>;
}

/** Full import validation result */
export interface ImportValidationResult {
  source: ImportSource;
  fileType: ImportFileType;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rowResults: ImportRowValidation[];
  warnings: string[];
}

/** Import session tracking */
export interface ImportSession {
  id: string;
  source: ImportSource;
  startedAt: string;
  files: {
    fileType: ImportFileType;
    fileName: string;
    rowCount: number;
    validCount: number;
  }[];
  status: 'validating' | 'ready' | 'importing' | 'completed' | 'failed';
}
