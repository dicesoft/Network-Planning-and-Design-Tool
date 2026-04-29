import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { CircularBuffer } from '@/lib/CircularBuffer';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui/button';
import { getIndexedDBUsageBytes, getStorageBackend, flushPendingWrites, suppressPersist, resumePersist } from '@/lib/indexeddb-storage';
import { transferStorageData } from '@/lib/storage-migration';
import { suppressCrossTabSync, resumeCrossTabSync } from '@/lib/cross-tab-sync';

// ============================================================================
// TYPES
// ============================================================================

interface ResourceMetrics {
  // Memory (Chrome only)
  memoryAvailable: boolean;
  heapUsedMB: number;
  heapTotalMB: number;
  heapLimitMB: number;
  heapUsagePercent: number;

  // Storage (IndexedDB with localStorage fallback)
  storageUsedBytes: number;
  storageQuotaBytes: number;
  storagePercent: number;

  // Store sizes
  nodeCount: number;
  edgeCount: number;
  serviceCount: number;
  historyDepth: number;
  historyIndex: number;

  // FPS
  fps: number;

  // Timestamp
  lastUpdated: Date;
}

interface TimeSeriesEntry {
  timestamp: number;
  memoryPercent: number;
  fps: number;
  storagePercent: number;
}

/** Alert state for performance thresholds */
interface AlertState {
  lowFps: boolean;       // FPS < 30
  highMemory: boolean;   // memory > 80%
  highStorage: boolean;  // storage > 80%
}

// ============================================================================
// ALERT THRESHOLDS
// ============================================================================

export const ALERT_THRESHOLDS = {
  FPS_LOW: 30,
  MEMORY_HIGH: 80,
  STORAGE_HIGH: 80,
} as const;

export function checkAlerts(entry: TimeSeriesEntry): AlertState {
  return {
    lowFps: entry.fps > 0 && entry.fps < ALERT_THRESHOLDS.FPS_LOW,
    highMemory: entry.memoryPercent > ALERT_THRESHOLDS.MEMORY_HIGH,
    highStorage: entry.storagePercent > ALERT_THRESHOLDS.STORAGE_HIGH,
  };
}

// ============================================================================
// METRIC HELPERS
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ============================================================================
// SVG SPARKLINE COMPONENT
// ============================================================================

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  alertColor?: string;
  alertThreshold?: number;
  alertAbove?: boolean; // true = alert when above threshold, false = alert when below
  className?: string;
}

const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 120,
  height = 28,
  color = '#6366f1',
  alertColor = '#ef4444',
  alertThreshold,
  alertAbove = true,
  className,
}) => {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className={className}>
        <text x={width / 2} y={height / 2 + 3} textAnchor="middle" fontSize="8" fill="#64748b">
          waiting...
        </text>
      </svg>
    );
  }

  const padding = 1;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * chartW;
    const y = padding + chartH - ((v - min) / range) * chartH;
    return `${x},${y}`;
  });

  const polyline = points.join(' ');

  // Fill area under the line
  const fillPoints = [
    `${padding},${padding + chartH}`,
    ...points,
    `${padding + chartW},${padding + chartH}`,
  ].join(' ');

  // Check if latest value triggers alert
  const latestValue = data[data.length - 1];
  const isAlert = alertThreshold !== undefined &&
    (alertAbove ? latestValue > alertThreshold : latestValue < alertThreshold);

  const lineColor = isAlert ? alertColor : color;

  return (
    <svg width={width} height={height} className={className} data-testid="sparkline">
      <polygon points={fillPoints} fill={lineColor} opacity={0.1} />
      <polyline
        points={polyline}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {alertThreshold !== undefined && (
        <line
          x1={padding}
          y1={padding + chartH - ((alertThreshold - min) / range) * chartH}
          x2={padding + chartW}
          y2={padding + chartH - ((alertThreshold - min) / range) * chartH}
          stroke={alertColor}
          strokeWidth={0.5}
          strokeDasharray="2,2"
          opacity={0.5}
        />
      )}
      {/* Latest value dot */}
      {data.length > 0 && (
        <circle
          cx={padding + chartW}
          cy={padding + chartH - ((latestValue - min) / range) * chartH}
          r={2}
          fill={lineColor}
        />
      )}
    </svg>
  );
};

// ============================================================================
// PROGRESS BAR COMPONENT
// ============================================================================

interface MetricBarProps {
  label: string;
  value: string;
  percent: number;
  warning?: boolean;
  critical?: boolean;
}

const MetricBar: React.FC<MetricBarProps> = ({ label, value, percent, warning, critical }) => {
  const barColor = critical
    ? 'bg-danger'
    : warning
      ? 'bg-warning'
      : 'bg-primary';

  const textColor = critical
    ? 'text-danger'
    : warning
      ? 'text-warning'
      : 'text-text-primary';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className={cn('font-mono', textColor)}>{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-canvas">
        <div
          className={cn('h-1.5 rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// ALERT INDICATOR
// ============================================================================

const AlertIndicator: React.FC<{ alerts: AlertState }> = ({ alerts }) => {
  const activeAlerts: string[] = [];
  if (alerts.lowFps) activeAlerts.push('Low FPS');
  if (alerts.highMemory) activeAlerts.push('High Memory');
  if (alerts.highStorage) activeAlerts.push('High Storage');

  if (activeAlerts.length === 0) return null;

  return (
    <div className="border-danger/30 bg-danger/10 rounded border px-3 py-2" data-testid="performance-alert">
      <div className="flex items-center gap-2 text-xs font-medium text-danger">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-danger" />
        Performance Alert
      </div>
      <div className="text-danger/80 mt-1 text-[10px]">
        {activeAlerts.join(' | ')}
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENT
// ============================================================================

const HISTORY_CAPACITY = 60;

export const ResourceMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<ResourceMetrics | null>(null);
  const [alerts, setAlerts] = useState<AlertState>({ lowFps: false, highMemory: false, highStorage: false });
  const [, setTick] = useState(0); // force re-render when history updates

  // Storage backend state
  const currentBackend = getStorageBackend();
  const [storagePreference, setStoragePreference] = useState<'indexeddb' | 'localstorage'>(() => {
    return (localStorage.getItem('atlas-storage-backend') as 'indexeddb' | 'localstorage') || 'indexeddb';
  });

  const addToast = useUIStore((state) => state.addToast);

  const handleStorageToggle = useCallback(async (backend: 'indexeddb' | 'localstorage') => {
    if (backend === storagePreference) return;

    // Flush any pending debounced writes before transferring data
    await flushPendingWrites();

    // Suppress persist and cross-tab sync to prevent interference during transfer
    suppressPersist();
    suppressCrossTabSync();

    const result = await transferStorageData(
      storagePreference as 'indexeddb' | 'localstorage',
      backend
    );

    if (!result.success) {
      resumePersist();
      resumeCrossTabSync();
      addToast({
        type: 'error',
        title: 'Storage switch failed',
        message: result.error || 'Failed to transfer data between backends',
        duration: 5000,
      });
      return;
    }

    // Don't resume persist/sync — page is about to reload
    setStoragePreference(backend);
    localStorage.setItem('atlas-storage-backend', backend);
    window.location.reload();
  }, [storagePreference, addToast]);

  const fpsCountRef = useRef<number>(0);
  const fpsLastTimeRef = useRef<number>(performance.now());
  const fpsValueRef = useRef<number>(0);
  const rafIdRef = useRef<number>(0);

  // Time-series circular buffers (persist across renders via ref)
  const historyRef = useRef({
    memory: new CircularBuffer<number>(HISTORY_CAPACITY),
    fps: new CircularBuffer<number>(HISTORY_CAPACITY),
    localStorage: new CircularBuffer<number>(HISTORY_CAPACITY),
    entries: new CircularBuffer<TimeSeriesEntry>(HISTORY_CAPACITY),
  });

  // FPS counter: count frames over 1-second windows
  useEffect(() => {
    const countFrame = (now: number) => {
      fpsCountRef.current++;
      const elapsed = now - fpsLastTimeRef.current;
      if (elapsed >= 1000) {
        fpsValueRef.current = Math.round((fpsCountRef.current * 1000) / elapsed);
        fpsCountRef.current = 0;
        fpsLastTimeRef.current = now;
      }
      rafIdRef.current = requestAnimationFrame(countFrame);
    };

    rafIdRef.current = requestAnimationFrame(countFrame);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, []);

  // Collect metrics every 5 seconds
  const collectMetrics = useCallback(async () => {
    const networkState = useNetworkStore.getState();
    const serviceState = useServiceStore.getState();

    // Memory (Chrome-only)
    let memoryAvailable = false;
    let heapUsedMB = 0;
    let heapTotalMB = 0;
    let heapLimitMB = 0;
    let heapUsagePercent = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perfMemory = (performance as any).memory;
    if (perfMemory) {
      memoryAvailable = true;
      heapUsedMB = perfMemory.usedJSHeapSize / (1024 * 1024);
      heapTotalMB = perfMemory.totalJSHeapSize / (1024 * 1024);
      heapLimitMB = perfMemory.jsHeapSizeLimit / (1024 * 1024);
      heapUsagePercent = (heapUsedMB / heapLimitMB) * 100;
    }

    // Storage (IndexedDB)
    const storageUsedBytes = await getIndexedDBUsageBytes();
    // IndexedDB quota varies by browser; use 50 MB as reasonable display ceiling
    const storageQuotaBytes = 50 * 1024 * 1024;
    const storagePercent = storageQuotaBytes > 0
      ? (storageUsedBytes / storageQuotaBytes) * 100
      : 0;

    // Store sizes
    const nodeCount = networkState.topology.nodes.length;
    const edgeCount = networkState.topology.edges.length;
    const serviceCount = serviceState.services.length;
    const historyDepth = networkState.history.length;
    const historyIndex = networkState.historyIndex;

    const fps = fpsValueRef.current;

    // Push to time-series buffers
    const h = historyRef.current;
    h.memory.push(heapUsagePercent);
    h.fps.push(fps);
    h.localStorage.push(storagePercent);

    const entry: TimeSeriesEntry = {
      timestamp: Date.now(),
      memoryPercent: heapUsagePercent,
      fps,
      storagePercent,
    };
    h.entries.push(entry);

    // Check alert thresholds
    setAlerts(checkAlerts(entry));

    setMetrics({
      memoryAvailable,
      heapUsedMB,
      heapTotalMB,
      heapLimitMB,
      heapUsagePercent,
      storageUsedBytes,
      storageQuotaBytes,
      storagePercent,
      nodeCount,
      edgeCount,
      serviceCount,
      historyDepth,
      historyIndex,
      fps,
      lastUpdated: new Date(),
    });

    setTick((t) => t + 1);
  }, []);

  // Poll every 5 seconds
  useEffect(() => {
    collectMetrics();
    const interval = setInterval(collectMetrics, 5000);
    return () => clearInterval(interval);
  }, [collectMetrics]);

  // Snapshot sparkline data from buffers
  const memoryHistory = useMemo(() => historyRef.current.memory.toArray(), [metrics]);
  const fpsHistory = useMemo(() => historyRef.current.fps.toArray(), [metrics]);
  const storageHistory = useMemo(() => historyRef.current.localStorage.toArray(), [metrics]);

  // Clear history handler
  const handleClearHistory = useCallback(() => {
    const h = historyRef.current;
    h.memory.clear();
    h.fps.clear();
    h.localStorage.clear();
    h.entries.clear();
    setTick((t) => t + 1);
  }, []);

  // Export metrics handler
  const handleExportMetrics = useCallback(() => {
    const entries = historyRef.current.entries.toArray();
    const json = JSON.stringify({
      exportedAt: new Date().toISOString(),
      entryCount: entries.length,
      entries: entries.map((e) => ({
        timestamp: new Date(e.timestamp).toISOString(),
        memoryPercent: Math.round(e.memoryPercent * 100) / 100,
        fps: e.fps,
        storagePercent: Math.round(e.storagePercent * 100) / 100,
      })),
    }, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resource-metrics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (!metrics) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-text-muted">
        Collecting metrics...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      {/* Performance Alerts */}
      <AlertIndicator alerts={alerts} />

      {/* Memory */}
      <div className="bg-elevated/50 rounded border border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Memory</h3>
          {memoryHistory.length >= 2 && (
            <Sparkline
              data={memoryHistory}
              alertThreshold={ALERT_THRESHOLDS.MEMORY_HIGH}
              alertAbove={true}
              color="#6366f1"
              alertColor="#ef4444"
            />
          )}
        </div>
        {metrics.memoryAvailable ? (
          <div className="space-y-2">
            <MetricBar
              label="JS Heap Used"
              value={`${metrics.heapUsedMB.toFixed(1)} / ${metrics.heapLimitMB.toFixed(0)} MB`}
              percent={metrics.heapUsagePercent}
              warning={metrics.heapUsagePercent > 70}
              critical={metrics.heapUsagePercent > 90}
            />
            <div className="flex gap-4 text-[10px] text-text-muted">
              <span>Used: {metrics.heapUsedMB.toFixed(1)} MB</span>
              <span>Total: {metrics.heapTotalMB.toFixed(1)} MB</span>
              <span>Limit: {metrics.heapLimitMB.toFixed(0)} MB</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-text-muted">
            Memory API not available (Chrome only: performance.memory)
          </div>
        )}
      </div>

      {/* Performance (FPS) */}
      <div className="bg-elevated/50 rounded border border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Performance</h3>
          {fpsHistory.length >= 2 && (
            <Sparkline
              data={fpsHistory}
              alertThreshold={ALERT_THRESHOLDS.FPS_LOW}
              alertAbove={false}
              color="#10b981"
              alertColor="#ef4444"
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded bg-canvas px-3 py-2">
            <div className="text-[10px] text-text-muted">FPS</div>
            <div className={cn(
              'text-lg font-bold',
              metrics.fps >= 50 ? 'text-success' : metrics.fps >= 30 ? 'text-warning' : 'text-danger'
            )}>
              {metrics.fps}
            </div>
          </div>
          <div className="text-[10px] text-text-muted">
            {metrics.fps >= 50
              ? 'Smooth'
              : metrics.fps >= 30
                ? 'Acceptable'
                : 'Low - may affect interactions'}
          </div>
        </div>
      </div>

      {/* IndexedDB Storage */}
      <div className="bg-elevated/50 rounded border border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">IndexedDB Storage</h3>
          {storageHistory.length >= 2 && (
            <Sparkline
              data={storageHistory}
              alertThreshold={ALERT_THRESHOLDS.STORAGE_HIGH}
              alertAbove={true}
              color="#8b5cf6"
              alertColor="#ef4444"
            />
          )}
        </div>
        <MetricBar
          label="Storage Used"
          value={`${formatBytes(metrics.storageUsedBytes)} / 50 MB`}
          percent={metrics.storagePercent}
          warning={metrics.storagePercent > 70}
          critical={metrics.storagePercent > 90}
        />
      </div>

      {/* Store Sizes */}
      <div className="bg-elevated/50 rounded border border-border p-3">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Store Sizes</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-canvas p-2">
            <div className="text-[10px] text-text-muted">Nodes</div>
            <div className="text-sm font-semibold text-text-primary">{metrics.nodeCount}</div>
          </div>
          <div className="rounded bg-canvas p-2">
            <div className="text-[10px] text-text-muted">Edges</div>
            <div className="text-sm font-semibold text-text-primary">{metrics.edgeCount}</div>
          </div>
          <div className="rounded bg-canvas p-2">
            <div className="text-[10px] text-text-muted">Services</div>
            <div className="text-sm font-semibold text-text-primary">{metrics.serviceCount}</div>
          </div>
          <div className="rounded bg-canvas p-2">
            <div className="text-[10px] text-text-muted">History</div>
            <div className="text-sm font-semibold text-text-primary">
              {metrics.historyIndex + 1} / {metrics.historyDepth}
            </div>
          </div>
        </div>
      </div>

      {/* Storage Backend Toggle */}
      <div className="bg-elevated/50 rounded border border-border p-3">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Storage Backend</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-secondary">Current:</span>
            <span className={cn(
              'rounded px-2 py-0.5 font-mono font-medium',
              currentBackend === 'indexeddb'
                ? 'bg-green-500/10 text-green-400'
                : currentBackend === 'localstorage'
                  ? 'bg-yellow-500/10 text-yellow-400'
                  : 'bg-tertiary text-text-muted'
            )} data-testid="storage-backend-indicator">
              {currentBackend === 'indexeddb' ? 'IndexedDB' : currentBackend === 'localstorage' ? 'localStorage' : 'Unknown'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="storage-backend"
                value="indexeddb"
                checked={storagePreference === 'indexeddb'}
                onChange={() => handleStorageToggle('indexeddb')}
                className="accent-accent"
                data-testid="storage-radio-indexeddb"
              />
              <span className="text-xs text-text-secondary">IndexedDB</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="storage-backend"
                value="localstorage"
                checked={storagePreference === 'localstorage'}
                onChange={() => handleStorageToggle('localstorage')}
                className="accent-accent"
                data-testid="storage-radio-localstorage"
              />
              <span className="text-xs text-text-secondary">localStorage</span>
            </label>
          </div>
          <div className="text-[10px] text-text-muted">
            Switching backend will reload the page. Data is preserved during the switch.
          </div>
        </div>
      </div>

      {/* Debug Actions */}
      <div className="bg-elevated/50 rounded border border-border p-3">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Debug Actions</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClearHistory} data-testid="clear-history-btn">
            Clear History
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportMetrics} data-testid="export-metrics-btn">
            Export Metrics
          </Button>
          <span className="text-[10px] text-text-muted">
            {historyRef.current.entries.size} / {HISTORY_CAPACITY} readings
          </span>
        </div>
      </div>

      {/* Last Updated */}
      <div className="text-center text-[10px] text-text-muted">
        Last updated: {metrics.lastUpdated.toLocaleTimeString()} (polling every 5s)
      </div>
    </div>
  );
};
