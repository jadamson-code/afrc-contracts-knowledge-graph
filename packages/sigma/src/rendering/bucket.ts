/**
 * Sigma.js Bucket Class
 * ======================
 *
 * A bucket is a collection of items (nodes or edges) at a specific zIndex level.
 * Buckets enable efficient dirty-flag optimization for depth-sorted rendering.
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
}

/**
 * BucketCollection manages buckets indexed by zIndex.
 * This provides O(1) bucket lookup and efficient iteration by depth order.
 */
export class BucketCollection {
  /** Array of buckets indexed by zIndex */
  private buckets: Bucket[];

  /** Stride (floats per item) */
  private stride: number;

  /** Maximum number of depth levels */
  private maxDepthLevels: number;

  constructor(maxDepthLevels: number, stride: number = 1) {
    this.maxDepthLevels = maxDepthLevels;
    this.stride = stride;
    this.buckets = [];
    for (let z = 0; z < maxDepthLevels; z++) {
      this.buckets.push(new Bucket(stride));
    }
  }

  /**
   * Gets the current maximum depth levels
   */
  getMaxDepthLevels(): number {
    return this.maxDepthLevels;
  }

  /**
   * Updates the maximum depth levels and resizes the bucket array.
   * Items in buckets beyond the new max will be moved to the highest bucket.
   */
  setMaxDepthLevels(maxDepthLevels: number): void {
    if (maxDepthLevels === this.maxDepthLevels) return;

    const oldMax = this.maxDepthLevels;
    this.maxDepthLevels = maxDepthLevels;

    if (maxDepthLevels > oldMax) {
      // Add new buckets
      for (let z = oldMax; z < maxDepthLevels; z++) {
        this.buckets.push(new Bucket(this.stride));
      }
    } else {
      // Move items from removed buckets to the highest remaining bucket
      const highestBucket = this.buckets[maxDepthLevels - 1];
      for (let z = maxDepthLevels; z < oldMax; z++) {
        const bucket = this.buckets[z];
        for (const key of bucket.getItems()) {
          highestBucket.addItem(key);
        }
      }
      // Remove excess buckets
      this.buckets.length = maxDepthLevels;
    }
  }

  /**
   * Gets the bucket for a specific zIndex
   */
  getBucket(zIndex: number): Bucket | null {
    const clampedZ = clampZIndex(zIndex, this.maxDepthLevels);
    return this.buckets[clampedZ];
  }

  /**
   * Adds an item to the appropriate bucket
   */
  addItem(zIndex: number, key: string): void {
    const bucket = this.getBucket(zIndex);
    if (bucket) {
      bucket.addItem(key);
    }
  }

  /**
   * Removes an item from a bucket
   */
  removeItem(zIndex: number, key: string): void {
    const bucket = this.getBucket(zIndex);
    if (bucket) {
      bucket.removeItem(key);
    }
  }

  /**
   * Moves an item between buckets (zIndex change).
   */
  moveItem(oldZIndex: number, newZIndex: number, key: string): void {
    this.removeItem(oldZIndex, key);
    this.addItem(newZIndex, key);
  }

  /**
   * Updates an item's attributes (marks the containing bucket as dirty)
   */
  updateItem(zIndex: number, key: string): void {
    const bucket = this.getBucket(zIndex);
    if (bucket) {
      bucket.updateItem(key);
    }
  }

  /**
   * Clears all buckets
   */
  clearAll(): void {
    for (const bucket of this.buckets) {
      bucket.clear();
    }
  }

  /**
   * Iterates over all buckets in zIndex order (back-to-front).
   * Calls the callback for each non-empty bucket.
   */
  forEachBucketByZIndex(callback: (zIndex: number, bucket: Bucket) => void): void {
    for (let z = 0; z < this.maxDepthLevels; z++) {
      const bucket = this.buckets[z];
      if (bucket.count > 0) {
        callback(z, bucket);
      }
    }
  }

  /**
   * Rebuilds all dirty buckets
   */
  rebuildDirtyBuckets(processItem: ProcessItemFunction): void {
    for (const bucket of this.buckets) {
      if (bucket.isDirty) {
        bucket.rebuild(processItem);
      }
    }
  }

  /**
   * Checks if any bucket is dirty
   */
  hasDirtyBuckets(): boolean {
    for (const bucket of this.buckets) {
      if (bucket.isDirty) return true;
    }
    return false;
  }
}
