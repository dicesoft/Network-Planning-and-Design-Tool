import React from 'react';
import { ServiceStatus, SERVICE_STATUS_CONFIGS } from '@/types/service';
import { cn } from '@/lib/utils';

interface ServiceStatusBadgeProps {
  status: ServiceStatus;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * ServiceStatusBadge - Displays service status with appropriate color coding
 */
export const ServiceStatusBadge: React.FC<ServiceStatusBadgeProps> = ({
  status,
  size = 'sm',
  className,
}) => {
  const config = SERVICE_STATUS_CONFIGS[status];

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded uppercase',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        className
      )}
      style={{
        backgroundColor: config.bgColor,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
};
