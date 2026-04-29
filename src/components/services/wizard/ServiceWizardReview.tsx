/**
 * ServiceWizardReview - Step 5: Review and Create Service
 *
 * Final step that displays a complete summary of the service configuration
 * and allows the user to review all settings before creation.
 */

import React, { useMemo } from 'react';
import { useWizard } from './ServiceWizardContext';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import {
  CheckCircle,
  Radio,
  Network,
  Globe,
  MapPin,
  ArrowRight,
  Zap,
  Shield,
  Route,
  AlertTriangle,
  Clock,
  Activity,
  Cpu,
} from 'lucide-react';
import {
  SERVICE_TYPE_CONFIGS,
  L1_DATA_RATE_CONFIGS,
  MODULATION_TYPE_CONFIGS,
  CHANNEL_WIDTH_CONFIGS,
  WAVELENGTH_MODE_CONFIGS,
  PROTECTION_SCHEME_CONFIGS,
  IP_PROTECTION_SCHEME_CONFIGS,
} from '@/types/service';
import { DEFAULT_TRANSCEIVERS } from '@/types/transceiver';
import { calculateOSNR } from '@/core/optical/OSNREngine';
import { FIBER_PROFILE_CONFIGS } from '@/types/network';
import type { SpanInput, TransceiverParams, AmplifierParams } from '@/core/optical/types';
import { DEFAULT_EOL_MARGIN } from '@/core/optical/constants';

// ============================================================================
// REVIEW SECTION COMPONENT
// ============================================================================

interface ReviewSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const ReviewSection: React.FC<ReviewSectionProps> = ({ title, icon, children, className }) => {
  return (
    <div className={cn('p-4 bg-secondary/30 rounded-lg border border-border', className)}>
      <div className="border-border/50 mb-3 flex items-center gap-2 border-b pb-2">
        {icon}
        <h4 className="font-medium text-text-primary">{title}</h4>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
};

// ============================================================================
// REVIEW ROW COMPONENT
// ============================================================================

interface ReviewRowProps {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}

const ReviewRow: React.FC<ReviewRowProps> = ({ label, value, highlight }) => {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={cn('font-medium', highlight ? 'text-accent' : 'text-text-primary')}>
        {value}
      </span>
    </div>
  );
};

// ============================================================================
// SERVICE TYPE ICONS
// ============================================================================

const SERVICE_TYPE_ICONS: Record<string, React.ReactNode> = {
  'l1-dwdm': <Radio className="h-5 w-5" />,
  'l2-ethernet': <Network className="h-5 w-5" />,
  'l3-ip': <Globe className="h-5 w-5" />,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ServiceWizardReview: React.FC = () => {
  const { state } = useWizard();
  const nodes = useNetworkStore((s) => s.topology.nodes);
  const edges = useNetworkStore((s) => s.topology.edges);
  const services = useServiceStore((s) => s.services);
  const opticalSettings = useSettingsStore((s) => s.settings.optical);
  const userTransceivers = useSettingsStore((s) => s.settings.transceiverLibrary);

  // Get node names
  const sourceNode = nodes.find((n) => n.id === state.sourceNodeId);
  const destNode = nodes.find((n) => n.id === state.destinationNodeId);

  // Get underlay service for L2/L3
  const underlayService = useMemo(() => {
    if (state.serviceType === 'l1-dwdm') return null;
    return services.find((s) => s.id === state.underlayServiceId);
  }, [state.serviceType, state.underlayServiceId, services]);

  // Compute OSNR for review display
  const osnrResult = useMemo(() => {
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

    for (let i = 0; i < state.workingPath.edgeIds.length; i++) {
      const edge = edges.find((e) => e.id === state.workingPath!.edgeIds[i]);
      if (!edge) continue;

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

      const targetNode = nodes.find((n) => n.id === edge.target.nodeId);
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

    try {
      return calculateOSNR(spans, transceiverParams, amps, opticalSettings?.defaultEoLMargin ?? DEFAULT_EOL_MARGIN);
    } catch {
      return null;
    }
  }, [state.serviceType, state.workingPath, state.transceiverTypeId, state.modulationType, edges, nodes, userTransceivers, opticalSettings]);

  // Get transceiver name for display
  const transceiverName = useMemo(() => {
    if (!state.transceiverTypeId) return null;
    const allTransceivers = [...DEFAULT_TRANSCEIVERS, ...(userTransceivers || [])];
    return allTransceivers.find((t) => t.id === state.transceiverTypeId)?.name || null;
  }, [state.transceiverTypeId, userTransceivers]);

  const isL1Service = state.serviceType === 'l1-dwdm';
  const serviceTypeConfig = SERVICE_TYPE_CONFIGS[state.serviceType];

  // Validation warnings
  const warnings: string[] = [];

  if (!state.workingPath && isL1Service) {
    warnings.push('No working path has been computed');
  }

  if (state.protectionScheme !== 'none' && state.protectionScheme !== 'wson-restoration' && !state.protectionPath && isL1Service) {
    warnings.push('Protection scheme selected but no protection path computed');
  }

  if (state.srlgAnalysis && state.srlgAnalysis.riskScore > 30) {
    warnings.push(`High SRLG overlap (${state.srlgAnalysis.riskScore.toFixed(0)}%) between working and protection paths`);
  }

  if (!isL1Service && !state.autoCreateUnderlay && !state.underlayServiceId) {
    warnings.push('No L1 underlay service selected');
  }

  if (isL1Service && osnrResult && !osnrResult.feasible) {
    warnings.push(`OSNR infeasible: system margin ${osnrResult.systemMargin.toFixed(1)} dB (need >= 0 dB)`);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `${serviceTypeConfig.color}20`,
            color: serviceTypeConfig.color,
          }}
        >
          {SERVICE_TYPE_ICONS[state.serviceType]}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            {state.name || `New ${serviceTypeConfig.label}`}
          </h3>
          <p className="text-sm text-text-muted">{serviceTypeConfig.description}</p>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            <div className="text-sm text-yellow-400">
              <p className="mb-1 font-medium">Warnings</p>
              <ul className="list-inside list-disc space-y-0.5 text-yellow-400/80">
                {warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Endpoints Section */}
      <ReviewSection
        title="Endpoints"
        icon={<MapPin className="h-4 w-4 text-accent" />}
      >
        <div className="bg-secondary/50 flex items-center gap-3 rounded p-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-text-muted">Source</div>
            <div className="truncate font-medium text-text-primary">
              {sourceNode?.name || state.sourceNodeId}
            </div>
            {sourceNode && (
              <div className="text-xs text-text-muted">
                {sourceNode.type} • {sourceNode.vendor || 'N/A'}
              </div>
            )}
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1 text-right">
            <div className="text-xs text-text-muted">Destination</div>
            <div className="truncate font-medium text-text-primary">
              {destNode?.name || state.destinationNodeId}
            </div>
            {destNode && (
              <div className="text-xs text-text-muted">
                {destNode.type} • {destNode.vendor || 'N/A'}
              </div>
            )}
          </div>
        </div>
      </ReviewSection>

      {/* Parameters Section */}
      <ReviewSection
        title="Service Parameters"
        icon={<Zap className="h-4 w-4 text-purple-400" />}
      >
        <ReviewRow
          label="Data Rate"
          value={L1_DATA_RATE_CONFIGS[state.dataRate].label}
          highlight
        />

        {isL1Service && (
          <>
            <ReviewRow
              label="Modulation"
              value={MODULATION_TYPE_CONFIGS[state.modulationType].label}
            />
            <ReviewRow
              label="Channel Width"
              value={CHANNEL_WIDTH_CONFIGS[state.channelWidth].label}
            />
            <ReviewRow
              label="Wavelength Mode"
              value={WAVELENGTH_MODE_CONFIGS[state.wavelengthMode].label}
            />
            {/* Show channel - either requested or auto-computed */}
            {(state.requestedChannelNumber || state.computedChannelNumber) && (
              <ReviewRow
                label={state.requestedChannelNumber ? 'Requested Channel' : 'Assigned Channel'}
                value={
                  <span className="flex items-center gap-1">
                    CH-{state.requestedChannelNumber || state.computedChannelNumber}
                    {!state.requestedChannelNumber && (
                      <span className="text-xs text-text-muted">(auto)</span>
                    )}
                  </span>
                }
                highlight
              />
            )}
            {/* Warning if no channel available */}
            {!state.requestedChannelNumber && !state.computedChannelNumber && state.workingPath && (
              <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-400">
                No channel available on selected path
              </div>
            )}
          </>
        )}

        {!isL1Service && (
          <>
            <ReviewRow
              label="L1 Underlay"
              value={
                state.autoCreateUnderlay
                  ? 'Auto-create new'
                  : underlayService?.name || state.underlayServiceId || 'Not selected'
              }
            />
            {/* Show underlay channel for auto-created L1 underlays */}
            {state.autoCreateUnderlay && state.workingPath && (
              <ReviewRow
                label="Underlay Channel"
                value={
                  state.underlayChannelNumber ? (
                    <span className="flex items-center gap-1">
                      CH-{state.underlayChannelNumber}
                      <span className="text-xs text-text-muted">(auto-assigned)</span>
                    </span>
                  ) : (
                    <span className="text-yellow-400">Will be auto-assigned</span>
                  )
                }
                highlight={!!state.underlayChannelNumber}
              />
            )}
            {/* Warning if underlay channel has issues */}
            {state.autoCreateUnderlay && state.underlayChannelWarning && (
              <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-400">
                {state.underlayChannelWarning}
              </div>
            )}
            <ReviewRow
              label="BFD"
              value={state.bfdConfig.enabled ? 'Enabled' : 'Disabled'}
            />
            {state.bfdConfig.enabled && (
              <ReviewRow
                label="BFD Detection Time"
                value={`${((state.bfdConfig.minRxInterval * state.bfdConfig.multiplier) / 1000).toFixed(0)} ms`}
              />
            )}
          </>
        )}
      </ReviewSection>

      {/* Path Section (L1 only) */}
      {isL1Service && state.workingPath && (
        <ReviewSection
          title="Working Path"
          icon={<Route className="h-4 w-4 text-green-400" />}
        >
          <div className="mb-2 grid grid-cols-3 gap-2">
            <div className="bg-secondary/50 rounded p-2 text-center">
              <div className="text-xs text-text-muted">Distance</div>
              <div className="font-medium text-text-primary">
                {state.workingPath.totalDistance.toFixed(1)} km
              </div>
            </div>
            <div className="bg-secondary/50 rounded p-2 text-center">
              <div className="text-xs text-text-muted">Hops</div>
              <div className="font-medium text-text-primary">{state.workingPath.hopCount}</div>
            </div>
            <div className="bg-secondary/50 rounded p-2 text-center">
              <div className="text-xs text-text-muted">Nodes</div>
              <div className="font-medium text-text-primary">
                {state.workingPath.nodeIds.length}
              </div>
            </div>
          </div>

          {/* Path visualization */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {state.workingPath.nodeIds.map((nodeId, i) => {
              const node = nodes.find((n) => n.id === nodeId);
              return (
                <React.Fragment key={nodeId}>
                  <span className="rounded bg-green-500/10 px-2 py-0.5 text-green-400">
                    {node?.name || nodeId}
                  </span>
                  {i < state.workingPath!.nodeIds.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-text-muted" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </ReviewSection>
      )}

      {/* OSNR Analysis Section (L1 only, when transceiver selected) */}
      {isL1Service && osnrResult && (
        <ReviewSection
          title="OSNR Analysis"
          icon={<Activity className="h-4 w-4 text-blue-400" />}
        >
          {transceiverName && (
            <ReviewRow
              label="Transceiver"
              value={
                <span className="flex items-center gap-1">
                  <Cpu className="h-3 w-3" />
                  {transceiverName}
                </span>
              }
            />
          )}
          <ReviewRow
            label="Final GSNR"
            value={`${osnrResult.finalGSNR.toFixed(1)} dB`}
            highlight
          />
          <ReviewRow
            label="Required OSNR"
            value={`${osnrResult.requiredOSNR.toFixed(1)} dB`}
          />
          <ReviewRow
            label="EoL Margin"
            value={`${osnrResult.eolMargin.toFixed(1)} dB`}
          />
          <ReviewRow
            label="System Margin"
            value={`${osnrResult.systemMargin.toFixed(1)} dB`}
            highlight
          />

          {/* Feasibility indicator */}
          <div
            className={cn(
              'mt-2 p-2 rounded text-sm flex items-center gap-2',
              osnrResult.feasible
                ? 'bg-green-500/10 text-green-400'
                : 'bg-red-500/10 text-red-400'
            )}
            data-testid="osnr-review-feasibility"
          >
            {osnrResult.feasible ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <span className="font-medium">
              {osnrResult.feasible ? 'OSNR Feasible' : 'OSNR Infeasible'}
            </span>
          </div>
        </ReviewSection>
      )}

      {/* Protection Section */}
      <ReviewSection
        title="Protection"
        icon={<Shield className="h-4 w-4 text-orange-400" />}
      >
        <ReviewRow
          label="Protection Scheme"
          value={
            isL1Service
              ? PROTECTION_SCHEME_CONFIGS[state.protectionScheme].label
              : IP_PROTECTION_SCHEME_CONFIGS[state.ipProtectionScheme].label
          }
        />

        {isL1Service && state.protectionPath && (
          <>
            <div className="mb-2 grid grid-cols-3 gap-2">
              <div className="bg-secondary/50 rounded p-2 text-center">
                <div className="text-xs text-text-muted">Distance</div>
                <div className="font-medium text-text-primary">
                  {state.protectionPath.totalDistance.toFixed(1)} km
                </div>
              </div>
              <div className="bg-secondary/50 rounded p-2 text-center">
                <div className="text-xs text-text-muted">Hops</div>
                <div className="font-medium text-text-primary">{state.protectionPath.hopCount}</div>
              </div>
              <div className="bg-secondary/50 rounded p-2 text-center">
                <div className="text-xs text-text-muted">Nodes</div>
                <div className="font-medium text-text-primary">
                  {state.protectionPath.nodeIds.length}
                </div>
              </div>
            </div>

            {/* Protection path node sequence visualization */}
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {state.protectionPath.nodeIds.map((nodeId, i) => {
                const node = nodes.find((n) => n.id === nodeId);
                return (
                  <React.Fragment key={nodeId}>
                    <span className="rounded bg-orange-500/10 px-2 py-0.5 text-orange-400">
                      {node?.name || nodeId}
                    </span>
                    {i < state.protectionPath!.nodeIds.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-text-muted" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </>
        )}

        {state.srlgAnalysis && (
          <div
            className={cn(
              'mt-2 p-2 rounded text-sm',
              state.srlgAnalysis.riskScore === 0
                ? 'bg-green-500/10 text-green-400'
                : state.srlgAnalysis.riskScore <= 30
                ? 'bg-yellow-500/10 text-yellow-400'
                : 'bg-red-500/10 text-red-400'
            )}
          >
            <div className="flex items-center justify-between">
              <span>SRLG Diversity Score</span>
              <span className="font-bold">
                {(100 - state.srlgAnalysis.riskScore).toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {/* WSON Restoration Info */}
        {isL1Service && (state.protectionScheme === '1+1+wson' || state.protectionScheme === 'wson-restoration') && (
          <div className="mt-2 flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-400">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              {state.protectionScheme === '1+1+wson'
                ? 'WSON dynamic restoration as tertiary backup (~5 min recovery)'
                : 'WSON dynamic restoration (~5 min recovery)'}
            </span>
          </div>
        )}
      </ReviewSection>

      {/* Service Creation Info */}
      <div className="bg-accent/5 border-accent/20 flex items-start gap-3 rounded-lg border p-3">
        <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="text-sm text-text-secondary">
          <p className="mb-1 font-medium text-text-primary">Ready to Create</p>
          <p>
            The service will be created with status <strong>&quot;Planned&quot;</strong>.
            You can activate it later from the services table or inspector panel.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ServiceWizardReview;
