import React, { useCallback, useState } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { GraphEngine } from '@/core/graph/GraphEngine';
import { SurvivabilityAnalyzer } from '@/core/simulation/SurvivabilityAnalyzer';
import { isL1DWDMService, isL2L3Service } from '@/types/service';
import { ReportShell } from './ReportShell';
import type { ExportFormat } from '@/types/reports';
import {
  Network,
  Cable,
  Boxes,
  Activity,
  Layers,
  Shield,
  AlertTriangle,
  HeartPulse,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildCsv, downloadCsv } from '@/lib/csv-utils';
import {
  computeStaticHealthScore,
  getHealthColor,
  getHealthLabel,
} from '@/core/analysis/healthScore';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NetworkSummaryData {
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  totalDistanceKm: number;
  nodesByType: Record<string, number>;
  serviceCount: number;
  servicesByType: { l1: number; l2: number; l3: number };
  servicesWithProtection: number;
  edgesWithSRLG: number;
  connectedComponents: number;
  avgDegree: number;
  /** Primary score: simulation-based (SurvivabilityAnalyzer) */
  healthScore: number;
  healthLabel: string;
  /** Sub-metric: structural topology score */
  topologyScore: number;
  topologyLabel: string;
  /** Whether the simulation-based score was available (needs edges + services) */
  simulationAvailable: boolean;
  /** Protection coverage from simulation */
  protectionCoverage: number;
  /** SPOF count from simulation */
  spofCount: number;
}

interface NetworkSummaryReportProps {
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Stat card (local, print-friendly)
// ---------------------------------------------------------------------------

const SummaryStatCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: string;
}> = ({ label, value, icon, sub }) => (
  <div className="flex items-center gap-3 rounded-lg border border-border bg-elevated p-4">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-canvas text-text-secondary">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className="text-xl font-semibold text-text-primary">{value}</p>
      {sub && <p className="truncate text-xs text-text-tertiary">{sub}</p>}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Health Score Gauge (180-degree SVG arc, similar to FragmentationGauge)
// ---------------------------------------------------------------------------

const GAUGE_STROKE_WIDTH = 12;

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = Math.abs(startAngle - endAngle) >= Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

/** Interpolate between two hex colors */
function lerpColor(c1: string, c2: string, t: number): string {
  const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t), g = Math.round(g1 + (g2 - g1) * t), b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Health gauge: 0=left(red) to 100=right(green) */
const HEALTH_STOPS = [
  { pos: 0, color: '#ef4444' },
  { pos: 0.4, color: '#eab308' },
  { pos: 0.7, color: '#22c55e' },
  { pos: 1, color: '#22c55e' },
];

function getArcColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < HEALTH_STOPS.length - 1; i++) {
    const cur = HEALTH_STOPS[i], nxt = HEALTH_STOPS[i + 1];
    if (clamped >= cur.pos && clamped <= nxt.pos) {
      return lerpColor(cur.color, nxt.color, (clamped - cur.pos) / (nxt.pos - cur.pos));
    }
  }
  return HEALTH_STOPS[HEALTH_STOPS.length - 1].color;
}

const HealthScoreGauge: React.FC<{ score: number; label: string }> = ({ score, label }) => {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const radius = (size - GAUGE_STROKE_WIDTH * 2) / 2 - 8;
  const ARC_START = Math.PI;
  const ARC_END = 0;
  const SEGMENTS = 20;

  const clamped = Math.max(0, Math.min(100, score));
  const normalized = clamped / 100;

  // Needle: 0->left(PI), 1->right(0)
  const needleAngle = ARC_START - normalized * (ARC_START - ARC_END);
  const needleTip = polarToCartesian(cx, cy, radius * 0.72, needleAngle);
  const needleBase1 = polarToCartesian(cx, cy, 4, needleAngle + Math.PI / 2);
  const needleBase2 = polarToCartesian(cx, cy, 4, needleAngle - Math.PI / 2);

  const bgArc = describeArc(cx, cy, radius, ARC_START, ARC_END);

  const arcSegments = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t0 = i / SEGMENTS;
    const t1 = (i + 1) / SEGMENTS;
    const angle0 = ARC_START - t0 * Math.PI;
    const angle1 = ARC_START - t1 * Math.PI;
    arcSegments.push({
      path: describeArc(cx, cy, radius, angle0, angle1),
      color: getArcColor((t0 + t1) / 2),
    });
  }

  const needleColor = getArcColor(normalized);

  return (
    <div className="flex flex-col items-center" role="meter" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={`Health Score: ${clamped}`}>
      <svg width="100%" viewBox={`0 0 ${size} ${size / 2 + 30}`} preserveAspectRatio="xMidYMid meet" style={{ maxWidth: 220 }}>
        <path d={bgArc} fill="none" stroke="var(--color-border, #374151)" strokeWidth={GAUGE_STROKE_WIDTH} strokeLinecap="round" opacity={0.3} />
        {arcSegments.map((seg, i) => (
          <path key={i} d={seg.path} fill="none" stroke={seg.color} strokeWidth={GAUGE_STROKE_WIDTH} strokeLinecap={i === 0 || i === SEGMENTS - 1 ? 'round' : 'butt'} />
        ))}
        <polygon points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`} fill={needleColor} />
        <circle cx={cx} cy={cy} r={6} fill={needleColor} />
        <text x={cx - radius - 4} y={cy + 18} textAnchor="middle" className="fill-text-tertiary text-[10px]">0</text>
        <text x={cx + radius + 4} y={cy + 18} textAnchor="middle" className="fill-text-tertiary text-[10px]">100</text>
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-text-primary text-xl font-bold" style={{ fontSize: '20px', fontWeight: 700 }}>{clamped}</text>
      </svg>
      <span className="text-xs font-medium text-text-secondary">{label}</span>
    </div>
  );
};

// Health score helpers now imported from '@/core/analysis/healthScore'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const NetworkSummaryReport: React.FC<NetworkSummaryReportProps> = ({
  onBack,
}) => {
  const topology = useNetworkStore((s) => s.topology);
  const services = useServiceStore((s) => s.services);
  const [data, setData] = useState<NetworkSummaryData | null>(null);

  // ---------- Configure panel (date range disabled) ----------

  const configPanel = (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-text-primary">
        Report Parameters
      </h3>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            Date Range
          </label>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-10 w-full cursor-not-allowed items-center rounded-md border border-border bg-tertiary px-3 text-sm text-text-muted opacity-50">
                All time (no time-series data available)
              </div>
            </TooltipTrigger>
            <TooltipContent>
              No time-series data available. The report reflects the current topology snapshot.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );

  // ---------- Run handler ----------

  const handleRun = useCallback(async () => {
    const nodes = topology.nodes;
    const edges = topology.edges;

    // Compute connected components via GraphEngine
    const engine = new GraphEngine();
    engine.loadFromTopology(topology);
    const components = engine.getConnectedComponents();

    const totalDistanceKm = edges.reduce(
      (sum, e) => sum + (e.properties.distance ?? 0),
      0,
    );

    const nodesByType: Record<string, number> = {};
    for (const node of nodes) {
      nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
    }

    const l1Count = services.filter(isL1DWDMService).length;
    const l2Count = services.filter(
      (s) => isL2L3Service(s) && s.type === 'l2-ethernet',
    ).length;
    const l3Count = services.filter(
      (s) => isL2L3Service(s) && s.type === 'l3-ip',
    ).length;

    // Services with protection
    let withProtection = 0;
    for (const svc of services) {
      if (isL1DWDMService(svc) && svc.protectionScheme !== 'none') {
        withProtection++;
      } else if (isL2L3Service(svc) && svc.protectionScheme !== 'none') {
        withProtection++;
      }
    }

    // Edges with SRLG codes
    const edgesWithSRLG = edges.filter(
      (e) => e.properties.srlgCodes && e.properties.srlgCodes.length > 0,
    ).length;

    const avgDegree =
      nodes.length > 0 ? (edges.length * 2) / nodes.length : 0;

    const protPct =
      services.length > 0 ? (withProtection / services.length) * 100 : 0;
    const srlgPct =
      edges.length > 0 ? (edgesWithSRLG / edges.length) * 100 : 0;

    // Compute static "Topology Score" (structural metrics only)
    const { score: topologyScore, label: topologyLabel } = computeStaticHealthScore({
      connectedComponents: components.length,
      avgDegree,
      protectionPct: protPct,
      srlgPct,
      nodeCount: nodes.length,
    });

    // Compute simulation-based "Network Health Score" via SurvivabilityAnalyzer
    const simulationAvailable = edges.length > 0 && services.length > 0;
    let healthScore = topologyScore;
    let healthLabel = topologyLabel;
    let protectionCoverage = Math.round(protPct);
    let spofCount = 0;

    if (simulationAvailable) {
      const analyzer = new SurvivabilityAnalyzer(
        () => nodes,
        () => edges,
        () => services,
      );
      const healthResult = analyzer.runHealthCheck();
      healthScore = healthResult.healthScore;
      healthLabel = getHealthLabel(healthResult.healthScore);
      protectionCoverage = healthResult.protectionCoverage;
      spofCount = healthResult.singlePointsOfFailure.length;
    }

    setData({
      generatedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      totalDistanceKm,
      nodesByType,
      serviceCount: services.length,
      servicesByType: { l1: l1Count, l2: l2Count, l3: l3Count },
      servicesWithProtection: withProtection,
      edgesWithSRLG,
      connectedComponents: components.length,
      avgDegree,
      healthScore,
      healthLabel,
      topologyScore,
      topologyLabel,
      simulationAvailable,
      protectionCoverage,
      spofCount,
    });
  }, [topology, services]);

  // ---------- Export handler ----------

  const handleExport = useCallback(
    (format: ExportFormat) => {
      if (!data) return;

      if (format === 'pdf') {
        window.print();
        return;
      }

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `network-summary-${data.generatedAt.slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      if (format === 'csv') {
        const headers = ['Metric', 'Value'];
        const rows = [
          ['Generated At', data.generatedAt],
          ['Node Count', data.nodeCount],
          ['Edge Count', data.edgeCount],
          ['Total Distance (km)', data.totalDistanceKm.toFixed(1)],
          ['L1 DWDM Services', data.servicesByType.l1],
          ['L2 Ethernet Services', data.servicesByType.l2],
          ['L3 IP Services', data.servicesByType.l3],
          ['Services with Protection', data.servicesWithProtection],
          ['Edges with SRLG', data.edgesWithSRLG],
          ['Connected Components', data.connectedComponents],
          ['Avg Node Degree', data.avgDegree.toFixed(2)],
          ['Network Health Score (Simulation)', data.healthScore],
          ['Network Health Rating', data.healthLabel],
          ['Topology Score (Structural)', data.topologyScore],
          ['Topology Rating', data.topologyLabel],
          ['Protection Coverage (%)', data.protectionCoverage],
          ['Single Points of Failure', data.spofCount],
        ];
        const csv = buildCsv(headers, rows);
        downloadCsv(csv, `network-summary-${data.generatedAt.slice(0, 10)}.csv`);
      }
    },
    [data],
  );

  // ---------- Results panel ----------

  const NODE_TYPE_LABELS: Record<string, string> = {
    router: 'Router',
    switch: 'Switch',
    oadm: 'OADM',
    amplifier: 'Amplifier',
    terminal: 'Terminal',
    'osp-termination': 'OSP Termination',
    custom: 'Custom',
  };

  const resultsPanel = data ? (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Report header */}
      <div className="print-section">
        <h2 className="text-xl font-bold text-text-primary">
          Network Summary Report
        </h2>
        <p className="mt-1 text-xs text-text-tertiary">
          Generated: {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      {/* Network Health Score (primary — simulation-based) */}
      <section className="print-section mb-6" data-testid="report-health-score-section">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Network Health Score
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 cursor-help text-text-muted" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {data.simulationAvailable
                ? 'Simulation-based score: each edge is failed individually and the impact on services is measured. Factors: edge risk distribution (60%), protection coverage (30%), SPOF penalty (10%).'
                : 'Structural topology score (simulation requires edges and services). Factors: connectivity (25%), node degree (25%), protection (25%), SRLG coverage (25%).'}
            </TooltipContent>
          </Tooltip>
          {!data.simulationAvailable && (
            <span className="bg-warning/10 rounded px-1.5 py-0.5 text-[10px] font-medium text-warning">
              Structural only
            </span>
          )}
        </div>
        <div className="flex items-center gap-6 rounded-lg border border-border bg-elevated p-5">
          <HealthScoreGauge score={data.healthScore} label={data.healthLabel} />
          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-text-secondary" />
                <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  {data.simulationAvailable ? 'Simulation-Based' : 'Structural'}
                </span>
              </div>
              <p
                className={cn(
                  'text-lg font-semibold',
                  getHealthColor(data.healthScore),
                )}
                data-testid="report-health-score-value"
              >
                {data.healthLabel} ({data.healthScore}/100)
              </p>
              {data.simulationAvailable && (
                <p className="text-xs text-text-tertiary">
                  Protection coverage: {data.protectionCoverage}% | SPOFs: {data.spofCount}
                </p>
              )}
            </div>

            {/* Topology Score sub-metric */}
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <Network className="h-3.5 w-3.5 text-text-muted" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                  Topology Score
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 cursor-help text-text-muted" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Structural assessment: connectivity (25%), average node degree (25%), protection percentage (25%), SRLG coverage (25%). Does not simulate failures.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <span
                  className={cn('text-sm font-semibold', getHealthColor(data.topologyScore))}
                  data-testid="report-topology-score-value"
                >
                  {data.topologyLabel} ({data.topologyScore}/100)
                </span>
                <div className="h-1.5 flex-1 rounded-full bg-border">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      data.topologyScore >= 70 ? 'bg-success' :
                      data.topologyScore >= 40 ? 'bg-warning' : 'bg-danger',
                    )}
                    style={{ width: `${data.topologyScore}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Topology Statistics */}
      <section className="print-section mb-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Topology Statistics
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStatCard
            label="Nodes"
            value={data.nodeCount}
            icon={<Network className="h-4 w-4" />}
          />
          <SummaryStatCard
            label="Edges"
            value={data.edgeCount}
            icon={<Cable className="h-4 w-4" />}
          />
          <SummaryStatCard
            label="Total Distance"
            value={`${data.totalDistanceKm.toFixed(1)} km`}
            icon={<Activity className="h-4 w-4" />}
          />
          <SummaryStatCard
            label="Components"
            value={data.connectedComponents}
            icon={<Layers className="h-4 w-4" />}
            sub={data.connectedComponents === 1 ? 'Fully connected' : 'Disconnected subgraphs'}
          />
          <SummaryStatCard
            label="Avg Degree"
            value={data.avgDegree.toFixed(2)}
            icon={<Activity className="h-4 w-4" />}
          />
          <SummaryStatCard
            label="Edges with SRLG"
            value={data.edgesWithSRLG}
            icon={<AlertTriangle className="h-4 w-4" />}
            sub={
              data.edgeCount > 0
                ? `${((data.edgesWithSRLG / data.edgeCount) * 100).toFixed(0)}% coverage`
                : undefined
            }
          />
        </div>
      </section>

      {/* Node Breakdown */}
      {Object.keys(data.nodesByType).length > 0 && (
        <section className="print-section mb-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Nodes by Type
          </h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated text-left">
                  <th className="px-4 py-2.5 font-medium text-text-secondary">
                    Type
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium text-text-secondary">
                    Count
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium text-text-secondary">
                    Percentage
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.nodesByType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <tr
                      key={type}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-4 py-2.5 text-text-primary">
                        {NODE_TYPE_LABELS[type] ?? type}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-text-primary">
                        {count}
                      </td>
                      <td className="px-4 py-2.5 text-right text-text-secondary">
                        {data.nodeCount > 0
                          ? `${((count / data.nodeCount) * 100).toFixed(1)}%`
                          : '0%'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Service Summary */}
      <section className="print-section mb-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Service Summary
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStatCard
            label="Total Services"
            value={data.serviceCount}
            icon={<Boxes className="h-4 w-4" />}
          />
          <SummaryStatCard
            label="L1 DWDM"
            value={data.servicesByType.l1}
            icon={<Boxes className="h-4 w-4" />}
          />
          <SummaryStatCard
            label="L2 Ethernet"
            value={data.servicesByType.l2}
            icon={<Boxes className="h-4 w-4" />}
          />
          <SummaryStatCard
            label="L3 IP"
            value={data.servicesByType.l3}
            icon={<Boxes className="h-4 w-4" />}
          />
          <SummaryStatCard
            label="With Protection"
            value={data.servicesWithProtection}
            icon={<Shield className="h-4 w-4" />}
            sub={
              data.serviceCount > 0
                ? `${((data.servicesWithProtection / data.serviceCount) * 100).toFixed(0)}% protected`
                : undefined
            }
          />
          <SummaryStatCard
            label="Network Health"
            value={`${data.healthScore}/100`}
            icon={<HeartPulse className="h-4 w-4" />}
            sub={data.healthLabel}
          />
        </div>
      </section>
    </div>
  ) : null;

  // ---------- Render ----------

  return (
    <ReportShell
      title="Network Summary"
      onBack={onBack}
      configPanel={configPanel}
      resultsPanel={resultsPanel}
      onRun={handleRun}
      onExport={handleExport}
    />
  );
};
