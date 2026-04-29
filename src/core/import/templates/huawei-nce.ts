/**
 * Huawei NCE Import Template — Column definitions for Huawei Network Cloud Engine exports.
 *
 * Defines expected CSV column headers, mappings to internal types,
 * and sample data for downloadable templates.
 */

import type { ImportTemplate } from '@/types/import';
import { buildCsv } from '@/lib/csv-utils';

/** Huawei NCE Nodes CSV template */
export const HUAWEI_NCE_NODES_TEMPLATE: ImportTemplate = {
  id: 'huawei-nce-nodes',
  source: 'huawei-nce',
  fileType: 'nodes',
  name: 'Huawei NCE — Nodes',
  description: 'Network Element export from Huawei NCE (iMaster NCE-T/IP)',
  columns: [
    { csvColumn: 'node_name', targetField: 'name', required: true },
    { csvColumn: 'node_type', targetField: 'type', required: true, transform: 'toNodeType' },
    { csvColumn: 'vendor', targetField: 'vendor', required: false, transform: 'toVendor', defaultValue: 'huawei' },
    { csvColumn: 'model', targetField: 'model', required: false },
    { csvColumn: 'latitude', targetField: 'location.latitude', required: false },
    { csvColumn: 'longitude', targetField: 'location.longitude', required: false },
    { csvColumn: 'address', targetField: 'location.address', required: false },
    { csvColumn: 'subtype', targetField: 'subtype', required: false },
    { csvColumn: 'size_flavor', targetField: 'sizeFlavor', required: false, defaultValue: 'medium' },
  ],
  sampleHeaders: ['node_name', 'node_type', 'vendor', 'model', 'latitude', 'longitude', 'address', 'subtype', 'size_flavor'],
  sampleRows: [
    ['OADM-Cairo-01', 'OADM', 'Huawei', 'OptiX OSN 9800', '30.0444', '31.2357', 'Cairo Data Center', 'roadm', 'medium'],
    ['Router-Alex-01', 'Router', 'Huawei', 'NE40E-X16', '31.2001', '29.9187', 'Alexandria POP', 'core', 'large'],
    ['AMP-Nile-01', 'EDFA', 'Huawei', 'OptiX OSN 8800', '30.5500', '30.6000', 'Nile Route Repeater', '', 'small'],
  ],
};

/** Huawei NCE Edges CSV template */
export const HUAWEI_NCE_EDGES_TEMPLATE: ImportTemplate = {
  id: 'huawei-nce-edges',
  source: 'huawei-nce',
  fileType: 'edges',
  name: 'Huawei NCE — Links',
  description: 'Fiber link export from Huawei NCE',
  columns: [
    { csvColumn: 'edge_name', targetField: 'name', required: true },
    { csvColumn: 'source_node', targetField: 'source.nodeName', required: true },
    { csvColumn: 'target_node', targetField: 'target.nodeName', required: true },
    { csvColumn: 'distance_km', targetField: 'properties.distance', required: false, transform: 'toNumber', defaultValue: 0 },
    { csvColumn: 'fiber_profile', targetField: 'properties.fiberProfile.profileType', required: false, transform: 'toFiberProfile', defaultValue: 'G.652.D' },
    { csvColumn: 'fiber_count', targetField: 'properties.fiberCount', required: false, transform: 'toFiberCount', defaultValue: 1 },
    { csvColumn: 'srlg_codes', targetField: 'properties.srlgCodes', required: false, transform: 'toSrlgArray' },
    { csvColumn: 'source_port', targetField: 'source.portId', required: false },
    { csvColumn: 'target_port', targetField: 'target.portId', required: false },
  ],
  sampleHeaders: ['edge_name', 'source_node', 'target_node', 'distance_km', 'fiber_profile', 'fiber_count', 'srlg_codes', 'source_port', 'target_port'],
  sampleRows: [
    ['Link-Cairo-Alex', 'OADM-Cairo-01', 'Router-Alex-01', '220', 'G.652.D', '48', 'SRLG-NILE-DELTA', 'Line-1', 'Line-1'],
    ['Link-Cairo-AMP', 'OADM-Cairo-01', 'AMP-Nile-01', '110', 'G.652.D', '24', 'SRLG-NILE-ROUTE', 'Line-2', 'IN'],
    ['Link-AMP-Alex', 'AMP-Nile-01', 'Router-Alex-01', '110', 'G.654.E', '24', 'SRLG-NILE-ROUTE', 'OUT', 'Line-2'],
  ],
};

/**
 * Huawei NCE Services CSV template
 *
 * Protection columns:
 *   service_role — 'working' or 'protection' (default: working)
 *   protection_pair_id — links a working service to its protection counterpart
 *   working_path_nodes — ordered node names for the working path (semicolon-separated)
 *   protection_path_nodes — ordered node names for the protection path (semicolon-separated)
 *   transceiver — transceiver type ID from the library
 *
 * Valid protection values: none | olp | sncp | wson-restoration | 1+1+wson
 */
export const HUAWEI_NCE_SERVICES_TEMPLATE: ImportTemplate = {
  id: 'huawei-nce-services',
  source: 'huawei-nce',
  fileType: 'services',
  name: 'Huawei NCE — Services',
  description: 'Service export from Huawei NCE (L1 DWDM / L2 Ethernet / L3 IP)',
  columns: [
    { csvColumn: 'service_name', targetField: 'name', required: true },
    { csvColumn: 'service_type', targetField: 'type', required: true, transform: 'toServiceType' },
    { csvColumn: 'source_node', targetField: 'sourceNode', required: true },
    { csvColumn: 'destination_node', targetField: 'destinationNode', required: true },
    { csvColumn: 'data_rate', targetField: 'dataRate', required: false, defaultValue: '100G' },
    { csvColumn: 'modulation', targetField: 'modulation', required: false },
    { csvColumn: 'channel_number', targetField: 'channelNumber', required: false, transform: 'toNumber' },
    { csvColumn: 'lambda_frequency', targetField: 'lambdaFrequency', required: false, transform: 'toFrequency' },
    { csvColumn: 'protection', targetField: 'protection', required: false, transform: 'toProtectionScheme' },
    { csvColumn: 'service_role', targetField: 'serviceRole', required: false, transform: 'toServiceRole', defaultValue: 'working' },
    { csvColumn: 'protection_pair_id', targetField: 'protectionPairId', required: false },
    { csvColumn: 'working_path_nodes', targetField: 'workingPathNodes', required: false },
    { csvColumn: 'protection_path_nodes', targetField: 'protectionPathNodes', required: false },
    { csvColumn: 'transceiver', targetField: 'transceiverTypeId', required: false },
  ],
  sampleHeaders: [
    'service_name', 'service_type', 'source_node', 'destination_node',
    'data_rate', 'modulation', 'channel_number', 'lambda_frequency', 'protection',
    'service_role', 'protection_pair_id', 'working_path_nodes', 'protection_path_nodes', 'transceiver',
  ],
  sampleRows: [
    // Working + protection pair linked by protection_pair_id "PAIR-1"
    ['L1-Cairo-Alex-W', 'l1-dwdm', 'OADM-Cairo-01', 'Router-Alex-01', '100G', 'DP-QPSK', '1', '191.35', 'olp', 'working', 'PAIR-1', 'OADM-Cairo-01;AMP-Nile-01;Router-Alex-01', '', 'CFP2-DCO-100G'],
    ['L1-Cairo-Alex-P', 'l1-dwdm', 'OADM-Cairo-01', 'Router-Alex-01', '100G', 'DP-QPSK', '2', '191.40', 'olp', 'protection', 'PAIR-1', '', 'OADM-Cairo-01;Router-Alex-01', 'CFP2-DCO-100G'],
    // Standalone L2 service (no protection pair)
    ['L2-Cairo-Alex-10G', 'l2-ethernet', 'OADM-Cairo-01', 'Router-Alex-01', '10G', '', '', '', 'none', 'working', '', '', '', ''],
  ],
};

/** Huawei NCE Ports CSV template */
export const HUAWEI_NCE_PORTS_TEMPLATE: ImportTemplate = {
  id: 'huawei-nce-ports',
  source: 'huawei-nce',
  fileType: 'ports',
  name: 'Huawei NCE — Ports',
  description: 'Port configuration import for network nodes',
  columns: [
    { csvColumn: 'node_name', targetField: 'nodeName', required: true },
    { csvColumn: 'port_name', targetField: 'name', required: true },
    { csvColumn: 'port_type', targetField: 'type', required: true, transform: 'toPortType' },
    { csvColumn: 'data_rate', targetField: 'dataRate', required: false, defaultValue: '10G' },
    { csvColumn: 'channels', targetField: 'channels', required: false, transform: 'toNumber', defaultValue: 1 },
    { csvColumn: 'grid_type', targetField: 'gridType', required: false, defaultValue: 'fixed-50ghz' },
    { csvColumn: 'used_channels', targetField: 'usedChannels', required: false, transform: 'toChannelList' },
  ],
  sampleHeaders: ['node_name', 'port_name', 'port_type', 'data_rate', 'channels', 'grid_type', 'used_channels'],
  sampleRows: [
    ['OADM-Cairo-01', 'Line-3', 'dwdm', '100G', '96', 'fixed-50ghz', '1,2,5,12-18'],
    ['OADM-Cairo-01', 'Line-4', 'dwdm', '100G', '96', 'fixed-50ghz', ''],
    ['Router-Alex-01', 'Eth-3', 'bw', '10G', '1', '', ''],
  ],
};

/** All Huawei NCE templates indexed by file type */
export const HUAWEI_NCE_TEMPLATES: Record<string, ImportTemplate> = {
  nodes: HUAWEI_NCE_NODES_TEMPLATE,
  edges: HUAWEI_NCE_EDGES_TEMPLATE,
  services: HUAWEI_NCE_SERVICES_TEMPLATE,
  ports: HUAWEI_NCE_PORTS_TEMPLATE,
};

/**
 * Generate a downloadable CSV template string for a given file type.
 * Includes headers and 2-3 sample data rows.
 */
export function generateTemplateCsv(fileType: 'nodes' | 'edges' | 'services' | 'ports'): string {
  const template = HUAWEI_NCE_TEMPLATES[fileType];
  if (!template) return '';

  return buildCsv(template.sampleHeaders, template.sampleRows);
}

/**
 * Download a template CSV file for the given file type.
 */
export function downloadTemplateCsv(fileType: 'nodes' | 'edges' | 'services' | 'ports'): void {
  const csv = generateTemplateCsv(fileType);
  if (!csv) return;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `huawei-nce-${fileType}-template.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate a definitions/mapping document as CSV.
 * Contains all field names, types, allowed values, defaults, examples,
 * and all mapping tables used during import.
 */
export function generateDefinitionsDocument(): string {
  const sections: string[] = [];

  // Section separator helper
  const separator = () => '';

  // Section 1: Node Fields
  sections.push(buildCsv(
    ['Section', 'Field', 'Type', 'Required', 'Default', 'Allowed Values', 'Example'],
    [
      ['NODES', 'node_name', 'string', 'Yes', '', 'Any text (max 128 chars)', 'OADM-Cairo-01'],
      ['NODES', 'node_type', 'string', 'Yes', '', 'OADM/Router/Switch/EDFA/Terminal/OSP/Custom (see NODE_TYPE_MAP)', 'OADM'],
      ['NODES', 'vendor', 'string', 'No', 'huawei', 'huawei/nokia/cisco/juniper/ciena/generic (see VENDOR_MAP)', 'Huawei'],
      ['NODES', 'model', 'string', 'No', '', 'Any text', 'OptiX OSN 9800'],
      ['NODES', 'latitude', 'number', 'No', '', '-90 to 90 (decimal degrees)', '30.0444'],
      ['NODES', 'longitude', 'number', 'No', '', '-180 to 180 (decimal degrees)', '31.2357'],
      ['NODES', 'address', 'string', 'No', '', 'Any text', 'Cairo Data Center'],
      ['NODES', 'subtype', 'string', 'No', '', 'roadm/fixed/core/edge/pe/p/l2/l3', 'roadm'],
      ['NODES', 'size_flavor', 'string', 'No', 'medium', 'small/medium/large', 'medium'],
    ],
  ));

  sections.push(separator());

  // Section 2: Edge Fields
  sections.push(buildCsv(
    ['Section', 'Field', 'Type', 'Required', 'Default', 'Allowed Values', 'Example'],
    [
      ['EDGES', 'edge_name', 'string', 'Yes', '', 'Any text (max 128 chars)', 'Link-Cairo-Alex'],
      ['EDGES', 'source_node', 'string', 'Yes', '', 'Must match a node_name from Nodes CSV', 'OADM-Cairo-01'],
      ['EDGES', 'target_node', 'string', 'Yes', '', 'Must match a node_name from Nodes CSV', 'Router-Alex-01'],
      ['EDGES', 'distance_km', 'number', 'No', '0', 'Positive number (km)', '220'],
      ['EDGES', 'fiber_profile', 'string', 'No', 'G.652.D', 'G.652.D/G.654.E/G.655/G.657.A1/custom (see FIBER_PROFILE_MAP)', 'G.652.D'],
      ['EDGES', 'fiber_count', 'integer', 'No', '1', 'Positive integer', '48'],
      ['EDGES', 'srlg_codes', 'string', 'No', '', 'Semicolon/comma separated codes', 'SRLG-NILE-DELTA'],
      ['EDGES', 'source_port', 'string', 'No', '(auto)', 'Port name on source node (e.g., Line-1). Auto-allocated if omitted.', 'Line-1'],
      ['EDGES', 'target_port', 'string', 'No', '(auto)', 'Port name on target node (e.g., Line-2). Auto-allocated if omitted.', 'Line-2'],
    ],
  ));

  sections.push(separator());

  // Section 3: Service Fields
  sections.push(buildCsv(
    ['Section', 'Field', 'Type', 'Required', 'Default', 'Allowed Values', 'Example'],
    [
      ['SERVICES', 'service_name', 'string', 'Yes', '', 'Any text (max 128 chars)', 'L1-Cairo-Alex-W'],
      ['SERVICES', 'service_type', 'string', 'Yes', '', 'l1-dwdm/l2-ethernet/l3-ip (see SERVICE_TYPE_MAP)', 'l1-dwdm'],
      ['SERVICES', 'source_node', 'string', 'Yes', '', 'Must match a node_name from Nodes CSV', 'OADM-Cairo-01'],
      ['SERVICES', 'destination_node', 'string', 'Yes', '', 'Must match a node_name from Nodes CSV', 'Router-Alex-01'],
      ['SERVICES', 'data_rate', 'string', 'No', '100G', '10G/25G/100G/200G/400G', '100G'],
      ['SERVICES', 'modulation', 'string', 'No', '', 'DP-QPSK/DP-8QAM/DP-16QAM/DP-32QAM/DP-64QAM', 'DP-QPSK'],
      ['SERVICES', 'channel_number', 'integer', 'No', '', '1-96 (ITU-T C-band)', '1'],
      ['SERVICES', 'lambda_frequency', 'number', 'No', '', 'Frequency in THz (191.35-196.10 for C-band 50GHz grid)', '191.35'],
      ['SERVICES', 'protection', 'string', 'No', 'none', 'none/olp/sncp/wson-restoration/1+1+wson (see PROTECTION_SCHEME_MAP)', 'olp'],
      ['SERVICES', 'service_role', 'string', 'No', 'working', 'working/protection (see SERVICE_ROLE_MAP)', 'working'],
      ['SERVICES', 'protection_pair_id', 'string', 'No', '', 'Arbitrary ID linking working+protection pair', 'PAIR-1'],
      ['SERVICES', 'working_path_nodes', 'string', 'No', '', 'Semicolon-separated node names (ordered)', 'NodeA;NodeB;NodeC'],
      ['SERVICES', 'protection_path_nodes', 'string', 'No', '', 'Semicolon-separated node names (ordered)', 'NodeA;NodeD;NodeC'],
      ['SERVICES', 'transceiver', 'string', 'No', '', 'Transceiver type ID from library', 'CFP2-DCO-100G'],
    ],
  ));

  sections.push(separator());

  // Section 4: NODE_TYPE_MAP
  sections.push(buildCsv(
    ['Mapping Table', 'Input Value', 'Maps To'],
    [
      ['NODE_TYPE_MAP', 'oadm / roadm / dwdm / optix / ola / wss', 'oadm'],
      ['NODE_TYPE_MAP', 'router / ne40e / ne8000 / atn / netengine / pe / p / ce', 'router'],
      ['NODE_TYPE_MAP', 'switch / ce6800 / ce12800 / s6700', 'switch'],
      ['NODE_TYPE_MAP', 'amplifier / edfa / raman / ila / amp', 'amplifier'],
      ['NODE_TYPE_MAP', 'terminal / otn / muxponder / transponder', 'terminal'],
      ['NODE_TYPE_MAP', 'osp-termination / osp / splice / fdf', 'osp-termination'],
      ['NODE_TYPE_MAP', 'custom / other / unknown', 'custom'],
    ],
  ));

  sections.push(separator());

  // Section 5: VENDOR_MAP
  sections.push(buildCsv(
    ['Mapping Table', 'Input Value', 'Maps To'],
    [
      ['VENDOR_MAP', 'huawei / hw', 'huawei'],
      ['VENDOR_MAP', 'nokia / alu / alcatel / alcatel-lucent', 'nokia'],
      ['VENDOR_MAP', 'cisco', 'cisco'],
      ['VENDOR_MAP', 'juniper / jnpr', 'juniper'],
      ['VENDOR_MAP', 'ciena', 'ciena'],
      ['VENDOR_MAP', 'generic / other / (empty)', 'generic'],
    ],
  ));

  sections.push(separator());

  // Section 6: FIBER_PROFILE_MAP
  sections.push(buildCsv(
    ['Mapping Table', 'Input Value', 'Maps To'],
    [
      ['FIBER_PROFILE_MAP', 'g.652.d / g652d / g.652 / smf', 'G.652.D'],
      ['FIBER_PROFILE_MAP', 'g.654.e / g654e / g.654', 'G.654.E'],
      ['FIBER_PROFILE_MAP', 'g.655 / g655 / nzdsf', 'G.655'],
      ['FIBER_PROFILE_MAP', 'g.657.a1 / g657a1 / g.657', 'G.657.A1'],
      ['FIBER_PROFILE_MAP', 'custom', 'custom'],
    ],
  ));

  sections.push(separator());

  // Section 7: SERVICE_TYPE_MAP
  sections.push(buildCsv(
    ['Mapping Table', 'Input Value', 'Maps To'],
    [
      ['SERVICE_TYPE_MAP', 'l1-dwdm / l1 / dwdm / optical / lambda / och', 'l1-dwdm'],
      ['SERVICE_TYPE_MAP', 'l2-ethernet / l2 / ethernet / eth / epline', 'l2-ethernet'],
      ['SERVICE_TYPE_MAP', 'l3-ip / l3 / ip / ipvpn / l3vpn', 'l3-ip'],
    ],
  ));

  sections.push(separator());

  // Section 8: PROTECTION_SCHEME_MAP
  sections.push(buildCsv(
    ['Mapping Table', 'Input Value', 'Maps To'],
    [
      ['PROTECTION_SCHEME_MAP', 'none / unprotected / (empty)', 'none'],
      ['PROTECTION_SCHEME_MAP', 'olp / 1+1 / 1:1', 'olp'],
      ['PROTECTION_SCHEME_MAP', 'sncp', 'sncp'],
      ['PROTECTION_SCHEME_MAP', 'wson-restoration / wson / restoration', 'wson-restoration'],
      ['PROTECTION_SCHEME_MAP', '1+1+wson / olp+wson', '1+1+wson'],
    ],
  ));

  sections.push(separator());

  // Section 9: SERVICE_ROLE_MAP
  sections.push(buildCsv(
    ['Mapping Table', 'Input Value', 'Maps To'],
    [
      ['SERVICE_ROLE_MAP', 'working / work / primary / main / w', 'working'],
      ['SERVICE_ROLE_MAP', 'protection / protect / backup / secondary / p', 'protection'],
    ],
  ));

  sections.push(separator());

  // Section 10: Port Fields
  sections.push(buildCsv(
    ['Section', 'Field', 'Type', 'Required', 'Default', 'Allowed Values', 'Example'],
    [
      ['PORTS', 'node_name', 'string', 'Yes', '', 'Must match a node_name from Nodes CSV', 'OADM-Cairo-01'],
      ['PORTS', 'port_name', 'string', 'Yes', '', 'Any text (max 128 chars)', 'Line-3'],
      ['PORTS', 'port_type', 'string', 'Yes', '', 'dwdm/bw (see PORT_TYPE_MAP)', 'dwdm'],
      ['PORTS', 'data_rate', 'string', 'No', '10G', '1G/10G/25G/100G/400G', '100G'],
      ['PORTS', 'channels', 'integer', 'No', '1', '1 (B/W) or up to 96 (DWDM)', '96'],
      ['PORTS', 'grid_type', 'string', 'No', 'fixed-50ghz', 'fixed-50ghz/fixed-100ghz/flex-grid', 'fixed-50ghz'],
      ['PORTS', 'used_channels', 'string', 'No', '', 'Comma-separated channels and/or dash ranges (1-96). E.g. "1,2,5,12-18"', '1,2,5,12-18'],
    ],
  ));

  sections.push(separator());

  // Section 11: PORT_TYPE_MAP
  sections.push(buildCsv(
    ['Mapping Table', 'Input Value', 'Maps To'],
    [
      ['PORT_TYPE_MAP', 'dwdm / wdm / lambda / optical', 'dwdm'],
      ['PORT_TYPE_MAP', 'bw / bandwidth / ethernet / eth / (other)', 'bw'],
    ],
  ));

  return sections.join('\n');
}

/**
 * Download the definitions/mapping document as CSV.
 */
export function downloadDefinitionsDocument(): void {
  const csv = generateDefinitionsDocument();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'huawei-nce-import-definitions.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
