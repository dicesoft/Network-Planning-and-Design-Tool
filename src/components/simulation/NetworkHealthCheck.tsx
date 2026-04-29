import React, { useState, useCallback, useMemo } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useSimulationStore } from '@/stores/simulationStore';
import { SurvivabilityAnalyzer } from '@/core/simulation/SurvivabilityAnalyzer';
import type { HealthCheckResult, EdgeRiskLevel } from '@/types/simulation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { pluralize } from '@/lib/pluralize';
import {
  getHealthColor,
  getHealthBorderColor,
  getHealthLabel,
} from '@/core/analysis/healthScore';
import {
  HeartPulse,
  Shield,
  ShieldAlert,
  ShieldOff,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';

// ============================================================================
// TOPOLOGY RISK MAP
// ============================================================================

const SVG_WIDTH = 600;
const SVG_HEIGHT = 280;
const NODE_RADIUS = 8;
const PADDING = 30;

const RISK_COLORS: Record<EdgeRiskLevel, string> = {
  critical: 'var(--color-danger, #ef4444)',
  warning: 'var(--color-warning, #f59e0b)',
  healthy: 'var(--color-success, #22c55e)',
};

const TopologyRiskMap: React.FC<{ result: HealthCheckResult }> = ({ result }) => {
  const [collapsed, setCollapsed] = useState(false);
  const topology = useNetworkStore((state) => state.topology);

  const edgeRiskMap = useMemo(() => {
    const map = new Map<string, EdgeRiskLevel>();
    for (const risk of result.edgeRisks) {
      map.set(risk.edgeId, risk.riskLevel);
    }
    return map;
  }, [result.edgeRisks]);

  const hasLayout = useMemo(() => {
    return topology.nodes.some((n) => n.position.x !== 0 || n.position.y !== 0);
  }, [topology.nodes]);

  const { nodePositions, edges } = useMemo(() => {
    if (topology.nodes.length === 0) {
      return { nodePositions: new Map<string, { x: number; y: number }>(), edges: [] };
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of topology.nodes) {
      minX = Math.min(minX, node.position.x);
      maxX = Math.max(maxX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxY = Math.max(maxY, node.position.y);
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const usableW = SVG_WIDTH - PADDING * 2;
    const usableH = SVG_HEIGHT - PADDING * 2;

    const positions = new Map<string, { x: number; y: number }>();
    for (const node of topology.nodes) {
      positions.set(node.id, {
        x: PADDING + ((node.position.x - minX) / rangeX) * usableW,
        y: PADDING + ((node.position.y - minY) / rangeY) * usableH,
      });
    }

    return { nodePositions: positions, edges: topology.edges };
  }, [topology.nodes, topology.edges]);

  if (topology.nodes.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-elevated">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hover:bg-tertiary/50 flex w-full items-center justify-between px-4 py-2 text-xs font-semibold text-text-primary transition-colors"
      >
        <span>Network Risk Map</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {!collapsed && (
        <div className="border-t border-border px-4 py-3">
          {!hasLayout ? (
            <div className="flex items-center justify-center py-6 text-xs text-text-muted">
              No layout data available (all nodes at origin)
            </div>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className="w-full"
                role="img"
                aria-label="Network topology colored by edge risk level"
              >
                {/* Edges colored by risk */}
                {edges.map((edge) => {
                  const src = nodePositions.get(edge.source.nodeId);
                  const tgt = nodePositions.get(edge.target.nodeId);
                  if (!src || !tgt) return null;
                  const riskLevel = edgeRiskMap.get(edge.id) ?? 'healthy';
                  const color = RISK_COLORS[riskLevel];
                  return (
                    <line
                      key={edge.id}
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={color}
                      strokeWidth={riskLevel === 'critical' ? 3 : riskLevel === 'warning' ? 2 : 1.5}
                      strokeOpacity={riskLevel === 'healthy' ? 0.6 : 1}
                    />
                  );
                })}

                {/* Nodes */}
                {topology.nodes.map((node) => {
                  const pos = nodePositions.get(node.id);
                  if (!pos) return null;
                  return (
                    <g key={node.id}>
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={NODE_RADIUS}
                        fill="var(--color-accent, #6366f1)"
                        stroke="var(--color-border, #374151)"
                        strokeWidth={1}
                        opacity={0.8}
                      />
                      <text
                        x={pos.x}
                        y={pos.y + NODE_RADIUS + 12}
                        textAnchor="middle"
                        fontSize="9"
                        fill="var(--color-text-secondary, #94a3b8)"
                        fontFamily="monospace"
                      >
                        {node.name.length > 10 ? node.name.slice(0, 10) + '...' : node.name}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Legend */}
              <div className="mt-2 flex items-center justify-center gap-5 text-[10px] text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-4 rounded-sm bg-danger" />
                  Critical
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-4 rounded-sm bg-warning" />
                  Warning
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-4 rounded-sm bg-success" />
                  Healthy
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const NetworkHealthCheck: React.FC = () => {
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);
  const result = useSimulationStore((state) => state.healthCheckResult);
  const isRunning = useSimulationStore((state) => state.healthCheckIsRunning);
  const setResult = useSimulationStore((state) => state.setHealthCheckResult);
  const setRunning = useSimulationStore((state) => state.setHealthCheckRunning);

  const [showEdgeTable, setShowEdgeTable] = useState(false);

  const getNodeName = useCallback(
    (nodeId: string) => topology.nodes.find((n) => n.id === nodeId)?.name || nodeId.slice(0, 8),
    [topology.nodes]
  );

  const handleRun = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const analyzer = new SurvivabilityAnalyzer(
        () => topology.nodes,
        () => topology.edges,
        () => services
      );
      const res = analyzer.runHealthCheck();
      setResult(res);
    }, 0);
  }, [topology, services, setResult, setRunning]);

  const canRun = topology.edges.length > 0 && services.length > 0;

  // Use shared health score utilities for consistent display
  const scoreColor = getHealthColor;
  const scoreBorderColor = getHealthBorderColor;
  const scoreLabel = getHealthLabel;

  const edgeCount = topology.edges.length;
  const nodeCount = topology.nodes.length;
  const expectedRuntimeLabel = useMemo(() => {
    const scenarios = edgeCount + nodeCount;
    if (scenarios === 0) return 'less than 1 second';
    if (scenarios < 50) return 'less than 1 second';
    if (scenarios < 200) return 'a few seconds';
    return '~5 seconds';
  }, [edgeCount, nodeCount]);

  return (
    <div className="flex flex-col gap-4">
      {/* Run button */}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleRun} disabled={!canRun || isRunning}>
          <HeartPulse className="mr-1.5 h-3.5 w-3.5" />
          {isRunning ? 'Analyzing...' : 'Run Health Check'}
        </Button>
        {!canRun && (
          <span className="text-xs text-text-muted">
            Requires at least one edge and one service.
          </span>
        )}
        {result && (
          <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <Clock className="h-3 w-3" />
            {new Date(result.timestamp).toLocaleTimeString()} ({result.durationMs}ms)
          </span>
        )}
      </div>

      {!result && canRun && !isRunning && (
        <div
          className="rounded-lg border border-border bg-elevated p-5 text-sm text-text-secondary"
          data-testid="health-check-empty-state"
        >
          <div className="mb-2 flex items-center gap-2 text-text-primary">
            <HeartPulse className="h-4 w-4 text-accent" />
            <span className="font-semibold">Network Health Check</span>
          </div>
          <p className="mb-3 text-xs text-text-tertiary">
            Simulates a single failure on every edge and node, then aggregates the impact across all services
            to produce an overall health score and surface single points of failure.
          </p>
          <ul className="mb-3 space-y-1 text-xs text-text-tertiary">
            <li>Will check {edgeCount} {pluralize('edge', edgeCount)} + {nodeCount} {pluralize('node', nodeCount)} ({edgeCount + nodeCount} {pluralize('scenario', edgeCount + nodeCount)})</li>
            <li>Estimated runtime: {expectedRuntimeLabel}</li>
            <li>Result preview: 0–100 health score, protection coverage %, list of SPOFs and per-edge risk</li>
          </ul>
          <p className="text-xs text-text-muted">
            Click <span className="font-medium text-text-secondary">Run Health Check</span> to start.
          </p>
        </div>
      )}

      {result && (
        <>
          {/* Health Score + Summary Row */}
          <div className="flex items-stretch gap-4">
            {/* Score circle */}
            <div className="flex min-w-[220px] items-center gap-4 rounded-lg border border-border bg-elevated p-5">
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4"
                style={{ borderColor: scoreBorderColor(result.healthScore) }}
              >
                <span className={cn('text-2xl font-bold', scoreColor(result.healthScore))}>
                  {result.healthScore}
                </span>
              </div>
              <div>
                <div className="text-sm font-semibold text-text-primary">
                  Simulation-Based Health Score
                </div>
                <div className={cn('text-lg font-bold', scoreColor(result.healthScore))}>
                  {scoreLabel(result.healthScore)}
                </div>
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid flex-1 grid-cols-3 gap-3">
              <StatCard
                icon={<Shield className="h-4 w-4 text-success" />}
                label="Protection Coverage"
                value={`${result.protectionCoverage}%`}
                sub={`${result.protectedServiceCount} of ${result.totalServices} services`}
              />
              <StatCard
                icon={<ShieldOff className="h-4 w-4 text-danger" />}
                label="Unprotected Services"
                value={result.unprotectedServiceCount}
                sub={result.unprotectedServiceCount === 0 ? 'All services protected' : 'Need protection paths'}
                danger={result.unprotectedServiceCount > 0}
              />
              <StatCard
                icon={<ShieldAlert className="h-4 w-4 text-warning" />}
                label="Single Points of Failure"
                value={result.singlePointsOfFailure.length}
                sub={result.singlePointsOfFailure.length === 0 ? 'No SPOFs detected' : 'Edges with no redundancy'}
                danger={result.singlePointsOfFailure.length > 0}
              />
            </div>
          </div>

          {/* Topology Risk Map */}
          <TopologyRiskMap result={result} />

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="rounded-lg border border-border bg-elevated">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-text-primary">
                  Recommendations
                </h3>
              </div>
              <div className="flex flex-col divide-y divide-border">
                {result.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    {rec.severity === 'critical' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                    ) : rec.severity === 'warning' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    ) : (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    )}
                    <div>
                      <div className="text-xs font-semibold text-text-primary">{rec.title}</div>
                      <div className="mt-0.5 text-xs text-text-secondary">{rec.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SPOFs detail */}
          {result.singlePointsOfFailure.length > 0 && (
            <div className="border-danger/30 bg-danger/5 rounded-lg border">
              <div className="border-danger/20 border-b px-4 py-3">
                <h3 className="text-sm font-semibold text-text-primary">
                  Single Points of Failure
                </h3>
                <p className="text-xs text-text-tertiary">
                  Failing any of these edges causes total service loss for all traversing services
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-sticky border-b border-border bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                    <tr className="text-left text-text-secondary">
                      <th className="px-3 py-2">Edge</th>
                      <th className="px-3 py-2">Route</th>
                      <th className="px-3 py-2 text-right">Services at Risk</th>
                      <th className="px-3 py-2">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.singlePointsOfFailure.map((spof) => (
                      <tr key={spof.edgeId} className="border-danger/10 border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-text-primary">
                          {spof.edgeName || spof.edgeId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {getNodeName(spof.sourceNodeId)} - {getNodeName(spof.targetNodeId)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-danger">
                          {spof.affectedServiceIds.length}
                        </td>
                        <td className="px-3 py-2 text-text-tertiary">
                          {spof.recommendation}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Edge Risk Table (collapsible) */}
          {result.edgeRisks.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <button
                onClick={() => setShowEdgeTable(!showEdgeTable)}
                className="hover:bg-tertiary/50 flex w-full items-center justify-between border-b border-border bg-elevated px-4 py-3 transition-colors"
              >
                <div>
                  <h3 className="text-left text-sm font-semibold text-text-primary">
                    Per-Edge Risk Assessment
                  </h3>
                  <p className="text-left text-xs text-text-tertiary">
                    {result.edgeRisks.filter((e) => e.riskLevel === 'critical').length} critical,{' '}
                    {result.edgeRisks.filter((e) => e.riskLevel === 'warning').length} warning,{' '}
                    {result.edgeRisks.filter((e) => e.riskLevel === 'healthy').length} healthy
                  </p>
                </div>
                {showEdgeTable ? (
                  <ChevronUp className="h-4 w-4 text-text-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-muted" />
                )}
              </button>
              {showEdgeTable && (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-sticky border-b border-border bg-elevated shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                      <tr className="text-left text-text-secondary">
                        <th className="px-3 py-2">Risk</th>
                        <th className="px-3 py-2">Edge</th>
                        <th className="px-3 py-2">Route</th>
                        <th className="px-3 py-2 text-right">Down</th>
                        <th className="px-3 py-2 text-right">Survived</th>
                        <th className="px-3 py-2 text-right">Total Affected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.edgeRisks.map((er) => (
                        <tr key={er.edgeId} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <RiskBadge level={er.riskLevel} />
                          </td>
                          <td className="px-3 py-2 font-mono text-text-primary">
                            {er.edgeName || er.edgeId.slice(0, 8)}
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {getNodeName(er.sourceNodeId)} - {getNodeName(er.targetNodeId)}
                          </td>
                          <td className={cn(
                            'px-3 py-2 text-right font-medium',
                            er.downServiceCount > 0 ? 'text-danger' : 'text-text-muted'
                          )}>
                            {er.downServiceCount}
                          </td>
                          <td className={cn(
                            'px-3 py-2 text-right font-medium',
                            er.survivedServiceCount > 0 ? 'text-success' : 'text-text-muted'
                          )}>
                            {er.survivedServiceCount}
                          </td>
                          <td className="px-3 py-2 text-right text-text-secondary">
                            {er.totalAffectedCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub: string;
  danger?: boolean;
}> = ({ icon, label, value, sub, danger }) => (
  <div className="flex flex-col justify-center rounded-lg border border-border bg-elevated p-4">
    <div className="mb-1 flex items-center gap-2">
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{label}</span>
    </div>
    <div className={cn('text-xl font-bold', danger ? 'text-danger' : 'text-text-primary')}>
      {value}
    </div>
    <div className="mt-0.5 text-[10px] text-text-muted">{sub}</div>
  </div>
);

const RiskBadge: React.FC<{ level: EdgeRiskLevel }> = ({ level }) => {
  const config = {
    critical: { label: 'Critical', bg: 'bg-danger', icon: <AlertTriangle className="h-2.5 w-2.5" /> },
    warning: { label: 'Warning', bg: 'bg-warning', icon: <AlertTriangle className="h-2.5 w-2.5" /> },
    healthy: { label: 'Healthy', bg: 'bg-success', icon: <CheckCircle2 className="h-2.5 w-2.5" /> },
  }[level];

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white',
      config.bg
    )}>
      {config.icon}
      {config.label}
    </span>
  );
};
