import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForecastTable } from '../ForecastTable';
import type { ForecastDataPoint } from '@/types/forecast';

describe('ForecastTable', () => {
  const sampleData: ForecastDataPoint[] = [
    { date: '2026-01-01', value: 10 },
    { date: '2026-04-01', value: 12 },
    { date: '2026-07-01', value: 15 },
    { date: '2026-10-01', value: 18 },
    { date: '2027-01-01', value: 22 },
  ];

  it('renders table with correct number of rows', () => {
    render(<ForecastTable data={sampleData} />);
    const table = screen.getByTestId('forecast-table');
    expect(table).toBeDefined();

    const rows = table.querySelectorAll('tbody tr');
    expect(rows.length).toBe(5);
  });

  it('renders column headers', () => {
    render(<ForecastTable data={sampleData} valueLabel="Services" />);
    const table = screen.getByTestId('forecast-table');

    const headers = table.querySelectorAll('thead th');
    const headerTexts = Array.from(headers).map((h) => h.textContent);
    expect(headerTexts).toContain('Period');
    expect(headerTexts).toContain('Services');
    expect(headerTexts).toContain('Delta');
    expect(headerTexts).toContain('Change %');
  });

  it('renders empty state when no data', () => {
    render(<ForecastTable data={[]} />);
    expect(screen.getByText('No forecast data to display')).toBeDefined();
  });

  it('renders confidence column when data has confidence values', () => {
    const dataWithConfidence: ForecastDataPoint[] = [
      { date: '2026-01-01', value: 10, confidence: { lower: 8, upper: 12 } },
      { date: '2026-04-01', value: 15, confidence: { lower: 12, upper: 18 } },
    ];
    render(<ForecastTable data={dataWithConfidence} />);
    const table = screen.getByTestId('forecast-table');

    const headers = table.querySelectorAll('thead th');
    const headerTexts = Array.from(headers).map((h) => h.textContent);
    expect(headerTexts).toContain('Confidence');
  });

  it('calculates delta from start value', () => {
    render(<ForecastTable data={sampleData} startValue={10} />);
    const table = screen.getByTestId('forecast-table');
    const rows = table.querySelectorAll('tbody tr');

    // First row delta should be 0
    const firstRowCells = rows[0].querySelectorAll('td');
    expect(firstRowCells[2].textContent).toBe('0');

    // Last row delta should be +12
    const lastRowCells = rows[4].querySelectorAll('td');
    expect(lastRowCells[2].textContent).toBe('+12');
  });
});
