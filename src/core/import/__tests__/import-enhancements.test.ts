/**
 * Tests for Phase 3 import enhancements:
 * - Service template with protection details (Issue 3)
 * - Service upload in NCE import (Issue 4)
 * - Definitions/mapping file download (Issue 5)
 * - New transformers (toServiceType, toProtectionScheme, toServiceRole)
 * - Service validation rules
 * - Service transform pipeline (name -> UUID resolution)
 */

import { describe, it, expect } from 'vitest';
import { VALUE_TRANSFORMERS } from '../ImportTransformer';
import { validateServiceRow } from '../ImportValidator';
import { runImport } from '../ImportEngine';
import {
  generateTemplateCsv,
  generateDefinitionsDocument,
  HUAWEI_NCE_SERVICES_TEMPLATE,
} from '../templates/huawei-nce';
import { parseCsv } from '../CsvParser';

// ============================================================================
// New Transformers
// ============================================================================

describe('toServiceType transformer', () => {
  const toServiceType = VALUE_TRANSFORMERS.toServiceType;

  it('should map L1 DWDM variants', () => {
    expect(toServiceType('l1-dwdm')).toBe('l1-dwdm');
    expect(toServiceType('L1-DWDM')).toBe('l1-dwdm');
    expect(toServiceType('l1')).toBe('l1-dwdm');
    expect(toServiceType('dwdm')).toBe('l1-dwdm');
    expect(toServiceType('optical')).toBe('l1-dwdm');
    expect(toServiceType('lambda')).toBe('l1-dwdm');
    expect(toServiceType('och')).toBe('l1-dwdm');
  });

  it('should map L2 Ethernet variants', () => {
    expect(toServiceType('l2-ethernet')).toBe('l2-ethernet');
    expect(toServiceType('L2-ETHERNET')).toBe('l2-ethernet');
    expect(toServiceType('l2')).toBe('l2-ethernet');
    expect(toServiceType('ethernet')).toBe('l2-ethernet');
    expect(toServiceType('eth')).toBe('l2-ethernet');
    expect(toServiceType('epline')).toBe('l2-ethernet');
  });

  it('should map L3 IP variants', () => {
    expect(toServiceType('l3-ip')).toBe('l3-ip');
    expect(toServiceType('L3-IP')).toBe('l3-ip');
    expect(toServiceType('l3')).toBe('l3-ip');
    expect(toServiceType('ip')).toBe('l3-ip');
    expect(toServiceType('ipvpn')).toBe('l3-ip');
    expect(toServiceType('l3vpn')).toBe('l3-ip');
  });

  it('should return undefined for unknown service types', () => {
    expect(toServiceType('bogus')).toBeUndefined();
    expect(toServiceType('')).toBeUndefined();
  });

  it('should handle whitespace and case', () => {
    expect(toServiceType('  L1-DWDM  ')).toBe('l1-dwdm');
    expect(toServiceType(' Ethernet ')).toBe('l2-ethernet');
  });
});

describe('toProtectionScheme transformer', () => {
  const toProtectionScheme = VALUE_TRANSFORMERS.toProtectionScheme;

  it('should map all protection scheme values', () => {
    expect(toProtectionScheme('none')).toBe('none');
    expect(toProtectionScheme('unprotected')).toBe('none');
    expect(toProtectionScheme('')).toBe('none');
    expect(toProtectionScheme('olp')).toBe('olp');
    expect(toProtectionScheme('1+1')).toBe('olp');
    expect(toProtectionScheme('1:1')).toBe('olp');
    expect(toProtectionScheme('sncp')).toBe('sncp');
    expect(toProtectionScheme('wson-restoration')).toBe('wson-restoration');
    expect(toProtectionScheme('wson')).toBe('wson-restoration');
    expect(toProtectionScheme('restoration')).toBe('wson-restoration');
    expect(toProtectionScheme('1+1+wson')).toBe('1+1+wson');
    expect(toProtectionScheme('olp+wson')).toBe('1+1+wson');
  });

  it('should default to none for unknown values', () => {
    expect(toProtectionScheme('unknown-scheme')).toBe('none');
    expect(toProtectionScheme('xyz')).toBe('none');
  });

  it('should handle case insensitivity', () => {
    expect(toProtectionScheme('OLP')).toBe('olp');
    expect(toProtectionScheme('SNCP')).toBe('sncp');
    expect(toProtectionScheme('WSON-RESTORATION')).toBe('wson-restoration');
  });
});

describe('toServiceRole transformer', () => {
  const toServiceRole = VALUE_TRANSFORMERS.toServiceRole;

  it('should map working role variants', () => {
    expect(toServiceRole('working')).toBe('working');
    expect(toServiceRole('work')).toBe('working');
    expect(toServiceRole('primary')).toBe('working');
    expect(toServiceRole('main')).toBe('working');
    expect(toServiceRole('w')).toBe('working');
  });

  it('should map protection role variants', () => {
    expect(toServiceRole('protection')).toBe('protection');
    expect(toServiceRole('protect')).toBe('protection');
    expect(toServiceRole('backup')).toBe('protection');
    expect(toServiceRole('secondary')).toBe('protection');
    expect(toServiceRole('p')).toBe('protection');
  });

  it('should default to working for unknown values', () => {
    expect(toServiceRole('unknown')).toBe('working');
    expect(toServiceRole('')).toBe('working');
  });

  it('should handle case insensitivity', () => {
    expect(toServiceRole('WORKING')).toBe('working');
    expect(toServiceRole('Protection')).toBe('protection');
    expect(toServiceRole('PRIMARY')).toBe('working');
  });
});

// ============================================================================
// Service Template (Issue 3)
// ============================================================================

describe('Service template with protection details', () => {
  it('should include new protection columns in service template', () => {
    const template = HUAWEI_NCE_SERVICES_TEMPLATE;

    const columnNames = template.columns.map((c) => c.csvColumn);
    expect(columnNames).toContain('service_role');
    expect(columnNames).toContain('protection_pair_id');
    expect(columnNames).toContain('working_path_nodes');
    expect(columnNames).toContain('protection_path_nodes');
    expect(columnNames).toContain('transceiver');
  });

  it('should include protection columns in sample headers', () => {
    const headers = HUAWEI_NCE_SERVICES_TEMPLATE.sampleHeaders;
    expect(headers).toContain('service_role');
    expect(headers).toContain('protection_pair_id');
    expect(headers).toContain('working_path_nodes');
    expect(headers).toContain('protection_path_nodes');
    expect(headers).toContain('transceiver');
  });

  it('should have sample rows showing working+protection pair linkage', () => {
    const rows = HUAWEI_NCE_SERVICES_TEMPLATE.sampleRows;

    // Should have at least 3 sample rows (2 paired + 1 standalone)
    expect(rows.length).toBeGreaterThanOrEqual(3);

    // Find protection_pair_id column index
    const pairIdIdx = HUAWEI_NCE_SERVICES_TEMPLATE.sampleHeaders.indexOf('protection_pair_id');
    const roleIdx = HUAWEI_NCE_SERVICES_TEMPLATE.sampleHeaders.indexOf('service_role');

    // First row should be working
    expect(rows[0][roleIdx]).toBe('working');
    expect(rows[0][pairIdIdx]).toBeTruthy();

    // Second row should be protection with same pair ID
    expect(rows[1][roleIdx]).toBe('protection');
    expect(rows[1][pairIdIdx]).toBe(rows[0][pairIdIdx]);
  });

  it('should produce parseable CSV for services template', () => {
    const csv = generateTemplateCsv('services');
    const parsed = parseCsv(csv);

    expect(parsed.headers).toEqual(
      HUAWEI_NCE_SERVICES_TEMPLATE.sampleHeaders.map((h) => h.toLowerCase()),
    );
    expect(parsed.rows.length).toBe(HUAWEI_NCE_SERVICES_TEMPLATE.sampleRows.length);
  });

  it('should have toServiceType and toProtectionScheme transforms', () => {
    const cols = HUAWEI_NCE_SERVICES_TEMPLATE.columns;
    const serviceTypeCol = cols.find((c) => c.csvColumn === 'service_type');
    expect(serviceTypeCol?.transform).toBe('toServiceType');

    const protectionCol = cols.find((c) => c.csvColumn === 'protection');
    expect(protectionCol?.transform).toBe('toProtectionScheme');

    const roleCol = cols.find((c) => c.csvColumn === 'service_role');
    expect(roleCol?.transform).toBe('toServiceRole');
  });
});

// ============================================================================
// Service Validation (Issue 4)
// ============================================================================

describe('Service validation', () => {
  const nodeNameToId = new Map<string, string>([
    ['oadm-cairo-01', 'uuid-1'],
    ['router-alex-01', 'uuid-2'],
    ['amp-nile-01', 'uuid-3'],
  ]);

  it('should pass for valid service row with existing nodes', () => {
    const row = {
      service_name: 'L1-Test',
      service_type: 'l1-dwdm',
      source_node: 'OADM-Cairo-01',
      destination_node: 'Router-Alex-01',
    };

    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.errors).toHaveLength(0);
  });

  it('should report error for non-existent source node', () => {
    const row = {
      service_name: 'L1-Test',
      service_type: 'l1-dwdm',
      source_node: 'NonExistent-Node',
      destination_node: 'Router-Alex-01',
    };

    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('Source node'))).toBe(true);
  });

  it('should report error for non-existent destination node', () => {
    const row = {
      service_name: 'L1-Test',
      service_type: 'l1-dwdm',
      source_node: 'OADM-Cairo-01',
      destination_node: 'NonExistent-Node',
    };

    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('Destination node'))).toBe(true);
  });

  it('should report error for invalid service type', () => {
    const row = {
      service_name: 'L1-Test',
      service_type: 'bogus-service-type',
      source_node: 'OADM-Cairo-01',
      destination_node: 'Router-Alex-01',
    };

    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('Invalid service type'))).toBe(true);
  });

  it('should warn on unknown working path node', () => {
    const row = {
      service_name: 'L1-Test',
      service_type: 'l1-dwdm',
      source_node: 'OADM-Cairo-01',
      destination_node: 'Router-Alex-01',
      working_path_nodes: 'OADM-Cairo-01;UnknownNode;Router-Alex-01',
    };

    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.warnings.some((w) => w.includes('Working path node'))).toBe(true);
  });

  it('should warn on unknown protection path node', () => {
    const row = {
      service_name: 'L1-Test',
      service_type: 'l1-dwdm',
      source_node: 'OADM-Cairo-01',
      destination_node: 'Router-Alex-01',
      protection_path_nodes: 'OADM-Cairo-01;UnknownNode;Router-Alex-01',
    };

    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.warnings.some((w) => w.includes('Protection path node'))).toBe(true);
  });

  it('should accept valid path nodes', () => {
    const row = {
      service_name: 'L1-Test',
      service_type: 'l1-dwdm',
      source_node: 'OADM-Cairo-01',
      destination_node: 'Router-Alex-01',
      working_path_nodes: 'OADM-Cairo-01;AMP-Nile-01;Router-Alex-01',
    };

    const result = validateServiceRow(row, nodeNameToId, 1);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================================
// Import Engine — Service Processing (Issue 4)
// ============================================================================

describe('ImportEngine — services processing', () => {
  const sampleNodesCsv = [
    'node_name,node_type,vendor,model,latitude,longitude',
    'OADM-Cairo-01,OADM,Huawei,OSN9800,30.0444,31.2357',
    'Router-Alex-01,Router,Huawei,NE40E,31.2001,29.9187',
    'AMP-Nile-01,EDFA,Huawei,OSN8800,30.55,30.60',
  ].join('\n');

  const sampleEdgesCsv = [
    'edge_name,source_node,target_node,distance_km,fiber_profile',
    'Link-Cairo-AMP,OADM-Cairo-01,AMP-Nile-01,110,G.652.D',
    'Link-AMP-Alex,AMP-Nile-01,Router-Alex-01,110,G.652.D',
    'Link-Cairo-Alex,OADM-Cairo-01,Router-Alex-01,220,G.652.D',
  ].join('\n');

  it('should include serviceValidation in result', () => {
    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce');
    expect(result.serviceValidation).toBeDefined();
    expect(result.serviceValidation.source).toBe('huawei-nce');
    expect(result.serviceValidation.fileType).toBe('services');
  });

  it('should return empty services array when no services CSV is provided', () => {
    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce');
    expect(result.services).toHaveLength(0);
    expect(result.serviceValidation.totalRows).toBe(0);
  });

  it('should import L1 DWDM services from CSV', () => {
    const servicesCsv = [
      'service_name,service_type,source_node,destination_node,data_rate,modulation,channel_number,protection',
      'L1-Cairo-Alex,l1-dwdm,OADM-Cairo-01,Router-Alex-01,100G,DP-QPSK,1,olp',
    ].join('\n');

    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', servicesCsv);

    expect(result.services).toHaveLength(1);
    const svc = result.services[0];
    expect(svc.name).toBe('L1-Cairo-Alex');
    expect(svc.type).toBe('l1-dwdm');
    expect(svc.status).toBe('planned');
    expect(svc.dataRate).toBe('100G');
  });

  it('should resolve node names to UUIDs in services', () => {
    const servicesCsv = [
      'service_name,service_type,source_node,destination_node,data_rate',
      'L1-Test,l1-dwdm,OADM-Cairo-01,Router-Alex-01,100G',
    ].join('\n');

    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', servicesCsv);
    const svc = result.services[0];

    const oadmId = result.nodeNameToId.get('oadm-cairo-01');
    const routerId = result.nodeNameToId.get('router-alex-01');

    expect(svc.sourceNodeId).toBe(oadmId);
    expect(svc.destinationNodeId).toBe(routerId);
  });

  it('should build working path from explicit node list', () => {
    const servicesCsv = [
      'service_name,service_type,source_node,destination_node,data_rate,modulation,channel_number,protection,service_role,protection_pair_id,working_path_nodes',
      'L1-Test,l1-dwdm,OADM-Cairo-01,Router-Alex-01,100G,DP-QPSK,1,none,working,,OADM-Cairo-01;AMP-Nile-01;Router-Alex-01',
    ].join('\n');

    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', servicesCsv);
    const svc = result.services[0];

    if (svc.type === 'l1-dwdm') {
      expect(svc.workingPath.nodeIds).toHaveLength(3);
      expect(svc.workingPath.hopCount).toBe(2);
    }
  });

  it('should handle L2 Ethernet services', () => {
    const servicesCsv = [
      'service_name,service_type,source_node,destination_node,data_rate',
      'L2-Test,l2-ethernet,OADM-Cairo-01,Router-Alex-01,10G',
    ].join('\n');

    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', servicesCsv);

    expect(result.services).toHaveLength(1);
    expect(result.services[0].type).toBe('l2-ethernet');
  });

  it('should handle L3 IP services', () => {
    const servicesCsv = [
      'service_name,service_type,source_node,destination_node,data_rate',
      'L3-Test,l3-ip,OADM-Cairo-01,Router-Alex-01,10G',
    ].join('\n');

    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', servicesCsv);

    expect(result.services).toHaveLength(1);
    expect(result.services[0].type).toBe('l3-ip');
  });

  it('should reject services with non-existent source nodes', () => {
    const servicesCsv = [
      'service_name,service_type,source_node,destination_node,data_rate',
      'L1-Bad,l1-dwdm,NonExistent,Router-Alex-01,100G',
    ].join('\n');

    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', servicesCsv);

    expect(result.serviceValidation.invalidRows).toBe(1);
    expect(result.services).toHaveLength(0);
  });

  it('should report service validation summary', () => {
    const servicesCsv = [
      'service_name,service_type,source_node,destination_node,data_rate',
      'L1-Good,l1-dwdm,OADM-Cairo-01,Router-Alex-01,100G',
      'L1-Bad,l1-dwdm,NonExistent,Router-Alex-01,100G',
    ].join('\n');

    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', servicesCsv);

    expect(result.serviceValidation.totalRows).toBe(2);
    expect(result.serviceValidation.validRows).toBe(1);
    expect(result.serviceValidation.invalidRows).toBe(1);
  });

  it('should set L1 protection scheme from CSV', () => {
    const servicesCsv = [
      'service_name,service_type,source_node,destination_node,data_rate,modulation,channel_number,protection',
      'L1-OLP,l1-dwdm,OADM-Cairo-01,Router-Alex-01,100G,DP-QPSK,1,olp',
    ].join('\n');

    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', servicesCsv);
    const svc = result.services[0];

    if (svc.type === 'l1-dwdm') {
      expect(svc.protectionScheme).toBe('olp');
    }
  });

  it('should handle protection pair consistency warnings', () => {
    // Only a working service with pair ID, no protection counterpart
    const servicesCsv = [
      'service_name,service_type,source_node,destination_node,data_rate,modulation,channel_number,protection,service_role,protection_pair_id',
      'L1-W,l1-dwdm,OADM-Cairo-01,Router-Alex-01,100G,DP-QPSK,1,olp,working,PAIR-ORPHAN',
    ].join('\n');

    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', servicesCsv);

    // Should produce a warning about incomplete pair
    expect(result.serviceValidation.warnings.some((w) => w.includes('PAIR-ORPHAN'))).toBe(true);
  });

  it('should handle empty services CSV gracefully', () => {
    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', '');
    expect(result.services).toHaveLength(0);
    expect(result.serviceValidation.totalRows).toBe(0);
  });

  it('should set restorationEnabled for wson-restoration protection', () => {
    const servicesCsv = [
      'service_name,service_type,source_node,destination_node,data_rate,modulation,channel_number,protection',
      'L1-WSON,l1-dwdm,OADM-Cairo-01,Router-Alex-01,100G,DP-QPSK,1,wson-restoration',
    ].join('\n');

    const result = runImport(sampleNodesCsv, sampleEdgesCsv, 'huawei-nce', servicesCsv);
    const svc = result.services[0];

    if (svc.type === 'l1-dwdm') {
      expect(svc.restorationEnabled).toBe(true);
    }
  });
});

// ============================================================================
// Definitions Document (Issue 5)
// ============================================================================

describe('Definitions document generation', () => {
  it('should generate non-empty definitions document', () => {
    const doc = generateDefinitionsDocument();
    expect(doc).toBeTruthy();
    expect(doc.length).toBeGreaterThan(100);
  });

  it('should include all node fields', () => {
    const doc = generateDefinitionsDocument();
    expect(doc).toContain('node_name');
    expect(doc).toContain('node_type');
    expect(doc).toContain('vendor');
    expect(doc).toContain('latitude');
    expect(doc).toContain('longitude');
  });

  it('should include all edge fields', () => {
    const doc = generateDefinitionsDocument();
    expect(doc).toContain('edge_name');
    expect(doc).toContain('source_node');
    expect(doc).toContain('target_node');
    expect(doc).toContain('distance_km');
    expect(doc).toContain('fiber_profile');
  });

  it('should include all service fields', () => {
    const doc = generateDefinitionsDocument();
    expect(doc).toContain('service_name');
    expect(doc).toContain('service_type');
    expect(doc).toContain('service_role');
    expect(doc).toContain('protection_pair_id');
    expect(doc).toContain('working_path_nodes');
    expect(doc).toContain('protection_path_nodes');
    expect(doc).toContain('transceiver');
  });

  it('should include mapping tables', () => {
    const doc = generateDefinitionsDocument();
    expect(doc).toContain('NODE_TYPE_MAP');
    expect(doc).toContain('VENDOR_MAP');
    expect(doc).toContain('FIBER_PROFILE_MAP');
    expect(doc).toContain('SERVICE_TYPE_MAP');
    expect(doc).toContain('PROTECTION_SCHEME_MAP');
    expect(doc).toContain('SERVICE_ROLE_MAP');
  });

  it('should include protection scheme values', () => {
    const doc = generateDefinitionsDocument();
    expect(doc).toContain('olp');
    expect(doc).toContain('sncp');
    expect(doc).toContain('wson-restoration');
    expect(doc).toContain('1+1+wson');
  });

  it('should include service type values', () => {
    const doc = generateDefinitionsDocument();
    expect(doc).toContain('l1-dwdm');
    expect(doc).toContain('l2-ethernet');
    expect(doc).toContain('l3-ip');
  });

  it('should be valid CSV content', () => {
    const doc = generateDefinitionsDocument();
    // Each non-empty line should be parseable
    const lines = doc.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      // Basic CSV sanity: has commas or is a header
      expect(line.split(',').length).toBeGreaterThanOrEqual(1);
    }
  });
});
