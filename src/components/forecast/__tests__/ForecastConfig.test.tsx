import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ForecastConfig, type ForecastConfigState } from '../ForecastConfig';

function defaultConfig(): ForecastConfigState {
  return {
    type: 'service',
    method: 'compound-growth',
    interval: 'quarterly',
    startDate: '2026-01-01',
    endDate: '2029-01-01',
    growthRate: 0.15,
  };
}

describe('ForecastConfig', () => {
  it('renders all three forecast type options', () => {
    const onChange = vi.fn();
    const onRun = vi.fn();
    render(
      <ForecastConfig config={defaultConfig()} onChange={onChange} onRun={onRun} />,
    );

    expect(screen.getByTestId('forecast-type-service')).toBeDefined();
    expect(screen.getByTestId('forecast-type-node')).toBeDefined();
    expect(screen.getByTestId('forecast-type-lambda')).toBeDefined();
  });

  it('renders method select with current value', () => {
    const onChange = vi.fn();
    const onRun = vi.fn();
    render(
      <ForecastConfig config={defaultConfig()} onChange={onChange} onRun={onRun} />,
    );

    expect(screen.getByTestId('forecast-method-select')).toBeDefined();
  });

  it('renders growth rate input for compound-growth method', () => {
    const onChange = vi.fn();
    const onRun = vi.fn();
    render(
      <ForecastConfig config={defaultConfig()} onChange={onChange} onRun={onRun} />,
    );

    expect(screen.getByTestId('forecast-growth-rate')).toBeDefined();
  });

  it('hides growth rate input for linear method', () => {
    const onChange = vi.fn();
    const onRun = vi.fn();
    const config = { ...defaultConfig(), method: 'linear' as const };
    render(
      <ForecastConfig config={config} onChange={onChange} onRun={onRun} />,
    );

    expect(screen.queryByTestId('forecast-growth-rate')).toBeNull();
  });

  it('calls onChange when forecast type is clicked', () => {
    const onChange = vi.fn();
    const onRun = vi.fn();
    render(
      <ForecastConfig config={defaultConfig()} onChange={onChange} onRun={onRun} />,
    );

    fireEvent.click(screen.getByTestId('forecast-type-node'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'node' }),
    );
  });

  it('calls onRun when Run button is clicked', () => {
    const onChange = vi.fn();
    const onRun = vi.fn();
    render(
      <ForecastConfig config={defaultConfig()} onChange={onChange} onRun={onRun} />,
    );

    fireEvent.click(screen.getByTestId('forecast-run-btn'));
    expect(onRun).toHaveBeenCalled();
  });

  it('renders date inputs', () => {
    const onChange = vi.fn();
    const onRun = vi.fn();
    render(
      <ForecastConfig config={defaultConfig()} onChange={onChange} onRun={onRun} />,
    );

    expect(screen.getByTestId('forecast-start-date')).toBeDefined();
    expect(screen.getByTestId('forecast-end-date')).toBeDefined();
  });
});
