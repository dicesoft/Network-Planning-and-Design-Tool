import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OsnrAnalysisPanel } from '../OsnrAnalysisPanel';
import type { OSNRResult } from '@/core/optical/types';

// ============================================================================
// MOCK OSNR RESULT FACTORY
// ============================================================================

function createMockOSNRResult(overrides: Partial<OSNRResult> = {}): OSNRResult {
  return {
    feasible: true,
    finalGSNR: 25.0,
    requiredOSNR: 15.0,
    systemMargin: 8.0,
    eolMargin: 2.0,
    totalDistance: 200,
    totalLoss: 40,
    spanCount: 2,
    spanResults: [],
    cascadedOSNR: 27.0,
    warnings: [],
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('OsnrGauge (via OsnrAnalysisPanel)', () => {
  it('should render without errors for value = 0', () => {
    const result = createMockOSNRResult({ finalGSNR: 0, margin: -15 });
    const { container } = render(<OsnrAnalysisPanel result={result} />);

    const gauge = screen.getByTestId('osnr-gauge');
    expect(gauge).toBeTruthy();
    expect(gauge.getAttribute('aria-valuenow')).toBe('0');
    // SVG should be present
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('should render without errors for negative value (-5)', () => {
    const result = createMockOSNRResult({ finalGSNR: -5, margin: -20 });
    const { container } = render(<OsnrAnalysisPanel result={result} />);

    const gauge = screen.getByTestId('osnr-gauge');
    expect(gauge).toBeTruthy();
    // Negative values clamped to 0 for display
    expect(gauge.getAttribute('aria-valuenow')).toBe('-5');
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('should render without errors for high value (45)', () => {
    const result = createMockOSNRResult({ finalGSNR: 45, margin: 30 });
    render(<OsnrAnalysisPanel result={result} />);

    const gauge = screen.getByTestId('osnr-gauge');
    expect(gauge).toBeTruthy();
    expect(gauge.getAttribute('aria-valuenow')).toBe('45');
  });

  it('should render without errors for value exceeding maxScale (50)', () => {
    const result = createMockOSNRResult({ finalGSNR: 50, margin: 35 });
    render(<OsnrAnalysisPanel result={result} />);

    const gauge = screen.getByTestId('osnr-gauge');
    expect(gauge).toBeTruthy();
    expect(gauge.getAttribute('aria-valuenow')).toBe('50');
  });

  it('should have correct aria-label', () => {
    const result = createMockOSNRResult({ finalGSNR: 25.3 });
    render(<OsnrAnalysisPanel result={result} />);

    const gauge = screen.getByTestId('osnr-gauge');
    expect(gauge.getAttribute('aria-label')).toBe('OSNR: 25.3 dB');
  });

  it('should display feasible banner when margin is positive', () => {
    const result = createMockOSNRResult({ finalGSNR: 25, requiredOSNR: 15 });
    render(<OsnrAnalysisPanel result={result} />);

    expect(screen.getByText('OSNR Feasible')).toBeTruthy();
  });

  it('should display infeasible banner when GSNR is below requirement', () => {
    const result = createMockOSNRResult({
      feasible: false,
      finalGSNR: 10,
      requiredOSNR: 15,
      margin: -5,
    });
    render(<OsnrAnalysisPanel result={result} />);

    expect(screen.getByText('OSNR Infeasible')).toBeTruthy();
  });

  it('should render SVG arc paths with sweep-flag=1 (clockwise dome)', () => {
    const result = createMockOSNRResult({ finalGSNR: 25 });
    render(<OsnrAnalysisPanel result={result} />);

    const gauge = screen.getByTestId('osnr-gauge');
    const paths = gauge.querySelectorAll('path');
    // All arc paths should use sweep-flag=1 (CW for dome shape)
    for (const path of paths) {
      const d = path.getAttribute('d') || '';
      // SVG arc: A rx ry x-rotation large-arc-flag sweep-flag x y
      const arcMatch = d.match(/A\s+[\d.]+\s+[\d.]+\s+\d+\s+\d+\s+(\d+)/);
      if (arcMatch) {
        expect(arcMatch[1]).toBe('1');
      }
    }
  });

  it('should render needle tip above center (y < cy) for positive GSNR', () => {
    const result = createMockOSNRResult({ finalGSNR: 25 });
    render(<OsnrAnalysisPanel result={result} />);

    const gauge = screen.getByTestId('osnr-gauge');
    // The needle is a line from center (cx, cy) to the tip
    // For positive values the tip should be above center (y < cy)
    const lines = gauge.querySelectorAll('line');
    // The needle line goes from (cx, cy) to (needleTip.x, needleTip.y)
    // cy = 72 in the component; needle tip y should be < 72 for dome arc
    const needleLine = Array.from(lines).find(
      (l) => l.getAttribute('stroke') === 'currentColor' && l.getAttribute('stroke-width') === '1.5'
    );
    expect(needleLine).toBeTruthy();
    const y2 = parseFloat(needleLine!.getAttribute('y2') || '0');
    const y1 = parseFloat(needleLine!.getAttribute('y1') || '0');
    // Needle tip (y2) should be above center (y1) for a dome gauge with positive value
    expect(y2).toBeLessThan(y1);
  });
});
