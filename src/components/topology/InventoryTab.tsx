import React, { useState } from 'react';
import { useNetworkStore } from '@/stores/networkStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUIStore } from '@/stores/uiStore';
import type { NetworkNode } from '@/types';
import type { CardDefinition } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, RefreshCw, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InventoryTabProps {
  node: NetworkNode;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({ node }) => {
  const installCard = useNetworkStore((state) => state.installCard);
  const removeCard = useNetworkStore((state) => state.removeCard);
  const swapCard = useNetworkStore((state) => state.swapCard);
  const updateNode = useNetworkStore((state) => state.updateNode);
  const addToast = useUIStore((state) => state.addToast);
  const cardLibrary = useSettingsStore((state) => state.settings.cardLibrary);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogSlot, setAddDialogSlot] = useState<number | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapTargetCardId, setSwapTargetCardId] = useState<string>('');
  const [swapInstalledCardId, setSwapInstalledCardId] = useState<string>('');

  // Chassis setup form state
  const [chassisSlots, setChassisSlots] = useState(8);
  const [chassisMaxPower, setChassisMaxPower] = useState<number | undefined>();
  const [chassisDescription, setChassisDescription] = useState('');
  const [isReconfiguring, setIsReconfiguring] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  const chassis = node.chassis;
  const installedCards = node.installedCards || [];

  // Filter card library for compatible card types
  const compatibleCards = (cardLibrary || []).filter(
    (c) => c.nodeType === node.type
  );

  if (!chassis || isReconfiguring) {
    return (
      <div className="p-5" data-testid="inventory-tab">
        <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Hardware Inventory
        </div>
        <div className="space-y-4 rounded-lg border border-border p-4" data-testid="chassis-setup-form">
          <p className="text-sm font-medium text-text-primary">
            {isReconfiguring ? 'Reconfigure Chassis' : 'Configure Chassis'}
          </p>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Total Slots (1-32)</label>
            <Input
              type="number"
              min={1}
              max={32}
              value={chassisSlots}
              onChange={(e) => setChassisSlots(Math.max(1, Math.min(32, parseInt(e.target.value) || 8)))}
              className="w-24"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Max Power (Watts, optional)</label>
            <Input
              type="number"
              min={0}
              value={chassisMaxPower || ''}
              onChange={(e) => setChassisMaxPower(e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-24"
              placeholder="e.g., 3000"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Description (optional)</label>
            <Input
              value={chassisDescription}
              onChange={(e) => setChassisDescription(e.target.value)}
              placeholder="e.g., Cisco NCS 4016"
            />
          </div>
          <div className="flex gap-2">
            {isReconfiguring && (
              <Button variant="ghost" size="sm" onClick={() => setIsReconfiguring(false)}>Cancel</Button>
            )}
            <Button
              size="sm"
              data-testid="chassis-configure-btn"
              onClick={() => {
                updateNode(node.id, {
                  chassis: { totalSlots: chassisSlots, maxPower: chassisMaxPower, description: chassisDescription },
                  installedCards: isReconfiguring ? node.installedCards : [],
                });
                setIsReconfiguring(false);
                addToast({ type: 'success', title: 'Chassis configured', message: `${chassisSlots} slots configured` });
              }}
            >
              {isReconfiguring ? 'Update Chassis' : 'Configure Chassis'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Build slot array
  const slots: { number: number; card: typeof installedCards[0] | null; cardDef: CardDefinition | null }[] = [];
  for (let i = 1; i <= chassis.totalSlots; i++) {
    const card = installedCards.find((c) => c.slotNumber === i) || null;
    const cardDef = card
      ? (cardLibrary || []).find((cd) => cd.id === card.definitionId) || null
      : null;
    slots.push({ number: i, card, cardDef });
  }

  const handleOpenAddDialog = (slotNumber: number) => {
    setAddDialogSlot(slotNumber);
    setSelectedCardId('');
    setAddDialogOpen(true);
  };

  const handleInstallCard = () => {
    if (!addDialogSlot || !selectedCardId) return;

    const cardDef = compatibleCards.find((c) => c.id === selectedCardId);
    if (!cardDef) return;

    const result = installCard(node.id, cardDef, addDialogSlot);
    if (result.success) {
      addToast({
        type: 'success',
        title: 'Card installed',
        message: `${cardDef.name} installed in slot ${addDialogSlot}`,
      });
    } else {
      addToast({
        type: 'error',
        title: 'Install failed',
        message: result.error || 'Unknown error',
      });
    }

    setAddDialogOpen(false);
  };

  const handleRemoveCard = (cardId: string, slotNumber: number) => {
    const result = removeCard(node.id, cardId);
    if (result.success) {
      addToast({
        type: 'success',
        title: 'Card removed',
        message: `Card removed from slot ${slotNumber}`,
      });
    } else {
      addToast({
        type: 'error',
        title: 'Remove failed',
        message: result.error || 'Unknown error',
      });
    }
  };

  const handleOpenSwapDialog = (installedCardId: string) => {
    setSwapInstalledCardId(installedCardId);
    setSwapTargetCardId('');
    setSwapDialogOpen(true);
  };

  const handleSwapCard = () => {
    if (!swapInstalledCardId || !swapTargetCardId) return;

    const cardDef = compatibleCards.find((c) => c.id === swapTargetCardId);
    if (!cardDef) return;

    const result = swapCard(node.id, swapInstalledCardId, cardDef);
    if (result.success) {
      addToast({
        type: 'success',
        title: 'Card swapped',
        message: `Replaced with ${cardDef.name}`,
      });
    } else {
      addToast({
        type: 'error',
        title: 'Swap failed',
        message: result.error || 'Unknown error',
      });
    }

    setSwapDialogOpen(false);
  };

  const handleSlotDrop = (slotNumber: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverSlot(null);

    const raw = e.dataTransfer.getData('application/atlas-card');
    if (!raw) return;

    try {
      const cardDef = JSON.parse(raw) as CardDefinition;
      if (cardDef.nodeType !== node.type) {
        addToast({ type: 'error', title: 'Incompatible card', message: 'Card incompatible with this node type' });
        return;
      }
      const result = installCard(node.id, cardDef, slotNumber);
      if (result.success) {
        addToast({ type: 'success', title: 'Card installed', message: `${cardDef.name} installed in slot ${slotNumber}` });
      } else {
        addToast({ type: 'error', title: 'Install failed', message: result.error || 'Unknown error' });
      }
    } catch {
      addToast({ type: 'error', title: 'Drop failed', message: 'Invalid card data' });
    }
  };

  const totalPortsFromCards = installedCards.reduce(
    (sum, c) => sum + c.portIds.length,
    0
  );

  return (
    <div className="p-5" data-testid="inventory-tab">
      <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        Hardware Inventory
      </div>

      {/* Chassis summary */}
      <div className="mb-2 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-tertiary px-3 py-2 text-center">
          <div className="text-lg font-bold text-text-primary">
            {installedCards.length}/{chassis.totalSlots}
          </div>
          <div className="text-xs text-text-tertiary">Slots Used</div>
        </div>
        <div className="rounded-lg bg-tertiary px-3 py-2 text-center">
          <div className="text-lg font-bold text-text-primary">
            {totalPortsFromCards}
          </div>
          <div className="text-xs text-text-tertiary">Card Ports</div>
        </div>
        {chassis.maxPower && (
          <div className="rounded-lg bg-tertiary px-3 py-2 text-center">
            <div className="text-lg font-bold text-text-primary">
              {chassis.maxPower}W
            </div>
            <div className="text-xs text-text-tertiary">Max Power</div>
          </div>
        )}
      </div>

      {/* Chassis info + reconfigure */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs text-text-tertiary">
          {chassis.description || `${chassis.totalSlots}-slot chassis`}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          data-testid="chassis-reconfigure-btn"
          onClick={() => {
            setChassisSlots(chassis.totalSlots);
            setChassisMaxPower(chassis.maxPower);
            setChassisDescription(chassis.description || '');
            setIsReconfiguring(true);
          }}
        >
          <Settings className="h-3.5 w-3.5" />
          Reconfigure
        </Button>
      </div>

      {/* Slot table */}
      <div className="space-y-2">
        {slots.map((slot) => (
          <div
            key={slot.number}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 transition-colors',
              slot.card
                ? 'border-border bg-tertiary'
                : dragOverSlot === slot.number
                  ? 'border-accent bg-accent/10'
                  : 'border-dashed border-border/50'
            )}
            {...(!slot.card ? {
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverSlot(slot.number); },
              onDragLeave: () => setDragOverSlot(null),
              onDrop: (e: React.DragEvent) => handleSlotDrop(slot.number, e),
            } : {})}
          >
            {/* Slot number */}
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-elevated text-xs font-bold text-text-secondary">
              {slot.number}
            </div>

            {slot.card && slot.cardDef ? (
              <>
                {/* Card info */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {slot.cardDef.name}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {slot.card.portIds.length} ports
                    {slot.cardDef.switchingCapacity
                      ? ` | ${slot.cardDef.switchingCapacity} Gbps`
                      : ''}
                  </div>
                </div>

                {/* Card actions */}
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => handleOpenSwapDialog(slot.card!.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-border hover:text-text-primary"
                    title="Swap card"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      handleRemoveCard(slot.card!.id, slot.number)
                    }
                    className="hover:bg-danger/10 flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:text-danger"
                    title="Remove card"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Empty slot — drop target */}
                <div className="min-w-0 flex-1 text-sm italic text-text-muted">
                  {dragOverSlot === slot.number ? 'Drop card here' : 'Empty slot'}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenAddDialog(slot.number)}
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  data-testid="inventory-add-card-btn"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add Card Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent hideClose>
          <DialogHeader>
            <DialogTitle>Install Card in Slot {addDialogSlot}</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {compatibleCards.length === 0 ? (
              <p className="text-sm text-text-muted">
                No compatible cards available for {node.type} nodes.
              </p>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Select Card Type
                </label>
                <Select value={selectedCardId} onValueChange={setSelectedCardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a card..." />
                  </SelectTrigger>
                  <SelectContent>
                    {compatibleCards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.name}
                        {card.switchingCapacity
                          ? ` (${card.switchingCapacity} Gbps)`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedCardId && (
                  <div className="mt-3 rounded-lg bg-tertiary p-3">
                    {(() => {
                      const card = compatibleCards.find(
                        (c) => c.id === selectedCardId
                      );
                      if (!card) return null;
                      return (
                        <div className="space-y-1 text-xs text-text-secondary">
                          <div>
                            <span className="font-medium">Ports:</span>{' '}
                            {card.portTemplate
                              .map(
                                (t) =>
                                  `${t.count}x ${t.dataRate} ${t.type.toUpperCase()}`
                              )
                              .join(', ')}
                          </div>
                          {card.powerConsumption && (
                            <div>
                              <span className="font-medium">Power:</span>{' '}
                              {card.powerConsumption}W
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInstallCard}
              disabled={!selectedCardId}
            >
              Install
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Swap Card Dialog */}
      <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
        <DialogContent hideClose>
          <DialogHeader>
            <DialogTitle>Swap Card</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Replace with
            </label>
            <Select value={swapTargetCardId} onValueChange={setSwapTargetCardId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a card..." />
              </SelectTrigger>
              <SelectContent>
                {compatibleCards.map((card) => (
                  <SelectItem key={card.id} value={card.id}>
                    {card.name}
                    {card.switchingCapacity
                      ? ` (${card.switchingCapacity} Gbps)`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSwapDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSwapCard}
              disabled={!swapTargetCardId}
            >
              Swap
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
