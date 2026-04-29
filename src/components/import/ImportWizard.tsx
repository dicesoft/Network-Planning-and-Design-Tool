/**
 * Import Wizard — 5-step wizard for importing network topology from CSV files.
 *
 * Steps:
 * 1. Upload — File drop zones for nodes, edges, services CSVs + template downloads
 * 2. Validate — Categorized validation results (errors blocking, warnings non-blocking)
 * 3. Preview — Table view of parsed data with ATLAS type mappings
 * 4. Mapping — Column-to-field mapping review with type mapping overrides
 * 5. Import — Progress bar, import summary, merge/replace for non-empty topology
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Table2,
  Settings2,
  Import,
  BookOpen,
  Wand2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { runImport, collectUnmatchedReferences, allocatePortsOnEdges, type ImportResult, type PortAllocationInfo } from '@/core/import/ImportEngine';
import { findFuzzyMatches, type FuzzyMatchSuggestion, type UnmatchedReference } from '@/core/import/FuzzyMatcher';
import { trimWhitespace, normalizeDelimiters, applyFuzzyRemapping } from '@/core/import/ImportDataTransforms';
import { parseCsv } from '@/core/import/CsvParser';
import { downloadTemplateCsv, downloadDefinitionsDocument } from '@/core/import/templates/huawei-nce';
import { ValidationToolbar } from './ValidationToolbar';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { suppressPersist, resumePersist, flushPendingWrites } from '@/lib/indexeddb-storage';
import { suppressCrossTabSync, resumeCrossTabSync } from '@/lib/cross-tab-sync';

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Upload',
  2: 'Validate',
  3: 'Preview',
  4: 'Mapping',
  5: 'Import',
};

const STEP_ICONS: Record<WizardStep, React.ReactNode> = {
  1: <Upload className="h-4 w-4" />,
  2: <AlertTriangle className="h-4 w-4" />,
  3: <Table2 className="h-4 w-4" />,
  4: <Settings2 className="h-4 w-4" />,
  5: <Import className="h-4 w-4" />,
};

type ImportMode = 'merge' | 'replace';

export const ImportWizard: React.FC<ImportWizardProps> = ({ open, onOpenChange }) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [nodesFile, setNodesFile] = useState<File | null>(null);
  const [edgesFile, setEdgesFile] = useState<File | null>(null);
  const [servicesFile, setServicesFile] = useState<File | null>(null);
  const [portsFile, setPortsFile] = useState<File | null>(null);
  const [nodesCsvContent, setNodesCsvContent] = useState('');
  const [edgesCsvContent, setEdgesCsvContent] = useState('');
  const [servicesCsvContent, setServicesCsvContent] = useState('');
  const [portsCsvContent, setPortsCsvContent] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [fuzzySuggestions, setFuzzySuggestions] = useState<FuzzyMatchSuggestion[]>([]);
  const [suggestionDecisions, setSuggestionDecisions] = useState<Map<string, 'pending' | 'accepted' | 'rejected'>>(new Map());
  const [autoAllocatePorts, setAutoAllocatePorts] = useState(false);
  const [portAllocations, setPortAllocations] = useState<PortAllocationInfo[]>([]);
  const [allocatedEdges, setAllocatedEdges] = useState<import('@/types/network').NetworkEdge[]>([]);
  const [allocatedNodes, setAllocatedNodes] = useState<import('@/types/network').NetworkNode[]>([]);

  const { topology, batchAppendNodes, batchAppendEdges, updateNode } = useNetworkStore((s) => ({
    topology: s.topology,
    batchAppendNodes: s.batchAppendNodes,
    batchAppendEdges: s.batchAppendEdges,
    updateNode: s.updateNode,
  }));

  // Check if topology already has nodes
  const hasExistingTopology = topology.nodes.length > 0 || topology.edges.length > 0;

  // Build existing node name → ID map for resolving references against topology
  const existingNodeNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of topology.nodes) {
      if (node.name) map.set(node.name.toLowerCase(), node.id);
    }
    return map;
  }, [topology.nodes]);

  const [skipInvalidRows, setSkipInvalidRows] = useState(false);

  const resetWizard = useCallback(() => {
    setStep(1);
    setNodesFile(null);
    setEdgesFile(null);
    setServicesFile(null);
    setPortsFile(null);
    setNodesCsvContent('');
    setEdgesCsvContent('');
    setServicesCsvContent('');
    setPortsCsvContent('');
    setImportResult(null);
    setImporting(false);
    setImportComplete(false);
    setImportMode('merge');
    setFuzzySuggestions([]);
    setSuggestionDecisions(new Map());
    setSkipInvalidRows(false);
    setAutoAllocatePorts(false);
    setPortAllocations([]);
    setAllocatedEdges([]);
    setAllocatedNodes([]);
  }, []);

  const handleClose = useCallback(() => {
    resetWizard();
    onOpenChange(false);
  }, [onOpenChange, resetWizard]);

  // File reading helper
  const readFile = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    });
  }, []);

  // Handle file drop/select for nodes
  const handleNodesFile = useCallback(async (file: File) => {
    setNodesFile(file);
    const content = await readFile(file);
    setNodesCsvContent(content);
  }, [readFile]);

  // Handle file drop/select for edges
  const handleEdgesFile = useCallback(async (file: File) => {
    setEdgesFile(file);
    const content = await readFile(file);
    setEdgesCsvContent(content);
  }, [readFile]);

  // Handle file drop/select for services
  const handleServicesFile = useCallback(async (file: File) => {
    setServicesFile(file);
    const content = await readFile(file);
    setServicesCsvContent(content);
  }, [readFile]);

  // Handle file drop/select for ports
  const handlePortsFile = useCallback(async (file: File) => {
    setPortsFile(file);
    const content = await readFile(file);
    setPortsCsvContent(content);
  }, [readFile]);

  // Step 1 → 2: Run validation
  const handleValidate = useCallback(() => {
    const result = runImport(nodesCsvContent, edgesCsvContent, 'huawei-nce', servicesCsvContent, existingNodeNameToId, portsCsvContent);
    setImportResult(result);
    setStep(2);
  }, [nodesCsvContent, edgesCsvContent, servicesCsvContent, existingNodeNameToId, portsCsvContent]);

  // Step 5: Execute import
  const handleImport = useCallback(async () => {
    if (!importResult) return;
    setImporting(true);

    try {
      if (importMode === 'replace') {
        // Suppress persist and cross-tab sync ONLY for clearTopology
        // to avoid intermediate empty state being written
        suppressPersist();
        suppressCrossTabSync();
        useNetworkStore.getState().clearTopology();
        useServiceStore.getState().clearAllServices();
        resumePersist();
        resumeCrossTabSync();
      }

      // Batch append nodes and edges WITH persist enabled
      // so Zustand persist middleware writes to storage normally
      if (importResult.nodes.length > 0) {
        batchAppendNodes(importResult.nodes);
      }

      // Use allocated edges if auto-allocation was enabled, otherwise use raw import edges
      const edgesToImport = autoAllocatePorts && allocatedEdges.length > 0
        ? allocatedEdges
        : importResult.edges;
      if (edgesToImport.length > 0) {
        batchAppendEdges(edgesToImport);
      }

      // Apply port updates to existing topology nodes (only when auto-allocating)
      if (autoAllocatePorts && allocatedNodes.length > 0) {
        for (const node of allocatedNodes) {
          // Only update existing topology nodes (not newly imported ones)
          const isExistingNode = !importResult.nodes.some((n) => n.id === node.id);
          if (isExistingNode) {
            updateNode(node.id, { ports: node.ports });
          }
        }
      }

      // Import services via serviceStore
      if (importResult.services.length > 0) {
        const serviceStore = useServiceStore.getState();
        for (const service of importResult.services) {
          try {
            // Strip auto-generated fields that addService will create
            const { id: _id, createdAt: _ca, modifiedAt: _ma, ...serviceData } = service as unknown as Record<string, unknown>;
            serviceStore.addService(serviceData as Parameters<typeof serviceStore.addService>[0]);
          } catch (err) {
            console.warn('[ImportWizard] Failed to import service:', service.name, err);
          }
        }
      }

      // Initialize history with a fresh keyframe of the imported state
      useNetworkStore.getState().initializeHistory();

      // Ensure data is flushed to storage (IndexedDB debounce is 300ms)
      await flushPendingWrites();

      setImportComplete(true);
    } catch (err) {
      console.error('[ImportWizard] Import failed:', err);
    }

    setImporting(false);
  }, [importResult, importMode, autoAllocatePorts, allocatedEdges, allocatedNodes, batchAppendNodes, batchAppendEdges, updateNode]);

  const canProceedFromStep1 = nodesFile !== null || edgesFile !== null || servicesFile !== null || portsFile !== null;
  const hasBlockingErrors = importResult && !skipInvalidRows
    ? importResult.nodeValidation.invalidRows > 0 || importResult.edgeValidation.invalidRows > 0 || importResult.serviceValidation.invalidRows > 0 || importResult.portValidation.invalidRows > 0
    : false;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0"
        data-testid="import-wizard"
      >
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle>Import Network Topology</DialogTitle>
          <DialogDescription>
            Import nodes and edges from Huawei NCE CSV exports
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="bg-secondary/30 flex shrink-0 items-center gap-2 border-b border-border px-6 py-3">
          {([1, 2, 3, 4, 5] as WizardStep[]).map((s) => (
            <div
              key={s}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
                s === step
                  ? 'bg-accent/10 text-accent'
                  : s < step
                    ? 'bg-accent/20 text-accent'
                    : 'bg-border text-text-muted'
              )}
            >
              {STEP_ICONS[s]}
              <span>{STEP_LABELS[s]}</span>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <UploadStep
              nodesFile={nodesFile}
              edgesFile={edgesFile}
              servicesFile={servicesFile}
              portsFile={portsFile}
              onNodesFile={handleNodesFile}
              onEdgesFile={handleEdgesFile}
              onServicesFile={handleServicesFile}
              onPortsFile={handlePortsFile}
            />
          )}
          {step === 2 && importResult && (
            <ValidateStep
              result={importResult}
              nodesCsvContent={nodesCsvContent}
              edgesCsvContent={edgesCsvContent}
              servicesCsvContent={servicesCsvContent}
              portsCsvContent={portsCsvContent}
              existingNodeNameToId={existingNodeNameToId}
              fuzzySuggestions={fuzzySuggestions}
              suggestionDecisions={suggestionDecisions}
              skipInvalidRows={skipInvalidRows}
              onSkipInvalidRowsChange={setSkipInvalidRows}
              onFuzzySuggestionsChange={setFuzzySuggestions}
              onSuggestionDecisionsChange={setSuggestionDecisions}
              onRevalidate={(result) => setImportResult(result)}
              onEdgesCsvChange={setEdgesCsvContent}
              onServicesCsvChange={setServicesCsvContent}
              onNodesCsvChange={setNodesCsvContent}
            />
          )}
          {step === 3 && importResult && (
            <PreviewStep result={importResult} />
          )}
          {step === 4 && importResult && (
            <MappingStep result={importResult} />
          )}
          {step === 5 && importResult && (
            <ImportStep
              result={importResult}
              importing={importing}
              importComplete={importComplete}
              importMode={importMode}
              onImportModeChange={setImportMode}
              hasExistingTopology={hasExistingTopology}
              onImport={handleImport}
              skipInvalidRows={skipInvalidRows}
              autoAllocatePorts={autoAllocatePorts}
              portAllocations={portAllocations}
              onAutoAllocatePortsChange={(enabled) => {
                setAutoAllocatePorts(enabled);
                if (enabled && importResult) {
                  const allNodes = [...importResult.nodes, ...topology.nodes];
                  const { updatedEdges, updatedNodes, allocations } = allocatePortsOnEdges(
                    importResult.edges,
                    allNodes,
                  );
                  setAllocatedEdges(updatedEdges);
                  setAllocatedNodes(updatedNodes);
                  setPortAllocations(allocations);
                } else {
                  setAllocatedEdges([]);
                  setAllocatedNodes([]);
                  setPortAllocations([]);
                }
              }}
            />
          )}
        </div>

        {/* Footer navigation */}
        <div className="bg-secondary/30 flex shrink-0 items-center justify-between border-t border-border px-6 py-4">
          {/* Step info */}
          <span className="text-sm text-text-secondary">
            Step {step} of 5: <span className="font-medium text-text-primary">{STEP_LABELS[step]}</span>
          </span>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleClose} disabled={importing}>
              Cancel
            </Button>
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep((s) => (s - 1) as WizardStep)}
                disabled={importing}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            )}

            {step < 5 && (
              <Button
                onClick={() => {
                  if (step === 1) handleValidate();
                  else setStep((s) => (s + 1) as WizardStep);
                }}
                disabled={step === 1 && !canProceedFromStep1}
              >
                {step === 1 ? 'Validate' : 'Next'}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}

            {step === 5 && !importComplete && (
              <Button
                onClick={handleImport}
                disabled={importing || hasBlockingErrors}
                data-testid="import-execute-btn"
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Import className="mr-1 h-4 w-4" />
                    Import
                  </>
                )}
              </Button>
            )}

            {step === 5 && importComplete && (
              <Button onClick={handleClose} data-testid="import-close-btn">
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// Step 1: Upload
// ============================================================================

interface UploadStepProps {
  nodesFile: File | null;
  edgesFile: File | null;
  servicesFile: File | null;
  portsFile: File | null;
  onNodesFile: (file: File) => void;
  onEdgesFile: (file: File) => void;
  onServicesFile: (file: File) => void;
  onPortsFile: (file: File) => void;
}

const UploadStep: React.FC<UploadStepProps> = ({
  nodesFile,
  edgesFile,
  servicesFile,
  portsFile,
  onNodesFile,
  onEdgesFile,
  onServicesFile,
  onPortsFile,
}) => {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Upload CSV Files</h3>
        <p className="text-xs text-text-secondary">
          Upload nodes, edges, services, and/or ports CSV files exported from Huawei NCE.
          Download templates below for the expected format.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FileDropZone
          label="Nodes CSV"
          file={nodesFile}
          onFile={onNodesFile}
          accept=".csv"
          testId="import-nodes-dropzone"
        />
        <FileDropZone
          label="Edges CSV"
          file={edgesFile}
          onFile={onEdgesFile}
          accept=".csv"
          testId="import-edges-dropzone"
        />
        <FileDropZone
          label="Services CSV"
          file={servicesFile}
          onFile={onServicesFile}
          accept=".csv"
          testId="import-services-dropzone"
        />
        <FileDropZone
          label="Ports CSV"
          file={portsFile}
          onFile={onPortsFile}
          accept=".csv"
          testId="import-ports-dropzone"
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Download Templates</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplateCsv('nodes')}
            data-testid="download-nodes-template"
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Nodes Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplateCsv('edges')}
            data-testid="download-edges-template"
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Edges Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplateCsv('services')}
            data-testid="download-services-template"
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Services Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplateCsv('ports')}
            data-testid="download-ports-template"
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Ports Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadDefinitionsDocument()}
            data-testid="download-definitions"
          >
            <BookOpen className="mr-1 h-3.5 w-3.5" />
            Definitions
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// File Drop Zone
// ============================================================================

interface FileDropZoneProps {
  label: string;
  file: File | null;
  onFile: (file: File) => void;
  accept: string;
  testId: string;
}

const FileDropZone: React.FC<FileDropZoneProps> = ({
  label,
  file,
  onFile,
  accept,
  testId,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && droppedFile.name.endsWith('.csv')) {
        onFile(droppedFile);
      }
    },
    [onFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        onFile(selectedFile);
      }
    },
    [onFile],
  );

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
        dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        file && 'border-success bg-success/5'
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      data-testid={testId}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileInput}
        className="hidden"
        data-testid={`${testId}-input`}
      />
      {file ? (
        <div className="space-y-1">
          <FileText className="mx-auto h-8 w-8 text-success" />
          <p className="text-sm font-medium">{file.name}</p>
          <p className="text-xs text-text-secondary">
            {(file.size / 1024).toFixed(1)} KB
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <Upload className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-text-secondary">
            Drop CSV file or click to browse
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Step 2: Validate
// ============================================================================

interface ValidateStepProps {
  result: ImportResult;
  nodesCsvContent: string;
  edgesCsvContent: string;
  servicesCsvContent: string;
  portsCsvContent: string;
  existingNodeNameToId: Map<string, string>;
  fuzzySuggestions: FuzzyMatchSuggestion[];
  suggestionDecisions: Map<string, 'pending' | 'accepted' | 'rejected'>;
  skipInvalidRows: boolean;
  onSkipInvalidRowsChange: (skip: boolean) => void;
  onFuzzySuggestionsChange: (suggestions: FuzzyMatchSuggestion[]) => void;
  onSuggestionDecisionsChange: (decisions: Map<string, 'pending' | 'accepted' | 'rejected'>) => void;
  onRevalidate: (result: ImportResult) => void;
  onEdgesCsvChange: (csv: string) => void;
  onServicesCsvChange: (csv: string) => void;
  onNodesCsvChange: (csv: string) => void;
}

const ValidateStep: React.FC<ValidateStepProps> = ({
  result,
  nodesCsvContent,
  edgesCsvContent,
  servicesCsvContent,
  portsCsvContent,
  existingNodeNameToId,
  fuzzySuggestions,
  suggestionDecisions,
  skipInvalidRows,
  onSkipInvalidRowsChange,
  onFuzzySuggestionsChange,
  onSuggestionDecisionsChange,
  onRevalidate,
  onEdgesCsvChange,
  onServicesCsvChange,
  onNodesCsvChange,
}) => {
  const { nodeValidation, edgeValidation, serviceValidation, portValidation } = result;
  const allErrors = [
    ...nodeValidation.rowResults.flatMap((r) => r.errors),
    ...edgeValidation.rowResults.flatMap((r) => r.errors),
    ...serviceValidation.rowResults.flatMap((r) => r.errors),
    ...portValidation.rowResults.flatMap((r) => r.errors),
  ];
  const allWarnings = [...nodeValidation.warnings, ...edgeValidation.warnings, ...serviceValidation.warnings, ...portValidation.warnings];

  const hasNotFoundErrors = allErrors.some((e) => e.includes('not found'));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ValidationSummaryCard
          label="Nodes"
          total={nodeValidation.totalRows}
          valid={nodeValidation.validRows}
          invalid={nodeValidation.invalidRows}
        />
        <ValidationSummaryCard
          label="Edges"
          total={edgeValidation.totalRows}
          valid={edgeValidation.validRows}
          invalid={edgeValidation.invalidRows}
        />
        <ValidationSummaryCard
          label="Services"
          total={serviceValidation.totalRows}
          valid={serviceValidation.validRows}
          invalid={serviceValidation.invalidRows}
        />
        <ValidationSummaryCard
          label="Ports"
          total={portValidation.totalRows}
          valid={portValidation.validRows}
          invalid={portValidation.invalidRows}
        />
      </div>

      {allErrors.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-destructive flex items-center gap-1 text-sm font-medium">
            <XCircle className="h-4 w-4" />
            Errors ({allErrors.length})
          </h4>
          <div className="bg-destructive/10 max-h-40 space-y-1 overflow-y-auto rounded-md p-3">
            {allErrors.map((err, i) => (
              <p key={i} className="text-destructive text-xs">{err}</p>
            ))}
          </div>
        </div>
      )}

      {hasNotFoundErrors && (
        <FuzzyMatchPanel
          result={result}
          nodesCsvContent={nodesCsvContent}
          edgesCsvContent={edgesCsvContent}
          servicesCsvContent={servicesCsvContent}
          portsCsvContent={portsCsvContent}
          existingNodeNameToId={existingNodeNameToId}
          suggestions={fuzzySuggestions}
          suggestionDecisions={suggestionDecisions}
          onSuggestionsChange={onFuzzySuggestionsChange}
          onSuggestionDecisionsChange={onSuggestionDecisionsChange}
          onRevalidate={onRevalidate}
          onEdgesCsvChange={onEdgesCsvChange}
          onServicesCsvChange={onServicesCsvChange}
          onNodesCsvChange={onNodesCsvChange}
        />
      )}

      {allErrors.length > 0 && (() => {
        const totalInvalid = result.nodeValidation.invalidRows + result.edgeValidation.invalidRows + result.serviceValidation.invalidRows + result.portValidation.invalidRows;
        const totalValid = result.nodeValidation.validRows + result.edgeValidation.validRows + result.serviceValidation.validRows + result.portValidation.validRows;
        return totalInvalid > 0 && totalValid > 0 ? (
          <label
            className="bg-warning/10 border-warning/30 flex cursor-pointer items-center gap-2 rounded-md border p-3"
            data-testid="skip-invalid-rows"
          >
            <input
              type="checkbox"
              checked={skipInvalidRows}
              onChange={(e) => onSkipInvalidRowsChange(e.target.checked)}
              className="rounded border-warning text-warning focus:ring-warning"
            />
            <span className="text-xs text-warning">
              Skip {totalInvalid} invalid row{totalInvalid !== 1 ? 's' : ''} and continue with {totalValid} valid row{totalValid !== 1 ? 's' : ''}
            </span>
          </label>
        ) : null;
      })()}

      {allWarnings.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1 text-sm font-medium text-warning">
            <AlertTriangle className="h-4 w-4" />
            Warnings ({allWarnings.length})
          </h4>
          <div className="bg-warning/10 max-h-40 space-y-1 overflow-y-auto rounded-md p-3">
            {allWarnings.map((warn, i) => (
              <p key={i} className="text-xs text-warning">{warn}</p>
            ))}
          </div>
        </div>
      )}

      <ValidationToolbar
        csvSources={[
          ...(nodesCsvContent ? [{ label: 'Nodes', csv: nodesCsvContent, onChange: onNodesCsvChange }] : []),
          ...(edgesCsvContent ? [{ label: 'Edges', csv: edgesCsvContent, onChange: onEdgesCsvChange }] : []),
          ...(servicesCsvContent ? [{ label: 'Services', csv: servicesCsvContent, onChange: onServicesCsvChange }] : []),
        ]}
        onRevalidate={(updatedCsvs) => {
          const freshNodes = updatedCsvs['Nodes'] ?? nodesCsvContent;
          const freshEdges = updatedCsvs['Edges'] ?? edgesCsvContent;
          const freshServices = updatedCsvs['Services'] ?? servicesCsvContent;
          const newResult = runImport(freshNodes, freshEdges, 'huawei-nce', freshServices, existingNodeNameToId, portsCsvContent);
          onRevalidate(newResult);
        }}
      />

      {allErrors.length === 0 && allWarnings.length === 0 && (
        <div className="bg-success/10 flex items-center gap-2 rounded-md p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <span className="text-sm text-success">All data validated successfully</span>
        </div>
      )}
    </div>
  );
};

/** Rebuild a CSV string from parsed rows */
function rebuildCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h] || '';
      // Quote values containing commas, quotes, or newlines
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

// ============================================================================
// Fuzzy Match Panel
// ============================================================================

interface FuzzyMatchPanelProps {
  result: ImportResult;
  nodesCsvContent: string;
  edgesCsvContent: string;
  servicesCsvContent: string;
  portsCsvContent: string;
  existingNodeNameToId: Map<string, string>;
  suggestions: FuzzyMatchSuggestion[];
  suggestionDecisions: Map<string, 'pending' | 'accepted' | 'rejected'>;
  onSuggestionsChange: (suggestions: FuzzyMatchSuggestion[]) => void;
  onSuggestionDecisionsChange: (decisions: Map<string, 'pending' | 'accepted' | 'rejected'>) => void;
  onRevalidate: (result: ImportResult) => void;
  onEdgesCsvChange: (csv: string) => void;
  onServicesCsvChange: (csv: string) => void;
  onNodesCsvChange: (csv: string) => void;
}

const FuzzyMatchPanel: React.FC<FuzzyMatchPanelProps> = ({
  result,
  nodesCsvContent,
  edgesCsvContent,
  servicesCsvContent,
  portsCsvContent,
  existingNodeNameToId,
  suggestions,
  suggestionDecisions,
  onSuggestionsChange,
  onSuggestionDecisionsChange,
  onRevalidate,
  onEdgesCsvChange,
  onServicesCsvChange,
  onNodesCsvChange,
}) => {
  const [threshold, setThreshold] = useState(0.6);

  // Preview count: cells that have leading/trailing whitespace
  const trimCount = useMemo(() => {
    let count = 0;
    const checkRows = (csv: string) => {
      if (!csv) return;
      const { rows } = parseCsv(csv);
      for (const row of rows) {
        for (const val of Object.values(row)) {
          if (val !== val.trim()) count++;
        }
      }
    };
    checkRows(edgesCsvContent);
    checkRows(servicesCsvContent);
    checkRows(nodesCsvContent);
    return count;
  }, [edgesCsvContent, servicesCsvContent, nodesCsvContent]);

  // Preview count: node-name cells containing underscores, dots, or spaces
  const normalizeCount = useMemo(() => {
    let count = 0;
    const NODE_NAME_COLS = ['node_name', 'source_node', 'target_node', 'destination_node', 'working_path_nodes', 'protection_path_nodes'];
    const checkRows = (csv: string) => {
      if (!csv) return;
      const { rows } = parseCsv(csv);
      for (const row of rows) {
        for (const col of NODE_NAME_COLS) {
          if (row[col] && /[_.\s]/.test(row[col])) count++;
        }
      }
    };
    checkRows(edgesCsvContent);
    checkRows(servicesCsvContent);
    checkRows(nodesCsvContent);
    return count;
  }, [edgesCsvContent, servicesCsvContent, nodesCsvContent]);

  // Derive accepted remappings from suggestions + decisions
  const acceptedRemappings = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suggestions) {
      if (suggestionDecisions.get(s.originalValue) === 'accepted') {
        map.set(s.originalValue, s.suggestedValue);
      }
    }
    return map;
  }, [suggestions, suggestionDecisions]);

  // Summary counts
  const acceptedCount = useMemo(() => {
    let count = 0;
    for (const d of suggestionDecisions.values()) {
      if (d === 'accepted') count++;
    }
    return count;
  }, [suggestionDecisions]);

  const rejectedCount = useMemo(() => {
    let count = 0;
    for (const d of suggestionDecisions.values()) {
      if (d === 'rejected') count++;
    }
    return count;
  }, [suggestionDecisions]);

  const pendingCount = suggestions.length - acceptedCount - rejectedCount;

  const handleFindMatches = useCallback(() => {
    // Parse CSVs to get raw rows
    const edgeRows = edgesCsvContent ? parseCsv(edgesCsvContent).rows : [];
    const serviceRows = servicesCsvContent ? parseCsv(servicesCsvContent).rows : [];

    // Collect unmatched references
    const unmatchedMap = collectUnmatchedReferences(edgeRows, serviceRows, result.nodeNameToId);

    // Convert to UnmatchedReference array
    const unmatchedRefs: UnmatchedReference[] = [];
    for (const [key, info] of unmatchedMap) {
      const originalValue = key.split(':').slice(2).join(':'); // Extract original value from key
      unmatchedRefs.push({
        originalValue,
        rowNumbers: info.rowNumbers,
        fileType: info.fileType,
        fieldName: info.fieldName,
      });
    }

    // Get known node names from BOTH imported nodes AND existing topology
    const existingNodes = useNetworkStore.getState().topology.nodes;
    const existingNames = existingNodes.map((n) => n.name);
    const importedNames = result.nodes.map((n) => n.name);
    const knownNames = [...new Set([...importedNames, ...existingNames])];

    // Find fuzzy matches
    const matches = findFuzzyMatches(unmatchedRefs, knownNames, threshold);

    // Deduplicate by originalValue — merge row numbers and context from duplicates
    const deduped = new Map<string, FuzzyMatchSuggestion>();
    for (const m of matches) {
      const existing = deduped.get(m.originalValue);
      if (!existing) {
        deduped.set(m.originalValue, { ...m });
      } else {
        // Merge row numbers (deduplicate)
        const mergedRows = [...new Set([...existing.rowNumbers, ...m.rowNumbers])].sort((a, b) => a - b);
        existing.rowNumbers = mergedRows;
        // Keep higher score entry's suggestedValue/strategy
        if (m.score > existing.score) {
          existing.suggestedValue = m.suggestedValue;
          existing.score = m.score;
          existing.strategy = m.strategy;
        }
      }
    }
    const dedupedMatches = Array.from(deduped.values()).sort((a, b) => b.score - a.score);
    onSuggestionsChange(dedupedMatches);

    // All suggestions start as pending
    const newDecisions = new Map<string, 'pending' | 'accepted' | 'rejected'>();
    for (const match of dedupedMatches) {
      newDecisions.set(match.originalValue, 'pending');
    }
    onSuggestionDecisionsChange(newDecisions);
  }, [edgesCsvContent, servicesCsvContent, result, threshold, onSuggestionsChange, onSuggestionDecisionsChange]);

  const handleDecision = useCallback((originalValue: string, decision: 'accepted' | 'rejected') => {
    const newDecisions = new Map(suggestionDecisions);
    newDecisions.set(originalValue, decision);
    onSuggestionDecisionsChange(newDecisions);
  }, [suggestionDecisions, onSuggestionDecisionsChange]);

  const handleAcceptAll = useCallback(() => {
    const newDecisions = new Map(suggestionDecisions);
    for (const s of suggestions) {
      newDecisions.set(s.originalValue, 'accepted');
    }
    onSuggestionDecisionsChange(newDecisions);
  }, [suggestions, suggestionDecisions, onSuggestionDecisionsChange]);

  const handleRejectAll = useCallback(() => {
    const newDecisions = new Map(suggestionDecisions);
    for (const s of suggestions) {
      newDecisions.set(s.originalValue, 'rejected');
    }
    onSuggestionDecisionsChange(newDecisions);
  }, [suggestions, suggestionDecisions, onSuggestionDecisionsChange]);

  // Shared helper: re-run fuzzy matching after a transform, preserving user decisions
  const rerunFuzzyAfterTransform = useCallback((newEdgesCsv: string, newServicesCsv: string, newResult: ImportResult) => {
    if (suggestions.length === 0) return;

    const newEdgeRows = newResult.edgeValidation.rowResults.length > 0
      ? parseCsv(newEdgesCsv || '').rows : [];
    const newServiceRows = newResult.serviceValidation.rowResults.length > 0
      ? parseCsv(newServicesCsv || '').rows : [];
    const unmatchedMap = collectUnmatchedReferences(newEdgeRows, newServiceRows, newResult.nodeNameToId);
    const unmatchedRefs: UnmatchedReference[] = [];
    for (const [key, ref] of unmatchedMap) {
      const parts = key.split(':');
      unmatchedRefs.push({
        originalValue: parts.slice(2).join(':'),
        rowNumbers: ref.rowNumbers,
        fileType: ref.fileType,
        fieldName: ref.fieldName,
      });
    }
    const existingNodes = useNetworkStore.getState().topology.nodes;
    const existingNames = existingNodes.map((n) => n.name);
    const importedNames = newResult.nodes.map((n) => n.name);
    const knownNames = [...new Set([...importedNames, ...existingNames])];
    const newSuggestions = findFuzzyMatches(unmatchedRefs, knownNames);
    onSuggestionsChange(newSuggestions);

    // Preserve decisions for values that still exist
    const newDecisions = new Map<string, 'pending' | 'accepted' | 'rejected'>();
    for (const s of newSuggestions) {
      const existing = suggestionDecisions.get(s.originalValue);
      if (existing) {
        newDecisions.set(s.originalValue, existing);
      }
    }
    onSuggestionDecisionsChange(newDecisions);
  }, [suggestions, suggestionDecisions, onSuggestionsChange, onSuggestionDecisionsChange]);

  const handleTrimWhitespace = useCallback(() => {
    const nodeRows = nodesCsvContent ? trimWhitespace(parseCsv(nodesCsvContent).rows) : [];
    const edgeRows = edgesCsvContent ? trimWhitespace(parseCsv(edgesCsvContent).rows) : [];
    const serviceRows = servicesCsvContent ? trimWhitespace(parseCsv(servicesCsvContent).rows) : [];

    const newNodesCsv = nodeRows.length > 0 ? rebuildCsv(nodeRows) : nodesCsvContent;
    const newEdgesCsv = edgeRows.length > 0 ? rebuildCsv(edgeRows) : edgesCsvContent;
    const newServicesCsv = serviceRows.length > 0 ? rebuildCsv(serviceRows) : servicesCsvContent;

    onNodesCsvChange(newNodesCsv);
    onEdgesCsvChange(newEdgesCsv);
    onServicesCsvChange(newServicesCsv);
    const newResult = runImport(newNodesCsv, newEdgesCsv, 'huawei-nce', newServicesCsv, existingNodeNameToId, portsCsvContent);
    onRevalidate(newResult);
    rerunFuzzyAfterTransform(newEdgesCsv, newServicesCsv, newResult);
  }, [nodesCsvContent, edgesCsvContent, servicesCsvContent, portsCsvContent, existingNodeNameToId, onNodesCsvChange, onEdgesCsvChange, onServicesCsvChange, onRevalidate, rerunFuzzyAfterTransform]);

  const handleNormalizeDelimiters = useCallback(() => {
    const nodeRows = nodesCsvContent ? normalizeDelimiters(parseCsv(nodesCsvContent).rows) : [];
    const edgeRows = edgesCsvContent ? normalizeDelimiters(parseCsv(edgesCsvContent).rows) : [];
    const serviceRows = servicesCsvContent ? normalizeDelimiters(parseCsv(servicesCsvContent).rows) : [];

    const newNodesCsv = nodeRows.length > 0 ? rebuildCsv(nodeRows) : nodesCsvContent;
    const newEdgesCsv = edgeRows.length > 0 ? rebuildCsv(edgeRows) : edgesCsvContent;
    const newServicesCsv = serviceRows.length > 0 ? rebuildCsv(serviceRows) : servicesCsvContent;

    onNodesCsvChange(newNodesCsv);
    onEdgesCsvChange(newEdgesCsv);
    onServicesCsvChange(newServicesCsv);
    const newResult = runImport(newNodesCsv, newEdgesCsv, 'huawei-nce', newServicesCsv, existingNodeNameToId, portsCsvContent);
    onRevalidate(newResult);
    rerunFuzzyAfterTransform(newEdgesCsv, newServicesCsv, newResult);
  }, [nodesCsvContent, edgesCsvContent, servicesCsvContent, portsCsvContent, existingNodeNameToId, onNodesCsvChange, onEdgesCsvChange, onServicesCsvChange, onRevalidate, rerunFuzzyAfterTransform]);

  const handleApplyAndRevalidate = useCallback(() => {
    if (acceptedRemappings.size === 0) return;

    const edgeRows = edgesCsvContent ? applyFuzzyRemapping(parseCsv(edgesCsvContent).rows, acceptedRemappings) : [];
    const serviceRows = servicesCsvContent ? applyFuzzyRemapping(parseCsv(servicesCsvContent).rows, acceptedRemappings) : [];

    const newEdgesCsv = edgeRows.length > 0 ? rebuildCsv(edgeRows) : edgesCsvContent;
    const newServicesCsv = serviceRows.length > 0 ? rebuildCsv(serviceRows) : servicesCsvContent;

    onEdgesCsvChange(newEdgesCsv);
    onServicesCsvChange(newServicesCsv);
    const newResult = runImport(nodesCsvContent, newEdgesCsv, 'huawei-nce', newServicesCsv, existingNodeNameToId, portsCsvContent);
    onRevalidate(newResult);
    onSuggestionsChange([]);
    onSuggestionDecisionsChange(new Map());
  }, [nodesCsvContent, edgesCsvContent, servicesCsvContent, portsCsvContent, existingNodeNameToId, acceptedRemappings, onEdgesCsvChange, onServicesCsvChange, onRevalidate, onSuggestionsChange, onSuggestionDecisionsChange]);

  return (
    <div className="border-accent/30 bg-accent/5 space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-accent" />
        <h4 className="text-sm font-medium text-accent">Smart Match</h4>
      </div>
      <p className="text-xs text-text-secondary">
        Some node references could not be resolved. Use fuzzy matching to find and fix mismatched names.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={handleFindMatches} data-testid="fuzzy-find-matches">
              <Wand2 className="mr-1 h-3.5 w-3.5" />
              Find Matches
            </Button>
          </TooltipTrigger>
          <TooltipContent>Scan for similar node names using fuzzy string matching (Levenshtein distance)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={handleTrimWhitespace}>
              Trim Whitespace
              {trimCount > 0 && (
                <span className="bg-warning/20 ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-warning">
                  {trimCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove leading/trailing spaces from all cell values</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={handleNormalizeDelimiters}>
              Normalize Delimiters
              {normalizeCount > 0 && (
                <span className="bg-warning/20 ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-warning">
                  {normalizeCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Convert underscores, dots, and spaces to hyphens in node name columns</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-secondary">Match threshold:</span>
        <input
          type="range"
          min="0.3"
          max="0.9"
          step="0.05"
          value={threshold}
          onChange={(e) => setThreshold(parseFloat(e.target.value))}
          className="h-1 w-24 accent-accent"
          data-testid="fuzzy-threshold-slider"
        />
        <span className="w-8 font-mono text-text-primary">{threshold.toFixed(2)}</span>
      </div>

      {suggestions.length > 0 && (
        <>
          {/* Summary header */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-secondary">
              {suggestions.length} match{suggestions.length !== 1 ? 'es' : ''} found:
              {' '}<span className="font-medium text-success">{acceptedCount} accepted</span>,
              {' '}<span className="text-destructive font-medium">{rejectedCount} rejected</span>,
              {' '}<span className="font-medium text-text-muted">{pendingCount} pending</span>
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-success hover:text-success" onClick={handleAcceptAll} data-testid="fuzzy-accept-all">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Accept All
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-7 text-xs" onClick={handleRejectAll} data-testid="fuzzy-reject-all">
                <XCircle className="mr-1 h-3 w-3" />
                Reject All
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Original Value</th>
                  <th className="p-2 text-left">Suggested Match</th>
                  <th className="p-2 text-left">Score</th>
                  <th className="p-2 text-left">Strategy</th>
                  <th className="p-2 text-left">File</th>
                  <th className="p-2 text-left">Field</th>
                  <th className="p-2 text-left">Rows</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s, i) => {
                  const decision = suggestionDecisions.get(s.originalValue) ?? 'pending';
                  return (
                    <tr
                      key={i}
                      className={cn(
                        'border-b border-border transition-colors',
                        decision === 'accepted' && 'bg-success/5',
                        decision === 'rejected' && 'bg-destructive/5',
                      )}
                      data-testid={`fuzzy-row-${i}`}
                    >
                      <td className={cn(
                        'p-2 font-mono',
                        decision === 'rejected' ? 'text-text-muted line-through' : 'text-destructive',
                      )}>
                        {s.originalValue}
                      </td>
                      <td className={cn(
                        'p-2 font-mono',
                        decision === 'rejected' ? 'text-text-muted line-through' : 'text-success',
                      )}>
                        {s.suggestedValue}
                      </td>
                      <td className="p-2">
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          s.score >= 0.9 ? 'bg-success/10 text-success' :
                          s.score >= 0.7 ? 'bg-warning/10 text-warning' :
                          'bg-destructive/10 text-destructive'
                        )}>
                          {Math.round(s.score * 100)}%
                        </span>
                      </td>
                      <td className="p-2 text-text-secondary">{s.strategy}</td>
                      <td className="p-2 text-text-secondary">{s.fileType}</td>
                      <td className="p-2 text-text-secondary">{s.fieldName}</td>
                      <td className="p-2 font-mono text-text-secondary">
                        {s.rowNumbers.length <= 3
                          ? s.rowNumbers.join(', ')
                          : `${s.rowNumbers.slice(0, 3).join(', ')}...+${s.rowNumbers.length - 3}`}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant={decision === 'accepted' ? 'default' : 'ghost'}
                            size="sm"
                            className={cn(
                              'h-6 w-6 p-0',
                              decision === 'accepted'
                                ? 'bg-success hover:bg-success/90 text-white'
                                : 'text-success hover:text-success hover:bg-success/10',
                            )}
                            onClick={() => handleDecision(s.originalValue, 'accepted')}
                            data-testid={`fuzzy-accept-${i}`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant={decision === 'rejected' ? 'default' : 'ghost'}
                            size="sm"
                            className={cn(
                              'h-6 w-6 p-0',
                              decision === 'rejected'
                                ? 'bg-destructive hover:bg-destructive/90 text-white'
                                : 'text-destructive hover:text-destructive hover:bg-destructive/10',
                            )}
                            onClick={() => handleDecision(s.originalValue, 'rejected')}
                            data-testid={`fuzzy-reject-${i}`}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Button
            size="sm"
            onClick={handleApplyAndRevalidate}
            disabled={acceptedRemappings.size === 0}
            data-testid="fuzzy-apply-revalidate"
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Apply & Re-validate ({acceptedRemappings.size} remapping{acceptedRemappings.size !== 1 ? 's' : ''})
          </Button>
        </>
      )}
    </div>
  );
};

interface ValidationSummaryCardProps {
  label: string;
  total: number;
  valid: number;
  invalid: number;
}

const ValidationSummaryCard: React.FC<ValidationSummaryCardProps> = ({
  label,
  total,
  valid,
  invalid,
}) => (
  <div className="bg-surface rounded-lg border border-border p-4">
    <h4 className="mb-2 text-sm font-medium">{label}</h4>
    <div className="space-y-1 text-xs">
      <div className="flex justify-between">
        <span className="text-text-secondary">Total rows:</span>
        <span>{total}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-success">Valid:</span>
        <span className="text-success">{valid}</span>
      </div>
      {invalid > 0 && (
        <div className="flex justify-between">
          <span className="text-destructive">Invalid:</span>
          <span className="text-destructive">{invalid}</span>
        </div>
      )}
    </div>
  </div>
);

// ============================================================================
// Step 3: Preview
// ============================================================================

interface PreviewStepProps {
  result: ImportResult;
}

const PreviewStep: React.FC<PreviewStepProps> = ({ result }) => {
  const [previewTab, setPreviewTab] = useState<'nodes' | 'edges' | 'services'>('nodes');

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          variant={previewTab === 'nodes' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPreviewTab('nodes')}
        >
          Nodes ({result.nodes.length})
        </Button>
        <Button
          variant={previewTab === 'edges' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPreviewTab('edges')}
        >
          Edges ({result.edges.length})
        </Button>
        <Button
          variant={previewTab === 'services' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPreviewTab('services')}
        >
          Services ({result.services.length})
        </Button>
      </div>

      <div className="max-h-[400px] overflow-x-auto">
        {previewTab === 'nodes' && (
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Vendor</th>
                <th className="p-2 text-left">Model</th>
                <th className="p-2 text-left">Lat</th>
                <th className="p-2 text-left">Lng</th>
              </tr>
            </thead>
            <tbody>
              {result.nodes.map((node) => (
                <tr key={node.id} className="border-b border-border">
                  <td className="p-2 font-medium">{node.name}</td>
                  <td className="p-2">{node.type}</td>
                  <td className="p-2">{node.vendor}</td>
                  <td className="p-2">{node.model || '-'}</td>
                  <td className="p-2">{node.location?.latitude?.toFixed(4) || '-'}</td>
                  <td className="p-2">{node.location?.longitude?.toFixed(4) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {previewTab === 'edges' && (
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Source</th>
                <th className="p-2 text-left">Src Port</th>
                <th className="p-2 text-left">Target</th>
                <th className="p-2 text-left">Tgt Port</th>
                <th className="p-2 text-left">Distance</th>
                <th className="p-2 text-left">Fiber</th>
                <th className="p-2 text-left">SRLG</th>
              </tr>
            </thead>
            <tbody>
              {result.edges.map((edge) => {
                const sourceNode = result.nodes.find((n) => n.id === edge.source.nodeId);
                const targetNode = result.nodes.find((n) => n.id === edge.target.nodeId);
                const sourceName = sourceNode?.name || edge.source.nodeId;
                const targetName = targetNode?.name || edge.target.nodeId;
                const srcPortName = edge.source.portId && sourceNode
                  ? sourceNode.ports?.find((p) => p.id === edge.source.portId)?.name || edge.source.portId
                  : (edge.metadata as Record<string, unknown>)?._sourcePortName as string || '-';
                const tgtPortName = edge.target.portId && targetNode
                  ? targetNode.ports?.find((p) => p.id === edge.target.portId)?.name || edge.target.portId
                  : (edge.metadata as Record<string, unknown>)?._targetPortName as string || '-';
                return (
                  <tr key={edge.id} className="border-b border-border">
                    <td className="p-2 font-medium">{edge.name}</td>
                    <td className="p-2">{sourceName}</td>
                    <td className="p-2 text-text-secondary">{srcPortName}</td>
                    <td className="p-2">{targetName}</td>
                    <td className="p-2 text-text-secondary">{tgtPortName}</td>
                    <td className="p-2">{edge.properties.distance ?? '-'} km</td>
                    <td className="p-2">{edge.properties.fiberProfile?.profileType || '-'}</td>
                    <td className="p-2">{edge.properties.srlgCodes?.join(', ') || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {previewTab === 'services' && (
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Source</th>
                <th className="p-2 text-left">Destination</th>
                <th className="p-2 text-left">Rate</th>
                <th className="p-2 text-left">Protection</th>
              </tr>
            </thead>
            <tbody>
              {result.services.map((svc) => {
                const sourceName = result.nodes.find((n) => n.id === svc.sourceNodeId)?.name || svc.sourceNodeId;
                const destName = result.nodes.find((n) => n.id === svc.destinationNodeId)?.name || svc.destinationNodeId;
                const protection = svc.type === 'l1-dwdm'
                  ? (svc as { protectionScheme?: string }).protectionScheme || 'none'
                  : '-';
                return (
                  <tr key={svc.id} className="border-b border-border">
                    <td className="p-2 font-medium">{svc.name}</td>
                    <td className="p-2">{svc.type}</td>
                    <td className="p-2">{sourceName}</td>
                    <td className="p-2">{destName}</td>
                    <td className="p-2">{svc.dataRate}</td>
                    <td className="p-2">{protection}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Step 4: Mapping
// ============================================================================

interface MappingStepProps {
  result: ImportResult;
}

const MappingStep: React.FC<MappingStepProps> = ({ result: _result }) => {
  // Show auto-detected column mappings (read-only for now — future: editable overrides)
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Column Mappings (Auto-detected)</h3>
        <p className="text-xs text-text-secondary">
          Columns were automatically mapped from Huawei NCE format to ATLAS fields.
          Review the mappings below before importing.
        </p>
      </div>

      <div className="space-y-4">
        <MappingTable
          title="Node Mappings"
          mappings={[
            { csv: 'node_name', atlas: 'Node Name', transform: '-' },
            { csv: 'node_type', atlas: 'Node Type', transform: 'NE Type → ATLAS Type (OADM→oadm, Router→router, etc.)' },
            { csv: 'vendor', atlas: 'Vendor', transform: 'Normalize (Huawei→huawei, etc.)' },
            { csv: 'model', atlas: 'Model', transform: '-' },
            { csv: 'latitude', atlas: 'Location.Latitude', transform: 'Validate -90..90' },
            { csv: 'longitude', atlas: 'Location.Longitude', transform: 'Validate -180..180' },
            { csv: 'address', atlas: 'Location.Address', transform: '-' },
            { csv: 'subtype', atlas: 'Subtype', transform: '-' },
            { csv: 'size_flavor', atlas: 'Size Flavor', transform: 'small/medium/large' },
          ]}
        />

        <MappingTable
          title="Edge Mappings"
          mappings={[
            { csv: 'edge_name', atlas: 'Edge Name', transform: '-' },
            { csv: 'source_node', atlas: 'Source Node', transform: 'Resolve to UUID' },
            { csv: 'target_node', atlas: 'Target Node', transform: 'Resolve to UUID' },
            { csv: 'distance_km', atlas: 'Distance (km)', transform: 'Parse number' },
            { csv: 'fiber_profile', atlas: 'Fiber Profile', transform: 'Map to ITU-T standard' },
            { csv: 'fiber_count', atlas: 'Fiber Count', transform: 'Parse integer' },
            { csv: 'srlg_codes', atlas: 'SRLG Codes', transform: 'Split by delimiters' },
          ]}
        />

        <MappingTable
          title="Service Mappings"
          mappings={[
            { csv: 'service_name', atlas: 'Service Name', transform: '-' },
            { csv: 'service_type', atlas: 'Service Type', transform: 'Map to l1-dwdm/l2-ethernet/l3-ip' },
            { csv: 'source_node', atlas: 'Source Node', transform: 'Resolve to UUID' },
            { csv: 'destination_node', atlas: 'Destination Node', transform: 'Resolve to UUID' },
            { csv: 'data_rate', atlas: 'Data Rate', transform: '10G/25G/100G/200G/400G' },
            { csv: 'modulation', atlas: 'Modulation Type', transform: '-' },
            { csv: 'channel_number', atlas: 'Channel Number', transform: 'Parse number' },
            { csv: 'lambda_frequency', atlas: 'Lambda Frequency', transform: 'THz → Channel Number (50GHz grid)' },
            { csv: 'protection', atlas: 'Protection Scheme', transform: 'Map to none/olp/sncp/wson-restoration/1+1+wson' },
            { csv: 'service_role', atlas: 'Service Role', transform: 'Map to working/protection' },
            { csv: 'protection_pair_id', atlas: 'Protection Pair ID', transform: '-' },
            { csv: 'working_path_nodes', atlas: 'Working Path', transform: 'Split by semicolon, resolve to UUIDs' },
            { csv: 'protection_path_nodes', atlas: 'Protection Path', transform: 'Split by semicolon, resolve to UUIDs' },
            { csv: 'transceiver', atlas: 'Transceiver Type', transform: '-' },
          ]}
        />

        <MappingTable
          title="Port Mappings"
          mappings={[
            { csv: 'node_name', atlas: 'Node Name', transform: 'Resolve to node by name' },
            { csv: 'port_name', atlas: 'Port Name', transform: '-' },
            { csv: 'port_type', atlas: 'Port Type', transform: 'Map to dwdm/bw' },
            { csv: 'data_rate', atlas: 'Data Rate', transform: '1G/10G/25G/100G/400G' },
            { csv: 'channels', atlas: 'Channels', transform: 'Parse integer (1 for B/W, up to 96 for DWDM)' },
            { csv: 'grid_type', atlas: 'Grid Type', transform: 'fixed-50ghz/fixed-100ghz/flex-grid' },
          ]}
        />
      </div>
    </div>
  );
};

interface MappingEntry {
  csv: string;
  atlas: string;
  transform: string;
}

const MappingTable: React.FC<{ title: string; mappings: MappingEntry[] }> = ({
  title,
  mappings,
}) => (
  <div>
    <h4 className="mb-2 text-xs font-medium">{title}</h4>
    <table className="w-full text-xs">
      <thead className="bg-muted">
        <tr>
          <th className="p-2 text-left">CSV Column</th>
          <th className="p-2 text-left">ATLAS Field</th>
          <th className="p-2 text-left">Transform</th>
        </tr>
      </thead>
      <tbody>
        {mappings.map((m) => (
          <tr key={m.csv} className="border-b border-border">
            <td className="p-2 font-mono">{m.csv}</td>
            <td className="p-2">{m.atlas}</td>
            <td className="p-2 text-text-secondary">{m.transform}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ============================================================================
// Step 5: Import
// ============================================================================

interface ImportStepProps {
  result: ImportResult;
  importing: boolean;
  importComplete: boolean;
  importMode: ImportMode;
  onImportModeChange: (mode: ImportMode) => void;
  hasExistingTopology: boolean;
  onImport: () => void;
  skipInvalidRows?: boolean;
  autoAllocatePorts: boolean;
  portAllocations: PortAllocationInfo[];
  onAutoAllocatePortsChange: (enabled: boolean) => void;
}

const ImportStep: React.FC<ImportStepProps> = ({
  result,
  importing,
  importComplete,
  importMode,
  onImportModeChange,
  hasExistingTopology,
  skipInvalidRows,
  autoAllocatePorts,
  portAllocations,
  onAutoAllocatePortsChange,
}) => {
  const totalSkipped = skipInvalidRows
    ? result.nodeValidation.invalidRows + result.edgeValidation.invalidRows + result.serviceValidation.invalidRows + result.portValidation.invalidRows
    : 0;
  return (
    <div className="space-y-4">
      {!importComplete ? (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Import Summary</h3>
            <div className="bg-surface space-y-2 rounded-lg border border-border p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Nodes to import:</span>
                <span className="font-medium">{result.nodes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Edges to import:</span>
                <span className="font-medium">{result.edges.length}</span>
              </div>
              {result.services.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Services to import:</span>
                  <span className="font-medium">{result.services.length}</span>
                </div>
              )}
              {result.portValidation.validRows > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Ports configured:</span>
                  <span className="font-medium">{result.portValidation.validRows}</span>
                </div>
              )}
            </div>
          </div>

          {hasExistingTopology && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Existing Topology Detected</h3>
              <p className="text-xs text-text-secondary">
                Your current topology has existing nodes and edges. Choose how to handle the import:
              </p>
              <div className="flex gap-3">
                <label
                  className={cn(
                    'flex-1 p-3 rounded-lg border-2 cursor-pointer transition-colors',
                    importMode === 'merge' ? 'border-primary bg-primary/5' : 'border-border'
                  )}
                >
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === 'merge'}
                    onChange={() => onImportModeChange('merge')}
                    className="sr-only"
                  />
                  <div className="text-sm font-medium">Merge</div>
                  <div className="text-xs text-text-secondary">
                    Add imported data alongside existing topology
                  </div>
                </label>
                <label
                  className={cn(
                    'flex-1 p-3 rounded-lg border-2 cursor-pointer transition-colors',
                    importMode === 'replace' ? 'border-primary bg-primary/5' : 'border-border'
                  )}
                >
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => onImportModeChange('replace')}
                    className="sr-only"
                  />
                  <div className="text-sm font-medium">Replace</div>
                  <div className="text-xs text-text-secondary">
                    Clear existing topology, import fresh
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Port auto-assignment banner */}
          {(() => {
            const edgesNeedingPorts = result.edges.filter(
              (e) => !e.source.portId || !e.target.portId,
            );
            if (edgesNeedingPorts.length === 0) return null;
            return (
              <div className="space-y-2">
                <div className="bg-accent/5 border-accent/20 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div className="flex-1 space-y-1.5">
                      <p className="text-sm font-medium text-text-primary">Port Assignment</p>
                      <p className="text-xs text-text-secondary">
                        {edgesNeedingPorts.length} edge{edgesNeedingPorts.length !== 1 ? 's' : ''} have
                        no port assignment. Enable auto-assignment to allocate available DWDM ports automatically.
                      </p>
                      <label className="mt-1 flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={autoAllocatePorts}
                          onChange={(e) => onAutoAllocatePortsChange(e.target.checked)}
                          className="rounded border-border"
                          data-testid="auto-assign-ports-checkbox"
                        />
                        <span className="text-xs font-medium text-text-primary">
                          Auto-assign ports to unassigned edges
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {autoAllocatePorts && portAllocations.length > 0 && (
                  <div className="max-h-[200px] overflow-x-auto">
                    <table className="w-full text-xs" data-testid="port-allocation-table">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Edge</th>
                          <th className="p-2 text-left">Source Node</th>
                          <th className="p-2 text-left">Src Port</th>
                          <th className="p-2 text-left">Target Node</th>
                          <th className="p-2 text-left">Tgt Port</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portAllocations.map((a) => (
                          <tr key={a.edgeId} className="border-b border-border">
                            <td className="p-2 font-medium">{a.edgeName}</td>
                            <td className="p-2">{a.sourceNodeName}</td>
                            <td className="p-2">{a.sourcePortName || <span className="text-text-muted">-</span>}</td>
                            <td className="p-2">{a.targetNodeName}</td>
                            <td className="p-2">{a.targetPortName || <span className="text-text-muted">-</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {importing && (
            <div className="flex items-center gap-2 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Importing topology data...</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <h3 className="text-lg font-medium">Import Complete</h3>
          <div className="text-center text-sm text-text-secondary">
            <p>Successfully imported {result.nodes.length} nodes, {result.edges.length} edges{result.services.length > 0 ? `, ${result.services.length} services` : ''}{result.portValidation.validRows > 0 ? `, and ${result.portValidation.validRows} ports` : ''}.
            {totalSkipped > 0 && <span className="text-warning"> ({totalSkipped} invalid row{totalSkipped !== 1 ? 's' : ''} skipped)</span>}
            </p>
            <p className="mt-1">The topology is now available in the canvas.</p>
          </div>
        </div>
      )}
    </div>
  );
};
