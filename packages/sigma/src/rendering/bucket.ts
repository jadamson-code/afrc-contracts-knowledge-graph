/**
 * Sigma.js Bucket Class
 * ======================
 *
 * A bucket is a collection of items (nodes or edges) at a specific zIndex level
 * for a specific program type. Buckets enable efficient dirty-flag optimization
 * for depth-sorted rendering.
 * @module
 */

export const SAFETY_CAPACITY = 5;

/**
 * Clamps a zIndex value to the valid range [0, maxDepthLevels-1]
 */
export function clampZIndex(zIndex: number, maxDepthLevels: number): number {
  return Math.max(0, Math.min(maxDepthLevels - 1, Math.floor(zIndex)));
}

/**
 * Type for the function that processes an item and writes its data to the Float32Array
 */
export type ProcessItemFunction = (key: string, startIndex: number, array: Float32Array) => void;

/**
 * Bucket class for managing a collection of items at a specific depth level.
 *
 * Each bucket maintains:
 * - A set of item keys
 * - A Float32Array for GPU buffer data
 * - A dirty flag for rebuild optimization
 */
export class Bucket {
  /** Set of item keys in this bucket */
  private items: Set<string> = new Set();

  /** Float32Array containing the GPU buffer data */
  private array: Float32Array = new Float32Array(0);

  /** Flag indicating if the bucket needs to be rebuilt */
  private dirty: boolean = false;

  /** Number of floats per item (stride) */
  private stride: number;

  /**
   * Current allocated capacity (number of items the array can hold).
   * This may be larger than the actual item count to reduce reallocations.
   * The array will be resized when:
   * - itemCount > capacity (need more space)
   * - itemCount < capacity / 4 (shrink to save memory)
   * - itemCount === 0 (free memory entirely)
   */
  private capacity: number = 0;

  constructor(stride: number) {
    this.stride = stride;
  }

  /**
   * Returns true if the bucket needs to be rebuilt
   */
  get isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Returns the number of items in the bucket
   */
  get count(): number {
    return this.items.size;
  }

  /**
   * Returns the Float32Array containing the buffer data
   */
  getFloatArray(): Float32Array {
    return this.array;
  }

  /**
   * Returns a copy of the item keys set
   */
  getItems(): Set<string> {
    return new Set(this.items);
  }

  /**
   * Checks if an item is in this bucket
   */
  hasItem(key: string): boolean {
    return this.items.has(key);
  }

  /**
   * Adds an item to the bucket and marks it as dirty
   */
  addItem(key: string): void {
    if (!this.items.has(key)) {
      this.items.add(key);
      this.dirty = true;
    }
  }

  /**
   * Removes an item from the bucket and marks it as dirty
   */
  removeItem(key: string): void {
    if (this.items.has(key)) {
      this.items.delete(key);
      this.dirty = true;
    }
  }

  /**
   * Marks an item for update (marks bucket as dirty).
   * Use this when item attributes change but zIndex stays the same.
   */
  updateItem(key: string): void {
    if (this.items.has(key)) {
      this.dirty = true;
    }
  }

  /**
   * Clears all items from the bucket and marks it as dirty
   */
  clear(): void {
    if (this.items.size > 0) {
      this.items.clear();
      this.dirty = true;
    }
  }

  /**
   * Marks the bucket as dirty, forcing a rebuild on next render
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Rebuilds the Float32Array from the current items.
   * This compacts the buffer (no holes) and clears the dirty flag.
   *
   * @param processItem - Function that writes item data to the array at the given index
   */
  rebuild(processItem: ProcessItemFunction): void {
    const itemCount = this.items.size;

    // Reallocate if needed
    if (itemCount === 0) {
      // Free memory when empty
      this.capacity = 0;
      this.array = new Float32Array(0);
    } else if (itemCount > this.capacity || itemCount < this.capacity / 4) {
      // Use some buffer space to avoid frequent reallocations
      this.capacity = itemCount + SAFETY_CAPACITY;
      this.array = new Float32Array(this.capacity * this.stride);
    }

    // Process each item
    let index = 0;
    for (const key of this.items) {
      processItem(key, index * this.stride, this.array);
      index++;
    }

    this.dirty = false;
  }

  /**
   * Clears the dirty flag without rebuilding.
   * Use with caution - only when you know the data is up to date.
   */
  clearDirtyFlag(): void {
    this.dirty = false;
  }

  /**
   * Returns memory usage stats for this bucket.
   */
  getMemoryStats(): { itemCount: number; capacity: number; stride: number; totalBytes: number } {
    return {
      itemCount: this.items.size,
      capacity: this.capacity,
      stride: this.stride,
      totalBytes: this.array.byteLength,
    };
  }
}

/**
 * BucketCollection manages buckets organized by [programType][zIndex].
 * This provides O(1) bucket lookup and efficient iteration by depth order.
 */
export class BucketCollection {
  /** Map of programType -> array of buckets indexed by zIndex */
  private buckets: Map<string, Bucket[]> = new Map();

  /** Stride (floats per item) for each program type */
  private strides: Map<string, number> = new Map();

  /** Maximum number of depth levels */
  private maxDepthLevels: number;

  constructor(maxDepthLevels: number) {
    this.maxDepthLevels = maxDepthLevels;
  }

  /**
   * Gets the current maximum depth levels
   */
  getMaxDepthLevels(): number {
    return this.maxDepthLevels;
  }

  /**
   * Updates the maximum depth levels and resizes all bucket arrays.
   * Items in buckets beyond the new max will be moved to the highest bucket.
   */
  setMaxDepthLevels(maxDepthLevels: number): void {
    if (maxDepthLevels === this.maxDepthLevels) return;

    const oldMax = this.maxDepthLevels;
    this.maxDepthLevels = maxDepthLevels;

    for (const [programType, programBuckets] of this.buckets) {
      const stride = this.strides.get(programType) || 1;

      if (maxDepthLevels > oldMax) {
        // Add new buckets
        for (let z = oldMax; z < maxDepthLevels; z++) {
          programBuckets.push(new Bucket(stride));
        }
      } else {
        // Move items from removed buckets to the highest remaining bucket
        const highestBucket = programBuckets[maxDepthLevels - 1];
        for (let z = maxDepthLevels; z < oldMax; z++) {
          const bucket = programBuckets[z];
          for (const key of bucket.getItems()) {
            highestBucket.addItem(key);
          }
        }
        // Remove excess buckets
        programBuckets.length = maxDepthLevels;
      }
    }
  }

  /**
   * Registers a program type with its stride
   */
  registerProgram(programType: string, stride: number): void {
    if (!this.buckets.has(programType)) {
      this.strides.set(programType, stride);
      const programBuckets: Bucket[] = [];
      for (let z = 0; z < this.maxDepthLevels; z++) {
        programBuckets.push(new Bucket(stride));
      }
      this.buckets.set(programType, programBuckets);
    }
  }

  /**
   * Gets the bucket for a specific program type and zIndex
   */
  getBucket(programType: string, zIndex: number): Bucket | null {
    const programBuckets = this.buckets.get(programType);
    if (!programBuckets) return null;

    const clampedZ = clampZIndex(zIndex, this.maxDepthLevels);
    return programBuckets[clampedZ];
  }

  /**
   * Adds an item to the appropriate bucket
   */
  addItem(programType: string, zIndex: number, key: string): void {
    const bucket = this.getBucket(programType, zIndex);
    if (bucket) {
      bucket.addItem(key);
    }
  }

  /**
   * Removes an item from a bucket
   */
  removeItem(programType: string, zIndex: number, key: string): void {
    const bucket = this.getBucket(programType, zIndex);
    if (bucket) {
      bucket.removeItem(key);
    }
  }

  /**
   * Moves an item between buckets.
   * Supports both zIndex changes and program type changes.
   */
  moveItem(oldProgramType: string, oldZIndex: number, newProgramType: string, newZIndex: number, key: string): void {
    this.removeItem(oldProgramType, oldZIndex, key);
    this.addItem(newProgramType, newZIndex, key);
  }

  /**
   * Updates an item's attributes (marks the containing bucket as dirty)
   */
  updateItem(programType: string, zIndex: number, key: string): void {
    const bucket = this.getBucket(programType, zIndex);
    if (bucket) {
      bucket.updateItem(key);
    }
  }

  /**
   * Clears all buckets for a program type
   */
  clearProgram(programType: string): void {
    const programBuckets = this.buckets.get(programType);
    if (programBuckets) {
      for (const bucket of programBuckets) {
        bucket.clear();
      }
    }
  }

  /**
   * Clears all buckets
   */
  clearAll(): void {
    for (const [programType] of this.buckets) {
      this.clearProgram(programType);
    }
  }

  /**
   * Iterates over all buckets in zIndex order (back-to-front).
   * Calls the callback for each non-empty bucket.
   */
  forEachBucketByZIndex(callback: (programType: string, zIndex: number, bucket: Bucket) => void): void {
    for (let z = 0; z < this.maxDepthLevels; z++) {
      for (const [programType, programBuckets] of this.buckets) {
        const bucket = programBuckets[z];
        if (bucket.count > 0) {
          callback(programType, z, bucket);
        }
      }
    }
  }

  /**
   * Rebuilds all dirty buckets
   */
  rebuildDirtyBuckets(getProcessItem: (programType: string) => ProcessItemFunction): void {
    for (const [programType, programBuckets] of this.buckets) {
      // Only create processItem function if at least one bucket is dirty
      let processItem: ProcessItemFunction | null = null;
      for (const bucket of programBuckets) {
        if (bucket.isDirty) {
          if (!processItem) {
            processItem = getProcessItem(programType);
          }
          bucket.rebuild(processItem);
        }
      }
    }
  }

  /**
   * Returns all registered program types
   */
  getProgramTypes(): string[] {
    return Array.from(this.buckets.keys());
  }

  /**
   * Checks if any bucket is dirty
   */
  hasDirtyBuckets(): boolean {
    for (const [, programBuckets] of this.buckets) {
      for (const bucket of programBuckets) {
        if (bucket.isDirty) return true;
      }
    }
    return false;
  }

  /**
   * Returns memory stats for all non-empty buckets.
   */
  getMemoryStats(): { programType: string; zIndex: number; itemCount: number; capacity: number; stride: number; totalBytes: number }[] {
    const stats: { programType: string; zIndex: number; itemCount: number; capacity: number; stride: number; totalBytes: number }[] = [];
    for (const [programType, programBuckets] of this.buckets) {
      for (let z = 0; z < programBuckets.length; z++) {
        const bucket = programBuckets[z];
        if (bucket.count > 0) {
          stats.push({ programType, zIndex: z, ...bucket.getMemoryStats() });
        }
      }
    }
    return stats;
  }
}
