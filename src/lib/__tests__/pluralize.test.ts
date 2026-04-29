import { describe, it, expect } from 'vitest';
import { pluralize } from '../pluralize';

describe('pluralize', () => {
  it('returns singular when count is 1', () => {
    expect(pluralize('Service', 1)).toBe('Service');
    expect(pluralize('Bottleneck', 1)).toBe('Bottleneck');
  });

  it('appends "s" when count is not 1', () => {
    expect(pluralize('Service', 0)).toBe('Services');
    expect(pluralize('Service', 2)).toBe('Services');
    expect(pluralize('Service', 17)).toBe('Services');
  });

  it('uses the explicit plural form for irregular nouns', () => {
    expect(pluralize('Entry', 3, 'Entries')).toBe('Entries');
    expect(pluralize('Match', 0, 'Matches')).toBe('Matches');
    expect(pluralize('Entry', 1, 'Entries')).toBe('Entry');
  });

  it('handles negative counts by treating them as plural', () => {
    expect(pluralize('Service', -1)).toBe('Services');
    expect(pluralize('Service', -1, 'Services')).toBe('Services');
  });
});
