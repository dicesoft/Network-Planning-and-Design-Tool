/**
 * DefragWizardContext - State management for the Defragmentation Wizard
 *
 * Uses the same useReducer + React context pattern as ServiceWizardContext.
 * 5-step wizard: Select Edge -> Strategy -> Review Moves -> Simulate -> Export/Apply
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import type {
  DefragStrategy,
  DefragPlan,
  EdgeFragmentation,
} from '@/core/services/DefragmentationEngine';
import { DEFRAG_DEFAULT_MAX_MOVES, DEFRAG_MAX_MOVES_CEILING } from '@/core/services/DefragmentationEngine';

// ============================================================================
// WIZARD STEP DEFINITIONS
// ============================================================================

export type DefragWizardStep = 'select' | 'strategy' | 'review' | 'simulate' | 'export';

export const DEFRAG_WIZARD_STEPS: DefragWizardStep[] = ['select', 'strategy', 'review', 'simulate', 'export'];

export const DEFRAG_STEP_CONFIG: Record<DefragWizardStep, { label: string; description: string }> = {
  'select': {
    label: 'Select Edges',
    description: 'Choose edges to defragment',
  },
  'strategy': {
    label: 'Strategy',
    description: 'Choose defragmentation strategy',
  },
  'review': {
    label: 'Review Moves',
    description: 'Review proposed channel moves and risks',
  },
  'simulate': {
    label: 'Simulate',
    description: 'Compare before/after spectrum',
  },
  'export': {
    label: 'Export / Apply',
    description: 'Export results or apply defragmentation',
  },
};

// ============================================================================
// DEFRAG UNDO SNAPSHOT
// ============================================================================

export interface DefragUndoSnapshot {
  /** Service states before defrag (id -> channel numbers + status) */
  serviceSnapshots: Array<{
    serviceId: string;
    channelNumber: number;
    protectionChannelNumber?: number;
  }>;
  /** Port spectrum allocations before defrag */
  spectrumSnapshots: Array<{
    nodeId: string;
    portId: string;
    allocationId: string;
    channelNumber: number;
    status: 'allocated' | 'reserved';
    label: string;
    edgeId: string;
  }>;
}

// ============================================================================
// WIZARD STATE
// ============================================================================

export interface DefragWizardState {
  currentStep: DefragWizardStep;
  completedSteps: Set<DefragWizardStep>;

  // Step 1: Edge selection
  selectedEdgeIds: string[];
  edgeFragmentations: EdgeFragmentation[];

  // Step 2: Strategy
  strategy: DefragStrategy;

  // Cap for total moves in the plan (default 1000, ceiling 5000 — FR-005)
  maxMoves: number;

  // Step 3: Review (computed plan)
  plan: DefragPlan | null;

  // Step 4: Simulate
  beforeLambdaMaps: Map<string, Array<{ channelNumber: number; status: string; serviceId?: string }>>;
  afterLambdaMaps: Map<string, Array<{ channelNumber: number; status: string; serviceId?: string }>>;

  // Step 5: Export/Apply
  applied: boolean;
  undoSnapshot: DefragUndoSnapshot | null;

  // UI state
  isComputing: boolean;
}

const createInitialState = (): DefragWizardState => ({
  currentStep: 'select',
  completedSteps: new Set(),
  selectedEdgeIds: [],
  edgeFragmentations: [],
  strategy: 'minimal_moves',
  maxMoves: DEFRAG_DEFAULT_MAX_MOVES,
  plan: null,
  beforeLambdaMaps: new Map(),
  afterLambdaMaps: new Map(),
  applied: false,
  undoSnapshot: null,
  isComputing: false,
});

// ============================================================================
// ACTION TYPES
// ============================================================================

type DefragWizardAction =
  | { type: 'SET_STEP'; step: DefragWizardStep }
  | { type: 'MARK_STEP_COMPLETED'; step: DefragWizardStep }
  | { type: 'SET_SELECTED_EDGES'; edgeIds: string[] }
  | { type: 'TOGGLE_EDGE'; edgeId: string }
  | { type: 'SET_EDGE_FRAGMENTATIONS'; fragmentations: EdgeFragmentation[] }
  | { type: 'SET_STRATEGY'; strategy: DefragStrategy }
  | { type: 'SET_MAX_MOVES'; maxMoves: number }
  | { type: 'SET_PLAN'; plan: DefragPlan | null }
  | { type: 'SET_BEFORE_LAMBDA_MAPS'; maps: Map<string, Array<{ channelNumber: number; status: string; serviceId?: string }>> }
  | { type: 'SET_AFTER_LAMBDA_MAPS'; maps: Map<string, Array<{ channelNumber: number; status: string; serviceId?: string }>> }
  | { type: 'SET_COMPUTING'; isComputing: boolean }
  | { type: 'SET_APPLIED'; applied: boolean }
  | { type: 'SET_UNDO_SNAPSHOT'; snapshot: DefragUndoSnapshot | null }
  | { type: 'RESET' };

// ============================================================================
// REDUCER
// ============================================================================

function defragWizardReducer(state: DefragWizardState, action: DefragWizardAction): DefragWizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step };

    case 'MARK_STEP_COMPLETED': {
      const completedSteps = new Set(state.completedSteps);
      completedSteps.add(action.step);
      return { ...state, completedSteps };
    }

    case 'SET_SELECTED_EDGES':
      return { ...state, selectedEdgeIds: action.edgeIds };

    case 'TOGGLE_EDGE': {
      const exists = state.selectedEdgeIds.includes(action.edgeId);
      return {
        ...state,
        selectedEdgeIds: exists
          ? state.selectedEdgeIds.filter((id) => id !== action.edgeId)
          : [...state.selectedEdgeIds, action.edgeId],
      };
    }

    case 'SET_EDGE_FRAGMENTATIONS':
      return { ...state, edgeFragmentations: action.fragmentations };

    case 'SET_STRATEGY':
      return { ...state, strategy: action.strategy, plan: null };

    case 'SET_MAX_MOVES': {
      const clamped = Math.max(1, Math.min(DEFRAG_MAX_MOVES_CEILING, Math.floor(action.maxMoves) || 1));
      return { ...state, maxMoves: clamped, plan: null };
    }

    case 'SET_PLAN':
      return { ...state, plan: action.plan };

    case 'SET_BEFORE_LAMBDA_MAPS':
      return { ...state, beforeLambdaMaps: action.maps };

    case 'SET_AFTER_LAMBDA_MAPS':
      return { ...state, afterLambdaMaps: action.maps };

    case 'SET_COMPUTING':
      return { ...state, isComputing: action.isComputing };

    case 'SET_APPLIED':
      return { ...state, applied: action.applied };

    case 'SET_UNDO_SNAPSHOT':
      return { ...state, undoSnapshot: action.snapshot };

    case 'RESET':
      return createInitialState();

    default:
      return state;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

interface DefragWizardContextValue {
  state: DefragWizardState;
  dispatch: React.Dispatch<DefragWizardAction>;

  goToStep: (step: DefragWizardStep) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  canGoToStep: (step: DefragWizardStep) => boolean;
  isStepComplete: (step: DefragWizardStep) => boolean;
  getStepIndex: (step: DefragWizardStep) => number;
  getCurrentStepIndex: () => number;
  reset: () => void;
}

const DefragWizardContext = createContext<DefragWizardContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface DefragWizardProviderProps {
  children: React.ReactNode;
  initialEdgeFragmentations?: EdgeFragmentation[];
}

export const DefragWizardProvider: React.FC<DefragWizardProviderProps> = ({
  children,
  initialEdgeFragmentations,
}) => {
  const [state, dispatch] = useReducer(defragWizardReducer, {
    ...createInitialState(),
    edgeFragmentations: initialEdgeFragmentations || [],
  });

  const getStepIndex = useCallback((step: DefragWizardStep) => DEFRAG_WIZARD_STEPS.indexOf(step), []);
  const getCurrentStepIndex = useCallback(() => getStepIndex(state.currentStep), [state.currentStep, getStepIndex]);

  const isStepComplete = useCallback(
    (step: DefragWizardStep) => state.completedSteps.has(step),
    [state.completedSteps]
  );

  const canGoToStep = useCallback(
    (step: DefragWizardStep) => {
      const targetIndex = getStepIndex(step);
      const currentIndex = getCurrentStepIndex();
      if (targetIndex < currentIndex) return true;
      for (let i = 0; i < targetIndex; i++) {
        if (!isStepComplete(DEFRAG_WIZARD_STEPS[i])) return false;
      }
      return true;
    },
    [getStepIndex, getCurrentStepIndex, isStepComplete]
  );

  const goToStep = useCallback(
    (step: DefragWizardStep) => {
      if (canGoToStep(step)) {
        dispatch({ type: 'SET_STEP', step });
      }
    },
    [canGoToStep]
  );

  const goToNextStep = useCallback(() => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex < DEFRAG_WIZARD_STEPS.length - 1) {
      dispatch({ type: 'MARK_STEP_COMPLETED', step: state.currentStep });
      const nextIndex = currentIndex + 1;
      dispatch({ type: 'SET_STEP', step: DEFRAG_WIZARD_STEPS[nextIndex] });
    }
  }, [getCurrentStepIndex, state.currentStep]);

  const goToPreviousStep = useCallback(() => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex > 0) {
      dispatch({ type: 'SET_STEP', step: DEFRAG_WIZARD_STEPS[currentIndex - 1] });
    }
  }, [getCurrentStepIndex]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const contextValue = useMemo<DefragWizardContextValue>(
    () => ({
      state,
      dispatch,
      goToStep,
      goToNextStep,
      goToPreviousStep,
      canGoToStep,
      isStepComplete,
      getStepIndex,
      getCurrentStepIndex,
      reset,
    }),
    [state, goToStep, goToNextStep, goToPreviousStep, canGoToStep, isStepComplete, getStepIndex, getCurrentStepIndex, reset]
  );

  return (
    <DefragWizardContext.Provider value={contextValue}>
      {children}
    </DefragWizardContext.Provider>
  );
};

// ============================================================================
// HOOK
// ============================================================================

export const useDefragWizard = (): DefragWizardContextValue => {
  const context = useContext(DefragWizardContext);
  if (!context) {
    throw new Error('useDefragWizard must be used within a DefragWizardProvider');
  }
  return context;
};

export default DefragWizardContext;
