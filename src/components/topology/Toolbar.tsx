import React from 'react';
import { useReactFlow } from '@xyflow/react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { useServiceStore } from '@/stores/serviceStore';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  Grid3X3,
  ChevronDown,
  Map,
  LayoutGrid,
  BarChart3,
  Highlighter,
  MousePointer2,
  PlusCircle,
  GitBranch,
  Move,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolMode, TOOL_CONFIGS, NodeDisplayMode } from '@/types';

const TOOL_ICONS: Record<ToolMode, React.ReactNode> = {
  select: <MousePointer2 className="h-4 w-4" />,
  add: <PlusCircle className="h-4 w-4" />,
  connect: <GitBranch className="h-4 w-4" />,
  pan: <Move className="h-4 w-4" />,
};

/**
 * React Flow zoom controls - only rendered when inside ReactFlowProvider
 */
const ReactFlowZoomControls: React.FC<{
  zoom: number;
  setZoom: (zoom: number) => void;
}> = ({ zoom, setZoom }) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const handleZoomIn = () => {
    zoomIn();
    setZoom(zoom * 1.2);
  };

  const handleZoomOut = () => {
    zoomOut();
    setZoom(zoom / 1.2);
  };

  const handleFitView = () => {
    fitView({ padding: 0.2 });
    setZoom(1);
  };

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={handleZoomOut} aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom Out (Ctrl+-)</TooltipContent>
      </Tooltip>

      <span className="w-12 text-center font-mono text-xs text-text-secondary">
        {Math.round(zoom * 100)}%
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={handleZoomIn} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom In (Ctrl++)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={handleFitView} aria-label="Fit to screen">
            <Maximize className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Fit to Screen (Ctrl+0)</TooltipContent>
      </Tooltip>
    </div>
  );
};

/**
 * Fallback zoom controls for geographic view (no React Flow)
 */
const FallbackZoomControls: React.FC<{
  zoom: number;
}> = ({ zoom }) => {
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" disabled aria-label="Zoom out (use map controls)">
            <ZoomOut className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom (use map controls)</TooltipContent>
      </Tooltip>

      <span className="w-12 text-center font-mono text-xs text-text-secondary">
        {Math.round(zoom * 100)}%
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" disabled aria-label="Zoom in (use map controls)">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom (use map controls)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" disabled aria-label="Fit to screen (use map controls)">
            <Maximize className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Fit (use map controls)</TooltipContent>
      </Tooltip>
    </div>
  );
};

export const Toolbar: React.FC = () => {
  const zoom = useUIStore((state) => state.zoom);
  const setZoom = useUIStore((state) => state.setZoom);
  const toolMode = useUIStore((state) => state.toolMode);
  const setToolMode = useUIStore((state) => state.setToolMode);

  const selectedNodeIds = useNetworkStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useNetworkStore((state) => state.selectedEdgeIds);
  const undo = useNetworkStore((state) => state.undo);
  const redo = useNetworkStore((state) => state.redo);
  const historyIndex = useNetworkStore((state) => state.historyIndex);
  const historyLength = useNetworkStore((state) => state.history.length);
  const duplicateSelected = useNetworkStore((state) => state.duplicateSelected);
  const openModal = useUIStore((state) => state.openModal);

  // Grid settings
  const gridVisible = useUIStore((state) => state.gridVisible);
  const gridSize = useUIStore((state) => state.gridSize);
  const snapToGrid = useUIStore((state) => state.snapToGrid);
  const toggleGrid = useUIStore((state) => state.toggleGrid);
  const setGridSize = useUIStore((state) => state.setGridSize);
  const setSnapToGrid = useUIStore((state) => state.setSnapToGrid);

  // View mode
  const viewMode = useUIStore((state) => state.viewMode);
  const toggleViewMode = useUIStore((state) => state.toggleViewMode);

  // Utilization overlay
  const showUtilization = useUIStore((state) => state.showUtilization);
  const toggleUtilization = useUIStore((state) => state.toggleUtilization);

  // Node display mode
  const nodeDisplayMode = useUIStore((state) => state.nodeDisplayMode);
  const setNodeDisplayMode = useUIStore((state) => state.setNodeDisplayMode);

  // Service selection (for clear highlights button)
  const selectedServiceIds = useServiceStore((state) => state.selectedServiceIds);
  const clearServiceSelection = useServiceStore((state) => state.clearSelection);
  const hasServiceHighlights = selectedServiceIds.length > 0;

  const hasSelection = selectedNodeIds.length > 0 || selectedEdgeIds.length > 0;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLength - 1;

  // Determine if React Flow controls are available
  const isSchematicMode = viewMode === 'schematic';

  return (
    <div
      className="flex h-toolbar shrink-0 items-center justify-between border-b border-border bg-elevated px-4"
      data-testid="toolbar"
    >
      {/* Left - Tool Modes */}
      <div className="flex items-center gap-1" data-testid="toolbar-tools">
        {TOOL_CONFIGS.map(({ mode, label, shortcut }) => (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setToolMode(mode)}
                className={cn(
                  toolMode === mode && 'bg-accent/10 text-accent border border-accent'
                )}
                data-testid={`toolbar-tool-${mode}`}
                aria-label={`${label} (${shortcut})`}
                aria-pressed={toolMode === mode}
              >
                {TOOL_ICONS[mode]}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label} ({shortcut})</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Center - Main Tools */}
      <div className="flex items-center gap-1">
        {/* History */}
        <div className="mr-2 flex items-center gap-1 border-r border-border pr-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={undo}
                disabled={!canUndo}
                aria-label="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={redo}
                disabled={!canRedo}
                aria-label="Redo (Ctrl+Y)"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
        </div>

        {/* Selection Actions */}
        <div className="mr-2 flex items-center gap-1 border-r border-border pr-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!hasSelection}
                onClick={() => hasSelection && duplicateSelected()}
                aria-label="Duplicate (Ctrl+D)"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate (Ctrl+D)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={hasSelection ? 'destructive' : 'ghost'}
                size="icon"
                onClick={() => hasSelection && openModal('confirm-delete')}
                disabled={!hasSelection}
                aria-label="Delete selected (Del)"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete (Del)</TooltipContent>
          </Tooltip>
        </div>

        {/* View Controls - conditionally render based on view mode */}
        {isSchematicMode ? (
          <ReactFlowZoomControls zoom={zoom} setZoom={setZoom} />
        ) : (
          <FallbackZoomControls zoom={zoom} />
        )}
      </div>

      {/* Right - View Options */}
      <div className="flex items-center gap-2">
        {/* View Mode Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'gap-1.5 px-2',
                viewMode === 'geographic' && 'bg-accent/10 text-accent'
              )}
              onClick={toggleViewMode}
              data-testid="toolbar-view-toggle"
            >
              {viewMode === 'schematic' ? (
                <>
                  <Map className="h-4 w-4" />
                  <span className="text-xs">Map</span>
                </>
              ) : (
                <>
                  <LayoutGrid className="h-4 w-4" />
                  <span className="text-xs">Schematic</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {viewMode === 'schematic'
              ? 'Switch to Geographic View'
              : 'Switch to Schematic View'}
          </TooltipContent>
        </Tooltip>

        <div className="h-6 w-px bg-border" />

        {/* Utilization Overlay Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'gap-1.5 px-2',
                showUtilization && 'bg-accent/10 text-accent'
              )}
              onClick={toggleUtilization}
              data-testid="toolbar-utilization-toggle"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="text-xs">Utilization</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Edge Utilization Overlay</TooltipContent>
        </Tooltip>

        <div className="h-6 w-px bg-border" />

        {/* Node Display Mode */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 px-2"
                  data-testid="node-display-mode-button"
                  aria-label="Node display mode"
                >
                  <Layers className="h-4 w-4" />
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Node Display Mode</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Node Display</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {([
              { mode: 'expanded' as NodeDisplayMode, label: 'Expanded' },
              { mode: 'compact' as NodeDisplayMode, label: 'Compact' },
              { mode: 'icon-only' as NodeDisplayMode, label: 'Icon Only' },
            ]).map(({ mode, label }) => (
              <DropdownMenuCheckboxItem
                key={mode}
                checked={nodeDisplayMode === mode}
                onCheckedChange={() => setNodeDisplayMode(mode)}
                data-testid={`node-display-mode-${mode}`}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-6 w-px bg-border" />

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'gap-1 px-2',
                    gridVisible && 'bg-accent/10 text-accent'
                  )}
                  data-testid="toolbar-grid-button"
                  aria-label="Grid settings"
                >
                  <Grid3X3 className="h-4 w-4" />
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Grid Settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Grid Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={gridVisible}
              onCheckedChange={toggleGrid}
            >
              Show Grid
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={snapToGrid}
              onCheckedChange={setSnapToGrid}
            >
              Snap to Grid
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-text-muted">Grid Size</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={gridSize === 20}
              onCheckedChange={() => setGridSize(20)}
            >
              Small (20px)
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={gridSize === 40}
              onCheckedChange={() => setGridSize(40)}
            >
              Medium (40px)
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={gridSize === 80}
              onCheckedChange={() => setGridSize(80)}
            >
              Large (80px)
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {hasServiceHighlights && (
          <>
            <div className="h-6 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 px-2 text-info"
                  onClick={clearServiceSelection}
                  data-testid="clear-highlights-button"
                >
                  <Highlighter className="h-4 w-4" />
                  <span className="text-xs">Clear Highlights</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear service path highlights (Esc)</TooltipContent>
            </Tooltip>
          </>
        )}

        {hasSelection && (
          <span className="bg-accent/10 rounded px-2 py-1 text-xs text-accent">
            {selectedNodeIds.length + selectedEdgeIds.length} selected
          </span>
        )}
      </div>
    </div>
  );
};
