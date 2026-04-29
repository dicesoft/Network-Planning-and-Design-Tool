import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { InventorySection } from './InventorySection';
import {
  useSettingsStore,
  selectActiveTab,
} from '@/stores/settingsStore';
import { useUIStore } from '@/stores/uiStore';
import type {
  AppSettings,
  SettingsTab,
  NodeSubtypePreset,
  NodeSizeFlavor,
  NodeSizeConfig,
  OpticalSettings,
} from '@/types/settings';
import {
  DEFAULT_SETTINGS,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_CANVAS_SETTINGS,
  DEFAULT_NETWORK_SETTINGS,
  DEFAULT_SIMULATION_SETTINGS,
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_NODE_SUBTYPES,
  DEFAULT_OPTICAL_SETTINGS,
} from '@/types/settings';
import type { NodeType } from '@/types';
import { VENDOR_CONFIGS, VendorType } from '@/types';
import {
  Settings,
  Grid3x3,
  Network,
  Activity,
  Wrench,
  Radio,
  Upload,
  Download,
  RotateCcw,
  Trash2,
  Plus,
  Pencil,
  AlertTriangle,
  ChevronRight,
  Package,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

/** Describes a single changed setting for the summary panel */
interface SettingChange {
  section: string;
  label: string;
  oldValue: string;
  newValue: string;
}

/** Props shared by all section components — they edit pending state, not the store */
interface SectionProps {
  pending: AppSettings;
  setPending: React.Dispatch<React.SetStateAction<AppSettings>>;
}

// ============================================================================
// TAB CONFIGURATION
// ============================================================================

interface TabGroupDef {
  category: string;
  tabs: { id: SettingsTab; label: string; icon: React.ElementType }[];
}

const SETTINGS_TAB_GROUPS: TabGroupDef[] = [
  {
    category: 'PREFERENCES',
    tabs: [
      { id: 'general', label: 'General', icon: Settings },
      { id: 'canvas', label: 'Canvas', icon: Grid3x3 },
      { id: 'network', label: 'Network', icon: Network },
      { id: 'optical', label: 'Optical', icon: Radio },
    ],
  },
  {
    category: 'SYSTEM',
    tabs: [
      { id: 'simulation', label: 'Simulation', icon: Activity },
      { id: 'advanced', label: 'Advanced', icon: Wrench },
    ],
  },
  {
    category: 'HARDWARE',
    tabs: [
      { id: 'inventory', label: 'Inventory', icon: Package },
    ],
  },
];

// ============================================================================
// CHANGE DETECTION UTILITIES
// ============================================================================

function fmt(v: unknown): string {
  if (v === undefined || v === null) return '(none)';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  return String(v);
}

function detectChanges(current: AppSettings, pending: AppSettings): SettingChange[] {
  const changes: SettingChange[] = [];

  // General
  const g1 = current.general, g2 = pending.general;
  if (g1.autoSave !== g2.autoSave) changes.push({ section: 'General', label: 'Auto-save', oldValue: fmt(g1.autoSave), newValue: fmt(g2.autoSave) });
  if (g1.distanceUnit !== g2.distanceUnit) changes.push({ section: 'General', label: 'Distance unit', oldValue: g1.distanceUnit, newValue: g2.distanceUnit });
  if (g1.confirmDestructiveActions !== g2.confirmDestructiveActions) changes.push({ section: 'General', label: 'Confirm destructive actions', oldValue: fmt(g1.confirmDestructiveActions), newValue: fmt(g2.confirmDestructiveActions) });
  if (g1.showRoadmap !== g2.showRoadmap) changes.push({ section: 'General', label: 'Show roadmap', oldValue: fmt(g1.showRoadmap), newValue: fmt(g2.showRoadmap) });

  // Canvas
  const c1 = current.canvas, c2 = pending.canvas;
  if (c1.gridVisible !== c2.gridVisible) changes.push({ section: 'Canvas', label: 'Show grid', oldValue: fmt(c1.gridVisible), newValue: fmt(c2.gridVisible) });
  if (c1.gridSize !== c2.gridSize) changes.push({ section: 'Canvas', label: 'Grid size', oldValue: `${c1.gridSize}px`, newValue: `${c2.gridSize}px` });
  if (c1.snapToGrid !== c2.snapToGrid) changes.push({ section: 'Canvas', label: 'Snap to grid', oldValue: fmt(c1.snapToGrid), newValue: fmt(c2.snapToGrid) });
  if (c1.defaultNodeType !== c2.defaultNodeType) changes.push({ section: 'Canvas', label: 'Default node type', oldValue: c1.defaultNodeType, newValue: c2.defaultNodeType });
  if (c1.showMinimap !== c2.showMinimap) changes.push({ section: 'Canvas', label: 'Show minimap', oldValue: fmt(c1.showMinimap), newValue: fmt(c2.showMinimap) });
  if (c1.defaultNodeNamePattern !== c2.defaultNodeNamePattern) changes.push({ section: 'Canvas', label: 'Default node name', oldValue: c1.defaultNodeNamePattern, newValue: c2.defaultNodeNamePattern });

  // Network
  const n1 = current.network, n2 = pending.network;
  if (n1.defaultFiberProfile !== n2.defaultFiberProfile) changes.push({ section: 'Network', label: 'Default fiber profile', oldValue: n1.defaultFiberProfile, newValue: n2.defaultFiberProfile });
  if (n1.defaultEdgeDistance !== n2.defaultEdgeDistance) changes.push({ section: 'Network', label: 'Default edge distance', oldValue: `${n1.defaultEdgeDistance} km`, newValue: `${n2.defaultEdgeDistance} km` });
  if (n1.maxDWDMChannels !== n2.maxDWDMChannels) changes.push({ section: 'Network', label: 'Max DWDM channels', oldValue: String(n1.maxDWDMChannels), newValue: String(n2.maxDWDMChannels) });
  if (n1.defaultVendor !== n2.defaultVendor) changes.push({ section: 'Network', label: 'Default vendor', oldValue: n1.defaultVendor, newValue: n2.defaultVendor });
  if (n1.defaultNodeSubtype !== n2.defaultNodeSubtype) changes.push({ section: 'Network', label: 'Default node subtype', oldValue: n1.defaultNodeSubtype || '(none)', newValue: n2.defaultNodeSubtype || '(none)' });

  // Simulation
  const s1 = current.simulation, s2 = pending.simulation;
  if (s1.defaultMaxEdgeFailures !== s2.defaultMaxEdgeFailures) changes.push({ section: 'Simulation', label: 'Max edge failures', oldValue: String(s1.defaultMaxEdgeFailures), newValue: String(s2.defaultMaxEdgeFailures) });
  if (s1.defaultMaxNodeFailures !== s2.defaultMaxNodeFailures) changes.push({ section: 'Simulation', label: 'Max node failures', oldValue: String(s1.defaultMaxNodeFailures), newValue: String(s2.defaultMaxNodeFailures) });
  if (s1.maxScenariosWarningThreshold !== s2.maxScenariosWarningThreshold) changes.push({ section: 'Simulation', label: 'Scenario warning threshold', oldValue: String(s1.maxScenariosWarningThreshold), newValue: String(s2.maxScenariosWarningThreshold) });

  // Advanced
  const a1 = current.advanced, a2 = pending.advanced;
  if (a1.showDebugPanel !== a2.showDebugPanel) changes.push({ section: 'Advanced', label: 'Show debug panel', oldValue: fmt(a1.showDebugPanel), newValue: fmt(a2.showDebugPanel) });
  if (a1.crossTabSync !== a2.crossTabSync) changes.push({ section: 'Advanced', label: 'Cross-tab sync', oldValue: fmt(a1.crossTabSync), newValue: fmt(a2.crossTabSync) });
  if (a1.historyLimit !== a2.historyLimit) changes.push({ section: 'Advanced', label: 'History limit', oldValue: String(a1.historyLimit), newValue: String(a2.historyLimit) });

  // Optical
  const o1 = current.optical || DEFAULT_OPTICAL_SETTINGS;
  const o2 = pending.optical || DEFAULT_OPTICAL_SETTINGS;
  if (o1.defaultEoLMargin !== o2.defaultEoLMargin) changes.push({ section: 'Optical', label: 'EoL Margin', oldValue: `${o1.defaultEoLMargin} dB`, newValue: `${o2.defaultEoLMargin} dB` });
  if (o1.defaultLaunchPower !== o2.defaultLaunchPower) changes.push({ section: 'Optical', label: 'Launch Power', oldValue: `${o1.defaultLaunchPower} dBm`, newValue: `${o2.defaultLaunchPower} dBm` });
  if (o1.defaultNF !== o2.defaultNF) changes.push({ section: 'Optical', label: 'Noise Figure', oldValue: `${o1.defaultNF} dB`, newValue: `${o2.defaultNF} dB` });
  if (o1.defaultConnectorLoss !== o2.defaultConnectorLoss) changes.push({ section: 'Optical', label: 'Connector Loss', oldValue: `${o1.defaultConnectorLoss} dB`, newValue: `${o2.defaultConnectorLoss} dB` });

  // Node subtypes: compare by serialized keys
  const st1 = JSON.stringify(current.nodeSubtypes.map((s) => s.key).sort());
  const st2 = JSON.stringify(pending.nodeSubtypes.map((s) => s.key).sort());
  if (st1 !== st2) {
    changes.push({ section: 'Network', label: 'Node subtypes', oldValue: `${current.nodeSubtypes.length} presets`, newValue: `${pending.nodeSubtypes.length} presets` });
  } else {
    // Check if any subtype content changed
    const subtypesChanged = current.nodeSubtypes.some((s1Entry) => {
      const s2Entry = pending.nodeSubtypes.find((s) => s.key === s1Entry.key);
      return JSON.stringify(s1Entry) !== JSON.stringify(s2Entry);
    });
    if (subtypesChanged) {
      changes.push({ section: 'Network', label: 'Node subtype configs', oldValue: 'modified', newValue: 'updated' });
    }
  }

  // Transceiver library
  const tl1 = JSON.stringify((current.transceiverLibrary || []).map((t) => t.id).sort());
  const tl2 = JSON.stringify((pending.transceiverLibrary || []).map((t) => t.id).sort());
  if (tl1 !== tl2) {
    changes.push({ section: 'Inventory', label: 'Transceiver library', oldValue: `${(current.transceiverLibrary || []).length} items`, newValue: `${(pending.transceiverLibrary || []).length} items` });
  } else if (JSON.stringify(current.transceiverLibrary) !== JSON.stringify(pending.transceiverLibrary)) {
    changes.push({ section: 'Inventory', label: 'Transceiver library', oldValue: 'modified', newValue: 'updated' });
  }

  // Card library
  const cl1 = JSON.stringify((current.cardLibrary || []).map((c) => c.id).sort());
  const cl2 = JSON.stringify((pending.cardLibrary || []).map((c) => c.id).sort());
  if (cl1 !== cl2) {
    changes.push({ section: 'Inventory', label: 'Card library', oldValue: `${(current.cardLibrary || []).length} items`, newValue: `${(pending.cardLibrary || []).length} items` });
  } else if (JSON.stringify(current.cardLibrary) !== JSON.stringify(pending.cardLibrary)) {
    changes.push({ section: 'Inventory', label: 'Card library', oldValue: 'modified', newValue: 'updated' });
  }

  return changes;
}

// ============================================================================
// DEEP CLONE UTILITY
// ============================================================================

function cloneSettings(settings: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(settings));
}

// ============================================================================
// SECTION COMPONENTS (use pending state)
// ============================================================================

const SettingRow: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-text-primary">{label}</div>
      {description && (
        <div className="mt-0.5 text-xs text-text-tertiary">{description}</div>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

// ============================================================================
// GENERAL SECTION
// ============================================================================

const GeneralSection: React.FC<SectionProps> = ({ pending, setPending }) => {
  const general = pending.general;

  const update = (updates: Partial<typeof general>) => {
    setPending((prev) => ({
      ...prev,
      general: { ...prev.general, ...updates },
    }));
  };

  return (
    <div>
      <SettingRow label="Auto-save" description="Automatically save topology to browser storage">
        <Checkbox
          checked={general.autoSave}
          onCheckedChange={(checked) => update({ autoSave: checked === true })}
        />
      </SettingRow>
      <SettingRow label="Distance unit" description="Unit for displaying distances">
        <Select value={general.distanceUnit} onValueChange={(value) => update({ distanceUnit: value as 'km' | 'mi' })}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="km">km</SelectItem>
            <SelectItem value="mi">mi</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow label="Confirm destructive actions" description="Show confirmation dialogs before deleting elements">
        <Checkbox
          checked={general.confirmDestructiveActions}
          onCheckedChange={(checked) => update({ confirmDestructiveActions: checked === true })}
        />
      </SettingRow>
      <SettingRow label="Show roadmap" description="Reveal upcoming features marked Coming Soon (vendor adapters, OLT/ONT, future reports)">
        <Checkbox
          data-testid="settings-show-roadmap"
          checked={general.showRoadmap}
          onCheckedChange={(checked) => update({ showRoadmap: checked === true })}
        />
      </SettingRow>
    </div>
  );
};

// ============================================================================
// CANVAS SECTION
// ============================================================================

const CanvasSection: React.FC<SectionProps> = ({ pending, setPending }) => {
  const canvas = pending.canvas;

  const update = (updates: Partial<typeof canvas>) => {
    setPending((prev) => ({
      ...prev,
      canvas: { ...prev.canvas, ...updates },
    }));
  };

  return (
    <div>
      <SettingRow label="Show grid" description="Display grid lines on the canvas">
        <Checkbox checked={canvas.gridVisible} onCheckedChange={(checked) => update({ gridVisible: checked === true })} />
      </SettingRow>
      <SettingRow label="Grid size" description="Spacing between grid lines in pixels">
        <Select value={String(canvas.gridSize)} onValueChange={(value) => update({ gridSize: Number(value) as 20 | 40 | 80 })}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20px</SelectItem>
            <SelectItem value="40">40px</SelectItem>
            <SelectItem value="80">80px</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow label="Snap to grid" description="Align node positions to grid when moving">
        <Checkbox checked={canvas.snapToGrid} onCheckedChange={(checked) => update({ snapToGrid: checked === true })} />
      </SettingRow>
      <SettingRow label="Default node type" description="Node type created on double-click">
        <Select value={canvas.defaultNodeType} onValueChange={(value) => update({ defaultNodeType: value as typeof canvas.defaultNodeType })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="router">Router</SelectItem>
            <SelectItem value="switch">Switch</SelectItem>
            <SelectItem value="oadm">OADM</SelectItem>
            <SelectItem value="amplifier">Amplifier</SelectItem>
            <SelectItem value="terminal">Terminal</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow label="Show minimap" description="Display minimap overlay in the corner">
        <Checkbox checked={canvas.showMinimap} onCheckedChange={(checked) => update({ showMinimap: checked === true })} />
      </SettingRow>
      <SettingRow label="Default node name" description="Pattern for new node names ({type} = type, {n} = number)">
        <Input
          className="w-36 text-right"
          value={canvas.defaultNodeNamePattern}
          onChange={(e) => update({ defaultNodeNamePattern: e.target.value })}
          placeholder="{type}-{n}"
          data-testid="default-node-name-pattern"
        />
      </SettingRow>
    </div>
  );
};

// ============================================================================
// NETWORK SECTION
// ============================================================================

const vendors: VendorType[] = ['nokia', 'huawei', 'cisco', 'juniper', 'ciena', 'generic'];

const SUBTYPE_PARENT_TYPES: { value: NodeType; label: string }[] = [
  { value: 'router', label: 'Router' },
  { value: 'switch', label: 'Switch' },
  { value: 'oadm', label: 'OADM' },
  { value: 'amplifier', label: 'Amplifier' },
  { value: 'terminal', label: 'Terminal' },
];

const defaultSizeConfig: NodeSizeConfig = { bwPorts: 4, dwdmPorts: 2, switchingCapacity: 100 };

const SubtypeForm: React.FC<{
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
        {initial ? 'Edit Subtype' : 'Add Custom Subtype'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-text-secondary">Label</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g., Metro Router" className="h-8 text-xs" data-testid="subtype-form-label" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary">Parent Type</label>
          <Select value={nodeType} onValueChange={(v) => setNodeType(v as NodeType)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUBTYPE_PARENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-4 gap-1 text-[10px] font-medium text-text-tertiary">
          <span>Size</span><span>BW Ports</span><span>DWDM Ports</span><span>Switching (Gbps)</span>
        </div>
        {(['small', 'medium', 'large'] as NodeSizeFlavor[]).map((size) => (
          <div key={size} className="grid grid-cols-4 items-center gap-1">
            <span className="text-xs font-medium capitalize text-text-secondary">{size}</span>
            <Input type="number" min={0} max={96} className="h-7 text-xs" value={sizes[size].bwPorts} onChange={(e) => updateSize(size, 'bwPorts', Math.max(0, parseInt(e.target.value) || 0))} />
            <Input type="number" min={0} max={48} className="h-7 text-xs" value={sizes[size].dwdmPorts} onChange={(e) => updateSize(size, 'dwdmPorts', Math.max(0, parseInt(e.target.value) || 0))} />
            <Input type="number" min={0} className="h-7 text-xs" value={sizes[size].switchingCapacity} onChange={(e) => updateSize(size, 'switchingCapacity', Math.max(0, parseInt(e.target.value) || 0))} />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={!label} className="h-7 text-xs" data-testid="subtype-form-save">
          {initial ? 'Update' : 'Add'}
        </Button>
      </div>
    </div>
  );
};

const NetworkSection: React.FC<SectionProps> = ({ pending, setPending }) => {
  const network = pending.network;
  const allSubtypes = pending.nodeSubtypes;
  const addToast = useUIStore((s) => s.addToast);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const updateNetwork = (updates: Partial<typeof network>) => {
    setPending((prev) => ({ ...prev, network: { ...prev.network, ...updates } }));
  };

  const subtypesByType = allSubtypes.reduce<Record<string, NodeSubtypePreset[]>>((acc, st) => {
    if (!acc[st.nodeType]) acc[st.nodeType] = [];
    acc[st.nodeType].push(st);
    return acc;
  }, {});

  const handleAddSubtype = (preset: NodeSubtypePreset) => {
    setPending((prev) => {
      const exists = prev.nodeSubtypes.some((s) => s.key === preset.key);
      if (exists) return prev;
      return { ...prev, nodeSubtypes: [...prev.nodeSubtypes, preset] };
    });
    setShowAddForm(false);
    addToast({ type: 'success', title: 'Subtype added (pending)', message: preset.label });
  };

  const handleEditSubtype = (preset: NodeSubtypePreset) => {
    setPending((prev) => ({
      ...prev,
      nodeSubtypes: prev.nodeSubtypes.map((s) => (s.key === preset.key ? preset : s)),
    }));
    setEditingKey(null);
  };

  const handleDeleteSubtype = (key: string) => {
    setPending((prev) => ({
      ...prev,
      nodeSubtypes: prev.nodeSubtypes.filter((s) => s.key !== key),
    }));
  };

  const handleResetSubtypes = () => {
    setPending((prev) => ({
      ...prev,
      nodeSubtypes: [...DEFAULT_NODE_SUBTYPES],
    }));
  };

  return (
    <div>
      <SettingRow label="Default fiber profile" description="ITU-T fiber profile for new edges">
        <Select value={network.defaultFiberProfile} onValueChange={(value) => updateNetwork({ defaultFiberProfile: value as typeof network.defaultFiberProfile })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="G.652.D">G.652.D</SelectItem>
            <SelectItem value="G.654.E">G.654.E</SelectItem>
            <SelectItem value="G.655">G.655</SelectItem>
            <SelectItem value="G.657.A1">G.657.A1</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow label="Default edge distance" description="Distance in km for new fiber links">
        <Input
          type="number" min={1} max={10000} className="w-24 text-right"
          value={network.defaultEdgeDistance}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 1 && val <= 10000) updateNetwork({ defaultEdgeDistance: val });
          }}
        />
      </SettingRow>

      <SettingRow label="Max DWDM channels" description="Maximum channels per DWDM port">
        <Input
          type="number" min={1} max={192} className="w-24 text-right"
          value={network.maxDWDMChannels}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 1 && val <= 192) updateNetwork({ maxDWDMChannels: val });
          }}
        />
      </SettingRow>

      <SettingRow label="Default vendor" description="Vendor assigned to new nodes">
        <Select value={network.defaultVendor} onValueChange={(value) => updateNetwork({ defaultVendor: value })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {vendors.map((v) => (
              <SelectItem key={v} value={v}>{VENDOR_CONFIGS[v].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow label="Default node subtype" description="Subtype assigned to new nodes">
        <Select value={network.defaultNodeSubtype || '_none'} onValueChange={(value) => updateNetwork({ defaultNodeSubtype: value === '_none' ? '' : value })}>
          <SelectTrigger className="w-36"><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">None</SelectItem>
            {allSubtypes.map((st) => (
              <SelectItem key={st.key} value={st.key}>{st.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      {/* Node Subtypes Management */}
      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Node Type Presets ({allSubtypes.length})
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleResetSubtypes} title="Reset to defaults">
              <RotateCcw className="mr-1 h-3 w-3" /> Reset
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setShowAddForm(true); setEditingKey(null); }} data-testid="add-subtype-btn">
              <Plus className="mr-1 h-3 w-3" /> Add
            </Button>
          </div>
        </div>

        {showAddForm && (
          <div className="mb-3">
            <SubtypeForm onSave={handleAddSubtype} onCancel={() => setShowAddForm(false)} />
          </div>
        )}

        <div className="space-y-3">
          {Object.entries(subtypesByType).map(([nodeType, presets]) => (
            <div key={nodeType}>
              <div className="mb-1.5 text-xs font-medium capitalize text-text-secondary">{nodeType}</div>
              <div className="space-y-1">
                {presets.map((preset) => (
                  <React.Fragment key={preset.key}>
                    {editingKey === preset.key ? (
                      <SubtypeForm initial={preset} onSave={handleEditSubtype} onCancel={() => setEditingKey(null)} />
                    ) : (
                      <div className="flex items-center justify-between rounded-md bg-tertiary px-3 py-2 text-xs" data-testid={`subtype-row-${preset.key}`}>
                        <div className="font-medium text-text-primary">{preset.label}</div>
                        <div className="flex items-center gap-3 text-text-tertiary">
                          {(['small', 'medium', 'large'] as NodeSizeFlavor[]).map((size) => {
                            const cfg = preset.sizes[size];
                            return (
                              <span key={size} className="whitespace-nowrap">
                                {size[0].toUpperCase()}: {cfg.bwPorts + cfg.dwdmPorts}p
                                {cfg.switchingCapacity > 0 && ` ${cfg.switchingCapacity}G`}
                              </span>
                            );
                          })}
                          <button onClick={() => { setEditingKey(preset.key); setShowAddForm(false); }} className="hover:bg-accent/10 rounded p-0.5 text-text-muted hover:text-accent" title="Edit subtype">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => handleDeleteSubtype(preset.key)} className="hover:bg-danger/10 rounded p-0.5 text-text-muted hover:text-danger" title="Remove subtype">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

// ============================================================================
// OPTICAL SECTION
// ============================================================================

const OpticalSection: React.FC<SectionProps> = ({ pending, setPending }) => {
  const optical: OpticalSettings = pending.optical || { ...DEFAULT_OPTICAL_SETTINGS };

  const updateOptical = (updates: Partial<OpticalSettings>) => {
    setPending((prev) => ({
      ...prev,
      optical: { ...(prev.optical || DEFAULT_OPTICAL_SETTINGS), ...updates },
    }));
  };

  return (
    <div>
      <SettingRow label="End-of-Life Margin" description="Default EoL margin applied to OSNR calculations (dB)">
        <Input type="number" min={0} max={10} step={0.5} className="w-24 text-right"
          value={optical.defaultEoLMargin}
          onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val) && val >= 0 && val <= 10) updateOptical({ defaultEoLMargin: val }); }}
          data-testid="settings-eol-margin" />
      </SettingRow>
      <SettingRow label="Default Launch Power" description="Transmitter launch power for OSNR calculations (dBm)">
        <Input type="number" min={-10} max={10} step={0.5} className="w-24 text-right"
          value={optical.defaultLaunchPower}
          onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val) && val >= -10 && val <= 10) updateOptical({ defaultLaunchPower: val }); }}
          data-testid="settings-launch-power" />
      </SettingRow>
      <SettingRow label="Default Noise Figure" description="Amplifier noise figure for OSNR calculations (dB)">
        <Input type="number" min={3} max={10} step={0.5} className="w-24 text-right"
          value={optical.defaultNF}
          onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val) && val >= 3 && val <= 10) updateOptical({ defaultNF: val }); }}
          data-testid="settings-noise-figure" />
      </SettingRow>
      <SettingRow label="Default Connector Loss" description="Per-connector loss for OSNR calculations (dB)">
        <Input type="number" min={0} max={3} step={0.1} className="w-24 text-right"
          value={optical.defaultConnectorLoss}
          onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val) && val >= 0 && val <= 3) updateOptical({ defaultConnectorLoss: val }); }}
          data-testid="settings-connector-loss" />
      </SettingRow>
    </div>
  );
};

// ============================================================================
// SIMULATION SECTION
// ============================================================================

const SimulationSection: React.FC<SectionProps> = ({ pending, setPending }) => {
  const simulation = pending.simulation;

  const update = (updates: Partial<typeof simulation>) => {
    setPending((prev) => ({ ...prev, simulation: { ...prev.simulation, ...updates } }));
  };

  return (
    <div>
      <SettingRow label="Default max edge failures" description="Exhaustive analysis: simultaneous edge failures">
        <Select value={String(simulation.defaultMaxEdgeFailures)} onValueChange={(value) => update({ defaultMaxEdgeFailures: Number(value) })}>
          <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0</SelectItem>
            <SelectItem value="1">1</SelectItem>
            <SelectItem value="2">2</SelectItem>
            <SelectItem value="3">3</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow label="Default max node failures" description="Exhaustive analysis: simultaneous node failures">
        <Select value={String(simulation.defaultMaxNodeFailures)} onValueChange={(value) => update({ defaultMaxNodeFailures: Number(value) })}>
          <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0</SelectItem>
            <SelectItem value="1">1</SelectItem>
            <SelectItem value="2">2</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow label="Scenario warning threshold" description="Show warning when scenarios exceed this count">
        <Input
          type="number" min={100} max={100000} step={1000} className="w-28 text-right"
          value={simulation.maxScenariosWarningThreshold}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 100 && val <= 100000) update({ maxScenariosWarningThreshold: val });
          }}
        />
      </SettingRow>
    </div>
  );
};

// ============================================================================
// ADVANCED SECTION
// ============================================================================

const AdvancedSection: React.FC<SectionProps> = ({ pending, setPending }) => {
  const advanced = pending.advanced;

  const update = (updates: Partial<typeof advanced>) => {
    setPending((prev) => ({ ...prev, advanced: { ...prev.advanced, ...updates } }));
  };

  return (
    <div>
      <SettingRow label="Show debug panel" description="Display debug navigation in header">
        <Checkbox checked={advanced.showDebugPanel} onCheckedChange={(checked) => update({ showDebugPanel: checked === true })} />
      </SettingRow>
      <SettingRow label="Cross-tab sync" description="Sync changes across browser tabs">
        <Checkbox checked={advanced.crossTabSync} onCheckedChange={(checked) => update({ crossTabSync: checked === true })} />
      </SettingRow>
      <SettingRow label="History limit" description="Maximum undo/redo history entries">
        <Input
          type="number" min={10} max={200} className="w-24 text-right"
          value={advanced.historyLimit}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 10 && val <= 200) update({ historyLimit: val });
          }}
        />
      </SettingRow>
    </div>
  );
};

// ============================================================================
// SETTINGS PREVIEW CARD
// ============================================================================

const SettingsPreviewCard: React.FC<{ pending: AppSettings }> = ({ pending }) => {
  const network = pending.network;
  const allSubtypes = pending.nodeSubtypes;

  const vendorLabel = VENDOR_CONFIGS[(network.defaultVendor || 'generic') as VendorType]?.label || 'Generic';
  const subtypePreset = network.defaultNodeSubtype
    ? allSubtypes.find((s) => s.key === network.defaultNodeSubtype)
    : undefined;
  const subtypeLabel = subtypePreset?.label || 'Default';
  const fiberProfile = network.defaultFiberProfile || 'G.652.D';
  const edgeDistance = network.defaultEdgeDistance || 50;
  const maxChannels = network.maxDWDMChannels || 96;

  return (
    <div className="bg-tertiary/50 rounded-lg border border-border p-3" data-testid="settings-preview-card">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        Next Created Elements
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Node vendor</span>
          <span className="font-medium text-text-primary">{vendorLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Node subtype</span>
          <span className="font-medium text-text-primary">{subtypeLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">DWDM channels</span>
          <span className="font-medium text-text-primary">{maxChannels}ch</span>
        </div>
        <div className="my-1.5 border-t border-border" />
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Edge distance</span>
          <span className="font-medium text-text-primary">{edgeDistance} km</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Fiber profile</span>
          <span className="font-medium text-text-primary">{fiberProfile}</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// CHANGE SUMMARY PANEL
// ============================================================================

const ChangeSummaryPanel: React.FC<{ changes: SettingChange[] }> = ({ changes }) => {
  if (changes.length === 0) return null;

  return (
    <div
      className="border-warning/30 bg-warning/5 rounded-lg border p-3"
      data-testid="settings-changes-summary"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-warning">
        <AlertTriangle className="h-3.5 w-3.5" />
        {changes.length} unsaved change{changes.length !== 1 ? 's' : ''}
      </div>
      <div className="max-h-32 space-y-1 overflow-y-auto">
        {changes.map((change, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="shrink-0 rounded bg-tertiary px-1.5 py-0.5 text-[10px] text-text-tertiary">
              {change.section}
            </span>
            <span className="truncate">{change.label}</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-text-muted" />
            <span className="shrink-0 text-text-muted line-through">{change.oldValue}</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-text-muted" />
            <span className="shrink-0 font-medium text-text-primary">{change.newValue}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// UNSAVED CHANGES CONFIRMATION DIALOG
// ============================================================================

const UnsavedChangesDialog: React.FC<{
  open: boolean;
  onDiscard: () => void;
  onCancel: () => void;
}> = ({ open, onDiscard, onCancel }) => (
  <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
    <DialogContent className="max-w-sm" data-testid="settings-unsaved-dialog" hideClose>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div className="bg-warning/10 rounded-lg p-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <div>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription className="mt-1">
              You have unsaved settings changes. Closing will discard them.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <DialogFooter className="flex-row justify-end gap-2 sm:justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Keep Editing
        </Button>
        <Button variant="destructive" size="sm" onClick={onDiscard} data-testid="settings-discard-confirm-btn">
          Discard Changes
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ============================================================================
// SECTION MAP
// ============================================================================

const SECTION_COMPONENTS: Record<SettingsTab, React.FC<SectionProps>> = {
  general: GeneralSection,
  canvas: CanvasSection,
  network: NetworkSection,
  simulation: SimulationSection,
  advanced: AdvancedSection,
  optical: OpticalSection,
  inventory: InventorySection,
};

// ============================================================================
// MAIN DIALOG
// ============================================================================

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const activeTab = useSettingsStore(selectActiveTab);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const storeSettings = useSettingsStore((s) => s.settings);
  const importSettings = useSettingsStore((s) => s.importSettings);
  const exportSettings = useSettingsStore((s) => s.exportSettings);
  const addToast = useUIStore((s) => s.addToast);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pending state: cloned from store on open
  const [pending, setPending] = useState<AppSettings>(() => cloneSettings(storeSettings));
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Clone store settings into pending state when dialog opens
  useEffect(() => {
    if (open) {
      setPending(cloneSettings(storeSettings));
    }
  }, [open, storeSettings]);

  // Compute changes between store and pending
  const changes = useMemo(() => detectChanges(storeSettings, pending), [storeSettings, pending]);
  const hasChanges = changes.length > 0;

  const ActiveSection = SECTION_COMPONENTS[activeTab];

  // Apply: commit pending -> store atomically
  const handleApply = useCallback(() => {
    // Use importSettings to atomically replace all settings
    const result = importSettings(pending);
    if (result.success) {
      addToast({ type: 'success', title: 'Settings applied', message: `${changes.length} change${changes.length !== 1 ? 's' : ''} saved` });
    } else {
      addToast({ type: 'error', title: 'Failed to apply settings', message: result.error });
    }
  }, [pending, changes.length, importSettings, addToast]);

  // Discard: revert pending to current store values
  const handleDiscard = useCallback(() => {
    setPending(cloneSettings(storeSettings));
    addToast({ type: 'info', title: 'Changes discarded' });
  }, [storeSettings, addToast]);

  // Close: check for unsaved changes
  const handleClose = useCallback((newOpen: boolean) => {
    if (!newOpen && hasChanges) {
      setShowUnsavedDialog(true);
      return;
    }
    onOpenChange(newOpen);
  }, [hasChanges, onOpenChange]);

  // Unsaved dialog: discard and close
  const handleUnsavedDiscard = useCallback(() => {
    setShowUnsavedDialog(false);
    setPending(cloneSettings(storeSettings));
    onOpenChange(false);
  }, [storeSettings, onOpenChange]);

  // Unsaved dialog: cancel (keep editing)
  const handleUnsavedCancel = useCallback(() => {
    setShowUnsavedDialog(false);
  }, []);

  // Export
  const handleExport = useCallback(() => {
    const settings = exportSettings();
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atlas-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    addToast({ type: 'success', title: 'Settings exported' });
  }, [exportSettings, addToast]);

  // Import
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          // Import into pending state, not store directly
          setPending((prev) => ({
            ...DEFAULT_SETTINGS,
            ...prev,
            version: parsed.version ?? prev.version,
            general: { ...DEFAULT_GENERAL_SETTINGS, ...parsed.general },
            canvas: { ...DEFAULT_CANVAS_SETTINGS, ...parsed.canvas },
            network: { ...DEFAULT_NETWORK_SETTINGS, ...parsed.network },
            simulation: { ...DEFAULT_SIMULATION_SETTINGS, ...parsed.simulation },
            advanced: { ...DEFAULT_ADVANCED_SETTINGS, ...parsed.advanced },
            nodeSubtypes: parsed.nodeSubtypes || [...DEFAULT_NODE_SUBTYPES],
            optical: parsed.optical
              ? { ...DEFAULT_OPTICAL_SETTINGS, ...parsed.optical }
              : prev.optical,
            transceiverLibrary: parsed.transceiverLibrary ?? prev.transceiverLibrary,
            cardLibrary: parsed.cardLibrary ?? prev.cardLibrary,
          }));
          addToast({ type: 'info', title: 'Settings imported (pending)', message: 'Click Apply to save' });
        } catch {
          addToast({ type: 'error', title: 'Import failed', message: 'Invalid JSON file' });
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [addToast]
  );

  // Reset current section in pending state
  const handleResetSection = useCallback(() => {
    setPending((prev) => {
      const next = { ...prev };
      switch (activeTab) {
        case 'general': next.general = { ...DEFAULT_GENERAL_SETTINGS }; break;
        case 'canvas': next.canvas = { ...DEFAULT_CANVAS_SETTINGS }; break;
        case 'network': next.network = { ...DEFAULT_NETWORK_SETTINGS }; break;
        case 'simulation': next.simulation = { ...DEFAULT_SIMULATION_SETTINGS }; break;
        case 'advanced': next.advanced = { ...DEFAULT_ADVANCED_SETTINGS }; break;
        case 'optical': next.optical = { ...DEFAULT_OPTICAL_SETTINGS }; break;
        case 'inventory': {
          next.transceiverLibrary = undefined;
          next.cardLibrary = [...DEFAULT_SETTINGS.cardLibrary || []];
          next.nodeSubtypes = [...DEFAULT_NODE_SUBTYPES];
          break;
        }
      }
      return next;
    });
    addToast({ type: 'info', title: `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} settings reset (pending)` });
  }, [activeTab, addToast]);

  // Reset all in pending state
  const handleResetAll = useCallback(() => {
    setPending(cloneSettings(DEFAULT_SETTINGS));
    addToast({ type: 'info', title: 'All settings reset to defaults (pending)' });
  }, [addToast]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="flex max-h-[95vh] max-w-6xl flex-col" data-testid="settings-dialog" hideClose>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Configure application preferences and defaults.
              Changes to defaults affect new objects only.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 gap-6 overflow-hidden px-6 py-4">
            {/* Tab navigation — grouped with category headers */}
            <nav className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto" role="tablist" aria-label="Settings sections">
              {SETTINGS_TAB_GROUPS.map((group, gi) => (
                <div key={group.category} className={cn(gi > 0 && 'mt-3')}>
                  <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {group.category}
                  </div>
                  {group.tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        data-testid={`settings-tab-${tab.id}`}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                          activeTab === tab.id
                            ? 'bg-tertiary text-text-primary'
                            : 'text-text-tertiary hover:bg-tertiary/50 hover:text-text-secondary'
                        )}
                        onClick={() => setActiveTab(tab.id)}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Content area */}
            <div className="min-h-inspector flex-1 overflow-y-auto">
              <ActiveSection pending={pending} setPending={setPending} />
            </div>
          </div>

          {/* Change Summary */}
          <div className="shrink-0 px-6">
            <ChangeSummaryPanel changes={changes} />
          </div>

          {/* Settings Preview */}
          <div className="shrink-0 px-6 pb-2">
            <SettingsPreviewCard pending={pending} />
          </div>

          {/* Defaults warning */}
          <div className="shrink-0 px-6 pb-2">
            <div className="bg-accent/5 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-text-secondary">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-accent" />
              Changes to defaults affect new objects only. Existing nodes and edges are not modified.
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between sm:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleImport}>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
              </Button>
              <Button variant="ghost" size="sm" onClick={handleExport}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export
              </Button>
              <div className="mx-1 h-4 w-px bg-border" />
              <Button variant="ghost" size="sm" onClick={handleResetSection}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset Section
              </Button>
              <Button variant="ghost" size="sm" onClick={handleResetAll}>
                Reset All
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDiscard}
                  data-testid="settings-discard-btn"
                >
                  Discard
                </Button>
              )}
              <Button
                onClick={handleApply}
                disabled={!hasChanges}
                data-testid="settings-apply-btn"
              >
                Apply{hasChanges ? ` (${changes.length})` : ''}
              </Button>
            </div>
          </DialogFooter>

          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
        </DialogContent>
      </Dialog>

      {/* Unsaved changes confirmation */}
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onDiscard={handleUnsavedDiscard}
        onCancel={handleUnsavedCancel}
      />
    </>
  );
};
