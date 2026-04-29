import { describe, it, expect } from 'vitest';
import { generateTemplateCsv, HUAWEI_NCE_TEMPLATES } from '../templates/huawei-nce';
import { parseCsv } from '../CsvParser';

describe('Huawei NCE Template', () => {
  it('should generate nodes CSV with correct headers', () => {
    const csv = generateTemplateCsv('nodes');

    expect(csv).toBeTruthy();
    expect(csv).toContain('node_name');
    expect(csv).toContain('node_type');
    expect(csv).toContain('vendor');
    expect(csv).toContain('latitude');
    expect(csv).toContain('longitude');
  });

  it('should generate edges CSV with correct headers', () => {
    const csv = generateTemplateCsv('edges');

    expect(csv).toBeTruthy();
    expect(csv).toContain('edge_name');
    expect(csv).toContain('source_node');
    expect(csv).toContain('target_node');
    expect(csv).toContain('distance_km');
    expect(csv).toContain('fiber_profile');
  });

  it('should generate services CSV with correct headers', () => {
    const csv = generateTemplateCsv('services');

    expect(csv).toBeTruthy();
    expect(csv).toContain('service_name');
    expect(csv).toContain('service_type');
    expect(csv).toContain('source_node');
    expect(csv).toContain('destination_node');
  });

  it('should produce parseable CSV for nodes template', () => {
    const csv = generateTemplateCsv('nodes');
    const parsed = parseCsv(csv);

    expect(parsed.headers).toEqual(HUAWEI_NCE_TEMPLATES.nodes.sampleHeaders);
    expect(parsed.rows.length).toBe(HUAWEI_NCE_TEMPLATES.nodes.sampleRows.length);

    // Verify sample data is valid and parseable
    const firstRow = parsed.rows[0];
    expect(firstRow['node_name']).toBeTruthy();
    expect(firstRow['node_type']).toBeTruthy();
  });

  it('should produce parseable CSV for edges template', () => {
    const csv = generateTemplateCsv('edges');
    const parsed = parseCsv(csv);

    expect(parsed.headers).toEqual(HUAWEI_NCE_TEMPLATES.edges.sampleHeaders);
    expect(parsed.rows.length).toBe(HUAWEI_NCE_TEMPLATES.edges.sampleRows.length);
  });

  it('should have matching column count in headers and sample data', () => {
    for (const key of ['nodes', 'edges', 'services'] as const) {
      const template = HUAWEI_NCE_TEMPLATES[key];
      const headerCount = template.sampleHeaders.length;

      for (let i = 0; i < template.sampleRows.length; i++) {
        expect(template.sampleRows[i].length).toBe(headerCount);
      }
    }
  });

  it('should return empty string for invalid file type', () => {
    // @ts-expect-error - testing invalid input
    const csv = generateTemplateCsv('invalid-type');
    expect(csv).toBe('');
  });
});
