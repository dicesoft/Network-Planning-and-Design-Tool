/**
 * ServiceWizardProtection - Step 4: Protection Configuration
 *
 * Handles:
 * - Protection scheme selection (L1: OLP, SNCP, WSON-Restoration / L2-L3: BFD, ECMP, FRR)
 * - Protection path computation for L1 services
 * - SRLG diversity analysis between working and protection paths
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useWizard } from './ServiceWizardContext';
import { useNetworkStore } from '@/stores/networkStore';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Play,
  Loader2,
  Check,
  AlertTriangle,
  MapPin,
  ArrowRight,
  Ruler,
  Hash,
  Radio,
  AlertCircle,
  Info,
} from 'lucide-react';
import {
  PROTECTION_SCHEME_CONFIGS,
  IP_PROTECTION_SCHEME_CONFIGS,
  type ProtectionScheme,
  type IPProtectionScheme,
  type ServicePath,
  type SRLGRiskAnalysis,
} from '@/types/service';
import { PathFinder, type PathResult } from '@/core/graph/PathFinder';
import { GraphEngine } from '@/core/graph/GraphEngine';
import { SRLGAnalyzer, type SRLGTopologyProvider } from '@/core/services/SRLGAnalyzer';
import { Input } from '@/components/ui/input';
import { ManualPathSelector, type PathValidationResult } from './ManualPathSelector';

// Protection path algorithm types
type ProtectionPathAlgorithm = 'manual' | 'edge-avoiding' | 'srlg-diverse' | 'k-shortest' | 'edge-disjoint';

const PROTECTION_ALGORITHM_CONFIGS: Record<ProtectionPathAlgorithm, { label: string; description: string }> = {
  'manual': {
    label: 'Manual Selection',
    description: 'Manually select protection path nodes',
  },
  'edge-avoiding': {
    label: 'Edge-Avoiding Shortest',
    description: 'Find shortest path avoiding working path edges',
  },
  'srlg-diverse': {
    label: 'SRLG-Diverse',
    description: 'Find path minimizing SRLG overlap with working path',
  },
  'k-shortest': {
    label: 'K-Shortest Alternatives',
    description: 'Compute k alternative paths ranked by distance',
  },
  'edge-disjoint': {
    label: 'Edge-Disjoint',
    description: 'Find k paths sharing no edges with working path',
  },
};

// ============================================================================
// SRLG RISK DISPLAY COMPONENT
// ============================================================================

interface SRLGRiskDisplayProps {
  analysis: SRLGRiskAnalysis;
}

const SRLGRiskDisplay: React.FC<SRLGRiskDisplayProps> = ({ analysis }) => {
  // Determine risk level
  const getRiskLevel = (score: number) => {
    if (score === 0) return { label: 'Fully Diverse', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' };
    if (score <= 10) return { label: 'Low Risk', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' };
    if (score <= 30) return { label: 'Medium Risk', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' };
    if (score <= 50) return { label: 'High Risk', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' };
    return { label: 'Critical Risk', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' };
  };

  const riskLevel = getRiskLevel(analysis.riskScore);

  return (
    <div className={cn('p-4 rounded-lg border', riskLevel.bg, riskLevel.border)}>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          {analysis.riskScore === 0 ? (
            <ShieldCheck className={cn('w-5 h-5', riskLevel.color)} />
          ) : analysis.riskScore <= 30 ? (
            <Shield className={cn('w-5 h-5', riskLevel.color)} />
          ) : (
            <ShieldAlert className={cn('w-5 h-5', riskLevel.color)} />
          )}
          <span className={cn('font-medium', riskLevel.color)}>{riskLevel.label}</span>
        </div>
        <div className={cn('text-2xl font-bold', riskLevel.color)}>
          {analysis.riskScore.toFixed(0)}%
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-text-muted">Shared Distance:</span>
          <span className="ml-2 font-medium text-text-primary">
            {analysis.sharedDistanceKm.toFixed(1)} km
          </span>
        </div>
        <div>
          <span className="text-text-muted">Shared Edges:</span>
          <span className="ml-2 font-medium text-text-primary">
            {analysis.sharedEdgeIds.length}
          </span>
        </div>
      </div>

      {analysis.sharedSRLGCodes.length > 0 && (
        <div className="border-border/50 mt-3 border-t pt-3">
          <span className="text-xs text-text-muted">Shared SRLG Codes:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {analysis.sharedSRLGCodes.slice(0, 5).map((code) => (
              <span
                key={code}
                className="bg-secondary rounded px-2 py-0.5 text-xs text-text-secondary"
              >
                {code}
              </span>
            ))}
            {analysis.sharedSRLGCodes.length > 5 && (
              <span className="px-2 py-0.5 text-xs text-text-muted">
                +{analysis.sharedSRLGCodes.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {analysis.warnings.length > 0 && (
        <div className="border-border/50 mt-3 space-y-1 border-t pt-3">
          {analysis.warnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-yellow-400">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// PROTECTION PATH CARD
// ============================================================================

interface ProtectionPathCardProps {
  path: ServicePath;
  nodes: Map<string, string>;
}

const ProtectionPathCard: React.FC<ProtectionPathCardProps> = ({ path, nodes }) => {
  return (
    <div className="bg-secondary/50 rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-orange-400" />
        <span className="font-medium text-text-primary">Protection Path</span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-1.5 text-sm">
          <Ruler className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-text-muted">Distance:</span>
          <span className="font-medium text-text-primary">
            {path.totalDistance.toFixed(1)} km
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Hash className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-text-muted">Hops:</span>
          <span className="font-medium text-text-primary">{path.hopCount}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {path.nodeIds.map((nodeId, i) => (
          <React.Fragment key={nodeId}>
            <div className="flex items-center gap-1 rounded bg-orange-500/10 px-2 py-1 text-xs">
              <MapPin className="h-3 w-3 text-orange-400" />
              <span className="max-w-[80px] truncate text-text-primary">
                {nodes.get(nodeId) || nodeId}
              </span>
            </div>
            {i < path.nodeIds.length - 1 && (
              <ArrowRight className="h-3 w-3 shrink-0 text-text-muted" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Computed protection path with SRLG analysis
interface ComputedProtectionPath {
  path: ServicePath;
  analysis: SRLGRiskAnalysis;
}

export const ServiceWizardProtection: React.FC = () => {
  const { state, dispatch } = useWizard();
  const topology = useNetworkStore((s) => s.topology);

  const [isComputing, setIsComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [protectionAlgorithm, setProtectionAlgorithm] = useState<ProtectionPathAlgorithm>('srlg-diverse');
  const [protectionKValue, setProtectionKValue] = useState(3);
  const [computedProtectionPaths, setComputedProtectionPaths] = useState<ComputedProtectionPath[]>([]);
  const [selectedProtectionIndex, setSelectedProtectionIndex] = useState(0);

  // Create node name map for display
  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    topology.nodes.forEach((node) => map.set(node.id, node.name));
    return map;
  }, [topology.nodes]);

  // Create topology provider for SRLGAnalyzer
  const srlgTopologyProvider = useMemo((): SRLGTopologyProvider => ({
    getEdge: (id: string) => topology.edges.find((e) => e.id === id),
    getEdges: () => topology.edges,
  }), [topology]);

  const isL1Service = state.serviceType === 'l1-dwdm';
  // Show k-value input for k-shortest, edge-disjoint, AND srlg-diverse modes
  const showKValueInput = protectionAlgorithm === 'k-shortest' ||
                          protectionAlgorithm === 'edge-disjoint' ||
                          protectionAlgorithm === 'srlg-diverse';

  // Handle protection scheme change for L1
  const handleProtectionSchemeChange = useCallback(
    (scheme: ProtectionScheme) => {
      dispatch({ type: 'SET_PROTECTION_SCHEME', scheme });
      // Clear protection path when changing to 'none'
      if (scheme === 'none') {
        dispatch({ type: 'SET_PROTECTION_PATH', path: undefined });
        dispatch({ type: 'SET_SRLG_ANALYSIS', analysis: undefined });
      }
    },
    [dispatch]
  );

  // Handle IP protection scheme change for L2/L3
  const handleIPProtectionSchemeChange = useCallback(
    (scheme: IPProtectionScheme) => {
      dispatch({ type: 'SET_IP_PROTECTION', scheme });
    },
    [dispatch]
  );

  // Create SRLG analyzer for manual path analysis
  const srlgAnalyzer = useMemo(() => new SRLGAnalyzer(srlgTopologyProvider), [srlgTopologyProvider]);

  // Handle manual protection path changes
  const handleManualProtectionPathChange = useCallback(
    (path: ServicePath | null, _validation: PathValidationResult, channelNumber?: number) => {
      if (path) {
        // Change path type to 'protection'
        const protectionPath: ServicePath = { ...path, type: 'protection', channelNumber };
        dispatch({ type: 'SET_PROTECTION_PATH', path: protectionPath });

        // Compute SRLG analysis against working path
        if (state.workingPath) {
          const analysis = srlgAnalyzer.comparePaths(state.workingPath, protectionPath);
          dispatch({ type: 'SET_SRLG_ANALYSIS', analysis });
        }

        // Clear computed alternatives when using manual selection
        setComputedProtectionPaths([]);
      } else {
        dispatch({ type: 'SET_PROTECTION_PATH', path: undefined });
        dispatch({ type: 'SET_SRLG_ANALYSIS', analysis: undefined });
      }
    },
    [dispatch, state.workingPath, srlgAnalyzer]
  );

  // Convert PathResult to ServicePath
  const pathResultToServicePath = useCallback((result: PathResult): ServicePath => {
    return {
      id: crypto.randomUUID(),
      type: 'protection',
      nodeIds: result.path,
      edgeIds: result.edges,
      totalDistance: result.totalWeight,
      hopCount: result.path.length - 1,
      latency: result.totalWeight * 0.005,
      status: 'computed',
    };
  }, []);

  // Compute protection path for L1 services
  const computeProtectionPath = useCallback(async () => {
    if (!state.workingPath) {
      setComputeError('Working path must be computed first');
      return;
    }

    setIsComputing(true);
    setComputeError(null);
    setComputedProtectionPaths([]);

    try {
      const graphEngine = new GraphEngine();
      graphEngine.loadFromTopology(topology);
      const pathFinder = new PathFinder(graphEngine);
      const srlgAnalyzer = new SRLGAnalyzer(srlgTopologyProvider);

      // Get SRLGs from working path for SRLG-aware algorithms
      const workingSRLGs = Array.from(srlgAnalyzer.getPathSRLGs(state.workingPath.edgeIds));

      // Create a mock PathResult from working ServicePath for methods that require it
      const workingPathResult: PathResult = {
        path: state.workingPath.nodeIds,
        edges: state.workingPath.edgeIds,
        totalWeight: state.workingPath.totalDistance,
        totalDistance: state.workingPath.totalDistance,
        hopCount: state.workingPath.hopCount,
      };

      const pathResults: PathResult[] = [];

      switch (protectionAlgorithm) {
        case 'edge-avoiding': {
          // Simple edge-avoiding shortest path
          const result = pathFinder.shortestPath(
            state.sourceNodeId,
            state.destinationNodeId,
            { excludeEdges: state.workingPath.edgeIds }
          );
          if (result) pathResults.push(result);
          break;
        }
        case 'srlg-diverse': {
          // Compute k-shortest paths first, then filter and rank by SRLG diversity
          const kPaths = pathFinder.kShortestPaths(
            state.sourceNodeId,
            state.destinationNodeId,
            protectionKValue + 5, // Get extra to account for filtering
            { excludeEdges: state.workingPath.edgeIds }
          );

          if (kPaths.length > 0) {
            // Calculate SRLG overlap for each path and rank by diversity
            const pathsWithOverlap = kPaths.map((path) => {
              const pathSRLGs = new Set<string>();
              for (const edgeId of path.edges) {
                const edge = topology.edges.find((e) => e.id === edgeId);
                if (edge?.properties.srlgCodes) {
                  edge.properties.srlgCodes.forEach((code) => pathSRLGs.add(code));
                }
              }
              // Count shared SRLGs
              let sharedCount = 0;
              for (const srlg of pathSRLGs) {
                if (workingSRLGs.includes(srlg)) {
                  sharedCount++;
                }
              }
              return { path, sharedCount };
            });

            // Sort by shared SRLG count (ascending = most diverse first)
            pathsWithOverlap.sort((a, b) => a.sharedCount - b.sharedCount);

            // Take the top k most diverse paths
            pathResults.push(...pathsWithOverlap.slice(0, protectionKValue).map((p) => p.path));
          } else {
            // Fallback: try SRLG-aware shortest path
            const result = pathFinder.srlgAwareShortestPath(
              state.sourceNodeId,
              state.destinationNodeId,
              workingSRLGs,
              { excludeEdges: state.workingPath.edgeIds }
            );
            if (result) {
              pathResults.push(result);
            } else {
              // Last resort: minimum overlap path
              const minOverlapResult = pathFinder.findMinimumSRLGOverlapPath(
                state.sourceNodeId,
                state.destinationNodeId,
                workingPathResult
              );
              if (minOverlapResult) pathResults.push(minOverlapResult.path);
            }
          }
          break;
        }
        case 'k-shortest': {
          // K-shortest paths avoiding working path edges
          const results = pathFinder.kShortestPaths(
            state.sourceNodeId,
            state.destinationNodeId,
            protectionKValue + 1, // Get k+1 to exclude working path if included
            { excludeEdges: state.workingPath.edgeIds }
          );
          pathResults.push(...results.slice(0, protectionKValue));
          break;
        }
        case 'edge-disjoint': {
          // Edge-disjoint paths
          const results = pathFinder.findEdgeDisjointPaths(
            state.sourceNodeId,
            state.destinationNodeId,
            protectionKValue + 1
          );
          // Filter out paths that share edges with working path
          const disjointResults = results.filter((r) =>
            !r.edges.some((e) => state.workingPath!.edgeIds.includes(e))
          );
          pathResults.push(...disjointResults.slice(0, protectionKValue));
          break;
        }
      }

      if (pathResults.length === 0) {
        setComputeError('No diverse protection path found. Try a different algorithm or check network connectivity.');
        return;
      }

      // Convert to ComputedProtectionPath with SRLG analysis
      const computedPaths: ComputedProtectionPath[] = pathResults.map((result) => {
        const path = pathResultToServicePath(result);
        const analysis = srlgAnalyzer.comparePaths(state.workingPath!, path);
        return { path, analysis };
      });

      // Sort by risk score (lowest first = most diverse)
      computedPaths.sort((a, b) => a.analysis.riskScore - b.analysis.riskScore);

      setComputedProtectionPaths(computedPaths);
      setSelectedProtectionIndex(0);

      // Set the first (best) path as the selected protection path
      if (computedPaths.length > 0) {
        dispatch({ type: 'SET_PROTECTION_PATH', path: computedPaths[0].path });
        dispatch({ type: 'SET_SRLG_ANALYSIS', analysis: computedPaths[0].analysis });
      }
    } catch (error) {
      console.error('Protection path computation error:', error);
      setComputeError(
        error instanceof Error ? error.message : 'Failed to compute protection path'
      );
    } finally {
      setIsComputing(false);
    }
  }, [state.workingPath, state.sourceNodeId, state.destinationNodeId, topology, srlgTopologyProvider, protectionAlgorithm, protectionKValue, dispatch, pathResultToServicePath]);

  // Handle protection path selection from multiple alternatives
  const handleSelectProtectionPath = useCallback((index: number) => {
    if (computedProtectionPaths[index]) {
      setSelectedProtectionIndex(index);
      dispatch({ type: 'SET_PROTECTION_PATH', path: computedProtectionPaths[index].path });
      dispatch({ type: 'SET_SRLG_ANALYSIS', analysis: computedProtectionPaths[index].analysis });
    }
  }, [computedProtectionPaths, dispatch]);

  // Check if protection is needed
  const needsProtection = isL1Service
    ? state.protectionScheme !== 'none'
    : state.ipProtectionScheme !== 'none';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
          <Shield className="h-5 w-5 text-orange-400" />
        </div>
        <div>
          <h3 className="font-medium text-text-primary">Protection Configuration</h3>
          <p className="text-sm text-text-muted">
            Configure protection scheme and backup path
          </p>
        </div>
      </div>

      {/* Protection Scheme Selection */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Protection Scheme
        </label>

        {isL1Service ? (
          <Select
            value={state.protectionScheme}
            onValueChange={(v) => handleProtectionSchemeChange(v as ProtectionScheme)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROTECTION_SCHEME_CONFIGS) as ProtectionScheme[]).map((scheme) => {
                const config = PROTECTION_SCHEME_CONFIGS[scheme];
                return (
                  <SelectItem key={scheme} value={scheme}>
                    <div className="flex flex-col">
                      <span>{config.label}</span>
                      <span className="text-xs text-text-muted">{config.description}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : (
          <Select
            value={state.ipProtectionScheme}
            onValueChange={(v) => handleIPProtectionSchemeChange(v as IPProtectionScheme)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(IP_PROTECTION_SCHEME_CONFIGS) as IPProtectionScheme[]).map((scheme) => {
                const config = IP_PROTECTION_SCHEME_CONFIGS[scheme];
                return (
                  <SelectItem key={scheme} value={scheme}>
                    <div className="flex flex-col">
                      <span>{config.label}</span>
                      <span className="text-xs text-text-muted">{config.description}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* WSON-Restoration Info (no protection path needed) */}
      {isL1Service && state.protectionScheme === 'wson-restoration' && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="text-sm text-text-secondary">
              <p className="mb-1 font-medium text-text-primary">
                WSON Dynamic Restoration
              </p>
              <p>
                The restoration path will be computed dynamically by the network after a failure
                event. No pre-computed protection path is needed. Typical restoration time is
                approximately <strong>5 minutes</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* L1 Protection Path Section */}
      {isL1Service && needsProtection && state.protectionScheme !== 'wson-restoration' && (
        <>
          {/* Working Path Summary */}
          {state.workingPath && (
            <div className="bg-accent/5 border-accent/20 rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2">
                <Check className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-text-primary">Working Path</span>
              </div>
              <div className="text-xs text-text-muted">
                {state.workingPath.totalDistance.toFixed(1)} km • {state.workingPath.hopCount} hops
                • {state.workingPath.nodeIds.length} nodes
              </div>
            </div>
          )}

          {/* Protection Path Algorithm Selection */}
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Path Computation Algorithm
              </label>
              <Select
                value={protectionAlgorithm}
                onValueChange={(v) => setProtectionAlgorithm(v as ProtectionPathAlgorithm)}
                disabled={isComputing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROTECTION_ALGORITHM_CONFIGS) as ProtectionPathAlgorithm[]).map((alg) => {
                    const config = PROTECTION_ALGORITHM_CONFIGS[alg];
                    return (
                      <SelectItem key={alg} value={alg}>
                        <div className="flex flex-col">
                          <span>{config.label}</span>
                          <span className="text-xs text-text-muted">{config.description}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* K-Value Input */}
            {showKValueInput && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Number of Paths (k)
                  <span className="ml-1 font-normal text-text-muted">(2-10)</span>
                </label>
                <Input
                  type="number"
                  value={protectionKValue}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 2 && val <= 10) {
                      setProtectionKValue(val);
                    }
                  }}
                  min={2}
                  max={10}
                  disabled={isComputing}
                  className="w-24"
                />
              </div>
            )}
          </div>

          {/* Manual Path Selector */}
          {protectionAlgorithm === 'manual' && state.workingPath && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                <span className="text-sm text-yellow-400">
                  Avoid edges used by the working path for better protection diversity.
                </span>
              </div>
              <ManualPathSelector
                sourceNodeId={state.sourceNodeId}
                destinationNodeId={state.destinationNodeId}
                wavelengthMode={state.wavelengthMode}
                isL1Service={true}
                onPathChange={handleManualProtectionPathChange}
                initialPath={state.protectionPath}
                excludeEdges={state.workingPath?.edgeIds}
              />
            </div>
          )}

          {/* Compute Protection Path Button - only show for computed algorithms */}
          {protectionAlgorithm !== 'manual' && (
            <Button
              type="button"
              onClick={computeProtectionPath}
              disabled={!state.workingPath || isComputing}
              className="w-full"
              variant={state.protectionPath ? 'outline' : 'default'}
            >
              {isComputing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Computing Protection Path...
                </>
              ) : state.protectionPath ? (
                <>
                  <Radio className="mr-2 h-4 w-4" />
                  Recompute Protection Path
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Compute Protection Path
                </>
              )}
            </Button>
          )}

          {/* Error Display */}
          {computeError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <span className="text-sm text-red-400">{computeError}</span>
            </div>
          )}

          {/* Multiple Protection Paths Selection */}
          {computedProtectionPaths.length > 1 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-secondary">
                Select Protection Path
                <span className="ml-1 font-normal text-text-muted">
                  ({computedProtectionPaths.length} alternatives found)
                </span>
              </label>
              <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
                {computedProtectionPaths.map((computed, index) => (
                  <button
                    key={computed.path.id}
                    type="button"
                    onClick={() => handleSelectProtectionPath(index)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border-2 transition-all',
                      selectedProtectionIndex === index
                        ? 'border-orange-500 bg-orange-500/5 ring-2 ring-orange-500/30'
                        : 'border-border hover:border-orange-500/50 hover:bg-secondary/50'
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium',
                            selectedProtectionIndex === index
                              ? 'bg-orange-500 text-white'
                              : 'bg-border text-text-muted'
                          )}
                        >
                          {selectedProtectionIndex === index ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            index + 1
                          )}
                        </div>
                        <span className="text-sm font-medium text-text-primary">
                          Path {index + 1}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'px-2 py-0.5 rounded text-xs font-medium',
                          computed.analysis.riskScore === 0
                            ? 'bg-green-500/10 text-green-400'
                            : computed.analysis.riskScore <= 30
                            ? 'bg-yellow-500/10 text-yellow-400'
                            : 'bg-red-500/10 text-red-400'
                        )}
                      >
                        {computed.analysis.riskScore === 0 ? 'Fully Diverse' : `${computed.analysis.riskScore.toFixed(0)}% overlap`}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-text-muted">
                      <div>{computed.path.totalDistance.toFixed(1)} km</div>
                      <div>{computed.path.hopCount} hops</div>
                      <div>{computed.analysis.sharedSRLGCodes.length} shared SRLGs</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Protection Path Display */}
          {state.protectionPath && (
            <ProtectionPathCard path={state.protectionPath} nodes={nodeNameMap} />
          )}

          {/* SRLG Risk Analysis */}
          {state.srlgAnalysis && <SRLGRiskDisplay analysis={state.srlgAnalysis} />}

          {/* 1+1+WSON Info Banner */}
          {state.protectionScheme === '1+1+wson' && state.protectionPath && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div className="text-sm text-text-secondary">
                  <p className="mb-1 font-medium text-text-primary">
                    WSON Dynamic Restoration (Tertiary Backup)
                  </p>
                  <p>
                    If both working and protection paths fail simultaneously, the network will
                    attempt dynamic WSON restoration. This process computes a new optical path
                    on-demand and takes approximately <strong>5 minutes</strong> to restore service.
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    The restoration path is not pre-computed. The network must have sufficient
                    path diversity (at least 3 disjoint routes) for WSON restoration to succeed.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* No Protection Selected */}
      {!needsProtection && (
        <div className="bg-secondary/50 flex items-start gap-3 rounded-lg border border-border p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
          <div className="text-sm text-text-muted">
            <p className="mb-1 font-medium text-text-secondary">No Protection</p>
            <p>
              This service will operate without a backup path. If the working path fails, the
              service will be interrupted until the path is restored or a new path is provisioned.
            </p>
          </div>
        </div>
      )}

      {/* L2/L3 Protection Info */}
      {!isL1Service && needsProtection && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
            <div className="text-sm text-text-secondary">
              <p className="mb-1 font-medium text-text-primary">
                {IP_PROTECTION_SCHEME_CONFIGS[state.ipProtectionScheme].label}
              </p>
              <p>{IP_PROTECTION_SCHEME_CONFIGS[state.ipProtectionScheme].description}</p>
              {state.ipProtectionScheme === 'bfd-failover' && state.bfdConfig.enabled && (
                <p className="mt-2 text-xs text-text-muted">
                  BFD detection time:{' '}
                  {((state.bfdConfig.minRxInterval * state.bfdConfig.multiplier) / 1000).toFixed(0)}{' '}
                  ms
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceWizardProtection;
