import { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { NetworkNode, NODE_TYPE_CONFIGS, NodeType, Port } from '@/types';
import { cn } from '@/lib/utils';
import { NodeIcon } from './NodeIcon';
import { useSettingsStore, selectNodeSubtypes } from '@/stores/settingsStore';
import type { NodeSizeFlavor } from '@/types/settings';
import { useUIStore } from '@/stores/uiStore';

const SIZE_BADGE_LABELS: Record<string, string> = {
  small: 'S',
  medium: 'M',
  large: 'L',
};

/**
 * Compute port summary stats for expanded node display
 */
function computePortStats(ports: Port[] | undefined) {
  if (!ports || ports.length === 0) return null;

  let dwdmTotal = 0;
  let dwdmUsed = 0;
  let bwTotal = 0;
  let bwUsed = 0;
  let totalChannelsUsed = 0;
  let totalChannelsMax = 0;

  for (const port of ports) {
    if (port.type === 'dwdm') {
      dwdmTotal++;
      if (port.status === 'used') dwdmUsed++;
      const allocated = port.spectrum?.allocations?.length ?? 0;
      totalChannelsUsed += allocated;
      totalChannelsMax += port.channels;
    } else if (port.type === 'bw') {
      bwTotal++;
      if (port.status === 'used') bwUsed++;
    }
  }

  return { dwdmTotal, dwdmUsed, bwTotal, bwUsed, totalChannelsUsed, totalChannelsMax };
}

interface NetworkNodeData extends NetworkNode {
  selected?: boolean;
}

// Type assertion helper for data
type NetworkNodeProps = NodeProps & {
  data: NetworkNodeData;
};

export const NetworkNodeComponent = memo(
  ({ data, selected }: NetworkNodeProps) => {
    const config = NODE_TYPE_CONFIGS[data.type as NodeType] || NODE_TYPE_CONFIGS.custom;
    const allSubtypes = useSettingsStore(selectNodeSubtypes);
    const nodeDisplayMode = useUIStore((state) => state.nodeDisplayMode);
    const subtypePreset = data.subtype
      ? allSubtypes.find((s) => s.key === data.subtype && s.nodeType === data.type)
      : undefined;

    const portStats = useMemo(() => computePortStats(data.ports), [data.ports]);

    // Icon-only mode
    if (nodeDisplayMode === 'icon-only') {
      return (
        <div
          data-testid="network-node"
          className={cn(
            'relative w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all duration-150',
            'text-white',
            `bg-gradient-to-br ${config.gradient}`,
            selected
              ? 'ring-2 ring-accent/40 scale-110'
              : 'hover:scale-105'
          )}
          title={data.name}
        >
          <Handle id="top-target" type="target" position={Position.Top} className="!h-2 !w-2 !border !border-white !bg-accent !opacity-0" />
          <Handle id="top-source" type="source" position={Position.Top} className="!h-2 !w-2 !border !border-white !bg-accent !opacity-0" />
          <Handle id="bottom-target" type="target" position={Position.Bottom} className="!h-2 !w-2 !border !border-white !bg-accent !opacity-0" />
          <Handle id="bottom-source" type="source" position={Position.Bottom} className="!h-2 !w-2 !border !border-white !bg-accent !opacity-0" />
          <Handle id="left-target" type="target" position={Position.Left} className="!h-2 !w-2 !border !border-white !bg-accent !opacity-0" />
          <Handle id="left-source" type="source" position={Position.Left} className="!h-2 !w-2 !border !border-white !bg-accent !opacity-0" />
          <Handle id="right-target" type="target" position={Position.Right} className="!h-2 !w-2 !border !border-white !bg-accent !opacity-0" />
          <Handle id="right-source" type="source" position={Position.Right} className="!h-2 !w-2 !border !border-white !bg-accent !opacity-0" />
          <NodeIcon iconName={config.icon} size={18} />
          {data.sizeFlavor && (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-white">
              {SIZE_BADGE_LABELS[data.sizeFlavor] || '?'}
            </span>
          )}
        </div>
      );
    }

    // Compact mode
    if (nodeDisplayMode === 'compact') {
      return (
        <div
          data-testid="network-node"
          className={cn(
            'bg-elevated border-2 rounded-lg shadow-md min-w-[100px] transition-all duration-150',
            selected
              ? 'border-accent shadow-lg ring-2 ring-accent/20 scale-[1.02]'
              : 'border-border hover:border-accent/50 hover:shadow-lg'
          )}
        >
          <Handle id="top-target" type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-white !bg-accent" />
          <Handle id="top-source" type="source" position={Position.Top} className="!h-3 !w-3 !border-2 !border-white !bg-accent !opacity-0 hover:!opacity-100" />
          <Handle id="bottom-target" type="target" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-white !bg-accent !opacity-0 hover:!opacity-100" />
          <Handle id="bottom-source" type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-white !bg-accent" />
          <Handle id="left-target" type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-accent" />
          <Handle id="left-source" type="source" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-accent !opacity-0 hover:!opacity-100" />
          <Handle id="right-target" type="target" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-accent !opacity-0 hover:!opacity-100" />
          <Handle id="right-source" type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-accent" />
          <div className="flex items-center gap-2 p-2">
            <div
              className={cn(
                'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                'text-white shadow-sm',
                `bg-gradient-to-br ${config.gradient}`
              )}
            >
              <NodeIcon iconName={config.icon} size={16} />
            </div>
            <span className="truncate text-xs font-semibold text-text-primary">
              {data.name}
            </span>
            {data.sizeFlavor && (
              <span className="bg-accent/10 ml-auto shrink-0 rounded px-1 py-0.5 text-[9px] font-bold text-accent">
                {SIZE_BADGE_LABELS[data.sizeFlavor] || 'Default'}
              </span>
            )}
          </div>
        </div>
      );
    }

    // Expanded mode (default)
    return (
      <div
        data-testid="network-node"
        className={cn(
          'bg-elevated border-2 rounded-lg shadow-md min-w-[160px] transition-all duration-150',
          selected
            ? 'border-accent shadow-lg ring-2 ring-accent/20 scale-[1.02]'
            : 'border-border hover:border-accent/50 hover:shadow-lg'
        )}
      >
        {/* Connection Handles - Each position has both source and target for bidirectional connections */}
        {/* Top */}
        <Handle
          id="top-target"
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-white !bg-accent"
          data-testid="handle-top-target"
        />
        <Handle
          id="top-source"
          type="source"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-white !bg-accent !opacity-0 hover:!opacity-100"
          data-testid="handle-top-source"
        />
        {/* Bottom */}
        <Handle
          id="bottom-target"
          type="target"
          position={Position.Bottom}
          className="!h-3 !w-3 !border-2 !border-white !bg-accent !opacity-0 hover:!opacity-100"
          data-testid="handle-bottom-target"
        />
        <Handle
          id="bottom-source"
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !border-2 !border-white !bg-accent"
          data-testid="handle-bottom-source"
        />
        {/* Left */}
        <Handle
          id="left-target"
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-white !bg-accent"
          data-testid="handle-left-target"
        />
        <Handle
          id="left-source"
          type="source"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-white !bg-accent !opacity-0 hover:!opacity-100"
          data-testid="handle-left-source"
        />
        {/* Right */}
        <Handle
          id="right-target"
          type="target"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-white !bg-accent !opacity-0 hover:!opacity-100"
          data-testid="handle-right-target"
        />
        <Handle
          id="right-source"
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-white !bg-accent"
          data-testid="handle-right-source"
        />

        {/* Node Content */}
        <div className="p-3">
          {/* Node Header */}
          <div className="mb-2 flex items-center gap-2">
            <div
              className={cn(
                'w-9 h-9 rounded-md flex items-center justify-center',
                'text-white shadow-sm',
                `bg-gradient-to-br ${config.gradient}`
              )}
            >
              <NodeIcon iconName={config.icon} size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-text-primary">
                  {data.name}
                </span>
                {data.sizeFlavor && (
                  <span className="bg-accent/10 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none text-accent" data-testid="node-size-badge">
                    {SIZE_BADGE_LABELS[data.sizeFlavor] || 'Default'}
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-text-tertiary">
                {subtypePreset ? subtypePreset.label : (data.vendor.charAt(0).toUpperCase() + data.vendor.slice(1))}
                {data.model && ` ${data.model}`}
              </div>
            </div>
          </div>

          {/* Stack Indicators */}
          {data.stacks && data.stacks.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
              {data.stacks
                .filter((stack) => stack.enabled)
                .map((stack) => {
                  const utilization =
                    stack.capacity.total > 0
                      ? (stack.capacity.used / stack.capacity.total) * 100
                      : 0;

                  return (
                    <div key={stack.layer} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium uppercase text-text-tertiary">
                          {stack.layer}
                        </span>
                        <span
                          className={cn(
                            'font-semibold',
                            stack.layer === 'dwdm'
                              ? 'text-purple-600'
                              : 'text-success'
                          )}
                        >
                          {stack.capacity.used}/{stack.capacity.total}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-tertiary">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            utilization < 50 && 'bg-success',
                            utilization >= 50 && utilization < 80 && 'bg-warning',
                            utilization >= 80 && 'bg-danger'
                          )}
                          style={{ width: `${Math.min(utilization, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Type-specific capacity info (expanded mode only) */}
          {portStats && (
            <div className="mt-2 border-t border-border pt-2" data-testid="node-capacity-info">
              {/* Router/Switch: switching capacity + port summary */}
              {(data.type === 'router' || data.type === 'switch') && (
                <div className="flex flex-wrap gap-1.5">
                  {portStats.dwdmTotal > 0 && (
                    <span className="inline-flex items-center rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                      {portStats.dwdmUsed}/{portStats.dwdmTotal} DWDM
                    </span>
                  )}
                  {portStats.bwTotal > 0 && (
                    <span className="bg-success/10 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-success">
                      {portStats.bwUsed}/{portStats.bwTotal} BW
                    </span>
                  )}
                  {data.sizeFlavor && subtypePreset?.sizes?.[data.sizeFlavor as NodeSizeFlavor]?.switchingCapacity ? (
                    <span className="bg-accent/10 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      {subtypePreset.sizes[data.sizeFlavor as NodeSizeFlavor].switchingCapacity}G
                    </span>
                  ) : null}
                </div>
              )}

              {/* OADM: channel utilization + line port summary */}
              {data.type === 'oadm' && (
                <div className="flex flex-wrap gap-1.5">
                  {portStats.dwdmTotal > 0 && (
                    <span className="inline-flex items-center rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                      {portStats.dwdmUsed}/{portStats.dwdmTotal} Line
                    </span>
                  )}
                  {portStats.totalChannelsMax > 0 && (
                    <span className="bg-accent/10 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      {portStats.totalChannelsUsed}/{portStats.totalChannelsMax} CH
                    </span>
                  )}
                </div>
              )}

              {/* Amplifier/Terminal: basic port info */}
              {(data.type === 'amplifier' || data.type === 'terminal') && portStats.dwdmTotal > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                    {portStats.dwdmUsed}/{portStats.dwdmTotal} DWDM
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

NetworkNodeComponent.displayName = 'NetworkNodeComponent';
