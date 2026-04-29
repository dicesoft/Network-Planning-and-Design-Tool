import { describe, it, expect } from 'vitest';
import { CircularBuffer } from '../CircularBuffer';

describe('CircularBuffer', () => {
  it('should create an empty buffer with given capacity', () => {
    const buf = new CircularBuffer<number>(5);
    expect(buf.size).toBe(0);
    expect(buf.capacity).toBe(5);
    expect(buf.isFull).toBe(false);
    expect(buf.toArray()).toEqual([]);
    expect(buf.last()).toBeUndefined();
  });

  it('should throw on invalid capacity', () => {
    expect(() => new CircularBuffer<number>(0)).toThrow('capacity must be >= 1');
    expect(() => new CircularBuffer<number>(-1)).toThrow('capacity must be >= 1');
  });

  it('should push and retrieve values in order', () => {
    const buf = new CircularBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.size).toBe(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
    expect(buf.last()).toBe(3);
  });

  it('should report isFull correctly', () => {
    const buf = new CircularBuffer<number>(3);
    buf.push(1);
    expect(buf.isFull).toBe(false);
    buf.push(2);
    expect(buf.isFull).toBe(false);
    buf.push(3);
    expect(buf.isFull).toBe(true);
  });

  it('should wrap correctly when exceeding capacity', () => {
    const buf = new CircularBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);

    buf.push(4); // overwrites 1
    expect(buf.size).toBe(3);
    expect(buf.toArray()).toEqual([2, 3, 4]);
    expect(buf.last()).toBe(4);

    buf.push(5); // overwrites 2
    expect(buf.toArray()).toEqual([3, 4, 5]);

    buf.push(6); // overwrites 3
    expect(buf.toArray()).toEqual([4, 5, 6]);
  });

  it('should handle wrapping with capacity=1', () => {
    const buf = new CircularBuffer<string>(1);
    buf.push('a');
    expect(buf.toArray()).toEqual(['a']);
    expect(buf.last()).toBe('a');

    buf.push('b');
    expect(buf.toArray()).toEqual(['b']);
    expect(buf.last()).toBe('b');
    expect(buf.size).toBe(1);
  });

  it('should wrap correctly at large multiples of capacity', () => {
    const buf = new CircularBuffer<number>(3);
    // Push 10 items into capacity-3 buffer
    for (let i = 1; i <= 10; i++) {
      buf.push(i);
    }
    expect(buf.size).toBe(3);
    expect(buf.toArray()).toEqual([8, 9, 10]);
    expect(buf.last()).toBe(10);
  });

  it('should clear all entries', () => {
    const buf = new CircularBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.size).toBe(3);

    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.isFull).toBe(false);
    expect(buf.toArray()).toEqual([]);
    expect(buf.last()).toBeUndefined();
  });

  it('should work after clear and re-push', () => {
    const buf = new CircularBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.clear();

    buf.push(10);
    buf.push(20);
    expect(buf.toArray()).toEqual([10, 20]);
    expect(buf.last()).toBe(20);
    expect(buf.size).toBe(2);
  });

  it('should handle object values', () => {
    const buf = new CircularBuffer<{ ts: number; val: string }>(2);
    buf.push({ ts: 1, val: 'a' });
    buf.push({ ts: 2, val: 'b' });
    buf.push({ ts: 3, val: 'c' });
    expect(buf.toArray()).toEqual([
      { ts: 2, val: 'b' },
      { ts: 3, val: 'c' },
    ]);
  });

  it('should match 60-entry capacity for time-series use case', () => {
    const buf = new CircularBuffer<number>(60);
    // Fill exactly to capacity
    for (let i = 0; i < 60; i++) {
      buf.push(i);
    }
    expect(buf.size).toBe(60);
    expect(buf.isFull).toBe(true);
    expect(buf.toArray()[0]).toBe(0);
    expect(buf.toArray()[59]).toBe(59);

    // Push one more — oldest drops
    buf.push(60);
    expect(buf.size).toBe(60);
    expect(buf.toArray()[0]).toBe(1);
    expect(buf.toArray()[59]).toBe(60);
  });
});
