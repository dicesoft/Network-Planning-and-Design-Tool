import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FragmentationGauge } from '../FragmentationGauge';

describe('FragmentationGauge', () => {
  it('should render at 0% for value 0', () => {
    render(<FragmentationGauge value={0} />);
    const meter = screen.getByRole('meter');
    expect(meter).toBeDefined();
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
  });

  it('should render at 25% for value 0.25', () => {
    render(<FragmentationGauge value={0.25} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('25');
  });

  it('should render at 50% for value 0.5', () => {
    render(<FragmentationGauge value={0.5} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('50');
  });

  it('should render at 75% for value 0.75', () => {
    render(<FragmentationGauge value={0.75} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('75');
  });

  it('should render at 100% for value 1', () => {
    render(<FragmentationGauge value={1} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('100');
  });

  it('should render at 0% for NaN value', () => {
    render(<FragmentationGauge value={NaN} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
  });

  it('should render at 0% for undefined-like value', () => {
    render(<FragmentationGauge value={undefined as unknown as number} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
  });

  it('should render at 0% for Infinity value', () => {
    render(<FragmentationGauge value={Infinity} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
  });

  it('should render at 0% for -Infinity value', () => {
    render(<FragmentationGauge value={-Infinity} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
  });

  it('should clamp negative values to 0%', () => {
    render(<FragmentationGauge value={-0.5} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
  });

  it('should clamp values > 1 to 100%', () => {
    render(<FragmentationGauge value={1.5} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('100');
  });

  it('should render SVG with multi-segment arcs (no linearGradient)', () => {
    const { container } = render(<FragmentationGauge value={0.5} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    // No linearGradient should be present
    expect(container.querySelector('linearGradient')).toBeNull();
    // Multiple path elements for arc segments
    const paths = svg!.querySelectorAll('path');
    // Background arc + 20 segments = at least 21 paths
    expect(paths.length).toBeGreaterThanOrEqual(21);
  });

  it('should use custom label', () => {
    render(<FragmentationGauge value={0.5} label="Custom Label" />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-label')).toContain('Custom Label');
    expect(screen.getByText('Custom Label')).toBeDefined();
  });

  it('should render the value text in the SVG', () => {
    const { container } = render(<FragmentationGauge value={0.75} />);
    const texts = container.querySelectorAll('text');
    const valueText = Array.from(texts).find((t) => t.textContent === '75%');
    expect(valueText).toBeDefined();
  });

  it('should render SVG arc paths with sweep-flag=1 (clockwise dome)', () => {
    const { container } = render(<FragmentationGauge value={0.5} />);
    const paths = container.querySelectorAll('path');
    // All arc paths should use sweep-flag=1 (CW for dome shape)
    for (const path of paths) {
      const d = path.getAttribute('d') || '';
      const arcMatch = d.match(/A\s+[\d.]+\s+[\d.]+\s+\d+\s+\d+\s+(\d+)/);
      if (arcMatch) {
        expect(arcMatch[1]).toBe('1');
      }
    }
  });
});
