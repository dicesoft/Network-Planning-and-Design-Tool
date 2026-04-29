import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, StatusBar } from '@/components/layout';
import {
  Upload,
  Server,
  Network,
  Radio,
  Cable,
  Wrench,
  Globe2,
  FileUp,
  MapPin,
  ArrowRight,
  CheckCircle2,
  FileText,
  Link2,
  TrendingUp,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ImportWizard } from '@/components/import/ImportWizard';
import { FuzzyMatchTester } from '@/components/import/FuzzyMatchTester';
import { useSettingsStore } from '@/stores/settingsStore';

// ============================================================================
// TYPES
// ============================================================================

interface ToolCard {
  id: string;
  name: string;
  vendor: string;
  description: string;
  icon: React.ElementType;
  status: 'coming-soon' | 'available' | 'mockup';
  footerLabel?: string;
  onClick?: () => void;
}

type ImportStep = 'upload' | 'preview' | 'mapping' | 'import';

const IMPORT_STEPS: { id: ImportStep; label: string; icon: React.ElementType }[] = [
  { id: 'upload', label: 'Upload', icon: FileUp },
  { id: 'preview', label: 'Preview', icon: FileText },
  { id: 'mapping', label: 'Mapping', icon: MapPin },
  { id: 'import', label: 'Import', icon: CheckCircle2 },
];

// ============================================================================
// TOOL CARDS DATA
// ============================================================================

const VENDOR_TOOL_CARDS: Omit<ToolCard, 'onClick'>[] = [
  {
    id: 'huawei-nce',
    name: 'Huawei NCE Import',
    vendor: 'Huawei',
    description: 'Import network topology and service data from Huawei Network Cloud Engine (NCE) exports.',
    icon: Network,
    status: 'available',
  },
  {
    id: 'nokia-nsp',
    name: 'Nokia NSP Import',
    vendor: 'Nokia',
    description: 'Import topology, services, and optical configurations from Nokia Network Services Platform.',
    icon: Server,
    status: 'coming-soon',
  },
  {
    id: 'cisco-import',
    name: 'Cisco Import',
    vendor: 'Cisco',
    description: 'Import network inventory and topology from Cisco Prime Infrastructure or Crosswork exports.',
    icon: Radio,
    status: 'coming-soon',
  },
  {
    id: 'ciena-import',
    name: 'Ciena Import',
    vendor: 'Ciena',
    description: 'Import DWDM optical network data from Ciena MCP (Manage, Control, Plan) platform.',
    icon: Cable,
    status: 'coming-soon',
  },
  {
    id: 'juniper-import',
    name: 'Juniper Import',
    vendor: 'Juniper',
    description: 'Import network topology from Juniper Paragon Pathfinder or NorthStar Controller.',
    icon: Wrench,
    status: 'coming-soon',
  },
];

// ============================================================================
// TOOL CARD COMPONENT
// ============================================================================

const ToolCardComponent: React.FC<{ tool: ToolCard }> = ({ tool }) => {
  const Icon = tool.icon;
  const isClickable = tool.status === 'available' || tool.status === 'mockup';

  return (
    <div
      data-testid={`tool-card-${tool.id}`}
      onClick={isClickable ? tool.onClick : undefined}
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-border bg-elevated p-6 transition-all',
        tool.status === 'coming-soon'
          ? 'opacity-75'
          : 'cursor-pointer hover:border-primary/40 hover:shadow-md'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-lg">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        {tool.status === 'coming-soon' && (
          <span className="bg-warning/10 rounded-full px-2.5 py-1 text-xs font-medium text-warning">
            Coming Soon
          </span>
        )}
        {tool.status === 'mockup' && (
          <span className="bg-accent/10 rounded-full px-2.5 py-1 text-xs font-medium text-accent">
            Preview
          </span>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-text-primary">{tool.name}</h3>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          {tool.description}
        </p>
      </div>

      <div className="mt-auto flex items-center gap-2 text-xs text-text-tertiary">
        <Upload className="h-3.5 w-3.5" />
        <span>{tool.footerLabel ?? 'Import Adapter'}</span>
      </div>
    </div>
  );
};

// ============================================================================
// KMZ/GIS IMPORT WIZARD DIALOG
// ============================================================================

const ACCEPTED_EXTENSIONS = '.kmz,.kml,.geojson,.json';

const KmzImportWizard: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [arcgisUrl, setArcgisUrl] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentStepIndex = IMPORT_STEPS.findIndex((s) => s.id === step);

  const handleReset = useCallback(() => {
    setStep('upload');
    setSelectedFile(null);
    setArcgisUrl('');
    setIsDragOver(false);
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  const handleFileSelect = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && ['kmz', 'kml', 'geojson', 'json'].includes(ext)) {
      setSelectedFile(file);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const canAdvance = step === 'upload' && (selectedFile !== null || arcgisUrl.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl" data-testid="kmz-import-wizard">
        <DialogHeader>
          <DialogTitle>KMZ / GIS Import</DialogTitle>
          <DialogDescription>
            Import geographic network data from KMZ, KML, GeoJSON files or ArcGIS services.
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 px-6 py-3">
          {IMPORT_STEPS.map((s, i) => {
            const StepIcon = s.icon;
            const isCurrent = i === currentStepIndex;
            const isCompleted = i < currentStepIndex;
            return (
              <React.Fragment key={s.id}>
                {i > 0 && (
                  <ArrowRight
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      isCompleted ? 'text-success' : 'text-text-muted'
                    )}
                  />
                )}
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    isCurrent && 'bg-primary/10 text-primary',
                    isCompleted && 'bg-success/10 text-success',
                    !isCurrent && !isCompleted && 'text-text-muted'
                  )}
                >
                  <StepIcon className="h-3.5 w-3.5" />
                  <span>{s.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="min-h-[280px] px-6 pb-4">
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Drag & Drop Zone */}
              <div>
                <label className="mb-2 block text-xs font-medium text-text-secondary">
                  File Upload
                </label>
                <div
                  data-testid="kmz-dropzone"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors',
                    isDragOver
                      ? 'border-primary bg-primary/5'
                      : selectedFile
                        ? 'border-success/40 bg-success/5'
                        : 'border-border hover:border-primary/40 hover:bg-tertiary/50'
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    onChange={handleInputChange}
                    className="hidden"
                    data-testid="kmz-file-input"
                  />
                  <FileUp
                    className={cn(
                      'h-8 w-8',
                      selectedFile ? 'text-success' : 'text-text-muted'
                    )}
                  />
                  {selectedFile ? (
                    <div className="text-center">
                      <p className="text-sm font-medium text-text-primary">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-medium text-text-primary">
                        Drop file here or click to browse
                      </p>
                      <p className="text-xs text-text-secondary">
                        Supports .kmz, .kml, .geojson
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ArcGIS URL Input */}
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  <Link2 className="h-3.5 w-3.5" />
                  ArcGIS Feature Service URL
                </label>
                <Input
                  data-testid="arcgis-url-input"
                  placeholder="https://services.arcgis.com/.../FeatureServer/0"
                  value={arcgisUrl}
                  onChange={(e) => setArcgisUrl(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-text-muted">
                  Import features directly from an ArcGIS REST API endpoint.
                </p>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="bg-warning/10 flex h-16 w-16 items-center justify-center rounded-2xl">
                <FileText className="h-8 w-8 text-warning" />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-semibold text-text-primary">
                  File Preview
                </h3>
                <p className="mt-1 max-w-sm text-xs text-text-secondary">
                  Parsed features from {selectedFile?.name ?? 'ArcGIS service'} would
                  appear here. Nodes, edges, and geographic coordinates will be
                  extracted and displayed for review.
                </p>
              </div>
              <span className="bg-warning/10 rounded-full px-3 py-1 text-xs font-medium text-warning">
                Coming Soon
              </span>
            </div>
          )}

          {step === 'mapping' && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="bg-warning/10 flex h-16 w-16 items-center justify-center rounded-2xl">
                <MapPin className="h-8 w-8 text-warning" />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-semibold text-text-primary">
                  Feature Mapping
                </h3>
                <p className="mt-1 max-w-sm text-xs text-text-secondary">
                  Map parsed GIS features to network topology elements. Assign
                  placemarks as nodes and linestrings as edges with type and
                  property mapping.
                </p>
              </div>
              <span className="bg-warning/10 rounded-full px-3 py-1 text-xs font-medium text-warning">
                Coming Soon
              </span>
            </div>
          )}

          {step === 'import' && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="bg-warning/10 flex h-16 w-16 items-center justify-center rounded-2xl">
                <CheckCircle2 className="h-8 w-8 text-warning" />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-semibold text-text-primary">
                  Import Confirmation
                </h3>
                <p className="mt-1 max-w-sm text-xs text-text-secondary">
                  Review the mapped topology and confirm import. Elements will
                  be merged into the current network topology with geographic
                  coordinates preserved.
                </p>
              </div>
              <span className="bg-warning/10 rounded-full px-3 py-1 text-xs font-medium text-warning">
                Coming Soon
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          {step !== 'upload' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const prev = IMPORT_STEPS[currentStepIndex - 1];
                if (prev) setStep(prev.id);
              }}
            >
              Back
            </Button>
          )}
          <Button
            size="sm"
            disabled={!canAdvance && step === 'upload'}
            onClick={() => {
              const next = IMPORT_STEPS[currentStepIndex + 1];
              if (next) setStep(next.id);
            }}
          >
            {step === 'import' ? 'Import' : 'Next'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// TOOLS PAGE
// ============================================================================

export const ToolsPage: React.FC = () => {
  const navigate = useNavigate();
  const [kmzWizardOpen, setKmzWizardOpen] = useState(false);
  const [nceImportOpen, setNceImportOpen] = useState(false);
  const [fuzzyTesterOpen, setFuzzyTesterOpen] = useState(false);
  const showRoadmap = useSettingsStore((s) => s.settings.general.showRoadmap);
  const visibleVendorCards = showRoadmap
    ? VENDOR_TOOL_CARDS
    : VENDOR_TOOL_CARDS.filter((t) => t.status !== 'coming-soon');

  const gisCard: ToolCard = {
    id: 'kmz-gis-import',
    name: 'KMZ / GIS Import',
    vendor: 'GIS',
    description:
      'Import geographic network data from KMZ, KML, GeoJSON files or ArcGIS Feature Services.',
    icon: Globe2,
    status: 'mockup',
    onClick: () => setKmzWizardOpen(true),
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Header />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-elevated px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary" data-testid="tools-page">Tools</h1>
              <p className="text-xs text-text-secondary">
                Import adapters and network management integrations
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl">
            {/* GIS / Geographic Section */}
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-text-primary">Geographic / GIS Import</h2>
              <p className="mt-1 text-xs text-text-secondary">
                Import geographic network data from standard GIS file formats and services.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ToolCardComponent tool={gisCard} />
              </div>
            </div>

            {/* Vendor Import Adapters Section */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-text-primary">Vendor Import Adapters</h2>
              <p className="mt-1 text-xs text-text-secondary">
                Import network topology and service data from vendor NMS/OSS platforms.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleVendorCards.map((tool) => (
                <ToolCardComponent
                  key={tool.id}
                  tool={
                    tool.id === 'huawei-nce'
                      ? { ...tool, onClick: () => setNceImportOpen(true) }
                      : tool
                  }
                />
              ))}
            </div>

            {/* Planning & Analysis Section */}
            <div className="mb-8 mt-8">
              <h2 className="text-sm font-semibold text-text-primary">Planning & Analysis</h2>
              <p className="mt-1 text-xs text-text-secondary">
                Tools for network planning, forecasting, and analysis.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ToolCardComponent
                  tool={{
                    id: 'forecast',
                    name: 'Forecast',
                    vendor: 'Planning',
                    description: 'Forecast network capacity demand and plan upgrades with trend analysis and scenario modeling.',
                    icon: TrendingUp,
                    status: 'available',
                    footerLabel: 'Planning Tool',
                    onClick: () => navigate('/forecast'),
                  }}
                />
              </div>
            </div>

            {/* Utilities Section */}
            <div className="mb-8 mt-8">
              <h2 className="text-sm font-semibold text-text-primary">Utilities</h2>
              <p className="mt-1 text-xs text-text-secondary">
                Tools for debugging and testing import configurations.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ToolCardComponent
                  tool={{
                    id: 'fuzzy-match-tester',
                    name: 'Fuzzy Match Tester',
                    vendor: 'Utility',
                    description: 'Test string similarity and name matching algorithms used during import.',
                    icon: Search,
                    status: 'available',
                    footerLabel: 'Debug Tool',
                    onClick: () => setFuzzyTesterOpen(true),
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KMZ Import Wizard */}
      <KmzImportWizard open={kmzWizardOpen} onClose={() => setKmzWizardOpen(false)} />

      {/* NCE Import Wizard */}
      <ImportWizard open={nceImportOpen} onOpenChange={setNceImportOpen} />

      {/* Fuzzy Match Tester */}
      <FuzzyMatchTester open={fuzzyTesterOpen} onOpenChange={setFuzzyTesterOpen} />

      <StatusBar />
    </div>
  );
};
