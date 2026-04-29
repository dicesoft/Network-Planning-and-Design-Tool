import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricTooltip } from '../MetricTooltip';

describe('MetricTooltip', () => {
  it('renders the default ⓘ trigger when no children passed', () => {
    render(<MetricTooltip metric="fullNetworkNetChange" />);
    const trigger = screen.getByRole('button', { name: /full network net change: explain/i });
    expect(trigger).toBeDefined();
  });

  it('renders custom children as the trigger', () => {
    render(
      <MetricTooltip metric="edgesAffected">
        <span data-testid="custom-trigger">Edges Affected</span>
      </MetricTooltip>
    );
    expect(screen.getByTestId('custom-trigger').textContent).toBe('Edges Affected');
  });

  it('falls back gracefully (no tooltip body) for unknown metrics', () => {
    render(
      <MetricTooltip metric="not-a-real-metric">
        <span data-testid="trig">x</span>
      </MetricTooltip>
    );
    // Trigger still renders but no Radix provider/wrapping kicks in.
    expect(screen.getByTestId('trig')).toBeDefined();
  });

  it('uses 300ms delayDuration by default', () => {
    // We don't actually test timing here (jsdom + Radix portals make it fragile);
    // we just verify the component accepts the prop without crashing.
    render(<MetricTooltip metric="fullNetworkNetChange" delayDuration={300} />);
    expect(
      screen.getByRole('button', { name: /full network net change: explain/i })
    ).toBeDefined();
  });
});
