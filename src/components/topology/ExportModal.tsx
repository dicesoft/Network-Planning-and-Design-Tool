import React, { useState } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useUIStore } from '@/stores/uiStore';
import { useServiceStore } from '@/stores/serviceStore';
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
import { Download, FileJson, AlertCircle } from 'lucide-react';
import type { Service } from '@/types/service';
import type { NetworkTopology } from '@/types/network';

/**
 * Export file format v2.0 — includes services alongside topology
 */
export interface TopologyExportData {
  version: '2.0';
  topology: NetworkTopology;
  services: Service[];
  exportedAt: string;
}

export const ExportModal: React.FC = () => {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal = useUIStore((state) => state.closeModal);
  const addToast = useUIStore((state) => state.addToast);
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);

  const [filename, setFilename] = useState('');
  const [includeServices, setIncludeServices] = useState(true);

  const isOpen = activeModal === 'export';

  // Default filename based on topology name
  const defaultFilename = topology.name.toLowerCase().replace(/\s+/g, '-');

  const handleClose = () => {
    closeModal();
    setFilename('');
    setIncludeServices(true);
  };

  const handleExport = () => {
    try {
      const exportFilename = (filename || defaultFilename) + '.json';

      const exportData: TopologyExportData = {
        version: '2.0',
        topology,
        services: includeServices ? services : [],
        exportedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const serviceMsg =
        includeServices && services.length > 0
          ? ` with ${services.length} services`
          : '';
      addToast({
        type: 'success',
        title: 'Export successful',
        message: `Topology exported as ${exportFilename}${serviceMsg}`,
        duration: 4000,
      });

      handleClose();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Export failed',
        message: 'An error occurred while exporting the topology',
        duration: 5000,
      });
    }
  };

  const isEmpty = topology.nodes.length === 0 && topology.edges.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[440px]" data-testid="export-modal" hideClose>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Network
          </DialogTitle>
          <DialogDescription>
            Download your network topology as a JSON file for backup or sharing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          {/* Filename input */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Filename
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder={defaultFilename}
                className="flex-1"
                data-testid="export-filename-input"
              />
              <span className="text-sm text-text-tertiary">.json</span>
            </div>
          </div>

          {/* Include services checkbox */}
          {services.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-services"
                checked={includeServices}
                onCheckedChange={(checked) => setIncludeServices(checked === true)}
                data-testid="export-include-services"
              />
              <label
                htmlFor="include-services"
                className="cursor-pointer text-sm text-text-secondary"
              >
                Include services ({services.length})
              </label>
            </div>
          )}

          {/* Preview stats */}
          <div className="rounded-lg border border-border bg-tertiary p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
              <FileJson className="h-4 w-4" />
              Export Preview
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-text-secondary">Topology Name:</div>
              <div className="text-text-primary">{topology.name}</div>
              <div className="text-text-secondary">Nodes:</div>
              <div className="text-text-primary">{topology.nodes.length}</div>
              <div className="text-text-secondary">Edges:</div>
              <div className="text-text-primary">{topology.edges.length}</div>
              {includeServices && services.length > 0 && (
                <>
                  <div className="text-text-secondary">Services:</div>
                  <div className="text-text-primary">{services.length}</div>
                </>
              )}
              <div className="text-text-secondary">Last Modified:</div>
              <div className="text-text-primary">
                {new Date(topology.metadata.modified).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Empty warning */}
          {isEmpty && (
            <div className="border-warning/30 bg-warning/10 flex items-start gap-2 rounded-lg border p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-sm text-text-secondary">
                Your topology is empty. You can still export it, but it will contain no nodes or
                edges.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleExport} data-testid="export-confirm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
