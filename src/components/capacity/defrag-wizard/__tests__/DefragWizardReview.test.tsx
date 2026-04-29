/**
 * DefragWizardReview tests (T038) — truncation banner + processed/target count.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DefragWizardProvider, useDefragWizard } from '../DefragWizardContext';
import { DefragWizardReview } from '../DefragWizardReview';
import type { EdgeFragmentation, DefragPlan } from '@/core/services/DefragmentationEngine';

// Mutable holder for the plan the mocked engine returns.
const mockPlanRef: { current: DefragPlan | null } = { current: null };

vi.mock('@/core/services/DefragmentationEngine', async () => {
  const actual = await vi.importActual<typeof import('@/core/services/DefragmentationEngine')>(
    '@/core/services/DefragmentationEngine',
  );
  return {
    ...actual,
    DefragmentationEngine: class {
      planDefragmentation(): DefragPlan {
        return mockPlanRef.current!;
      }
    },
  };
});

vi.mock('@/stores/networkStore', () => {
  const state = { topology: { nodes: [], edges: [{ id: 'e1', name: 'E1' }] } };
  return {
    useNetworkStore: Object.assign(
      (selector: (s: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

vi.mock('@/stores/serviceStore', () => {
  const state = { services: [] };
  return {
    useServiceStore: Object.assign(
      (selector: (s: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

const mockFrag = (id: string): EdgeFragmentation => ({
  edgeId: id,
  edgeName: id,
  fragmentationIndex: 0.5,
  totalChannels: 96,
  usedChannels: 10,
  freeChannels: 86,
  largestContiguousBlock: 40,
  fragments: [],
});

function renderReview(
  selectedEdgeIds: string[],
  plan: DefragPlan,
  initialFragmentations: EdgeFragmentation[],
) {
  mockPlanRef.current = plan;

  const Seed: React.FC = () => {
    const { dispatch } = useDefragWizard();
    React.useEffect(() => {
      dispatch({ type: 'SET_SELECTED_EDGES', edgeIds: selectedEdgeIds });
    }, [dispatch]);
    return null;
  };

  return render(
    <DefragWizardProvider initialEdgeFragmentations={initialFragmentations}>
      <Seed />
      <DefragWizardReview />
    </DefragWizardProvider>,
  );
}

describe('DefragWizardReview', () => {
  it('renders processed/target count in summary header', () => {
    const plan: DefragPlan = {
      id: 'p',
      strategy: 'minimal_moves',
      targetEdgeIds: ['e1', 'e2', 'e3'],
      processedEdgeIds: ['e1', 'e2', 'e3'],
      truncated: false,
      maxMoves: 5000,
      moves: [
        { edgeId: 'e1', serviceId: 's1', fromChannel: 50, toChannel: 11, risk: 'low', estimatedDowntime: 0 },
      ],
      beforeMetrics: { avgFragmentation: 0.3, worstFragmentation: 0.4 },
      afterMetrics: { avgFragmentation: 0.1, worstFragmentation: 0.1 },
      estimatedImpact: {
        servicesAffected: 1,
        totalMoves: 1,
        estimatedDowntime: 0,
        riskSummary: { low: 1, medium: 0, high: 0 },
      },
    };
    renderReview(['e1', 'e2', 'e3'], plan, [mockFrag('e1'), mockFrag('e2'), mockFrag('e3')]);

    const summary = screen.getByTestId('defrag-review-summary');
    expect(summary.textContent).toContain('1 move planned across 3 of 3 edges');
  });

  it('shows truncation banner when plan.truncated is true', () => {
    const plan: DefragPlan = {
      id: 'p',
      strategy: 'minimal_moves',
      targetEdgeIds: ['e1', 'e2', 'e3'],
      processedEdgeIds: ['e1'],
      truncated: true,
      maxMoves: 1000,
      moves: [
        { edgeId: 'e1', serviceId: 's1', fromChannel: 50, toChannel: 11, risk: 'low', estimatedDowntime: 0 },
      ],
      beforeMetrics: { avgFragmentation: 0.3, worstFragmentation: 0.4 },
      afterMetrics: { avgFragmentation: 0.2, worstFragmentation: 0.3 },
      estimatedImpact: {
        servicesAffected: 1,
        totalMoves: 1,
        estimatedDowntime: 0,
        riskSummary: { low: 1, medium: 0, high: 0 },
      },
    };
    renderReview(['e1', 'e2', 'e3'], plan, [mockFrag('e1'), mockFrag('e2'), mockFrag('e3')]);

    const banner = screen.getByTestId('defrag-truncation-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('Plan capped at 1,000 moves');
    expect(banner.textContent).toContain('1 of 3 edges');
  });

  it('does NOT show truncation banner when plan.truncated is false', () => {
    const plan: DefragPlan = {
      id: 'p',
      strategy: 'minimal_moves',
      targetEdgeIds: ['e1'],
      processedEdgeIds: ['e1'],
      truncated: false,
      maxMoves: 5000,
      moves: [],
      reason: 'no-fragmentation',
      beforeMetrics: { avgFragmentation: 0, worstFragmentation: 0 },
      afterMetrics: { avgFragmentation: 0, worstFragmentation: 0 },
      estimatedImpact: {
        servicesAffected: 0,
        totalMoves: 0,
        estimatedDowntime: 0,
        riskSummary: { low: 0, medium: 0, high: 0 },
      },
    };
    renderReview(['e1'], plan, [mockFrag('e1')]);

    expect(screen.queryByTestId('defrag-truncation-banner')).toBeNull();
  });
});
