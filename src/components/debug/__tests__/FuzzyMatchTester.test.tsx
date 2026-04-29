import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FuzzyMatchTester, FuzzyMatchTesterContent } from '../FuzzyMatchTester';

describe('FuzzyMatchTesterContent', () => {
  it('should render input fields', () => {
    render(<FuzzyMatchTesterContent />);
    expect(screen.getByTestId('fuzzy-tester-string-a')).toBeInTheDocument();
    expect(screen.getByTestId('fuzzy-tester-string-b')).toBeInTheDocument();
  });

  it('should show placeholder text when no input', () => {
    render(<FuzzyMatchTesterContent />);
    expect(screen.getByText('Enter two strings above to compare them')).toBeInTheDocument();
  });

  it('should show results when strings are entered', () => {
    render(<FuzzyMatchTesterContent />);
    fireEvent.change(screen.getByTestId('fuzzy-tester-string-a'), { target: { value: 'OADM_Cairo_01' } });
    fireEvent.change(screen.getByTestId('fuzzy-tester-string-b'), { target: { value: 'OADM-Cairo-01' } });
    expect(screen.getByText('Levenshtein Distance')).toBeInTheDocument();
    expect(screen.getByText('Similarity Score')).toBeInTheDocument();
    expect(screen.getByText('Match Strategy')).toBeInTheDocument();
  });

  it('should detect normalized match for delimiter variations', () => {
    render(<FuzzyMatchTesterContent />);
    fireEvent.change(screen.getByTestId('fuzzy-tester-string-a'), { target: { value: 'Node_A_01' } });
    fireEvent.change(screen.getByTestId('fuzzy-tester-string-b'), { target: { value: 'Node-A-01' } });
    // Should show "delimiter" or "normalized" strategy
    expect(screen.getByText('Normalized Match')).toBeInTheDocument();
  });

  it('should show no-match for very different strings', () => {
    render(<FuzzyMatchTesterContent />);
    fireEvent.change(screen.getByTestId('fuzzy-tester-string-a'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByTestId('fuzzy-tester-string-b'), { target: { value: 'xyz' } });
    expect(screen.getByText(/no-match/)).toBeInTheDocument();
  });
});

describe('FuzzyMatchTester (standalone)', () => {
  it('should render with header and description', () => {
    render(<FuzzyMatchTester />);
    expect(screen.getByText('Fuzzy Match Tester')).toBeInTheDocument();
    expect(screen.getByText(/Test string similarity/)).toBeInTheDocument();
  });
});
