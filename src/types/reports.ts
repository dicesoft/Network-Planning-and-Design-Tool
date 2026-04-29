/**
 * Report type definitions for the Network Reports module.
 */

import type { LucideIcon } from 'lucide-react';

/**
 * Report status indicating availability
 */
export type ReportStatus = 'available' | 'coming-soon';

/**
 * Report category for filtering
 */
export type ReportCategory =
  | 'network'
  | 'capacity'
  | 'service'
  | 'fiber'
  | 'analysis'
  | 'compliance';

/**
 * Report definition used by the Report Library grid
 */
export interface ReportDefinition {
  /** Unique identifier used in route (e.g., 'network-summary') */
  id: string;
  /** Display title */
  title: string;
  /** Short description shown on the card */
  description: string;
  /** lucide-react icon component */
  icon: LucideIcon;
  /** Category for filtering */
  category: ReportCategory;
  /** Whether the report is available or coming soon */
  status: ReportStatus;
}

/**
 * Report shell state for Configure -> Run -> Results flow
 */
export type ReportPhase = 'configure' | 'running' | 'results';

/**
 * Configuration parameter for a report
 */
export interface ReportParameter {
  id: string;
  label: string;
  type: 'text' | 'select' | 'date-range' | 'checkbox';
  disabled?: boolean;
  disabledTooltip?: string;
  defaultValue?: string | boolean;
  options?: { label: string; value: string }[];
}

/**
 * Export format options
 */
export type ExportFormat = 'pdf' | 'csv' | 'json';
