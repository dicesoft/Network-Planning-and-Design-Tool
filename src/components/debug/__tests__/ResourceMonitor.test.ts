import { describe, it, expect } from 'vitest';
import { checkAlerts, ALERT_THRESHOLDS } from '../ResourceMonitor';

describe('checkAlerts', () => {
  it('should return no alerts for healthy metrics', () => {
    const result = checkAlerts({
      timestamp: Date.now(),
      memoryPercent: 50,
      fps: 60,
      storagePercent: 30,
    });
    expect(result.lowFps).toBe(false);
    expect(result.highMemory).toBe(false);
    expect(result.highStorage).toBe(false);
  });

  it('should detect low FPS below threshold', () => {
    const result = checkAlerts({
      timestamp: Date.now(),
      memoryPercent: 50,
      fps: 20,
      storagePercent: 30,
    });
    expect(result.lowFps).toBe(true);
    expect(result.highMemory).toBe(false);
    expect(result.highStorage).toBe(false);
  });

  it('should not flag FPS=0 as low (not yet measured)', () => {
    const result = checkAlerts({
      timestamp: Date.now(),
      memoryPercent: 50,
      fps: 0,
      storagePercent: 30,
    });
    expect(result.lowFps).toBe(false);
  });

  it('should detect FPS exactly at threshold as not low', () => {
    const result = checkAlerts({
      timestamp: Date.now(),
      memoryPercent: 50,
      fps: ALERT_THRESHOLDS.FPS_LOW,
      storagePercent: 30,
    });
    expect(result.lowFps).toBe(false);
  });

  it('should detect high memory above threshold', () => {
    const result = checkAlerts({
      timestamp: Date.now(),
      memoryPercent: 85,
      fps: 60,
      storagePercent: 30,
    });
    expect(result.lowFps).toBe(false);
    expect(result.highMemory).toBe(true);
    expect(result.highStorage).toBe(false);
  });

  it('should detect memory exactly at threshold as not high', () => {
    const result = checkAlerts({
      timestamp: Date.now(),
      memoryPercent: ALERT_THRESHOLDS.MEMORY_HIGH,
      fps: 60,
      storagePercent: 30,
    });
    expect(result.highMemory).toBe(false);
  });

  it('should detect high localStorage above threshold', () => {
    const result = checkAlerts({
      timestamp: Date.now(),
      memoryPercent: 50,
      fps: 60,
      storagePercent: 90,
    });
    expect(result.lowFps).toBe(false);
    expect(result.highMemory).toBe(false);
    expect(result.highStorage).toBe(true);
  });

  it('should detect multiple alerts simultaneously', () => {
    const result = checkAlerts({
      timestamp: Date.now(),
      memoryPercent: 95,
      fps: 15,
      storagePercent: 85,
    });
    expect(result.lowFps).toBe(true);
    expect(result.highMemory).toBe(true);
    expect(result.highStorage).toBe(true);
  });
});
