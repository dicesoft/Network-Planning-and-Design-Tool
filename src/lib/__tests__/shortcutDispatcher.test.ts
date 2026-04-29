import { describe, it, expect } from 'vitest';
import { matchShortcut } from '../shortcutDispatcher';

/**
 * Helper to create a minimal KeyboardEvent-like object for testing.
 */
function createKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe('shortcutDispatcher', () => {
  describe('matchShortcut', () => {
    it('should match Ctrl+Z to undo', () => {
      const result = matchShortcut(createKeyEvent({ key: 'z', ctrlKey: true }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('undo');
    });

    it('should match Ctrl+Shift+Z to redo', () => {
      const result = matchShortcut(
        createKeyEvent({ key: 'z', ctrlKey: true, shiftKey: true })
      );
      expect(result).not.toBeNull();
      expect(result!.action).toBe('redo');
    });

    it('should match Ctrl+Y to redo', () => {
      const result = matchShortcut(createKeyEvent({ key: 'y', ctrlKey: true }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('redo');
    });

    it('should distinguish Ctrl+Z from Ctrl+Shift+Z', () => {
      const undo = matchShortcut(createKeyEvent({ key: 'z', ctrlKey: true }));
      const redo = matchShortcut(
        createKeyEvent({ key: 'z', ctrlKey: true, shiftKey: true })
      );
      expect(undo!.action).toBe('undo');
      expect(redo!.action).toBe('redo');
    });

    it('should match plain V to selectMode', () => {
      const result = matchShortcut(createKeyEvent({ key: 'v' }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('selectMode');
    });

    it('should match plain N to addMode', () => {
      const result = matchShortcut(createKeyEvent({ key: 'n' }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('addMode');
    });

    it('should match plain E to connectMode', () => {
      const result = matchShortcut(createKeyEvent({ key: 'e' }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('connectMode');
    });

    it('should match Delete to delete', () => {
      const result = matchShortcut(createKeyEvent({ key: 'Delete' }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('delete');
    });

    it('should match Escape to deselect', () => {
      const result = matchShortcut(createKeyEvent({ key: 'Escape' }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('deselect');
    });

    it('should match Ctrl+S to save', () => {
      const result = matchShortcut(createKeyEvent({ key: 's', ctrlKey: true }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('save');
    });

    it('should match Ctrl+= to zoomIn', () => {
      const result = matchShortcut(createKeyEvent({ key: '=', ctrlKey: true }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('zoomIn');
    });

    it('should match Ctrl+- to zoomOut', () => {
      const result = matchShortcut(createKeyEvent({ key: '-', ctrlKey: true }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('zoomOut');
    });

    it('should match Ctrl+0 to fitView', () => {
      const result = matchShortcut(createKeyEvent({ key: '0', ctrlKey: true }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('fitView');
    });

    it('should match ? to showShortcuts (Shift+/ produces key="?" with shiftKey=true)', () => {
      const result = matchShortcut(createKeyEvent({ key: '?', shiftKey: true }));
      expect(result).not.toBeNull();
      expect(result!.action).toBe('showShortcuts');
    });

    it('should skip disabled shortcuts (copy, paste)', () => {
      const copy = matchShortcut(createKeyEvent({ key: 'c', ctrlKey: true }));
      const paste = matchShortcut(createKeyEvent({ key: 'v', ctrlKey: true }));
      expect(copy).toBeNull();
      expect(paste).toBeNull();
    });

    it('should match Ctrl+D to duplicate (enabled)', () => {
      const duplicate = matchShortcut(createKeyEvent({ key: 'd', ctrlKey: true }));
      expect(duplicate).not.toBeNull();
      expect(duplicate!.action).toBe('duplicate');
    });

    it('should return null for unknown key combinations', () => {
      const result = matchShortcut(createKeyEvent({ key: 'x' }));
      expect(result).toBeNull();
    });

    it('should not match plain Z without Ctrl (no shortcut)', () => {
      const result = matchShortcut(createKeyEvent({ key: 'z' }));
      expect(result).toBeNull();
    });

    it('should be case-insensitive for letter keys', () => {
      const lower = matchShortcut(createKeyEvent({ key: 'v' }));
      const upper = matchShortcut(createKeyEvent({ key: 'V' }));
      expect(lower!.action).toBe('selectMode');
      expect(upper!.action).toBe('selectMode');
    });
  });
});
