import React, { useMemo, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KEYBOARD_SHORTCUTS, ShortcutCategory } from '@/types/ui';
import { formatShortcutKey } from '@/lib/shortcutDispatcher';
import { cn } from '@/lib/utils';
import { Keyboard, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: 'General',
  tools: 'Tools',
  view: 'View',
  editing: 'Editing',
};

const CATEGORY_ORDER: ShortcutCategory[] = ['general', 'editing', 'tools', 'view'];

export const ShortcutsModal: React.FC = () => {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal = useUIStore((state) => state.closeModal);
  const [search, setSearch] = useState('');

  const isOpen = activeModal === 'shortcuts';

  // Group shortcuts by category, deduplicating by action (keep first occurrence)
  // Memoized with empty deps since KEYBOARD_SHORTCUTS is a static constant
  const grouped = useMemo(() => CATEGORY_ORDER.map((category) => {
    const seen = new Set<string>();
    const items = KEYBOARD_SHORTCUTS.filter((s) => {
      if (s.category !== category) return false;
      if (seen.has(s.action)) return false;
      seen.add(s.action);
      return true;
    });
    return { category, label: CATEGORY_LABELS[category], items };
  }).filter((g) => g.items.length > 0), []);

  // Filter by search query
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped
      .map((g) => ({
        ...g,
        items: g.items.filter((s) => {
          const bindings = KEYBOARD_SHORTCUTS.filter(
            (b) => b.action === s.action && b.category === s.category
          );
          const keyText = bindings.map((b) => formatShortcutKey(b)).join(' ');
          return (
            s.description.toLowerCase().includes(q) ||
            s.action.toLowerCase().includes(q) ||
            keyText.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [grouped, search]);

  const mouseControls = useMemo(() => {
    const items = [
      { label: 'Zoom in/out', key: 'Scroll wheel' },
      { label: 'Pan canvas', key: 'Middle-click drag' },
      { label: 'Box selection', key: 'Shift+drag' },
      { label: 'Add to selection', key: 'Ctrl+click' },
      { label: 'Quick add node', key: 'Double-click canvas' },
    ];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { closeModal(); setSearch(''); } }}>
      <DialogContent className="sm:max-w-[650px]" data-testid="shortcuts-modal">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-2">
          {/* Search filter */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              placeholder="Search shortcuts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 text-sm"
              data-testid="shortcuts-search"
            />
          </div>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {filteredGroups.map(({ category, label, items }) => (
              <div
                key={category}
                className="bg-secondary/30 rounded-lg border border-border p-3"
              >
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {label}
                </h3>
                <div className="space-y-0.5">
                  {items.map((shortcut, idx) => {
                    // Find all key bindings for this action
                    const bindings = KEYBOARD_SHORTCUTS.filter(
                      (s) => s.action === shortcut.action && s.category === category
                    );

                    return (
                      <div
                        key={shortcut.action}
                        className={cn(
                          'flex items-center justify-between gap-4 rounded-md px-3 py-1.5 text-sm',
                          shortcut.enabled
                            ? 'text-text-primary'
                            : 'text-text-muted opacity-50',
                          idx % 2 === 1 && 'bg-tertiary/30'
                        )}
                      >
                        <span className="min-w-0 shrink">
                          {shortcut.description}
                          {!shortcut.enabled && (
                            <span className="ml-2 text-xs italic text-text-tertiary">
                              Coming soon
                            </span>
                          )}
                        </span>
                        <div className="flex shrink-0 gap-1.5">
                          {bindings.map((binding, i) => (
                            <kbd
                              key={i}
                              className="inline-flex min-w-8 items-center justify-center rounded bg-tertiary px-2.5 py-1 font-mono text-xs"
                            >
                              {formatShortcutKey(binding)}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Mouse controls section */}
            {mouseControls.length > 0 && (
              <div className="bg-secondary/30 rounded-lg border border-border p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Mouse Controls
                </h3>
                <div className="space-y-0.5">
                  {mouseControls.map((item, idx) => (
                    <div
                      key={item.label}
                      className={cn(
                        'flex items-center justify-between gap-4 rounded-md px-3 py-1.5 text-sm text-text-secondary',
                        idx % 2 === 1 && 'bg-tertiary/30'
                      )}
                    >
                      <span>{item.label}</span>
                      <span className="shrink-0 text-xs text-text-tertiary">{item.key}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty search state */}
            {filteredGroups.length === 0 && mouseControls.length === 0 && (
              <div className="py-8 text-center text-sm text-text-muted">
                No shortcuts match &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
