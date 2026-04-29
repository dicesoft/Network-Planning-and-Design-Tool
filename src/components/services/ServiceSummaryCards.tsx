import React from 'react';
import { Layers, Radio, Globe, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServiceType, ServiceStatus } from '@/types/service';

export type CardFilter = 'all' | 'dwdm' | 'ip' | 'down';

interface ServiceSummaryCardsProps {
  totalCount: number;
  dwdmCount: number;
  ipCount: number;
  failedCount: number;
  activeFilter?: CardFilter;
  onFilterChange?: (filter: CardFilter) => void;
}

interface CardDef {
  label: string;
  filter: CardFilter;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  countColor?: string;
  activeBorder: string;
}

const CARDS: CardDef[] = [
  {
    label: 'Total Services',
    filter: 'all',
    icon: Layers,
    iconBg: 'bg-accent/10',
    iconColor: 'text-accent',
    activeBorder: 'ring-accent/50',
  },
  {
    label: 'DWDM Services',
    filter: 'dwdm',
    icon: Radio,
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-500',
    countColor: 'text-purple-500',
    activeBorder: 'ring-purple-500/50',
  },
  {
    label: 'IP Services',
    filter: 'ip',
    icon: Globe,
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    countColor: 'text-emerald-500',
    activeBorder: 'ring-emerald-500/50',
  },
  {
    label: 'Services Down',
    filter: 'down',
    icon: AlertTriangle,
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-500',
    countColor: 'text-red-500',
    activeBorder: 'ring-red-500/50',
  },
];

/**
 * Convert a CardFilter to the corresponding type/status filter values.
 */
export function cardFilterToServiceFilters(filter: CardFilter): {
  typeFilter: ServiceType | 'all';
  statusFilter: ServiceStatus | 'all';
} {
  switch (filter) {
    case 'dwdm':
      return { typeFilter: 'l1-dwdm', statusFilter: 'all' };
    case 'ip':
      // IP covers both L2 and L3 — we'll use 'all' type and filter in the table
      // Actually, we need a special handling. Let's use a convention:
      // We set typeFilter to a special value handled by the parent.
      return { typeFilter: 'all', statusFilter: 'all' };
    case 'down':
      return { typeFilter: 'all', statusFilter: 'failed' };
    default:
      return { typeFilter: 'all', statusFilter: 'all' };
  }
}

export const ServiceSummaryCards: React.FC<ServiceSummaryCardsProps> = ({
  totalCount,
  dwdmCount,
  ipCount,
  failedCount,
  activeFilter = 'all',
  onFilterChange,
}) => {
  const counts = [totalCount, dwdmCount, ipCount, failedCount];

  const handleClick = (filter: CardFilter) => {
    if (!onFilterChange) return;
    // Toggle: clicking the active card clears to 'all'
    if (activeFilter === filter) {
      onFilterChange('all');
    } else {
      onFilterChange(filter);
    }
  };

  return (
    <div className="grid grid-cols-4 gap-3 border-b border-border bg-elevated px-6 py-3">
      {CARDS.map((card, i) => {
        const Icon = card.icon;
        const count = counts[i];
        const isDown = card.label === 'Services Down';
        const countClass = isDown && count === 0 ? 'text-text-muted' : (card.countColor ?? 'text-text-primary');
        const isActive = activeFilter === card.filter && card.filter !== 'all';

        return (
          <div
            key={card.label}
            onClick={() => handleClick(card.filter)}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border bg-canvas px-4 py-3 transition-all',
              isActive
                ? `ring-2 ${card.activeBorder} border-transparent`
                : 'border-border hover:border-border-light hover:shadow-xs'
            )}
          >
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', card.iconBg)}>
              <Icon className={cn('h-5 w-5', card.iconColor)} />
            </div>
            <div>
              <div className={cn('text-2xl font-semibold leading-tight', countClass)}>
                {count}
              </div>
              <div className="text-xs text-text-secondary">{card.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
