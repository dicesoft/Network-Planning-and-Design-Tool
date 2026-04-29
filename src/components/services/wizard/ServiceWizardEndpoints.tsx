/**
 * ServiceWizardEndpoints - Step 1: Service Type and Endpoint Selection
 *
 * Allows users to select:
 * - Service type (L1 DWDM, L2 Ethernet, L3 IP)
 * - Service name
 * - Source node and port
 * - Destination node and port
 */

import React, { useMemo } from 'react';
import { useWizard } from './ServiceWizardContext';
import { useNetworkStore } from '@/stores/networkStore';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { Radio, Network, Globe, MapPin, ArrowRight, Wifi } from 'lucide-react';
import type { ServiceType } from '@/types/service';
import { SERVICE_TYPE_CONFIGS } from '@/types/service';
import type { NetworkNode } from '@/types/network';
import { isIPCapableNodeType, isL1EndpointNodeType } from '@/types/network';

// ============================================================================
// SERVICE TYPE ICONS
// ============================================================================

const SERVICE_TYPE_ICONS: Record<ServiceType, React.ReactNode> = {
  'l1-dwdm': <Radio className="h-5 w-5" />,
  'l2-ethernet': <Network className="h-5 w-5" />,
  'l3-ip': <Globe className="h-5 w-5" />,
};

// ============================================================================
// SERVICE TYPE SELECTOR
// ============================================================================

interface ServiceTypeSelectorProps {
  value: ServiceType;
  onChange: (type: ServiceType) => void;
}

const PON_SERVICE_PLACEHOLDERS = [
  { label: 'PON Downlink', description: 'Passive Optical Network downstream' },
  { label: 'GPON Downlink', description: 'Gigabit PON downstream (2.5G/1.25G)' },
  { label: '10GPON Downlink', description: '10-Gigabit PON downstream' },
  { label: 'PON Uplink', description: 'Passive Optical Network upstream' },
  { label: 'GPON Uplink', description: 'Gigabit PON upstream (1.25G/2.5G)' },
  { label: '10GPON Uplink', description: '10-Gigabit PON upstream' },
] as const;

const ServiceTypeSelector: React.FC<ServiceTypeSelectorProps> = ({ value, onChange }) => {
  return (
    <div>
      <label className="mb-3 block text-sm font-medium text-text-secondary">
        Service Type
      </label>
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(SERVICE_TYPE_CONFIGS) as ServiceType[]).map((type) => {
          const config = SERVICE_TYPE_CONFIGS[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                value === type
                  ? 'border-accent bg-accent/5 shadow-sm ring-2 ring-accent/30'
                  : 'border-border hover:border-accent/50 hover:bg-tertiary'
              )}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: `${config.color}20`,
                  color: config.color,
                }}
              >
                {SERVICE_TYPE_ICONS[type]}
              </div>
              <span className="text-xs font-medium text-text-primary">
                {config.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* PON Services — Coming Soon */}
      <div className="mt-6">
        <label className="mb-3 block text-sm font-medium text-text-secondary">
          PON Services
          <span className="bg-warning/10 ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium text-warning">
            Coming Soon
          </span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          {PON_SERVICE_PLACEHOLDERS.map((pon) => (
            <div
              key={pon.label}
              className="flex cursor-not-allowed flex-col items-center gap-2 rounded-lg border-2 border-border p-4 opacity-50"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: '#0891b220', color: '#0891b2' }}
              >
                <Wifi className="h-5 w-5" />
              </div>
              <span className="text-center text-xs font-medium text-text-primary">
                {pon.label}
              </span>
              <span className="bg-warning/10 rounded-full px-2 py-0.5 text-[10px] font-medium text-warning">
                Coming Soon
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// NODE SELECTOR
// ============================================================================

interface NodeSelectorProps {
  label: string;
  value: string;
  portValue: string;
  onChange: (nodeId: string, portId?: string) => void;
  nodes: NetworkNode[];
  disabledNodeId?: string;
  filterDWDM?: boolean;
}

const NodeSelector: React.FC<NodeSelectorProps> = ({
  label,
  value,
  portValue,
  onChange,
  nodes,
  disabledNodeId,
  filterDWDM,
}) => {
  const selectedNode = nodes.find((n) => n.id === value);

  // Get available ports for the selected node
  const availablePorts = useMemo(() => {
    if (!selectedNode?.ports) return [];
    return selectedNode.ports.filter((p) => {
      if (filterDWDM && p.type !== 'dwdm') return false;
      return p.status === 'available' || p.id === portValue;
    });
  }, [selectedNode, filterDWDM, portValue]);

  // Build combobox options from nodes
  const nodeOptions: ComboboxOption[] = useMemo(
    () =>
      nodes.map((node) => ({
        value: node.id,
        label: `${node.name} (${node.type})`,
        disabled: node.id === disabledNodeId,
      })),
    [nodes, disabledNodeId]
  );

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          {label}
        </label>
        <Combobox
          options={nodeOptions}
          value={value}
          onChange={(nodeId) => onChange(nodeId)}
          placeholder="Select node..."
          searchPlaceholder="Search nodes..."
          emptyMessage="No nodes available. Create nodes on the topology first."
        />
      </div>

      {/* Port Selection (optional, shown if node has ports) */}
      {value && availablePorts.length > 0 && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-muted">
            Port (optional)
          </label>
          <Select
            value={portValue || 'auto'}
            onValueChange={(portId) => onChange(value, portId === 'auto' ? undefined : portId)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Auto-select port" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-select available port</SelectItem>
              {availablePorts.map((port) => (
                <SelectItem key={port.id} value={port.id}>
                  {port.name || port.id} ({port.type} - {port.dataRate || 'N/A'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Node Info Card */}
      {selectedNode && (
        <div className="bg-secondary/50 rounded-lg border border-border p-3">
          <div className="flex items-start gap-3">
            <div className="bg-accent/10 flex h-8 w-8 items-center justify-center rounded">
              <MapPin className="h-4 w-4 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text-primary">
                {selectedNode.name}
              </div>
              <div className="mt-0.5 text-xs text-text-muted">
                Type: {selectedNode.type} • Vendor: {selectedNode.vendor || 'N/A'}
              </div>
              {selectedNode.location && (
                <div className="mt-0.5 text-xs text-text-muted">
                  {[
                    selectedNode.location.building,
                    selectedNode.location.room,
                    selectedNode.location.address,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </div>
              )}
              {selectedNode.ports && (
                <div className="mt-1 text-xs text-text-muted">
                  {selectedNode.ports.filter((p) => p.status === 'available').length} / {selectedNode.ports.length} ports available
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ServiceWizardEndpoints: React.FC = () => {
  const { state, dispatch } = useWizard();
  const nodes = useNetworkStore((s) => s.topology.nodes);

  // Filter nodes based on service type
  // - L1 DWDM: Only OADM and terminal nodes can be L1 service endpoints
  //   (Routers with DWDM ports are client endpoints, use L1 as underlay via L2/L3 services)
  // - L2/L3: Requires IP-capable nodes (routers, switches) - NOT optical equipment
  const availableNodes = useMemo(() => {
    if (state.serviceType === 'l1-dwdm') {
      // L1 services: only OADM and terminal nodes can be endpoints
      // Amplifiers are intermediate nodes only (not valid endpoints)
      return nodes.filter((node) => isL1EndpointNodeType(node.type));
    }
    // L2/L3 services: filter to IP-capable nodes only (router, switch)
    // This excludes OADMs, amplifiers, terminals which are optical-only equipment
    return nodes.filter((node) => isIPCapableNodeType(node.type));
  }, [nodes, state.serviceType]);

  const handleServiceTypeChange = (type: ServiceType) => {
    dispatch({ type: 'SET_SERVICE_TYPE', serviceType: type });
  };

  const handleNameChange = (name: string) => {
    dispatch({ type: 'SET_NAME', name });
  };

  const handleSourceChange = (nodeId: string, portId?: string) => {
    dispatch({ type: 'SET_SOURCE_NODE', nodeId, portId });
  };

  const handleDestinationChange = (nodeId: string, portId?: string) => {
    dispatch({ type: 'SET_DESTINATION_NODE', nodeId, portId });
  };

  return (
    <div className="space-y-6">
      {/* Service Type Selection */}
      <ServiceTypeSelector
        value={state.serviceType}
        onChange={handleServiceTypeChange}
      />

      {/* Service Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Service Name
          <span className="ml-1 font-normal text-text-muted">(optional)</span>
        </label>
        <Input
          value={state.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder={`New ${SERVICE_TYPE_CONFIGS[state.serviceType].label}`}
        />
        <p className="mt-1 text-xs text-text-muted">
          A descriptive name for this service. Leave blank for auto-generated name.
        </p>
      </div>

      {/* Endpoints */}
      <div>
        <label className="mb-3 block text-sm font-medium text-text-secondary">
          Service Endpoints
        </label>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr,auto,1fr]">
          {/* Source Node */}
          <NodeSelector
            label="Source Node"
            value={state.sourceNodeId}
            portValue={state.sourcePortId}
            onChange={handleSourceChange}
            nodes={availableNodes}
            disabledNodeId={state.destinationNodeId}
            filterDWDM={state.serviceType === 'l1-dwdm'}
          />

          {/* Arrow indicator */}
          <div className="hidden items-center justify-center pt-8 md:flex">
            <div className="bg-accent/10 flex h-10 w-10 items-center justify-center rounded-full">
              <ArrowRight className="h-5 w-5 text-accent" />
            </div>
          </div>

          {/* Destination Node */}
          <NodeSelector
            label="Destination Node"
            value={state.destinationNodeId}
            portValue={state.destinationPortId}
            onChange={handleDestinationChange}
            nodes={availableNodes}
            disabledNodeId={state.sourceNodeId}
            filterDWDM={state.serviceType === 'l1-dwdm'}
          />
        </div>

        {/* Warning if no suitable nodes available */}
        {state.serviceType === 'l1-dwdm' && availableNodes.length === 0 && (
          <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
            No nodes with DWDM ports available. L1 services require nodes with DWDM-capable ports.
          </div>
        )}
        {state.serviceType !== 'l1-dwdm' && availableNodes.length === 0 && (
          <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
            No routers or switches available. L2/L3 services require IP-capable nodes (routers or switches).
            OADMs, amplifiers, and other optical equipment cannot be used as L2/L3 service endpoints.
          </div>
        )}

        {/* Info about service requirements */}
        <div className="bg-secondary/50 mt-4 rounded-lg p-3 text-xs text-text-muted">
          {state.serviceType === 'l1-dwdm' ? (
            <p>
              <strong>L1 DWDM Service:</strong> Requires nodes with DWDM ports.
              The system will compute an optical path and allocate a wavelength channel.
            </p>
          ) : state.serviceType === 'l2-ethernet' ? (
            <p>
              <strong>L2 Ethernet Service:</strong> Requires an L1 DWDM underlay service
              (existing or auto-created) to transport Ethernet frames between endpoints.
            </p>
          ) : (
            <p>
              <strong>L3 IP Service:</strong> Requires an L1 DWDM underlay service
              (existing or auto-created) to transport IP packets between endpoints.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceWizardEndpoints;
