/**
 * Sigma.js Edge Vertex Allocator
 * ===============================
 *
 * Manages vertex range allocations for non-instanced edge rendering.
 * Allows each edge to have exactly the number of vertices it needs
 * based on its path type and extremity configuration.
 *
 * @module
 */

/**
 * Information about a single edge's vertex allocation.
 */
export interface EdgeAllocation {
  /** Start index in the vertex buffer */
  start: number;
  /** Number of vertices allocated */
  count: number;
  /** Index into the paths array */
  pathId: number;
  /** Index into the heads array */
  headId: number;
  /** Index into the tails array */
  tailId: number;
}

/**
 * A free range in the vertex buffer.
 */
interface FreeRange {
  start: number;
  count: number;
}

/**
 * Manages vertex buffer allocations for edges with variable vertex counts.
 *
 * In multi-path mode, different edge types need different numbers of vertices:
 * - Line edges: 8 vertices
 * - Step edges: 16 vertices
 * - Curved edges: 40 vertices
 * - StepCurved edges: 72 vertices
 *
 * This allocator tracks which vertex ranges are used/free and provides:
 * - First-fit allocation from free list
 * - Automatic capacity growth when needed
 * - Free range merging to reduce fragmentation
 * - Index buffer generation with primitive restart markers
 */
export class EdgeVertexAllocator {
  /** Current capacity (total vertices that can be allocated) */
  private capacity: number;

  /** List of free ranges in the vertex buffer */
  private freeRanges: FreeRange[];

  /** Map of edge key to allocation info */
  private allocations: Map<string, EdgeAllocation>;

  /** Whether the index buffer needs to be rebuilt */
  private indexBufferDirty: boolean = true;

  /** Cached index buffer (rebuilt on demand) */
  private cachedIndexBuffer: Uint32Array | null = null;

  /** Total number of indices (vertices + restart markers) */
  private totalIndices: number = 0;

  /**
   * Creates a new vertex allocator.
   * @param initialCapacity - Initial vertex buffer capacity (default: 1024)
   */
  constructor(initialCapacity: number = 1024) {
    this.capacity = initialCapacity;
    this.freeRanges = [{ start: 0, count: initialCapacity }];
    this.allocations = new Map();
  }

  /**
   * Allocates vertices for an edge.
   *
   * @param edgeKey - Unique key for the edge
   * @param count - Number of vertices needed
   * @param pathId - Index into the paths array
   * @param headId - Index into the heads array
   * @param tailId - Index into the tails array
   * @returns The start index in the vertex buffer
   */
  allocate(edgeKey: string, count: number, pathId: number, headId: number, tailId: number): number {
    const existing = this.allocations.get(edgeKey);
    if (existing) {
      // If same size, just update the IDs
      if (existing.count === count) {
        existing.pathId = pathId;
        existing.headId = headId;
        existing.tailId = tailId;
        return existing.start;
      }
      // Different size: free and reallocate
      this.free(edgeKey);
    }

    // Find first-fit in free ranges
    for (let i = 0; i < this.freeRanges.length; i++) {
      const range = this.freeRanges[i];
      if (range.count >= count) {
        const start = range.start;

        // Shrink or remove the free range
        if (range.count === count) {
          this.freeRanges.splice(i, 1);
        } else {
          range.start += count;
          range.count -= count;
        }

        this.allocations.set(edgeKey, { start, count, pathId, headId, tailId });
        this.indexBufferDirty = true;
        return start;
      }
    }

    // No suitable free range found: grow capacity
    const start = this.capacity;
    const growth = Math.max(count, this.capacity); // At least double or fit the request
    this.capacity += growth;

    // Add remaining growth to free list (if any)
    if (growth > count) {
      this.freeRanges.push({ start: start + count, count: growth - count });
    }

    this.allocations.set(edgeKey, { start, count, pathId, headId, tailId });
    this.indexBufferDirty = true;
    return start;
  }

  /**
   * Frees the vertices allocated for an edge.
   *
   * @param edgeKey - Unique key for the edge
   */
  free(edgeKey: string): void {
    const alloc = this.allocations.get(edgeKey);
    if (!alloc) return;

    this.allocations.delete(edgeKey);

    // Add to free list
    this.freeRanges.push({ start: alloc.start, count: alloc.count });

    // Merge adjacent free ranges
    this.mergeAdjacentFreeRanges();

    this.indexBufferDirty = true;
  }

  /**
   * Gets the allocation info for an edge.
   *
   * @param edgeKey - Unique key for the edge
   * @returns The allocation info, or undefined if not allocated
   */
  get(edgeKey: string): EdgeAllocation | undefined {
    return this.allocations.get(edgeKey);
  }

  /**
   * Checks if an edge is allocated.
   *
   * @param edgeKey - Unique key for the edge
   */
  has(edgeKey: string): boolean {
    return this.allocations.has(edgeKey);
  }

  /**
   * Gets the number of allocated edges.
   */
  getEdgeCount(): number {
    return this.allocations.size;
  }

  /**
   * Rebuilds and returns the index buffer for rendering.
   *
   * The index buffer contains vertex indices for all edges, with
   * primitive restart markers (0xFFFFFFFF) between edges.
   *
   * @returns The index buffer as a Uint32Array
   */
  rebuildIndexBuffer(): Uint32Array {
    if (!this.indexBufferDirty && this.cachedIndexBuffer) {
      return this.cachedIndexBuffer;
    }

    // Sort allocations by start index for consistent rendering order
    const sorted = [...this.allocations.values()].sort((a, b) => a.start - b.start);

    if (sorted.length === 0) {
      this.cachedIndexBuffer = new Uint32Array(0);
      this.totalIndices = 0;
      this.indexBufferDirty = false;
      return this.cachedIndexBuffer;
    }

    // Calculate total indices needed (vertices + restart markers between edges)
    this.totalIndices = sorted.reduce((sum, a) => sum + a.count, 0) + (sorted.length - 1);
    const indices = new Uint32Array(this.totalIndices);

    let idx = 0;
    for (let i = 0; i < sorted.length; i++) {
      const alloc = sorted[i];

      // Add vertex indices for this edge
      for (let v = 0; v < alloc.count; v++) {
        indices[idx++] = alloc.start + v;
      }

      // Add restart marker (except after last edge)
      if (i < sorted.length - 1) {
        indices[idx++] = 0xffffffff; // PRIMITIVE_RESTART_FIXED_INDEX
      }
    }

    this.cachedIndexBuffer = indices;
    this.indexBufferDirty = false;
    return indices;
  }

  /**
   * Gets the total number of indices in the index buffer.
   */
  getTotalIndices(): number {
    if (this.indexBufferDirty) {
      this.rebuildIndexBuffer();
    }
    return this.totalIndices;
  }

  /**
   * Checks if the index buffer needs to be rebuilt.
   */
  isIndexBufferDirty(): boolean {
    return this.indexBufferDirty;
  }

  /**
   * Marks the index buffer as dirty (needs rebuild).
   */
  markDirty(): void {
    this.indexBufferDirty = true;
  }

  /**
   * Gets the current vertex buffer capacity.
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Gets the total number of vertices currently allocated.
   */
  getAllocatedVertexCount(): number {
    let total = 0;
    for (const alloc of this.allocations.values()) {
      total += alloc.count;
    }
    return total;
  }

  /**
   * Gets the fragmentation ratio (0 = no fragmentation, 1 = fully fragmented).
   */
  getFragmentationRatio(): number {
    const allocated = this.getAllocatedVertexCount();
    if (allocated === 0) return 0;

    // Find the highest used index
    let maxUsed = 0;
    for (const alloc of this.allocations.values()) {
      maxUsed = Math.max(maxUsed, alloc.start + alloc.count);
    }

    // Fragmentation = (used space with gaps) / (actual allocated)
    return maxUsed > 0 ? 1 - allocated / maxUsed : 0;
  }

  /**
   * Compacts the allocations to remove fragmentation.
   * This is an expensive operation that reassigns all allocations.
   *
   * @returns true if compaction was performed, false if not needed
   */
  compact(): boolean {
    const fragmentation = this.getFragmentationRatio();
    if (fragmentation < 0.25) {
      return false; // Not worth compacting
    }

    // Sort allocations by start index
    const sorted = [...this.allocations.entries()].sort((a, b) => a[1].start - b[1].start);

    // Reassign contiguous starting positions
    let nextStart = 0;
    for (const [edgeKey, alloc] of sorted) {
      alloc.start = nextStart;
      nextStart += alloc.count;
      this.allocations.set(edgeKey, alloc);
    }

    // Reset free ranges to single range at the end
    this.freeRanges = [{ start: nextStart, count: this.capacity - nextStart }];
    this.indexBufferDirty = true;

    return true;
  }

  /**
   * Clears all allocations.
   */
  clear(): void {
    this.allocations.clear();
    this.freeRanges = [{ start: 0, count: this.capacity }];
    this.indexBufferDirty = true;
    this.cachedIndexBuffer = null;
    this.totalIndices = 0;
  }

  /**
   * Iterates over all allocations.
   */
  *[Symbol.iterator](): Iterator<[string, EdgeAllocation]> {
    yield* this.allocations.entries();
  }

  /**
   * Merges adjacent free ranges to reduce fragmentation.
   */
  private mergeAdjacentFreeRanges(): void {
    if (this.freeRanges.length <= 1) return;

    // Sort by start position
    this.freeRanges.sort((a, b) => a.start - b.start);

    // Merge adjacent ranges
    const merged: FreeRange[] = [];
    let current = this.freeRanges[0];

    for (let i = 1; i < this.freeRanges.length; i++) {
      const next = this.freeRanges[i];

      if (current.start + current.count === next.start) {
        // Adjacent: merge
        current.count += next.count;
      } else {
        // Not adjacent: push current and start new
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);

    this.freeRanges = merged;
  }
}
