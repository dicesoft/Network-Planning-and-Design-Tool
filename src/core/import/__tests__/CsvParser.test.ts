import { describe, it, expect } from 'vitest';
import { parseCsv } from '../CsvParser';

describe('CsvParser', () => {
  it('should parse basic CSV with headers', () => {
    const csv = 'name,type,vendor\nNode1,router,huawei\nNode2,oadm,nokia';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['name', 'type', 'vendor']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ name: 'Node1', type: 'router', vendor: 'huawei' });
    expect(result.rows[1]).toEqual({ name: 'Node2', type: 'oadm', vendor: 'nokia' });
    expect(result.rawRowCount).toBe(2);
  });

  it('should handle UTF-8 BOM', () => {
    const bom = '\uFEFF';
    const csv = `${bom}name,type\nNode1,router`;
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['name', 'type']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ name: 'Node1', type: 'router' });
  });

  it('should handle quoted values with commas inside', () => {
    const csv = 'name,address,type\n"Node, Cairo","""Main Road"", Building A",router';
    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]['name']).toBe('Node, Cairo');
    expect(result.rows[0]['address']).toBe('"Main Road", Building A');
    expect(result.rows[0]['type']).toBe('router');
  });

  it('should filter empty rows', () => {
    const csv = 'name,type\nNode1,router\n\n\nNode2,oadm\n  \n';
    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]['name']).toBe('Node1');
    expect(result.rows[1]['name']).toBe('Node2');
  });

  it('should sanitize formula injection characters', () => {
    const csv = 'name,formula\nNode1,=SUM(A1)\nNode2,+cmd\nNode3,-alert(1)\nNode4,@import';
    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(4);
    // sanitizeCsvValue prefixes dangerous chars with a single quote
    expect(result.rows[0]['formula']).toBe("'=SUM(A1)");
    expect(result.rows[1]['formula']).toBe("'+cmd");
    expect(result.rows[2]['formula']).toBe("'-alert(1)");
    expect(result.rows[3]['formula']).toBe("'@import");
  });

  it('should handle CRLF line endings', () => {
    const csv = 'name,type\r\nNode1,router\r\nNode2,oadm';
    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]['name']).toBe('Node1');
    expect(result.rows[1]['name']).toBe('Node2');
  });

  it('should handle CR-only line endings', () => {
    const csv = 'name,type\rNode1,router\rNode2,oadm';
    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(2);
  });

  it('should lowercase header names', () => {
    const csv = 'Node_Name,NODE_TYPE,Vendor\nNode1,router,huawei';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['node_name', 'node_type', 'vendor']);
    expect(result.rows[0]['node_name']).toBe('Node1');
  });

  it('should return empty result for empty content', () => {
    const result = parseCsv('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.rawRowCount).toBe(0);
  });

  it('should handle rows with fewer fields than headers', () => {
    const csv = 'name,type,vendor\nNode1,router';
    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]['name']).toBe('Node1');
    expect(result.rows[0]['type']).toBe('router');
    expect(result.rows[0]['vendor']).toBe(''); // Missing field gets empty string
  });

  it('should handle rows with more fields than headers (extra fields ignored)', () => {
    const csv = 'name,type\nNode1,router,extra1,extra2';
    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]['name']).toBe('Node1');
    expect(result.rows[0]['type']).toBe('router');
    // Extra fields beyond header count are not included
  });
});
