/**
 * ServiceWizardContext - Shared state management for the Service Creation Wizard
 *
 * Provides a React context for managing wizard state across all steps,
 * including form data, validation, navigation, and computed results.
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import type {
  ServiceType,
  L1DataRate,
  ModulationType,
  ChannelWidth,
  WavelengthMode,
  ProtectionScheme,
  IPProtectionScheme,
  PathComputationMode,
  ServicePath,
  SRLGRiskAnalysis,
  BFDConfig,
  ValidationMessage,
} from '@/types/service';
import type { PathResult } from '@/core/graph/PathFinder';

// ============================================================================
// WIZARD STEP DEFINITIONS
// ============================================================================

export type WizardStep = 'endpoints' | 'parameters' | 'path' | 'protection' | 'review';

export const WIZARD_STEPS: WizardStep[] = ['endpoints', 'parameters', 'path', 'protection', 'review'];

export const WIZARD_STEP_CONFIG: Record<WizardStep, { label: string; description: string }> = {
  endpoints: {
    label: 'Endpoints',
    description: 'Select source and destination nodes',
  },
  parameters: {
    label: 'Parameters',
    description: 'Configure service parameters',
  },
  path: {
    label: 'Path',
    description: 'Compute and select working path',
  },
  protection: {
    label: 'Protection',
    description: 'Configure protection and backup path',
  },
  review: {
    label: 'Review',
    description: 'Review and create service',
  },
};

// ============================================================================
// WIZARD STATE
// ============================================================================

/**
 * Computed path result with additional metadata
 */
export interface ComputedPath {
  pathResult: PathResult;
  servicePath: ServicePath;
  channelNumber?: number;
  channelAssignments?: { edgeId: string; channelNumber: number }[];
}

/**
 * Full wizard state
 */
export interface WizardState {
  // Edit Mode
  mode: 'create' | 'edit';
  editingServiceId?: string;

  // Navigation
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
  isSubmitting: boolean;

  // Step 1: Service Type & Endpoints
  serviceType: ServiceType;
  name: string;
  sourceNodeId: string;
  sourcePortId: string;
  destinationNodeId: string;
  destinationPortId: string;

  // Step 2: Parameters (L1 specific)
  dataRate: L1DataRate;
  modulationType: ModulationType;
  channelWidth: ChannelWidth;
  wavelengthMode: WavelengthMode;
  requestedChannelNumber?: number;
  transceiverTypeId?: string;

  // Step 2: Parameters (L2/L3 specific)
  ipProtectionScheme: IPProtectionScheme;
  underlayServiceId: string;
  autoCreateUnderlay: boolean;
  bfdConfig: BFDConfig;
  underlayChannelNumber?: number; // Auto-computed channel for auto-created L1 underlay
  underlayChannelWarning?: string; // Warning if no channel available

  // Step 3: Path Computation
  pathComputationMode: PathComputationMode;
  pathSelectionMode: 'compute' | 'accept-underlay'; // How path was chosen (L2/L3 only)
  kValue: number; // k-value for k-shortest/disjoint paths
  computedPaths: ComputedPath[];
  selectedPathIndex: number;
  workingPath?: ServicePath;
  computedChannelNumber?: number; // Auto-assigned channel number for L1 services

  // Step 4: Protection
  protectionScheme: ProtectionScheme;
  protectionPath?: ServicePath;
  srlgAnalysis?: SRLGRiskAnalysis;

  // Validation
  validationMessages: ValidationMessage[];
  stepErrors: Record<WizardStep, string[]>;
}

/**
 * Initial wizard state
 */
const createInitialState = (): WizardState => ({
  // Edit Mode
  mode: 'create',
  editingServiceId: undefined,

  // Navigation
  currentStep: 'endpoints',
  completedSteps: new Set(),
  isSubmitting: false,

  // Step 1: Endpoints
  serviceType: 'l1-dwdm',
  name: '',
  sourceNodeId: '',
  sourcePortId: '',
  destinationNodeId: '',
  destinationPortId: '',

  // Step 2: L1 Parameters
  dataRate: '100G',
  modulationType: 'DP-QPSK',
  channelWidth: '50GHz',
  wavelengthMode: 'continuous',
  requestedChannelNumber: undefined,
  transceiverTypeId: undefined,

  // Step 2: L2/L3 Parameters
  ipProtectionScheme: 'none',
  underlayServiceId: '',
  underlayChannelNumber: undefined,
  underlayChannelWarning: undefined,
  autoCreateUnderlay: true,
  bfdConfig: {
    enabled: false,
    minTxInterval: 300000,
    minRxInterval: 300000,
    multiplier: 3,
  },

  // Step 3: Path
  pathComputationMode: 'shortest-path',
  pathSelectionMode: 'compute',
  kValue: 3, // Default k-value for k-shortest/disjoint paths
  computedPaths: [],
  selectedPathIndex: 0,
  workingPath: undefined,
  computedChannelNumber: undefined,

  // Step 4: Protection
  protectionScheme: 'none',
  protectionPath: undefined,
  srlgAnalysis: undefined,

  // Validation
  validationMessages: [],
  stepErrors: {
    endpoints: [],
    parameters: [],
    path: [],
    protection: [],
    review: [],
  },
});

// ============================================================================
// ACTION TYPES
// ============================================================================

type WizardAction =
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'MARK_STEP_COMPLETED'; step: WizardStep }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_SERVICE_TYPE'; serviceType: ServiceType }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_SOURCE_NODE'; nodeId: string; portId?: string }
  | { type: 'SET_DESTINATION_NODE'; nodeId: string; portId?: string }
  | { type: 'SET_DATA_RATE'; dataRate: L1DataRate }
  | { type: 'SET_MODULATION'; modulationType: ModulationType }
  | { type: 'SET_CHANNEL_WIDTH'; channelWidth: ChannelWidth }
  | { type: 'SET_WAVELENGTH_MODE'; wavelengthMode: WavelengthMode }
  | { type: 'SET_REQUESTED_CHANNEL'; channelNumber: number | undefined }
  | { type: 'SET_TRANSCEIVER'; transceiverTypeId: string | undefined }
  | { type: 'SET_IP_PROTECTION'; scheme: IPProtectionScheme }
  | { type: 'SET_UNDERLAY_SERVICE'; serviceId: string }
  | { type: 'SET_AUTO_CREATE_UNDERLAY'; autoCreate: boolean }
  | { type: 'SET_BFD_CONFIG'; config: Partial<BFDConfig> }
  | { type: 'SET_UNDERLAY_CHANNEL'; channelNumber: number | undefined; warning?: string }
  | { type: 'SET_PATH_COMPUTATION_MODE'; mode: PathComputationMode }
  | { type: 'SET_PATH_SELECTION_MODE'; mode: 'compute' | 'accept-underlay' }
  | { type: 'SET_K_VALUE'; kValue: number }
  | { type: 'SET_COMPUTED_PATHS'; paths: ComputedPath[] }
  | { type: 'SELECT_PATH'; index: number }
  | { type: 'SET_WORKING_PATH'; path: ServicePath }
  | { type: 'SET_COMPUTED_CHANNEL'; channelNumber: number | undefined }
  | { type: 'SET_PROTECTION_SCHEME'; scheme: ProtectionScheme }
  | { type: 'SET_PROTECTION_PATH'; path: ServicePath | undefined }
  | { type: 'SET_SRLG_ANALYSIS'; analysis: SRLGRiskAnalysis | undefined }
  | { type: 'SET_VALIDATION_MESSAGES'; messages: ValidationMessage[] }
  | { type: 'SET_STEP_ERRORS'; step: WizardStep; errors: string[] }
  | { type: 'RESET' };

// ============================================================================
// REDUCER
// ============================================================================

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step };

    case 'MARK_STEP_COMPLETED': {
      const completedSteps = new Set(state.completedSteps);
      completedSteps.add(action.step);
      return { ...state, completedSteps };
    }

    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.isSubmitting };

    case 'SET_SERVICE_TYPE':
      // Reset relevant fields when service type changes
      return {
        ...state,
        serviceType: action.serviceType,
        protectionScheme: 'none',
        ipProtectionScheme: 'none',
        computedPaths: [],
        workingPath: undefined,
        protectionPath: undefined,
        srlgAnalysis: undefined,
      };

    case 'SET_NAME':
      return { ...state, name: action.name };

    case 'SET_SOURCE_NODE':
      return {
        ...state,
        sourceNodeId: action.nodeId,
        sourcePortId: action.portId || '',
        // Clear paths when endpoints change
        computedPaths: [],
        workingPath: undefined,
        protectionPath: undefined,
      };

    case 'SET_DESTINATION_NODE':
      return {
        ...state,
        destinationNodeId: action.nodeId,
        destinationPortId: action.portId || '',
        // Clear paths when endpoints change
        computedPaths: [],
        workingPath: undefined,
        protectionPath: undefined,
      };

    case 'SET_DATA_RATE':
      return { ...state, dataRate: action.dataRate };

    case 'SET_MODULATION':
      return { ...state, modulationType: action.modulationType };

    case 'SET_CHANNEL_WIDTH':
      return { ...state, channelWidth: action.channelWidth };

    case 'SET_WAVELENGTH_MODE':
      return { ...state, wavelengthMode: action.wavelengthMode };

    case 'SET_REQUESTED_CHANNEL':
      return { ...state, requestedChannelNumber: action.channelNumber };

    case 'SET_TRANSCEIVER':
      return { ...state, transceiverTypeId: action.transceiverTypeId };

    case 'SET_IP_PROTECTION':
      return { ...state, ipProtectionScheme: action.scheme };

    case 'SET_UNDERLAY_SERVICE':
      return { ...state, underlayServiceId: action.serviceId, autoCreateUnderlay: !action.serviceId };

    case 'SET_AUTO_CREATE_UNDERLAY':
      return { ...state, autoCreateUnderlay: action.autoCreate, underlayServiceId: action.autoCreate ? '' : state.underlayServiceId };

    case 'SET_BFD_CONFIG':
      return { ...state, bfdConfig: { ...state.bfdConfig, ...action.config } };

    case 'SET_UNDERLAY_CHANNEL':
      return { ...state, underlayChannelNumber: action.channelNumber, underlayChannelWarning: action.warning };

    case 'SET_PATH_COMPUTATION_MODE':
      return { ...state, pathComputationMode: action.mode };

    case 'SET_PATH_SELECTION_MODE':
      return { ...state, pathSelectionMode: action.mode };

    case 'SET_K_VALUE':
      return { ...state, kValue: action.kValue };

    case 'SET_COMPUTED_PATHS':
      return { ...state, computedPaths: action.paths, selectedPathIndex: 0 };

    case 'SET_COMPUTED_CHANNEL':
      return { ...state, computedChannelNumber: action.channelNumber };

    case 'SELECT_PATH':
      return {
        ...state,
        selectedPathIndex: action.index,
        workingPath: state.computedPaths[action.index]?.servicePath,
      };

    case 'SET_WORKING_PATH':
      return { ...state, workingPath: action.path };

    case 'SET_PROTECTION_SCHEME':
      return {
        ...state,
        protectionScheme: action.scheme,
        // Clear protection path if scheme is none
        protectionPath: action.scheme === 'none' ? undefined : state.protectionPath,
        srlgAnalysis: action.scheme === 'none' ? undefined : state.srlgAnalysis,
      };

    case 'SET_PROTECTION_PATH':
      return { ...state, protectionPath: action.path };

    case 'SET_SRLG_ANALYSIS':
      return { ...state, srlgAnalysis: action.analysis };

    case 'SET_VALIDATION_MESSAGES':
      return { ...state, validationMessages: action.messages };

    case 'SET_STEP_ERRORS':
      return {
        ...state,
        stepErrors: { ...state.stepErrors, [action.step]: action.errors },
      };

    case 'RESET':
      return createInitialState();

    default:
      return state;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;

  // Navigation helpers
  goToStep: (step: WizardStep) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  canGoToStep: (step: WizardStep) => boolean;
  isStepComplete: (step: WizardStep) => boolean;

  // Validation helpers
  validateCurrentStep: () => boolean;
  getStepIndex: (step: WizardStep) => number;
  getCurrentStepIndex: () => number;

  // Reset
  reset: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface WizardProviderProps {
  children: React.ReactNode;
  initialState?: Partial<WizardState>;
}

export const WizardProvider: React.FC<WizardProviderProps> = ({ children, initialState }) => {
  const [state, dispatch] = useReducer(
    wizardReducer,
    initialState ? { ...createInitialState(), ...initialState } : createInitialState()
  );

  const getStepIndex = useCallback((step: WizardStep) => WIZARD_STEPS.indexOf(step), []);

  const getCurrentStepIndex = useCallback(() => getStepIndex(state.currentStep), [state.currentStep, getStepIndex]);

  const isStepComplete = useCallback(
    (step: WizardStep) => state.completedSteps.has(step),
    [state.completedSteps]
  );

  const canGoToStep = useCallback(
    (step: WizardStep) => {
      const targetIndex = getStepIndex(step);
      const currentIndex = getCurrentStepIndex();

      // Can always go back
      if (targetIndex < currentIndex) return true;

      // Can only go forward if all previous steps are complete
      for (let i = 0; i < targetIndex; i++) {
        if (!isStepComplete(WIZARD_STEPS[i])) {
          return false;
        }
      }
      return true;
    },
    [getStepIndex, getCurrentStepIndex, isStepComplete]
  );

  const goToStep = useCallback(
    (step: WizardStep) => {
      if (canGoToStep(step)) {
        dispatch({ type: 'SET_STEP', step });
      }
    },
    [canGoToStep]
  );

  const goToNextStep = useCallback(() => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex < WIZARD_STEPS.length - 1) {
      dispatch({ type: 'MARK_STEP_COMPLETED', step: state.currentStep });
      dispatch({ type: 'SET_STEP', step: WIZARD_STEPS[currentIndex + 1] });
    }
  }, [getCurrentStepIndex, state.currentStep]);

  const goToPreviousStep = useCallback(() => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex > 0) {
      dispatch({ type: 'SET_STEP', step: WIZARD_STEPS[currentIndex - 1] });
    }
  }, [getCurrentStepIndex]);

  const validateCurrentStep = useCallback((): boolean => {
    const errors: string[] = [];

    switch (state.currentStep) {
      case 'endpoints':
        if (!state.sourceNodeId) errors.push('Source node is required');
        if (!state.destinationNodeId) errors.push('Destination node is required');
        if (state.sourceNodeId === state.destinationNodeId && state.sourceNodeId) {
          errors.push('Source and destination must be different');
        }
        break;

      case 'parameters':
        // L1 has no required additional validation here
        // L2/L3 requires underlay or auto-create
        if (state.serviceType !== 'l1-dwdm') {
          if (!state.autoCreateUnderlay && !state.underlayServiceId) {
            errors.push('Select an underlay service or enable auto-create');
          }
        }
        break;

      case 'path':
        if (!state.workingPath) {
          errors.push('Working path must be computed and selected');
        }
        break;

      case 'protection':
        if (state.protectionScheme !== 'none' && state.protectionScheme !== 'wson-restoration' && !state.protectionPath) {
          errors.push('Protection path required for selected protection scheme');
        }
        break;

      case 'review':
        // Final validation happens here
        break;
    }

    dispatch({ type: 'SET_STEP_ERRORS', step: state.currentStep, errors });
    return errors.length === 0;
  }, [state]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const contextValue = useMemo<WizardContextValue>(
    () => ({
      state,
      dispatch,
      goToStep,
      goToNextStep,
      goToPreviousStep,
      canGoToStep,
      isStepComplete,
      validateCurrentStep,
      getStepIndex,
      getCurrentStepIndex,
      reset,
    }),
    [state, goToStep, goToNextStep, goToPreviousStep, canGoToStep, isStepComplete, validateCurrentStep, getStepIndex, getCurrentStepIndex, reset]
  );

  return <WizardContext.Provider value={contextValue}>{children}</WizardContext.Provider>;
};

// ============================================================================
// HOOK
// ============================================================================

export const useWizard = (): WizardContextValue => {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within a WizardProvider');
  }
  return context;
};

export default WizardContext;
