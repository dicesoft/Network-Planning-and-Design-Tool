import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmDialog } from '../confirm-dialog';
import { pluralize } from '@/lib/pluralize';

/**
 * P4.1 — pluralize() coverage on the reset-confirm dialog.
 *
 * Guards against regressions like "1 nodes will be removed" by asserting
 * that the singular form is used when count === 1.
 */
describe('ConfirmDialog — pluralized details (P4.1)', () => {
  it('renders singular nouns when count is 1', () => {
    const count = 1;
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Reset Network"
        description="This will permanently remove all topology data, services, and simulation results."
        details={[
          `${count} ${pluralize('node', count)} will be removed`,
          `${count} ${pluralize('edge', count)} will be removed`,
          `${count} ${pluralize('service', count)} will be removed`,
        ]}
        confirmLabel="Reset Network"
        variant="destructive"
        onConfirm={() => {}}
      />,
    );

    // Singular forms must be used.
    expect(screen.getByText('1 node will be removed')).toBeDefined();
    expect(screen.getByText('1 edge will be removed')).toBeDefined();
    expect(screen.getByText('1 service will be removed')).toBeDefined();

    // Negative assertion: nothing should render the broken plural.
    const dialog = screen.getByRole('dialog');
    const text = dialog.textContent ?? '';
    expect(text).not.toContain('1 nodes');
    expect(text).not.toContain('1 edges');
    expect(text).not.toContain('1 services');
  });

  it('renders plural nouns when count is greater than 1', () => {
    const count = 3;
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Reset Network"
        details={[
          `${count} ${pluralize('node', count)} will be removed`,
          `${count} ${pluralize('edge', count)} will be removed`,
          `${count} ${pluralize('service', count)} will be removed`,
        ]}
        confirmLabel="Reset Network"
        variant="destructive"
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText('3 nodes will be removed')).toBeDefined();
    expect(screen.getByText('3 edges will be removed')).toBeDefined();
    expect(screen.getByText('3 services will be removed')).toBeDefined();
  });

  it('renders plural nouns when count is 0', () => {
    const count = 0;
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Reset Network"
        details={[`${count} ${pluralize('node', count)} will be removed`]}
        confirmLabel="Reset Network"
        variant="destructive"
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText('0 nodes will be removed')).toBeDefined();
  });
});
