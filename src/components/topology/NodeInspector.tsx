import React, { useState } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore, selectNodeSubtypes } from '@/stores/settingsStore';
import {
  NodeType,
  VendorType,
  NODE_TYPE_CONFIGS,
  VENDOR_CONFIGS,
  Port,
} from '@/types';
import type { NodeSizeFlavor, NodeSubtypePreset } from '@/types/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Trash2, Link2, Minimize2, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PortConfigurationSection } from './PortConfigurationSection';
import { LocationSection } from './LocationSection';
import { OSPPropertiesSection } from './OSPPropertiesSection';
import { PortMappingEditor } from './PortMappingEditor';
import { InventoryTab } from './InventoryTab';
import { OSPTerminationProperties, PortMapping } from '@/types';

type InspectorTab = 'properties' | 'inventory' | 'ports';

const nodeTypes: NodeType[] = ['router', 'switch', 'oadm', 'amplifier', 'terminal', 'osp-termination', 'olt', 'ont', 'custom'];
const vendors: VendorType[] = ['nokia', 'huawei', 'cisco', 'juniper', 'ciena', 'generic'];

export const NodeInspector: React.FC = () => {
  const inspector = useUIStore((state) => state.inspector);
  const closeInspector = useUIStore((state) => state.closeInspector);
  const inspectorMinimized = useUIStore((state) => state.inspectorMinimized);
  const setInspectorMinimized = useUIStore((state) => state.setInspectorMinimized);

  const node = useNetworkStore((state) =>
    state.topology.nodes.find((n) => n.id === inspector.targetId)
  );
  const updateNode = useNetworkStore((state) => state.updateNode);
  const removeNode = useNetworkStore((state) => state.removeNode);
  const getConnectedEdges = useNetworkStore((state) => state.getConnectedEdges);
  const addPort = useNetworkStore((state) => state.addPort);
  const updatePort = useNetworkStore((state) => state.updatePort);
  const removePort = useNetworkStore((state) => state.removePort);
  const setPortGridType = useNetworkStore((state) => state.setPortGridType);
  const allocateChannels = useNetworkStore((state) => state.allocateChannels);
  const deallocateChannels = useNetworkStore((state) => state.deallocateChannels);

  const allSubtypes = useSettingsStore(selectNodeSubtypes);
  const addToast = useUIStore((state) => state.addToast);

  const [activeTab, setActiveTab] = useState<InspectorTab>('properties');

  if (!node || inspector.type !== 'node') {
    return null;
  }

  const connectedEdges = getConnectedEdges(node.id);
  const config = NODE_TYPE_CONFIGS[node.type];
  const subtypesForType = allSubtypes.filter((s) => s.nodeType === node.type);
  const currentPreset = node.subtype
    ? allSubtypes.find((s) => s.key === node.subtype && s.nodeType === node.type)
    : undefined;

  const handleUpdate = (field: string, value: unknown) => {
    updateNode(node.id, { [field]: value });
  };

  const applySubtypePreset = (preset: NodeSubtypePreset, size: NodeSizeFlavor) => {
    const sizeConfig = preset.sizes[size];
    if (!sizeConfig) return;

    const hasUsedPorts = node.ports?.some((p) => p.status === 'used');
    if (hasUsedPorts) {
      // Cannot replace ports when some are in use (connected to edges)
      addToast({
        type: 'warning',
        title: 'Ports in use',
        message: 'Disconnect all edges before changing size flavor to re-provision ports.',
      });
      updateNode(node.id, {
        switchingCapacity: sizeConfig.switchingCapacity || undefined,
        sizeFlavor: size,
      });
      return;
    }

    const existingPorts = node.ports?.length || 0;
    const newPortCount = sizeConfig.bwPorts + sizeConfig.dwdmPorts;

    if (existingPorts > 0 && existingPorts !== newPortCount) {
      // Ports will change — show confirmation
      const confirmed = window.confirm(
        `Changing to ${preset.label} (${size}) will replace ${existingPorts} existing ports with ${newPortCount} new ports. Continue?`
      );
      if (!confirmed) return;
    }

    // Re-provision: remove the node and re-add with subtype
    // Simpler approach: just update the node properties and let addNode provisioning handle it next time
    // For existing nodes, we re-create ports directly
    updateNode(node.id, {
      subtype: preset.key,
      sizeFlavor: size,
      switchingCapacity: sizeConfig.switchingCapacity || undefined,
    });

    // Re-provision ports by removing old and adding new via store
    // We need to update ports directly since updateNode supports partial updates
    const newPorts: Port[] = [];
    for (let i = 1; i <= sizeConfig.bwPorts; i++) {
      newPorts.push({
        id: crypto.randomUUID(),
        name: `Eth-${i}`,
        type: 'bw',
        dataRate: '10G',
        channels: 1,
        status: 'available',
      });
    }
    for (let i = 1; i <= sizeConfig.dwdmPorts; i++) {
      newPorts.push({
        id: crypto.randomUUID(),
        name: `Line-${i}`,
        type: 'dwdm',
        dataRate: '100G',
        channels: 96,
        status: 'available',
        spectrum: { gridType: 'fixed-50ghz', allocations: [] },
      });
    }
    updateNode(node.id, { ports: newPorts });

    addToast({
      type: 'success',
      title: 'Ports updated',
      message: `${preset.label} (${size}): ${sizeConfig.bwPorts} BW + ${sizeConfig.dwdmPorts} DWDM ports provisioned.`,
    });
  };

  const handleAddPort = (portData: Omit<Port, 'id' | 'status' | 'connectedEdgeId'>) => {
    addPort(node.id, portData);
  };

  const handleUpdatePort = (portId: string, updates: Partial<Omit<Port, 'id' | 'status' | 'connectedEdgeId'>>) => {
    updatePort(node.id, portId, updates);
  };

  const handleRemovePort = (portId: string): boolean => {
    return removePort(node.id, portId);
  };

  const handleReserveChannels = (portId: string, channels: number[]) => {
    const allocations = channels.map(ch => ({
      id: crypto.randomUUID(),
      channelNumber: ch,
      status: 'reserved' as const,
      label: 'Manual reservation',
    }));
    allocateChannels(node.id, portId, allocations);
  };

  const handleUnreserveChannels = (portId: string, channels: number[]) => {
    const port = node.ports?.find(p => p.id === portId);
    if (!port?.spectrum) return;

    const allocationIds = port.spectrum.allocations
      .filter(a => a.channelNumber && channels.includes(a.channelNumber) && a.status === 'reserved')
      .map(a => a.id);

    deallocateChannels(node.id, portId, allocationIds);
  };

  const confirmDelete = () => {
    removeNode(node.id);
    closeInspector();
  };

  return (
    <aside
      className={cn(
        'absolute right-0 top-toolbar z-inspector flex w-inspector flex-col overflow-hidden border-l border-border bg-elevated shadow-lg',
        inspectorMinimized ? 'h-auto' : 'bottom-0'
      )}
      data-testid="node-inspector"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-8 h-8 rounded-md flex items-center justify-center',
              'text-white font-bold text-sm',
              `bg-gradient-to-br ${config.gradient}`
            )}
          >
            {config.shortLabel}
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">
              Node Properties
            </div>
            <div className="text-xs text-text-tertiary">{node.id.slice(0, 8)}...</div>
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
      {/* Tab Navigation */}
      <div className="shrink-0 border-b border-border px-5 py-2">
        <nav
          className="flex gap-0.5 rounded-lg bg-tertiary p-1"
          role="tablist"
          aria-label="Inspector views"
        >
          {([
            { id: 'properties' as InspectorTab, label: 'Properties' },
            { id: 'inventory' as InspectorTab, label: 'Inventory' },
            { id: 'ports' as InspectorTab, label: 'Ports' },
          ]).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-elevated text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary',
              )}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`inspector-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {activeTab === 'properties' && (
        <>
        {/* General Section */}
        <div className="border-b border-border p-5">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            General
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Node Name
              </label>
              <Input
                value={node.name}
                onChange={(e) => handleUpdate('name', e.target.value)}
                data-testid="node-name-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Type
              </label>
              <Select
                value={node.type}
                onValueChange={(value) => handleUpdate('type', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nodeTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {NODE_TYPE_CONFIGS[type].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Vendor
              </label>
              <Select
                value={node.vendor}
                onValueChange={(value) => handleUpdate('vendor', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor} value={vendor}>
                      {VENDOR_CONFIGS[vendor].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {subtypesForType.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Subtype
                </label>
                <Select
                  value={node.subtype || '_none'}
                  onValueChange={(value) => {
                    const newSubtype = value === '_none' ? undefined : value;
                    handleUpdate('subtype', newSubtype);
                    if (!newSubtype) {
                      handleUpdate('sizeFlavor', undefined);
                    }
                  }}
                >
                  <SelectTrigger data-testid="node-subtype-select">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {subtypesForType.map((st) => (
                      <SelectItem key={st.key} value={st.key}>
                        {st.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {currentPreset && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Size
                </label>
                <Select
                  value={node.sizeFlavor || '_none'}
                  onValueChange={(value) => {
                    if (value === '_none') {
                      handleUpdate('sizeFlavor', undefined);
                    } else {
                      applySubtypePreset(currentPreset, value as NodeSizeFlavor);
                    }
                  }}
                >
                  <SelectTrigger data-testid="node-size-flavor-select">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Default</SelectItem>
                    <SelectItem value="small">
                      Small ({currentPreset.sizes.small.switchingCapacity > 0 ? `${currentPreset.sizes.small.switchingCapacity} Gbps` : `${currentPreset.sizes.small.dwdmPorts} DWDM`})
                    </SelectItem>
                    <SelectItem value="medium">
                      Medium ({currentPreset.sizes.medium.switchingCapacity > 0 ? `${currentPreset.sizes.medium.switchingCapacity} Gbps` : `${currentPreset.sizes.medium.dwdmPorts} DWDM`})
                    </SelectItem>
                    <SelectItem value="large">
                      Large ({currentPreset.sizes.large.switchingCapacity > 0 ? `${currentPreset.sizes.large.switchingCapacity} Gbps` : `${currentPreset.sizes.large.dwdmPorts} DWDM`})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Model
              </label>
              <Input
                value={node.model || ''}
                onChange={(e) => handleUpdate('model', e.target.value)}
                placeholder="e.g., ASR9000, 1830 PSS"
              />
            </div>

            {(node.type === 'router' || node.type === 'switch') && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Switching Capacity
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    value={node.switchingCapacity ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleUpdate('switchingCapacity', val === '' ? undefined : Math.max(0, Number(val)));
                    }}
                    placeholder="e.g., 12800"
                    className="pr-14"
                    data-testid="switching-capacity-input"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                    Gbps
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Position Section */}
        <div className="border-b border-border p-5">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Position
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                X
              </label>
              <Input
                type="number"
                value={Math.round(node.position.x)}
                onChange={(e) =>
                  handleUpdate('position', {
                    ...node.position,
                    x: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Y
              </label>
              <Input
                type="number"
                value={Math.round(node.position.y)}
                onChange={(e) =>
                  handleUpdate('position', {
                    ...node.position,
                    y: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Location Section (All Node Types) */}
        <LocationSection
          location={node.location}
          onUpdate={(location) => handleUpdate('location', location)}
        />

        {/* OSP Properties Section (Only for OSP Termination nodes) */}
        {node.type === 'osp-termination' && (
          <OSPPropertiesSection
            properties={node.metadata?.ospProperties as OSPTerminationProperties | undefined}
            onUpdate={(ospProperties) =>
              handleUpdate('metadata', { ...node.metadata, ospProperties })
            }
          />
        )}

        {/* Port Mapping Section (Only for OSP Termination nodes) */}
        {node.type === 'osp-termination' && node.ports && node.ports.length > 0 && (
          <div className="border-b border-border p-5">
            <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Port Mapping
            </div>
            <PortMappingEditor
              ports={node.ports}
              mappings={
                (node.metadata?.ospProperties as OSPTerminationProperties | undefined)
                  ?.portMappings || []
              }
              isSplitter={
                (node.metadata?.ospProperties as OSPTerminationProperties | undefined)
                  ?.terminationType === 'splitter'
              }
              onUpdate={(portMappings: PortMapping[]) => {
                const currentOspProps = (node.metadata?.ospProperties ||
                  {}) as OSPTerminationProperties;
                handleUpdate('metadata', {
                  ...node.metadata,
                  ospProperties: { ...currentOspProps, portMappings },
                });
              }}
            />
          </div>
        )}

        {/* Connected Edges Section */}
        <div className="p-5">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Connected Links ({connectedEdges.length})
          </div>
          <div className="space-y-2">
            {connectedEdges.map((edge) => (
              <div
                key={edge.id}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg text-sm',
                  edge.state === 'failed'
                    ? 'bg-danger/10 border border-danger/20'
                    : edge.state === 'planned'
                    ? 'bg-info/10 border border-info/20'
                    : 'bg-tertiary'
                )}
              >
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-text-tertiary" />
                  <span className="font-medium text-text-primary">{edge.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {edge.properties.distance && (
                    <span className="text-text-tertiary">
                      {edge.properties.distance} km
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded uppercase font-medium',
                      edge.state === 'active' && 'bg-success/10 text-success',
                      edge.state === 'planned' && 'bg-info/10 text-info',
                      edge.state === 'failed' && 'bg-danger/10 text-danger'
                    )}
                  >
                    {edge.state}
                  </span>
                </div>
              </div>
            ))}
            {connectedEdges.length === 0 && (
              <div className="py-4 text-center text-sm italic text-text-muted">
                No connections
              </div>
            )}
          </div>
        </div>
        </>
        )}

        {activeTab === 'inventory' && (
          <InventoryTab node={node} />
        )}

        {activeTab === 'ports' && (
          <div className="border-b border-border p-5">
            <PortConfigurationSection
              ports={node.ports || []}
              onAddPort={handleAddPort}
              onUpdatePort={handleUpdatePort}
              onRemovePort={handleRemovePort}
              onSetPortGridType={(portId, gridType) => setPortGridType(node.id, portId, gridType)}
              onReserveChannels={handleReserveChannels}
              onUnreserveChannels={handleUnreserveChannels}
            />
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex shrink-0 gap-3 border-t border-border p-4">
        <Button
          variant="destructive"
          size="sm"
          onClick={confirmDelete}
          className="flex-1"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Node
        </Button>
      </div>
      </>)}
    </aside>
  );
};
