import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  stringSimilarity,
  normalizeName,
  findFuzzyMatches,
  type UnmatchedReference,
} from '../FuzzyMatcher';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('returns length of other string when one is empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('computes single character substitution', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('computes single character insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('computes single character deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('handles common delimiter differences', () => {
    expect(levenshteinDistance('OADM_Cairo_01', 'OADM-Cairo-01')).toBe(2);
  });

  it('handles completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });
});

describe('stringSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(stringSimilarity('hello', 'hello')).toBe(1);
  });

  it('returns 1 for case-insensitive match', () => {
    expect(stringSimilarity('Hello', 'hello')).toBe(1);
  });

  it('returns high similarity for delimiter differences', () => {
    const score = stringSimilarity('OADM_Cairo_01', 'OADM-Cairo-01');
    expect(score).toBeGreaterThan(0.8);
  });

  it('returns low similarity for completely different strings', () => {
    const score = stringSimilarity('abc', 'xyz');
    expect(score).toBeLessThan(0.1);
  });

  it('returns 1 for two empty strings', () => {
    expect(stringSimilarity('', '')).toBe(1);
  });
});

describe('normalizeName', () => {
  it('converts underscores to hyphens', () => {
    expect(normalizeName('OADM_Cairo_01')).toBe('oadm-cairo-01');
  });

  it('converts dots to hyphens', () => {
    expect(normalizeName('Router.Alex.01')).toBe('router-alex-01');
  });

  it('converts spaces to hyphens', () => {
    expect(normalizeName('AMP Nile 01')).toBe('amp-nile-01');
  });

  it('collapses multiple delimiters', () => {
    expect(normalizeName('Node__A..B  C')).toBe('node-a-b-c');
  });

  it('trims leading/trailing whitespace and hyphens', () => {
    expect(normalizeName('  _Node-A_  ')).toBe('node-a');
  });

  it('lowercases', () => {
    expect(normalizeName('OADM-Cairo-01')).toBe('oadm-cairo-01');
  });
});

describe('findFuzzyMatches', () => {
  const knownNames = ['OADM-Cairo-01', 'Router-Alex-01', 'AMP-Nile-01'];

  it('finds normalized matches (underscore vs hyphen)', () => {
    const refs: UnmatchedReference[] = [
      { originalValue: 'OADM_Cairo_01', rowNumbers: [1], fileType: 'edges', fieldName: 'source_node' },
    ];
    const results = findFuzzyMatches(refs, knownNames);
    expect(results).toHaveLength(1);
    expect(results[0].suggestedValue).toBe('OADM-Cairo-01');
    expect(results[0].score).toBe(0.95);
    expect(results[0].strategy).toBe('normalized');
  });

  it('finds normalized matches (dot vs hyphen)', () => {
    const refs: UnmatchedReference[] = [
      { originalValue: 'Router.Alex.01', rowNumbers: [2], fileType: 'edges', fieldName: 'target_node' },
    ];
    const results = findFuzzyMatches(refs, knownNames);
    expect(results).toHaveLength(1);
    expect(results[0].suggestedValue).toBe('Router-Alex-01');
    expect(results[0].score).toBe(0.95);
    expect(results[0].strategy).toBe('normalized');
  });

  it('finds normalized matches (space vs hyphen)', () => {
    const refs: UnmatchedReference[] = [
      { originalValue: 'AMP Nile 01', rowNumbers: [3], fileType: 'services', fieldName: 'source_node' },
    ];
    const results = findFuzzyMatches(refs, knownNames);
    expect(results).toHaveLength(1);
    expect(results[0].suggestedValue).toBe('AMP-Nile-01');
    expect(results[0].score).toBe(0.95);
    expect(results[0].strategy).toBe('normalized');
  });

  it('finds delimiter-only matches', () => {
    const refs: UnmatchedReference[] = [
      { originalValue: 'OADM.Cairo.01', rowNumbers: [1], fileType: 'edges', fieldName: 'source_node' },
    ];
    const results = findFuzzyMatches(refs, knownNames);
    expect(results).toHaveLength(1);
    expect(results[0].suggestedValue).toBe('OADM-Cairo-01');
    // Could be normalized (0.95) or delimiter (0.90) — normalized is preferred
    expect(results[0].score).toBeGreaterThanOrEqual(0.9);
  });

  it('finds Levenshtein matches for typos', () => {
    const refs: UnmatchedReference[] = [
      { originalValue: 'OADM-Cario-01', rowNumbers: [1], fileType: 'edges', fieldName: 'source_node' },
    ];
    const results = findFuzzyMatches(refs, knownNames);
    expect(results).toHaveLength(1);
    expect(results[0].suggestedValue).toBe('OADM-Cairo-01');
    expect(results[0].strategy).toBe('levenshtein');
    expect(results[0].score).toBeGreaterThan(0.6);
  });

  it('returns empty for no matches below threshold', () => {
    const refs: UnmatchedReference[] = [
      { originalValue: 'CompletelyDifferentName', rowNumbers: [1], fileType: 'edges', fieldName: 'source_node' },
    ];
    const results = findFuzzyMatches(refs, knownNames);
    expect(results).toHaveLength(0);
  });

  it('handles multiple unmatched references', () => {
    const refs: UnmatchedReference[] = [
      { originalValue: 'OADM_Cairo_01', rowNumbers: [1, 3], fileType: 'edges', fieldName: 'source_node' },
      { originalValue: 'Router.Alex.01', rowNumbers: [2], fileType: 'edges', fieldName: 'target_node' },
    ];
    const results = findFuzzyMatches(refs, knownNames);
    expect(results).toHaveLength(2);
    // Should be sorted by score descending
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('sorts results by score descending', () => {
    const refs: UnmatchedReference[] = [
      { originalValue: 'OADM-Cario-01', rowNumbers: [1], fileType: 'edges', fieldName: 'source_node' },
      { originalValue: 'OADM_Cairo_01', rowNumbers: [2], fileType: 'edges', fieldName: 'source_node' },
    ];
    const results = findFuzzyMatches(refs, knownNames);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});
