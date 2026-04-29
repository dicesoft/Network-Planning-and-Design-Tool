import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  SimulationResult,
  ExhaustiveConfig,
  ExhaustiveProgress,
  ExhaustiveResults,
  HealthCheckResult,
} from '@/types/simulation';

interface SimulationState {
  // Failure state
  failedEdgeIds: string[];
  failedNodeIds: string[];
  isRunning: boolean;

  // Results
  lastResult: SimulationResult | null;

  // Exhaustive simulation state (NO persist — in-memory only)
  exhaustiveConfig: ExhaustiveConfig;
  exhaustiveProgress: ExhaustiveProgress | null;
  exhaustiveResults: ExhaustiveResults | null;
  exhaustiveIsRunning: boolean;

  // Health check state (in-memory only)
  healthCheckResult: HealthCheckResult | null;
  healthCheckIsRunning: boolean;

  // Actions — single scenario
  toggleEdgeFailure: (edgeId: string) => void;
  toggleNodeFailure: (nodeId: string) => void;
  setFailedEdges: (edgeIds: string[]) => void;
  setFailedNodes: (nodeIds: string[]) => void;
  setResult: (result: SimulationResult) => void;
  setRunning: (running: boolean) => void;
  clearSimulation: () => void;

  // Actions — exhaustive
  setExhaustiveConfig: (config: ExhaustiveConfig) => void;
  setExhaustiveProgress: (progress: ExhaustiveProgress | null) => void;
  setExhaustiveResults: (results: ExhaustiveResults | null) => void;
  setExhaustiveRunning: (running: boolean) => void;
  clearExhaustive: () => void;

  // Actions — health check
  setHealthCheckResult: (result: HealthCheckResult | null) => void;
  setHealthCheckRunning: (running: boolean) => void;
  clearHealthCheck: () => void;
}

export const useSimulationStore = create<SimulationState>()(
  devtools(
    immer((set) => ({
      failedEdgeIds: [],
      failedNodeIds: [],
      isRunning: false,
      lastResult: null,

      // Exhaustive defaults
      exhaustiveConfig: { maxEdgeFailures: 1, maxNodeFailures: 0 },
      exhaustiveProgress: null,
      exhaustiveResults: null,
      exhaustiveIsRunning: false,

      // Health check defaults
      healthCheckResult: null,
      healthCheckIsRunning: false,

      toggleEdgeFailure: (edgeId) =>
        set((state) => {
          const idx = state.failedEdgeIds.indexOf(edgeId);
          if (idx >= 0) {
            state.failedEdgeIds.splice(idx, 1);
          } else {
            state.failedEdgeIds.push(edgeId);
          }
          state.lastResult = null;
        }),

      toggleNodeFailure: (nodeId) =>
        set((state) => {
          const idx = state.failedNodeIds.indexOf(nodeId);
          if (idx >= 0) {
            state.failedNodeIds.splice(idx, 1);
          } else {
            state.failedNodeIds.push(nodeId);
          }
          state.lastResult = null;
        }),

      setFailedEdges: (edgeIds) =>
        set((state) => {
          state.failedEdgeIds = edgeIds;
          state.lastResult = null;
        }),

      setFailedNodes: (nodeIds) =>
        set((state) => {
          state.failedNodeIds = nodeIds;
          state.lastResult = null;
        }),

      setResult: (result) =>
        set((state) => {
          state.lastResult = result;
          state.isRunning = false;
        }),

      setRunning: (running) =>
        set((state) => {
          state.isRunning = running;
        }),

      clearSimulation: () =>
        set((state) => {
          state.failedEdgeIds = [];
          state.failedNodeIds = [];
          state.lastResult = null;
          state.isRunning = false;
        }),

      // Exhaustive actions
      setExhaustiveConfig: (config) =>
        set((state) => {
          state.exhaustiveConfig = config;
        }),

      setExhaustiveProgress: (progress) =>
        set((state) => {
          state.exhaustiveProgress = progress;
        }),

      setExhaustiveResults: (results) =>
        set((state) => {
          state.exhaustiveResults = results;
          state.exhaustiveIsRunning = false;
        }),

      setExhaustiveRunning: (running) =>
        set((state) => {
          state.exhaustiveIsRunning = running;
          if (running) {
            state.exhaustiveResults = null;
          }
        }),

      clearExhaustive: () =>
        set((state) => {
          state.exhaustiveProgress = null;
          state.exhaustiveResults = null;
          state.exhaustiveIsRunning = false;
          state.exhaustiveConfig = { maxEdgeFailures: 1, maxNodeFailures: 0 };
        }),

      // Health check actions
      setHealthCheckResult: (result) =>
        set((state) => {
          state.healthCheckResult = result;
          state.healthCheckIsRunning = false;
        }),

      setHealthCheckRunning: (running) =>
        set((state) => {
          state.healthCheckIsRunning = running;
        }),

      clearHealthCheck: () =>
        set((state) => {
          state.healthCheckResult = null;
          state.healthCheckIsRunning = false;
        }),
    })),
    { name: 'simulation-store' }
  )
);
