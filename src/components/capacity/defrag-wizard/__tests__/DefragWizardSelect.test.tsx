import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { DefragWizardProvider } from '../DefragWizardContext';
import { DefragWizardSelect } from '../DefragWizardSelect';
import type { EdgeFragmentation } from '@/core/services/DefragmentationEngine';

// Mock networkStore so the endpointLookup memo has a populated edge map.
vi.mock('@/stores/networkStore', () => {
  const state = {
    topology: {
      nodes: [
        { id: 'n1', name: 'Cairo-OADM-1' },
        { id: 'n2', name: 'Alex-OADM-2' },
        { id: 'n3', name: 'Giza-ROADM-3' },
        { id: 'n4', name: 'Aswan-ROADM-4' },
      ],
      edges: [
        {
          id: 'edge-1',
          source: { nodeId: 'n1' },
          target: { nodeId: 'n2' },
        },
        {
          id: 'edge-2',
          source: { nodeId: 'n3' },
          target: { nodeId: 'n4' },
        },
      ],
    },
  };
  return {
    useNetworkStore: Object.assign(
      (selector: (s: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

// Mock serviceStore so DefragWizardSelect can subscribe to defragVersion.
const serviceState = { services: [], defragVersion: 0 };
vi.mock('@/stores/serviceStore', () => {
  return {
    useServiceStore: Object.assign(
      (selector: (s: typeof serviceState) => unknown) => selector(serviceState),
      { getState: () => serviceState },
    ),
  };
});

// Spy on analyzeFragmentation so we can assert it was called when defragVersion advances.
// Hoist-safe: the mock factory accesses analyzeSpy via a getter to avoid the
// "Cannot access before initialization" hoisting trap that bites top-level
// `const` references inside vi.mock factories.
const fragmentationStub = {
  edgeFragmentations: [
    {
      edgeId: 'edge-1',
      edgeName: 'Refreshed-Edge',
      fragmentationIndex: 0.99,
      totalChannels: 96,
      usedChannels: 50,
      freeChannels: 46,
      largestContiguousBlock: 4,
      fragments: [],
    },
  ],
  globalFragmentationIndex: 0.99,
  totalEdges: 1,
  totalChannels: 96,
  totalFreeChannels: 46,
  averageLargestBlock: 4,
};
const analyzeSpy = vi.fn(() => fragmentationStub);
vi.mock('@/core/services/DefragmentationEngine', () => {
  class MockEngine {
    analyzeFragmentation() {
      return analyzeSpy();
    }
  }
  return {
    DefragmentationEngine: MockEngine,
    DEFRAG_DEFAULT_MAX_MOVES: 1000,
    DEFRAG_MAX_MOVES_CEILING: 5000,
  };
});

const mockFrag = (overrides: Partial<EdgeFragmentation>): EdgeFragmentation => ({
  edgeId: 'edge-1',
  edgeName: 'Edge 1',
  fragmentationIndex: 0.2,
  totalChannels: 96,
  usedChannels: 10,
  freeChannels: 86,
  largestContiguousBlock: 40,
  fragments: [],
  ...overrides,
});

const fragmentations: EdgeFragmentation[] = [
  mockFrag({ edgeId: 'edge-1', edgeName: 'Cairo-Alex-Trunk', fragmentationIndex: 0.2 }),
  mockFrag({ edgeId: 'edge-2', edgeName: 'Giza-Aswan-Backbone', fragmentationIndex: 0.8 }),
];

function renderSelect() {
  return render(
    <DefragWizardProvider initialEdgeFragmentations={fragmentations}>
      <DefragWizardSelect />
    </DefragWizardProvider>,
  );
}

describe('DefragWizardSelect — search & filter', () => {
  it('renders all rows by default', () => {
    renderSelect();
    expect(screen.getByText('Cairo-Alex-Trunk')).toBeTruthy();
    expect(screen.getByText('Giza-Aswan-Backbone')).toBeTruthy();
  });

  it('filters rows by edge name substring', () => {
    renderSelect();
    const input = screen.getByTestId('defrag-select-filter') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Cairo' } });

    expect(screen.queryByText('Cairo-Alex-Trunk')).toBeTruthy();
    expect(screen.queryByText('Giza-Aswan-Backbone')).toBeNull();
  });

  it('filters by endpoint node name', () => {
    renderSelect();
    const input = screen.getByTestId('defrag-select-filter') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Aswan' } });

    expect(screen.queryByText('Cairo-Alex-Trunk')).toBeNull();
    expect(screen.queryByText('Giza-Aswan-Backbone')).toBeTruthy();
  });

  it('shows only rows above the >0.5 fragmentation threshold when toggled', () => {
    renderSelect();
    const checkbox = screen.getByLabelText(/Fragmented only/i) as HTMLInputElement;
    fireEvent.click(checkbox);

    expect(screen.queryByText('Cairo-Alex-Trunk')).toBeNull(); // 0.2 -> filtered out
    expect(screen.queryByText('Giza-Aswan-Backbone')).toBeTruthy(); // 0.8 -> kept
  });

  it('shows an empty-state message when no rows match', () => {
    renderSelect();
    const input = screen.getByTestId('defrag-select-filter') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'no-such-edge-name' } });

    expect(screen.getByText(/No edges match the current filter/i)).toBeTruthy();
  });

  it('case-insensitive search matches lower- and upper-case input', () => {
    renderSelect();
    const input = screen.getByTestId('defrag-select-filter') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'cairo' } });

    expect(screen.queryByText('Cairo-Alex-Trunk')).toBeTruthy();
    expect(screen.queryByText('Giza-Aswan-Backbone')).toBeNull();
  });
});

describe('DefragWizardSelect — defragVersion auto-refresh (P5.2 / E1)', () => {
  it('re-fetches fragmentation when defragVersion advances while wizard is mounted', () => {
    analyzeSpy.mockClear();
    serviceState.defragVersion = 0;

    // A trivial wrapper that re-renders on demand so we can simulate
    // `defragVersion` bumping without unmounting the provider. The
    // mocked useServiceStore reads from module-level `serviceState`, so
    // re-rendering after mutating that yields the new value.
    let forceRerender: () => void = () => {};
    const Wrapper: React.FC = () => {
      const [, force] = React.useReducer((x: number) => x + 1, 0);
      forceRerender = () => force();
      return (
        <DefragWizardProvider initialEdgeFragmentations={fragmentations}>
          <DefragWizardSelect />
        </DefragWizardProvider>
      );
    };

    render(<Wrapper />);

    // Initial mount: stale ref equals current version, no re-fetch yet.
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('Cairo-Alex-Trunk')).toBeTruthy();

    // Advance defragVersion (simulate apply from another tab/flow) and
    // re-render. The Select effect should detect the version change and
    // call analyzeFragmentation() on a fresh engine.
    act(() => {
      serviceState.defragVersion = 1;
      forceRerender();
    });

    expect(analyzeSpy).toHaveBeenCalled();
  });
});

// Suppress an unused import warning if `within` isn't used
void within;
