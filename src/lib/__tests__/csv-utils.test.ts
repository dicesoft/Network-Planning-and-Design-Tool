import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizeCsvValue,
  escapeCsvCell,
  toCsvRow,
  buildCsv,
  downloadCsv,
} from '../csv-utils';

// ============================================================================
// sanitizeCsvValue
// ============================================================================

describe('sanitizeCsvValue', () => {
  it('should return empty string unchanged', () => {
    expect(sanitizeCsvValue('')).toBe('');
  });

  it('should return safe values unchanged', () => {
    expect(sanitizeCsvValue('hello')).toBe('hello');
    expect(sanitizeCsvValue('123')).toBe('123');
    expect(sanitizeCsvValue('Node A')).toBe('Node A');
  });

  it('should prefix = with single quote', () => {
    expect(sanitizeCsvValue('=CMD("calc")')).toBe("'=CMD(\"calc\")");
    expect(sanitizeCsvValue('=1+1')).toBe("'=1+1");
  });

  it('should prefix + with single quote', () => {
    expect(sanitizeCsvValue('+CMD("calc")')).toBe("'+CMD(\"calc\")");
    expect(sanitizeCsvValue('+44 1234 567890')).toBe("'+44 1234 567890");
  });

  it('should prefix - with single quote', () => {
    expect(sanitizeCsvValue('-CMD("calc")')).toBe("'-CMD(\"calc\")");
    expect(sanitizeCsvValue('-100')).toBe("'-100");
  });

  it('should prefix @ with single quote', () => {
    expect(sanitizeCsvValue('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
    expect(sanitizeCsvValue('@user')).toBe("'@user");
  });

  it('should prefix tab character with single quote', () => {
    expect(sanitizeCsvValue('\tsome text')).toBe("'\tsome text");
  });

  it('should prefix carriage return with single quote', () => {
    expect(sanitizeCsvValue('\rsome text')).toBe("'\rsome text");
  });

  it('should NOT prefix values with safe leading characters', () => {
    expect(sanitizeCsvValue('abc')).toBe('abc');
    expect(sanitizeCsvValue('100')).toBe('100');
    expect(sanitizeCsvValue(' leading space')).toBe(' leading space');
    expect(sanitizeCsvValue('"quoted"')).toBe('"quoted"');
  });

  it('should only check the first character', () => {
    // = in the middle should not be escaped
    expect(sanitizeCsvValue('a=b')).toBe('a=b');
    expect(sanitizeCsvValue('foo+bar')).toBe('foo+bar');
    expect(sanitizeCsvValue('some-value')).toBe('some-value');
    expect(sanitizeCsvValue('email@test.com')).toBe('email@test.com');
  });
});

// ============================================================================
// escapeCsvCell
// ============================================================================

describe('escapeCsvCell', () => {
  it('should handle null and undefined', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('should convert numbers to string', () => {
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(3.14)).toBe('3.14');
  });

  it('should convert booleans to string', () => {
    expect(escapeCsvCell(true)).toBe('true');
    expect(escapeCsvCell(false)).toBe('false');
  });

  it('should sanitize and escape combined', () => {
    // Contains comma AND starts with =
    expect(escapeCsvCell('=SUM(A1,A2)')).toBe("\"'=SUM(A1,A2)\"");
  });

  it('should quote values with commas', () => {
    expect(escapeCsvCell('hello, world')).toBe('"hello, world"');
  });

  it('should quote and double-escape internal double quotes', () => {
    expect(escapeCsvCell('say "hello"')).toBe('"say ""hello"""');
  });

  it('should quote values with newlines', () => {
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('should sanitize dangerous leading chars', () => {
    expect(escapeCsvCell('=HYPERLINK("evil")')).toBe("\"'=HYPERLINK(\"\"evil\"\")\"");
  });

  it('should pass through safe simple strings', () => {
    expect(escapeCsvCell('simple')).toBe('simple');
  });
});

// ============================================================================
// toCsvRow
// ============================================================================

describe('toCsvRow', () => {
  it('should join values with commas', () => {
    expect(toCsvRow(['a', 'b', 'c'])).toBe('a,b,c');
  });

  it('should handle mixed types', () => {
    expect(toCsvRow(['name', 42, true, null, undefined])).toBe('name,42,true,,');
  });

  it('should sanitize each cell', () => {
    const row = toCsvRow(['=CMD()', 'safe', '+exploit']);
    expect(row).toBe("'=CMD(),safe,'+exploit");
  });

  it('should handle empty array', () => {
    expect(toCsvRow([])).toBe('');
  });
});

// ============================================================================
// buildCsv
// ============================================================================

describe('buildCsv', () => {
  it('should build CSV with headers and rows', () => {
    const csv = buildCsv(
      ['Name', 'Value'],
      [
        ['Alpha', 10],
        ['Beta', 20],
      ],
    );
    const lines = csv.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe('Name,Value');
    expect(lines[1]).toBe('Alpha,10');
    expect(lines[2]).toBe('Beta,20');
  });

  it('should sanitize headers too', () => {
    const csv = buildCsv(['=Header'], [['value']]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe("'=Header");
  });

  it('should handle empty rows', () => {
    const csv = buildCsv(['A', 'B'], []);
    expect(csv).toBe('A,B');
  });
});

// ============================================================================
// downloadCsv
// ============================================================================

describe('downloadCsv', () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLSpy = vi.fn().mockReturnValue('blob:test');
    revokeObjectURLSpy = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create a blob and trigger download', () => {
    const clickSpy = vi.fn();
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    // Mock createElement to return a trackable anchor
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    downloadCsv('a,b\n1,2', 'test.csv');

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test');
    expect(appendChildSpy).toHaveBeenCalledTimes(1);
    expect(removeChildSpy).toHaveBeenCalledTimes(1);

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});
