/**
 * Fuzzy Matcher — String similarity engine for import name resolution.
 *
 * Used to suggest matches for unresolved node references in CSV imports.
 * No external dependencies — uses Levenshtein distance with normalization.
 */

export interface FuzzyMatchSuggestion {
  originalValue: string;
  suggestedValue: string; // the known node name (original casing)
  score: number; // 0..1
  strategy: 'levenshtein' | 'normalized' | 'delimiter';
  rowNumbers: number[];
  fileType: 'edges' | 'services';
  fieldName: string;
}

/**
 * Compute Levenshtein edit distance between two strings.
 * Single-row DP implementation — O(min(m,n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  // Ensure a is the shorter string for memory efficiency
  if (al > bl) return levenshteinDistance(b, a);

  let prev = Array.from({ length: al + 1 }, (_, i) => i);
  let curr = new Array<number>(al + 1);

  for (let j = 1; j <= bl; j++) {
    curr[0] = j;
    for (let i = 1; i <= al; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1, // insertion
        prev[i] + 1, // deletion
        prev[i - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[al];
}

/**
 * Compute string similarity as a value between 0 and 1.
 * Both strings are lowercased before comparison.
 */
export function stringSimilarity(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(la, lb);
  return 1 - dist / maxLen;
}

/**
 * Normalize a name for comparison:
 * trim -> lowercase -> replace [_.\s]+ with '-' -> collapse repeating '-'
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[_.\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export interface UnmatchedReference {
  originalValue: string;
  rowNumbers: number[];
  fileType: 'edges' | 'services';
  fieldName: string;
}

/**
 * Find fuzzy matches for unmatched names against known node names.
 *
 * Strategy precedence:
 * 1. Normalized exact match (score 0.95, strategy 'normalized')
 * 2. Delimiter-only replacement (score 0.90, strategy 'delimiter')
 * 3. Levenshtein similarity (score >= threshold, strategy 'levenshtein')
 *
 * @param unmatchedRefs - Unmatched references with context
 * @param knownNames - Array of known node names (original casing)
 * @param threshold - Minimum similarity score for Levenshtein matches (default 0.6)
 * @returns Sorted suggestions (best score first)
 */
export function findFuzzyMatches(
  unmatchedRefs: UnmatchedReference[],
  knownNames: string[],
  threshold: number = 0.6,
): FuzzyMatchSuggestion[] {
  const suggestions: FuzzyMatchSuggestion[] = [];

  // Pre-compute normalized known names
  const normalizedKnown = knownNames.map((name) => ({
    original: name,
    normalized: normalizeName(name),
    delimiterOnly: name.trim().toLowerCase().replace(/[_.]/g, '-'),
  }));

  for (const ref of unmatchedRefs) {
    const value = ref.originalValue;
    const normalizedValue = normalizeName(value);
    const delimiterValue = value.trim().toLowerCase().replace(/[_.]/g, '-');

    let bestMatch: FuzzyMatchSuggestion | null = null;

    for (const known of normalizedKnown) {
      // Fast path 1: normalized exact match
      if (normalizedValue === known.normalized) {
        const candidate: FuzzyMatchSuggestion = {
          originalValue: value,
          suggestedValue: known.original,
          score: 0.95,
          strategy: 'normalized',
          rowNumbers: ref.rowNumbers,
          fileType: ref.fileType,
          fieldName: ref.fieldName,
        };
        if (!bestMatch || candidate.score > bestMatch.score) {
          bestMatch = candidate;
        }
        break; // Normalized exact match is the best possible
      }

      // Fast path 2: delimiter-only replacement
      if (delimiterValue === known.delimiterOnly) {
        const candidate: FuzzyMatchSuggestion = {
          originalValue: value,
          suggestedValue: known.original,
          score: 0.9,
          strategy: 'delimiter',
          rowNumbers: ref.rowNumbers,
          fileType: ref.fileType,
          fieldName: ref.fieldName,
        };
        if (!bestMatch || candidate.score > bestMatch.score) {
          bestMatch = candidate;
        }
        continue;
      }

      // Levenshtein fallback
      const score = stringSimilarity(value, known.original);
      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          originalValue: value,
          suggestedValue: known.original,
          score,
          strategy: 'levenshtein',
          rowNumbers: ref.rowNumbers,
          fileType: ref.fileType,
          fieldName: ref.fieldName,
        };
      }
    }

    if (bestMatch) {
      suggestions.push(bestMatch);
    }
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}
