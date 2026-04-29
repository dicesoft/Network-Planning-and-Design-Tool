import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox, type ComboboxOption } from '../combobox';

const TEST_OPTIONS: ComboboxOption[] = [
  { value: 'node-1', label: 'New York' },
  { value: 'node-2', label: 'Chicago' },
  { value: 'node-3', label: 'Los Angeles' },
  { value: 'node-4', label: 'Denver', description: 'Mountain West' },
  { value: 'node-5', label: 'Miami', disabled: true },
];

describe('Combobox', () => {
  it('should render with placeholder when no value is selected', () => {
    render(
      <Combobox
        options={TEST_OPTIONS}
        value=""
        onChange={() => {}}
        placeholder="Select a city"
      />
    );
    expect(screen.getByRole('combobox')).toBeDefined();
    expect(screen.getByText('Select a city')).toBeDefined();
  });

  it('should display selected option label', () => {
    render(
      <Combobox
        options={TEST_OPTIONS}
        value="node-2"
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Chicago')).toBeDefined();
  });

  it('should open dropdown on click and show all options', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={TEST_OPTIONS}
        value=""
        onChange={() => {}}
      />
    );
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    expect(screen.getByText('New York')).toBeDefined();
    expect(screen.getByText('Chicago')).toBeDefined();
    expect(screen.getByText('Los Angeles')).toBeDefined();
    expect(screen.getByText('Denver')).toBeDefined();
  });

  it('should filter options based on search input', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={TEST_OPTIONS}
        value=""
        onChange={() => {}}
      />
    );
    await user.click(screen.getByRole('combobox'));

    const searchInput = screen.getByPlaceholderText('Search...');
    await user.type(searchInput, 'new');

    // "New York" should match
    expect(screen.getByText('New York')).toBeDefined();
    // Others should be filtered out (cmdk hides non-matching items)
    expect(screen.queryByText('Chicago')).toBeNull();
    expect(screen.queryByText('Los Angeles')).toBeNull();
  });

  it('should call onChange when an option is selected', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Combobox
        options={TEST_OPTIONS}
        value=""
        onChange={handleChange}
      />
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Chicago'));

    expect(handleChange).toHaveBeenCalledWith('node-2');
  });

  it('should show empty message when no options match search', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={TEST_OPTIONS}
        value=""
        onChange={() => {}}
        emptyMessage="No cities found."
      />
    );
    await user.click(screen.getByRole('combobox'));

    const searchInput = screen.getByPlaceholderText('Search...');
    await user.type(searchInput, 'zzzzz');

    expect(screen.getByText('No cities found.')).toBeDefined();
  });

  it('should show option description when provided', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={TEST_OPTIONS}
        value=""
        onChange={() => {}}
      />
    );
    await user.click(screen.getByRole('combobox'));

    expect(screen.getByText('Mountain West')).toBeDefined();
  });

  it('should set aria-expanded to true when open', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={TEST_OPTIONS}
        value=""
        onChange={() => {}}
      />
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('should be disabled when disabled prop is true', () => {
    render(
      <Combobox
        options={TEST_OPTIONS}
        value=""
        onChange={() => {}}
        disabled={true}
      />
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger.hasAttribute('disabled')).toBe(true);
  });

  it('should use custom search placeholder', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={TEST_OPTIONS}
        value=""
        onChange={() => {}}
        searchPlaceholder="Find a node..."
      />
    );
    await user.click(screen.getByRole('combobox'));

    expect(screen.getByPlaceholderText('Find a node...')).toBeDefined();
  });

  it('should deselect when clicking the already selected option', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Combobox
        options={TEST_OPTIONS}
        value="node-2"
        onChange={handleChange}
      />
    );
    await user.click(screen.getByRole('combobox'));
    // The option in the list is an element with role="option"
    const options = screen.getAllByRole('option');
    const chicagoOption = options.find((opt) => opt.textContent?.includes('Chicago'));
    expect(chicagoOption).toBeDefined();
    await user.click(chicagoOption!);

    // Should deselect (pass empty string)
    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('should show check icon for selected option via SVG', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={TEST_OPTIONS}
        value="node-1"
        onChange={() => {}}
      />
    );
    await user.click(screen.getByRole('combobox'));

    // The selected option (New York) should have an SVG check icon inside the indicator span
    const options = screen.getAllByRole('option');
    const newYorkOption = options.find((opt) => opt.textContent?.includes('New York'));
    expect(newYorkOption).toBeDefined();
    // The check icon renders as an SVG element inside the indicator span
    const svgCheck = newYorkOption!.querySelector('svg');
    expect(svgCheck).not.toBeNull();
  });

  it('should handle empty options array', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={[]}
        value=""
        onChange={() => {}}
        emptyMessage="No options available"
      />
    );
    await user.click(screen.getByRole('combobox'));

    expect(screen.getByText('No options available')).toBeDefined();
  });
});
