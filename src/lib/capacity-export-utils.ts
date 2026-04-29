/**
 * Capacity Export Utilities
 *
 * Per-sub-tab export functions for the Capacity Dashboard.
 * Generates CSV or JSON exports for edge utilization, node capacity,
 * and service utilization data.
 */

import { buildCsv, downloadCsv } from './csv-utils';
import type { EdgeUtilization, NodeUtilization } from '@/core/services/CapacityTracker';
import type { Service } from '@/types/service';
import { isL1DWDMService, isL2L3Service, SERVICE_TYPE_CONFIGS, SERVICE_STATUS_CONFIGS } from '@/types/service';

/**
 * Get a date stamp for filenames (YYYY-MM-DD)
 */
function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Trigger a JSON file download
 */
function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// EDGE UTILIZATION EXPORT
// ============================================================================

export function exportEdgeUtilizationCsv(
  edgeUtilizations: EdgeUtilization[],
  getEdgeEndpoints: (edgeId: string) => { source: string; target: string } | null,
): void {
  const headers = ['Edge ID', 'Source', 'Target', 'Total Channels', 'Used', 'Available', 'Utilization %'];
  const rows = edgeUtilizations.map((eu) => {
    const endpoints = getEdgeEndpoints(eu.edgeId);
    return [
      eu.edgeId,
      endpoints?.source || 'Unknown',
      endpoints?.target || 'Unknown',
      eu.total,
      eu.used,
      eu.available,
      eu.percentage,
    ];
  });

  const csv = buildCsv(headers, rows);
  downloadCsv(csv, `atlas-edge-utilization-${dateStamp()}.csv`);
}

export function exportEdgeUtilizationJson(
  edgeUtilizations: EdgeUtilization[],
  getEdgeEndpoints: (edgeId: string) => { source: string; target: string } | null,
): void {
  const data = edgeUtilizations.map((eu) => {
    const endpoints = getEdgeEndpoints(eu.edgeId);
    return {
      edgeId: eu.edgeId,
      source: endpoints?.source || 'Unknown',
      target: endpoints?.target || 'Unknown',
      totalChannels: eu.total,
      usedChannels: eu.used,
      availableChannels: eu.available,
      utilizationPercent: eu.percentage,
    };
  });

  downloadJson(
    { version: '1.0', type: 'edge-utilization', exportedAt: new Date().toISOString(), data },
    `atlas-edge-utilization-${dateStamp()}.json`,
  );
}

// ============================================================================
// NODE CAPACITY EXPORT
// ============================================================================

export function exportNodeCapacityCsv(
  nodeUtilizations: NodeUtilization[],
  getNodeName: (nodeId: string) => string,
): void {
  const headers = [
    'Node ID', 'Name', 'Total Ports', 'Used Ports', 'Available Ports',
    'Port Utilization %', 'DWDM Ports', 'DWDM Used', 'BW Ports', 'BW Used',
    'Switching Capacity (Gbps)', 'Switching Utilization %',
  ];
  const rows = nodeUtilizations.map((nu) => [
    nu.nodeId,
    getNodeName(nu.nodeId),
    nu.totalPorts,
    nu.usedPorts,
    nu.availablePorts,
    nu.portUtilizationPercent,
    nu.dwdmPorts,
    nu.dwdmPortsUsed,
    nu.bwPorts,
    nu.bwPortsUsed,
    nu.switchingCapacity ?? '',
    nu.switchingUtilization ?? '',
  ]);

  const csv = buildCsv(headers, rows);
  downloadCsv(csv, `atlas-node-capacity-${dateStamp()}.csv`);
}

export function exportNodeCapacityJson(
  nodeUtilizations: NodeUtilization[],
  getNodeName: (nodeId: string) => string,
): void {
  const data = nodeUtilizations.map((nu) => ({
    nodeId: nu.nodeId,
    name: getNodeName(nu.nodeId),
    totalPorts: nu.totalPorts,
    usedPorts: nu.usedPorts,
    availablePorts: nu.availablePorts,
    portUtilizationPercent: nu.portUtilizationPercent,
    dwdmPorts: nu.dwdmPorts,
    dwdmPortsUsed: nu.dwdmPortsUsed,
    bwPorts: nu.bwPorts,
    bwPortsUsed: nu.bwPortsUsed,
    switchingCapacity: nu.switchingCapacity,
    switchingUtilization: nu.switchingUtilization,
  }));

  downloadJson(
    { version: '1.0', type: 'node-capacity', exportedAt: new Date().toISOString(), data },
    `atlas-node-capacity-${dateStamp()}.json`,
  );
}

// ============================================================================
// SERVICE UTILIZATION EXPORT
// ============================================================================

export function exportServiceUtilizationCsv(
  services: Service[],
  getNodeName: (nodeId: string) => string,
): void {
  const headers = [
    'Service ID', 'Name', 'Type', 'Status', 'Data Rate',
    'Source', 'Destination', 'Channel', 'Protection',
  ];
  const rows = services.map((s) => {
    const typeCfg = SERVICE_TYPE_CONFIGS[s.type];
    const statusCfg = SERVICE_STATUS_CONFIGS[s.status];

    let channel = '-';
    let protection = 'None';

    if (isL1DWDMService(s)) {
      channel = s.channelNumber != null ? `CH ${s.channelNumber}` : '-';
      protection = s.protectionScheme !== 'none' ? s.protectionScheme.toUpperCase() : 'None';
    } else if (isL2L3Service(s)) {
      channel = `Underlay: ${s.underlayServiceId}`;
      protection = s.protectionScheme !== 'none' ? s.protectionScheme.toUpperCase() : 'None';
    }

    return [
      s.id,
      s.name,
      typeCfg.shortLabel,
      statusCfg.label,
      s.dataRate,
      getNodeName(s.sourceNodeId),
      getNodeName(s.destinationNodeId),
      channel,
      protection,
    ];
  });

  const csv = buildCsv(headers, rows);
  downloadCsv(csv, `atlas-service-utilization-${dateStamp()}.csv`);
}

export function exportServiceUtilizationJson(
  services: Service[],
  getNodeName: (nodeId: string) => string,
): void {
  const data = services.map((s) => ({
    id: s.id,
    name: s.name,
    type: SERVICE_TYPE_CONFIGS[s.type].shortLabel,
    status: SERVICE_STATUS_CONFIGS[s.status].label,
    dataRate: s.dataRate,
    source: getNodeName(s.sourceNodeId),
    destination: getNodeName(s.destinationNodeId),
  }));

  downloadJson(
    { version: '1.0', type: 'service-utilization', exportedAt: new Date().toISOString(), data },
    `atlas-service-utilization-${dateStamp()}.json`,
  );
}
