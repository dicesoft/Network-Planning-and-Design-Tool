import React from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CardDefinition } from '@/types/inventory';
import { GripVertical } from 'lucide-react';

const NODE_TYPE_LABELS: Record<string, string> = {
  router: 'Router',
  switch: 'Switch',
  oadm: 'OADM',
  terminal: 'Terminal',
  amplifier: 'Amplifier',
  custom: 'Custom',
};

function formatPortSummary(card: CardDefinition): string {
  return card.portTemplate
    .map((t) => `${t.count}x${t.dataRate} ${t.type.toUpperCase()}`)
    .join(', ');
}

export const HardwarePanel: React.FC = () => {
  const cardLibrary = useSettingsStore((state) => state.settings.cardLibrary) || [];

  // Group cards by nodeType
  const grouped = cardLibrary.reduce<Record<string, CardDefinition[]>>((acc, card) => {
    const key = card.nodeType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(card);
    return acc;
  }, {});

  const groupEntries = Object.entries(grouped);

  if (groupEntries.length === 0) {
    return (
      <div className="p-2 text-xs text-text-muted" data-testid="hardware-panel">
        No cards in library. Add cards in Settings.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="hardware-panel">
      {groupEntries.map(([nodeType, cards]) => (
        <div key={nodeType}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
            {NODE_TYPE_LABELS[nodeType] || nodeType}
          </div>
          <div className="space-y-1">
            {cards.map((card) => (
              <div
                key={card.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/atlas-card', JSON.stringify(card));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="border-border/50 hover:border-accent/50 hover:bg-tertiary/80 flex cursor-grab items-center gap-2 rounded-md border bg-tertiary px-2 py-1.5 text-xs transition-colors active:cursor-grabbing"
                data-testid={`hardware-card-${card.id}`}
              >
                <GripVertical className="h-3 w-3 shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-text-primary">{card.name}</div>
                  <div className="text-text-tertiary">{formatPortSummary(card)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
