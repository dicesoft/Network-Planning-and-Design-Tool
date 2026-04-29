import React, { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useSimulationStore } from '@/stores/simulationStore';
import { useEventStore } from '@/stores/eventStore';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Upload,
  Download,
  Settings,
  Keyboard,
  HelpCircle,
  Bug,
  Check,
  Sun,
  Moon,
  RotateCcw,
} from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { pluralize } from '@/lib/pluralize';

interface HeaderProps {
  onShowShortcuts?: () => void;
  onImport?: () => void;
  onExport?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onShowShortcuts,
  onImport,
  onExport,
}) => {
  const modifiedTime = useNetworkStore((state) => state.topology.metadata.modified);
  const nodeCount = useNetworkStore((state) => state.topology.nodes.length);
  const edgeCount = useNetworkStore((state) => state.topology.edges.length);
  const serviceCount = useServiceStore((state) => state.services.length);
  const openModal = useUIStore((state) => state.openModal);
  const addToast = useUIStore((state) => state.addToast);
  const closeInspector = useUIStore((state) => state.closeInspector);
  const location = useLocation();
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const showDebugPanel = useSettingsStore((state) => state.settings.advanced.showDebugPanel);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const handleResetNetwork = useCallback(() => {
    // Reset sequence: services -> topology -> simulation -> events -> UI
    useServiceStore.getState().removeServices(
      useServiceStore.getState().services.map((s) => s.id)
    );
    useNetworkStore.getState().clearTopology();
    useSimulationStore.getState().clearSimulation();
    useSimulationStore.getState().clearExhaustive();
    useSimulationStore.getState().clearHealthCheck();
    useEventStore.getState().clearEvents();
    closeInspector();
    addToast({ type: 'success', title: 'Network reset', message: 'All data has been cleared.' });
  }, [closeInspector, addToast]);

  // Navigation tabs configuration
  const navTabs = useMemo(() => [
    { id: 'topology', label: 'Topology', path: '/' },
    { id: 'services', label: 'Services', path: '/services' },
    { id: 'capacity', label: 'Capacity', path: '/capacity' },
    { id: 'simulation', label: 'Simulation', path: '/simulation' },
    { id: 'forecast', label: 'Forecast', path: '/forecast' },
    { id: 'reports', label: 'Reports', path: '/reports' },
    { id: 'tools', label: 'Tools', path: '/tools' },
  ], []);

  // Format last modified time
  const formatLastModified = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const handleShowShortcuts = () => {
    if (onShowShortcuts) {
      onShowShortcuts();
    } else {
      openModal('shortcuts');
    }
  };

  const handleImport = () => {
    if (onImport) {
      onImport();
    } else {
      openModal('import');
    }
  };

  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      openModal('export');
    }
  };

  return (
    <header
      className="relative z-header flex h-header shrink-0 items-center justify-between border-b border-border bg-elevated px-6 shadow-sm"
      data-testid="header"
    >
      {/* Logo */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent font-heading text-xl font-bold text-white shadow-sm">
          A
        </div>
        <div>
          <div className="font-heading text-2xl font-bold tracking-tight text-primary">
            ATLAS
          </div>
          <div className="-mt-0.5 text-xs text-text-tertiary">
            Network Planning Suite
          </div>
        </div>
      </div>

      {/* Navigation Tabs - centered */}
      <nav className="scrollbar-hide mx-4 flex min-w-0 flex-1 justify-center gap-1 overflow-x-auto">
        {navTabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <Link
              key={tab.id}
              to={tab.path}
              data-testid={`nav-${tab.id}`}
              className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:bg-tertiary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Separator */}
      <div className="h-6 w-px shrink-0 bg-border" />

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShowShortcuts}
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Keyboard Shortcuts</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleImport} aria-label="Import network">
              <Upload className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import Network</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleExport} aria-label="Export network">
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export Network</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setResetDialogOpen(true)}
              data-testid="reset-network-button"
              disabled={nodeCount === 0 && edgeCount === 0 && serviceCount === 0}
              aria-label="Reset network"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset Network</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-6 w-px bg-border" />

        {/* Saved status indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <Check className="h-3 w-3 text-success" />
              <span className="text-text-secondary">Saved</span>
              <span className="text-text-tertiary">
                ({formatLastModified(modifiedTime)})
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-xs">
              Changes are automatically saved to your browser. Use Export to download a backup file.
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              data-testid="theme-toggle"
              aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} data-testid="settings-button" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => openModal('wiki')} data-testid="wiki-button" aria-label="Help and documentation">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Help & Documentation</TooltipContent>
        </Tooltip>

        {import.meta.env.DEV && showDebugPanel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/debug" data-testid="nav-debug">
                <Button variant="ghost" size="icon" aria-label="Debug dashboard">
                  <Bug className="h-4 w-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>Debug Dashboard</TooltipContent>
          </Tooltip>
        )}

        {/* User Avatar */}
        <div className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-primary text-sm font-medium text-white">
          U
        </div>
      </div>

      <ConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset Network"
        description="This will permanently remove all topology data, services, and simulation results."
        details={[
          `${nodeCount} ${pluralize('node', nodeCount)} will be removed`,
          `${edgeCount} ${pluralize('edge', edgeCount)} will be removed`,
          `${serviceCount} ${pluralize('service', serviceCount)} will be removed`,
        ]}
        confirmLabel="Reset Network"
        variant="destructive"
        onConfirm={handleResetNetwork}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
};
