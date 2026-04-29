import React from 'react';
import { NodeType, NODE_TYPE_CONFIGS, isComingSoonNodeType } from '@/types';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import { NodeIcon } from './NodeIcon';

const nodeTypes: NodeType[] = ['router', 'switch', 'oadm', 'amplifier', 'terminal', 'osp-termination', 'olt', 'ont', 'custom'];

export const NodePalette: React.FC = () => {
  const setToolMode = useUIStore((state) => state.setToolMode);
  const showRoadmap = useSettingsStore((state) => state.settings.general.showRoadmap);
  const visibleNodeTypes = showRoadmap
    ? nodeTypes
    : nodeTypes.filter((t) => !isComingSoonNodeType(t));

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    nodeType: NodeType
  ) => {
    e.dataTransfer.setData('application/reactflow', nodeType);
    e.dataTransfer.effectAllowed = 'move';
    setToolMode('add');
  };

  return (
    <div className="grid grid-cols-2 gap-2" data-testid="node-palette">
      {visibleNodeTypes.map((type) => {
        const config = NODE_TYPE_CONFIGS[type];
        const comingSoon = isComingSoonNodeType(type);
        return (
          <div
            key={type}
            data-testid={`palette-${type}`}
            draggable={!comingSoon}
            onDragStart={(e) => !comingSoon && handleDragStart(e, type)}
            className={cn(
              'flex flex-col items-center gap-2 p-3 rounded-lg',
              'bg-tertiary border border-transparent',
              'transition-all duration-150',
              comingSoon
                ? 'opacity-60 cursor-not-allowed'
                : 'cursor-grab active:cursor-grabbing hover:bg-border hover:border-accent/30 hover:shadow-sm'
            )}
          >
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                'text-white shadow-sm',
                `bg-gradient-to-br ${config.gradient}`
              )}
            >
              <NodeIcon iconName={config.icon} size={22} />
            </div>
            <span className="text-xs font-medium text-text-secondary">
              {config.label}
            </span>
            {comingSoon && (
              <span className="bg-warning/10 rounded-full px-2 py-0.5 text-[10px] font-medium text-warning">
                Coming Soon
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
