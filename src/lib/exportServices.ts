import type { Service } from '@/types/service';
import {
  SERVICE_TYPE_CONFIGS,
  SERVICE_STATUS_CONFIGS,
  PROTECTION_SCHEME_CONFIGS,
  IP_PROTECTION_SCHEME_CONFIGS,
  isL1DWDMService,
  isL2L3Service,
} from '@/types/service';

/**
 * Escape a value for CSV output.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Get the protection scheme label for a service.
 */
function getProtectionLabel(service: Service): string {
  if (isL1DWDMService(service)) {
    return PROTECTION_SCHEME_CONFIGS[service.protectionScheme]?.label ?? service.protectionScheme;
  }
  if (isL2L3Service(service)) {
    return IP_PROTECTION_SCHEME_CONFIGS[service.protectionScheme]?.label ?? service.protectionScheme;
  }
  return 'None';
}

/**
 * Get channel number for an L1 DWDM service, or empty string.
 */
function getChannelDisplay(service: Service): string {
  if (isL1DWDMService(service)) {
    const ch = service.channelNumber ?? service.workingPath?.channelNumber;
    return ch != null ? String(ch) : '';
  }
  return '';
}

/**
 * Convert services array to CSV string.
 * @param services - Array of services to export
 * @param nodeNameResolver - Function to resolve node IDs to display names
 */
export function servicesToCSV(
  services: Service[],
  nodeNameResolver: (nodeId: string) => string
): string {
  const headers = [
    'ID',
    'Name',
    'Type',
    'Status',
    'Source',
    'Destination',
    'Data Rate',
    'Channel',
    'Protection',
    'Created',
    'Modified',
  ];

  const rows = services.map((s) => [
    s.id,
    s.name,
    SERVICE_TYPE_CONFIGS[s.type]?.label ?? s.type,
    SERVICE_STATUS_CONFIGS[s.status]?.label ?? s.status,
    nodeNameResolver(s.sourceNodeId),
    nodeNameResolver(s.destinationNodeId),
    s.dataRate,
    getChannelDisplay(s),
    getProtectionLabel(s),
    s.createdAt,
    s.modifiedAt,
  ]);

  const csvLines = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ];

  return csvLines.join('\n');
}

/**
 * Trigger a browser download of services as JSON.
 */
export function downloadServicesAsJSON(services: Service[], filename = 'services.json'): void {
  const json = JSON.stringify(services, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  triggerDownload(blob, filename);
}

/**
 * Trigger a browser download of services as CSV.
 */
export function downloadServicesAsCSV(
  services: Service[],
  nodeNameResolver: (nodeId: string) => string,
  filename = 'services.csv'
): void {
  const csv = servicesToCSV(services, nodeNameResolver);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * Create a temporary link and trigger browser download.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
