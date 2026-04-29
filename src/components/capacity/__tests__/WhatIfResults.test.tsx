import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhatIfResults } from '../what-if/WhatIfResults';
import type { WhatIfResult } from '@/core/services/CapacityTracker';
import type { WhatIfPathResult } from '@/core/services/WhatIfPathComputer';

function makeResult(overrides: Partial<WhatIfResult> = {}): WhatIfResult {
  const affectedEdges = overrides.affectedEdges ?? [
    {
      edgeId: 'e-1',
      before: { edgeId: 'e-1', total: 96, used: 35, available: 61, percentage: 36 },
      after: { edgeId: 'e-1', total: 96, used: 36, available: 60, percentage: 38 },
      delta: 2,
      usedBefore: 35,
      usedAfter: 36,
      totalChannels: 96,
      channelDelta: 1,
    },
  ];
  const delta = overrides.networkUtilizationDelta ?? 0.087;
  return {
    feasible: true,
    affectedEdges,
    networkUtilizationBefore: 10,
    networkUtilizationAfter: 10,
    networkUtilizationDelta: delta,
    summary: {
      fullNetworkNetChange: delta,
      edgesAffected: affectedEdges.length,
      newBottlenecks: 0,
    },
    ...overrides,
  };
}

const edgeNameMap = new Map([['e-1', 'NYC↔Boston']]);
const noPaths: WhatIfPathResult[] = [];

describe('WhatIfResults — Trustworthy What-If Numbers (US3)', () => {
  it('renders the renamed Full Network Net Change card', () => {
    render(
      <WhatIfResults
        results={[makeResult()]}
        pathResults={noPaths}
        edgeNameMap={edgeNameMap}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('Full Network Net Change')).toBeInTheDocument();
  });

  it('summary never shows 0% while a per-edge bar shows non-zero (regression for bug 3b)', () => {
    render(
      <WhatIfResults
        results={[makeResult()]}
        pathResults={noPaths}
        edgeNameMap={edgeNameMap}
        onClear={vi.fn()}
      />
    );
    // Summary card surface should NOT contain literal "0%". Allowed: "+0.087%" or similar.
    // Use the testid-free approach: query for the card by label, then inspect siblings.
    const label = screen.getByText('Full Network Net Change');
    const card = label.closest('div')!.parentElement!;
    expect(card.textContent).not.toMatch(/(?<![.\d])0%/);
    expect(card.textContent).toMatch(/0\.087%/);
  });

  it('renders raw channel counts on the edge impact table (FR-014)', () => {
    render(
      <WhatIfResults
        results={[makeResult()]}
        pathResults={noPaths}
        edgeNameMap={edgeNameMap}
        onClear={vi.fn()}
      />
    );
    // Channel counts appear in multiple places (vertical bars, horizontal fallback, table)
    const matches = screen.getAllByText(/35→36 of 96/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders MetricTooltip triggers for the three summary cards', () => {
    render(
      <WhatIfResults
        results={[makeResult()]}
        pathResults={noPaths}
        edgeNameMap={edgeNameMap}
        onClear={vi.fn()}
      />
    );
    // Each MetricTooltip renders an aria-labeled button when used in default mode.
    const explainButtons = screen.getAllByRole('button', { name: /explain/i });
    // 3 summary cards + 3 legend bands = 6 minimum (allow more if other tooltips
    // are nested elsewhere in the future).
    expect(explainButtons.length).toBeGreaterThanOrEqual(6);
  });

  it('shows the neutral marker (em-dash) for true-zero summary', () => {
    const zeroResult = makeResult({
      networkUtilizationDelta: 0,
      affectedEdges: [],
    });
    render(
      <WhatIfResults
        results={[zeroResult]}
        pathResults={noPaths}
        edgeNameMap={edgeNameMap}
        onClear={vi.fn()}
      />
    );
    const label = screen.getByText('Full Network Net Change');
    const card = label.closest('div')!.parentElement!;
    expect(card.textContent).toMatch(/—/);
  });
});
