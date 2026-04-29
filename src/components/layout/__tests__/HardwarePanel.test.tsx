import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useSettingsStore } from '@/stores/settingsStore';
import { HardwarePanel } from '../HardwarePanel';

describe('HardwarePanel', () => {
  beforeEach(() => {
    // Reset settings to defaults (which include the default card library)
    useSettingsStore.getState().resetAll();
  });

  it('renders hardware panel with cards grouped by node type', () => {
    render(<HardwarePanel />);

    expect(screen.getByTestId('hardware-panel')).toBeDefined();
    // Default library has Router, OADM, Terminal, Switch cards
    expect(screen.getByText('Router')).toBeDefined();
    expect(screen.getByText('OADM')).toBeDefined();
  });

  it('renders individual card items with drag handles', () => {
    render(<HardwarePanel />);

    // Default library includes IMM24-10G and IMM8-100G for router
    expect(screen.getByTestId('hardware-card-imm24-10g')).toBeDefined();
    expect(screen.getByTestId('hardware-card-imm8-100g')).toBeDefined();
  });

  it('shows port summary for each card', () => {
    render(<HardwarePanel />);

    // IMM24-10G has 24x10G BW ports
    expect(screen.getByText('24x10G BW')).toBeDefined();
    // IMM8-100G has 8x100G BW ports
    expect(screen.getByText('8x100G BW')).toBeDefined();
  });

  it('makes cards draggable with correct data type', () => {
    render(<HardwarePanel />);

    const card = screen.getByTestId('hardware-card-imm24-10g');
    expect(card.getAttribute('draggable')).toBe('true');
  });
});
