/**
 * P2.4 — Empty-state component test for NetworkHealthCheck.
 *
 * Asserts:
 *   - When the topology has no edges or no services, the component shows the
 *     "Requires at least one edge and one service." precondition copy and the
 *     Run button is disabled (no CTA available).
 *   - When the topology has edges + services but no result yet, the
 *     `health-check-empty-state` panel renders with a description and a
 *     pointer to the Run Health Check CTA.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetworkHealthCheck } from '../NetworkHealthCheck';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useSimulationStore } from '@/stores/simulationStore';

describe('NetworkHealthCheck — empty state (P2.4 / FR-019)', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
    useServiceStore.setState((s) => ({ ...s, services: [] }));
    useSimulationStore.setState((s) => ({
      ...s,
      healthCheckResult: null,
      healthCheckIsRunning: false,
    }));
  });

  it('shows precondition copy and disables the Run button when input is empty', () => {
    render(<NetworkHealthCheck />);

    expect(
      screen.getByText(/Requires at least one edge and one service/i),
    ).toBeInTheDocument();

    const runButton = screen.getByRole('button', { name: /Run Health Check/i });
    expect(runButton).toBeDisabled();

    expect(screen.queryByTestId('health-check-empty-state')).not.toBeInTheDocument();
  });

  it('renders the description card with CTA pointer once preconditions are satisfied', () => {
    const network = useNetworkStore.getState();
    const a = network.addNode({ type: 'router', position: { x: 0, y: 0 } });
    const b = network.addNode({ type: 'router', position: { x: 100, y: 0 } });
    const portsA = useNetworkStore.getState().topology.nodes.find((n) => n.id === a)?.ports ?? [];
    const portsB = useNetworkStore.getState().topology.nodes.find((n) => n.id === b)?.ports ?? [];
    if (portsA.length > 0 && portsB.length > 0) {
      useNetworkStore.getState().addEdge(a, b, portsA[0].id, portsB[0].id);
    }
    useServiceStore.setState((s) => ({
      ...s,
      services: [{ id: 'svc-1' }] as unknown as ReturnType<typeof useServiceStore.getState>['services'],
    }));

    render(<NetworkHealthCheck />);

    const panel = screen.getByTestId('health-check-empty-state');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent(/Network Health Check/i);
    expect(panel).toHaveTextContent(/Estimated runtime/i);
    expect(panel).toHaveTextContent(/Run Health Check/i);

    expect(screen.getByRole('button', { name: /Run Health Check/i })).toBeEnabled();
  });
});
