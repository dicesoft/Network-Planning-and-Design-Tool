import React from 'react';
import { ServiceType, SERVICE_TYPE_CONFIGS } from '@/types/service';
import { cn } from '@/lib/utils';

interface ServiceTypeBadgeProps {
  type: ServiceType;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

/**
 * ServiceTypeBadge - Displays L1/L2/L3 type indicator with appropriate color
 */
export const ServiceTypeBadge: React.FC<ServiceTypeBadgeProps> = ({
  type,
  size = 'sm',
  showLabel = false,
  className,
}) => {
  const config = SERVICE_TYPE_CONFIGS[type];

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        className
      )}
      style={{
        backgroundColor: `${config.color}20`,
        color: config.color,
      }}
      title={config.description}
    >
      {showLabel ? config.label : config.shortLabel}
    </span>
  );
};
