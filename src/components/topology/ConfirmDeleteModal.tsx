import React, { useMemo } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { useUIStore } from '@/stores/uiStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface DeleteImpact {
  nodes: { id: string; name: string }[];
  edges: { id: string; name: string }[];
  connectedEdges: { id: string; name: string }[];
  affectedServices: { id: string; name: string }[];
}

export const ConfirmDeleteModal: React.FC = () => {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal = useUIStore((state) => state.closeModal);

  const selectedNodeIds = useNetworkStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useNetworkStore((state) => state.selectedEdgeIds);
  const topology = useNetworkStore((state) => state.topology);
  const deleteSelected = useNetworkStore((state) => state.deleteSelected);

  const services = useServiceStore((state) => state.services);
  const getServicesByNode = useServiceStore((state) => state.getServicesByNode);
  const getServicesByEdge = useServiceStore((state) => state.getServicesByEdge);

  const isOpen = activeModal === 'confirm-delete';

  // Calculate the impact of deletion
  const impact = useMemo<DeleteImpact>(() => {
    const nodesToDelete = topology.nodes.filter((n) =>
      selectedNodeIds.includes(n.id)
    );
    const edgesToDelete = topology.edges.filter((e) =>
      selectedEdgeIds.includes(e.id)
    );

    // Find edges connected to selected nodes that will also be deleted
    const connectedEdgeIds = new Set<string>();
    for (const nodeId of selectedNodeIds) {
      for (const edge of topology.edges) {
        if (
          edge.source.nodeId === nodeId ||
          edge.target.nodeId === nodeId
        ) {
          // Don't include edges already in the selection
          if (!selectedEdgeIds.includes(edge.id)) {
            connectedEdgeIds.add(edge.id);
          }
        }
      }
    }
    const connectedEdges = topology.edges.filter((e) =>
      connectedEdgeIds.has(e.id)
    );

    // Find all affected services
    const affectedServiceIds = new Set<string>();

    // Services affected by node deletion
    for (const nodeId of selectedNodeIds) {
      const nodeServices = getServicesByNode(nodeId);
      nodeServices.forEach((s) => affectedServiceIds.add(s.id));
    }

    // Services affected by edge deletion (selected + connected)
    const allEdgeIds = [...selectedEdgeIds, ...Array.from(connectedEdgeIds)];
    for (const edgeId of allEdgeIds) {
      const edgeServices = getServicesByEdge(edgeId);
      edgeServices.forEach((s) => affectedServiceIds.add(s.id));
    }

    const affectedServices = services.filter((s) =>
      affectedServiceIds.has(s.id)
    );

    return {
      nodes: nodesToDelete.map((n) => ({ id: n.id, name: n.name })),
      edges: edgesToDelete.map((e) => ({ id: e.id, name: e.name })),
      connectedEdges: connectedEdges.map((e) => ({ id: e.id, name: e.name })),
      affectedServices: affectedServices.map((s) => ({ id: s.id, name: s.name })),
    };
  }, [
    selectedNodeIds,
    selectedEdgeIds,
    topology.nodes,
    topology.edges,
    services,
    getServicesByNode,
    getServicesByEdge,
  ]);

  const totalItems =
    impact.nodes.length + impact.edges.length + impact.connectedEdges.length;

  const handleConfirm = () => {
    deleteSelected();
    closeModal();
  };

  const handleCancel = () => {
    closeModal();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-[480px]" data-testid="confirm-delete-modal" hideClose>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-danger">
            <AlertTriangle className="h-5 w-5" />
            Confirm Deletion
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. Please review what will be deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-panel space-y-4 overflow-y-auto px-6 py-4">
          {/* Summary */}
          <div className="rounded-lg bg-tertiary p-3">
            <p className="text-sm font-medium text-text-primary">
              Delete {impact.nodes.length} node{impact.nodes.length !== 1 ? 's' : ''} and{' '}
              {impact.edges.length} edge{impact.edges.length !== 1 ? 's' : ''}?
            </p>
          </div>

          {/* Nodes to delete */}
          {impact.nodes.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-text-muted">
                Nodes ({impact.nodes.length})
              </h4>
              <ul className="space-y-1">
                {impact.nodes.slice(0, 5).map((node) => (
                  <li
                    key={node.id}
                    className="flex items-center gap-2 text-sm text-text-secondary"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                    {node.name}
                  </li>
                ))}
                {impact.nodes.length > 5 && (
                  <li className="text-xs text-text-muted">
                    ...and {impact.nodes.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Edges to delete */}
          {impact.edges.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-text-muted">
                Edges ({impact.edges.length})
              </h4>
              <ul className="space-y-1">
                {impact.edges.slice(0, 5).map((edge) => (
                  <li
                    key={edge.id}
                    className="flex items-center gap-2 text-sm text-text-secondary"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                    {edge.name}
                  </li>
                ))}
                {impact.edges.length > 5 && (
                  <li className="text-xs text-text-muted">
                    ...and {impact.edges.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Connected edges that will also be deleted */}
          {impact.connectedEdges.length > 0 && (
            <div className="border-warning/30 bg-warning/5 rounded-lg border p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                Auto-deleted Edges ({impact.connectedEdges.length})
              </h4>
              <p className="mb-2 text-xs text-text-secondary">
                These edges are connected to the selected nodes and will also be
                removed.
              </p>
              <ul className="space-y-1">
                {impact.connectedEdges.slice(0, 3).map((edge) => (
                  <li
                    key={edge.id}
                    className="flex items-center gap-2 text-sm text-text-secondary"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                    {edge.name}
                  </li>
                ))}
                {impact.connectedEdges.length > 3 && (
                  <li className="text-xs text-text-muted">
                    ...and {impact.connectedEdges.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Affected services warning */}
          {impact.affectedServices.length > 0 && (
            <div className="border-danger/30 bg-danger/5 rounded-lg border p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-danger">
                <AlertTriangle className="h-3.5 w-3.5" />
                Affected Services ({impact.affectedServices.length})
              </h4>
              <p className="mb-2 text-xs text-text-secondary">
                These services use the elements being deleted and may become
                invalid.
              </p>
              <ul className="space-y-1">
                {impact.affectedServices.slice(0, 5).map((service) => (
                  <li
                    key={service.id}
                    className="flex items-center gap-2 text-sm text-text-secondary"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                    {service.name} ({service.id})
                  </li>
                ))}
                {impact.affectedServices.length > 5 && (
                  <li className="text-xs text-text-muted">
                    ...and {impact.affectedServices.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            className="gap-2"
            data-testid="confirm-delete-button"
          >
            <Trash2 className="h-4 w-4" />
            Delete {totalItems} item{totalItems !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
