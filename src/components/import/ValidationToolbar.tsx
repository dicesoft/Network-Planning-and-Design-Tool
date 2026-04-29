/**
 * ValidationToolbar — Collapsible data quality tools for the import wizard validation step.
 *
 * Sections: Type Check, Find & Replace, Case Conversion, Filter & Clean, Sort.
 * Each transform modifies in-memory CSV data and triggers re-validation.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Search,
  ArrowUpDown,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Type,
  Hash,
  Trash2,
  Copy,
  Wrench,
} from 'lucide-react';
import { parseCsv } from '@/core/import/CsvParser';
import {
  typeCheck,
  clearTypeMismatches,
  findAndReplace,
  convertCase,
  stripUnits,
  removeDuplicates,
  removeEmptyRows,
  sortRows,
  type TypeMismatch,
  type CaseMode,
} from '@/core/import/ImportDataTransforms';

interface CsvData {
  label: string;
  csv: string;
  onChange: (csv: string) => void;
}

interface ValidationToolbarProps {
  csvSources: CsvData[];
  /** Called after transforms modify CSV data. Receives a map of label -> updated CSV content
   *  so the parent can re-run validation with the fresh values (not stale closure state). */
  onRevalidate: (updatedCsvs: Record<string, string>) => void;
}

/** Known column type expectations for type checking */
const KNOWN_COLUMN_TYPES: Record<string, 'number' | 'integer' | 'string'> = {
  distance_km: 'number',
  fiber_count: 'integer',
  latitude: 'number',
  longitude: 'number',
  channels: 'integer',
  channel_number: 'integer',
  span_length: 'number',
  attenuation: 'number',
  capacity: 'number',
};

/** Rebuild a CSV string from parsed rows */
function rebuildCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const val = row[h] || '';
          return val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        })
        .join(','),
    );
  }
  return lines.join('\n');
}

/** Collapsible section wrapper */
const ToolSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: React.ReactNode;
}> = ({ title, icon, expanded, onToggle, children, badge }) => (
  <div className="rounded-md border border-border">
    <button
      type="button"
      onClick={onToggle}
      className="hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-text-primary transition-colors"
    >
      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      {icon}
      <span>{title}</span>
      {badge}
    </button>
    {expanded && <div className="space-y-2 px-3 pb-3">{children}</div>}
  </div>
);

/** Get all column names across all CSV sources */
function getAllColumns(csvSources: CsvData[]): string[] {
  const cols = new Set<string>();
  for (const src of csvSources) {
    if (!src.csv) continue;
    const { headers } = parseCsv(src.csv);
    for (const h of headers) cols.add(h);
  }
  return Array.from(cols).sort();
}

export const ValidationToolbar: React.FC<ValidationToolbarProps> = ({
  csvSources,
  onRevalidate,
}) => {
  // Section expand states — all collapsed by default
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Type check state
  const [typeMismatches, setTypeMismatches] = useState<{ label: string; mismatches: TypeMismatch[] }[]>([]);
  const [typeCheckScanned, setTypeCheckScanned] = useState(false);

  // Find & replace state
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [findReplaceColumn, setFindReplaceColumn] = useState('');
  const [matchPreview, setMatchPreview] = useState<number | null>(null);

  // Case conversion state
  const [caseMode, setCaseMode] = useState<CaseMode>('upper');
  const [caseColumns, setCaseColumns] = useState<Set<string>>(new Set());

  // Sort state
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [sortSource, setSortSource] = useState('');

  const allColumns = useMemo(() => getAllColumns(csvSources), [csvSources]);

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ---- Type Check ----
  const handleTypeCheckScan = useCallback(() => {
    const results: { label: string; mismatches: TypeMismatch[] }[] = [];
    for (const src of csvSources) {
      if (!src.csv) continue;
      const { rows } = parseCsv(src.csv);
      const mismatches = typeCheck(rows, KNOWN_COLUMN_TYPES);
      if (mismatches.length > 0) {
        results.push({ label: src.label, mismatches });
      }
    }
    setTypeMismatches(results);
    setTypeCheckScanned(true);
  }, [csvSources]);

  const handleClearInvalid = useCallback(() => {
    const updated: Record<string, string> = {};
    for (const src of csvSources) {
      if (!src.csv) continue;
      const entry = typeMismatches.find((e) => e.label === src.label);
      if (!entry || entry.mismatches.length === 0) {
        updated[src.label] = src.csv;
        continue;
      }
      const { rows } = parseCsv(src.csv);
      const cleaned = clearTypeMismatches(rows, entry.mismatches);
      const newCsv = rebuildCsv(cleaned);
      src.onChange(newCsv);
      updated[src.label] = newCsv;
    }
    if (Object.keys(updated).length > 0) {
      setTypeMismatches([]);
      onRevalidate(updated);
    }
  }, [csvSources, typeMismatches, onRevalidate]);

  const totalMismatches = useMemo(
    () => typeMismatches.reduce((sum, e) => sum + e.mismatches.length, 0),
    [typeMismatches],
  );

  // ---- Find & Replace ----
  const handleFindPreview = useCallback(() => {
    if (!findText) { setMatchPreview(null); return; }
    let count = 0;
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const pattern = isRegex
        ? new RegExp(findText, flags)
        : new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      for (const src of csvSources) {
        if (!src.csv) continue;
        const { rows } = parseCsv(src.csv);
        for (const row of rows) {
          for (const [key, val] of Object.entries(row)) {
            if (findReplaceColumn && key !== findReplaceColumn) continue;
            if (pattern.test(val)) count++;
            pattern.lastIndex = 0; // reset global regex
          }
        }
      }
    } catch {
      // Invalid regex
      count = 0;
    }
    setMatchPreview(count);
  }, [findText, isRegex, caseSensitive, findReplaceColumn, csvSources]);

  const handleReplaceAll = useCallback(() => {
    if (!findText) return;
    let anyChanged = false;
    const updated: Record<string, string> = {};
    const columns = findReplaceColumn ? [findReplaceColumn] : undefined;
    for (const src of csvSources) {
      if (!src.csv) continue;
      const { rows } = parseCsv(src.csv);
      const { rows: newRows, replacementCount } = findAndReplace(rows, findText, replaceText, {
        isRegex,
        caseSensitive,
        columns,
      });
      if (replacementCount > 0) {
        const newCsv = rebuildCsv(newRows);
        src.onChange(newCsv);
        updated[src.label] = newCsv;
        anyChanged = true;
      } else {
        updated[src.label] = src.csv;
      }
    }
    if (anyChanged) {
      setMatchPreview(null);
      setFindText('');
      setReplaceText('');
      onRevalidate(updated);
    }
  }, [findText, replaceText, isRegex, caseSensitive, findReplaceColumn, csvSources, onRevalidate]);

  // ---- Case Conversion ----
  const handleConvertCase = useCallback(() => {
    if (caseColumns.size === 0) return;
    let anyChanged = false;
    const updated: Record<string, string> = {};
    const cols = Array.from(caseColumns);
    for (const src of csvSources) {
      if (!src.csv) continue;
      const { rows } = parseCsv(src.csv);
      const converted = convertCase(rows, cols, caseMode);
      const newCsv = rebuildCsv(converted);
      updated[src.label] = newCsv;
      if (newCsv !== src.csv) {
        src.onChange(newCsv);
        anyChanged = true;
      }
    }
    if (anyChanged) onRevalidate(updated);
  }, [caseMode, caseColumns, csvSources, onRevalidate]);

  // ---- Strip Units ----
  const handleStripUnits = useCallback(() => {
    const numericCols = allColumns.filter((c) => KNOWN_COLUMN_TYPES[c] === 'number' || KNOWN_COLUMN_TYPES[c] === 'integer');
    if (numericCols.length === 0) return;
    let anyChanged = false;
    const updated: Record<string, string> = {};
    for (const src of csvSources) {
      if (!src.csv) continue;
      const { rows } = parseCsv(src.csv);
      const stripped = stripUnits(rows, numericCols);
      const newCsv = rebuildCsv(stripped);
      updated[src.label] = newCsv;
      if (newCsv !== src.csv) {
        src.onChange(newCsv);
        anyChanged = true;
      }
    }
    if (anyChanged) onRevalidate(updated);
  }, [allColumns, csvSources, onRevalidate]);

  // ---- Filter & Clean ----
  const duplicateCounts = useMemo(() => {
    let total = 0;
    for (const src of csvSources) {
      if (!src.csv) continue;
      const { rows } = parseCsv(src.csv);
      const deduped = removeDuplicates(rows);
      total += rows.length - deduped.length;
    }
    return total;
  }, [csvSources]);

  const emptyRowCounts = useMemo(() => {
    let total = 0;
    for (const src of csvSources) {
      if (!src.csv) continue;
      const { rows } = parseCsv(src.csv);
      const cleaned = removeEmptyRows(rows);
      total += rows.length - cleaned.length;
    }
    return total;
  }, [csvSources]);

  const handleRemoveDuplicates = useCallback(() => {
    let anyChanged = false;
    const updated: Record<string, string> = {};
    for (const src of csvSources) {
      if (!src.csv) continue;
      const { rows } = parseCsv(src.csv);
      const deduped = removeDuplicates(rows);
      if (deduped.length < rows.length) {
        const newCsv = rebuildCsv(deduped);
        src.onChange(newCsv);
        updated[src.label] = newCsv;
        anyChanged = true;
      } else {
        updated[src.label] = src.csv;
      }
    }
    if (anyChanged) onRevalidate(updated);
  }, [csvSources, onRevalidate]);

  const handleRemoveEmptyRows = useCallback(() => {
    let anyChanged = false;
    const updated: Record<string, string> = {};
    for (const src of csvSources) {
      if (!src.csv) continue;
      const { rows } = parseCsv(src.csv);
      const cleaned = removeEmptyRows(rows);
      if (cleaned.length < rows.length) {
        const newCsv = rebuildCsv(cleaned);
        src.onChange(newCsv);
        updated[src.label] = newCsv;
        anyChanged = true;
      } else {
        updated[src.label] = src.csv;
      }
    }
    if (anyChanged) onRevalidate(updated);
  }, [csvSources, onRevalidate]);

  // ---- Sort ----
  const handleSort = useCallback(() => {
    if (!sortColumn || !sortSource) return;
    const src = csvSources.find((s) => s.label === sortSource);
    if (!src || !src.csv) return;
    const { rows } = parseCsv(src.csv);
    const sorted = sortRows(rows, sortColumn, sortDirection);
    const newCsv = rebuildCsv(sorted);
    src.onChange(newCsv);
    const updated: Record<string, string> = {};
    for (const s of csvSources) {
      updated[s.label] = s.label === sortSource ? newCsv : s.csv;
    }
    onRevalidate(updated);
  }, [sortColumn, sortDirection, sortSource, csvSources, onRevalidate]);

  // Toggle case column selection
  const toggleCaseColumn = useCallback((col: string) => {
    setCaseColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }, []);

  const activeSources = csvSources.filter((s) => s.csv);
  if (activeSources.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-text-secondary" />
        <h4 className="text-sm font-medium text-text-primary">Data Tools</h4>
      </div>

      {/* Type Check */}
      <ToolSection
        title="Type Check"
        icon={<Hash className="h-3.5 w-3.5 text-text-secondary" />}
        expanded={expandedSections.has('typecheck')}
        onToggle={() => toggleSection('typecheck')}
        badge={
          totalMismatches > 0 ? (
            <span className="bg-destructive/20 text-destructive ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium">
              {totalMismatches}
            </span>
          ) : null
        }
      >
        <p className="text-[11px] text-text-secondary">
          Scan numeric columns for non-numeric values (distance_km, fiber_count, latitude, longitude, etc.)
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleTypeCheckScan} data-testid="typecheck-scan">
            <AlertCircle className="mr-1 h-3.5 w-3.5" />
            Scan
          </Button>
          {totalMismatches > 0 && (
            <Button variant="outline" size="sm" onClick={handleClearInvalid} data-testid="typecheck-clear">
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear Invalid ({totalMismatches})
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleStripUnits} data-testid="typecheck-strip-units">
            Strip Units
          </Button>
        </div>
        {typeMismatches.length > 0 && (
          <div className="bg-destructive/5 max-h-32 space-y-1 overflow-y-auto rounded-md p-2">
            {typeMismatches.map((entry) =>
              entry.mismatches.map((m, i) => (
                <p key={`${entry.label}-${i}`} className="text-destructive font-mono text-[11px]">
                  [{entry.label}] Row {m.rowIndex + 1}, {m.column}: &quot;{m.value}&quot; (expected {m.expectedType})
                </p>
              )),
            )}
          </div>
        )}
        {typeCheckScanned && typeMismatches.length === 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>No type mismatches found</span>
          </div>
        )}
      </ToolSection>

      {/* Find & Replace */}
      <ToolSection
        title="Find & Replace"
        icon={<Search className="h-3.5 w-3.5 text-text-secondary" />}
        expanded={expandedSections.has('findreplace')}
        onToggle={() => toggleSection('findreplace')}
      >
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Find..."
            value={findText}
            onChange={(e) => { setFindText(e.target.value); setMatchPreview(null); }}
            className="bg-surface rounded border border-border px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
            data-testid="find-input"
          />
          <input
            type="text"
            placeholder="Replace with..."
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            className="bg-surface rounded border border-border px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
            data-testid="replace-input"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-text-secondary">
            <input
              type="checkbox"
              checked={isRegex}
              onChange={(e) => { setIsRegex(e.target.checked); setMatchPreview(null); }}
              className="rounded border-border"
            />
            Regex
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-text-secondary">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => { setCaseSensitive(e.target.checked); setMatchPreview(null); }}
              className="rounded border-border"
            />
            Case Sensitive
          </label>
          <select
            value={findReplaceColumn}
            onChange={(e) => { setFindReplaceColumn(e.target.value); setMatchPreview(null); }}
            className="bg-surface rounded border border-border px-1.5 py-1 text-[11px] text-text-primary"
          >
            <option value="">All columns</option>
            {allColumns.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleFindPreview} disabled={!findText} data-testid="find-preview">
            Preview
          </Button>
          <Button variant="outline" size="sm" onClick={handleReplaceAll} disabled={!findText} data-testid="find-replace-all">
            Replace All
          </Button>
          {matchPreview !== null && (
            <span className="text-[11px] text-text-secondary">
              {matchPreview} cell{matchPreview !== 1 ? 's' : ''} match
            </span>
          )}
        </div>
      </ToolSection>

      {/* Case Conversion */}
      <ToolSection
        title="Case Conversion"
        icon={<Type className="h-3.5 w-3.5 text-text-secondary" />}
        expanded={expandedSections.has('case')}
        onToggle={() => toggleSection('case')}
      >
        <div className="flex items-center gap-2">
          <select
            value={caseMode}
            onChange={(e) => setCaseMode(e.target.value as CaseMode)}
            className="bg-surface rounded border border-border px-2 py-1.5 text-xs text-text-primary"
            data-testid="case-mode-select"
          >
            <option value="upper">UPPER CASE</option>
            <option value="lower">lower case</option>
            <option value="title">Title Case</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleConvertCase}
            disabled={caseColumns.size === 0}
            data-testid="case-convert"
          >
            <Type className="mr-1 h-3.5 w-3.5" />
            Convert
          </Button>
        </div>
        {caseColumns.size === 0 && (
          <p className="text-[11px] text-text-muted">Select columns below, then click Convert</p>
        )}
        <div className="flex flex-wrap gap-1">
          {allColumns.map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => toggleCaseColumn(col)}
              className={cn(
                'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                caseColumns.has(col)
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-muted hover:text-text-secondary',
              )}
            >
              {col}
            </button>
          ))}
        </div>
      </ToolSection>

      {/* Filter & Clean */}
      <ToolSection
        title="Filter & Clean"
        icon={<Trash2 className="h-3.5 w-3.5 text-text-secondary" />}
        expanded={expandedSections.has('clean')}
        onToggle={() => toggleSection('clean')}
        badge={
          (duplicateCounts + emptyRowCounts) > 0 ? (
            <span className="bg-warning/20 ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium text-warning">
              {duplicateCounts + emptyRowCounts}
            </span>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemoveDuplicates}
            disabled={duplicateCounts === 0}
            data-testid="clean-duplicates"
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            Remove Duplicates
            {duplicateCounts > 0 && (
              <span className="bg-warning/20 ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-warning">
                {duplicateCounts}
              </span>
            )}
          </Button>
          {duplicateCounts === 0 && (
            <span className="flex items-center gap-1 text-[11px] text-success">
              <CheckCircle2 className="h-3 w-3" />
              No duplicates found
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemoveEmptyRows}
            disabled={emptyRowCounts === 0}
            data-testid="clean-empty-rows"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Remove Empty Rows
            {emptyRowCounts > 0 && (
              <span className="bg-warning/20 ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-warning">
                {emptyRowCounts}
              </span>
            )}
          </Button>
          {emptyRowCounts === 0 && (
            <span className="flex items-center gap-1 text-[11px] text-success">
              <CheckCircle2 className="h-3 w-3" />
              No empty rows found
            </span>
          )}
        </div>
      </ToolSection>

      {/* Sort */}
      <ToolSection
        title="Sort"
        icon={<ArrowUpDown className="h-3.5 w-3.5 text-text-secondary" />}
        expanded={expandedSections.has('sort')}
        onToggle={() => toggleSection('sort')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortSource}
            onChange={(e) => setSortSource(e.target.value)}
            className="bg-surface rounded border border-border px-2 py-1.5 text-xs text-text-primary"
            data-testid="sort-source-select"
          >
            <option value="">Select CSV...</option>
            {activeSources.map((s) => (
              <option key={s.label} value={s.label}>{s.label}</option>
            ))}
          </select>
          <select
            value={sortColumn}
            onChange={(e) => setSortColumn(e.target.value)}
            className="bg-surface rounded border border-border px-2 py-1.5 text-xs text-text-primary"
            data-testid="sort-column-select"
          >
            <option value="">Select column...</option>
            {allColumns.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Button
            variant={sortDirection === 'asc' ? 'outline' : 'default'}
            size="sm"
            onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="h-7 px-2"
            data-testid="sort-direction-toggle"
          >
            {sortDirection === 'asc' ? 'A-Z' : 'Z-A'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSort}
            disabled={!sortColumn || !sortSource}
            data-testid="sort-apply"
          >
            <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
            Sort
          </Button>
        </div>
      </ToolSection>
    </div>
  );
};
