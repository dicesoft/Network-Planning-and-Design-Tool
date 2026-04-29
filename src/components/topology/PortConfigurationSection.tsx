import React, { useState, useEffect } from 'react';
import {
  Port,
  PortType,
  PortDataRate,
  PORT_CONSTRAINTS,
} from '@/types';
import type { ChannelGridType } from '@/types/spectrum';
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
import { Plus, Trash2, Edit2, Check, X, Cable, Radio, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { MiniSpectrumBar } from './SpectrumVisualization';
import { SpectrumModal } from './SpectrumModal';
import { CHANNEL_GRID_CONFIGS } from '@/core/spectrum/channelConfig';
import { getSpectrumUtilization } from '@/core/validation/channelValidation';

interface PortConfigurationSectionProps {
  ports: Port[];
  onAddPort: (port: Omit<Port, 'id' | 'status' | 'connectedEdgeId'>) => void;
  onUpdatePort: (portId: string, updates: Partial<Omit<Port, 'id' | 'status' | 'connectedEdgeId'>>) => void;
  onRemovePort: (portId: string) => boolean;
  onSetPortGridType?: (portId: string, gridType: ChannelGridType) => void;
  onReserveChannels?: (portId: string, channels: number[]) => void;
  onUnreserveChannels?: (portId: string, channels: number[]) => void;
  readOnly?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

const portTypes: { value: PortType; label: string }[] = [
  { value: 'bw', label: 'B/W (1310nm)' },
  { value: 'dwdm', label: 'DWDM (1550nm)' },
];

const dataRates: PortDataRate[] = ['1G', '10G', '25G', '100G', '400G'];

interface EditingPort {
  id: string;
  name: string;
  type: PortType;
  dataRate: PortDataRate;
  channels: number;
}

export const PortConfigurationSection: React.FC<PortConfigurationSectionProps> = ({
  ports,
  onAddPort,
  onUpdatePort,
  onRemovePort,
  onSetPortGridType,
  onReserveChannels,
  onUnreserveChannels,
  readOnly = false,
  collapsible = false,
  defaultCollapsed = true,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPortId, setEditingPortId] = useState<string | null>(null);
  const [editingPort, setEditingPort] = useState<EditingPort | null>(null);
  const [spectrumModalPort, setSpectrumModalPort] = useState<Port | null>(null);
  const [newPort, setNewPort] = useState<Omit<Port, 'id' | 'status' | 'connectedEdgeId'>>({
    name: '',
    type: 'bw',
    dataRate: '10G',
    channels: 1,
  });

  // Sync spectrumModalPort with ports prop when it changes (e.g., after grid type change)
  useEffect(() => {
    if (spectrumModalPort) {
      const updatedPort = ports.find(p => p.id === spectrumModalPort.id);
      if (updatedPort && updatedPort !== spectrumModalPort) {
        setSpectrumModalPort(updatedPort);
      }
    }
  }, [ports, spectrumModalPort]);

  const handleAddPort = () => {
    if (!newPort.name.trim()) return;

    onAddPort(newPort);
    setNewPort({
      name: '',
      type: 'bw',
      dataRate: '10G',
      channels: 1,
    });
    setIsAdding(false);
  };

  const startEditing = (port: Port) => {
    setEditingPortId(port.id);
    setEditingPort({
      id: port.id,
      name: port.name,
      type: port.type,
      dataRate: port.dataRate,
      channels: port.channels,
    });
  };

  const cancelEditing = () => {
    setEditingPortId(null);
    setEditingPort(null);
  };

  const saveEditing = () => {
    if (!editingPort || !editingPort.name.trim()) return;

    onUpdatePort(editingPort.id, {
      name: editingPort.name,
      type: editingPort.type,
      dataRate: editingPort.dataRate,
      channels: editingPort.channels,
    });
    cancelEditing();
  };

  const handleRemovePort = (portId: string) => {
    onRemovePort(portId);
  };

  const bwPorts = ports.filter((p) => p.type === 'bw');
  const dwdmPorts = ports.filter((p) => p.type === 'dwdm');
  const availableCount = ports.filter((p) => p.status === 'available').length;

  const renderPortRow = (port: Port) => {
    const isEditing = editingPortId === port.id;
    const isUsed = port.status === 'used';

    if (isEditing && editingPort) {
      return (
        <div key={port.id} className="bg-accent/5 border-accent/20 flex items-center gap-2 rounded-lg border p-2">
          <Input
            value={editingPort.name}
            onChange={(e) => setEditingPort({ ...editingPort, name: e.target.value })}
            className="h-8 flex-1"
            placeholder="Port name"
          />
          <Select
            value={editingPort.type}
            onValueChange={(v) =>
              setEditingPort({
                ...editingPort,
                type: v as PortType,
                channels: v === 'bw' ? 1 : editingPort.channels,
              })
            }
          >
            <SelectTrigger className="h-8 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {portTypes.map((pt) => (
                <SelectItem key={pt.value} value={pt.value}>
                  {pt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={editingPort.dataRate}
            onValueChange={(v) => setEditingPort({ ...editingPort, dataRate: v as PortDataRate })}
          >
            <SelectTrigger className="h-8 w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dataRates.map((rate) => (
                <SelectItem key={rate} value={rate}>
                  {rate}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {editingPort.type === 'dwdm' && (
            <Input
              type="number"
              value={editingPort.channels}
              onChange={(e) =>
                setEditingPort({
                  ...editingPort,
                  channels: Math.min(96, Math.max(1, parseInt(e.target.value) || 1)),
                })
              }
              className="h-8 w-[60px]"
              min={1}
              max={96}
            />
          )}
          <Button size="sm" variant="ghost" onClick={saveEditing} className="h-8 w-8 p-0">
            <Check className="h-4 w-4 text-success" />
          </Button>
          <Button size="sm" variant="ghost" onClick={cancelEditing} className="h-8 w-8 p-0">
            <X className="h-4 w-4 text-danger" />
          </Button>
        </div>
      );
    }

    // Get spectrum utilization for DWDM ports
    const spectrumInfo = port.type === 'dwdm' && port.spectrum
      ? getSpectrumUtilization(port.spectrum)
      : null;

    return (
      <div
        key={port.id}
        className={cn(
          'flex flex-col gap-1.5 p-2 rounded-lg border transition-colors',
          isUsed ? 'border-border/50 bg-tertiary/50' : 'border-border hover:border-accent/30'
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-7 h-7 rounded flex items-center justify-center shrink-0',
              port.type === 'bw' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'
            )}
          >
            {port.type === 'bw' ? <Cable className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-text-primary">{port.name}</div>
            <div className="text-xs text-text-tertiary">
              {PORT_CONSTRAINTS[port.type].label} - {port.dataRate}
              {port.type === 'dwdm' && ` - ${port.channels}ch`}
            </div>
          </div>
          {isUsed && (
            <span className="bg-warning/10 shrink-0 rounded px-2 py-0.5 text-xs text-warning">Used</span>
          )}
          {!readOnly && !isUsed && (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => startEditing(port)}
                className="h-7 w-7 p-0"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRemovePort(port.id)}
                className="h-7 w-7 p-0 hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Spectrum preview for DWDM ports */}
        {port.type === 'dwdm' && port.spectrum && spectrumInfo && (
          <div className="ml-9 flex items-center gap-2">
            <MiniSpectrumBar spectrum={port.spectrum} width={120} height={12} />
            <span className="text-xs text-text-muted">
              {CHANNEL_GRID_CONFIGS[port.spectrum.gridType].label.split(' ')[0]}
            </span>
            <span className="text-xs text-text-tertiary">
              {spectrumInfo.freeChannels}/{spectrumInfo.totalChannels} free
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSpectrumModalPort(port)}
              className="ml-auto h-6 w-6 p-0"
              title="View Spectrum"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const content = (
    <>
      {/* Summary */}
      <div className="mb-3 flex items-center gap-3 text-sm text-text-secondary">
        <span className="flex items-center gap-1.5">
          <Cable className="h-3.5 w-3.5 text-amber-500" />
          {bwPorts.length} B/W
        </span>
        <span className="flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5 text-purple-500" />
          {dwdmPorts.length} DWDM
        </span>
        <span className="text-text-muted">({availableCount} available)</span>
      </div>

      {/* Port list */}
      <div className="custom-scrollbar max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
        {ports.map(renderPortRow)}
      </div>

      {/* Add port form */}
      {!readOnly && (
        <>
          {isAdding ? (
            <div className="mt-3 rounded-lg border border-border bg-tertiary p-3">
              <div className="flex flex-col gap-2">
                <Input
                  value={newPort.name}
                  onChange={(e) => setNewPort({ ...newPort, name: e.target.value })}
                  placeholder="Port name (e.g., Eth-5)"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Select
                    value={newPort.type}
                    onValueChange={(v) =>
                      setNewPort({
                        ...newPort,
                        type: v as PortType,
                        channels: v === 'bw' ? 1 : newPort.channels,
                      })
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {portTypes.map((pt) => (
                        <SelectItem key={pt.value} value={pt.value}>
                          {pt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={newPort.dataRate}
                    onValueChange={(v) => setNewPort({ ...newPort, dataRate: v as PortDataRate })}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dataRates.map((rate) => (
                        <SelectItem key={rate} value={rate}>
                          {rate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newPort.type === 'dwdm' && (
                    <Input
                      type="number"
                      value={newPort.channels}
                      onChange={(e) =>
                        setNewPort({
                          ...newPort,
                          channels: Math.min(96, Math.max(1, parseInt(e.target.value) || 1)),
                        })
                      }
                      className="w-[80px]"
                      min={1}
                      max={96}
                      placeholder="Ch"
                    />
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsAdding(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddPort} disabled={!newPort.name.trim()}>
                    Add Port
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAdding(true)}
              className="mt-3 w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Port
            </Button>
          )}
        </>
      )}
    </>
  );

  if (collapsible) {
    return (
      <>
        <div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="mb-3 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-tertiary transition-colors hover:text-text-secondary"
          >
            <span>Ports ({ports.length})</span>
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          {!isCollapsed && content}
        </div>

        {/* Spectrum Modal */}
        {spectrumModalPort?.spectrum && (
          <SpectrumModal
            isOpen={!!spectrumModalPort}
            onClose={() => setSpectrumModalPort(null)}
            spectrum={spectrumModalPort.spectrum}
            title="Port Spectrum"
            subtitle={spectrumModalPort.name}
            readOnly={spectrumModalPort.status === 'used'}
            onGridTypeChange={
              spectrumModalPort.status === 'available' && onSetPortGridType
                ? (gridType) => onSetPortGridType(spectrumModalPort.id, gridType)
                : undefined
            }
            onReserveChannels={
              spectrumModalPort.status === 'available' && onReserveChannels
                ? (channels) => onReserveChannels(spectrumModalPort.id, channels)
                : undefined
            }
            onUnreserveChannels={
              spectrumModalPort.status === 'available' && onUnreserveChannels
                ? (channels) => onUnreserveChannels(spectrumModalPort.id, channels)
                : undefined
            }
          />
        )}
      </>
    );
  }

  return (
    <>
      <div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Ports ({ports.length})
        </div>
        {content}
      </div>

      {/* Spectrum Modal */}
      {spectrumModalPort?.spectrum && (
        <SpectrumModal
          isOpen={!!spectrumModalPort}
          onClose={() => setSpectrumModalPort(null)}
          spectrum={spectrumModalPort.spectrum}
          title="Port Spectrum"
          subtitle={spectrumModalPort.name}
          readOnly={spectrumModalPort.status === 'used'}
          onGridTypeChange={
            spectrumModalPort.status === 'available' && onSetPortGridType
              ? (gridType) => onSetPortGridType(spectrumModalPort.id, gridType)
              : undefined
          }
          onReserveChannels={
            spectrumModalPort.status === 'available' && onReserveChannels
              ? (channels) => onReserveChannels(spectrumModalPort.id, channels)
              : undefined
          }
          onUnreserveChannels={
            spectrumModalPort.status === 'available' && onUnreserveChannels
              ? (channels) => onUnreserveChannels(spectrumModalPort.id, channels)
              : undefined
          }
        />
      )}
    </>
  );
};
