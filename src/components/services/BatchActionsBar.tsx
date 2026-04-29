import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, CheckCircle, Wrench, Trash2, X } from 'lucide-react';
import { pluralize } from '@/lib/pluralize';

interface BatchActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onDelete: () => void;
  onActivate: () => void;
  onMaintenance: () => void;
}

export const BatchActionsBar: React.FC<BatchActionsBarProps> = ({
  selectedCount,
  onClearSelection,
  onExportJSON,
  onExportCSV,
  onDelete,
  onActivate,
  onMaintenance,
}) => {
  return (
    <div className="flex items-center gap-2 border-l border-border pl-3">
      <span className="bg-accent/10 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-accent">
        {selectedCount} {pluralize('service', selectedCount)} selected
      </span>

      <Button variant="outline" size="icon" className="h-8 w-8" onClick={onActivate} title="Activate selected" aria-label="Activate selected">
        <CheckCircle className="h-4 w-4 text-success" />
      </Button>

      <Button variant="outline" size="icon" className="h-8 w-8" onClick={onMaintenance} title="Set maintenance" aria-label="Set maintenance">
        <Wrench className="h-4 w-4" />
      </Button>

      <Button variant="destructive" size="icon" className="h-8 w-8" onClick={onDelete} title="Delete selected" aria-label="Delete selected">
        <Trash2 className="h-4 w-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8" title="Export selected" aria-label="Export selected">
            <Download className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onExportJSON}>
            Export as JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportCSV}>
            Export as CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClearSelection} title="Clear selection" aria-label="Clear selection">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
