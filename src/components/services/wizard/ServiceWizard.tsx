/**
 * ServiceWizard - Multi-step service creation wizard
 *
 * A tabbed wizard interface for creating L1 DWDM and L2/L3 IP services
 * with full path computation, channel selection, and protection configuration.
 */

import React, { useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import {
  WizardProvider,
  useWizard,
  WIZARD_STEPS,
  WIZARD_STEP_CONFIG,
  type WizardStep,
} from './ServiceWizardContext';
import { ServiceWizardEndpoints } from './ServiceWizardEndpoints';
import { ServiceWizardParameters } from './ServiceWizardParameters';
import { ServiceWizardPath } from './ServiceWizardPath';
import { ServiceWizardProtection } from './ServiceWizardProtection';
import { ServiceWizardReview } from './ServiceWizardReview';
import { useServiceStore } from '@/stores/serviceStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import type { L1DWDMService, L2L3Service, ServicePath, Service } from '@/types/service';
import { isL1DWDMService, isL2L3Service } from '@/types/service';
import { ChannelChecker, type ChannelTopologyProvider } from '@/core/services/ChannelChecker';
import { validateL1ServiceComplete } from '@/core/validation/l1ServiceValidation';

// ============================================================================
// STEP INDICATOR COMPONENT
// ============================================================================

interface StepIndicatorProps {
  step: WizardStep;
  index: number;
  isActive: boolean;
  isComplete: boolean;
  canNavigate: boolean;
  onClick: () => void;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({
  step,
  index,
  isActive,
  isComplete,
  canNavigate,
  onClick,
}) => {
  const config = WIZARD_STEP_CONFIG[step];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canNavigate}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg transition-all',
        'focus:outline-none focus:ring-2 focus:ring-accent/50',
        isActive && 'bg-accent/10 text-accent',
        !isActive && isComplete && 'text-accent/70 hover:bg-accent/5',
        !isActive && !isComplete && 'text-text-muted',
        canNavigate && !isActive && 'cursor-pointer hover:text-text-secondary',
        !canNavigate && 'cursor-not-allowed opacity-50'
      )}
    >
      <div
        className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
          isActive && 'bg-accent text-white',
          !isActive && isComplete && 'bg-accent/20 text-accent',
          !isActive && !isComplete && 'bg-border text-text-muted'
        )}
      >
        {isComplete && !isActive ? <Check className="h-3.5 w-3.5" /> : index + 1}
      </div>
      <span className="hidden text-sm font-medium sm:inline">{config.label}</span>
    </button>
  );
};

// ============================================================================
// STEP NAVIGATION BAR
// ============================================================================

const StepNavigationBar: React.FC = () => {
  const { state, goToStep, canGoToStep, isStepComplete } = useWizard();

  return (
    <div className="bg-secondary/30 flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-1">
        {WIZARD_STEPS.map((step, index) => (
          <React.Fragment key={step}>
            <StepIndicator
              step={step}
              index={index}
              isActive={state.currentStep === step}
              isComplete={isStepComplete(step)}
              canNavigate={canGoToStep(step)}
              onClick={() => goToStep(step)}
            />
            {index < WIZARD_STEPS.length - 1 && (
              <ChevronRight className="mx-1 hidden h-4 w-4 text-text-muted sm:block" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// STEP CONTENT RENDERER
// ============================================================================

const StepContent: React.FC = () => {
  const { state } = useWizard();

  switch (state.currentStep) {
    case 'endpoints':
      return <ServiceWizardEndpoints />;
    case 'parameters':
      return <ServiceWizardParameters />;
    case 'path':
      return <ServiceWizardPath />;
    case 'protection':
      return <ServiceWizardProtection />;
    case 'review':
      return <ServiceWizardReview />;
    default:
      return null;
  }
};

// ============================================================================
// FOOTER WITH NAVIGATION BUTTONS
// ============================================================================

interface WizardFooterProps {
  onClose: () => void;
  onSubmit: () => void;
}

const WizardFooter: React.FC<WizardFooterProps> = ({ onClose, onSubmit }) => {
  const {
    state,
    goToNextStep,
    goToPreviousStep,
    validateCurrentStep,
    getCurrentStepIndex,
  } = useWizard();

  const currentIndex = getCurrentStepIndex();
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === WIZARD_STEPS.length - 1;
  const currentStepConfig = WIZARD_STEP_CONFIG[state.currentStep];

  const handleNext = useCallback(() => {
    if (validateCurrentStep()) {
      goToNextStep();
    }
  }, [validateCurrentStep, goToNextStep]);

  const handleSubmit = useCallback(() => {
    if (validateCurrentStep()) {
      onSubmit();
    }
  }, [validateCurrentStep, onSubmit]);

  return (
    <div className="bg-secondary/30 flex items-center justify-between border-t border-border px-6 py-4">
      <div className="text-sm text-text-muted">
        Step {currentIndex + 1} of {WIZARD_STEPS.length}: {currentStepConfig.description}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>

        {!isFirstStep && (
          <Button type="button" variant="outline" onClick={goToPreviousStep}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        )}

        {!isLastStep ? (
          <Button type="button" onClick={handleNext}>
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={state.isSubmitting}
            className="hover:bg-accent/90 bg-accent"
          >
            {state.isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {state.mode === 'edit' ? 'Saving...' : 'Creating...'}
              </>
            ) : (
              state.mode === 'edit' ? 'Save Changes' : 'Create Service'
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// WIZARD CONTENT (INNER COMPONENT WITH CONTEXT ACCESS)
// ============================================================================

interface WizardContentProps {
  onClose: () => void;
}

const WizardContent: React.FC<WizardContentProps> = ({ onClose }) => {
  const { state, dispatch, reset } = useWizard();
  const addService = useServiceStore((s) => s.addService);
  const updateService = useServiceStore((s) => s.updateService);
  const getService = useServiceStore((s) => s.getService);
  const updateL1ServicePathWithSpectrum = useServiceStore((s) => s.updateL1ServicePathWithSpectrum);
  const nodes = useNetworkStore((s) => s.topology.nodes);
  const edges = useNetworkStore((s) => s.topology.edges);
  const addToast = useUIStore((s) => s.addToast);

  const isEditMode = state.mode === 'edit';

  // Create topology provider for ChannelChecker
  const topologyProvider = useMemo((): ChannelTopologyProvider => ({
    getNode: (id: string) => nodes.find((n) => n.id === id),
    getEdge: (id: string) => edges.find((e) => e.id === id),
    getEdges: () => edges,
  }), [nodes, edges]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  /**
   * Check if a node type is optical-only equipment (DWDM transport layer)
   * These nodes handle wavelengths and cannot process IP/Ethernet.
   */
  const isOpticalEquipment = useCallback((nodeType: string | undefined): boolean => {
    return nodeType === 'oadm' || nodeType === 'amplifier' || nodeType === 'terminal';
  }, []);

  /**
   * Check if an edge is a DWDM edge (part of the optical transport network)
   *
   * DWDM edges are identified when:
   * 1. BOTH endpoints are optical equipment (OADM, amplifier, terminal), OR
   * 2. The edge uses DWDM ports (checked via edge properties or port types)
   *
   * BW (Black & White) links between routers/switches and OADMs are NOT DWDM edges.
   * These are short-reach client-side connections using 1310nm wavelength.
   */
  const isDwdmEdge = useCallback((edge: typeof edges[0]): boolean => {
    const sourceNode = nodes.find((n) => n.id === edge.source.nodeId);
    const targetNode = nodes.find((n) => n.id === edge.target.nodeId);

    if (!sourceNode || !targetNode) return false;

    // Check if BOTH endpoints are optical equipment (OADM, amplifier, terminal)
    // This ensures we exclude Router→OADM (BW links) and other client connections
    const bothOptical = isOpticalEquipment(sourceNode.type) && isOpticalEquipment(targetNode.type);
    if (bothOptical) return true;

    // Alternatively, check if the edge explicitly uses DWDM ports
    // This handles cases where edge properties specify port types
    if (edge.properties.sourcePortType === 'dwdm' && edge.properties.targetPortType === 'dwdm') {
      // Both ports are DWDM, but still exclude if one end is router/switch
      // (Router DWDM ports are for transponder connections, not part of optical path)
      if (sourceNode.type === 'router' || sourceNode.type === 'switch') return false;
      if (targetNode.type === 'router' || targetNode.type === 'switch') return false;
      return true;
    }

    // Check port IDs on the edge and look up actual port types
    if (edge.source.portId && edge.target.portId) {
      const sourcePort = sourceNode.ports?.find((p) => p.id === edge.source.portId);
      const targetPort = targetNode.ports?.find((p) => p.id === edge.target.portId);

      // If both are DWDM ports AND both nodes are optical equipment
      if (sourcePort?.type === 'dwdm' && targetPort?.type === 'dwdm') {
        // Still exclude router/switch DWDM connections
        if (sourceNode.type === 'router' || sourceNode.type === 'switch') return false;
        if (targetNode.type === 'router' || targetNode.type === 'switch') return false;
        return true;
      }
    }

    return false;
  }, [nodes, isOpticalEquipment]);

  /**
   * Extract DWDM edges from the computed path for L1 underlay creation
   * Returns the DWDM edge IDs and their endpoint nodes (first/last OADM or DWDM node)
   *
   * Important: This excludes BW links between routers and OADMs.
   * The L1 service path should only include edges between optical equipment.
   */
  const extractDwdmPathInfo = useCallback((workingPath: ServicePath | undefined) => {
    if (!workingPath || workingPath.edgeIds.length === 0) {
      return { dwdmEdgeIds: [], dwdmNodeIds: [], l1SourceNodeId: '', l1DestNodeId: '' };
    }

    // Identify DWDM edges (only edges between optical equipment)
    const dwdmEdgeIds: string[] = [];
    const dwdmNodeIds: string[] = [];

    for (const edgeId of workingPath.edgeIds) {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) continue;

      if (isDwdmEdge(edge)) {
        dwdmEdgeIds.push(edgeId);
        // Track nodes involved in DWDM edges
        if (!dwdmNodeIds.includes(edge.source.nodeId)) {
          dwdmNodeIds.push(edge.source.nodeId);
        }
        if (!dwdmNodeIds.includes(edge.target.nodeId)) {
          dwdmNodeIds.push(edge.target.nodeId);
        }
      }
    }

    // Find the first and last DWDM nodes from the path that appear in our DWDM edge nodes
    // These will be the L1 service endpoints (typically OADMs closest to the routers)
    let l1SourceNodeId = '';
    let l1DestNodeId = '';

    for (const nodeId of workingPath.nodeIds) {
      if (dwdmNodeIds.includes(nodeId)) {
        if (!l1SourceNodeId) {
          l1SourceNodeId = nodeId;
        }
        l1DestNodeId = nodeId; // Keep updating to get the last one
      }
    }

    return { dwdmEdgeIds, dwdmNodeIds, l1SourceNodeId, l1DestNodeId };
  }, [edges, isDwdmEdge]);

  const handleSubmit = useCallback(() => {
    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });

    try {
      // Build the service object based on type
      if (state.serviceType === 'l1-dwdm') {
        // Find ports
        const sourceNode = nodes.find((n) => n.id === state.sourceNodeId);
        const destNode = nodes.find((n) => n.id === state.destinationNodeId);

        const sourcePort = state.sourcePortId ||
          sourceNode?.ports?.find((p) => p.type === 'dwdm' && p.status === 'available')?.id ||
          'auto-port-1';
        const destPort = state.destinationPortId ||
          destNode?.ports?.find((p) => p.type === 'dwdm' && p.status === 'available')?.id ||
          'auto-port-2';

        const serviceData: Omit<L1DWDMService, 'id' | 'createdAt' | 'modifiedAt'> = {
          name: state.name || `L1 Service ${sourceNode?.name} to ${destNode?.name}`,
          type: 'l1-dwdm',
          status: 'planned',
          sourceNodeId: state.sourceNodeId,
          sourcePortId: sourcePort,
          destinationNodeId: state.destinationNodeId,
          destinationPortId: destPort,
          dataRate: state.dataRate,
          modulationType: state.modulationType,
          channelWidth: state.channelWidth,
          wavelengthMode: state.wavelengthMode,
          channelNumber: state.requestedChannelNumber || state.computedChannelNumber,
          protectionScheme: state.protectionScheme,
          restorationEnabled: state.protectionScheme === 'wson-restoration',
          workingPath: state.workingPath ? {
            ...state.workingPath,
            channelNumber: state.requestedChannelNumber || state.computedChannelNumber,
          } : {
            id: crypto.randomUUID(),
            type: 'working',
            nodeIds: [state.sourceNodeId, state.destinationNodeId],
            edgeIds: [],
            totalDistance: 0,
            hopCount: 1,
            status: 'computed',
          },
          protectionPath: state.protectionPath,
          srlgAnalysis: state.srlgAnalysis,
          metadata: {},
        };

        if (isEditMode && state.editingServiceId) {
          // Re-run L1 validation (modulation reach, channel availability, protection feasibility)
          // before committing edits per modal-registry contract / FR-002.
          const channelChecker = new ChannelChecker(topologyProvider);
          const channelAvailability = state.workingPath
            ? channelChecker.checkChannelAvailability(state.workingPath, serviceData.wavelengthMode)
            : { available: false };
          const channelAvailable = !!channelAvailability.available;
          const srlgRiskScore = state.srlgAnalysis?.riskScore ?? 0;
          const sharedSRLGCount = state.srlgAnalysis?.sharedSRLGCodes?.length ?? 0;

          const validationResult = validateL1ServiceComplete(
            {
              name: serviceData.name,
              sourceNodeId: serviceData.sourceNodeId,
              sourcePortId: serviceData.sourcePortId,
              destinationNodeId: serviceData.destinationNodeId,
              destinationPortId: serviceData.destinationPortId,
              dataRate: serviceData.dataRate,
              modulationType: serviceData.modulationType,
              channelWidth: serviceData.channelWidth,
              wavelengthMode: serviceData.wavelengthMode,
              channelNumber: serviceData.channelNumber,
              protectionScheme: serviceData.protectionScheme,
              restorationEnabled: serviceData.restorationEnabled,
              pathOptions: { mode: 'shortest-path', weightAttribute: 'distance' },
            },
            serviceData.workingPath || null,
            serviceData.protectionPath || null,
            channelAvailable,
            srlgRiskScore,
            sharedSRLGCount,
            topologyProvider
          );

          if (!validationResult.valid) {
            const errorMessages = validationResult.messages
              .filter((m) => m.severity === 'error')
              .map((m) => m.message);
            if (errorMessages.length > 0) {
              dispatch({
                type: 'SET_STEP_ERRORS',
                step: 'review',
                errors: errorMessages,
              });
              addToast({
                type: 'error',
                title: 'Validation Failed',
                message: errorMessages.join('; '),
                duration: 6000,
              });
              dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
              return;
            }
          }

          // Check if path has changed for spectrum update
          const existingService = getService(state.editingServiceId) as import('@/types/service').L1DWDMService | undefined;
          const pathChanged = existingService && state.workingPath && (
            JSON.stringify(existingService.workingPath?.edgeIds || []) !==
            JSON.stringify(state.workingPath.edgeIds || [])
          );
          const protectionPathChanged = existingService && (
            JSON.stringify(existingService.protectionPath?.edgeIds || []) !==
            JSON.stringify(state.protectionPath?.edgeIds || [])
          );

          // If path changed, use spectrum-aware update
          if (pathChanged || protectionPathChanged) {
            const result = updateL1ServicePathWithSpectrum(
              state.editingServiceId,
              state.workingPath || serviceData.workingPath,
              state.protectionPath
            );

            if (!result.success) {
              addToast({
                type: 'error',
                title: 'Path Update Failed',
                message: result.error || 'Failed to update service path with spectrum',
                duration: 5000,
              });
              dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
              return;
            }

            // Update non-path properties separately
            const { workingPath: _wp, protectionPath: _pp, ...nonPathData } = serviceData;
            updateService(state.editingServiceId, nonPathData);
          } else {
            // No path change, just update normally
            updateService(state.editingServiceId, serviceData);
          }

          addToast({
            type: 'success',
            title: 'Service Updated',
            message: `${serviceData.name} has been updated`,
            duration: 3000,
          });
        } else {
          // Create new service
          addService(serviceData);
        }
      } else {
        // L2/L3 service
        const sourceNode = nodes.find((n) => n.id === state.sourceNodeId);
        const destNode = nodes.find((n) => n.id === state.destinationNodeId);

        const sourcePort = state.sourcePortId ||
          sourceNode?.ports?.find((p) => p.status === 'available')?.id ||
          'auto-port-1';
        const destPort = state.destinationPortId ||
          destNode?.ports?.find((p) => p.status === 'available')?.id ||
          'auto-port-2';

        let underlayId = state.underlayServiceId;

        // Auto-create L1 underlay if requested and we have a working path with DWDM edges
        if (state.autoCreateUnderlay && !underlayId && state.workingPath) {
          const { dwdmEdgeIds, dwdmNodeIds, l1SourceNodeId, l1DestNodeId } = extractDwdmPathInfo(state.workingPath);

          if (dwdmEdgeIds.length > 0 && l1SourceNodeId && l1DestNodeId) {
            // Find the DWDM nodes in path order for the L1 working path
            const l1PathNodeIds = state.workingPath.nodeIds.filter((nodeId) =>
              dwdmNodeIds.includes(nodeId)
            );

            // Calculate total DWDM distance
            let dwdmTotalDistance = 0;
            for (const edgeId of dwdmEdgeIds) {
              const edge = edges.find((e) => e.id === edgeId);
              if (edge?.properties.distance) {
                dwdmTotalDistance += edge.properties.distance;
              }
            }

            // Find ports for L1 service endpoints
            const l1SourceNode = nodes.find((n) => n.id === l1SourceNodeId);
            const l1DestNode = nodes.find((n) => n.id === l1DestNodeId);

            const l1SourcePort = l1SourceNode?.ports?.find((p) => p.type === 'dwdm' && p.status === 'available')?.id || 'auto-port-1';
            const l1DestPort = l1DestNode?.ports?.find((p) => p.type === 'dwdm' && p.status === 'available')?.id || 'auto-port-2';

            // Compute channel availability for the DWDM edges
            let underlayChannel: number | undefined = state.underlayChannelNumber;
            if (!underlayChannel) {
              // Create a temporary ServicePath for channel checking
              const tempL1Path: ServicePath = {
                id: 'temp-l1-path',
                type: 'working',
                nodeIds: l1PathNodeIds,
                edgeIds: dwdmEdgeIds,
                totalDistance: dwdmTotalDistance,
                hopCount: l1PathNodeIds.length - 1,
                status: 'computed',
              };

              // Use ChannelChecker to find an available channel
              const channelChecker = new ChannelChecker(topologyProvider);
              const availability = channelChecker.checkChannelAvailability(
                tempL1Path,
                'continuous' // Default to continuous mode for auto-created underlays
              );

              if (availability.available && availability.suggestedChannel) {
                underlayChannel = availability.suggestedChannel;
              } else if (availability.commonChannels && availability.commonChannels.length > 0) {
                // Fallback to first available common channel
                underlayChannel = availability.commonChannels[0];
              } else {
                // Auto-assign channel 1 if no channel check available (e.g., new edges without spectrum)
                underlayChannel = 1;
                console.warn('No channel availability data found, defaulting to channel 1');
              }
            }

            // Create L1 underlay service
            const l1ServiceData: Omit<L1DWDMService, 'id' | 'createdAt' | 'modifiedAt'> = {
              name: `L1 Underlay for ${state.name || (state.serviceType === 'l2-ethernet' ? 'L2' : 'L3')} Service`,
              type: 'l1-dwdm',
              status: 'planned',
              sourceNodeId: l1SourceNodeId,
              sourcePortId: l1SourcePort,
              destinationNodeId: l1DestNodeId,
              destinationPortId: l1DestPort,
              dataRate: state.dataRate,
              modulationType: 'DP-QPSK', // Default to long-reach modulation
              channelWidth: '50GHz',
              wavelengthMode: 'continuous',
              channelNumber: underlayChannel,
              protectionScheme: 'none',
              restorationEnabled: false,
              workingPath: {
                id: crypto.randomUUID(),
                type: 'working',
                nodeIds: l1PathNodeIds,
                edgeIds: dwdmEdgeIds,
                totalDistance: dwdmTotalDistance,
                hopCount: l1PathNodeIds.length - 1,
                channelNumber: underlayChannel,
                status: 'computed',
              },
              metadata: { autoCreatedFor: 'l2l3-service' },
            };

            underlayId = addService(l1ServiceData);
          }
        }

        const serviceData: Omit<L2L3Service, 'id' | 'createdAt' | 'modifiedAt'> = {
          name: state.name || `${state.serviceType === 'l2-ethernet' ? 'L2' : 'L3'} Service`,
          type: state.serviceType as 'l2-ethernet' | 'l3-ip',
          status: 'planned',
          sourceNodeId: state.sourceNodeId,
          sourcePortId: sourcePort,
          destinationNodeId: state.destinationNodeId,
          destinationPortId: destPort,
          dataRate: state.dataRate,
          underlayServiceId: underlayId || '', // Empty string if no underlay needed (all BW edges)
          underlayAutoCreated: state.autoCreateUnderlay && !!underlayId,
          protectionScheme: state.ipProtectionScheme,
          bfdConfig: state.bfdConfig,
          metadata: {},
        };

        if (isEditMode && state.editingServiceId) {
          // Update existing service
          updateService(state.editingServiceId, serviceData);
          addToast({
            type: 'success',
            title: 'Service Updated',
            message: `${serviceData.name} has been updated`,
            duration: 3000,
          });
        } else {
          // Create new service
          addService(serviceData);
        }
      }

      handleClose();
    } catch (error) {
      console.error('Failed to create service:', error);
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  }, [state, addService, updateService, addToast, isEditMode, nodes, edges, handleClose, dispatch, extractDwdmPathInfo]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StepNavigationBar />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Step Errors */}
        {state.stepErrors[state.currentStep]?.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <div className="flex items-start gap-2">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div className="text-sm text-red-400">
                {state.stepErrors[state.currentStep].map((error, i) => (
                  <div key={i}>{error}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        <StepContent />
      </div>

      <WizardFooter onClose={handleClose} onSubmit={handleSubmit} />
    </div>
  );
};

// ============================================================================
// MAIN WIZARD COMPONENT
// ============================================================================

// Helper to convert existing service to WizardState initial values
function serviceToInitialState(service: Service): Partial<import('./ServiceWizardContext').WizardState> {
  const baseState = {
    mode: 'edit' as const,
    editingServiceId: service.id,
    serviceType: service.type,
    name: service.name,
    sourceNodeId: service.sourceNodeId,
    sourcePortId: service.sourcePortId || '',
    destinationNodeId: service.destinationNodeId,
    destinationPortId: service.destinationPortId || '',
    dataRate: service.dataRate,
    // Mark all steps as completed in edit mode for free navigation
    completedSteps: new Set(['endpoints', 'parameters', 'path', 'protection', 'review'] as const),
  };

  if (isL1DWDMService(service)) {
    const l1 = service as L1DWDMService;
    return {
      ...baseState,
      modulationType: l1.modulationType,
      channelWidth: l1.channelWidth,
      wavelengthMode: l1.wavelengthMode,
      requestedChannelNumber: l1.channelNumber,
      protectionScheme: l1.protectionScheme,
      workingPath: l1.workingPath,
      protectionPath: l1.protectionPath,
      srlgAnalysis: l1.srlgAnalysis,
    };
  } else if (isL2L3Service(service)) {
    const l2l3 = service as L2L3Service;
    return {
      ...baseState,
      ipProtectionScheme: l2l3.protectionScheme,
      underlayServiceId: l2l3.underlayServiceId || '',
      autoCreateUnderlay: false, // Already has underlay in edit mode
      bfdConfig: l2l3.bfdConfig || {
        enabled: false,
        minTxInterval: 300000,
        minRxInterval: 300000,
        multiplier: 3,
      },
    };
  }

  return baseState;
}

export const ServiceWizard: React.FC = () => {
  const activeModal = useUIStore((state) => state.activeModal);
  const modalData = useUIStore((state) => state.modalData);
  const closeModal = useUIStore((state) => state.closeModal);
  const getService = useServiceStore((state) => state.getService);

  const isOpen = activeModal === 'service-wizard';

  // Determine if we're in edit mode
  const isEditMode = modalData?.mode === 'edit';
  const editingServiceId = isEditMode ? (modalData?.serviceId as string) : undefined;
  const editingService = editingServiceId ? getService(editingServiceId) : undefined;

  // Create initial state for edit mode
  const initialState = useMemo(() => {
    if (isEditMode && editingService) {
      return serviceToInitialState(editingService);
    }
    return undefined;
  }, [isEditMode, editingService]);

  const handleClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  // Get title and description based on mode
  const title = isEditMode && editingService
    ? `Edit Service: ${editingService.name || editingService.id}`
    : 'Create New Service';
  const description = isEditMode
    ? 'Modify the service configuration. Note: Endpoints and paths cannot be changed.'
    : 'Configure a new network service with path computation and protection options.';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="flex h-[85vh] max-h-[700px] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        data-testid="service-wizard"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-text-muted">
            {description}
          </DialogDescription>
        </DialogHeader>

        <WizardProvider initialState={initialState}>
          <WizardContent onClose={handleClose} />
        </WizardProvider>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceWizard;
