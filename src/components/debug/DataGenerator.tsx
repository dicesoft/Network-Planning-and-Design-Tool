import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  randomFillChannels,
  generateL1Services,
  generateL2L3ServicesOnly,
  loadMetroRingSeedScenario,
  clearDebugChannelAllocations,
  clearDebugServices,
  clearAllDebugData,
  getDebugDataStats,
  getActiveL1ServiceCount,
  estimateChannelFill,
  getDwdmEdgeSummaries,
  previewChannelFill,
  presetLight,
  presetModerate,
  presetHeavy,
  presetBottleneck,
  presetFragmented,
  presetFiveServicesMixed,
  presetTenServicesProtected,
  loadTopologyPresetAsync,
  loadStressTestPlusPreset,
  TOPOLOGY_PRESETS,
  type FillMode,
  type FragmentationPattern,
  type AllocationStatus,
  type StatusMix,
  type ChannelStrategy,
  type DebugDataStats,
  type ChannelFillEstimate,
  type EdgeFillPreview,
} from '@/lib/debugDataGenerator';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useNetworkStore } from '@/stores/networkStore';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import { Button } from '@/components/ui/button';

// ============================================================================
// STYLES (Atlas theme tokens)
// ============================================================================

const sectionClass = 'rounded border border-border bg-elevated/50 p-3';
const labelClass = 'block text-xs font-medium text-text-secondary mb-1';
const selectClass =
  'w-full rounded border border-border bg-canvas px-2 py-1 text-xs text-text-primary focus:border-primary focus:outline-none';
const sliderClass = 'h-1.5 w-full cursor-pointer accent-primary';
const radioGroupClass = 'flex gap-3 text-xs text-text-secondary';

// ============================================================================
// COMPONENT
// ============================================================================

export const DataGenerator: React.FC = () => {
  // State for random channel fill
  const [fillMode, setFillMode] = useState<FillMode>('utilization');
  const [fillUtilization, setFillUtilization] = useState(50);
  const [fillExactCount, setFillExactCount] = useState(40);
  const [fillPattern, setFillPattern] = useState<FragmentationPattern>('clustered');
  const [fillStatus, setFillStatus] = useState<AllocationStatus>('allocated');
  const [fillVariation, setFillVariation] = useState(0);
  const [fillEstimate, setFillEstimate] = useState<ChannelFillEstimate | null>(null);
  const [fillEdgeFilter, setFillEdgeFilter] = useState<string[]>([]);
  const [showFillPreview, setShowFillPreview] = useState(false);
  const [fillPreview, setFillPreview] = useState<EdgeFillPreview[]>([]);

  // State for L1 DWDM service generation (Task 8.1: separate controls)
  const [l1Count, setL1Count] = useState(5);
  const [l1Protection, setL1Protection] = useState(50);
  const [l1StatusMix, setL1StatusMix] = useState<StatusMix>('mixed');
  const [l1ChannelStrategy, setL1ChannelStrategy] = useState<ChannelStrategy>('sequential');

  // State for L2/L3 IP service generation (Task 8.1: separate controls)
  const [l2l3Count, setL2l3Count] = useState(3);
  const [l2l3UnderlayMode, setL2l3UnderlayMode] = useState<'auto' | 'existing'>('auto');
  const [l2l3BfdEnabled, setL2l3BfdEnabled] = useState(true);
  const [activeL1Count, setActiveL1Count] = useState(0);

  // State for topology preset selection
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // State for geo relocation (Task 4.4)
  const [geoLat, setGeoLat] = useState('40.7128');
  const [geoLng, setGeoLng] = useState('-74.0060');
  const [geoRadius, setGeoRadius] = useState(2.0);

  // Output
  const [output, setOutput] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DebugDataStats | null>(null);

  // Loading overlay state for large presets
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayProgress, setOverlayProgress] = useState(0);
  const [overlayStatus, setOverlayStatus] = useState('');
  const cancelledRef = useRef(false);
  const overlayStartRef = useRef(0);

  /** Close overlay with minimum 500ms display time */
  const closeOverlay = useCallback(() => {
    const elapsed = Date.now() - overlayStartRef.current;
    const remaining = Math.max(0, 500 - elapsed);
    setTimeout(() => {
      setOverlayOpen(false);
    }, remaining);
  }, []);

  /** Open overlay and reset cancel flag */
  const openOverlay = useCallback(() => {
    cancelledRef.current = false;
    overlayStartRef.current = Date.now();
    setOverlayOpen(true);
    setOverlayProgress(0);
    setOverlayStatus('');
  }, []);

  /** Cancel handler for overlay */
  const handleOverlayCancel = useCallback(() => {
    cancelledRef.current = true;
    closeOverlay();
    setLoading(false);
  }, [closeOverlay]);

  const refreshStats = useCallback(() => {
    setStats(getDebugDataStats());
    setActiveL1Count(getActiveL1ServiceCount());
  }, []);

  // Update channel fill estimate when parameters change
  useEffect(() => {
    const est = estimateChannelFill(fillUtilization);
    setFillEstimate(est);
  }, [fillUtilization]);

  // Compute edge summaries for filter UI
  const edgeSummaries = useMemo(() => getDwdmEdgeSummaries(), [stats]);

  // Update fill preview when config changes
  useEffect(() => {
    if (showFillPreview) {
      const preview = previewChannelFill({
        mode: fillMode,
        targetUtilization: fillUtilization,
        exactCount: fillExactCount,
        allocationStatus: fillStatus,
        fragmentationPattern: fillPattern,
        edgeFilter: fillEdgeFilter.length > 0 ? fillEdgeFilter : undefined,
        variation: fillVariation,
      });
      setFillPreview(preview);
    }
  }, [showFillPreview, fillMode, fillUtilization, fillExactCount, fillStatus, fillPattern, fillEdgeFilter, fillVariation]);

  const log = useCallback((msg: string) => {
    setOutput((prev) => [...prev.slice(-49), msg]);
  }, []);

  const runAction = useCallback(
    (label: string, action: () => void) => {
      setLoading(true);
      log(`Running: ${label}...`);
      requestAnimationFrame(() => {
        try {
          action();
          refreshStats();
        } catch (err) {
          log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setLoading(false);
        }
      });
    },
    [log, refreshStats]
  );

  // --- Handlers ---

  const handleLoadMetroRing = () => {
    runAction('Load Metro Ring Scenario', () => {
      const r = loadMetroRingSeedScenario();
      log(
        `Metro Ring: ${r.nodesCreated} nodes, ${r.edgesCreated} edges, ${r.servicesCreated} services, ${r.channelsAllocated} channels filled`
      );
      if (r.errors.length > 0) log(`Warnings: ${r.errors.join('; ')}`);
    });
  };

  const handleLoadStressTestPlus = useCallback(async () => {
    setLoading(true);
    openOverlay();
    setOverlayStatus('Preparing Stress Test+...');
    log('Running: Load Stress Test+...');
    const addToast = useUIStore.getState().addToast;

    // Warn about large topology
    addToast({
      type: 'warning',
      title: 'Loading large topology',
      message: '200+ nodes, 400+ edges. History depth reduced to 20.',
    });

    // Reduce history depth for large topologies
    useSettingsStore.getState().updateAdvancedSettings({ historyLimit: 20 });

    try {
      const r = await loadStressTestPlusPreset((msg) => {
        if (cancelledRef.current) return;
        log(msg);
        // Parse progress from status messages
        const match = msg.match(/(\d+)\/(\d+)/);
        if (match) {
          const done = parseInt(match[1], 10);
          const total = parseInt(match[2], 10);
          if (total > 0) setOverlayProgress(Math.round((done / total) * 100));
        }
        setOverlayStatus(msg);
      });
      if (cancelledRef.current) return;
      log(`Stress Test+: ${r.nodesCreated} nodes, ${r.edgesCreated} edges`);
      if (r.errors.length > 0) log(`Warnings: ${r.errors.join('; ')}`);
      setOverlayProgress(100);
      setOverlayStatus(`Loaded: ${r.nodesCreated} nodes, ${r.edgesCreated} edges`);
      addToast({
        type: 'success',
        title: `Loaded: ${r.nodesCreated} nodes, ${r.edgesCreated} edges`,
      });
      refreshStats();
    } catch (err) {
      if (!cancelledRef.current) {
        log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setLoading(false);
      closeOverlay();
    }
  }, [log, refreshStats, openOverlay, closeOverlay]);

  const handleLoadPreset = useCallback(async () => {
    if (!selectedPreset) return;

    // Special handling for stress-test-plus (async with larger overlay)
    if (selectedPreset === 'stress-test-plus') {
      handleLoadStressTestPlus();
      return;
    }

    const preset = TOPOLOGY_PRESETS.find((p) => p.id === selectedPreset);
    if (!preset) return;

    setLoading(true);
    openOverlay();
    setOverlayStatus(`Preparing ${preset.name}...`);
    log(`Running: Load ${preset.name}...`);

    try {
      const r = await loadTopologyPresetAsync(selectedPreset, (percent, status) => {
        if (cancelledRef.current) return;
        // Use semantic stage messages
        let semanticStatus = status;
        if (percent <= 10) semanticStatus = `Preparing ${preset.name}...`;
        else if (percent <= 20) semanticStatus = 'Clearing topology...';
        else if (percent <= 40) semanticStatus = `Generating nodes...`;
        else if (percent <= 70) semanticStatus = `Creating edges...`;
        else if (percent <= 90) semanticStatus = `Provisioning services...`;
        else semanticStatus = status;
        setOverlayProgress(percent);
        setOverlayStatus(semanticStatus);
      });
      if (cancelledRef.current) return;
      log(
        `${preset.name}: ${r.nodesCreated} nodes, ${r.edgesCreated} edges, ${r.servicesCreated} services, ${r.channelsAllocated} channels filled`
      );
      if (r.errors.length > 0) log(`Warnings: ${r.errors.join('; ')}`);
      refreshStats();
    } catch (err) {
      if (!cancelledRef.current) {
        log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setLoading(false);
      closeOverlay();
    }
  }, [selectedPreset, log, refreshStats, handleLoadStressTestPlus, openOverlay, closeOverlay]);

  const handleFillChannels = () => {
    const modeLabel = fillMode === 'exact'
      ? `exact ${fillExactCount} ch`
      : `${fillUtilization}%`;
    runAction(`Fill channels (${modeLabel}, ${fillPattern})`, () => {
      const r = randomFillChannels({
        mode: fillMode,
        targetUtilization: fillUtilization,
        exactCount: fillExactCount,
        allocationStatus: fillStatus,
        fragmentationPattern: fillPattern,
        edgeFilter: fillEdgeFilter.length > 0 ? fillEdgeFilter : undefined,
        variation: fillVariation,
      });
      log(`Filled: ${r.totalAllocated} channels on ${r.edgesAffected} edges`);
      if (r.errors.length > 0) log(`Errors: ${r.errors.join('; ')}`);
    });
  };

  const handleGenerateL1 = () => {
    runAction(`Generate ${l1Count} L1 DWDM services`, () => {
      const r = generateL1Services({
        count: l1Count,
        protectionRatio: l1Protection,
        statusMix: l1StatusMix,
        channelStrategy: l1ChannelStrategy,
      });
      log(`L1 Created: ${r.created} services [${r.serviceIds.join(', ')}]`);
      if (r.errors.length > 0) log(`Errors: ${r.errors.join('; ')}`);
    });
  };

  const handleGenerateL2L3 = () => {
    runAction(`Generate ${l2l3Count} L2/L3 services`, () => {
      const r = generateL2L3ServicesOnly({
        count: l2l3Count,
        underlayMode: l2l3UnderlayMode,
        bfdEnabled: l2l3BfdEnabled,
      });
      log(`L2/L3 Created: ${r.created} services [${r.serviceIds.join(', ')}]`);
      if (r.errors.length > 0) log(`Info: ${r.errors.join('; ')}`);
    });
  };

  const handlePreset = (label: string, fn: () => unknown) => {
    runAction(label, () => {
      const r = fn();
      if (r && typeof r === 'object') {
        log(`${label}: ${JSON.stringify(r, null, 0).slice(0, 200)}`);
      }
    });
  };

  const handleClearChannels = () => {
    runAction('Clear debug channels', () => {
      const count = clearDebugChannelAllocations();
      log(`Removed ${count} debug channel allocations`);
    });
  };

  const handleClearServices = () => {
    runAction('Clear debug services', () => {
      const count = clearDebugServices();
      log(`Removed ${count} debug services`);
    });
  };

  const handleClearAll = () => {
    runAction('Clear all debug data', () => {
      const r = clearAllDebugData();
      log(`Removed ${r.servicesRemoved} services, ${r.allocationsRemoved} allocations`);
    });
  };

  const handleGeoRelocate = useCallback(() => {
    const lat = parseFloat(geoLat);
    const lng = parseFloat(geoLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      log('ERROR: Invalid center coordinates');
      return;
    }

    const store = useNetworkStore.getState();
    const nodes = store.topology.nodes;
    if (nodes.length === 0) {
      log('ERROR: No nodes in topology');
      return;
    }

    // Compute bounding box of schematic positions
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.position.x);
      maxX = Math.max(maxX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxY = Math.max(maxY, node.position.y);
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    // Scale schematic positions to lat/lng offsets within the radius
    let updated = 0;
    for (const node of nodes) {
      const normX = (node.position.x - minX) / rangeX - 0.5; // -0.5 to 0.5
      const normY = (node.position.y - minY) / rangeY - 0.5;
      const newLat = lat + normY * geoRadius * -1; // Invert Y: top of schematic = north
      const newLng = lng + normX * geoRadius;

      store.updateNode(node.id, {
        location: {
          ...node.location,
          latitude: parseFloat(newLat.toFixed(6)),
          longitude: parseFloat(newLng.toFixed(6)),
        },
      });
      updated++;
    }

    log(`Geo Relocate: Updated coordinates for ${updated} nodes around (${lat}, ${lng}), radius ${geoRadius} deg`);
    refreshStats();
  }, [geoLat, geoLng, geoRadius, log, refreshStats]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* 1. Seed Scenarios */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Seed Scenarios</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleLoadMetroRing} disabled={loading}>
            Load Metro Ring
          </Button>
          <span className="text-xs text-text-muted">
            9 nodes, 10 edges, 12 services, varied utilization
          </span>
        </div>
      </div>

      {/* 2. Topology Presets */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Topology Presets</h3>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {TOPOLOGY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setSelectedPreset(preset.id)}
              className={`rounded border p-2 text-left transition-colors ${
                selectedPreset === preset.id
                  ? 'bg-primary/10 ring-primary/30 border-primary ring-1'
                  : 'bg-elevated/50 border-border hover:border-border-light hover:bg-elevated'
              }`}
            >
              <div className="text-xs font-medium text-text-primary">{preset.name}</div>
              <div className="mt-0.5 text-[10px] leading-tight text-text-muted">
                {preset.description}
              </div>
              <div className="mt-1 flex gap-2 text-[10px] text-text-muted">
                <span>{preset.nodeCount} nodes</span>
                <span>{preset.edgeCount} edges</span>
                <span>{preset.serviceCount} svcs</span>
              </div>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleLoadPreset}
            disabled={loading || !selectedPreset}
          >
            Load Preset
          </Button>
          <span className="text-xs text-text-muted">
            {selectedPreset
              ? `Selected: ${TOPOLOGY_PRESETS.find((p) => p.id === selectedPreset)?.name}`
              : 'Select a preset above'}
          </span>
        </div>
      </div>

      {/* 3. Channel Fill (enhanced with fill mode, edge filter, variation, preview) */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Channel Fill</h3>

        {/* Fill Mode Toggle */}
        <div className="mb-3">
          <label className={labelClass}>Fill Mode</label>
          <div className="flex gap-1">
            <button
              onClick={() => setFillMode('utilization')}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                fillMode === 'utilization'
                  ? 'bg-primary text-white'
                  : 'border border-border bg-elevated text-text-secondary hover:bg-tertiary'
              }`}
              data-testid="fill-mode-utilization"
            >
              Utilization %
            </button>
            <button
              onClick={() => setFillMode('exact')}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                fillMode === 'exact'
                  ? 'bg-primary text-white'
                  : 'border border-border bg-elevated text-text-secondary hover:bg-tertiary'
              }`}
              data-testid="fill-mode-exact"
            >
              Exact Count
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Target value based on fill mode */}
          <div>
            {fillMode === 'utilization' ? (
              <>
                <label className={labelClass}>
                  Target Utilization: {fillUtilization}%
                </label>
                <input
                  type="range"
                  min={5}
                  max={95}
                  step={5}
                  value={fillUtilization}
                  onChange={(e) => setFillUtilization(Number(e.target.value))}
                  className={sliderClass}
                  data-testid="fill-utilization-slider"
                />
                {fillEstimate && fillEstimate.dwdmEdgeCount > 0 && (
                  <div className="mt-1 text-[10px] text-text-muted">
                    Target: {fillUtilization}% = ~{fillEstimate.targetChannelsPerEdge} ch/edge on {fillEstimate.dwdmEdgeCount} edges
                    {fillEstimate.alreadyAllocatedAvg > 0 && (
                      <span> (avg {fillEstimate.alreadyAllocatedAvg} already allocated)</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <label className={labelClass}>
                  Exact Channels: {fillExactCount}
                </label>
                <input
                  type="range"
                  min={1}
                  max={96}
                  step={1}
                  value={fillExactCount}
                  onChange={(e) => setFillExactCount(Number(e.target.value))}
                  className={sliderClass}
                  data-testid="fill-exact-slider"
                />
                <div className="mt-1 text-[10px] text-text-muted">
                  Fill exactly {fillExactCount} channels per selected edge
                </div>
              </>
            )}
          </div>

          {/* Variation slider */}
          <div>
            <label className={labelClass}>
              Variation: {fillVariation}%
            </label>
            <input
              type="range"
              min={0}
              max={50}
              step={5}
              value={fillVariation}
              onChange={(e) => setFillVariation(Number(e.target.value))}
              className={sliderClass}
              data-testid="fill-variation-slider"
            />
            <div className="mt-1 text-[10px] text-text-muted">
              {fillVariation === 0
                ? 'Uniform across all edges'
                : `+/- ${fillVariation}% random variation per edge`}
            </div>
          </div>

          {/* Pattern */}
          <div>
            <label className={labelClass}>Pattern</label>
            <div className={radioGroupClass}>
              {(['uniform', 'clustered', 'fragmented'] as const).map((p) => (
                <label key={p} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="fillPattern"
                    checked={fillPattern === p}
                    onChange={() => setFillPattern(p)}
                    className="accent-primary"
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className={labelClass}>Status</label>
            <div className={radioGroupClass}>
              {(['allocated', 'reserved'] as const).map((s) => (
                <label key={s} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="fillStatus"
                    checked={fillStatus === s}
                    onChange={() => setFillStatus(s)}
                    className="accent-primary"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Edge Filter Multi-Select */}
        {edgeSummaries.length > 0 && (
          <div className="mt-3">
            <label className={labelClass}>
              Edge Filter ({fillEdgeFilter.length === 0 ? 'all edges' : `${fillEdgeFilter.length} selected`})
            </label>
            <div className="max-h-28 overflow-y-auto rounded border border-border bg-canvas p-1.5" data-testid="edge-filter-list">
              {edgeSummaries.map((edge) => (
                <label
                  key={edge.edgeId}
                  className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[10px] text-text-secondary hover:bg-elevated"
                >
                  <input
                    type="checkbox"
                    checked={fillEdgeFilter.includes(edge.edgeId)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFillEdgeFilter((prev) => [...prev, edge.edgeId]);
                      } else {
                        setFillEdgeFilter((prev) => prev.filter((id) => id !== edge.edgeId));
                      }
                    }}
                    className="accent-primary"
                  />
                  <span className="truncate">{edge.sourceNodeName} - {edge.targetNodeName}</span>
                  <span className="ml-auto text-text-muted">{edge.currentAllocated}/96</span>
                </label>
              ))}
            </div>
            {fillEdgeFilter.length > 0 && (
              <button
                className="mt-1 text-[10px] text-primary hover:underline"
                onClick={() => setFillEdgeFilter([])}
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* Actions: Preview + Fill */}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={handleFillChannels} disabled={loading}>
            Fill Channels
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFillPreview(!showFillPreview)}
            data-testid="toggle-fill-preview"
          >
            {showFillPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
        </div>

        {/* Preview Table */}
        {showFillPreview && fillPreview.length > 0 && (
          <div className="mt-2 max-h-36 overflow-y-auto rounded border border-border" data-testid="fill-preview-table">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-elevated text-text-secondary">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Edge</th>
                  <th className="px-2 py-1 text-right font-medium">Current</th>
                  <th className="px-2 py-1 text-right font-medium">Target</th>
                  <th className="px-2 py-1 text-right font-medium">New</th>
                </tr>
              </thead>
              <tbody className="text-text-primary">
                {fillPreview.map((row) => (
                  <tr key={row.edgeId} className="border-border/50 hover:bg-elevated/30 border-t">
                    <td className="max-w-[140px] truncate px-2 py-1">{row.sourceNodeName} - {row.targetNodeName}</td>
                    <td className="px-2 py-1 text-right font-mono">{row.currentAllocated}</td>
                    <td className="px-2 py-1 text-right font-mono">{row.targetCount}</td>
                    <td className={`px-2 py-1 text-right font-mono ${row.newChannels > 0 ? 'text-success' : 'text-text-muted'}`}>
                      {row.newChannels > 0 ? `+${row.newChannels}` : '0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showFillPreview && fillPreview.length === 0 && (
          <div className="mt-2 py-2 text-center text-[10px] text-text-muted">
            No DWDM edges in topology
          </div>
        )}
      </div>

      {/* 4. L1 DWDM Service Generation (Task 8.1: separate from L2/L3) */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">L1 DWDM Services</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Count: {l1Count}</label>
            <input
              type="range"
              min={1}
              max={20}
              value={l1Count}
              onChange={(e) => setL1Count(Number(e.target.value))}
              className={sliderClass}
            />
          </div>
          <div>
            <label className={labelClass}>Protection Ratio: {l1Protection}%</label>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={l1Protection}
              onChange={(e) => setL1Protection(Number(e.target.value))}
              className={sliderClass}
            />
          </div>
          <div>
            <label className={labelClass}>Status Mix</label>
            <select
              value={l1StatusMix}
              onChange={(e) => setL1StatusMix(e.target.value as StatusMix)}
              className={selectClass}
            >
              <option value="all-active">All Active</option>
              <option value="all-planned">All Planned</option>
              <option value="mixed">Mixed (60/20/10/10)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Channel Strategy</label>
            <div className={radioGroupClass}>
              {(['sequential', 'random'] as const).map((s) => (
                <label key={s} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="l1ChannelStrategy"
                    checked={l1ChannelStrategy === s}
                    onChange={() => setL1ChannelStrategy(s)}
                    className="accent-primary"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <Button size="sm" onClick={handleGenerateL1} disabled={loading}>
              Generate L1 Services
            </Button>
          </div>
        </div>
      </div>

      {/* 5. L2/L3 IP Service Generation (Task 8.1: separate with underlay note) */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">L2/L3 IP Services</h3>
        <div className="mb-2 rounded bg-canvas px-2 py-1.5 text-[10px] text-text-secondary">
          L2/L3 services require existing L1 DWDM underlays.
          Active L1 services: <span className="font-semibold text-text-primary">{activeL1Count}</span>
          {activeL1Count === 0 && l2l3UnderlayMode === 'existing' && (
            <span className="ml-1 text-warning"> -- none available, switch to Auto mode</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Count: {l2l3Count}</label>
            <input
              type="range"
              min={1}
              max={10}
              value={l2l3Count}
              onChange={(e) => setL2l3Count(Number(e.target.value))}
              className={sliderClass}
            />
          </div>
          <div>
            <label className={labelClass}>Underlay Mode</label>
            <div className={radioGroupClass}>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="l2l3Underlay"
                  checked={l2l3UnderlayMode === 'auto'}
                  onChange={() => setL2l3UnderlayMode('auto')}
                  className="accent-primary"
                />
                Auto (create L1 if needed)
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="l2l3Underlay"
                  checked={l2l3UnderlayMode === 'existing'}
                  onChange={() => setL2l3UnderlayMode('existing')}
                  className="accent-primary"
                />
                Existing only
              </label>
            </div>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={l2l3BfdEnabled}
                onChange={(e) => setL2l3BfdEnabled(e.target.checked)}
                className="accent-primary"
              />
              BFD enabled
            </label>
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={handleGenerateL2L3} disabled={loading}>
              Generate L2/L3 Services
            </Button>
          </div>
        </div>
      </div>

      {/* 6. Quick Presets (updated labels for layer composition) */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Quick Presets</h3>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => handlePreset('Light 30%', presetLight)} disabled={loading}>
            Light (30%)
          </Button>
          <Button variant="outline" size="sm" onClick={() => handlePreset('Moderate 60%', presetModerate)} disabled={loading}>
            Moderate (60%)
          </Button>
          <Button variant="outline" size="sm" onClick={() => handlePreset('Heavy 90%', presetHeavy)} disabled={loading}>
            Heavy (90%)
          </Button>
          <Button variant="outline" size="sm" onClick={() => handlePreset('Bottleneck', presetBottleneck)} disabled={loading}>
            Bottleneck
          </Button>
          <Button variant="outline" size="sm" onClick={() => handlePreset('Fragmented 50%', presetFragmented)} disabled={loading}>
            Fragmented
          </Button>
          <Button variant="outline" size="sm" onClick={() => handlePreset('5 Mixed (L1)', presetFiveServicesMixed)} disabled={loading}>
            5 Svcs (L1 mixed)
          </Button>
          <Button variant="outline" size="sm" onClick={() => handlePreset('10 Protected (L1+L2)', presetTenServicesProtected)} disabled={loading}>
            10 Svcs (L1+L2)
          </Button>
        </div>
      </div>

      {/* 7. Cleanup */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Cleanup</h3>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={handleClearChannels} disabled={loading}>
            Remove Debug Channels
          </Button>
          <Button variant="destructive" size="sm" onClick={handleClearServices} disabled={loading}>
            Remove Debug Services
          </Button>
          <Button variant="destructive" size="sm" onClick={handleClearAll} disabled={loading}>
            Remove All Debug Data
          </Button>
          <Button variant="outline" size="sm" onClick={refreshStats}>
            Refresh Stats
          </Button>
        </div>
        {stats && (
          <div className="mt-2 text-xs text-text-muted">
            Debug allocations: <span className="text-text-primary">{stats.debugAllocations}</span>
            {' | '}
            Debug services: <span className="text-text-primary">{stats.debugServices}</span>
          </div>
        )}
      </div>

      {/* 8. Geo Relocate (Task 4.4) */}
      <div className={sectionClass}>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Geo Relocate</h3>
        <p className="mb-2 text-[10px] text-text-muted">
          Assign geographic coordinates to all nodes by mapping schematic positions to a lat/lng area.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Center Lat</label>
            <input
              type="text"
              value={geoLat}
              onChange={(e) => setGeoLat(e.target.value)}
              className={selectClass}
              placeholder="40.7128"
            />
          </div>
          <div>
            <label className={labelClass}>Center Lng</label>
            <input
              type="text"
              value={geoLng}
              onChange={(e) => setGeoLng(e.target.value)}
              className={selectClass}
              placeholder="-74.0060"
            />
          </div>
          <div>
            <label className={labelClass}>Spread (deg): {geoRadius}</label>
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={geoRadius}
              onChange={(e) => setGeoRadius(Number(e.target.value))}
              className={sliderClass}
            />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleGeoRelocate}
            disabled={loading}
          >
            Apply Geo Relocate
          </Button>
          <span className="text-xs text-text-muted">
            {useNetworkStore.getState().topology.nodes.length} nodes will be updated
          </span>
        </div>
      </div>

      {/* Output Log */}
      {output.length > 0 && (
        <div className={sectionClass}>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Output</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOutput([])}
            >
              Clear
            </Button>
          </div>
          <div className="max-h-40 overflow-y-auto font-mono text-xs text-text-muted">
            {output.map((line, i) => (
              <div
                key={i}
                className={line.startsWith('ERROR') ? 'text-danger' : line.startsWith('Warnings') ? 'text-warning' : ''}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading overlay for presets */}
      <LoadingOverlay
        open={overlayOpen}
        progress={overlayProgress}
        statusText={overlayStatus}
        title={`Loading ${selectedPreset ? TOPOLOGY_PRESETS.find((p) => p.id === selectedPreset)?.name || 'Preset' : 'Preset'}...`}
        onCancel={handleOverlayCancel}
      />
    </div>
  );
};
