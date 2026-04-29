/**
 * T065a / P2.1 — Icon-button accessibility audit (SC-006).
 *
 * Mounts each top-level route page in jsdom inside the providers each one needs
 * (MemoryRouter + TooltipProvider + ReactFlowProvider where applicable) and
 * asserts that every interactive `button` element has a non-empty accessible
 * name (via aria-label, title, or visible text content).
 *
 * Heavy dependencies (React Flow internals, Leaflet, Recharts, the Settings
 * dialog) are stubbed at the module boundary so jsdom can mount the tree
 * without crashing on `getBoundingClientRect`/`L.Map`/canvas APIs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { Header } from '@/components/layout/Header';
import { Toolbar } from '@/components/topology/Toolbar';
import { TooltipProvider } from '@/components/ui/tooltip';

// --- Module mocks (must be hoisted) ---------------------------------------

vi.mock('@/components/settings/SettingsDialog', () => ({
  SettingsDialog: () => null,
}));

// React Flow uses requestAnimationFrame, ResizeObserver, getBoundingClientRect
// internals — stub the whole component layer used by Canvas.
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="react-flow-stub">{children}</div>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    useReactFlow: () => ({
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      fitView: vi.fn(),
      getNodes: () => [],
      getEdges: () => [],
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      project: (p: { x: number; y: number }) => p,
      screenToFlowPosition: (p: { x: number; y: number }) => p,
    }),
    useNodesState: <T,>(initial: T) => [initial, vi.fn(), vi.fn()],
    useEdgesState: <T,>(initial: T) => [initial, vi.fn(), vi.fn()],
  };
});

// Stub the React Flow Canvas (it pulls in many internals).
vi.mock('@/components/topology/Canvas', () => ({
  Canvas: () => <div data-testid="canvas-stub" />,
}));

// Stub Leaflet GeoMapView — Leaflet needs a real DOM map container.
vi.mock('@/components/topology/GeoMapView', () => ({
  GeoMapView: () => <div data-testid="geomap-stub" />,
}));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: () => ({}),
  Marker: () => null,
  Polyline: () => null,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// Recharts uses ResponsiveContainer with measured dimensions.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    ),
  };
});

// jsdom doesn't implement these APIs — stub for any consumer.
beforeEach(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  cleanup();
});

// --- Helpers ---------------------------------------------------------------

function findNamelessButtons(): HTMLButtonElement[] {
  // queryAllByRole('button', { name: '' }) matches any button whose accessible
  // name is empty (no aria-label, no aria-labelledby target, no visible text).
  return screen.queryAllByRole('button', { name: '' }) as HTMLButtonElement[];
}

function expectNoNamelessButtons(routeLabel: string): void {
  const nameless = findNamelessButtons();
  if (nameless.length > 0) {
    const offending = nameless
      .map((b, i) => `  [${i}] ${b.outerHTML.slice(0, 240)}`)
      .join('\n');
    throw new Error(
      `[${routeLabel}] Found ${nameless.length} button(s) with no accessible name:\n${offending}`,
    );
  }
  expect(nameless).toHaveLength(0);
}

// --- Tests -----------------------------------------------------------------

describe('icon-only button audit (SC-006 / P2.1)', () => {
  it('Header has accessible names on every button', () => {
    render(
      <MemoryRouter>
        <TooltipProvider>
          <Header />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expectNoNamelessButtons('Header');
  });

  it('Topology Toolbar (/) has accessible names on every button', () => {
    // Toolbar uses useReactFlow() so it requires <ReactFlowProvider>. Canvas
    // and GeoMapView are stubbed for the page-level tests, so this direct
    // mount is what actually exercises Toolbar's icon-only buttons (zoom,
    // undo/redo, duplicate/delete, tool-mode buttons, dropdown triggers).
    render(
      <MemoryRouter>
        <ReactFlowProvider>
          <TooltipProvider>
            <Toolbar />
          </TooltipProvider>
        </ReactFlowProvider>
      </MemoryRouter>,
    );
    expectNoNamelessButtons('/ (Toolbar)');
  });

  it('ServicesPage has accessible names on every button', async () => {
    const { ServicesPage } = await import('@/pages/ServicesPage');
    render(
      <MemoryRouter initialEntries={['/services']}>
        <TooltipProvider>
          <ServicesPage />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expectNoNamelessButtons('/services');
  });

  it('CapacityPage has accessible names on every button', async () => {
    const { CapacityPage } = await import('@/pages/CapacityPage');
    render(
      <MemoryRouter initialEntries={['/capacity']}>
        <TooltipProvider>
          <CapacityPage />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expectNoNamelessButtons('/capacity');
  });

  it('SimulationPage has accessible names on every button', async () => {
    const { SimulationPage } = await import('@/pages/SimulationPage');
    render(
      <MemoryRouter initialEntries={['/simulation']}>
        <TooltipProvider>
          <SimulationPage />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expectNoNamelessButtons('/simulation');
  });

  it('ForecastPage has accessible names on every button', async () => {
    const { ForecastPage } = await import('@/pages/ForecastPage');
    render(
      <MemoryRouter initialEntries={['/forecast']}>
        <TooltipProvider>
          <ForecastPage />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expectNoNamelessButtons('/forecast');
  });

  it('ReportsPage has accessible names on every button', async () => {
    const { ReportsPage } = await import('@/pages/ReportsPage');
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <TooltipProvider>
          <ReportsPage />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expectNoNamelessButtons('/reports');
  });

  it('ToolsPage has accessible names on every button', async () => {
    const { ToolsPage } = await import('@/pages/ToolsPage');
    render(
      <MemoryRouter initialEntries={['/tools']}>
        <TooltipProvider>
          <ToolsPage />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expectNoNamelessButtons('/tools');
  });
});
