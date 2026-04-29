/**
 * DefragWizard - 5-step defragmentation wizard modal
 *
 * Steps: Select Edge -> Strategy -> Review Moves -> Simulate -> Export/Apply
 * Step indicator with checkmarks, clickable completed steps, max-w-5xl (1100px) dialog,
 * cancel confirmation if past Step 1, focus management on step transitions.
 * Auto-skips Strategy step if single edge selected.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, AlertTriangle } from 'lucide-react';
import {
  DefragWizardProvider,
  useDefragWizard,
  DEFRAG_WIZARD_STEPS,
  DEFRAG_STEP_CONFIG,
} from './DefragWizardContext';
import { DefragWizardSelect } from './DefragWizardSelect';
import { DefragWizardStrategy } from './DefragWizardStrategy';
import { DefragWizardReview } from './DefragWizardReview';
import { DefragWizardSimulate } from './DefragWizardSimulate';
import { DefragWizardExport } from './DefragWizardExport';
import type { EdgeFragmentation } from '@/core/services/DefragmentationEngine';

// ============================================================================
// STEP INDICATOR
// ============================================================================

const StepIndicator: React.FC = () => {
  const { state, goToStep, isStepComplete, getStepIndex, getCurrentStepIndex } = useDefragWizard();
  const currentIndex = getCurrentStepIndex();

  return (
    <div className="flex items-center gap-2">
      {DEFRAG_WIZARD_STEPS.map((step, idx) => {
        const config = DEFRAG_STEP_CONFIG[step];
        const isComplete = isStepComplete(step);
        const isCurrent = state.currentStep === step;
        const isPast = idx < currentIndex;

        return (
          <React.Fragment key={step}>
            {idx > 0 && (
              <div
                className={cn(
                  'h-px w-6',
                  isPast || isComplete ? 'bg-accent' : 'bg-border'
                )}
              />
            )}
            <button
              type="button"
              onClick={() => goToStep(step)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                isCurrent && 'bg-accent/10 text-accent font-medium',
                !isCurrent && isComplete && 'text-text-secondary hover:text-text-primary cursor-pointer',
                !isCurrent && !isComplete && idx > currentIndex && 'text-text-muted cursor-not-allowed'
              )}
              disabled={!isComplete && getStepIndex(step) > currentIndex}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium',
                  isCurrent && 'bg-accent text-white',
                  isComplete && !isCurrent && 'bg-success text-white',
                  !isCurrent && !isComplete && 'bg-tertiary text-text-muted'
                )}
              >
                {isComplete && !isCurrent ? (
                  <Check className="h-3 w-3" />
                ) : (
                  idx + 1
                )}
              </span>
              <span className="hidden md:inline">{config.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ============================================================================
// CANCEL CONFIRMATION
// ============================================================================

const CancelConfirmDialog: React.FC<{
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, onConfirm, onCancel }) => (
  <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
    <DialogContent className="max-w-sm" hideClose>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Cancel Defragmentation?
        </DialogTitle>
        <DialogDescription>
          You have unsaved progress. Are you sure you want to cancel the defragmentation wizard?
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Continue Editing
        </Button>
        <Button variant="destructive" size="sm" onClick={onConfirm}>
          Discard & Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ============================================================================
// WIZARD CONTENT
// ============================================================================

interface DefragWizardContentProps {
  onClose: () => void;
  onRequestClose: () => void;
}

const DefragWizardContent: React.FC<DefragWizardContentProps> = ({ onClose, onRequestClose }) => {
  const { state, goToNextStep, goToPreviousStep, getCurrentStepIndex } = useDefragWizard();
  const [validationError, setValidationError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Focus management on step transitions
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.focus();
    }
    setValidationError(null);
  }, [state.currentStep]);

  // Clear validation error when user selects edges
  useEffect(() => {
    if (state.selectedEdgeIds.length > 0 && validationError) {
      setValidationError(null);
    }
  }, [state.selectedEdgeIds.length, validationError]);

  const handleNextStep = useCallback(() => {
    // Validate current step before proceeding
    if (state.currentStep === 'select' && state.selectedEdgeIds.length === 0) {
      setValidationError('Please select at least one edge to defragment.');
      return;
    }
    setValidationError(null);
    goToNextStep();
  }, [state.currentStep, state.selectedEdgeIds.length, goToNextStep]);

  const currentIndex = getCurrentStepIndex();
  const isLastStep = currentIndex === DEFRAG_WIZARD_STEPS.length - 1;
  // After successful Apply, the wizard exposes a Done shortcut that bypasses
  // the cancel-confirm flow (no unsaved progress to discard).
  const showDone = isLastStep && state.applied;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Defragmentation Wizard</DialogTitle>
        <DialogDescription>
          {DEFRAG_STEP_CONFIG[state.currentStep].description}
        </DialogDescription>
        <StepIndicator />
      </DialogHeader>

      <div
        ref={contentRef}
        className="max-h-[60vh] overflow-y-auto p-6"
        tabIndex={-1}
      >
        {state.currentStep === 'select' && <DefragWizardSelect />}
        {state.currentStep === 'strategy' && <DefragWizardStrategy />}
        {state.currentStep === 'review' && <DefragWizardReview />}
        {state.currentStep === 'simulate' && <DefragWizardSimulate />}
        {state.currentStep === 'export' && <DefragWizardExport />}
      </div>

      <DialogFooter>
        <div className="flex w-full flex-col gap-2">
          {validationError && (
            <div className="bg-danger/10 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-danger">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {validationError}
            </div>
          )}
          <div className="flex w-full items-center justify-between">
            <Button variant="outline" size="sm" onClick={onRequestClose}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              {currentIndex > 0 && (
                <Button variant="outline" size="sm" onClick={goToPreviousStep}>
                  Back
                </Button>
              )}
              {!isLastStep && (
                <Button size="sm" onClick={handleNextStep} disabled={state.isComputing}>
                  Next
                </Button>
              )}
              {showDone && (
                <Button size="sm" onClick={onClose} data-testid="defrag-wizard-done">
                  Done
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogFooter>
    </>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export interface DefragWizardProps {
  open: boolean;
  onClose: () => void;
  edgeFragmentations: EdgeFragmentation[];
}

export const DefragWizard: React.FC<DefragWizardProps> = ({
  open,
  onClose,
  edgeFragmentations,
}) => {
  const [sessionId, setSessionId] = useState(0);
  const prevOpenRef = useRef(open);

  useEffect(() => {
    if (!prevOpenRef.current && open) {
      setSessionId((s) => s + 1);
    }
    prevOpenRef.current = open;
  }, [open]);

  return (
    <DefragWizardProvider key={sessionId} initialEdgeFragmentations={edgeFragmentations}>
      <DefragWizardShell open={open} onClose={onClose} />
    </DefragWizardProvider>
  );
};

/**
 * Shell lives inside the provider so it can read wizard state to decide
 * whether dismissing the dialog needs a cancel-confirm gate.
 *
 * All close paths (built-in X click, Esc key, outside click, footer Cancel)
 * route through `requestClose()`, which either closes immediately or shows
 * the confirmation dialog when there is unsaved progress.
 */
const DefragWizardShell: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { state, getCurrentStepIndex } = useDefragWizard();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const hasUnsavedProgress = useCallback(() => {
    // Past Step 1 with no successful Apply == unsaved work
    return getCurrentStepIndex() > 0 && !state.applied;
  }, [getCurrentStepIndex, state.applied]);

  const requestClose = useCallback(() => {
    if (hasUnsavedProgress()) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  }, [hasUnsavedProgress, onClose]);

  const handleConfirmCancel = useCallback(() => {
    setShowCancelConfirm(false);
    onClose();
  }, [onClose]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
      >
        <DialogContent className="max-w-5xl" aria-describedby="defrag-wizard-desc" hideClose>
          <span id="defrag-wizard-desc" className="sr-only">
            Defragmentation wizard for optimizing spectrum allocation
          </span>
          <DefragWizardContent onClose={onClose} onRequestClose={requestClose} />
        </DialogContent>
      </Dialog>

      <CancelConfirmDialog
        open={showCancelConfirm}
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </>
  );
};
