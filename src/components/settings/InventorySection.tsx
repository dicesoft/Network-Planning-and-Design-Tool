/**
 * InventorySection — CRUD tables for Transceivers, Cards, and Node Subtypes
 * Used inside SettingsDialog as the Inventory tab content.
 * Operates on pending state (not the store directly).
 */
import React, { useState, useMemo, useCallback } from 'react';
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
import type { AppSettings, NodeSubtypePreset, NodeSizeFlavor, NodeSizeConfig } from '@/types/settings';
import type { TransceiverType, TransceiverFormFactor } from '@/types/transceiver';
import type { CardDefinition } from '@/types/inventory';
import type { NodeType, PortType, PortDataRate } from '@/types/network';
import { DEFAULT_TRANSCEIVERS } from '@/types/transceiver';
import { DEFAULT_CARD_LIBRARY } from '@/types/inventory';
import { DEFAULT_NODE_SUBTYPES } from '@/types/settings';
import {
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  ArrowUpDown,
  Upload,
  Download,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface SectionProps {
  pending: AppSettings;
  setPending: React.Dispatch<React.SetStateAction<AppSettings>>;
}

type InventorySubTab = 'transceivers' | 'cards' | 'subtypes';

type SortDirection = 'asc' | 'desc';

// ============================================================================
// SORT UTILITY
// ============================================================================

function sortBy<T>(items: T[], key: keyof T, dir: SortDirection): T[] {
  return [...items].sort((a, b) => {
    const va = String(a[key] ?? '');
    const vb = String(b[key] ?? '');
    return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}

// ============================================================================
// SORTABLE TABLE HEADER
// ============================================================================

const SortableHeader: React.FC<{
  label: string;
  sortKey: string;
  currentSort: string | null;
  currentDir: SortDirection;
  onSort: (key: string) => void;
  className?: string;
}> = ({ label, sortKey, currentSort, currentDir, onSort, className }) => (
  <th
    className={cn(
      'cursor-pointer select-none px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary',
      className,
    )}
    onClick={() => onSort(sortKey)}
  >
    <span className="inline-flex items-center gap-1">
      {label}
      <ArrowUpDown className={cn('h-3 w-3', currentSort === sortKey ? 'text-accent' : 'text-text-muted/50')} />
      {currentSort === sortKey && (
        <span className="text-[8px] text-accent">{currentDir === 'asc' ? 'A' : 'D'}</span>
      )}
    </span>
  </th>
);

// ============================================================================
// TRANSCEIVER FORM
// ============================================================================

const FORM_FACTORS: TransceiverFormFactor[] = ['CFP', 'CFP2', 'QSFP28', 'QSFP-DD', 'OSFP', 'SFP+', 'SFP28'];

const TransceiverForm: React.FC<{
  initial?: TransceiverType;
  onSave: (t: TransceiverType) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [name, setName] = useState(initial?.name || '');
  const [vendor, setVendor] = useState(initial?.vendor || 'Generic');
  const [formFactor, setFormFactor] = useState<TransceiverFormFactor>(initial?.formFactor || 'QSFP-DD');
  const [launchPower, setLaunchPower] = useState(initial?.launchPower ?? 0);
  const [receiverSensitivity, setReceiverSensitivity] = useState(initial?.receiverSensitivity ?? -20);
  const [txOSNR, setTxOSNR] = useState(initial?.txOSNR ?? 38);
  const [baudRate, setBaudRate] = useState(initial?.baudRate ?? 64);

  const handleSubmit = () => {
    if (!name.trim()) return;
    const id = initial?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    onSave({
      id,
      name: name.trim(),
      vendor,
      formFactor,
      launchPower,
      receiverSensitivity,
      txOSNR,
      supportedModulations: initial?.supportedModulations || [
        { modulation: 'DP-QPSK', requiredOSNR: 12, maxReach: 2500 },
      ],
      supportedDataRates: initial?.supportedDataRates || ['100G'],
      baudRate,
    });
  };

  return (
    <div className="border-accent/30 bg-accent/5 space-y-3 rounded-lg border p-3">
      <div className="text-xs font-semibold text-accent">
        {initial ? 'Edit Transceiver' : 'Add Transceiver'}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CFP2-DCO-100G" className="h-7 text-xs" data-testid="transceiver-form-name" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Vendor</label>
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Generic" className="h-7 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Form Factor</label>
          <Select value={formFactor} onValueChange={(v) => setFormFactor(v as TransceiverFormFactor)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORM_FACTORS.map((ff) => <SelectItem key={ff} value={ff}>{ff}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Baud Rate (GBd)</label>
          <Input type="number" value={baudRate} onChange={(e) => setBaudRate(parseFloat(e.target.value) || 0)} className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Launch Power (dBm)</label>
          <Input type="number" step={0.5} value={launchPower} onChange={(e) => setLaunchPower(parseFloat(e.target.value) || 0)} className="h-7 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Rx Sensitivity (dBm)</label>
          <Input type="number" step={0.5} value={receiverSensitivity} onChange={(e) => setReceiverSensitivity(parseFloat(e.target.value) || 0)} className="h-7 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Tx OSNR (dB)</label>
          <Input type="number" step={0.5} value={txOSNR} onChange={(e) => setTxOSNR(parseFloat(e.target.value) || 0)} className="h-7 text-xs" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={!name.trim()} className="h-7 text-xs" data-testid="transceiver-form-save">
          {initial ? 'Update' : 'Add'}
        </Button>
      </div>
    </div>
  );
};

// ============================================================================
// CARD FORM
// ============================================================================

const NODE_TYPES: { value: NodeType; label: string }[] = [
  { value: 'router', label: 'Router' },
  { value: 'switch', label: 'Switch' },
  { value: 'oadm', label: 'OADM' },
  { value: 'amplifier', label: 'Amplifier' },
  { value: 'terminal', label: 'Terminal' },
];
const PORT_TYPES: PortType[] = ['bw', 'dwdm'];
const DATA_RATES: PortDataRate[] = ['1G', '10G', '25G', '100G', '400G'];

const CardForm: React.FC<{
  initial?: CardDefinition;
  onSave: (c: CardDefinition) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [name, setName] = useState(initial?.name || '');
  const [vendor, setVendor] = useState(initial?.vendor || 'generic');
  const [nodeType, setNodeType] = useState<NodeType>(initial?.nodeType || 'router');
  const [portType, setPortType] = useState<PortType>(initial?.portTemplate[0]?.type || 'bw');
  const [portDataRate, setPortDataRate] = useState<PortDataRate>(initial?.portTemplate[0]?.dataRate || '10G');
  const [portCount, setPortCount] = useState(initial?.portTemplate[0]?.count || 8);
  const [switchingCapacity, setSwitchingCapacity] = useState(initial?.switchingCapacity ?? 0);
  const [powerConsumption, setPowerConsumption] = useState(initial?.powerConsumption ?? 0);

  const handleSubmit = () => {
    if (!name.trim()) return;
    const id = initial?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    onSave({
      id,
      name: name.trim(),
      vendor,
      nodeType,
      portTemplate: [{
        namePattern: portType === 'dwdm' ? 'Line-{n}' : 'Eth-{n}',
        type: portType,
        dataRate: portDataRate,
        count: portCount,
        ...(portType === 'dwdm' ? { channels: 96 } : {}),
      }],
      switchingCapacity: switchingCapacity > 0 ? switchingCapacity : undefined,
      powerConsumption: powerConsumption > 0 ? powerConsumption : undefined,
    });
  };

  return (
    <div className="border-accent/30 bg-accent/5 space-y-3 rounded-lg border p-3">
      <div className="text-xs font-semibold text-accent">
        {initial ? 'Edit Card' : 'Add Card'}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="IMM8-100G" className="h-7 text-xs" data-testid="card-form-name" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Vendor</label>
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} className="h-7 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Node Type</label>
          <Select value={nodeType} onValueChange={(v) => setNodeType(v as NodeType)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {NODE_TYPES.map((nt) => <SelectItem key={nt.value} value={nt.value}>{nt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Port Type</label>
          <Select value={portType} onValueChange={(v) => setPortType(v as PortType)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PORT_TYPES.map((pt) => <SelectItem key={pt} value={pt}>{pt.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Data Rate</label>
          <Select value={portDataRate} onValueChange={(v) => setPortDataRate(v as PortDataRate)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATA_RATES.map((dr) => <SelectItem key={dr} value={dr}>{dr}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Port Count</label>
          <Input type="number" min={1} max={96} value={portCount} onChange={(e) => setPortCount(Math.max(1, parseInt(e.target.value) || 1))} className="h-7 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Switching (Gbps)</label>
          <Input type="number" min={0} value={switchingCapacity} onChange={(e) => setSwitchingCapacity(parseInt(e.target.value) || 0)} className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Power (W)</label>
          <Input type="number" min={0} value={powerConsumption} onChange={(e) => setPowerConsumption(parseInt(e.target.value) || 0)} className="h-7 text-xs" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={!name.trim()} className="h-7 text-xs" data-testid="card-form-save">
          {initial ? 'Update' : 'Add'}
        </Button>
      </div>
    </div>
  );
};

// ============================================================================
// TRANSCEIVER TABLE
// ============================================================================

const TransceiverTable: React.FC<SectionProps> = ({ pending, setPending }) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const transceivers = pending.transceiverLibrary || [];

  const sorted = useMemo(() => {
    if (!sortKey) return transceivers;
    return sortBy(transceivers, sortKey as keyof TransceiverType, sortDir);
  }, [transceivers, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleAdd = useCallback((t: TransceiverType) => {
    setPending((prev) => {
      const lib = prev.transceiverLibrary || [];
      if (lib.some((x) => x.id === t.id)) return prev;
      return { ...prev, transceiverLibrary: [...lib, t] };
    });
    setShowAddForm(false);
  }, [setPending]);

  const handleEdit = useCallback((t: TransceiverType) => {
    setPending((prev) => ({
      ...prev,
      transceiverLibrary: (prev.transceiverLibrary || []).map((x) => (x.id === t.id ? t : x)),
    }));
    setEditingId(null);
  }, [setPending]);

  const handleDelete = useCallback((id: string) => {
    setPending((prev) => ({
      ...prev,
      transceiverLibrary: (prev.transceiverLibrary || []).filter((x) => x.id !== id),
    }));
  }, [setPending]);

  const handleReset = useCallback(() => {
    setPending((prev) => ({ ...prev, transceiverLibrary: [...DEFAULT_TRANSCEIVERS] }));
  }, [setPending]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-text-tertiary">{transceivers.length} transceivers</div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleReset}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setShowAddForm(true); setEditingId(null); }} data-testid="add-transceiver-btn">
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      {showAddForm && (
        <div className="mb-3">
          <TransceiverForm onSave={handleAdd} onCancel={() => setShowAddForm(false)} />
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs" data-testid="transceiver-table">
          <thead className="bg-tertiary/50 border-b border-border">
            <tr>
              <SortableHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Vendor" sortKey="vendor" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Form Factor" sortKey="formFactor" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Launch (dBm)" sortKey="launchPower" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Rx Sens (dBm)" sortKey="receiverSensitivity" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Tx OSNR (dB)" sortKey="txOSNR" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Baud (GBd)" sortKey="baudRate" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <th className="w-20 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <React.Fragment key={t.id}>
                {editingId === t.id ? (
                  <tr>
                    <td colSpan={8} className="p-2">
                      <TransceiverForm initial={t} onSave={handleEdit} onCancel={() => setEditingId(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr className="border-border/50 hover:bg-tertiary/30 border-b" data-testid={`transceiver-row-${t.id}`}>
                    <td className="px-3 py-2 font-medium text-text-primary">{t.name}</td>
                    <td className="px-3 py-2 text-text-secondary">{t.vendor}</td>
                    <td className="px-3 py-2 text-text-secondary">{t.formFactor}</td>
                    <td className="px-3 py-2 text-text-secondary">{t.launchPower}</td>
                    <td className="px-3 py-2 text-text-secondary">{t.receiverSensitivity}</td>
                    <td className="px-3 py-2 text-text-secondary">{t.txOSNR}</td>
                    <td className="px-3 py-2 text-text-secondary">{t.baudRate}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditingId(t.id); setShowAddForm(false); }} className="hover:bg-accent/10 rounded p-0.5 text-text-muted hover:text-accent" title="Edit">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => handleDelete(t.id)} className="hover:bg-danger/10 rounded p-0.5 text-text-muted hover:text-danger" title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-text-muted">
                  No transceivers configured. Click Add to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// CARD TABLE
// ============================================================================

const CardTable: React.FC<SectionProps> = ({ pending, setPending }) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const cards = pending.cardLibrary || [];

  const sorted = useMemo(() => {
    if (!sortKey) return cards;
    return sortBy(cards, sortKey as keyof CardDefinition, sortDir);
  }, [cards, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleAdd = useCallback((c: CardDefinition) => {
    setPending((prev) => {
      const lib = prev.cardLibrary || [];
      if (lib.some((x) => x.id === c.id)) return prev;
      return { ...prev, cardLibrary: [...lib, c] };
    });
    setShowAddForm(false);
  }, [setPending]);

  const handleEdit = useCallback((c: CardDefinition) => {
    setPending((prev) => ({
      ...prev,
      cardLibrary: (prev.cardLibrary || []).map((x) => (x.id === c.id ? c : x)),
    }));
    setEditingId(null);
  }, [setPending]);

  const handleDelete = useCallback((id: string) => {
    setPending((prev) => ({
      ...prev,
      cardLibrary: (prev.cardLibrary || []).filter((x) => x.id !== id),
    }));
  }, [setPending]);

  const handleReset = useCallback(() => {
    setPending((prev) => ({ ...prev, cardLibrary: [...DEFAULT_CARD_LIBRARY] }));
  }, [setPending]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-text-tertiary">{cards.length} cards</div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleReset}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setShowAddForm(true); setEditingId(null); }} data-testid="add-card-btn">
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      {showAddForm && (
        <div className="mb-3">
          <CardForm onSave={handleAdd} onCancel={() => setShowAddForm(false)} />
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs" data-testid="card-table">
          <thead className="bg-tertiary/50 border-b border-border">
            <tr>
              <SortableHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Vendor" sortKey="vendor" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Node Type" sortKey="nodeType" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Ports</th>
              <SortableHeader label="Switch Cap" sortKey="switchingCapacity" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Power (W)" sortKey="powerConsumption" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <th className="w-20 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <React.Fragment key={c.id}>
                {editingId === c.id ? (
                  <tr>
                    <td colSpan={7} className="p-2">
                      <CardForm initial={c} onSave={handleEdit} onCancel={() => setEditingId(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr className="border-border/50 hover:bg-tertiary/30 border-b" data-testid={`card-row-${c.id}`}>
                    <td className="px-3 py-2 font-medium text-text-primary">{c.name}</td>
                    <td className="px-3 py-2 text-text-secondary">{c.vendor}</td>
                    <td className="px-3 py-2 capitalize text-text-secondary">{c.nodeType}</td>
                    <td className="px-3 py-2 text-text-secondary">
                      {c.portTemplate.map((pt) => `${pt.count}x ${pt.dataRate} ${pt.type.toUpperCase()}`).join(', ')}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{c.switchingCapacity ? `${c.switchingCapacity} Gbps` : '-'}</td>
                    <td className="px-3 py-2 text-text-secondary">{c.powerConsumption ? `${c.powerConsumption}W` : '-'}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditingId(c.id); setShowAddForm(false); }} className="hover:bg-accent/10 rounded p-0.5 text-text-muted hover:text-accent" title="Edit">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="hover:bg-danger/10 rounded p-0.5 text-text-muted hover:text-danger" title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                  No cards configured. Click Add to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// NODE SUBTYPE TABLE (re-uses existing SubtypeForm from SettingsDialog)
// ============================================================================

const defaultSizeConfig: NodeSizeConfig = { bwPorts: 4, dwdmPorts: 2, switchingCapacity: 100 };
const SUBTYPE_PARENT_TYPES: { value: NodeType; label: string }[] = [
  { value: 'router', label: 'Router' },
  { value: 'switch', label: 'Switch' },
  { value: 'oadm', label: 'OADM' },
  { value: 'amplifier', label: 'Amplifier' },
  { value: 'terminal', label: 'Terminal' },
];

const InlineSubtypeForm: React.FC<{
  initial?: NodeSubtypePreset;
  onSave: (preset: NodeSubtypePreset) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [label, setLabel] = useState(initial?.label || '');
  const [nodeType, setNodeType] = useState<NodeType>(initial?.nodeType || 'router');
  const [sizes, setSizes] = useState<Record<NodeSizeFlavor, NodeSizeConfig>>(
    initial?.sizes || {
      small: { ...defaultSizeConfig },
      medium: { bwPorts: 8, dwdmPorts: 4, switchingCapacity: 400 },
      large: { bwPorts: 16, dwdmPorts: 8, switchingCapacity: 1600 },
    }
  );

  const updateSize = (size: NodeSizeFlavor, field: keyof NodeSizeConfig, value: number) => {
    setSizes((prev) => ({ ...prev, [size]: { ...prev[size], [field]: value } }));
  };

  const handleSubmit = () => {
    const resolvedKey = initial?.key || label.toLowerCase().replace(/\s+/g, '-');
    if (!resolvedKey || !label) return;
    onSave({ key: resolvedKey, label, nodeType, sizes });
  };

  return (
    <div className="border-accent/30 bg-accent/5 space-y-3 rounded-lg border p-3">
      <div className="text-xs font-semibold text-accent">
        {initial ? 'Edit Subtype' : 'Add Subtype'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Label</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g., Metro Router" className="h-7 text-xs" data-testid="inv-subtype-form-label" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-text-secondary">Parent Type</label>
          <Select value={nodeType} onValueChange={(v) => setNodeType(v as NodeType)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUBTYPE_PARENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <div className="grid grid-cols-4 gap-1 text-[10px] font-medium text-text-tertiary">
          <span>Size</span><span>BW Ports</span><span>DWDM Ports</span><span>Switching</span>
        </div>
        {(['small', 'medium', 'large'] as NodeSizeFlavor[]).map((size) => (
          <div key={size} className="grid grid-cols-4 items-center gap-1">
            <span className="text-xs font-medium capitalize text-text-secondary">{size}</span>
            <Input type="number" min={0} max={96} className="h-6 text-xs" value={sizes[size].bwPorts} onChange={(e) => updateSize(size, 'bwPorts', Math.max(0, parseInt(e.target.value) || 0))} />
            <Input type="number" min={0} max={48} className="h-6 text-xs" value={sizes[size].dwdmPorts} onChange={(e) => updateSize(size, 'dwdmPorts', Math.max(0, parseInt(e.target.value) || 0))} />
            <Input type="number" min={0} className="h-6 text-xs" value={sizes[size].switchingCapacity} onChange={(e) => updateSize(size, 'switchingCapacity', Math.max(0, parseInt(e.target.value) || 0))} />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={!label} className="h-7 text-xs" data-testid="inv-subtype-form-save">
          {initial ? 'Update' : 'Add'}
        </Button>
      </div>
    </div>
  );
};

const SubtypeTable: React.FC<SectionProps> = ({ pending, setPending }) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const subtypes = pending.nodeSubtypes;

  const sorted = useMemo(() => {
    if (!sortKey) return subtypes;
    return sortBy(subtypes, sortKey as keyof NodeSubtypePreset, sortDir);
  }, [subtypes, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleAdd = useCallback((preset: NodeSubtypePreset) => {
    setPending((prev) => {
      if (prev.nodeSubtypes.some((s) => s.key === preset.key)) return prev;
      return { ...prev, nodeSubtypes: [...prev.nodeSubtypes, preset] };
    });
    setShowAddForm(false);
  }, [setPending]);

  const handleEdit = useCallback((preset: NodeSubtypePreset) => {
    setPending((prev) => ({
      ...prev,
      nodeSubtypes: prev.nodeSubtypes.map((s) => (s.key === preset.key ? preset : s)),
    }));
    setEditingKey(null);
  }, [setPending]);

  const handleDelete = useCallback((key: string) => {
    setPending((prev) => ({
      ...prev,
      nodeSubtypes: prev.nodeSubtypes.filter((s) => s.key !== key),
    }));
  }, [setPending]);

  const handleReset = useCallback(() => {
    setPending((prev) => ({ ...prev, nodeSubtypes: [...DEFAULT_NODE_SUBTYPES] }));
  }, [setPending]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-text-tertiary">{subtypes.length} subtypes</div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleReset}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setShowAddForm(true); setEditingKey(null); }} data-testid="inv-add-subtype-btn">
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      {showAddForm && (
        <div className="mb-3">
          <InlineSubtypeForm onSave={handleAdd} onCancel={() => setShowAddForm(false)} />
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs" data-testid="subtype-table">
          <thead className="bg-tertiary/50 border-b border-border">
            <tr>
              <SortableHeader label="Label" sortKey="label" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Type" sortKey="nodeType" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Small</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Medium</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Large</th>
              <th className="w-20 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((st) => (
              <React.Fragment key={st.key}>
                {editingKey === st.key ? (
                  <tr>
                    <td colSpan={6} className="p-2">
                      <InlineSubtypeForm initial={st} onSave={handleEdit} onCancel={() => setEditingKey(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr className="border-border/50 hover:bg-tertiary/30 border-b" data-testid={`inv-subtype-row-${st.key}`}>
                    <td className="px-3 py-2 font-medium text-text-primary">{st.label}</td>
                    <td className="px-3 py-2 capitalize text-text-secondary">{st.nodeType}</td>
                    {(['small', 'medium', 'large'] as NodeSizeFlavor[]).map((size) => {
                      const cfg = st.sizes[size];
                      return (
                        <td key={size} className="px-3 py-2 text-text-secondary">
                          {cfg.bwPorts + cfg.dwdmPorts}p
                          {cfg.switchingCapacity > 0 && ` / ${cfg.switchingCapacity}G`}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditingKey(st.key); setShowAddForm(false); }} className="hover:bg-accent/10 rounded p-0.5 text-text-muted hover:text-accent" title="Edit">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => handleDelete(st.key)} className="hover:bg-danger/10 rounded p-0.5 text-text-muted hover:text-danger" title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  No subtypes configured. Click Add to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// INVENTORY IMPORT/EXPORT SCHEMA & VALIDATION
// ============================================================================

const INVENTORY_EXPORT_VERSION = 1;
const INVENTORY_EXPORT_TYPE = 'atlas-inventory-export';
const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface InventoryExportSchema {
  version: number;
  type: string;
  exportedAt: string;
  transceivers: TransceiverType[];
  cards: CardDefinition[];
  nodeSubtypes: NodeSubtypePreset[];
}

interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data?: InventoryExportSchema;
}

/**
 * Strip prototype pollution keys recursively from parsed JSON
 */
function sanitizeObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    cleaned[key] = sanitizeObject(value);
  }
  return cleaned;
}

/**
 * Validate imported inventory JSON against expected schema
 */
export function validateInventoryImport(raw: unknown): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Invalid JSON: expected an object'], warnings };
  }

  const obj = raw as Record<string, unknown>;

  // Type check
  if (obj.type !== INVENTORY_EXPORT_TYPE) {
    errors.push(`Invalid export type: expected "${INVENTORY_EXPORT_TYPE}", got "${String(obj.type || '(missing)')}"`);
  }

  // Version check
  if (typeof obj.version !== 'number' || obj.version < 1) {
    errors.push(`Invalid version: expected a positive number, got "${String(obj.version || '(missing)')}"`);
  }

  // Validate transceivers array
  if (obj.transceivers !== undefined) {
    if (!Array.isArray(obj.transceivers)) {
      errors.push('Invalid transceivers: expected an array');
    } else {
      (obj.transceivers as unknown[]).forEach((t, i) => {
        if (!t || typeof t !== 'object') {
          errors.push(`Transceiver [${i}]: invalid object`);
          return;
        }
        const tc = t as Record<string, unknown>;
        if (!tc.id || typeof tc.id !== 'string') errors.push(`Transceiver [${i}]: missing or invalid 'id'`);
        if (!tc.name || typeof tc.name !== 'string') errors.push(`Transceiver [${i}]: missing or invalid 'name'`);
      });
    }
  }

  // Validate cards array
  if (obj.cards !== undefined) {
    if (!Array.isArray(obj.cards)) {
      errors.push('Invalid cards: expected an array');
    } else {
      (obj.cards as unknown[]).forEach((c, i) => {
        if (!c || typeof c !== 'object') {
          errors.push(`Card [${i}]: invalid object`);
          return;
        }
        const cd = c as Record<string, unknown>;
        if (!cd.id || typeof cd.id !== 'string') errors.push(`Card [${i}]: missing or invalid 'id'`);
        if (!cd.name || typeof cd.name !== 'string') errors.push(`Card [${i}]: missing or invalid 'name'`);
        if (!cd.nodeType || typeof cd.nodeType !== 'string') errors.push(`Card [${i}]: missing or invalid 'nodeType'`);
      });
    }
  }

  // Validate nodeSubtypes array
  if (obj.nodeSubtypes !== undefined) {
    if (!Array.isArray(obj.nodeSubtypes)) {
      errors.push('Invalid nodeSubtypes: expected an array');
    } else {
      (obj.nodeSubtypes as unknown[]).forEach((s, i) => {
        if (!s || typeof s !== 'object') {
          errors.push(`NodeSubtype [${i}]: invalid object`);
          return;
        }
        const st = s as Record<string, unknown>;
        if (!st.key || typeof st.key !== 'string') errors.push(`NodeSubtype [${i}]: missing or invalid 'key'`);
        if (!st.label || typeof st.label !== 'string') errors.push(`NodeSubtype [${i}]: missing or invalid 'label'`);
      });
    }
  }

  // Check for at least one content section
  if (!obj.transceivers && !obj.cards && !obj.nodeSubtypes) {
    warnings.push('Import contains no inventory data (no transceivers, cards, or nodeSubtypes)');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return {
    valid: true,
    errors,
    warnings,
    data: sanitizeObject(obj) as InventoryExportSchema,
  };
}

/**
 * Build the export JSON from pending state
 */
export function buildInventoryExport(pending: AppSettings): InventoryExportSchema {
  return {
    version: INVENTORY_EXPORT_VERSION,
    type: INVENTORY_EXPORT_TYPE,
    exportedAt: new Date().toISOString(),
    transceivers: pending.transceiverLibrary || [],
    cards: pending.cardLibrary || [],
    nodeSubtypes: pending.nodeSubtypes,
  };
}

// ============================================================================
// IMPORT PREVIEW PANEL
// ============================================================================

interface ImportPreview {
  data: InventoryExportSchema;
  warnings: string[];
  duplicateTransceivers: string[];
  duplicateCards: string[];
  duplicateSubtypes: string[];
}

const ImportPreviewPanel: React.FC<{
  preview: ImportPreview;
  onApply: () => void;
  onCancel: () => void;
}> = ({ preview, onApply, onCancel }) => {
  const { data, warnings, duplicateTransceivers, duplicateCards, duplicateSubtypes } = preview;
  const hasDuplicates = duplicateTransceivers.length > 0 || duplicateCards.length > 0 || duplicateSubtypes.length > 0;

  return (
    <div className="border-accent/30 bg-accent/5 space-y-3 rounded-lg border p-3" data-testid="import-preview-panel">
      <div className="flex items-center gap-2 text-xs font-semibold text-accent">
        <FileCheck className="h-4 w-4" />
        Import Preview
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-tertiary px-2 py-1.5 text-center">
          <div className="font-bold text-text-primary">{data.transceivers.length}</div>
          <div className="text-text-tertiary">Transceivers</div>
        </div>
        <div className="rounded bg-tertiary px-2 py-1.5 text-center">
          <div className="font-bold text-text-primary">{data.cards.length}</div>
          <div className="text-text-tertiary">Cards</div>
        </div>
        <div className="rounded bg-tertiary px-2 py-1.5 text-center">
          <div className="font-bold text-text-primary">{data.nodeSubtypes.length}</div>
          <div className="text-text-tertiary">Subtypes</div>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Duplicate detection */}
      {hasDuplicates && (
        <div className="border-warning/30 bg-warning/5 rounded border p-2 text-xs">
          <div className="mb-1 font-semibold text-warning">Duplicate IDs detected (will replace existing):</div>
          {duplicateTransceivers.length > 0 && (
            <div className="text-text-secondary">Transceivers: {duplicateTransceivers.join(', ')}</div>
          )}
          {duplicateCards.length > 0 && (
            <div className="text-text-secondary">Cards: {duplicateCards.join(', ')}</div>
          )}
          {duplicateSubtypes.length > 0 && (
            <div className="text-text-secondary">Subtypes: {duplicateSubtypes.join(', ')}</div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">Cancel</Button>
        <Button size="sm" onClick={onApply} className="h-7 text-xs" data-testid="import-apply-btn">
          Apply Import
        </Button>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN INVENTORY SECTION
// ============================================================================

const SUB_TABS: { id: InventorySubTab; label: string }[] = [
  { id: 'transceivers', label: 'Transceivers' },
  { id: 'cards', label: 'Cards' },
  { id: 'subtypes', label: 'Node Subtypes' },
];

export const InventorySection: React.FC<SectionProps> = ({ pending, setPending }) => {
  const [activeSubTab, setActiveSubTab] = useState<InventorySubTab>('transceivers');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Export handler
  const handleExport = useCallback(() => {
    const exportData = buildInventoryExport(pending);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atlas-inventory.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [pending]);

  // Import file handler
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // File size check
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      setImportError(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max 5 MB)`);
      setImportPreview(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const sanitized = sanitizeObject(parsed);
        const validation = validateInventoryImport(sanitized);

        if (!validation.valid) {
          setImportError(validation.errors.join('; '));
          setImportPreview(null);
          return;
        }

        const data = validation.data!;

        // Detect duplicates against current pending state
        const existingTransceiverIds = new Set((pending.transceiverLibrary || []).map((t) => t.id));
        const existingCardIds = new Set((pending.cardLibrary || []).map((c) => c.id));
        const existingSubtypeKeys = new Set(pending.nodeSubtypes.map((s) => s.key));

        const duplicateTransceivers = data.transceivers.filter((t) => existingTransceiverIds.has(t.id)).map((t) => t.id);
        const duplicateCards = data.cards.filter((c) => existingCardIds.has(c.id)).map((c) => c.id);
        const duplicateSubtypes = data.nodeSubtypes.filter((s) => existingSubtypeKeys.has(s.key)).map((s) => s.key);

        setImportPreview({
          data,
          warnings: validation.warnings,
          duplicateTransceivers,
          duplicateCards,
          duplicateSubtypes,
        });
        setImportError(null);
      } catch {
        setImportError('Failed to parse JSON file');
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
  }, [pending]);

  // Apply import — merge into pending state (duplicates replaced)
  const handleApplyImport = useCallback(() => {
    if (!importPreview) return;
    const { data } = importPreview;

    setPending((prev) => {
      const next = { ...prev };

      // Merge transceivers: replace duplicates, add new
      if (data.transceivers.length > 0) {
        const existingMap = new Map((prev.transceiverLibrary || []).map((t) => [t.id, t]));
        data.transceivers.forEach((t) => existingMap.set(t.id, t));
        next.transceiverLibrary = Array.from(existingMap.values());
      }

      // Merge cards: replace duplicates, add new
      if (data.cards.length > 0) {
        const existingMap = new Map((prev.cardLibrary || []).map((c) => [c.id, c]));
        data.cards.forEach((c) => existingMap.set(c.id, c));
        next.cardLibrary = Array.from(existingMap.values());
      }

      // Merge subtypes: replace duplicates, add new
      if (data.nodeSubtypes.length > 0) {
        const existingMap = new Map(prev.nodeSubtypes.map((s) => [s.key, s]));
        data.nodeSubtypes.forEach((s) => existingMap.set(s.key, s));
        next.nodeSubtypes = Array.from(existingMap.values());
      }

      return next;
    });

    setImportPreview(null);
    setImportError(null);
  }, [importPreview, setPending]);

  return (
    <div className="space-y-4" data-testid="inventory-section">
      {/* Header with Import/Export */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-text-secondary">
          Manage your transceiver, card, and node subtype libraries.
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} data-testid="inventory-import-btn">
            <Upload className="mr-1.5 h-3 w-3" /> Import
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleExport} data-testid="inventory-export-btn">
            <Download className="mr-1.5 h-3 w-3" /> Export
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
            data-testid="inventory-import-input"
          />
        </div>
      </div>

      {/* Import error */}
      {importError && (
        <div className="border-danger/30 bg-danger/5 flex items-start gap-2 rounded-md border p-2 text-xs text-danger" data-testid="import-error">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {importError}
          <button onClick={() => setImportError(null)} className="ml-auto shrink-0 text-text-muted hover:text-danger">&times;</button>
        </div>
      )}

      {/* Import preview */}
      {importPreview && (
        <ImportPreviewPanel
          preview={importPreview}
          onApply={handleApplyImport}
          onCancel={() => { setImportPreview(null); setImportError(null); }}
        />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-tertiary/50 rounded-lg border border-border p-3 text-center">
          <div className="text-2xl font-bold text-text-primary">{(pending.transceiverLibrary || []).length}</div>
          <div className="text-xs text-text-tertiary">Transceivers</div>
        </div>
        <div className="bg-tertiary/50 rounded-lg border border-border p-3 text-center">
          <div className="text-2xl font-bold text-text-primary">{(pending.cardLibrary || []).length}</div>
          <div className="text-xs text-text-tertiary">Cards</div>
        </div>
        <div className="bg-tertiary/50 rounded-lg border border-border p-3 text-center">
          <div className="text-2xl font-bold text-text-primary">{pending.nodeSubtypes.length}</div>
          <div className="text-xs text-text-tertiary">Node Subtypes</div>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b border-border">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            data-testid={`inventory-subtab-${tab.id}`}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              activeSubTab === tab.id
                ? 'border-b-2 border-accent text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            )}
            onClick={() => setActiveSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'transceivers' && <TransceiverTable pending={pending} setPending={setPending} />}
      {activeSubTab === 'cards' && <CardTable pending={pending} setPending={setPending} />}
      {activeSubTab === 'subtypes' && <SubtypeTable pending={pending} setPending={setPending} />}
    </div>
  );
};
