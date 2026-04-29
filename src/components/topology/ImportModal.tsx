import React, { useState, useRef, useCallback } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { useServiceStore } from '@/stores/serviceStore';
import { NetworkTopology } from '@/types';
import type { Service } from '@/types/service';
import { isL1DWDMService, isL2L3Service } from '@/types/service';
import { loadTopologyChunked, type ChunkedLoadPromise } from '@/lib/chunked-loader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import { Upload, FileJson, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

// ============================================================================
// SERVICE VALIDATION
// ============================================================================

interface ServiceValidationReport {
  total: number;
  l1Count: number;
  l2Count: number;
  l3Count: number;
  validCount: number;
  invalidCount: number;
  issues: string[];
}

/**
 * Validate service references against the imported topology
 */
function validateServiceReferences(
  services: Service[],
  topology: NetworkTopology,
): ServiceValidationReport {
  const nodeIds = new Set(topology.nodes.map((n) => n.id));
  const edgeIds = new Set(topology.edges.map((e) => e.id));
  const serviceIds = new Set(services.map((s) => s.id));

  const issues: string[] = [];
  let validCount = 0;
  let l1Count = 0;
  let l2Count = 0;
  let l3Count = 0;

  for (const service of services) {
    let hasIssue = false;

    if (service.type === 'l1-dwdm') l1Count++;
    else if (service.type === 'l2-ethernet') l2Count++;
    else if (service.type === 'l3-ip') l3Count++;

    // Validate endpoint nodes
    if (!nodeIds.has(service.sourceNodeId)) {
      issues.push(`${service.id}: source node not found`);
      hasIssue = true;
    }
    if (!nodeIds.has(service.destinationNodeId)) {
      issues.push(`${service.id}: destination node not found`);
      hasIssue = true;
    }

    // Validate L1 path edges
    if (isL1DWDMService(service)) {
      if (service.workingPath) {
        for (const eid of service.workingPath.edgeIds) {
          if (!edgeIds.has(eid)) {
            issues.push(`${service.id}: working path edge not found`);
            hasIssue = true;
            break;
          }
        }
      }
      if (service.protectionPath) {
        for (const eid of service.protectionPath.edgeIds) {
          if (!edgeIds.has(eid)) {
            issues.push(`${service.id}: protection path edge not found`);
            hasIssue = true;
            break;
          }
        }
      }
    }

    // Validate L2/L3 underlay references
    if (isL2L3Service(service)) {
      if (service.underlayServiceId && !serviceIds.has(service.underlayServiceId)) {
        issues.push(`${service.id}: underlay service not found`);
        hasIssue = true;
      }
      if (
        service.protectionUnderlayServiceId &&
        !serviceIds.has(service.protectionUnderlayServiceId)
      ) {
        issues.push(`${service.id}: protection underlay not found`);
        hasIssue = true;
      }
    }

    if (!hasIssue) validCount++;
  }

  return {
    total: services.length,
    l1Count,
    l2Count,
    l3Count,
    validCount,
    invalidCount: services.length - validCount,
    issues,
  };
}

// ============================================================================
// TOPOLOGY VALIDATION
// ============================================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  topology?: NetworkTopology;
  services?: Service[];
  serviceReport?: ServiceValidationReport;
  isV2Format?: boolean;
}

/**
 * Validate imported JSON — supports both v1 (topology-only) and v2 (with services)
 */
const validateImportData = (data: unknown): ValidationResult => {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Invalid JSON: expected an object'] };
  }

  const obj = data as Record<string, unknown>;

  // Detect v2 format: { version: '2.0', topology: {...}, services: [...] }
  const isV2 =
    obj.version === '2.0' && typeof obj.topology === 'object' && obj.topology !== null;

  // For v2, extract the topology object; for v1, the root IS the topology
  const topologyObj = isV2 ? (obj.topology as Record<string, unknown>) : obj;

  // Check required top-level fields
  if (!('nodes' in topologyObj) || !Array.isArray(topologyObj.nodes)) {
    errors.push('Missing or invalid "nodes" array');
  }

  if (!('edges' in topologyObj) || !Array.isArray(topologyObj.edges)) {
    errors.push('Missing or invalid "edges" array');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Validate nodes
  const nodes = topologyObj.nodes as unknown[];
  nodes.forEach((node, index) => {
    if (typeof node !== 'object' || node === null) {
      errors.push(`Node ${index}: invalid node object`);
      return;
    }
    const n = node as Record<string, unknown>;
    if (!n.id || typeof n.id !== 'string') {
      errors.push(`Node ${index}: missing or invalid "id"`);
    }
    if (!n.type || typeof n.type !== 'string') {
      errors.push(`Node ${index}: missing or invalid "type"`);
    }
    if (!n.position || typeof n.position !== 'object') {
      errors.push(`Node ${index}: missing or invalid "position"`);
    }
  });

  // Validate edges
  const edges = topologyObj.edges as unknown[];
  edges.forEach((edge, index) => {
    if (typeof edge !== 'object' || edge === null) {
      errors.push(`Edge ${index}: invalid edge object`);
      return;
    }
    const e = edge as Record<string, unknown>;
    if (!e.id || typeof e.id !== 'string') {
      errors.push(`Edge ${index}: missing or invalid "id"`);
    }
    if (!e.source || typeof e.source !== 'object') {
      errors.push(`Edge ${index}: missing or invalid "source"`);
    }
    if (!e.target || typeof e.target !== 'object') {
      errors.push(`Edge ${index}: missing or invalid "target"`);
    }
  });

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build topology object
  const topology: NetworkTopology = {
    id: (topologyObj.id as string) || crypto.randomUUID(),
    name: (topologyObj.name as string) || 'Imported Network',
    version: (topologyObj.version as string) || '1.0.0',
    metadata: {
      created:
        ((topologyObj.metadata as Record<string, unknown>)?.created as string) ||
        new Date().toISOString(),
      modified: new Date().toISOString(),
      ...((topologyObj.metadata as Record<string, unknown>) || {}),
    },
    nodes: topologyObj.nodes as NetworkTopology['nodes'],
    edges: topologyObj.edges as NetworkTopology['edges'],
  };

  // Extract and validate services (v2 format)
  let services: Service[] | undefined;
  let serviceReport: ServiceValidationReport | undefined;

  if (isV2 && Array.isArray(obj.services) && obj.services.length > 0) {
    services = obj.services as Service[];
    serviceReport = validateServiceReferences(services, topology);
  }

  return {
    valid: true,
    errors: [],
    topology,
    services,
    serviceReport,
    isV2Format: isV2,
  };
};

// ============================================================================
// COMPONENT
// ============================================================================

export const ImportModal: React.FC = () => {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal = useUIStore((state) => state.closeModal);
  const addToast = useUIStore((state) => state.addToast);
  const loadTopology = useNetworkStore((state) => state.loadTopology);
  const clearAllServices = useServiceStore((state) => state.clearAllServices);
  const importServicesAction = useServiceStore((state) => state.importServices);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [importInvalidAsPlanned, setImportInvalidAsPlanned] = useState(true);
  const [chunkedProgress, setChunkedProgress] = useState(-1);
  const [chunkedStatus, setChunkedStatus] = useState('');
  const [isChunkedLoading, setIsChunkedLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelHandleRef = useRef<{ cancel: () => void } | null>(null);

  const isOpen = activeModal === 'import';

  const handleClose = () => {
    closeModal();
    setSelectedFile(null);
    setValidation(null);
    setIsLoading(false);
    setImportInvalidAsPlanned(true);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setValidation({ valid: false, errors: ['File size exceeds 10MB limit'] });
      setSelectedFile(null);
      return;
    }

    if (!file.name.endsWith('.json')) {
      setValidation({ valid: false, errors: ['Only .json files are supported'] });
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setIsLoading(true);

    try {
      const content = await file.text();
      const data = JSON.parse(content);
      const result = validateImportData(data);
      setValidation(result);
    } catch (error) {
      setValidation({
        valid: false,
        errors: [
          'Invalid JSON format: ' +
            (error instanceof Error ? error.message : 'Parse error'),
        ],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const CHUNKED_THRESHOLD = 100; // Use chunked loading above this many items

  const importServices = useCallback((services: Service[] | undefined, serviceReport: ValidationResult['serviceReport']) => {
    let serviceCount = 0;
    if (services && services.length > 0) {
      clearAllServices();

      const servicesToImport = services.map((s) => {
        if (
          serviceReport &&
          serviceReport.invalidCount > 0 &&
          importInvalidAsPlanned
        ) {
          const serviceIssues = serviceReport.issues.filter((i) =>
            i.startsWith(s.id + ':'),
          );
          if (serviceIssues.length > 0) {
            return { ...s, status: 'planned' as const };
          }
        }
        return s;
      });

      importServicesAction(servicesToImport);
      serviceCount = servicesToImport.length;
    }
    return serviceCount;
  }, [clearAllServices, importServicesAction, importInvalidAsPlanned]);

  const handleImport = useCallback(async () => {
    if (!validation?.valid || !validation.topology) return;

    const topology = validation.topology;
    const totalItems = topology.nodes.length + topology.edges.length;

    if (totalItems >= CHUNKED_THRESHOLD) {
      // Use chunked loading for large topologies
      setIsChunkedLoading(true);
      setChunkedProgress(0);
      setChunkedStatus('Starting import...');

      try {
        const resultPromise = loadTopologyChunked(topology, {
          onProgress: (progress, statusText) => {
            setChunkedProgress(progress);
            setChunkedStatus(statusText);
          },
        });

        // Store cancel handle
        cancelHandleRef.current = (resultPromise as ChunkedLoadPromise).cancelHandle || null;

        const result = await resultPromise;

        if (result.cancelled) {
          addToast({
            type: 'warning',
            title: 'Import cancelled',
            message: 'Topology was rolled back to its previous state.',
            duration: 4000,
          });
        } else {
          // Import services after topology load
          const serviceCount = importServices(validation.services, validation.serviceReport);
          const serviceMsg = serviceCount > 0 ? ` and ${serviceCount} services` : '';
          addToast({
            type: 'success',
            title: 'Import successful',
            message: `Loaded "${topology.name}" with ${result.nodesLoaded} nodes, ${result.edgesLoaded} edges${serviceMsg}`,
            duration: 4000,
          });
        }
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Import failed',
          message: err instanceof Error ? err.message : 'Unknown error during import',
          duration: 6000,
        });
      } finally {
        setIsChunkedLoading(false);
        cancelHandleRef.current = null;
        handleClose();
      }
    } else {
      // Small topology: use synchronous loadTopology
      loadTopology(topology);

      const serviceCount = importServices(validation.services, validation.serviceReport);

      const serviceMsg = serviceCount > 0 ? ` and ${serviceCount} services` : '';
      addToast({
        type: 'success',
        title: 'Import successful',
        message: `Loaded "${topology.name}" with ${topology.nodes.length} nodes, ${topology.edges.length} edges${serviceMsg}`,
        duration: 4000,
      });

      handleClose();
    }
  }, [validation, loadTopology, addToast, importServices]);

  const handleCancelChunkedLoad = useCallback(() => {
    cancelHandleRef.current?.cancel();
  }, []);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const hasServices = validation?.services && validation.services.length > 0;
  const hasInvalidServices = (validation?.serviceReport?.invalidCount || 0) > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[520px]" data-testid="import-modal" hideClose>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Network
          </DialogTitle>
          <DialogDescription>
            Load a network topology from a previously exported JSON file. This will replace your
            current topology.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-4">
          {/* File input area */}
          <div
            className="hover:border-accent/50 hover:bg-tertiary/50 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-6 transition-colors"
            onClick={handleBrowseClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleBrowseClick()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="import-file-input"
            />
            <FileJson className="mb-2 h-10 w-10 text-text-tertiary" />
            <p className="text-sm text-text-primary">
              {selectedFile ? selectedFile.name : 'Click to select a JSON file'}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                : 'Maximum file size: 10MB'}
            </p>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <span className="ml-2 text-sm text-text-secondary">Validating file...</span>
            </div>
          )}

          {/* Validation result */}
          {validation && !isLoading && (
            <div
              className={`rounded-lg border p-4 ${
                validation.valid
                  ? 'border-success/30 bg-success/10'
                  : 'border-danger/30 bg-danger/10'
              }`}
            >
              {validation.valid && validation.topology ? (
                <>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Valid topology file{validation.isV2Format ? ' (v2.0)' : ''}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-sm">
                    <div className="text-text-secondary">Name:</div>
                    <div className="text-text-primary">{validation.topology.name}</div>
                    <div className="text-text-secondary">Nodes:</div>
                    <div className="text-text-primary">{validation.topology.nodes.length}</div>
                    <div className="text-text-secondary">Edges:</div>
                    <div className="text-text-primary">{validation.topology.edges.length}</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-danger">
                    <AlertCircle className="h-4 w-4" />
                    Validation errors
                  </div>
                  <ul className="list-inside list-disc space-y-1 text-sm text-text-secondary">
                    {validation.errors.slice(0, 5).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                    {validation.errors.length > 5 && (
                      <li className="text-text-tertiary">
                        ...and {validation.errors.length - 5} more errors
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* Service validation section */}
          {validation?.valid && hasServices && validation.serviceReport && (
            <div
              className={`rounded-lg border p-4 ${
                hasInvalidServices
                  ? 'border-warning/30 bg-warning/10'
                  : 'border-success/30 bg-success/10'
              }`}
            >
              <div
                className={`mb-2 flex items-center gap-2 text-sm font-medium ${hasInvalidServices ? 'text-warning' : 'text-success'}`}
              >
                {hasInvalidServices ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Services: {validation.serviceReport.total} found (
                {validation.serviceReport.l1Count} L1, {validation.serviceReport.l2Count} L2,{' '}
                {validation.serviceReport.l3Count} L3)
              </div>

              {hasInvalidServices && (
                <>
                  <p className="mb-2 text-sm text-text-secondary">
                    {validation.serviceReport.invalidCount} of{' '}
                    {validation.serviceReport.total} services have invalid references
                  </p>
                  <ul className="mb-3 list-inside list-disc space-y-0.5 text-xs text-text-tertiary">
                    {validation.serviceReport.issues.slice(0, 3).map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                    {validation.serviceReport.issues.length > 3 && (
                      <li>
                        ...and {validation.serviceReport.issues.length - 3} more issues
                      </li>
                    )}
                  </ul>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="import-invalid-planned"
                      checked={importInvalidAsPlanned}
                      onCheckedChange={(checked) =>
                        setImportInvalidAsPlanned(checked === true)
                      }
                      data-testid="import-invalid-as-planned"
                    />
                    <label
                      htmlFor="import-invalid-planned"
                      className="cursor-pointer text-xs text-text-secondary"
                    >
                      Import invalid services as &quot;planned&quot; status
                    </label>
                  </div>
                </>
              )}

              {!hasInvalidServices && (
                <p className="text-sm text-text-secondary">
                  All service references validated successfully
                </p>
              )}
            </div>
          )}

          {/* Warning about replacing current topology */}
          {validation?.valid && (
            <div className="border-warning/30 bg-warning/10 flex items-start gap-2 rounded-lg border p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-sm text-text-secondary">
                Importing will replace your current topology
                {hasServices ? ' and services' : ''}. Make sure to export your current work
                first if needed.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={!validation?.valid || isLoading || isChunkedLoading}
            data-testid="import-confirm"
          >
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Chunked loading progress overlay */}
      <LoadingOverlay
        open={isChunkedLoading}
        progress={chunkedProgress}
        statusText={chunkedStatus}
        title="Importing large topology..."
        onCancel={handleCancelChunkedLoad}
      />
    </Dialog>
  );
};
