import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import {
  DefragWizardProvider,
  useDefragWizard,
  DEFRAG_WIZARD_STEPS,
} from '../DefragWizardContext';
import type { EdgeFragmentation } from '@/core/services/DefragmentationEngine';

// ============================================================================
// HELPERS
// ============================================================================

const mockFragmentation: EdgeFragmentation = {
  edgeId: 'edge-1',
  edgeName: 'Edge 1',
  fragmentationIndex: 0.5,
  totalChannels: 96,
  usedChannels: 10,
  freeChannels: 86,
  largestContiguousBlock: 40,
  fragments: [],
};

function createWrapper(edgeCount: number) {
  const fragmentations = Array.from({ length: edgeCount }, (_, i) => ({
    ...mockFragmentation,
    edgeId: `edge-${i + 1}`,
    edgeName: `Edge ${i + 1}`,
  }));

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <DefragWizardProvider initialEdgeFragmentations={fragmentations}>
      {children}
    </DefragWizardProvider>
  );
  return Wrapper;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Defrag Wizard Navigation', () => {
  describe('goToNextStep — strategy step always shown', () => {
    it('should land on strategy step when single edge is selected', () => {
      const { result } = renderHook(() => useDefragWizard(), {
        wrapper: createWrapper(1),
      });

      // Select a single edge
      act(() => {
        result.current.dispatch({ type: 'SET_SELECTED_EDGES', edgeIds: ['edge-1'] });
      });

      expect(result.current.state.currentStep).toBe('select');

      // Go next from select — should land on strategy (not skip to review)
      act(() => {
        result.current.goToNextStep();
      });

      expect(result.current.state.currentStep).toBe('strategy');
      expect(result.current.state.completedSteps.has('select')).toBe(true);
      expect(result.current.state.completedSteps.has('strategy')).toBe(false);
    });

    it('should land on strategy step when multiple edges are selected', () => {
      const { result } = renderHook(() => useDefragWizard(), {
        wrapper: createWrapper(2),
      });

      // Select two edges
      act(() => {
        result.current.dispatch({ type: 'SET_SELECTED_EDGES', edgeIds: ['edge-1', 'edge-2'] });
      });

      // Go next from select — should land on strategy
      act(() => {
        result.current.goToNextStep();
      });

      expect(result.current.state.currentStep).toBe('strategy');
      expect(result.current.state.completedSteps.has('select')).toBe(true);
      expect(result.current.state.completedSteps.has('strategy')).toBe(false);
    });
  });

  describe('goToPreviousStep — strategy step always shown', () => {
    it('should land on strategy when going back from review with single edge', () => {
      const { result } = renderHook(() => useDefragWizard(), {
        wrapper: createWrapper(1),
      });

      // Select a single edge and advance to review
      act(() => {
        result.current.dispatch({ type: 'SET_SELECTED_EDGES', edgeIds: ['edge-1'] });
      });
      act(() => {
        result.current.goToNextStep(); // select -> strategy
      });
      act(() => {
        result.current.goToNextStep(); // strategy -> review
      });

      expect(result.current.state.currentStep).toBe('review');

      // Go back from review — should land on strategy (not skip to select)
      act(() => {
        result.current.goToPreviousStep();
      });

      expect(result.current.state.currentStep).toBe('strategy');
    });

    it('should land on strategy when going back from review with multiple edges', () => {
      const { result } = renderHook(() => useDefragWizard(), {
        wrapper: createWrapper(2),
      });

      // Select two edges and advance through to review
      act(() => {
        result.current.dispatch({ type: 'SET_SELECTED_EDGES', edgeIds: ['edge-1', 'edge-2'] });
      });
      act(() => {
        result.current.goToNextStep(); // select -> strategy
      });
      act(() => {
        result.current.goToNextStep(); // strategy -> review
      });

      expect(result.current.state.currentStep).toBe('review');

      // Go back — should land on strategy
      act(() => {
        result.current.goToPreviousStep();
      });

      expect(result.current.state.currentStep).toBe('strategy');
    });
  });

  describe('general navigation', () => {
    it('should not go past the last step', () => {
      const { result } = renderHook(() => useDefragWizard(), {
        wrapper: createWrapper(1),
      });

      // Advance to the last step
      act(() => {
        result.current.dispatch({ type: 'SET_SELECTED_EDGES', edgeIds: ['edge-1'] });
      });

      const steps = DEFRAG_WIZARD_STEPS;
      for (let i = 0; i < steps.length - 1; i++) {
        act(() => {
          result.current.goToNextStep();
        });
      }

      const lastStep = steps[steps.length - 1];
      expect(result.current.state.currentStep).toBe(lastStep);

      // Try to go past the end
      act(() => {
        result.current.goToNextStep();
      });

      expect(result.current.state.currentStep).toBe(lastStep);
    });

    it('should not go before the first step', () => {
      const { result } = renderHook(() => useDefragWizard(), {
        wrapper: createWrapper(1),
      });

      expect(result.current.state.currentStep).toBe('select');

      // Try to go back from first step
      act(() => {
        result.current.goToPreviousStep();
      });

      expect(result.current.state.currentStep).toBe('select');
    });

    it('should start at select step', () => {
      const { result } = renderHook(() => useDefragWizard(), {
        wrapper: createWrapper(1),
      });

      expect(result.current.state.currentStep).toBe('select');
      expect(result.current.getCurrentStepIndex()).toBe(0);
    });

    it('should default strategy to minimal_moves', () => {
      const { result } = renderHook(() => useDefragWizard(), {
        wrapper: createWrapper(1),
      });

      expect(result.current.state.strategy).toBe('minimal_moves');
    });
  });
});
