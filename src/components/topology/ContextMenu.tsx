import React, { useEffect, useRef, useCallback } from 'react';
import {
  Pencil,
  Trash2,
  Copy,
  ListTree,
  Maximize,
  Plus,
  BarChart3,
} from 'lucide-react';

export interface ContextMenuProps {
  x: number;
  y: number;
  type: 'node' | 'edge' | 'canvas';
  targetId?: string;
  onClose: () => void;
  onAction: (action: string, targetId?: string) => void;
}

interface MenuItem {
  label: string;
  action: string;
  icon: React.ReactNode;
}

const nodeMenuItems: MenuItem[] = [
  { label: 'Edit', action: 'edit', icon: <Pencil className="h-3.5 w-3.5" /> },
  { label: 'Delete', action: 'delete', icon: <Trash2 className="h-3.5 w-3.5" /> },
  { label: 'Duplicate', action: 'duplicate', icon: <Copy className="h-3.5 w-3.5" /> },
  { label: 'Show Services', action: 'show-services', icon: <ListTree className="h-3.5 w-3.5" /> },
];

const edgeMenuItems: MenuItem[] = [
  { label: 'Edit', action: 'edit', icon: <Pencil className="h-3.5 w-3.5" /> },
  { label: 'Delete', action: 'delete', icon: <Trash2 className="h-3.5 w-3.5" /> },
  { label: 'Show Capacity', action: 'show-capacity', icon: <BarChart3 className="h-3.5 w-3.5" /> },
];

const canvasMenuItems: MenuItem[] = [
  { label: 'Add Node Here', action: 'add-node', icon: <Plus className="h-3.5 w-3.5" /> },
  { label: 'Fit View', action: 'fit-view', icon: <Maximize className="h-3.5 w-3.5" /> },
];

function getMenuItems(type: 'node' | 'edge' | 'canvas'): MenuItem[] {
  switch (type) {
    case 'node':
      return nodeMenuItems;
    case 'edge':
      return edgeMenuItems;
    case 'canvas':
      return canvasMenuItems;
  }
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  type,
  targetId,
  onClose,
  onAction,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const items = getMenuItems(type);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClickOutside, handleKeyDown]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-elevated py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-tertiary hover:text-text-primary"
          onClick={() => {
            onAction(item.action, targetId);
            onClose();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
};
