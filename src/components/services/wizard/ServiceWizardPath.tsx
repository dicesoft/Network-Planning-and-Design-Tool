/**
 * ServiceWizardPath - Step 3: Path Computation and Selection
 *
 * Handles:
 * - Path computation mode selection
 * - Working path computation via PathFinder
 * - Path visualization and selection from alternatives
 * - Channel availability checking for L1 services
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useWizard, type ComputedPath } from './ServiceWizardContext';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Route,
  Play,
  Loader2,
  Check,
  AlertTriangle,
  MapPin,
  ArrowRight,
  Ruler,
  Hash,
  Radio,
  RefreshCw,
  CheckCircle,
  Settings2,
  Layers,
} from 'lucide-react';
import {
  PATH_COMPUTATION_MODE_CONFIGS,
  type PathComputationMode,
  type ServicePath,
  isL1DWDMService,
  type L1DWDMService,
} from '@/types/service';
import { PathFinder, type PathResult } from '@/core/graph/PathFinder';
import { GraphEngine } from '@/core/graph/GraphEngine';
import { ChannelChecker, type ChannelTopologyProvider } from '@/core/services/ChannelChecker';
import { Input } from '@/components/ui/input';
import { ManualPathSelector, type PathValidationResult } from './ManualPathSelector';
import { OsnrAnalysisPanel } from './OsnrAnalysisPanel';
import { calculateOSNR } from '@/core/optical/OSNREngine';
import { DEFAULT_TRANSCEIVERS } from '@/types/transceiver';
import { FIBER_PROFILE_CONFIGS } from '@/types/network';
import type { SpanInput, TransceiverParams, AmplifierParams } from '@/core/optical/types';
import { DEFAULT_EOL_MARGIN } from '@/core/optical/constants';

// ============================================================================
// PATH COMPUTATION MODE SELECTOR
// ============================================================================

interface PathModeSelectProps {
  value: PathComputationMode;
  onChange: (mode: PathComputationMode) => void;
  kValue: number;
  onKValueChange: (kValue: number) => void;
  disabled?: boolean;
}

const PathModeSelect: React.FC<PathModeSelectProps> = ({ value, onChange, kValue, onKValueChange, disabled }) => {
  // Available path computation modes
  const applicableModes: PathComputationMode[] = [
    'shortest-path',
    'k-shortest',
    'edge-disjoint',
    'manual',
  ];

  // Show k-value input for k-shortest and edge-disjoint modes
  const showKValueInput = value === 'k-shortest' || value === 'edge-disjoint';

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Path Computation Algorithm
        </label>
        <Select
          value={value}
          onValueChange={(v) => onChange(v as PathComputationMode)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {applicableModes.map((mode) => {
              const config = PATH_COMPUTATION_MODE_CONFIGS[mode];
              return (
                <SelectItem key={mode} value={mode}>
                  <div className="flex flex-col">
                    <span>{config.label}</span>
                    <span className="text-xs text-text-muted">{config.description}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* K-Value Input */}
      {showKValueInput && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Number of Paths (k)
            <span className="ml-1 font-normal text-text-muted">(2-10)</span>
          </label>
          <Input
            type="number"
            value={kValue}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 2 && val <= 10) {
                onKValueChange(val);
              }
            }}
            min={2}
            max={10}
            disabled={disabled}
            className="w-24"
          />
          <p className="mt-1 text-xs text-text-muted">
            {value === 'k-shortest'
              ? 'Compute top k alternative paths ranked by distance'
              : 'Find up to k edge-disjoint paths for redundancy'}
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// PATH CARD COMPONENT
// ============================================================================

interface PathCardProps {
  path: ComputedPath;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  nodes: Map<string, string>; // nodeId -> name
}

const PathCard: React.FC<PathCardProps> = ({ path, index, isSelected, onSelect, nodes }) => {
  const { servicePath } = path;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left p-4 rounded-lg border-2 transition-all',
        isSelected
          ? 'border-accent bg-accent/5 ring-2 ring-accent/30'
          : 'border-border hover:border-accent/50 hover:bg-secondary/50'
      )}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
              isSelected ? 'bg-accent text-white' : 'bg-border text-text-muted'
            )}
          >
            {isSelected ? <Check className="h-3.5 w-3.5" /> : index + 1}
          </div>
          <span className="font-medium text-text-primary">
            Path {index + 1}
            {index === 0 && <span className="ml-1 text-accent">(Shortest)</span>}
          </span>
        </div>

        {path.channelNumber && (
          <div className="flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">
            <Radio className="h-3 w-3" />
            Ch {path.channelNumber}
          </div>
        )}
      </div>

      {/* Path metrics */}
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div className="flex items-center gap-1.5 text-sm">
          <Ruler className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-text-muted">Distance:</span>
          <span className="font-medium text-text-primary">
            {servicePath.totalDistance.toFixed(1)} km
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Hash className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-text-muted">Hops:</span>
          <span className="font-medium text-text-primary">{servicePath.hopCount}</span>
        </div>
        {servicePath.latency && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-text-muted">Latency:</span>
            <span className="font-medium text-text-primary">
              {servicePath.latency.toFixed(2)} ms
            </span>
          </div>
        )}
      </div>

      {/* Path nodes visualization */}
      <div className="flex flex-wrap items-center gap-1">
        {servicePath.nodeIds.map((nodeId, i) => (
          <React.Fragment key={nodeId}>
            <div className="bg-secondary flex items-center gap-1 rounded px-2 py-1 text-xs">
              <MapPin className="h-3 w-3 text-accent" />
              <span className="max-w-[100px] truncate text-text-primary">
                {nodes.get(nodeId) || nodeId}
              </span>
            </div>
            {i < servicePath.nodeIds.length - 1 && (
              <ArrowRight className="h-3 w-3 shrink-0 text-text-muted" />
            )}
          </React.Fragment>
        ))}
      </div>
    </button>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ServiceWizardPath: React.FC = () => {
  const { state, dispatch, goToNextStep } = useWizard();
  const topology = useNetworkStore((s) => s.topology);
  const getService = useServiceStore((s) => s.getService);
  const opticalSettings = useSettingsStore((s) => s.settings.optical);
  const userTransceivers = useSettingsStore((s) => s.settings.transceiverLibrary);
  const [isComputing, setIsComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);

  // Create node name map for display
  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    topology.nodes.forEach((node) => {
      map.set(node.id, node.name);
    });
    return map;
  }, [topology.nodes]);

  // Create topology provider for ChannelChecker
  const topologyProvider = useMemo((): ChannelTopologyProvider => ({
    getNode: (id: string) => topology.nodes.find((n) => n.id === id),
    getEdge: (id: string) => topology.edges.find((e) => e.id === id),
    getEdges: () => topology.edges,
  }), [topology]);

  // Build OSNR calculation inputs (shared between osnrResult and amplifier suggestions)
  const osnrInputs = useMemo(() => {
    if (state.serviceType !== 'l1-dwdm') return null;
    if (!state.workingPath?.edgeIds || state.workingPath.edgeIds.length === 0) return null;
    if (!state.transceiverTypeId) return null;

    const allTransceivers = [...DEFAULT_TRANSCEIVERS, ...(userTransceivers || [])];
    const transceiver = allTransceivers.find((t) => t.id === state.transceiverTypeId);
    if (!transceiver) return null;

    const modInfo = transceiver.supportedModulations.find(
      (m) => m.modulation === state.modulationType
    );
    if (!modInfo) return null;

    const spans: SpanInput[] = [];
    const amps: AmplifierParams[] = [];
    const edgeIds: string[] = [];

    for (let i = 0; i < state.workingPath.edgeIds.length; i++) {
      const edgeId = state.workingPath.edgeIds[i];
      const edge = topology.edges.find((e) => e.id === edgeId);
      if (!edge) continue;

      edgeIds.push(edgeId);
      const fiberParams = edge.properties?.fiberProfile;
      const profileType = fiberParams?.profileType || 'G.652.D';
      const fiberProfile = FIBER_PROFILE_CONFIGS[profileType] || FIBER_PROFILE_CONFIGS['G.652.D'];
      spans.push({
        length: edge.properties?.distance || 50,
        attenuation: fiberParams?.attenuationOverride ?? fiberProfile.attenuation,
        chromaticDispersion: fiberParams?.chromaticDispersionOverride ?? fiberProfile.chromaticDispersion,
        connectorCount: 2,
        connectorLoss: opticalSettings?.defaultConnectorLoss ?? 0.5,
      });

      const targetNode = topology.nodes.find((n) => n.id === edge.target.nodeId);
      if (targetNode?.type === 'amplifier') {
        amps.push({
          id: targetNode.id,
          type: 'edfa',
          gain: edge.properties?.distance ? edge.properties.distance * 0.2 + 1 : 17,
          noiseFigure: opticalSettings?.defaultNF ?? 5.5,
          afterSpanIndex: i,
        });
      }
    }

    if (spans.length === 0) return null;

    const transceiverParams: TransceiverParams = {
      launchPower: transceiver.launchPower,
      txOSNR: transceiver.txOSNR,
      requiredOSNR: modInfo.requiredOSNR,
      receiverSensitivity: transceiver.receiverSensitivity,
      baudRate: transceiver.baudRate,
    };

    const eolMargin = opticalSettings?.defaultEoLMargin ?? DEFAULT_EOL_MARGIN;

    return { spans, amps, transceiverParams, eolMargin, edgeIds };
  }, [
    state.serviceType,
    state.workingPath?.edgeIds,
    state.transceiverTypeId,
    state.modulationType,
    topology.edges,
    topology.nodes,
    userTransceivers,
    opticalSettings,
  ]);

  // OSNR calculation for L1 services with selected transceiver and working path
  const osnrResult = useMemo(() => {
    if (!osnrInputs) return null;
    try {
      return calculateOSNR(
        osnrInputs.spans,
        osnrInputs.transceiverParams,
        osnrInputs.amps,
        osnrInputs.eolMargin,
        true,  // includeNLI
        80,    // numChannels
        false, // never auto-insert — calculate with existing amps only
      );
    } catch {
      return null;
    }
  }, [osnrInputs]);

  // Get L1 underlay path info for L2/L3 services
  const underlayPathInfo = useMemo(() => {
    // Only applicable for L2/L3 services with a selected underlay
    if (state.serviceType === 'l1-dwdm' || !state.underlayServiceId) {
      return null;
    }

    const underlayService = getService(state.underlayServiceId);
    if (!underlayService || !isL1DWDMService(underlayService)) {
      return null;
    }

    const l1Service = underlayService as L1DWDMService;
    return {
      service: l1Service,
      workingPath: l1Service.workingPath,
      protectionPath: l1Service.protectionPath,
    };
  }, [state.serviceType, state.underlayServiceId, getService]);

  // Handler for accepting L1 underlay path
  const handleAcceptUnderlayPath = useCallback(() => {
    if (!underlayPathInfo?.workingPath) return;

    // Set the working path from the L1 underlay
    dispatch({ type: 'SET_WORKING_PATH', path: underlayPathInfo.workingPath });
    dispatch({ type: 'SET_PATH_SELECTION_MODE', mode: 'accept-underlay' });
    dispatch({ type: 'MARK_STEP_COMPLETED', step: 'path' });

    // Auto-advance to next step
    goToNextStep();
  }, [underlayPathInfo, dispatch, goToNextStep]);

  // Handler to switch to custom path computation mode
  const handleComputeCustomPath = useCallback(() => {
    dispatch({ type: 'SET_PATH_SELECTION_MODE', mode: 'compute' });
    // Clear any previously accepted path
    dispatch({ type: 'SET_WORKING_PATH', path: undefined as unknown as ServicePath });
  }, [dispatch]);

  // Handle path computation
  const computePaths = useCallback(async () => {
    if (!state.sourceNodeId || !state.destinationNodeId) {
      setComputeError('Source and destination nodes are required');
      return;
    }

    setIsComputing(true);
    setComputeError(null);

    try {
      // Create GraphEngine and PathFinder
      const graphEngine = new GraphEngine();
      graphEngine.loadFromTopology(topology);
      const pathFinder = new PathFinder(graphEngine);

      // Create ChannelChecker for L1 services
      const channelChecker = state.serviceType === 'l1-dwdm'
        ? new ChannelChecker(topologyProvider)
        : null;

      const computedPaths: ComputedPath[] = [];

      if (state.pathComputationMode === 'shortest-path') {
        // Single shortest path
        const result = pathFinder.shortestPath(state.sourceNodeId, state.destinationNodeId);
        if (result) {
          computedPaths.push(pathResultToComputedPath(result, channelChecker));
        }
      } else if (state.pathComputationMode === 'k-shortest') {
        // K-shortest paths using user-specified k-value
        const results = pathFinder.kShortestPaths(
          state.sourceNodeId,
          state.destinationNodeId,
          state.kValue
        );
        results.forEach((result) => {
          computedPaths.push(pathResultToComputedPath(result, channelChecker));
        });
      } else if (state.pathComputationMode === 'edge-disjoint') {
        // Edge-disjoint paths using maxflow algorithm for more complete results
        const results = pathFinder.findEdgeDisjointPaths(
          state.sourceNodeId,
          state.destinationNodeId,
          { maxPaths: state.kValue, algorithm: 'maxflow' }
        );
        results.forEach((result) => {
          computedPaths.push(pathResultToComputedPath(result, channelChecker));
        });
      }

      // Check if fewer paths were found than requested
      let pathCountWarning: string | undefined;
      if ((state.pathComputationMode === 'k-shortest' || state.pathComputationMode === 'edge-disjoint') &&
          computedPaths.length < state.kValue && computedPaths.length > 0) {
        if (state.pathComputationMode === 'edge-disjoint') {
          pathCountWarning = `Only ${computedPaths.length} edge-disjoint path(s) found (requested ${state.kValue}). ` +
            `This may be due to network topology limitations - the graph may not have ${state.kValue} ` +
            `physically separate paths between these endpoints.`;
        } else {
          pathCountWarning = `Only ${computedPaths.length} path(s) found (requested ${state.kValue}). ` +
            `The network topology may have limited connectivity between these endpoints.`;
        }
      }

      if (computedPaths.length === 0) {
        setComputeError('No path found between the selected endpoints');
        dispatch({ type: 'SET_COMPUTED_PATHS', paths: [] });
        dispatch({ type: 'SET_WORKING_PATH', path: undefined as any });
        dispatch({ type: 'SET_COMPUTED_CHANNEL', channelNumber: undefined });
      } else {
        // Set warning if applicable (handled in UI display)
        if (pathCountWarning) {
          // Store warning in first computed path for display
          computedPaths[0].pathResult.warnings = computedPaths[0].pathResult.warnings || [];
          computedPaths[0].pathResult.warnings.push({
            type: 'path_count_limited',
            code: 'FEWER_PATHS_THAN_REQUESTED',
            message: pathCountWarning,
            details: {
              requestedPaths: state.kValue,
              foundPaths: computedPaths.length,
            },
          });
        }
        dispatch({ type: 'SET_COMPUTED_PATHS', paths: computedPaths });
        dispatch({ type: 'SELECT_PATH', index: 0 });
        dispatch({ type: 'SET_WORKING_PATH', path: computedPaths[0].servicePath });
        // Set the computed channel from the first (selected) path
        dispatch({ type: 'SET_COMPUTED_CHANNEL', channelNumber: computedPaths[0].channelNumber });
      }
    } catch (error) {
      console.error('Path computation error:', error);
      setComputeError(
        error instanceof Error ? error.message : 'Failed to compute path'
      );
    } finally {
      setIsComputing(false);
    }
  }, [state.sourceNodeId, state.destinationNodeId, state.pathComputationMode, state.kValue, state.serviceType, topology, topologyProvider, dispatch]);

  // Convert PathResult to ComputedPath
  const pathResultToComputedPath = (result: PathResult, channelChecker: ChannelChecker | null): ComputedPath => {
    const servicePath: ServicePath = {
      id: crypto.randomUUID(),
      type: 'working',
      nodeIds: result.path,
      edgeIds: result.edges,
      totalDistance: result.totalDistance,
      hopCount: result.path.length - 1,
      latency: result.totalDistance * 0.005, // Approximate: 5μs per km
      status: 'computed',
    };

    // Use ChannelChecker to find available channel for L1 services
    let channelNumber: number | undefined;
    let channelAssignments: { edgeId: string; channelNumber: number }[] | undefined;

    if (channelChecker && state.serviceType === 'l1-dwdm') {
      // Check if user requested a specific channel
      const requestedChannel = state.requestedChannelNumber;

      // Check channel availability using the wavelength mode from state
      const availability = channelChecker.checkChannelAvailability(
        servicePath,
        state.wavelengthMode,
        requestedChannel
      );

      if (availability.available && availability.suggestedChannel) {
        channelNumber = availability.suggestedChannel;

        // Create channel assignments for each edge
        channelAssignments = servicePath.edgeIds.map((edgeId) => ({
          edgeId,
          channelNumber: channelNumber!,
        }));
      } else if (availability.commonChannels && availability.commonChannels.length > 0) {
        // Fallback to first available common channel
        channelNumber = availability.commonChannels[0];
        channelAssignments = servicePath.edgeIds.map((edgeId) => ({
          edgeId,
          channelNumber: channelNumber!,
        }));
      }
      // If no channel available, leave undefined - will show warning
    }

    return {
      pathResult: result,
      servicePath,
      channelNumber,
      channelAssignments,
    };
  };

  // Handle path selection
  const handleSelectPath = useCallback(
    (index: number) => {
      dispatch({ type: 'SELECT_PATH', index });
      if (state.computedPaths[index]) {
        dispatch({ type: 'SET_WORKING_PATH', path: state.computedPaths[index].servicePath });
        // Update computed channel for the selected path
        dispatch({ type: 'SET_COMPUTED_CHANNEL', channelNumber: state.computedPaths[index].channelNumber });
      }
    },
    [dispatch, state.computedPaths]
  );

  // Handle mode change
  const handleModeChange = useCallback(
    (mode: PathComputationMode) => {
      dispatch({ type: 'SET_PATH_COMPUTATION_MODE', mode });
      // Clear computed paths when mode changes
      dispatch({ type: 'SET_COMPUTED_PATHS', paths: [] });
      dispatch({ type: 'SET_COMPUTED_CHANNEL', channelNumber: undefined });
    },
    [dispatch]
  );

  // Handle k-value change
  const handleKValueChange = useCallback(
    (kValue: number) => {
      dispatch({ type: 'SET_K_VALUE', kValue });
      // Clear computed paths when k-value changes
      dispatch({ type: 'SET_COMPUTED_PATHS', paths: [] });
      dispatch({ type: 'SET_COMPUTED_CHANNEL', channelNumber: undefined });
    },
    [dispatch]
  );

  // Handle manual path change
  const handleManualPathChange = useCallback(
    (path: ServicePath | null, _validation: PathValidationResult, channelNumber?: number) => {
      if (path) {
        dispatch({ type: 'SET_WORKING_PATH', path });
        dispatch({ type: 'SET_COMPUTED_CHANNEL', channelNumber });
      } else {
        dispatch({ type: 'SET_WORKING_PATH', path: undefined as unknown as ServicePath });
        dispatch({ type: 'SET_COMPUTED_CHANNEL', channelNumber: undefined });
      }
    },
    [dispatch]
  );

  const hasEndpoints = state.sourceNodeId && state.destinationNodeId;
  const isManualMode = state.pathComputationMode === 'manual';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="bg-accent/10 flex h-10 w-10 items-center justify-center rounded-lg">
          <Route className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h3 className="font-medium text-text-primary">Working Path Computation</h3>
          <p className="text-sm text-text-muted">
            Compute and select the primary path for your service
          </p>
        </div>
      </div>

      {/* Endpoint Summary */}
      <div className="bg-secondary/50 rounded-lg border border-border p-3">
        <div className="flex items-center gap-3">
          <div className="bg-accent/10 flex items-center gap-2 rounded px-3 py-1.5">
            <MapPin className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {nodeNameMap.get(state.sourceNodeId) || 'Not selected'}
            </span>
          </div>
          <ArrowRight className="h-5 w-5 text-text-muted" />
          <div className="bg-accent/10 flex items-center gap-2 rounded px-3 py-1.5">
            <MapPin className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {nodeNameMap.get(state.destinationNodeId) || 'Not selected'}
            </span>
          </div>
        </div>
      </div>

      {/* L1 Underlay Path Option (L2/L3 services only) */}
      {underlayPathInfo && state.pathSelectionMode !== 'compute' && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Layers className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h4 className="font-medium text-text-primary">L1 Service Path Available</h4>
              <p className="text-xs text-text-muted">
                Use the path from your selected L1 underlay service
              </p>
            </div>
          </div>

          {/* L1 Service Info */}
          <div className="bg-secondary/30 mb-3 rounded border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-sm text-blue-400">
                {underlayPathInfo.service.id}
              </span>
              <span className="text-xs text-text-muted">
                {underlayPathInfo.service.name}
              </span>
            </div>

            {/* Path Details */}
            <div className="flex items-center gap-4 text-xs text-text-secondary">
              <div className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                <span>{underlayPathInfo.workingPath.nodeIds.length} nodes</span>
              </div>
              <div className="flex items-center gap-1">
                <Ruler className="h-3 w-3" />
                <span>{underlayPathInfo.workingPath.totalDistance.toFixed(1)} km</span>
              </div>
              <div className="flex items-center gap-1">
                <Radio className="h-3 w-3" />
                <span>CH-{underlayPathInfo.service.channelNumber || underlayPathInfo.workingPath.channelNumber || '?'}</span>
              </div>
            </div>

            {/* Path Visualization */}
            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
              {underlayPathInfo.workingPath.nodeIds.slice(0, 6).map((nodeId, idx) => (
                <React.Fragment key={nodeId}>
                  {idx > 0 && <ArrowRight className="h-3 w-3 text-text-muted" />}
                  <span className="max-w-[60px] truncate rounded bg-tertiary px-1.5 py-0.5 text-text-secondary">
                    {nodeNameMap.get(nodeId) || nodeId.slice(0, 6)}
                  </span>
                </React.Fragment>
              ))}
              {underlayPathInfo.workingPath.nodeIds.length > 6 && (
                <span className="text-text-muted">+{underlayPathInfo.workingPath.nodeIds.length - 6} more</span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleAcceptUnderlayPath}
              className="flex-1 border-blue-500/30 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              variant="outline"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Accept L1 Path
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleComputeCustomPath}
              className="flex-1"
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Compute Custom Path
            </Button>
          </div>
        </div>
      )}

      {/* Path Mode Selection - Show only if no underlay path available or user chose compute mode */}
      {(!underlayPathInfo || state.pathSelectionMode === 'compute') && (
        <>
          <PathModeSelect
            value={state.pathComputationMode}
            onChange={handleModeChange}
            kValue={state.kValue}
            onKValueChange={handleKValueChange}
            disabled={isComputing}
          />

          {/* Manual Path Selector */}
      {isManualMode && hasEndpoints && (
        <ManualPathSelector
          sourceNodeId={state.sourceNodeId}
          destinationNodeId={state.destinationNodeId}
          wavelengthMode={state.wavelengthMode}
          isL1Service={state.serviceType === 'l1-dwdm'}
          onPathChange={handleManualPathChange}
          initialPath={state.workingPath}
        />
      )}

      {/* Compute Button (only for non-manual modes) */}
      {!isManualMode && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={computePaths}
            disabled={!hasEndpoints || isComputing}
            className="flex-1"
          >
            {isComputing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Computing...
              </>
            ) : state.computedPaths.length > 0 ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Recompute Paths
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Compute Path
              </>
            )}
          </Button>
        </div>
      )}

      {/* Error Display (only for non-manual modes) */}
      {!isManualMode && computeError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <span className="text-sm text-red-400">{computeError}</span>
        </div>
      )}

      {/* Computed Paths List (only for non-manual modes) */}
      {!isManualMode && state.computedPaths.length > 0 && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-text-secondary">
            Select Working Path
            <span className="ml-1 font-normal text-text-muted">
              ({state.computedPaths.length} path{state.computedPaths.length > 1 ? 's' : ''} found)
            </span>
          </label>

          {/* Warning if fewer paths found than requested */}
          {state.computedPaths[0]?.pathResult?.warnings?.some(
            (w) => w.code === 'FEWER_PATHS_THAN_REQUESTED'
          ) && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
              <div className="text-sm text-yellow-400">
                <p className="font-medium">Fewer paths than requested</p>
                <p className="mt-1 text-yellow-400/80">
                  {state.computedPaths[0]?.pathResult?.warnings?.find(
                    (w) => w.code === 'FEWER_PATHS_THAN_REQUESTED'
                  )?.message}
                </p>
              </div>
            </div>
          )}

          <div className="max-h-panel space-y-2 overflow-y-auto pr-1">
            {state.computedPaths.map((computedPath, index) => (
              <PathCard
                key={computedPath.servicePath.id}
                path={computedPath}
                index={index}
                isSelected={state.selectedPathIndex === index}
                onSelect={() => handleSelectPath(index)}
                nodes={nodeNameMap}
              />
            ))}
          </div>
        </div>
      )}

      {/* No paths computed yet (only for non-manual modes) */}
      {!isManualMode && state.computedPaths.length === 0 && !computeError && !isComputing && (
        <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
          <Route className="mx-auto mb-3 h-10 w-10 text-text-muted" />
          <p className="text-sm text-text-muted">
            Click &quot;Compute Path&quot; to find routes between your selected endpoints
          </p>
        </div>
      )}

          {/* Info about L1 services and channel assignment (for non-manual computed paths) */}
          {!isManualMode && state.serviceType === 'l1-dwdm' && state.computedPaths.length > 0 && (
            <>
              {/* Show assigned channel */}
              {state.computedChannelNumber ? (
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-green-400" />
                    <span className="text-green-400">
                      <strong>Assigned Channel:</strong> CH-{state.computedChannelNumber}
                      {state.requestedChannelNumber
                        ? ' (requested)'
                        : ' (auto-selected)'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                    <span className="text-yellow-400">
                      <strong>Warning:</strong> No channel available on this path.
                      All 96 channels may be in use on one or more edges.
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* OSNR Analysis Panel (when transceiver selected and path computed) */}
          {osnrResult && (
            <OsnrAnalysisPanel result={osnrResult} />
          )}

        </>
      )}

      {/* OSNR Analysis for underlay accepted path or manual mode */}
      {state.serviceType === 'l1-dwdm' && osnrResult && (
        (state.pathSelectionMode === 'accept-underlay' || isManualMode) && (
          <OsnrAnalysisPanel result={osnrResult} />
        )
      )}
    </div>
  );
};

export default ServiceWizardPath;
