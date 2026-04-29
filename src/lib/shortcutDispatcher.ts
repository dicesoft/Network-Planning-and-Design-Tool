import { KEYBOARD_SHORTCUTS, KeyboardShortcut } from '@/types/ui';

/** Friendly display names for special keys */
const KEY_DISPLAY_MAP: Record<string, string> = {
  Delete: 'Del',
  Backspace: 'Backspace',
  Escape: 'Esc',
  '=': '+',
  '-': '-',
  '0': '0',
  '?': '?',
};

/**
 * Format a shortcut's key + modifiers into a human-readable string.
 * e.g. { key: 'z', modifiers: ['ctrl', 'shift'] } → "Ctrl+Shift+Z"
 */
export function formatShortcutKey(shortcut: { key: string; modifiers?: string[] }): string {
  const parts: string[] = [];
  if (shortcut.modifiers?.includes('ctrl') || shortcut.modifiers?.includes('meta')) {
    parts.push('Ctrl');
  }
  if (shortcut.modifiers?.includes('shift')) {
    parts.push('Shift');
  }
  if (shortcut.modifiers?.includes('alt')) {
    parts.push('Alt');
  }

  const displayKey = KEY_DISPLAY_MAP[shortcut.key] ?? shortcut.key.toUpperCase();
  parts.push(displayKey);

  return parts.join('+');
}

/**
 * Match a keyboard event against the defined shortcuts.
 * Returns the first matching enabled shortcut, or null if no match.
 */
export function matchShortcut(event: KeyboardEvent): KeyboardShortcut | null {
  const { key, ctrlKey, metaKey, shiftKey, altKey } = event;
  const mod = ctrlKey || metaKey;

  for (const shortcut of KEYBOARD_SHORTCUTS) {
    if (!shortcut.enabled) continue;

    // Check modifiers
    const requiresCtrl = shortcut.modifiers?.includes('ctrl') || shortcut.modifiers?.includes('meta');
    const requiresShift = shortcut.modifiers?.includes('shift') ?? false;
    const requiresAlt = shortcut.modifiers?.includes('alt') ?? false;

    if (!!requiresCtrl !== mod) continue;

    // For keys that are themselves shift-produced characters (like ? ! + @),
    // don't enforce shiftKey matching since the browser always sets shiftKey: true
    const isShiftProducedChar =
      shortcut.key.length === 1 && /[^a-z0-9\-=[\]\\;',./`]/.test(shortcut.key);
    if (!isShiftProducedChar && requiresShift !== shiftKey) continue;

    if (requiresAlt !== altKey) continue;

    // Check key (case-insensitive for letters, exact for special keys)
    if (key.length === 1) {
      if (key.toLowerCase() !== shortcut.key.toLowerCase()) continue;
    } else {
      if (key !== shortcut.key) continue;
    }

    return shortcut;
  }

  return null;
}
