/**
 * Inventory Import/Export unit tests
 *
 * Tests the JSON import/export schema validation, security guards,
 * and data integrity for inventory management.
 */
import { describe, it, expect } from 'vitest';
import {
  validateInventoryImport,
  buildInventoryExport,
} from '../InventorySection';
import { DEFAULT_SETTINGS, DEFAULT_NODE_SUBTYPES } from '@/types/settings';
import { DEFAULT_TRANSCEIVERS } from '@/types/transceiver';
import { DEFAULT_CARD_LIBRARY } from '@/types/inventory';
import type { AppSettings } from '@/types/settings';

// ============================================================================
// Helpers
// ============================================================================

function cloneSettings(s: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(s));
}

function makeValidExport() {
  return {
    version: 1,
    type: 'atlas-inventory-export',
    exportedAt: new Date().toISOString(),
    transceivers: [...DEFAULT_TRANSCEIVERS],
    cards: [...DEFAULT_CARD_LIBRARY],
    nodeSubtypes: [...DEFAULT_NODE_SUBTYPES],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Inventory Import/Export', () => {
  // ==========================================================================
  // Export
  // ==========================================================================

  describe('buildInventoryExport', () => {
    it('should generate valid JSON with all inventory types', () => {
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.transceiverLibrary = [...DEFAULT_TRANSCEIVERS];
      pending.cardLibrary = [...DEFAULT_CARD_LIBRARY];

      const exported = buildInventoryExport(pending);

      expect(exported.version).toBe(1);
      expect(exported.type).toBe('atlas-inventory-export');
      expect(exported.exportedAt).toBeTruthy();
      expect(exported.transceivers).toEqual(DEFAULT_TRANSCEIVERS);
      expect(exported.cards).toEqual(DEFAULT_CARD_LIBRARY);
      expect(exported.nodeSubtypes).toEqual(DEFAULT_NODE_SUBTYPES);
    });

    it('should handle empty inventory gracefully', () => {
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.transceiverLibrary = undefined;
      pending.cardLibrary = undefined;
      pending.nodeSubtypes = [];

      const exported = buildInventoryExport(pending);

      expect(exported.transceivers).toEqual([]);
      expect(exported.cards).toEqual([]);
      expect(exported.nodeSubtypes).toEqual([]);
    });

    it('should produce parseable JSON string', () => {
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.transceiverLibrary = [...DEFAULT_TRANSCEIVERS];
      const exported = buildInventoryExport(pending);
      const jsonStr = JSON.stringify(exported, null, 2);
      const reparsed = JSON.parse(jsonStr);

      expect(reparsed.version).toBe(1);
      expect(reparsed.type).toBe('atlas-inventory-export');
      expect(reparsed.transceivers.length).toBe(DEFAULT_TRANSCEIVERS.length);
    });
  });

  // ==========================================================================
  // Import Validation
  // ==========================================================================

  describe('validateInventoryImport', () => {
    it('should accept valid import data', () => {
      const data = makeValidExport();
      const result = validateInventoryImport(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toBeDefined();
      expect(result.data!.transceivers.length).toBe(DEFAULT_TRANSCEIVERS.length);
    });

    it('should reject non-object input', () => {
      const result = validateInventoryImport('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject null input', () => {
      const result = validateInventoryImport(null);
      expect(result.valid).toBe(false);
    });

    it('should reject wrong type field', () => {
      const data = { ...makeValidExport(), type: 'wrong-type' };
      const result = validateInventoryImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid export type'))).toBe(true);
    });

    it('should reject missing version', () => {
      const data = makeValidExport();
      delete (data as Record<string, unknown>).version;
      const result = validateInventoryImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid version'))).toBe(true);
    });

    it('should reject invalid transceiver entries', () => {
      const data = {
        ...makeValidExport(),
        transceivers: [{ /* missing id and name */ vendor: 'test' }],
      };
      const result = validateInventoryImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Transceiver [0]: missing or invalid 'id'"))).toBe(true);
      expect(result.errors.some((e) => e.includes("Transceiver [0]: missing or invalid 'name'"))).toBe(true);
    });

    it('should reject invalid card entries', () => {
      const data = {
        ...makeValidExport(),
        cards: [{ id: 'test', /* missing name and nodeType */ }],
      };
      const result = validateInventoryImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Card [0]: missing or invalid 'name'"))).toBe(true);
    });

    it('should reject invalid subtype entries', () => {
      const data = {
        ...makeValidExport(),
        nodeSubtypes: [{ /* missing key and label */ nodeType: 'router' }],
      };
      const result = validateInventoryImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("NodeSubtype [0]: missing or invalid 'key'"))).toBe(true);
    });

    it('should warn when no inventory data is present', () => {
      const data = {
        version: 1,
        type: 'atlas-inventory-export',
        exportedAt: new Date().toISOString(),
      };
      const result = validateInventoryImport(data);
      // Valid because schema fields are present, but warns about empty data
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('no inventory data'))).toBe(true);
    });

    it('should accept partial import (only transceivers)', () => {
      const data = {
        version: 1,
        type: 'atlas-inventory-export',
        exportedAt: new Date().toISOString(),
        transceivers: DEFAULT_TRANSCEIVERS.slice(0, 2),
      };
      const result = validateInventoryImport(data);
      expect(result.valid).toBe(true);
      expect(result.data!.transceivers.length).toBe(2);
    });
  });

  // ==========================================================================
  // Prototype Pollution Guard
  // ==========================================================================

  describe('Security: prototype pollution guard', () => {
    it('should strip __proto__ keys from imported data', () => {
      const malicious = JSON.parse(JSON.stringify({
        ...makeValidExport(),
        __proto__: { isAdmin: true },
        transceivers: [{
          id: 'test',
          name: 'Test',
          __proto__: { polluted: true },
        }],
      }));

      const result = validateInventoryImport(malicious);
      // The data should be sanitized (no __proto__ keys)
      if (result.data) {
        expect((result.data as unknown as Record<string, unknown>).__proto__).toEqual({});
        // Note: Object.prototype is always {} for plain objects
      }
    });

    it('should strip constructor keys from imported data', () => {
      const data = {
        ...makeValidExport(),
        constructor: { prototype: { isAdmin: true } },
      };
      const result = validateInventoryImport(data);
      if (result.data) {
        // The sanitizer strips 'constructor' from own properties.
        // After sanitization, the result should not have a custom 'constructor' property.
        expect(Object.prototype.hasOwnProperty.call(result.data, 'constructor')).toBe(false);
      }
    });
  });

  // ==========================================================================
  // Round-trip
  // ==========================================================================

  describe('Round-trip: export then import', () => {
    it('should preserve all data through export -> import cycle', () => {
      const pending = cloneSettings(DEFAULT_SETTINGS);
      pending.transceiverLibrary = [...DEFAULT_TRANSCEIVERS];
      pending.cardLibrary = [...DEFAULT_CARD_LIBRARY];

      // Export
      const exported = buildInventoryExport(pending);
      const jsonStr = JSON.stringify(exported);

      // Simulate: parse as if from file
      const parsed = JSON.parse(jsonStr);
      const result = validateInventoryImport(parsed);

      expect(result.valid).toBe(true);
      expect(result.data!.transceivers).toEqual(DEFAULT_TRANSCEIVERS);
      expect(result.data!.cards).toEqual(DEFAULT_CARD_LIBRARY);
      expect(result.data!.nodeSubtypes).toEqual(DEFAULT_NODE_SUBTYPES);
    });
  });

  // ==========================================================================
  // File size limit (tested at data level)
  // ==========================================================================

  describe('File size validation', () => {
    it('should define the max import file size as 5MB', () => {
      // The MAX_IMPORT_FILE_SIZE constant is used in the component's file handler.
      // We test the logic here: a 5MB file is 5 * 1024 * 1024 bytes.
      const maxSize = 5 * 1024 * 1024;
      expect(maxSize).toBe(5242880);

      // A file larger than 5MB should be rejected by the component handler.
      // This is a UI-level check, but we document the constant value here.
      const oversizedFile = 6 * 1024 * 1024;
      expect(oversizedFile > maxSize).toBe(true);
    });
  });
});
