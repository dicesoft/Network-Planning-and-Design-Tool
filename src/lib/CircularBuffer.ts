/**
 * Fixed-capacity circular buffer for time-series data.
 * When full, new entries overwrite the oldest.
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;   // next write position
  private count = 0;  // current number of stored entries
  readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) throw new Error('CircularBuffer capacity must be >= 1');
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /** Push a value, overwriting the oldest if at capacity. */
  push(value: T): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /** Return all stored values in insertion order (oldest first). */
  toArray(): T[] {
    if (this.count === 0) return [];
    const result: T[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      result.push(this.buffer[idx] as T);
    }
    return result;
  }

  /** Get the most recently pushed value, or undefined if empty. */
  last(): T | undefined {
    if (this.count === 0) return undefined;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[idx];
  }

  /** Current number of stored entries. */
  get size(): number {
    return this.count;
  }

  /** Whether the buffer has reached capacity. */
  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /** Remove all stored entries. */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }
}
