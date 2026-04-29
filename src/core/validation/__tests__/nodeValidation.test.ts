import { describe, it, expect } from 'vitest';
import {
  validateNodeLocation,
  validateNodeName,
  validateNodePosition,
  validateNetworkNode,
  calculateGeoDistance,
  areNodesColocated,
} from '../nodeValidation';
import { NodeLocation, NetworkNode } from '@/types';

describe('nodeValidation', () => {
  describe('validateNodeLocation', () => {
    it('should validate complete valid location', () => {
      const location: NodeLocation = {
        latitude: 40.7128,
        longitude: -74.006,
        address: '123 Main St',
        building: 'Data Center A',
        floor: '3',
        room: 'Server Room 1',
        installationType: 'indoor',
      };

      const result = validateNodeLocation(location);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate empty location', () => {
      const result = validateNodeLocation({});
      expect(result.valid).toBe(true);
    });

    it('should error on invalid latitude', () => {
      const location: NodeLocation = {
        latitude: 95, // Invalid: > 90
        longitude: -74.006,
      };

      const result = validateNodeLocation(location);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Latitude'))).toBe(true);
    });

    it('should error on invalid longitude', () => {
      const location: NodeLocation = {
        latitude: 40.7128,
        longitude: -200, // Invalid: < -180
      };

      const result = validateNodeLocation(location);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Longitude'))).toBe(true);
    });

    it('should warn on partial coordinates', () => {
      const location: NodeLocation = {
        latitude: 40.7128,
        // longitude missing
      };

      const result = validateNodeLocation(location);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('Both latitude and longitude'))).toBe(true);
    });

    it('should warn on very long address', () => {
      const location: NodeLocation = {
        address: 'A'.repeat(600),
      };

      const result = validateNodeLocation(location);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('unusually long'))).toBe(true);
    });

    it('should warn on unusual floor number', () => {
      const location: NodeLocation = {
        floor: '250',
      };

      const result = validateNodeLocation(location);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('seems unusual'))).toBe(true);
    });

    it('should accept basement floor numbers', () => {
      const location: NodeLocation = {
        floor: '-5',
      };

      const result = validateNodeLocation(location);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should error on invalid installation type', () => {
      const location = {
        installationType: 'invalid-type',
      } as unknown as NodeLocation;

      const result = validateNodeLocation(location);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid installation type'))).toBe(true);
    });
  });

  describe('validateNodeName', () => {
    it('should validate valid name', () => {
      const result = validateNodeName('Router-NYC-01');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on empty name', () => {
      const result = validateNodeName('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Node name is required');
    });

    it('should error on whitespace-only name', () => {
      const result = validateNodeName('   ');
      expect(result.valid).toBe(false);
    });

    it('should warn on very long name', () => {
      const result = validateNodeName('A'.repeat(120));
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('unusually long'))).toBe(true);
    });

    it('should warn on very short name', () => {
      const result = validateNodeName('A');
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('very short'))).toBe(true);
    });

    it('should warn on special characters', () => {
      const result = validateNodeName('Router<test>');
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('special characters'))).toBe(true);
    });
  });

  describe('validateNodePosition', () => {
    it('should validate valid position', () => {
      const result = validateNodePosition({ x: 100, y: 200 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on NaN coordinates', () => {
      const result = validateNodePosition({ x: NaN, y: 100 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('valid numbers'))).toBe(true);
    });

    it('should warn on out-of-bounds position', () => {
      const result = validateNodePosition({ x: 50000, y: 200 });
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('outside typical canvas bounds'))).toBe(true);
    });

    it('should respect custom canvas bounds', () => {
      const result = validateNodePosition(
        { x: 500, y: 500 },
        { minX: 0, maxX: 400, minY: 0, maxY: 400 }
      );
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('outside'))).toBe(true);
    });
  });

  describe('validateNetworkNode', () => {
    const validNode: NetworkNode = {
      id: 'node-001',
      name: 'Router-NYC',
      type: 'router',
      vendor: 'cisco',
      position: { x: 100, y: 200 },
      stacks: [],
      metadata: {},
    };

    it('should validate complete valid node', () => {
      const result = validateNetworkNode(validNode);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate node with location', () => {
      const nodeWithLocation: NetworkNode = {
        ...validNode,
        location: {
          latitude: 40.7128,
          longitude: -74.006,
          installationType: 'indoor',
        },
      };

      const result = validateNetworkNode(nodeWithLocation);
      expect(result.valid).toBe(true);
    });

    it('should aggregate errors from all validations', () => {
      const invalidNode: NetworkNode = {
        ...validNode,
        id: '',
        name: '',
        location: {
          latitude: 95, // Invalid
        },
      };

      const result = validateNetworkNode(invalidNode);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('calculateGeoDistance', () => {
    it('should calculate distance between two points', () => {
      const nyc: NodeLocation = { latitude: 40.7128, longitude: -74.006 };
      const la: NodeLocation = { latitude: 34.0522, longitude: -118.2437 };

      const distance = calculateGeoDistance(nyc, la);
      expect(distance).not.toBeNull();
      // NYC to LA is approximately 3944 km
      expect(distance).toBeGreaterThan(3900);
      expect(distance).toBeLessThan(4000);
    });

    it('should return null for incomplete coordinates', () => {
      const partial: NodeLocation = { latitude: 40.7128 };
      const complete: NodeLocation = { latitude: 34.0522, longitude: -118.2437 };

      const distance = calculateGeoDistance(partial, complete);
      expect(distance).toBeNull();
    });

    it('should return 0 for same location', () => {
      const location: NodeLocation = { latitude: 40.7128, longitude: -74.006 };

      const distance = calculateGeoDistance(location, location);
      expect(distance).toBeCloseTo(0, 5);
    });
  });

  describe('areNodesColocated', () => {
    it('should return true for same location', () => {
      const location: NodeLocation = { latitude: 40.7128, longitude: -74.006 };

      const result = areNodesColocated(location, location);
      expect(result).toBe(true);
    });

    it('should return true for nearby locations within tolerance', () => {
      const loc1: NodeLocation = { latitude: 40.7128, longitude: -74.006 };
      const loc2: NodeLocation = { latitude: 40.7129, longitude: -74.0061 }; // ~15m away

      const result = areNodesColocated(loc1, loc2, 0.1); // 100m tolerance
      expect(result).toBe(true);
    });

    it('should return false for distant locations', () => {
      const nyc: NodeLocation = { latitude: 40.7128, longitude: -74.006 };
      const la: NodeLocation = { latitude: 34.0522, longitude: -118.2437 };

      const result = areNodesColocated(nyc, la);
      expect(result).toBe(false);
    });

    it('should return false for incomplete coordinates', () => {
      const partial: NodeLocation = { latitude: 40.7128 };
      const complete: NodeLocation = { latitude: 40.7128, longitude: -74.006 };

      const result = areNodesColocated(partial, complete);
      expect(result).toBe(false);
    });
  });
});
