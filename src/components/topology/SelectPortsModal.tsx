import React, { useState, useMemo } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { Port, PortType, PORT_CONSTRAINTS, NODE_TYPE_CONFIGS, FiberProfileType, FIBER_PROFILE_CONFIGS } from '@/types';
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
import { AlertTriangle, ArrowRight, Cable, Radio, ChevronDown } from 'lucide-react';
import { validatePortConnection } from '@/core/validation/portValidation';

interface PortSelectorProps {
  ports: Port[];
  selectedPortId: string | null;
  onSelect: (portId: string) => void;
  label: string;
  nodeName: string;
  nodeType: string;
  filterType?: PortType;
}

const PortSelector: React.FC<PortSelectorProps> = ({
  ports,
  selectedPortId,
  onSelect,
  label,
  nodeName,
  nodeType,
  filterType,
}) => {
  const filteredPorts = filterType
    ? ports.filter((p) => p.type === filterType)
    : ports;

  const availablePorts = filteredPorts.filter((p) => p.status === 'available');
  const usedPorts = filteredPorts.filter((p) => p.status === 'used');

  const config = NODE_TYPE_CONFIGS[nodeType as keyof typeof NODE_TYPE_CONFIGS];

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex items-center gap-2">
        <div
          className={cn(
            'w-6 h-6 rounded flex items-center justify-center',
            'text-white font-bold text-xs',
            `bg-gradient-to-br ${config?.gradient || 'from-gray-400 to-gray-600'}`
          )}
        >
          {config?.shortLabel || 'N'}
        </div>
        <div>
          <div className="text-xs text-text-tertiary">{label}</div>
          <div className="truncate text-sm font-medium text-text-primary">{nodeName}</div>
        </div>
      </div>

      <div className="custom-scrollbar max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
        {availablePorts.length === 0 && (
          <div className="py-4 text-center text-sm italic text-text-muted">
            No available {filterType ? PORT_CONSTRAINTS[filterType].label : ''} ports
          </div>
        )}
        {availablePorts.map((port) => (
          <button
            key={port.id}
            onClick={() => onSelect(port.id)}
            className={cn(
              'w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left',
              selectedPortId === port.id
                ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                : 'border-border hover:border-accent/50 hover:bg-tertiary'
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-md flex items-center justify-center shrink-0',
                port.type === 'bw' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'
              )}
            >
              {port.type === 'bw' ? <Cable className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-text-primary">{port.name}</div>
              <div className="text-xs text-text-tertiary">
                {PORT_CONSTRAINTS[port.type].label} - {port.dataRate}
                {port.type === 'dwdm' && ` - ${port.channels}ch`}
              </div>
            </div>
          </button>
        ))}

        {usedPorts.length > 0 && (
          <>
            <div className="py-2 text-xs text-text-muted">In use ({usedPorts.length})</div>
            {usedPorts.map((port) => (
              <div
                key={port.id}
                className="border-border/50 flex items-center gap-3 rounded-lg border p-2.5 opacity-50"
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-md flex items-center justify-center shrink-0',
                    port.type === 'bw' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'
                  )}
                >
                  {port.type === 'bw' ? <Cable className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">{port.name}</div>
                  <div className="text-xs text-text-tertiary">
                    {PORT_CONSTRAINTS[port.type].label} - {port.dataRate}
                  </div>
                </div>
                <span className="bg-warning/10 rounded px-2 py-0.5 text-xs text-warning">Used</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export const SelectPortsModal: React.FC = () => {
  const activeModal = useUIStore((state) => state.activeModal);
  const modalData = useUIStore((state) => state.modalData);
  const closeModal = useUIStore((state) => state.closeModal);

  const topology = useNetworkStore((state) => state.topology);
  const addEdgeWithPorts = useNetworkStore((state) => state.addEdgeWithPorts);

  const [sourcePortId, setSourcePortId] = useState<string | null>(null);
  const [targetPortId, setTargetPortId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<PortType | null>(null);
  const [fiberProfileType, setFiberProfileType] = useState<FiberProfileType>('G.652.D');
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const isOpen = activeModal === 'select-ports';
  const sourceId = modalData.sourceId as string | undefined;
  const targetId = modalData.targetId as string | undefined;
  const sourceHandle = modalData.sourceHandle as string | undefined;
  const targetHandle = modalData.targetHandle as string | undefined;

  const sourceNode = topology.nodes.find((n) => n.id === sourceId);
  const targetNode = topology.nodes.find((n) => n.id === targetId);

  const sourcePort = sourceNode?.ports?.find((p) => p.id === sourcePortId);
  const targetPort = targetNode?.ports?.find((p) => p.id === targetPortId);

  // Validation
  const validation = useMemo(() => {
    if (!sourcePort || !targetPort) return null;
    return validatePortConnection(sourcePort, targetPort);
  }, [sourcePort, targetPort]);

  const canConnect = sourcePortId && targetPortId && validation?.valid;

  const handleClose = () => {
    closeModal();
    setSourcePortId(null);
    setTargetPortId(null);
    setFilterType(null);
    setFiberProfileType('G.652.D');
    setProfileDropdownOpen(false);
  };

  const handleConnect = () => {
    if (!sourceId || !targetId || !sourcePortId || !targetPortId) return;

    // Edges are physical fiber connections - no channel allocation during creation
    // Channel allocation will be handled by the future "DWDM Services" feature
    addEdgeWithPorts(
      sourceId,
      targetId,
      sourcePortId,
      targetPortId,
      'fiber',
      sourceHandle,
      targetHandle,
      {
        fiberProfile: { profileType: fiberProfileType },
      }
    );
    handleClose();
  };

  // Auto-filter by type when source port is selected
  const handleSourceSelect = (portId: string) => {
    setSourcePortId(portId);
    const port = sourceNode?.ports?.find((p) => p.id === portId);
    if (port) {
      setFilterType(port.type);
      // Clear target if incompatible
      if (targetPortId) {
        const tp = targetNode?.ports?.find((p) => p.id === targetPortId);
        if (tp && tp.type !== port.type) {
          setTargetPortId(null);
        }
      }
    }
  };

  if (!sourceNode || !targetNode) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[680px]" data-testid="select-ports-modal" hideClose>
        <DialogHeader>
          <DialogTitle>Select Ports for Connection</DialogTitle>
          <DialogDescription>
            Choose ports from each node to establish the connection. Only compatible port types can be connected.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          {/* Port Type Filter */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-text-secondary">Filter by type:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType(null)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  filterType === null
                    ? 'bg-accent text-white'
                    : 'bg-tertiary text-text-secondary hover:bg-border'
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('bw')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
                  filterType === 'bw'
                    ? 'bg-amber-500 text-white'
                    : 'bg-tertiary text-text-secondary hover:bg-border'
                )}
              >
                <Cable className="h-3.5 w-3.5" />
                B/W (1310nm)
              </button>
              <button
                onClick={() => setFilterType('dwdm')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
                  filterType === 'dwdm'
                    ? 'bg-purple-500 text-white'
                    : 'bg-tertiary text-text-secondary hover:bg-border'
                )}
              >
                <Radio className="h-3.5 w-3.5" />
                DWDM (1550nm)
              </button>
            </div>
          </div>

          {/* Two-column port selection */}
          <div className="flex gap-4">
            <PortSelector
              ports={sourceNode.ports || []}
              selectedPortId={sourcePortId}
              onSelect={handleSourceSelect}
              label="Source"
              nodeName={sourceNode.name}
              nodeType={sourceNode.type}
              filterType={filterType || undefined}
            />

            <div className="flex flex-col items-center justify-center px-2">
              <ArrowRight className="h-6 w-6 text-text-muted" />
            </div>

            <PortSelector
              ports={targetNode.ports || []}
              selectedPortId={targetPortId}
              onSelect={setTargetPortId}
              label="Target"
              nodeName={targetNode.name}
              nodeType={targetNode.type}
              filterType={filterType || undefined}
            />
          </div>

          {/* Fiber Profile Selection */}
          <div className="mt-6 border-t border-border pt-4">
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              Fiber Profile
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors text-left',
                  'bg-elevated border-border hover:border-accent/50',
                  profileDropdownOpen && 'border-accent ring-1 ring-accent/30'
                )}
              >
                <span className="text-sm font-medium text-text-primary">
                  {FIBER_PROFILE_CONFIGS[fiberProfileType].label}
                </span>
                <ChevronDown className={cn(
                  'w-4 h-4 text-text-muted transition-transform',
                  profileDropdownOpen && 'transform rotate-180'
                )} />
              </button>

              {profileDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-elevated shadow-lg">
                  {Object.values(FIBER_PROFILE_CONFIGS).map((profile) => (
                    <button
                      key={profile.type}
                      type="button"
                      onClick={() => {
                        setFiberProfileType(profile.type);
                        setProfileDropdownOpen(false);
                      }}
                      className={cn(
                        'w-full px-3 py-2.5 text-left transition-colors',
                        'hover:bg-tertiary',
                        fiberProfileType === profile.type && 'bg-accent/10'
                      )}
                    >
                      <div className="text-sm font-medium text-text-primary">{profile.label}</div>
                      <div className="text-xs text-text-tertiary">{profile.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 text-xs text-text-tertiary">
              {FIBER_PROFILE_CONFIGS[fiberProfileType].description}
            </div>
            <div className="mt-1 font-mono text-xs text-text-muted">
              {FIBER_PROFILE_CONFIGS[fiberProfileType].attenuation} dB/km · {FIBER_PROFILE_CONFIGS[fiberProfileType].chromaticDispersion} ps/(nm·km) · {FIBER_PROFILE_CONFIGS[fiberProfileType].pmd} ps/√km
            </div>
          </div>

          {/* Validation messages */}
          {validation && !validation.valid && (
            <div className="bg-danger/10 border-danger/20 mt-4 rounded-lg border p-3">
              <div className="flex items-start gap-2 text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="text-sm">
                  {validation.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Connection preview */}
          {sourcePort && targetPort && validation?.valid && (
            <div className="bg-success/10 border-success/20 mt-4 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm text-success">
                <span className="font-medium">{sourcePort.name}</span>
                <ArrowRight className="h-4 w-4" />
                <span className="font-medium">{targetPort.name}</span>
                <span className="ml-2 text-text-secondary">
                  ({PORT_CONSTRAINTS[sourcePort.type].label}, max {PORT_CONSTRAINTS[sourcePort.type].maxDistance} km)
                </span>
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
            disabled={!canConnect}
            onClick={handleConnect}
            data-testid="connect-ports-btn"
          >
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
