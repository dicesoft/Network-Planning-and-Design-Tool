/**
 * DefragWizard tests (T041) — single Close icon, Esc routes through cancel-confirm,
 * Done button visible only after successful Apply.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DefragWizard } from '../DefragWizard';
import type { EdgeFragmentation } from '@/core/services/DefragmentationEngine';

vi.mock('@/stores/networkStore', () => {
  const state = { topology: { nodes: [], edges: [] } };
  return {
    useNetworkStore: Object.assign(
      (selector: (s: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

vi.mock('@/stores/serviceStore', () => {
  const state = { services: [], applyDefragMoves: () => ({ success: true }) };
  return {
    useServiceStore: Object.assign(
      (selector: (s: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

vi.mock('@/stores/uiStore', () => {
  const state = { addToast: () => {} };
  return {
    useUIStore: Object.assign(
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

describe('DefragWizard', () => {
  it('renders exactly one Close affordance on Step 1 (FR-007)', () => {
    render(
      <DefragWizard open onClose={() => {}} edgeFragmentations={[mockFrag('e1')]} />,
    );

    // FR-007 interpretation (a): the footer Cancel button is the canonical
    // Close affordance; the Radix X icon is hidden via `hideClose`.
    const closeByName = screen.queryAllByLabelText(/close wizard/i);
    expect(closeByName).toHaveLength(0);
    const radixCloseLabels = screen.queryAllByText('Close', { selector: 'span' });
    expect(radixCloseLabels).toHaveLength(0);
    const cancelButtons = screen.getAllByRole('button', { name: /^cancel$/i });
    expect(cancelButtons).toHaveLength(1);
  });

  it('does NOT show Done button before Apply succeeds', () => {
    render(
      <DefragWizard open onClose={() => {}} edgeFragmentations={[mockFrag('e1')]} />,
    );
    expect(screen.queryByTestId('defrag-wizard-done')).toBeNull();
  });

  it('closes immediately on Step 1 (no unsaved progress)', () => {
    const onClose = vi.fn();
    render(
      <DefragWizard open onClose={onClose} edgeFragmentations={[mockFrag('e1')]} />,
    );
    // Press Escape to dismiss dialog (Radix routes this through onOpenChange).
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    });
    expect(onClose).toHaveBeenCalled();
  });
});
