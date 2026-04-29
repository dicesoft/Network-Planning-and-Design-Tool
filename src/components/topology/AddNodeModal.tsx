import React, { useState, useEffect, useMemo } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore, selectNodeSubtypes } from '@/stores/settingsStore';
import {
  NodeType,
  VendorType,
  NODE_TYPE_CONFIGS,
  VENDOR_CONFIGS,
  Port,
  DEFAULT_PORTS_BY_NODE_TYPE,
  isComingSoonNodeType,
} from '@/types';
import type { NodeSizeFlavor } from '@/types/settings';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PortConfigurationSection } from './PortConfigurationSection';
import { NodeIcon } from './NodeIcon';

const nodeTypes: NodeType[] = ['router', 'switch', 'oadm', 'amplifier', 'terminal', 'olt', 'ont', 'custom'];
const vendors: VendorType[] = ['nokia', 'huawei', 'cisco', 'juniper', 'ciena', 'generic'];

export const AddNodeModal: React.FC = () => {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal = useUIStore((state) => state.closeModal);
  const pendingNodePosition = useUIStore((state) => state.pendingNodePosition);
  const setPendingNodePosition = useUIStore((state) => state.setPendingNodePosition);

  const addNode = useNetworkStore((state) => state.addNode);
  const allSubtypes = useSettingsStore(selectNodeSubtypes);

  const networkSettings = useSettingsStore((s) => s.settings.network);

  const [selectedType, setSelectedType] = useState<NodeType>('router');
  const [name, setName] = useState('');
  const [vendor, setVendor] = useState<VendorType>((networkSettings.defaultVendor || 'generic') as VendorType);
  const [model, setModel] = useState('');
  const [subtype, setSubtype] = useState<string>(networkSettings.defaultNodeSubtype || '');
  const [sizeFlavor, setSizeFlavor] = useState<NodeSizeFlavor | ''>('');
  const [ports, setPorts] = useState<Port[]>([]);
  const [portIdCounter, setPortIdCounter] = useState(0);

  const isOpen = activeModal === 'add-node';

  const subtypesForType = useMemo(
    () => allSubtypes.filter((s) => s.nodeType === selectedType),
    [allSubtypes, selectedType]
  );

  const currentPreset = useMemo(
    () => subtype ? subtypesForType.find((s) => s.key === subtype) : undefined,
    [subtype, subtypesForType]
  );

  // Generate default ports when type changes
  const defaultPorts = useMemo(() => {
    const templates = DEFAULT_PORTS_BY_NODE_TYPE[selectedType];
    return templates.map((template, index) => ({
      ...template,
      id: `temp-${index}`,
      status: 'available' as const,
    }));
  }, [selectedType]);

  // Reset ports when type changes (clear subtype too)
  useEffect(() => {
    setPorts(defaultPorts);
    setPortIdCounter(defaultPorts.length);
    setSubtype('');
    setSizeFlavor('');
  }, [selectedType, defaultPorts]);

  const handleClose = () => {
    closeModal();
    setPendingNodePosition(null);
    // Reset form to settings defaults
    setSelectedType('router');
    setName('');
    setVendor((networkSettings.defaultVendor || 'generic') as VendorType);
    setModel('');
    setSubtype(networkSettings.defaultNodeSubtype || '');
    setSizeFlavor('');
    setPorts([]);
    setPortIdCounter(0);
  };

  const handleAddPort = (portData: Omit<Port, 'id' | 'status' | 'connectedEdgeId'>) => {
    const newPort: Port = {
      ...portData,
      id: `temp-${portIdCounter}`,
      status: 'available',
    };
    setPorts([...ports, newPort]);
    setPortIdCounter(portIdCounter + 1);
  };

  const handleUpdatePort = (portId: string, updates: Partial<Omit<Port, 'id' | 'status' | 'connectedEdgeId'>>) => {
    setPorts(ports.map((p) => (p.id === portId ? { ...p, ...updates } : p)));
  };

  const handleRemovePort = (portId: string): boolean => {
    setPorts(ports.filter((p) => p.id !== portId));
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const position = pendingNodePosition || { x: 100, y: 100 };

    // When subtype + sizeFlavor are set, let the store auto-provision ports
    // Otherwise, pass user-configured ports
    const useSubtypeProvisioning = subtype && sizeFlavor;

    addNode({
      type: selectedType,
      position,
      name: name || undefined,
      vendor,
      model: model || undefined,
      subtype: subtype || undefined,
      sizeFlavor: (sizeFlavor as NodeSizeFlavor) || undefined,
      ...(!useSubtypeProvisioning
        ? {
            ports: ports.map(({ id: _id, ...rest }) => ({
              ...rest,
              id: crypto.randomUUID(),
            })),
          }
        : {}),
    });

    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent hideClose
        className="sm:max-w-[520px] md:max-w-screen-sm"
        data-testid="add-node-modal"
      >
        <DialogHeader>
          <DialogTitle>Add New Node</DialogTitle>
          <DialogDescription>
            Select a node type and configure its properties.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 px-6 py-6">
            {/* Node Type Selection - Responsive Grid */}
            <div>
              <label className="mb-3 block text-sm font-medium text-text-secondary">
                Node Type
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {nodeTypes.map((type) => {
                  const config = NODE_TYPE_CONFIGS[type];
                  const comingSoon = isComingSoonNodeType(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      data-testid={`node-type-${type}`}
                      onClick={() => !comingSoon && setSelectedType(type)}
                      className={cn(
                        'node-type-btn flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all min-h-[88px]',
                        comingSoon
                          ? 'opacity-50 pointer-events-none border-border'
                          : selectedType === type
                            ? 'border-accent bg-accent/5 shadow-sm ring-2 ring-accent/30'
                            : 'border-border hover:border-accent/50 hover:bg-tertiary'
                      )}
                    >
                      <div
                        className={cn(
                          'w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center',
                          'text-white shadow-sm',
                          `bg-gradient-to-br ${config.gradient}`
                        )}
                      >
                        <NodeIcon iconName={config.icon} size={22} />
                      </div>
                      <span className="text-center text-xs font-medium leading-tight text-text-primary sm:text-sm">
                        {config.label}
                      </span>
                      {comingSoon && (
                        <span className="bg-warning/10 rounded-full px-2 py-0.5 text-[10px] font-medium text-warning">
                          Coming Soon
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Node Properties - Responsive 2-column layout */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Node Name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Node Name (optional)
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`New ${NODE_TYPE_CONFIGS[selectedType].label}`}
                  data-testid="node-name-input"
                />
              </div>

              {/* Vendor */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Vendor
                </label>
                <Select value={vendor} onValueChange={(v) => setVendor(v as VendorType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v} value={v}>
                        {VENDOR_CONFIGS[v].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Subtype + Size Flavor */}
            {subtypesForType.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                    Subtype
                  </label>
                  <Select
                    value={subtype || '_none'}
                    onValueChange={(value) => {
                      const newSubtype = value === '_none' ? '' : value;
                      setSubtype(newSubtype);
                      if (!newSubtype) setSizeFlavor('');
                    }}
                  >
                    <SelectTrigger data-testid="add-node-subtype-select">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None (default ports)</SelectItem>
                      {subtypesForType.map((st) => (
                        <SelectItem key={st.key} value={st.key}>
                          {st.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {currentPreset && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                      Size
                    </label>
                    <Select
                      value={sizeFlavor || '_none'}
                      onValueChange={(value) => {
                        setSizeFlavor(value === '_none' ? '' : value as NodeSizeFlavor);
                      }}
                    >
                      <SelectTrigger data-testid="add-node-size-select">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Default</SelectItem>
                        <SelectItem value="small">
                          Small ({currentPreset.sizes.small.bwPorts} BW + {currentPreset.sizes.small.dwdmPorts} DWDM)
                        </SelectItem>
                        <SelectItem value="medium">
                          Medium ({currentPreset.sizes.medium.bwPorts} BW + {currentPreset.sizes.medium.dwdmPorts} DWDM)
                        </SelectItem>
                        <SelectItem value="large">
                          Large ({currentPreset.sizes.large.bwPorts} BW + {currentPreset.sizes.large.dwdmPorts} DWDM)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Model - Full width */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Model (optional)
              </label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g., ASR9000, 1830 PSS"
              />
            </div>

            {/* Port Configuration - Collapsible */}
            <div className="border-t border-border pt-4">
              <PortConfigurationSection
                ports={ports}
                onAddPort={handleAddPort}
                onUpdatePort={handleUpdatePort}
                onRemovePort={handleRemovePort}
                collapsible
                defaultCollapsed
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" data-testid="add-node-confirm">
              Add Node
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
