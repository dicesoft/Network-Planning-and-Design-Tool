/**
 * DefragWizardExport - Step 5: Export results and Apply defragmentation
 *
 * Export buttons (JSON/CSV) and two-phase commit Apply with:
 * - Safety restrictions: V1 only planned/inactive services
 * - Two-stage confirmation: summary dialog + "Type CONFIRM" input
 * - Undo snapshot stored in context state
 * - Persistent toast with "Undo" button for 10 seconds
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useDefragWizard, type DefragUndoSnapshot } from './DefragWizardContext';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useUIStore } from '@/stores/uiStore';
import { isL1DWDMService } from '@/types/service';
import type { L1DWDMService } from '@/types/service';
import { validateDefragMoves as _validateDefragMoves } from '@/core/services/defragMoveValidation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FileJson,
  FileSpreadsheet,
  Play,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
  Undo2,
} from 'lucide-react';

// ============================================================================
// VALIDATION (re-exported from shared core module)
// ============================================================================

export const validateDefragMoves = _validateDefragMoves;

// ============================================================================
// COMPONENT
// ============================================================================

export const DefragWizardExport: React.FC = () => {
  const { state, dispatch } = useDefragWizard();
  const services = useServiceStore((s) => s.services);
  const addToast = useUIStore((s) => s.addToast);

  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const plan = state.plan;

  // Validate moves
  const validation = useMemo(() => {
    if (!plan || plan.moves.length === 0) return null;
    return validateDefragMoves(plan.moves, services);
  }, [plan, services]);

  // Export handlers
  const handleExportJSON = useCallback(() => {
    if (!plan) return;
    const data = {
      ...plan,
      exportedAt: new Date().toISOString(),
      label: 'Estimated',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `defrag-plan-${plan.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [plan]);

  const handleExportCSV = useCallback(() => {
    if (!plan) return;
    const headers = ['#', 'Edge ID', 'Service ID', 'From Channel', 'To Channel', 'Risk', 'Est. Downtime (s)'];
    const rows = plan.moves.map((m, i) => [
      i + 1,
      m.edgeId,
      m.serviceId,
      m.fromChannel,
      m.toChannel,
      m.risk || 'low',
      m.estimatedDowntime || 0,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `defrag-moves-${plan.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [plan]);

  // Apply defragmentation via the consolidated store action.
  // Two-phase commit + integrity check now lives in serviceStore.applyDefragMoves.
  const handleApply = useCallback(() => {
    if (!plan || !validation) return;
    if (validation.allowedMoves.length === 0) return;

    setIsApplying(true);

    try {
      const result = useServiceStore.getState().applyDefragMoves(plan);

      if (!result.success) {
        // Integrity-check failure path returns a snapshot — roll back.
        if (result.snapshot) {
          rollbackDefrag(result.snapshot as DefragUndoSnapshot);
        }
        addToast({
          type: 'error',
          title: 'Defrag apply failed',
          message: result.error || 'Unknown error',
        });
        setIsApplying(false);
        setShowApplyDialog(false);
        return;
      }

      // Success — record snapshot for the wizard's Undo button and update UI.
      if (result.snapshot) {
        dispatch({ type: 'SET_UNDO_SNAPSHOT', snapshot: result.snapshot as DefragUndoSnapshot });
      }
      dispatch({ type: 'SET_APPLIED', applied: true });

      addToast({
        type: 'success',
        title: 'Defragmentation applied',
        message: `${result.appliedMoveCount ?? 0} channel moves applied successfully.`,
        duration: 10000,
      });

      setIsApplying(false);
      setShowApplyDialog(false);
      setConfirmText('');
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Defrag apply failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
      setIsApplying(false);
      setShowApplyDialog(false);
    }
  }, [plan, validation, dispatch, addToast]);

  // Undo defragmentation
  const handleUndo = useCallback(() => {
    if (!state.undoSnapshot) return;
    rollbackDefrag(state.undoSnapshot);
    dispatch({ type: 'SET_APPLIED', applied: false });
    dispatch({ type: 'SET_UNDO_SNAPSHOT', snapshot: null });
    addToast({
      type: 'info',
      title: 'Defragmentation undone',
      message: 'All channel moves have been reverted.',
    });
  }, [state.undoSnapshot, dispatch, addToast]);

  if (!plan) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-muted">
        No plan available. Go back to review moves.
      </div>
    );
  }

  const canApply = plan.moves.length > 0 && !state.applied && validation && validation.allowedMoves.length > 0;
  const hasBlockedMoves = validation && validation.blockedMoves.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Export buttons */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Export Plan</h3>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleExportJSON}>
            <FileJson className="mr-1.5 h-3.5 w-3.5" />
            Export JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Apply section */}
      <div className="rounded-lg border border-border bg-elevated p-4">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Apply Defragmentation</h3>

        {state.applied ? (
          <div className="flex flex-col gap-3">
            <div className="bg-success/10 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-success">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>Defragmentation has been applied successfully.</span>
            </div>
            {state.undoSnapshot && (
              <Button variant="outline" size="sm" onClick={handleUndo} className="w-fit">
                <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                Undo Defragmentation
              </Button>
            )}
          </div>
        ) : plan.moves.length === 0 ? (
          <p className="text-xs text-text-muted">No moves to apply.</p>
        ) : (
          <>
            {/* Validation warnings/errors */}
            {validation && validation.warnings.length > 0 && (
              <div className="mb-3 flex flex-col gap-1">
                {validation.warnings.map((w, i) => (
                  <div key={i} className="bg-warning/10 flex items-start gap-2 rounded-md px-3 py-2 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            {hasBlockedMoves && (
              <div className="mb-3 flex flex-col gap-1">
                {validation!.errors.map((e, i) => (
                  <div key={i} className="bg-danger/10 flex items-start gap-2 rounded-md px-3 py-2 text-xs text-danger">
                    <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    {e}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                <span>{validation?.allowedMoves.length || 0} moves can be applied</span>
                {hasBlockedMoves && (
                  <>
                    <span className="text-text-muted">|</span>
                    <ShieldAlert className="h-3.5 w-3.5 text-danger" />
                    <span>{validation?.blockedMoves.length || 0} blocked</span>
                  </>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => setShowApplyDialog(true)}
                disabled={!canApply}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Apply Defragmentation
              </Button>
            </div>

            <p className="mt-2 text-xs text-text-muted">
              V1: Only planned and inactive services can be defragmented.
              Active services without protection are blocked.
            </p>
          </>
        )}
      </div>

      {/* Two-stage confirmation dialog */}
      <ApplyConfirmDialog
        open={showApplyDialog}
        onClose={() => {
          setShowApplyDialog(false);
          setConfirmText('');
        }}
        onConfirm={handleApply}
        confirmText={confirmText}
        setConfirmText={setConfirmText}
        moveCount={validation?.allowedMoves.length || 0}
        serviceCount={new Set(validation?.allowedMoves.map((m) => m.serviceId) || []).size}
        isApplying={isApplying}
      />
    </div>
  );
};

// ============================================================================
// APPLY CONFIRMATION DIALOG
// ============================================================================

const ApplyConfirmDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmText: string;
  setConfirmText: (v: string) => void;
  moveCount: number;
  serviceCount: number;
  isApplying: boolean;
}> = ({ open, onClose, onConfirm, confirmText, setConfirmText, moveCount, serviceCount, isApplying }) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-md" hideClose>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Confirm Defragmentation
        </DialogTitle>
        <DialogDescription>
          This will modify channel assignments for {serviceCount} service{serviceCount !== 1 ? 's' : ''} across {moveCount} move{moveCount !== 1 ? 's' : ''}.
          This action can be undone.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3 px-6 py-4">
        <div className="rounded-md bg-tertiary p-3 text-xs text-text-secondary">
          <p className="mb-1 font-medium text-text-primary">What will happen:</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>{moveCount} channel{moveCount !== 1 ? 's' : ''} will be relocated</li>
            <li>{serviceCount} service{serviceCount !== 1 ? 's' : ''} will be updated</li>
            <li>Spectrum allocations will be modified</li>
          </ul>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-primary">
            Type CONFIRM to proceed:
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="CONFIRM"
            className="font-mono text-sm"
            autoFocus
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose} disabled={isApplying}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={confirmText !== 'CONFIRM' || isApplying}
        >
          {isApplying ? 'Applying...' : 'Apply Defragmentation'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ============================================================================
// ROLLBACK
// ============================================================================

function rollbackDefrag(snapshot: DefragUndoSnapshot): void {
  const serviceStore = useServiceStore.getState();
  const networkStore = useNetworkStore.getState();

  // 1. Revert service channel numbers
  for (const svcSnap of snapshot.serviceSnapshots) {
    const service = serviceStore.getService(svcSnap.serviceId);
    if (!service || !isL1DWDMService(service)) continue;
    const l1 = service as L1DWDMService;

    serviceStore.updateService(svcSnap.serviceId, {
      channelNumber: svcSnap.channelNumber,
      workingPath: {
        ...l1.workingPath,
        channelNumber: svcSnap.channelNumber,
      },
    } as Partial<L1DWDMService>);
  }

  // 2. Revert spectrum allocations
  // First deallocate current allocations for affected edges
  const edgeAllocGroups = new Map<string, typeof snapshot.spectrumSnapshots>();
  for (const alloc of snapshot.spectrumSnapshots) {
    const key = `${alloc.nodeId}:${alloc.portId}`;
    const group = edgeAllocGroups.get(key) || [];
    group.push(alloc);
    edgeAllocGroups.set(key, group);
  }

  // Deallocate current, then restore from snapshot
  for (const [, allocs] of edgeAllocGroups) {
    if (allocs.length === 0) continue;
    const { nodeId, portId } = allocs[0];

    // Deallocate all the allocation IDs
    const allocIds = allocs.map((a) => a.allocationId);
    networkStore.deallocateChannels(nodeId, portId, allocIds);

    // Re-allocate with original values
    const restoredAllocations = allocs.map((a) => ({
      id: a.allocationId,
      channelNumber: a.channelNumber,
      status: a.status,
      label: a.label,
      edgeId: a.edgeId,
    }));

    networkStore.allocateChannels(nodeId, portId, restoredAllocations, allocs[0].edgeId);
  }
}
