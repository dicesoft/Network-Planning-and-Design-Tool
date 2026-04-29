/**
 * ServiceWizardParameters - Step 2: Service Parameters Configuration
 *
 * Configures service-specific parameters:
 * - L1: Data rate, modulation, channel width, wavelength mode
 * - L2/L3: Data rate, underlay service selection, BFD configuration
 */

import React, { useMemo } from 'react';
import { useWizard } from './ServiceWizardContext';
import { useServiceStore } from '@/stores/serviceStore';
import { useNetworkStore } from '@/stores/networkStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Info, Zap, Radio, Settings, AlertTriangle, CheckCircle, Cpu } from 'lucide-react';
import {
  L1_DATA_RATE_CONFIGS,
  MODULATION_TYPE_CONFIGS,
  CHANNEL_WIDTH_CONFIGS,
  WAVELENGTH_MODE_CONFIGS,
  SERVICE_TYPE_CONFIGS,
  type L1DataRate,
  type ModulationType,
  type ChannelWidth,
  type WavelengthMode,
  type L1DWDMService,
} from '@/types/service';
import { DEFAULT_TRANSCEIVERS, type TransceiverType } from '@/types/transceiver';
import { MODULATION_REACH_LIMITS } from '@/core/services/L1ServiceManager';
import { PathFinder } from '@/core/graph/PathFinder';
import { GraphEngine } from '@/core/graph/GraphEngine';

// ============================================================================
// L1 PARAMETERS SECTION
// ============================================================================

const L1ParametersSection: React.FC = () => {
  const { state, dispatch } = useWizard();
  const userTransceivers = useSettingsStore((s) => s.settings.transceiverLibrary);

  const modulationReach = MODULATION_REACH_LIMITS[state.modulationType];

  // Merge default + user transceivers, user overrides by ID
  const allTransceivers = useMemo((): TransceiverType[] => {
    const merged = [...DEFAULT_TRANSCEIVERS];
    if (userTransceivers) {
      for (const ut of userTransceivers) {
        const idx = merged.findIndex((t) => t.id === ut.id);
        if (idx >= 0) merged[idx] = ut;
        else merged.push(ut);
      }
    }
    return merged;
  }, [userTransceivers]);

  // Filter transceivers that support the selected data rate AND modulation
  const compatibleTransceivers = useMemo(() => {
    return allTransceivers.filter((t) => {
      const rateMatch = t.supportedDataRates.includes(state.dataRate);
      const modMatch = t.supportedModulations.some(
        (m) => m.modulation === state.modulationType
      );
      return rateMatch && modMatch;
    });
  }, [allTransceivers, state.dataRate, state.modulationType]);

  // Selected transceiver details
  const selectedTransceiver = useMemo(() => {
    if (!state.transceiverTypeId) return null;
    return allTransceivers.find((t) => t.id === state.transceiverTypeId) || null;
  }, [allTransceivers, state.transceiverTypeId]);

  // Get OSNR requirement for the selected modulation from the transceiver
  const transceiverModInfo = useMemo(() => {
    if (!selectedTransceiver) return null;
    return selectedTransceiver.supportedModulations.find(
      (m) => m.modulation === state.modulationType
    ) || null;
  }, [selectedTransceiver, state.modulationType]);

  // When transceiver is no longer compatible with rate/mod, clear selection
  const effectiveTransceiverId = useMemo(() => {
    if (!state.transceiverTypeId) return undefined;
    const isCompatible = compatibleTransceivers.some(
      (t) => t.id === state.transceiverTypeId
    );
    return isCompatible ? state.transceiverTypeId : undefined;
  }, [state.transceiverTypeId, compatibleTransceivers]);

  return (
    <div className="space-y-6">
      {/* Data Rate */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Data Rate
        </label>
        <Select
          value={state.dataRate}
          onValueChange={(v) => dispatch({ type: 'SET_DATA_RATE', dataRate: v as L1DataRate })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(L1_DATA_RATE_CONFIGS) as L1DataRate[]).map((rate) => (
              <SelectItem key={rate} value={rate}>
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-accent" />
                  {L1_DATA_RATE_CONFIGS[rate].label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Modulation & Channel Width */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Modulation Type
          </label>
          <Select
            value={state.modulationType}
            onValueChange={(v) => dispatch({ type: 'SET_MODULATION', modulationType: v as ModulationType })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODULATION_TYPE_CONFIGS) as ModulationType[]).map((mod) => {
                const config = MODULATION_TYPE_CONFIGS[mod];
                return (
                  <SelectItem key={mod} value={mod}>
                    <div className="flex flex-col">
                      <span>{config.label}</span>
                      <span className="text-xs text-text-muted">{config.reach}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs text-text-muted">
            Max reach: <span className="font-medium text-accent">{modulationReach} km</span>
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Channel Width
          </label>
          <Select
            value={state.channelWidth}
            onValueChange={(v) => dispatch({ type: 'SET_CHANNEL_WIDTH', channelWidth: v as ChannelWidth })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CHANNEL_WIDTH_CONFIGS) as ChannelWidth[]).map((width) => (
                <SelectItem key={width} value={width}>
                  {CHANNEL_WIDTH_CONFIGS[width].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Transceiver Selection */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Transceiver
          <span className="ml-1 font-normal text-text-muted">(optional)</span>
        </label>
        <Select
          value={effectiveTransceiverId || '__none__'}
          onValueChange={(v) =>
            dispatch({
              type: 'SET_TRANSCEIVER',
              transceiverTypeId: v === '__none__' ? undefined : v,
            })
          }
        >
          <SelectTrigger data-testid="transceiver-select">
            <SelectValue placeholder="Select transceiver..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="text-text-muted">None (manual parameters)</span>
            </SelectItem>
            {compatibleTransceivers.map((t) => {
              const modInfo = t.supportedModulations.find(
                (m) => m.modulation === state.modulationType
              );
              return (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 text-accent" />
                      <span>{t.name}</span>
                    </div>
                    <span className="text-xs text-text-muted">
                      {t.vendor} | {t.formFactor} | {t.baudRate} GBd
                      {modInfo ? ` | Req. OSNR: ${modInfo.requiredOSNR} dB` : ''}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {compatibleTransceivers.length === 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-yellow-500">
            <AlertTriangle className="h-3 w-3" />
            No transceivers support {state.dataRate} with {state.modulationType}
          </p>
        )}
        {selectedTransceiver && transceiverModInfo && (
          <div className="bg-secondary/50 mt-2 space-y-1 rounded-lg border border-border p-3 text-xs" data-testid="transceiver-params">
            <div className="flex justify-between">
              <span className="text-text-muted">Launch Power</span>
              <span className="font-medium text-text-primary">{selectedTransceiver.launchPower} dBm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Tx OSNR</span>
              <span className="font-medium text-text-primary">{selectedTransceiver.txOSNR} dB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Required OSNR ({state.modulationType})</span>
              <span className="font-medium text-text-primary">{transceiverModInfo.requiredOSNR} dB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Max Reach</span>
              <span className="font-medium text-text-primary">{transceiverModInfo.maxReach} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Baud Rate</span>
              <span className="font-medium text-text-primary">{selectedTransceiver.baudRate} GBd</span>
            </div>
          </div>
        )}
      </div>

      {/* Wavelength Mode */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Wavelength Mode
        </label>
        <Select
          value={state.wavelengthMode}
          onValueChange={(v) => dispatch({ type: 'SET_WAVELENGTH_MODE', wavelengthMode: v as WavelengthMode })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(WAVELENGTH_MODE_CONFIGS) as WavelengthMode[]).map((mode) => {
              const config = WAVELENGTH_MODE_CONFIGS[mode];
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

      {/* Requested Channel (optional) */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Requested Channel Number
          <span className="ml-1 font-normal text-text-muted">(optional)</span>
        </label>
        <Input
          type="number"
          min={1}
          max={96}
          value={state.requestedChannelNumber || ''}
          onChange={(e) =>
            dispatch({
              type: 'SET_REQUESTED_CHANNEL',
              channelNumber: e.target.value ? parseInt(e.target.value, 10) : undefined,
            })
          }
          placeholder="Auto-select (1-96)"
        />
        <p className="mt-1 text-xs text-text-muted">
          ITU-T C-band channels 1-96 (50 GHz spacing). Leave blank for automatic selection.
        </p>
      </div>

      {/* Info Box */}
      <div className="bg-accent/5 border-accent/20 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="text-sm text-text-secondary">
            <p className="mb-1 font-medium text-text-primary">Optical Parameters</p>
            <p>
              Higher modulation types (like DP-64QAM) offer more capacity but have shorter reach.
              {selectedTransceiver
                ? ` Selected transceiver (${selectedTransceiver.name}) will be used for OSNR analysis.`
                : ' Select a transceiver for automatic OSNR feasibility analysis.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// L2/L3 PARAMETERS SECTION
// ============================================================================

const L2L3ParametersSection: React.FC = () => {
  const { state, dispatch } = useWizard();
  const services = useServiceStore((s) => s.services);
  const findL1ServicesCoveringPath = useServiceStore((s) => s.findL1ServicesCoveringPath);
  const findL1ServicesAlongPath = useServiceStore((s) => s.findL1ServicesAlongPath);
  const topology = useNetworkStore((s) => s.topology);
  const nodes = topology.nodes;
  const edges = topology.edges;

  // Get available L1 services for underlay
  const availableL1Services = useMemo(() => {
    return services.filter(
      (s) =>
        s.type === 'l1-dwdm' &&
        (s.status === 'active' || s.status === 'planned' || s.status === 'provisioning')
    ) as L1DWDMService[];
  }, [services]);

  // Compute preliminary path for L1 discovery when workingPath not yet computed
  // This enables finding L1 services along the path BEFORE user goes to Step 3
  const preliminaryPathNodeIds = useMemo(() => {
    // If workingPath already exists, use it
    if (state.workingPath?.nodeIds && state.workingPath.nodeIds.length > 0) {
      return state.workingPath.nodeIds;
    }

    // If no endpoints selected, can't compute path
    if (!state.sourceNodeId || !state.destinationNodeId) {
      return [];
    }

    // Compute preliminary shortest path for L1 discovery
    try {
      const graphEngine = new GraphEngine();
      graphEngine.loadFromTopology(topology);
      const pathFinder = new PathFinder(graphEngine);
      const result = pathFinder.shortestPath(state.sourceNodeId, state.destinationNodeId);
      if (result && result.path.length > 0) {
        return result.path;
      }
    } catch {
      // Path computation failed, fall back to empty
    }

    return [];
  }, [state.workingPath?.nodeIds, state.sourceNodeId, state.destinationNodeId, topology]);

  // Extract DWDM edge IDs from the working path (if computed)
  const dwdmEdgeIds = useMemo(() => {
    if (!state.workingPath?.edgeIds) return [];

    return state.workingPath.edgeIds.filter((edgeId) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return false;

      // Check if this is a DWDM edge (fiber type or connects OADM/terminal/amplifier)
      const sourceNode = nodes.find((n) => n.id === edge.source.nodeId);
      const targetNode = nodes.find((n) => n.id === edge.target.nodeId);

      return (
        edge.type === 'fiber' ||
        (sourceNode?.type === 'oadm' && targetNode?.type === 'oadm') ||
        (sourceNode?.type === 'oadm' && targetNode?.type === 'terminal') ||
        (sourceNode?.type === 'terminal' && targetNode?.type === 'oadm') ||
        (sourceNode?.type === 'terminal' && targetNode?.type === 'terminal') ||
        sourceNode?.type === 'amplifier' ||
        targetNode?.type === 'amplifier'
      );
    });
  }, [state.workingPath?.edgeIds, edges, nodes]);

  // Tier 1: Find L1 services that cover the computed path's DWDM edges (path-based discovery)
  const pathCoveringL1Services = useMemo(() => {
    if (dwdmEdgeIds.length === 0) return [];
    return findL1ServicesCoveringPath(dwdmEdgeIds, state.dataRate);
  }, [dwdmEdgeIds, state.dataRate, findL1ServicesCoveringPath]);

  // Tier 2: Find L1 services connecting intermediate DWDM nodes along the path
  // This handles cases like Router→OADM A→OADM B→Router where L1 exists between OADM A and OADM B
  // Uses preliminary path if workingPath not yet computed (before Step 3)
  const intermediateL1Services = useMemo(() => {
    if (preliminaryPathNodeIds.length < 3) {
      return [];
    }
    return findL1ServicesAlongPath(preliminaryPathNodeIds, state.dataRate);
  }, [preliminaryPathNodeIds, state.dataRate, findL1ServicesAlongPath]);

  // Tier 3: Filter L1 services by endpoint matching (fallback for when no path is computed)
  const endpointMatchingL1Services = useMemo(() => {
    if (!state.sourceNodeId || !state.destinationNodeId) return availableL1Services;

    return availableL1Services.filter((s) => {
      const matchesDirect =
        s.sourceNodeId === state.sourceNodeId && s.destinationNodeId === state.destinationNodeId;
      const matchesReverse =
        s.sourceNodeId === state.destinationNodeId && s.destinationNodeId === state.sourceNodeId;
      return matchesDirect || matchesReverse;
    });
  }, [availableL1Services, state.sourceNodeId, state.destinationNodeId]);

  // Use path-covering services first, then intermediate node services, then endpoint matching
  const matchingL1Services = useMemo(() => {
    // Tier 1: Services covering all DWDM edges in path
    if (pathCoveringL1Services.length > 0) {
      return pathCoveringL1Services;
    }
    // Tier 2: Services connecting intermediate DWDM nodes along the path
    if (intermediateL1Services.length > 0) {
      return intermediateL1Services;
    }
    // Tier 3: Exact endpoint matching (fallback)
    return endpointMatchingL1Services;
  }, [pathCoveringL1Services, intermediateL1Services, endpointMatchingL1Services]);

  // Determine which discovery method is being used
  const usingPathBasedDiscovery = pathCoveringL1Services.length > 0 && dwdmEdgeIds.length > 0;
  const usingIntermediateDiscovery = !usingPathBasedDiscovery && intermediateL1Services.length > 0;
  const usingPreliminaryPath = !state.workingPath?.nodeIds && preliminaryPathNodeIds.length > 0;

  const serviceTypeLabel = state.serviceType === 'l2-ethernet' ? 'L2 Ethernet' : 'L3 IP';

  return (
    <div className="space-y-6">
      {/* Data Rate */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Data Rate
        </label>
        <Select
          value={state.dataRate}
          onValueChange={(v) => dispatch({ type: 'SET_DATA_RATE', dataRate: v as L1DataRate })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(L1_DATA_RATE_CONFIGS) as L1DataRate[]).map((rate) => (
              <SelectItem key={rate} value={rate}>
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-accent" />
                  {L1_DATA_RATE_CONFIGS[rate].label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Underlay Service Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-text-secondary">
          L1 Underlay Service
        </label>

        {/* Auto-create toggle */}
        <label className="flex cursor-pointer items-center gap-3">
          <Checkbox
            checked={state.autoCreateUnderlay}
            onCheckedChange={(checked) =>
              dispatch({ type: 'SET_AUTO_CREATE_UNDERLAY', autoCreate: !!checked })
            }
          />
          <span className="text-sm text-text-primary">
            Auto-create new L1 DWDM underlay service
          </span>
        </label>

        {/* Existing service selector */}
        {!state.autoCreateUnderlay && (
          <div>
            <Select
              value={state.underlayServiceId}
              onValueChange={(v) => dispatch({ type: 'SET_UNDERLAY_SERVICE', serviceId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select existing L1 service..." />
              </SelectTrigger>
              <SelectContent>
                {matchingL1Services.length === 0 ? (
                  <div className="p-2 text-center text-sm text-text-muted">
                    No compatible L1 services found
                  </div>
                ) : (
                  matchingL1Services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      <div className="flex flex-col">
                        <span>
                          {service.id} - {service.name}
                        </span>
                        <span className="text-xs text-text-muted">
                          {service.dataRate} • {service.status}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {matchingL1Services.length === 0 && (
              <div className="mt-2 flex items-center gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {dwdmEdgeIds.length > 0
                    ? 'No L1 services cover the DWDM edges in your computed path. Consider enabling auto-create.'
                    : 'No L1 services match your endpoints. Compute a path first or enable auto-create.'}
                </span>
              </div>
            )}

            {usingPathBasedDiscovery && matchingL1Services.length > 0 && (
              <div className="mt-2 flex items-center gap-2 rounded border border-green-500/30 bg-green-500/10 p-2 text-xs text-green-400">
                <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Found {matchingL1Services.length} L1 service(s) covering your path&apos;s DWDM edges.
                </span>
              </div>
            )}

            {usingIntermediateDiscovery && matchingL1Services.length > 0 && (
              <div className="mt-2 flex items-center gap-2 rounded border border-green-500/30 bg-green-500/10 p-2 text-xs text-green-400">
                <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Found {matchingL1Services.length} L1 service(s) between intermediate OADM nodes along {usingPreliminaryPath ? 'the computed' : 'your'} path.
                </span>
              </div>
            )}

            {usingPreliminaryPath && matchingL1Services.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded border border-blue-500/30 bg-blue-500/10 p-2 text-xs text-blue-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  L1 services discovered using shortest path computation. You can refine your path selection in Step 3.
                </span>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-text-muted">
          {state.serviceType === 'l2-ethernet'
            ? 'L2 Ethernet services require an L1 DWDM underlay to transport Ethernet frames.'
            : 'L3 IP services require an L1 DWDM underlay to transport IP packets.'}
        </p>
      </div>

      {/* BFD Configuration */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-text-secondary">
          BFD Configuration
        </label>

        <label className="flex cursor-pointer items-center gap-3">
          <Checkbox
            checked={state.bfdConfig.enabled}
            onCheckedChange={(checked) =>
              dispatch({ type: 'SET_BFD_CONFIG', config: { enabled: !!checked } })
            }
          />
          <span className="text-sm text-text-primary">
            Enable Bidirectional Forwarding Detection (BFD)
          </span>
        </label>

        {state.bfdConfig.enabled && (
          <div className="bg-secondary/50 ml-7 space-y-3 rounded-lg border border-border p-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">
                  Min TX Interval (μs)
                </label>
                <Input
                  type="number"
                  min={1000}
                  step={1000}
                  value={state.bfdConfig.minTxInterval}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_BFD_CONFIG',
                      config: { minTxInterval: parseInt(e.target.value, 10) || 300000 },
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">
                  Min RX Interval (μs)
                </label>
                <Input
                  type="number"
                  min={1000}
                  step={1000}
                  value={state.bfdConfig.minRxInterval}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_BFD_CONFIG',
                      config: { minRxInterval: parseInt(e.target.value, 10) || 300000 },
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">
                  Multiplier
                </label>
                <Input
                  type="number"
                  min={1}
                  max={255}
                  value={state.bfdConfig.multiplier}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_BFD_CONFIG',
                      config: { multiplier: parseInt(e.target.value, 10) || 3 },
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-text-muted">
              Detection time = Min RX Interval × Multiplier ={' '}
              <span className="font-medium text-accent">
                {((state.bfdConfig.minRxInterval * state.bfdConfig.multiplier) / 1000).toFixed(0)} ms
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-accent/5 border-accent/20 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <Settings className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="text-sm text-text-secondary">
            <p className="mb-1 font-medium text-text-primary">{serviceTypeLabel} Service</p>
            <p>
              {state.autoCreateUnderlay
                ? 'A new L1 DWDM service will be automatically created with the same endpoints and optimal parameters.'
                : 'The selected L1 underlay service must have sufficient capacity and matching endpoints.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ServiceWizardParameters: React.FC = () => {
  const { state } = useWizard();

  return (
    <div className="space-y-6">
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{
            backgroundColor: `${SERVICE_TYPE_CONFIGS[state.serviceType].color}20`,
            color: SERVICE_TYPE_CONFIGS[state.serviceType].color,
          }}
        >
          {state.serviceType === 'l1-dwdm' ? (
            <Radio className="h-5 w-5" />
          ) : (
            <Settings className="h-5 w-5" />
          )}
        </div>
        <div>
          <h3 className="font-medium text-text-primary">
            {SERVICE_TYPE_CONFIGS[state.serviceType].label} Parameters
          </h3>
          <p className="text-sm text-text-muted">
            {SERVICE_TYPE_CONFIGS[state.serviceType].description}
          </p>
        </div>
      </div>

      {state.serviceType === 'l1-dwdm' ? (
        <L1ParametersSection />
      ) : (
        <L2L3ParametersSection />
      )}
    </div>
  );
};

export default ServiceWizardParameters;
