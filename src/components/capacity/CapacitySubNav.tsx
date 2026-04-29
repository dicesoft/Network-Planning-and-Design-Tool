import React from 'react';
import { cn } from '@/lib/utils';

export type CapacityTab = 'dashboard' | 'what-if' | 'lambda' | 'defrag';

export interface CapacitySubNavProps {
  activeTab: CapacityTab;
  onTabChange: (tab: CapacityTab) => void;
  className?: string;
}

const TABS: { id: CapacityTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'what-if', label: 'What-If' },
  { id: 'lambda', label: 'Lambda Study' },
  { id: 'defrag', label: 'Defragmentation' },
];

export const CapacitySubNav: React.FC<CapacitySubNavProps> = ({
  activeTab,
  onTabChange,
  className,
}) => {
  return (
    <nav
      className={cn('flex gap-0.5 rounded-lg bg-tertiary p-1', className)}
      role="tablist"
      aria-label="Capacity views"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === tab.id
              ? 'bg-elevated text-text-primary shadow-sm'
              : 'text-text-tertiary hover:text-text-secondary',
          )}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
};
