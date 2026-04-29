import { describe, it, expect } from 'vitest';
import { SERVICE_PATH_STYLES } from '../service-path-styles';

describe('SERVICE_PATH_STYLES', () => {
  describe('working path', () => {
    it('uses blue color', () => {
      expect(SERVICE_PATH_STYLES.working.color).toBe('#3b82f6');
    });

    it('has weight 4', () => {
      expect(SERVICE_PATH_STYLES.working.weight).toBe(4);
    });

    it('is solid (no dash array)', () => {
      expect(SERVICE_PATH_STYLES.working.dashArray).toBeUndefined();
    });
  });

  describe('protection path', () => {
    it('uses green color', () => {
      expect(SERVICE_PATH_STYLES.protection.color).toBe('#22c55e');
    });

    it('has weight 3', () => {
      expect(SERVICE_PATH_STYLES.protection.weight).toBe(3);
    });

    it('is dashed with 8,4 pattern', () => {
      expect(SERVICE_PATH_STYLES.protection.dashArray).toBe('8,4');
    });
  });

  describe('working glow', () => {
    it('uses same blue color as working path', () => {
      expect(SERVICE_PATH_STYLES.workingGlow.color).toBe(SERVICE_PATH_STYLES.working.color);
    });

    it('has weight 8 (wider than working path)', () => {
      expect(SERVICE_PATH_STYLES.workingGlow.weight).toBe(8);
      expect(SERVICE_PATH_STYLES.workingGlow.weight).toBeGreaterThan(SERVICE_PATH_STYLES.working.weight);
    });

    it('has opacity 0.25', () => {
      expect(SERVICE_PATH_STYLES.workingGlow.opacity).toBe(0.25);
    });
  });

  describe('protection glow', () => {
    it('uses same green color as protection path', () => {
      expect(SERVICE_PATH_STYLES.protectionGlow.color).toBe(SERVICE_PATH_STYLES.protection.color);
    });

    it('has weight 7 (wider than protection path)', () => {
      expect(SERVICE_PATH_STYLES.protectionGlow.weight).toBe(7);
      expect(SERVICE_PATH_STYLES.protectionGlow.weight).toBeGreaterThan(SERVICE_PATH_STYLES.protection.weight);
    });

    it('has opacity 0.2', () => {
      expect(SERVICE_PATH_STYLES.protectionGlow.opacity).toBe(0.2);
    });
  });

  describe('cross-view consistency', () => {
    it('working and protection use different colors', () => {
      expect(SERVICE_PATH_STYLES.working.color).not.toBe(SERVICE_PATH_STYLES.protection.color);
    });

    it('working is heavier than protection', () => {
      expect(SERVICE_PATH_STYLES.working.weight).toBeGreaterThan(SERVICE_PATH_STYLES.protection.weight);
    });

    it('working is solid and protection is dashed for non-color distinction', () => {
      expect(SERVICE_PATH_STYLES.working.dashArray).toBeUndefined();
      expect(SERVICE_PATH_STYLES.protection.dashArray).toBeDefined();
    });
  });
});
