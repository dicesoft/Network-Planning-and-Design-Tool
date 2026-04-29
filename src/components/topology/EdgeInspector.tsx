import React, { useMemo } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { EdgeType, EdgeState, PORT_CONSTRAINTS, FiberParameters } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Trash2, AlertTriangle, Cable, Radio, Zap, Eye, Minimize2, Maximize2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { validateDistance } from '@/core/validation/portValidation';
import { FiberProfileSection } from './FiberProfileSection';
import { SRLGCodeEditor } from './SRLGCodeEditor';
import { MiniSpectrumBar } from './SpectrumVisualization';
import { SpectrumModal } from './SpectrumModal';
import { getChannelDisplayInfo, getFlexGridSlotInfo, formatChannelLabel, CHANNEL_GRID_CONFIGS } from '@/core/spectrum/channelConfig';
import { useState } from 'react';

const edgeTypes: EdgeType[] = ['fiber', 'ethernet', 'virtual'];
const edgeStates: EdgeState[] = ['active', 'planned', 'failed'];

export const EdgeInspector: React.FC = () => {
  const [spectrumModalOpen, setSpectrumModalOpen] = useState(false);
  const [targetSpectrumModalOpen, setTargetSpectrumModalOpen] = useState(false);
  const inspector = useUIStore((state) => state.inspector);
  const closeInspector = useUIStore((state) => state.closeInspector);
  const inspectorMinimized = useUIStore((state) => state.inspectorMinimized);
  const setInspectorMinimized = useUIStore((state) => state.setInspectorMinimized);

  const edge = useNetworkStore((state) =>
    state.topology.edges.find((e) => e.id === inspector.targetId)
  );
  const sourceNode = useNetworkStore((state) =>
    state.topology.nodes.find((n) => n.id === edge?.source.nodeId)
  );
  const targetNode = useNetworkStore((state) =>
    state.topology.nodes.find((n) => n.id === edge?.target.nodeId)
  );
  const updateEdge = useNetworkStore((state) => state.updateEdge);
  const removeEdge = useNetworkStore((state) => state.removeEdge);

  // Get port info for endpoints
  const sourcePort = useMemo(() => {
    if (!sourceNode || !edge?.source.portId) return null;
    return sourceNode.ports?.find((p) => p.id === edge.source.portId);
  }, [sourceNode, edge?.source.portId]);

  const targetPort = useMemo(() => {
    if (!targetNode || !edge?.target.portId) return null;
    return targetNode.ports?.find((p) => p.id === edge.target.portId);
  }, [targetNode, edge?.target.portId]);

  // Distance validation based on port type
  const distanceValidation = useMemo(() => {
    if (!edge) return null;
    const portType = edge.properties.sourcePortType || sourcePort?.type;
    const distance = edge.properties.distance;
    if (!portType || !distance) return null;
    return validateDistance(portType, distance);
  }, [edge, sourcePort?.type]);

  if (!edge || inspector.type !== 'edge') {
    return null;
  }

  const handleUpdate = (field: string, value: unknown) => {
    updateEdge(edge.id, { [field]: value });
  };

  const handlePropertyUpdate = (prop: string, value: unknown) => {
    updateEdge(edge.id, {
      properties: { ...edge.properties, [prop]: value },
    });
  };

  const handleDelete = () => {
    removeEdge(edge.id);
    closeInspector();
  };

  const handleFiberProfileChange = (profile: FiberParameters | undefined) => {
    updateEdge(edge.id, {
      properties: { ...edge.properties, fiberProfile: profile },
    });
  };

  const handleSRLGCodesChange = (codes: string[]) => {
    updateEdge(edge.id, {
      properties: { ...edge.properties, srlgCodes: codes },
    });
  };

  return (
    <aside
      className={cn(
        'absolute right-0 top-toolbar z-inspector flex w-inspector flex-col overflow-hidden border-l border-border bg-elevated shadow-lg',
        inspectorMinimized ? 'h-auto' : 'bottom-0'
      )}
      data-testid="edge-inspector"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-8 h-8 rounded-md flex items-center justify-center',
              edge.state === 'active' && 'bg-success/10 text-success',
              edge.state === 'planned' && 'bg-info/10 text-info',
              edge.state === 'failed' && 'bg-danger/10 text-danger'
            )}
          >
            {edge.state === 'failed' ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <div className="h-0.5 w-4 bg-current" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">
              Edge Properties
            </div>
            <div className="text-xs text-text-tertiary">{edge.id.slice(0, 8)}...</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setInspectorMinimized(!inspectorMinimized)}
            aria-label={inspectorMinimized ? 'Expand inspector' : 'Minimize inspector'}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary text-text-tertiary transition-colors hover:bg-border hover:text-text-primary"
          >
            {inspectorMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={closeInspector}
            aria-label="Close inspector"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary text-text-tertiary transition-colors hover:bg-border hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!inspectorMinimized && (<>
      {/* Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {/* General Section */}
        <div className="border-b border-border p-5">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            General
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Edge Name
              </label>
              <Input
                value={edge.name}
                onChange={(e) => handleUpdate('name', e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Type
              </label>
              <Select
                value={edge.type}
                onValueChange={(value) => handleUpdate('type', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {edgeTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                State
              </label>
              <Select
                value={edge.state}
                onValueChange={(value) => handleUpdate('state', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {edgeStates.map((state) => (
                    <SelectItem key={state} value={state}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full',
                            state === 'active' && 'bg-success',
                            state === 'planned' && 'bg-info',
                            state === 'failed' && 'bg-danger'
                          )}
                        />
                        {state.charAt(0).toUpperCase() + state.slice(1)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Endpoints Section */}
        <div className="border-b border-border p-5">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Endpoints
          </div>

          <div className="space-y-3">
            <div className="rounded-lg bg-tertiary p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-text-tertiary">Source</div>
                  <div className="text-sm font-medium text-text-primary">
                    {sourceNode?.name || 'Unknown'}
                  </div>
                </div>
              </div>
              {sourcePort ? (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <div
                    className={cn(
                      'w-5 h-5 rounded flex items-center justify-center',
                      sourcePort.type === 'bw' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'
                    )}
                  >
                    {sourcePort.type === 'bw' ? <Cable className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                  </div>
                  <span className="font-medium text-text-secondary">{sourcePort.name}</span>
                  <span className="text-text-muted">
                    {PORT_CONSTRAINTS[sourcePort.type].label} - {sourcePort.dataRate}
                  </span>
                </div>
              ) : (
                <div className="mt-2 text-xs italic text-text-muted">
                  {edge.source.port || 'No port assigned (legacy)'}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center">
              <div className="h-4 w-px bg-border" />
            </div>

            <div className="rounded-lg bg-tertiary p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-text-tertiary">Target</div>
                  <div className="text-sm font-medium text-text-primary">
                    {targetNode?.name || 'Unknown'}
                  </div>
                </div>
              </div>
              {targetPort ? (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <div
                    className={cn(
                      'w-5 h-5 rounded flex items-center justify-center',
                      targetPort.type === 'bw' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'
                    )}
                  >
                    {targetPort.type === 'bw' ? <Cable className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                  </div>
                  <span className="font-medium text-text-secondary">{targetPort.name}</span>
                  <span className="text-text-muted">
                    {PORT_CONSTRAINTS[targetPort.type].label} - {targetPort.dataRate}
                  </span>
                </div>
              ) : (
                <div className="mt-2 text-xs italic text-text-muted">
                  {edge.target.port || 'No port assigned (legacy)'}
                </div>
              )}
            </div>
          </div>

          {/* Distance validation warning */}
          {distanceValidation && !distanceValidation.valid && (
            <div className="bg-danger/10 border-danger/20 mt-3 rounded-lg border p-2.5">
              <div className="flex items-start gap-2 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  {distanceValidation.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Spectrum View Section - Show for DWDM ports even without channel assignments */}
        {!edge.properties.channelAssignment && (sourcePort?.type === 'dwdm' || targetPort?.type === 'dwdm') && (
          <div className="border-b border-border p-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              <Radio className="h-4 w-4 text-purple-500" />
              Spectrum
            </div>

            {/* Source port spectrum */}
            {sourcePort?.type === 'dwdm' && (
              <div className="mb-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Source: {sourcePort.name}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSpectrumModalOpen(true)}
                            className="h-7 text-xs"
                            disabled={!sourcePort.spectrum}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            View
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!sourcePort.spectrum && (
                        <TooltipContent>
                          <p>No spectrum data available. Initialize port spectrum first.</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {sourcePort.spectrum && <MiniSpectrumBar spectrum={sourcePort.spectrum} width={200} height={16} />}
              </div>
            )}

            {/* Target port spectrum */}
            {targetPort?.type === 'dwdm' && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Target: {targetPort.name}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTargetSpectrumModalOpen(true)}
                            className="h-7 text-xs"
                            disabled={!targetPort.spectrum}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            View
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!targetPort.spectrum && (
                        <TooltipContent>
                          <p>No spectrum data available. Initialize port spectrum first.</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {targetPort.spectrum && <MiniSpectrumBar spectrum={targetPort.spectrum} width={200} height={16} />}
              </div>
            )}

            {/* Info when no spectrum initialized */}
            {!sourcePort?.spectrum && !targetPort?.spectrum && (
              <div className="bg-secondary/50 rounded-lg p-3 text-xs text-text-muted">
                No spectrum data initialized on either port. Configure DWDM port spectrum in the node inspector.
              </div>
            )}
          </div>
        )}

        {/* Channel Assignment Section - Only for DWDM connections */}
        {edge.properties.channelAssignment && (
          <div className="border-b border-border p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                <Radio className="h-4 w-4 text-purple-500" />
                Channel Assignment
              </div>
              {sourcePort?.type === 'dwdm' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSpectrumModalOpen(true)}
                          className="h-7 text-xs"
                          disabled={!sourcePort.spectrum}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          View Spectrum
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!sourcePort.spectrum && (
                      <TooltipContent>
                        <p>No spectrum data available. Initialize port spectrum first.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Express connection indicator */}
            {edge.properties.channelAssignment.isExpress && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
                <Zap className="h-3.5 w-3.5" />
                Express Connection (same wavelength end-to-end)
              </div>
            )}

            {/* Source spectrum mini bar */}
            {sourcePort?.spectrum && (
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs text-text-muted">Source:</span>
                <MiniSpectrumBar spectrum={sourcePort.spectrum} width={120} height={12} />
                <span className="text-xs text-text-tertiary">
                  {CHANNEL_GRID_CONFIGS[sourcePort.spectrum.gridType].label.split(' ')[0]}
                </span>
              </div>
            )}

            {/* Source channels */}
            <div className="space-y-2">
              <div className="text-xs text-text-tertiary">Source Channels</div>
              {edge.properties.channelAssignment.sourceChannels.map((ch) => (
                <div key={ch.id} className="rounded-lg border border-purple-500/20 bg-purple-500/10 p-2">
                  {ch.channelNumber !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-purple-400">
                        {(() => {
                          const gridType = sourcePort?.spectrum?.gridType || 'fixed-50ghz';
                          if (gridType !== 'flex-grid') {
                            return formatChannelLabel(ch.channelNumber, gridType);
                          }
                          return `Ch ${ch.channelNumber}`;
                        })()}
                      </span>
                      <span className="text-xs text-text-muted">
                        {(() => {
                          // Determine grid type from port spectrum
                          const gridType = sourcePort?.spectrum?.gridType || 'fixed-50ghz';
                          if (gridType !== 'flex-grid') {
                            const info = getChannelDisplayInfo(ch.channelNumber, gridType);
                            return info ? `${info.frequency} / ${info.wavelength}` : '';
                          }
                          return '';
                        })()}
                      </span>
                      {ch.label && (
                        <span className="ml-auto text-xs text-text-tertiary">{ch.label}</span>
                      )}
                    </div>
                  )}
                  {ch.slotRange && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-purple-400">
                        Slots {ch.slotRange.startSlot} - {ch.slotRange.endSlot}
                      </span>
                      <span className="text-xs text-text-muted">
                        {(() => {
                          const info = getFlexGridSlotInfo(ch.slotRange.startSlot, ch.slotRange.endSlot);
                          return `${info.bandwidthGHz.toFixed(1)} GHz / ${info.centerFrequency.toFixed(3)} THz`;
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Target spectrum mini bar */}
            {targetPort?.spectrum && (
              <div className="mb-2 mt-3 flex items-center gap-2">
                <span className="text-xs text-text-muted">Target:</span>
                <MiniSpectrumBar spectrum={targetPort.spectrum} width={120} height={12} />
                <span className="text-xs text-text-tertiary">
                  {CHANNEL_GRID_CONFIGS[targetPort.spectrum.gridType].label.split(' ')[0]}
                </span>
              </div>
            )}

            {/* Target channels */}
            <div className="mt-3 space-y-2">
              <div className="text-xs text-text-tertiary">Target Channels</div>
              {edge.properties.channelAssignment.targetChannels.map((ch) => (
                <div key={ch.id} className="rounded-lg border border-purple-500/20 bg-purple-500/10 p-2">
                  {ch.channelNumber !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-purple-400">
                        {(() => {
                          const gridType = targetPort?.spectrum?.gridType || 'fixed-50ghz';
                          if (gridType !== 'flex-grid') {
                            return formatChannelLabel(ch.channelNumber, gridType);
                          }
                          return `Ch ${ch.channelNumber}`;
                        })()}
                      </span>
                      <span className="text-xs text-text-muted">
                        {(() => {
                          // Determine grid type from port spectrum
                          const gridType = targetPort?.spectrum?.gridType || 'fixed-50ghz';
                          if (gridType !== 'flex-grid') {
                            const info = getChannelDisplayInfo(ch.channelNumber, gridType);
                            return info ? `${info.frequency} / ${info.wavelength}` : '';
                          }
                          return '';
                        })()}
                      </span>
                      {ch.label && (
                        <span className="ml-auto text-xs text-text-tertiary">{ch.label}</span>
                      )}
                    </div>
                  )}
                  {ch.slotRange && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-purple-400">
                        Slots {ch.slotRange.startSlot} - {ch.slotRange.endSlot}
                      </span>
                      <span className="text-xs text-text-muted">
                        {(() => {
                          const info = getFlexGridSlotInfo(ch.slotRange.startSlot, ch.slotRange.endSlot);
                          return `${info.bandwidthGHz.toFixed(1)} GHz / ${info.centerFrequency.toFixed(3)} THz`;
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source Spectrum Modal */}
        {sourcePort?.spectrum && (
          <SpectrumModal
            isOpen={spectrumModalOpen}
            onClose={() => setSpectrumModalOpen(false)}
            spectrum={sourcePort.spectrum}
            title="Source Port Spectrum"
            subtitle={`${sourceNode?.name} - ${sourcePort.name}`}
            readOnly={true}
          />
        )}

        {/* Target Spectrum Modal */}
        {targetPort?.spectrum && (
          <SpectrumModal
            isOpen={targetSpectrumModalOpen}
            onClose={() => setTargetSpectrumModalOpen(false)}
            spectrum={targetPort.spectrum}
            title="Target Port Spectrum"
            subtitle={`${targetNode?.name} - ${targetPort.name}`}
            readOnly={true}
          />
        )}

        {/* Properties Section */}
        <div className="p-5">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Properties
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Distance (km)
              </label>
              <Input
                type="number"
                value={edge.properties.distance || ''}
                onChange={(e) =>
                  handlePropertyUpdate('distance', parseFloat(e.target.value) || 0)
                }
                placeholder="0"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Weight
              </label>
              <Input
                type="number"
                value={edge.properties.weight || ''}
                onChange={(e) =>
                  handlePropertyUpdate('weight', parseFloat(e.target.value) || 0)
                }
                placeholder="1"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Cost
              </label>
              <Input
                type="number"
                value={edge.properties.cost || ''}
                onChange={(e) =>
                  handlePropertyUpdate('cost', parseFloat(e.target.value) || 0)
                }
                placeholder="0"
              />
            </div>

            {edge.type === 'fiber' && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                    Fiber Count
                  </label>
                  <Input
                    type="number"
                    value={edge.properties.fiberCount || ''}
                    onChange={(e) =>
                      handlePropertyUpdate('fiberCount', parseInt(e.target.value) || 0)
                    }
                    placeholder="1"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                    Lambda Capacity
                  </label>
                  <Input
                    type="number"
                    value={edge.properties.lambdaCapacity || ''}
                    onChange={(e) =>
                      handlePropertyUpdate(
                        'lambdaCapacity',
                        parseInt(e.target.value) || 0
                      )
                    }
                    placeholder="88"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Fiber Profile Section - Only for fiber edges */}
        {edge.type === 'fiber' && (
          <div className="border-b border-border p-5">
            <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Fiber Profile
            </div>
            <FiberProfileSection
              fiberProfile={edge.properties.fiberProfile}
              distance={edge.properties.distance}
              onChange={handleFiberProfileChange}
            />
          </div>
        )}

        {/* SRLG Codes Section - Only for fiber edges */}
        {edge.type === 'fiber' && (
          <div className="p-5">
            <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              SRLG Codes
            </div>
            <SRLGCodeEditor
              codes={edge.properties.srlgCodes || []}
              onChange={handleSRLGCodesChange}
            />
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex shrink-0 gap-3 border-t border-border p-4">
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          className="flex-1"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Edge
        </Button>
      </div>
      </>)}
    </aside>
  );
};
