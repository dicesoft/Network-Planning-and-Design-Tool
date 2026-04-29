import { useMemo } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { CapacityTracker, createStoreDataProvider } from '@/core/services/CapacityTracker';

/**
 * Shared hook to create a CapacityTracker instance from store data.
 * Deduplicates the createStoreDataProvider + new CapacityTracker pattern
 * used across capacity components (Dashboard, WhatIf, Report, etc.)
 *
 * The tracker is memoized on topology nodes/edges and services array.
 */
export function useCapacityTracker(): CapacityTracker {
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);

  const tracker = useMemo(() => {
    const provider = createStoreDataProvider(
      () => ({ nodes: topology.nodes, edges: topology.edges }),
      () => services,
    );
    return new CapacityTracker(provider);
  }, [topology.nodes, topology.edges, services]);

  return tracker;
}
