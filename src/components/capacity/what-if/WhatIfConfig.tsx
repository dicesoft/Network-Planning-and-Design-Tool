import React, { useState, useCallback, useMemo } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { Plus, Minus, Trash2, ListPlus, Info } from 'lucide-react';
import type {
  ServiceType,
  ModulationType,
  ProtectionScheme,
  L1DataRate,
} from '@/types/service';
import type { WhatIfServiceConfig } from '@/core/services/WhatIfPathComputer';

// ============================================================================
// TYPES
// ============================================================================

export type AnalysisAction = 'add' | 'remove';

export interface WhatIfConfigProps {
  onAnalyze: (configs: WhatIfServiceConfig[], action: AnalysisAction, selectedServiceId?: string) => void;
  onClear: () => void;
  isAnalyzing: boolean;
}

interface BatchItem {
  id: string;
  config: WhatIfServiceConfig;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DATA_RATES: L1DataRate[] = ['10G', '25G', '100G', '200G', '400G'];
const MODULATIONS: ModulationType[] = [
  'DP-QPSK',
  'DP-8QAM',
  'DP-16QAM',
  'DP-32QAM',
  'DP-64QAM',
];
const PROTECTIONS: { value: ProtectionScheme; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'olp', label: 'OLP (1+1)' },
  { value: 'sncp', label: 'SNCP' },
  { value: 'wson-restoration', label: 'WSON Restoration' },
];
const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: 'l1-dwdm', label: 'L1 DWDM' },
  { value: 'l2-ethernet', label: 'L2 Ethernet' },
  { value: 'l3-ip', label: 'L3 IP' },
];

let nextBatchId = 1;

// ============================================================================
// COMPONENT
// ============================================================================

export const WhatIfConfig: React.FC<WhatIfConfigProps> = ({
  onAnalyze,
  onClear,
  isAnalyzing,
}) => {
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);

  // Action mode
  const [action, setAction] = useState<AnalysisAction>('add');

  // Form state for "Add" mode
  const [sourceNodeId, setSourceNodeId] = useState('');
  const [targetNodeId, setTargetNodeId] = useState('');
  const [dataRate, setDataRate] = useState<L1DataRate>('100G');
  const [modulation, setModulation] = useState<ModulationType>('DP-16QAM');
  const [protection, setProtection] = useState<ProtectionScheme>('none');
  const [serviceType, setServiceType] = useState<ServiceType>('l1-dwdm');
  const [quantity, setQuantity] = useState(1);
  const [channelAuto, setChannelAuto] = useState(true);
  const [channelNumber, setChannelNumber] = useState(1);

  // Remove mode
  const [selectedServiceId, setSelectedServiceId] = useState('');

  // Batch list
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of topology.nodes) {
      map.set(node.id, node.name || node.id.slice(0, 8));
    }
    return map;
  }, [topology.nodes]);

  const nodeOptions = useMemo(
    () =>
      topology.nodes.map((node) => ({
        value: node.id,
        label: node.name || node.id,
      })),
    [topology.nodes]
  );

  const serviceOptions = useMemo(
    () =>
      services.map((svc) => ({
        value: svc.id,
        label: `${svc.id} - ${svc.name || 'Unnamed'}`,
      })),
    [services]
  );

  const getNodeName = useCallback(
    (id: string) => nodeNameMap.get(id) || id.slice(0, 8),
    [nodeNameMap]
  );

  const canAddToBatch =
    action === 'add'
      ? sourceNodeId !== '' && targetNodeId !== '' && sourceNodeId !== targetNodeId
      : selectedServiceId !== '';

  const handleAddToBatch = useCallback(() => {
    if (!canAddToBatch) return;

    if (action === 'add') {
      const config: WhatIfServiceConfig = {
        sourceNodeId,
        destinationNodeId: targetNodeId,
        serviceType,
        dataRate,
        modulation: serviceType === 'l1-dwdm' ? modulation : undefined,
        protection,
        channelNumber: serviceType === 'l1-dwdm' && !channelAuto ? channelNumber : undefined,
        quantity,
      };
      setBatchItems((prev) => [
        ...prev,
        { id: `batch-${nextBatchId++}`, config },
      ]);
    }
  }, [
    canAddToBatch,
    action,
    sourceNodeId,
    targetNodeId,
    serviceType,
    dataRate,
    modulation,
    protection,
    channelAuto,
    channelNumber,
    quantity,
  ]);

  const handleRemoveBatchItem = useCallback((itemId: string) => {
    setBatchItems((prev) => prev.filter((b) => b.id !== itemId));
  }, []);

  const handleAnalyze = useCallback(() => {
    if (action === 'add') {
      // If batch has items, use batch. Otherwise create single config.
      if (batchItems.length > 0) {
        onAnalyze(
          batchItems.map((b) => b.config),
          action
        );
      } else if (canAddToBatch) {
        const config: WhatIfServiceConfig = {
          sourceNodeId,
          destinationNodeId: targetNodeId,
          serviceType,
          dataRate,
          modulation: serviceType === 'l1-dwdm' ? modulation : undefined,
          protection,
          channelNumber: serviceType === 'l1-dwdm' && !channelAuto ? channelNumber : undefined,
          quantity,
        };
        onAnalyze([config], action);
      }
    } else {
      if (selectedServiceId) {
        // Pass the selected service ID to the parent for removal simulation
        onAnalyze([], action, selectedServiceId);
      }
    }
  }, [
    action,
    batchItems,
    canAddToBatch,
    sourceNodeId,
    targetNodeId,
    serviceType,
    dataRate,
    modulation,
    protection,
    channelAuto,
    channelNumber,
    quantity,
    selectedServiceId,
    onAnalyze,
  ]);

  const handleActionChange = useCallback(
    (newAction: AnalysisAction) => {
      setAction(newAction);
      onClear();
      setBatchItems([]);
    },
    [onClear]
  );

  const canAnalyze =
    action === 'add'
      ? batchItems.length > 0 || canAddToBatch
      : selectedServiceId !== '';

  return (
    <div className="flex flex-col gap-4">
      {/* Action Radio Cards */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleActionChange('add')}
          className={cn(
            'flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors',
            action === 'add'
              ? 'border-success bg-success/5'
              : 'border-border bg-elevated hover:border-border-light'
          )}
        >
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              action === 'add' ? 'bg-success/20 text-success' : 'bg-tertiary text-text-muted'
            )}
          >
            <Plus className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-text-primary">Add Service</div>
            <div className="text-xs text-text-tertiary">Simulate adding new capacity</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleActionChange('remove')}
          className={cn(
            'flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors',
            action === 'remove'
              ? 'border-danger bg-danger/5'
              : 'border-border bg-elevated hover:border-border-light'
          )}
        >
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              action === 'remove' ? 'bg-danger/20 text-danger' : 'bg-tertiary text-text-muted'
            )}
          >
            <Minus className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-text-primary">Remove Service</div>
            <div className="text-xs text-text-tertiary">Simulate removing existing capacity</div>
          </div>
        </button>
      </div>

      {/* Service Form */}
      <div className="rounded-md border border-border bg-elevated p-4">
        {action === 'add' ? (
          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium text-text-primary">
              Configure new service
            </div>

            {/* Source / Destination */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary">Source Node</label>
                <Combobox
                  options={nodeOptions}
                  value={sourceNodeId}
                  onChange={setSourceNodeId}
                  placeholder="Select source"
                  searchPlaceholder="Search nodes..."
                  emptyMessage="No nodes available"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary">Destination</label>
                <Combobox
                  options={nodeOptions.filter((opt) => opt.value !== sourceNodeId)}
                  value={targetNodeId}
                  onChange={setTargetNodeId}
                  placeholder="Select destination"
                  searchPlaceholder="Search nodes..."
                  emptyMessage="No nodes available"
                />
              </div>
            </div>

            {/* Service Type / Data Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary">Service Type</label>
                <Select
                  value={serviceType}
                  onValueChange={(v) => setServiceType(v as ServiceType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((st) => (
                      <SelectItem key={st.value} value={st.value}>
                        {st.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary">Data Rate</label>
                <Select
                  value={dataRate}
                  onValueChange={(v) => setDataRate(v as L1DataRate)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_RATES.map((rate) => (
                      <SelectItem key={rate} value={rate}>
                        {rate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* L2/L3 underlay info */}
            {serviceType !== 'l1-dwdm' && (
              <div className="bg-accent/5 flex items-start gap-2 rounded-md px-3 py-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="text-xs text-text-secondary">
                  L2/L3 services ride on L1 DWDM underlays. Each service consumes 1 channel on every edge along its path.
                </span>
              </div>
            )}

            {/* Modulation / Protection */}
            <div className="grid grid-cols-2 gap-3">
              {serviceType === 'l1-dwdm' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-secondary">Modulation</label>
                  <Select
                    value={modulation}
                    onValueChange={(v) => setModulation(v as ModulationType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODULATIONS.map((mod) => (
                        <SelectItem key={mod} value={mod}>
                          {mod}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary">Protection</label>
                <Select
                  value={protection}
                  onValueChange={(v) => setProtection(v as ProtectionScheme)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROTECTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Channel Selection (L1 DWDM only) */}
            {serviceType === 'l1-dwdm' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary">Channel</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={channelAuto}
                      onChange={(e) => setChannelAuto(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border accent-accent"
                    />
                    Auto
                  </label>
                  {!channelAuto && (
                    <Input
                      type="number"
                      min={1}
                      max={96}
                      value={channelNumber}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 1;
                        setChannelNumber(Math.max(1, Math.min(96, v)));
                      }}
                      className="w-20"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary">Quantity</label>
              <Input
                type="number"
                min={1}
                max={96}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24"
              />
            </div>

            {/* Add to Batch */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddToBatch}
                disabled={!canAddToBatch}
              >
                <ListPlus className="mr-1.5 h-3.5 w-3.5" />
                Add to Batch
              </Button>
            </div>

            {/* Batch List */}
            {batchItems.length > 0 && (
              <div className="mt-2 rounded-md border border-border">
                <div className="border-b border-border bg-canvas px-3 py-2 text-xs font-medium text-text-secondary">
                  Batch ({batchItems.length} item{batchItems.length !== 1 ? 's' : ''})
                </div>
                <div className="max-h-40 overflow-auto">
                  {batchItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 text-xs text-text-primary">
                        <span className="bg-accent/10 rounded px-1.5 py-0.5 text-accent">
                          {item.config.serviceType === 'l1-dwdm'
                            ? 'L1'
                            : item.config.serviceType === 'l2-ethernet'
                              ? 'L2'
                              : 'L3'}
                        </span>
                        <span>
                          {getNodeName(item.config.sourceNodeId)} &rarr;{' '}
                          {getNodeName(item.config.destinationNodeId)}
                        </span>
                        <span className="text-text-tertiary">
                          {item.config.dataRate}
                          {item.config.quantity > 1 && ` x${item.config.quantity}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveBatchItem(item.id)}
                        className="text-text-muted hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium text-text-primary">
              Simulate removing an existing service
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary">Service</label>
              {services.length === 0 ? (
                <div className="text-xs text-text-tertiary">
                  No services available. Create a service first.
                </div>
              ) : (
                <Combobox
                  options={serviceOptions}
                  value={selectedServiceId}
                  onChange={setSelectedServiceId}
                  placeholder="Select a service"
                  searchPlaceholder="Search services..."
                  emptyMessage="No services found"
                />
              )}
            </div>
          </div>
        )}

        {/* Analyze button */}
        <div className="mt-4">
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={!canAnalyze || isAnalyzing}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze Impact'}
          </Button>
        </div>
      </div>
    </div>
  );
};
