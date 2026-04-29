/**
 * Modal Registry Contract Test (T019 / US1)
 *
 * Enumerates every value of `ModalType` and asserts that App.tsx (or a
 * documented secondary mount file for inline-mounted modals) contains a
 * corresponding renderer. This protects against drift where a modal type
 * is added to MODAL_TYPES without a matching consumer being mounted.
 *
 * See: specs/001-app-improvements-apr2026/contracts/modal-registry.contract.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MODAL_TYPES } from '@/types/ui';

// Mapping: modal type → { component name to grep for, file relative to project root }
// Most modals are mounted in App.tsx. A few legacy primitives (settings,
// confirm-dialog, alert-dialog) are inline-mounted by their host components
// — those entries point to the host file instead.
const REGISTRY: Record<(typeof MODAL_TYPES)[number], { component: string; file: string }> = {
  'add-node': { component: 'AddNodeModal', file: 'src/App.tsx' },
  'edit-service': { component: 'ServiceEditModal', file: 'src/App.tsx' },
  'service-wizard': { component: 'ServiceWizard', file: 'src/App.tsx' },
  import: { component: 'ImportModal', file: 'src/App.tsx' },
  export: { component: 'ExportModal', file: 'src/App.tsx' },
  shortcuts: { component: 'ShortcutsModal', file: 'src/App.tsx' },
  'confirm-delete': { component: 'ConfirmDeleteModal', file: 'src/App.tsx' },
  'select-ports': { component: 'SelectPortsModal', file: 'src/App.tsx' },
  wiki: { component: 'WikiModal', file: 'src/App.tsx' },
  // Inline-mounted legacy primitives (managed by host components, not openModal flow)
  settings: { component: 'SettingsDialog', file: 'src/components/layout/Header.tsx' },
  'confirm-dialog': { component: 'ConfirmDialog', file: 'src/components/services/ServiceInspector.tsx' },
  'alert-dialog': { component: 'AlertDialog', file: 'src/components/services/ServiceInspector.tsx' },
};

const PROJECT_ROOT = resolve(__dirname, '../../..');
const fileCache = new Map<string, string>();
function readFile(rel: string): string {
  if (!fileCache.has(rel)) {
    fileCache.set(rel, readFileSync(resolve(PROJECT_ROOT, rel), 'utf-8'));
  }
  return fileCache.get(rel)!;
}

describe('Modal Registry — every ModalType has a mounted consumer', () => {
  it('registry covers every value of ModalType', () => {
    for (const type of MODAL_TYPES) {
      expect(REGISTRY[type], `Missing REGISTRY entry for ModalType "${type}"`).toBeDefined();
    }
  });

  it.each(MODAL_TYPES)(
    'modal type "%s" has a mounted renderer in its registered file',
    (type) => {
      const entry = REGISTRY[type];
      const source = readFile(entry.file);
      // Look for either a JSX self-closing tag or an opening tag for the component
      const jsxPattern = new RegExp(`<${entry.component}[\\s/>]`);
      expect(
        jsxPattern.test(source),
        `Modal type "${type}" expected component <${entry.component} /> in ${entry.file}, but it was not found.`
      ).toBe(true);
    }
  );
});
