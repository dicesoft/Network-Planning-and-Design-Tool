import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImportWizard } from '../ImportWizard';
import { BrowserRouter } from 'react-router-dom';

// Mock the store
vi.mock('@/stores/networkStore', () => ({
  useNetworkStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        topology: { nodes: [], edges: [], metadata: { modified: new Date().toISOString() } },
        batchAppendNodes: vi.fn(),
        batchAppendEdges: vi.fn(),
      }),
    {
      getState: () => ({
        topology: { nodes: [], edges: [], metadata: { modified: new Date().toISOString() } },
        clearTopology: vi.fn(),
        batchAppendNodes: vi.fn(),
        batchAppendEdges: vi.fn(),
      }),
    },
  ),
}));

// Mock storage helpers
vi.mock('@/lib/indexeddb-storage', () => ({
  suppressPersist: vi.fn(),
  resumePersist: vi.fn(),
}));

vi.mock('@/lib/cross-tab-sync', () => ({
  suppressCrossTabSync: vi.fn(),
  resumeCrossTabSync: vi.fn(),
}));

const renderWizard = (open = true) => {
  const onOpenChange = vi.fn();
  return {
    onOpenChange,
    ...render(
      <BrowserRouter>
        <ImportWizard open={open} onOpenChange={onOpenChange} />
      </BrowserRouter>,
    ),
  };
};

describe('ImportWizard', () => {
  it('should render when open', () => {
    renderWizard(true);
    expect(screen.getByTestId('import-wizard')).toBeInTheDocument();
    expect(screen.getByText('Import Network Topology')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    renderWizard(false);
    expect(screen.queryByTestId('import-wizard')).not.toBeInTheDocument();
  });

  it('should show upload step initially with file drop zones', () => {
    renderWizard();
    expect(screen.getByText('Upload CSV Files')).toBeInTheDocument();
    expect(screen.getByTestId('import-nodes-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('import-edges-dropzone')).toBeInTheDocument();
  });

  it('should show template download buttons', () => {
    renderWizard();
    expect(screen.getByTestId('download-nodes-template')).toBeInTheDocument();
    expect(screen.getByTestId('download-edges-template')).toBeInTheDocument();
    expect(screen.getByTestId('download-services-template')).toBeInTheDocument();
  });

  it('should disable Validate button when no files selected', () => {
    renderWizard();
    // The "Validate" button in the footer (not the step label)
    const buttons = screen.getAllByText('Validate');
    const validateBtn = buttons.find((el) => el.closest('button[disabled]'));
    expect(validateBtn).toBeDefined();
  });

  it('should show all 5 step indicators', () => {
    renderWizard();
    // Step labels are rendered as text inside step indicator divs
    const allText = screen.getByTestId('import-wizard').textContent;
    expect(allText).toContain('Upload');
    expect(allText).toContain('Validate');
    expect(allText).toContain('Preview');
    expect(allText).toContain('Mapping');
    expect(allText).toContain('Import');
  });

  it('should close when Cancel is clicked', () => {
    const { onOpenChange } = renderWizard();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
