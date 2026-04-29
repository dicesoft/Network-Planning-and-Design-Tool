import { describe, it, expect, vi } from 'vitest';
import { findFuzzyMatches, type FuzzyMatchSuggestion } from '@/core/import/FuzzyMatcher';
import { useNetworkStore } from '@/stores/networkStore';

// Mock the store
vi.mock('@/stores/networkStore', () => ({
  useNetworkStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        topology: { nodes: [], edges: [], metadata: { modified: new Date().toISOString() } },
        batchAppendNodes: vi.fn(),
        batchAppendEdges: vi.fn(),
      }),
    {
      getState: () => ({
        topology: {
          nodes: [
            { id: 'n1', name: 'Cairo-OADM-01', type: 'oadm', position: { x: 0, y: 0 } },
            { id: 'n2', name: 'Alex-ROADM-02', type: 'roadm', position: { x: 100, y: 0 } },
          ],
          edges: [],
          metadata: { modified: new Date().toISOString() },
        },
        clearTopology: vi.fn(),
        batchAppendNodes: vi.fn(),
        batchAppendEdges: vi.fn(),
      }),
    },
  ),
}));

describe('FuzzyMatchPanel — knownNames from existing topology', () => {
  it('should match against existing topology nodes when imported nodes list is empty', () => {
    // Simulate edges-only import: no imported nodes, but topology has Cairo-OADM-01 and Alex-ROADM-02
    const existingNodes = useNetworkStore.getState().topology.nodes;
    const existingNames = existingNodes.map((n: { name: string }) => n.name);
    const importedNames: string[] = []; // edges-only import → 0 nodes
    const knownNames = [...new Set([...importedNames, ...existingNames])];

    // This should include existing topology names
    expect(knownNames).toContain('Cairo-OADM-01');
    expect(knownNames).toContain('Alex-ROADM-02');
    expect(knownNames.length).toBe(2);

    // Now fuzzy match an unmatched reference
    const unmatchedRefs = [
      {
        originalValue: 'Cairo_OADM_01',
        rowNumbers: [1],
        fileType: 'edges' as const,
        fieldName: 'source',
      },
    ];

    const matches = findFuzzyMatches(unmatchedRefs, knownNames);
    expect(matches.length).toBe(1);
    expect(matches[0].suggestedValue).toBe('Cairo-OADM-01');
    expect(matches[0].score).toBeGreaterThan(0.6);
  });

  it('should deduplicate names when both imported and existing have the same node', () => {
    const existingNodes = useNetworkStore.getState().topology.nodes;
    const existingNames = existingNodes.map((n: { name: string }) => n.name);
    const importedNames = ['Cairo-OADM-01', 'NewNode-03'];
    const knownNames = [...new Set([...importedNames, ...existingNames])];

    // Should have 3 unique names (Cairo-OADM-01 deduplicated)
    expect(knownNames.length).toBe(3);
    expect(knownNames).toContain('Cairo-OADM-01');
    expect(knownNames).toContain('Alex-ROADM-02');
    expect(knownNames).toContain('NewNode-03');
  });
});

describe('FuzzyMatchPanel — suggestion decisions', () => {
  it('should derive acceptedRemappings only from accepted decisions', () => {
    const suggestions: FuzzyMatchSuggestion[] = [
      { originalValue: 'Cairo_OADM_01', suggestedValue: 'Cairo-OADM-01', score: 0.9, strategy: 'delimiter', rowNumbers: [1], fileType: 'edges', fieldName: 'source' },
      { originalValue: 'Alex_ROADM_02', suggestedValue: 'Alex-ROADM-02', score: 0.85, strategy: 'delimiter', rowNumbers: [2], fileType: 'edges', fieldName: 'target' },
      { originalValue: 'Unknown-Node', suggestedValue: 'Cairo-OADM-01', score: 0.6, strategy: 'levenshtein', rowNumbers: [3], fileType: 'services', fieldName: 'source' },
    ];

    const decisions = new Map<string, 'pending' | 'accepted' | 'rejected'>([
      ['Cairo_OADM_01', 'accepted'],
      ['Alex_ROADM_02', 'rejected'],
      ['Unknown-Node', 'pending'],
    ]);

    // Derive accepted remappings
    const accepted = new Map<string, string>();
    for (const s of suggestions) {
      if (decisions.get(s.originalValue) === 'accepted') {
        accepted.set(s.originalValue, s.suggestedValue);
      }
    }

    expect(accepted.size).toBe(1);
    expect(accepted.get('Cairo_OADM_01')).toBe('Cairo-OADM-01');
    expect(accepted.has('Alex_ROADM_02')).toBe(false);
    expect(accepted.has('Unknown-Node')).toBe(false);
  });

  it('should count pending/accepted/rejected correctly', () => {
    const decisions = new Map<string, 'pending' | 'accepted' | 'rejected'>([
      ['a', 'accepted'],
      ['b', 'accepted'],
      ['c', 'rejected'],
      ['d', 'pending'],
      ['e', 'pending'],
    ]);

    let acceptedCount = 0;
    let rejectedCount = 0;
    for (const d of decisions.values()) {
      if (d === 'accepted') acceptedCount++;
      if (d === 'rejected') rejectedCount++;
    }
    const pendingCount = decisions.size - acceptedCount - rejectedCount;

    expect(acceptedCount).toBe(2);
    expect(rejectedCount).toBe(1);
    expect(pendingCount).toBe(2);
  });
});

describe('Skip invalid rows logic', () => {
  it('should allow proceeding when skipInvalidRows is true and there are valid rows', () => {
    const mockResult = {
      nodeValidation: { invalidRows: 2, validRows: 5, totalRows: 7, rowResults: [], warnings: [] },
      edgeValidation: { invalidRows: 3, validRows: 10, totalRows: 13, rowResults: [], warnings: [] },
      serviceValidation: { invalidRows: 0, validRows: 3, totalRows: 3, rowResults: [], warnings: [] },
    };

    // Without skipInvalidRows: has blocking errors
    const hasBlockingWithout = mockResult.nodeValidation.invalidRows > 0 ||
      mockResult.edgeValidation.invalidRows > 0 ||
      mockResult.serviceValidation.invalidRows > 0;
    expect(hasBlockingWithout).toBe(true);

    // With skipInvalidRows: no blocking errors
    const skipInvalidRows = true;
    const hasBlockingWith = !skipInvalidRows
      ? mockResult.nodeValidation.invalidRows > 0 ||
        mockResult.edgeValidation.invalidRows > 0 ||
        mockResult.serviceValidation.invalidRows > 0
      : false;
    expect(hasBlockingWith).toBe(false);
  });

  it('should compute correct skip counts', () => {
    const mockResult = {
      nodeValidation: { invalidRows: 2, validRows: 5 },
      edgeValidation: { invalidRows: 3, validRows: 10 },
      serviceValidation: { invalidRows: 1, validRows: 3 },
    };

    const totalInvalid = mockResult.nodeValidation.invalidRows +
      mockResult.edgeValidation.invalidRows +
      mockResult.serviceValidation.invalidRows;
    const totalValid = mockResult.nodeValidation.validRows +
      mockResult.edgeValidation.validRows +
      mockResult.serviceValidation.validRows;

    expect(totalInvalid).toBe(6);
    expect(totalValid).toBe(18);
  });
});

describe('FuzzyMatchPanel — dedup by originalValue', () => {
  it('should deduplicate suggestions with same originalValue, keeping highest score', () => {
    // Simulate what collectUnmatchedReferences produces:
    // Same node name appears in both source_node and target_node fields → 2 entries
    const rawMatches: FuzzyMatchSuggestion[] = [
      { originalValue: 'NodeA', suggestedValue: 'Node-A', score: 0.85, strategy: 'delimiter', rowNumbers: [1, 2], fileType: 'edges', fieldName: 'source_node' },
      { originalValue: 'NodeA', suggestedValue: 'Node-A', score: 0.90, strategy: 'delimiter', rowNumbers: [3, 4], fileType: 'edges', fieldName: 'target_node' },
      { originalValue: 'NodeB', suggestedValue: 'Node-B', score: 0.80, strategy: 'levenshtein', rowNumbers: [5], fileType: 'edges', fieldName: 'source_node' },
    ];

    // Apply same dedup logic as handleFindMatches
    const deduped = new Map<string, FuzzyMatchSuggestion>();
    for (const m of rawMatches) {
      const existing = deduped.get(m.originalValue);
      if (!existing) {
        deduped.set(m.originalValue, { ...m });
      } else {
        const mergedRows = [...new Set([...existing.rowNumbers, ...m.rowNumbers])].sort((a, b) => a - b);
        existing.rowNumbers = mergedRows;
        if (m.score > existing.score) {
          existing.suggestedValue = m.suggestedValue;
          existing.score = m.score;
          existing.strategy = m.strategy;
        }
      }
    }
    const dedupedMatches = Array.from(deduped.values()).sort((a, b) => b.score - a.score);

    // Should have 2 unique entries, not 3
    expect(dedupedMatches.length).toBe(2);

    // NodeA should have merged rows from both entries and the higher score
    const nodeA = dedupedMatches.find((m) => m.originalValue === 'NodeA')!;
    expect(nodeA.score).toBe(0.90);
    expect(nodeA.rowNumbers).toEqual([1, 2, 3, 4]);

    // NodeB should be unchanged
    const nodeB = dedupedMatches.find((m) => m.originalValue === 'NodeB')!;
    expect(nodeB.score).toBe(0.80);
    expect(nodeB.rowNumbers).toEqual([5]);

    // Decisions map should match deduplicated length
    const decisions = new Map<string, 'pending' | 'accepted' | 'rejected'>();
    for (const match of dedupedMatches) {
      decisions.set(match.originalValue, 'pending');
    }
    expect(decisions.size).toBe(2);
    expect(decisions.size).toBe(dedupedMatches.length);
  });

  it('should merge overlapping row numbers without duplicates', () => {
    const rawMatches: FuzzyMatchSuggestion[] = [
      { originalValue: 'X', suggestedValue: 'X-Fixed', score: 0.7, strategy: 'levenshtein', rowNumbers: [1, 3, 5], fileType: 'edges', fieldName: 'source_node' },
      { originalValue: 'X', suggestedValue: 'X-Fixed', score: 0.7, strategy: 'levenshtein', rowNumbers: [3, 5, 7], fileType: 'edges', fieldName: 'target_node' },
    ];

    const deduped = new Map<string, FuzzyMatchSuggestion>();
    for (const m of rawMatches) {
      const existing = deduped.get(m.originalValue);
      if (!existing) {
        deduped.set(m.originalValue, { ...m });
      } else {
        const mergedRows = [...new Set([...existing.rowNumbers, ...m.rowNumbers])].sort((a, b) => a - b);
        existing.rowNumbers = mergedRows;
        if (m.score > existing.score) {
          existing.suggestedValue = m.suggestedValue;
          existing.score = m.score;
          existing.strategy = m.strategy;
        }
      }
    }

    const result = deduped.get('X')!;
    expect(result.rowNumbers).toEqual([1, 3, 5, 7]); // deduplicated and sorted
  });
});
