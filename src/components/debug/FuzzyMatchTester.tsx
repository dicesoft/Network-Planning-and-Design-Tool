/**
 * Fuzzy Match Tester — Debug utility for testing string similarity.
 * Uses the same FuzzyMatcher engine used during NCE import.
 *
 * Exports:
 * - FuzzyMatchTesterContent — inline content for TabbedTester
 * - FuzzyMatchTester — standalone bordered card
 */

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  levenshteinDistance,
  stringSimilarity,
  normalizeName,
} from '@/core/import/FuzzyMatcher';

/** Core content — no wrapper, used inside TabbedTester tab and standalone */
export const FuzzyMatchTesterContent: React.FC = () => {
  const [stringA, setStringA] = useState('');
  const [stringB, setStringB] = useState('');

  const results = useMemo(() => {
    if (!stringA && !stringB) return null;

    const distance = levenshteinDistance(stringA, stringB);
    const similarity = stringSimilarity(stringA, stringB);
    const normalizedA = normalizeName(stringA);
    const normalizedB = normalizeName(stringB);
    const normalizedMatch = normalizedA === normalizedB && normalizedA !== '';

    // Determine which strategy would trigger
    let strategy: string;
    let strategyScore: number;
    if (normalizedMatch) {
      strategy = 'normalized';
      strategyScore = 0.95;
    } else {
      const delimA = stringA.trim().toLowerCase().replace(/[_.]/g, '-');
      const delimB = stringB.trim().toLowerCase().replace(/[_.]/g, '-');
      if (delimA === delimB && delimA !== '') {
        strategy = 'delimiter';
        strategyScore = 0.90;
      } else if (similarity >= 0.6) {
        strategy = 'levenshtein';
        strategyScore = similarity;
      } else {
        strategy = 'no-match';
        strategyScore = similarity;
      }
    }

    return {
      distance,
      similarity,
      normalizedA,
      normalizedB,
      normalizedMatch,
      strategy,
      strategyScore,
    };
  }, [stringA, stringB]);

  const similarityPercent = results ? Math.round(results.similarity * 100) : 0;

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            String A
          </label>
          <Input
            placeholder="e.g., OADM_Cairo_01"
            value={stringA}
            onChange={(e) => setStringA(e.target.value)}
            data-testid="fuzzy-tester-string-a"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            String B
          </label>
          <Input
            placeholder="e.g., OADM-Cairo-01"
            value={stringB}
            onChange={(e) => setStringB(e.target.value)}
            data-testid="fuzzy-tester-string-b"
          />
        </div>
      </div>

      {results && (stringA || stringB) && (
        <div className="bg-surface space-y-3 rounded-lg border border-border p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Results</h4>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Levenshtein Distance</span>
              <span className="font-mono font-medium">{results.distance}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Similarity Score</span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-border">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      similarityPercent >= 80 ? 'bg-success' :
                      similarityPercent >= 60 ? 'bg-warning' :
                      'bg-destructive'
                    )}
                    style={{ width: `${similarityPercent}%` }}
                  />
                </div>
                <span className={cn(
                  'font-mono font-medium text-xs px-2 py-0.5 rounded-full',
                  similarityPercent >= 80 ? 'bg-success/10 text-success' :
                  similarityPercent >= 60 ? 'bg-warning/10 text-warning' :
                  'bg-destructive/10 text-destructive'
                )}>
                  {similarityPercent}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Normalized A</span>
              <span className="font-mono text-xs">{results.normalizedA || '(empty)'}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Normalized B</span>
              <span className="font-mono text-xs">{results.normalizedB || '(empty)'}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Normalized Match</span>
              <span className={cn(
                'text-xs font-medium',
                results.normalizedMatch ? 'text-success' : 'text-text-muted'
              )}>
                {results.normalizedMatch ? 'Yes' : 'No'}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-1">
              <span className="text-text-secondary">Match Strategy</span>
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                results.strategy === 'normalized' ? 'bg-success/10 text-success' :
                results.strategy === 'delimiter' ? 'bg-accent/10 text-accent' :
                results.strategy === 'levenshtein' ? 'bg-warning/10 text-warning' :
                'bg-destructive/10 text-destructive'
              )}>
                {results.strategy} ({results.strategyScore.toFixed(2)})
              </span>
            </div>
          </div>
        </div>
      )}

      {!stringA && !stringB && (
        <div className="py-6 text-center text-xs text-text-muted">
          Enter two strings above to compare them
        </div>
      )}
    </div>
  );
};

/** Standalone bordered card — for use outside TabbedTester */
export const FuzzyMatchTester: React.FC = () => {
  return (
    <div className="rounded-lg border border-border bg-elevated">
      <div className="border-b border-border px-4 py-2">
        <h3 className="text-sm font-medium">Fuzzy Match Tester</h3>
        <p className="text-xs text-text-secondary">
          Test string similarity and name matching algorithms used during import.
        </p>
      </div>
      <FuzzyMatchTesterContent />
    </div>
  );
};
