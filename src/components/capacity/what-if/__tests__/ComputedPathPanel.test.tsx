import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComputedPathPanel } from '../ComputedPathPanel';
import type { WhatIfPathResult, WhatIfServiceConfig, ComputedPath } from '@/core/services/WhatIfPathComputer';

// ============================================================================
// MOCK FACTORIES
// ============================================================================

function createMockConfig(): WhatIfServiceConfig {
  return {
    sourceNodeId: 'node-A',
    destinationNodeId: 'node-D',
    serviceType: 'l1-dwdm',
    dataRate: '100G',
    protection: 'none',
    quantity: 1,
  };
}

function createMockPath(overrides: Partial<ComputedPath> = {}): ComputedPath {
  return {
    nodeIds: ['node-A', 'node-B', 'node-D'],
    edgeIds: ['e-AB', 'e-BD'],
    totalDistance: 100,
    hopCount: 2,
    ...overrides,
  };
}

function createMockPathResult(
  numAlternatives: number,
  overrides: Partial<WhatIfPathResult> = {}
): WhatIfPathResult {
  const alternatives: ComputedPath[] = [];
  for (let i = 0; i < numAlternatives; i++) {
    alternatives.push(
      createMockPath({
        nodeIds: ['node-A', `node-Alt${i + 1}`, 'node-D'],
        edgeIds: [`e-A-Alt${i + 1}`, `e-Alt${i + 1}-D`],
        totalDistance: 100 + (i + 1) * 20,
        hopCount: 2,
      })
    );
  }

  return {
    config: createMockConfig(),
    workingPath: createMockPath(),
    protectionPath: null,
    alternativePaths: alternatives.length > 0 ? alternatives : undefined,
    feasible: true,
    ...overrides,
  };
}

const nodeNameMap = new Map([
  ['node-A', 'NYC'],
  ['node-B', 'Boston'],
  ['node-C', 'Chicago'],
  ['node-D', 'Denver'],
  ['node-Alt1', 'Alt1'],
  ['node-Alt2', 'Alt2'],
  ['node-Alt3', 'Alt3'],
  ['node-Alt4', 'Alt4'],
  ['node-Alt5', 'Alt5'],
]);

// ============================================================================
// TESTS
// ============================================================================

describe('ComputedPathPanel', () => {
  it('should render nothing when pathResults is empty', () => {
    const { container } = render(
      <ComputedPathPanel pathResults={[]} nodeNameMap={nodeNameMap} />
    );
    expect(container.children.length).toBe(0);
  });

  it('should render working path as a card', () => {
    const pr = createMockPathResult(0);
    render(<ComputedPathPanel pathResults={[pr]} nodeNameMap={nodeNameMap} />);

    const cards = screen.getAllByTestId('what-if-path-card');
    expect(cards.length).toBe(1);
  });

  it('should render 5 alternative paths as 6 cards (working + 5 alternatives)', () => {
    const pr = createMockPathResult(5);
    render(<ComputedPathPanel pathResults={[pr]} nodeNameMap={nodeNameMap} />);

    const cards = screen.getAllByTestId('what-if-path-card');
    // 1 working + 5 alternatives = 6 cards
    expect(cards.length).toBe(6);
  });

  it('should not use collapsible toggle for alternatives', () => {
    const pr = createMockPathResult(3);
    render(<ComputedPathPanel pathResults={[pr]} nodeNameMap={nodeNameMap} />);

    // Should NOT have the old collapsible toggle
    expect(screen.queryByTestId('toggle-alternative-paths')).toBeNull();
  });

  it('should show "Computed Paths (N candidates)" header', () => {
    const pr = createMockPathResult(4);
    render(<ComputedPathPanel pathResults={[pr]} nodeNameMap={nodeNameMap} />);

    expect(screen.getByText(/Computed Paths \(5 candidates\)/)).toBeTruthy();
  });

  it('should show Shortest badge on the path with minimum distance', () => {
    const pr = createMockPathResult(2);
    render(<ComputedPathPanel pathResults={[pr]} nodeNameMap={nodeNameMap} />);

    expect(screen.getByText('Shortest')).toBeTruthy();
  });

  it('should label first path "Working" and subsequent paths "Alt N"', () => {
    const pr = createMockPathResult(2);
    render(<ComputedPathPanel pathResults={[pr]} nodeNameMap={nodeNameMap} />);

    expect(screen.getByText('Working')).toBeTruthy();
    expect(screen.getByText('Alt 1')).toBeTruthy();
    expect(screen.getByText('Alt 2')).toBeTruthy();
    // Old "Route N" labels should not exist
    expect(screen.queryByText('Route 1')).toBeNull();
    expect(screen.queryByText('Route 2')).toBeNull();
    expect(screen.queryByText('Route 3')).toBeNull();
  });

  it('should show Analyze Impact buttons on ALL cards including Route 1', () => {
    const mockHandler = vi.fn();
    const pr = createMockPathResult(2);
    render(
      <ComputedPathPanel
        pathResults={[pr]}
        nodeNameMap={nodeNameMap}
        onAnalyzeAlternative={mockHandler}
      />
    );

    const analyzeButtons = screen.getAllByTestId('analyze-impact-btn');
    // All cards get the button (Route 1 + 2 alternatives = 3)
    expect(analyzeButtons.length).toBe(3);
  });

  it('should call onAnalyzeAlternative with unified index for Route 1', () => {
    const mockHandler = vi.fn();
    const pr = createMockPathResult(1);
    render(
      <ComputedPathPanel
        pathResults={[pr]}
        nodeNameMap={nodeNameMap}
        onAnalyzeAlternative={mockHandler}
      />
    );

    const analyzeButtons = screen.getAllByTestId('analyze-impact-btn');
    fireEvent.click(analyzeButtons[0]);
    // Route 1 (index 0) should pass unified index 0
    expect(mockHandler).toHaveBeenCalledWith(0, 0);
  });

  it('should highlight selected card with accent ring', () => {
    const pr = createMockPathResult(2);
    render(
      <ComputedPathPanel
        pathResults={[pr]}
        nodeNameMap={nodeNameMap}
        selectedPathIndex={{ pathResultIndex: 0, unifiedIndex: 1 }}
      />
    );

    const cards = screen.getAllByTestId('what-if-path-card');
    // Second card (Route 2, unifiedIndex=1) should have the ring
    expect(cards[1].className).toContain('ring-2');
    expect(cards[1].className).toContain('ring-indigo-500');
    // First card should NOT have the ring
    expect(cards[0].className).not.toContain('ring-2');
  });

  it('should render infeasible state correctly', () => {
    const pr = createMockPathResult(0, {
      feasible: false,
      workingPath: null,
      reason: 'No path found',
    });
    render(<ComputedPathPanel pathResults={[pr]} nodeNameMap={nodeNameMap} />);

    expect(screen.getByText('Infeasible')).toBeTruthy();
    expect(screen.getByText('No path found')).toBeTruthy();
  });

  it('should render protection path separately from candidate cards', () => {
    const pr = createMockPathResult(1, {
      protectionPath: createMockPath({
        nodeIds: ['node-A', 'node-C', 'node-D'],
        edgeIds: ['e-AC', 'e-CD'],
        totalDistance: 150,
        hopCount: 2,
      }),
    });
    render(<ComputedPathPanel pathResults={[pr]} nodeNameMap={nodeNameMap} />);

    // 2 path cards (working + 1 alt)
    const cards = screen.getAllByTestId('what-if-path-card');
    expect(cards.length).toBe(2);

    // Protection path label should be visible separately
    expect(screen.getByText('Protection Path')).toBeTruthy();
  });
});
