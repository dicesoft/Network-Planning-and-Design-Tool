import { describe, it, expect, beforeEach } from 'vitest';
import { useNetworkStore } from '@/stores/networkStore';
import {
  randomFillChannels,
  getDwdmEdgeSummaries,
  previewChannelFill,
} from '../debugDataGenerator';

/**
 * Creates a minimal topology with 2 OADM nodes connected by a fiber edge
 * so that randomFillChannels has DWDM edges to work with.
 */
function createMinimalDwdmTopology(): { nodeIds: string[]; edgeId: string | null } {
  const store = useNetworkStore.getState();
  store.clearTopology();

  const nodeA = store.addNode({ type: 'oadm', position: { x: 0, y: 0 }, name: 'OADM-A', vendor: 'generic' });
  const nodeB = store.addNode({ type: 'oadm', position: { x: 200, y: 0 }, name: 'OADM-B', vendor: 'generic' });

  // Get DWDM ports created by addNode
  const stateAfter = useNetworkStore.getState();
  const nA = stateAfter.topology.nodes.find((n) => n.id === nodeA);
  const nB = stateAfter.topology.nodes.find((n) => n.id === nodeB);
  const portA = nA?.ports?.find((p) => p.type === 'dwdm');
  const portB = nB?.ports?.find((p) => p.type === 'dwdm');

  let edgeId: string | null = null;
  if (portA && portB) {
    edgeId = store.addEdgeWithPorts(nodeA, nodeB, portA.id, portB.id, 'fiber', undefined, undefined, { distance: 50 });
  }

  return { nodeIds: [nodeA, nodeB], edgeId };
}

describe('randomFillChannels', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
  });

  it('should fill exactly N channels in exact mode', () => {
    const { edgeId } = createMinimalDwdmTopology();
    expect(edgeId).toBeTruthy();

    const result = randomFillChannels({
      mode: 'exact',
      exactCount: 40,
      targetUtilization: 0, // not used in exact mode
      allocationStatus: 'allocated',
      fragmentationPattern: 'uniform',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.edgesAffected).toBe(1);
    expect(result.totalAllocated).toBe(40);
    // Each channel produces 2 allocation IDs (src + tgt)
    expect(result.allocationIds).toHaveLength(80);
  });

  it('should fill with utilization mode (default)', () => {
    const { edgeId } = createMinimalDwdmTopology();
    expect(edgeId).toBeTruthy();

    const result = randomFillChannels({
      targetUtilization: 50,
      allocationStatus: 'allocated',
      fragmentationPattern: 'clustered',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.edgesAffected).toBe(1);
    // 50% of 96 = 48
    expect(result.totalAllocated).toBe(48);
  });

  it('should respect edge filter', () => {
    const { edgeId } = createMinimalDwdmTopology();
    expect(edgeId).toBeTruthy();

    // Filter to a non-existent edge => no fill
    const result = randomFillChannels({
      mode: 'exact',
      exactCount: 10,
      targetUtilization: 0,
      allocationStatus: 'allocated',
      fragmentationPattern: 'uniform',
      edgeFilter: ['nonexistent-edge-id'],
    });

    expect(result.edgesAffected).toBe(0);
    expect(result.totalAllocated).toBe(0);
  });

  it('should return error when no DWDM edges exist', () => {
    // Empty topology
    const result = randomFillChannels({
      mode: 'exact',
      exactCount: 10,
      targetUtilization: 0,
      allocationStatus: 'allocated',
      fragmentationPattern: 'uniform',
    });

    expect(result.errors).toContain('No DWDM edges found in topology');
    expect(result.totalAllocated).toBe(0);
  });
});

describe('getDwdmEdgeSummaries', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
  });

  it('should return edge summaries for DWDM edges', () => {
    createMinimalDwdmTopology();
    const summaries = getDwdmEdgeSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].sourceNodeName).toBe('OADM-A');
    expect(summaries[0].targetNodeName).toBe('OADM-B');
    expect(summaries[0].currentAllocated).toBe(0);
  });
});

describe('previewChannelFill', () => {
  beforeEach(() => {
    useNetworkStore.getState().clearTopology();
  });

  it('should preview exact fill correctly', () => {
    createMinimalDwdmTopology();
    const preview = previewChannelFill({
      mode: 'exact',
      exactCount: 40,
      targetUtilization: 0,
      allocationStatus: 'allocated',
      fragmentationPattern: 'uniform',
    });
    expect(preview).toHaveLength(1);
    expect(preview[0].targetCount).toBe(40);
    expect(preview[0].newChannels).toBe(40);
    expect(preview[0].currentAllocated).toBe(0);
  });

  it('should preview utilization fill correctly', () => {
    createMinimalDwdmTopology();
    const preview = previewChannelFill({
      mode: 'utilization',
      targetUtilization: 50,
      allocationStatus: 'allocated',
      fragmentationPattern: 'uniform',
    });
    expect(preview).toHaveLength(1);
    expect(preview[0].targetCount).toBe(48); // 50% of 96
    expect(preview[0].newChannels).toBe(48);
  });
});
