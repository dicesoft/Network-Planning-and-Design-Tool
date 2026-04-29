/**
 * Path-finding constraint types
 */

/**
 * Constraint mode determines how path-finding handles constraints
 * - 'blocking': Path must satisfy the constraint or return null
 * - 'best-effort': Try to satisfy constraint, but return path with warnings if not possible
 */
export type ConstraintMode = 'blocking' | 'best-effort';

/**
 * Warning generated when a best-effort constraint cannot be fully satisfied
 * or when path computation has limitations
 */
export interface PathWarning {
  type: 'node_not_avoided' | 'edge_not_avoided' | 'max_hops_exceeded' | 'path_count_limited';
  code?: string; // Extended code for UI filtering (e.g., 'FEWER_PATHS_THAN_REQUESTED')
  message: string;
  details?: {
    nodeId?: string;
    edgeId?: string;
    actualHops?: number;
    requestedMaxHops?: number;
    requestedPaths?: number;
    foundPaths?: number;
  };
}

/**
 * Configuration for path-finding constraints
 */
export interface ConstraintConfig {
  avoidNodes: {
    enabled: boolean;
    nodeIds: string[];
    mode: ConstraintMode;
  };
  avoidEdges: {
    enabled: boolean;
    edgeIds: string[];
    mode: ConstraintMode;
  };
  maxHops: {
    enabled: boolean;
    value: number;
    mode: ConstraintMode;
  };
  weightAttribute: {
    enabled: boolean;
    attribute: 'distance' | 'weight' | 'cost';
  };
}

/**
 * Default constraint configuration
 */
export const DEFAULT_CONSTRAINT_CONFIG: ConstraintConfig = {
  avoidNodes: { enabled: false, nodeIds: [], mode: 'blocking' },
  avoidEdges: { enabled: false, edgeIds: [], mode: 'blocking' },
  maxHops: { enabled: false, value: 10, mode: 'blocking' },
  weightAttribute: { enabled: false, attribute: 'distance' },
};
