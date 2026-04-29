/**
 * Returns the singular or plural form of a word based on the count.
 *
 * Defaults to appending "s" for counts other than 1. Pass an explicit
 * `plural` form for irregular nouns (e.g., "Bottleneck" → "Bottlenecks",
 * "Match" → "Matches", "Entry" → "Entries").
 *
 * @example
 *   pluralize('Service', 1) // 'Service'
 *   pluralize('Service', 2) // 'Services'
 *   pluralize('Bottleneck', 0) // 'Bottlenecks'
 *   pluralize('Entry', 3, 'Entries') // 'Entries'
 */
export function pluralize(word: string, count: number, plural?: string): string {
  if (count === 1) return word;
  return plural ?? `${word}s`;
}
