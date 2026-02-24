/**
 * Sigma.js Data Texture Base Class
 * =================================
 *
 * Abstract base class for GPU textures that store item data (nodes, edges, etc.).
 * Provides shared infrastructure for:
 * - 2D RGBA32F texture management
 * - Free-list index allocation
 * - Dirty range tracking for efficient uploads
 * - Automatic resizing
 *
 * @module
 */

const INITIAL_CAPACITY = 1024;
const GROWTH_FACTOR = 1.5;
// Maximum texture width to stay within WebGL limits (4096 is widely supported)
const MAX_TEXTURE_WIDTH = 4096;

/**
 * Abstract base class for GPU data textures.
 *
 * The texture is a 2D RGBA32F texture where each item uses TEXELS_PER_ITEM texels.
 * The texture uses a 2D layout (width × height) to stay within WebGL maximum
 * texture dimension limits.
 *
 * Item indices are allocated via a free-list strategy for efficient
 * add/remove operations without compaction.
 */
export abstract class DataTexture {
  /**
   * Number of texels (RGBA floats) used per item.
   * Override in subclasses: 1 for nodes (4 floats), 2 for edges (8 floats), etc.
   */
  protected abstract readonly TEXELS_PER_ITEM: number;

  protected gl: WebGL2RenderingContext;
  protected texture: WebGLTexture | null = null;
  protected data: Float32Array;
  protected capacity: number;
  protected textureWidth: number;
  protected textureHeight: number;
  protected dirty: boolean = false;
  protected dirtyRangeStart: number = Infinity;
  protected dirtyRangeEnd: number = -1;

  // Item key -> texture index mapping
  protected indexMap: Map<string, number> = new Map();
  // Free list for recycling indices when items are removed
  protected freeIndices: number[] = [];
  // Next index to allocate if free list is empty
  protected nextIndex: number = 0;
  // Write tracking for stats
  protected writeCount: number = 0;
  protected bytesWritten: number = 0;

  constructor(gl: WebGL2RenderingContext, initialCapacity: number = INITIAL_CAPACITY) {
    this.gl = gl;
    this.capacity = this.roundUpToPowerOfTwo(initialCapacity);
    // Note: textureWidth/Height and data are initialized in initializeTexture()
    // which must be called by subclass after TEXELS_PER_ITEM is set
    this.textureWidth = 0;
    this.textureHeight = 0;
    this.data = new Float32Array(0);
  }

  /**
   * Must be called by subclass constructor after TEXELS_PER_ITEM is defined.
   */
  protected initializeTexture(): void {
    const dims = this.computeTextureDimensions(this.capacity);
    this.textureWidth = dims.width;
    this.textureHeight = dims.height;
    this.data = new Float32Array(this.textureWidth * this.textureHeight * 4);
    this.createTexture();
  }

  /**
   * Computes 2D texture dimensions for a given item capacity.
   * Width is capped at MAX_TEXTURE_WIDTH, height grows as needed.
   */
  protected computeTextureDimensions(itemCapacity: number): { width: number; height: number } {
    const totalTexels = itemCapacity * this.TEXELS_PER_ITEM;
    const width = Math.min(totalTexels, MAX_TEXTURE_WIDTH);
    const height = Math.ceil(totalTexels / width);
    return { width, height };
  }

  /**
   * Rounds up to next power of two for efficient WebGL texture sizing.
   */
  protected roundUpToPowerOfTwo(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));
  }

  /**
   * Creates the WebGL texture with appropriate format and filtering.
   */
  protected createTexture(): void {
    const { gl } = this;

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // RGBA32F format for full float precision, 2D layout
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      this.textureWidth,
      this.textureHeight,
      0,
      gl.RGBA,
      gl.FLOAT,
      this.data,
    );

    // No filtering needed - we use texelFetch for exact lookups
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Resizes the texture to accommodate more items.
   */
  protected resize(newCapacity: number): void {
    if (newCapacity <= this.capacity) return;

    const targetCapacity = this.roundUpToPowerOfTwo(Math.ceil(newCapacity * GROWTH_FACTOR));
    const { gl } = this;

    // Compute new 2D dimensions
    const newDims = this.computeTextureDimensions(targetCapacity);

    // Create new data array and copy existing data
    const newData = new Float32Array(newDims.width * newDims.height * 4);
    newData.set(this.data);

    // Delete old texture and create new one
    if (this.texture) {
      gl.deleteTexture(this.texture);
    }

    this.data = newData;
    this.capacity = targetCapacity;
    this.textureWidth = newDims.width;
    this.textureHeight = newDims.height;
    this.createTexture();

    // Mark entire texture as dirty for upload
    this.dirty = true;
    this.dirtyRangeStart = 0;
    this.dirtyRangeEnd = this.nextIndex;
  }

  /**
   * Allocates a texture index for an item.
   * Returns existing index if item already allocated.
   */
  allocate(key: string): number {
    // Check if already allocated
    const existing = this.indexMap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    // Get index from free list or allocate new
    let index: number;
    if (this.freeIndices.length > 0) {
      index = this.freeIndices.pop()!;
    } else {
      index = this.nextIndex++;

      // Resize if needed
      if (index >= this.capacity) {
        this.resize(index + 1);
      }
    }

    this.indexMap.set(key, index);
    return index;
  }

  /**
   * Frees an item's texture index for reuse.
   */
  free(key: string): void {
    const index = this.indexMap.get(key);
    if (index === undefined) return;

    this.indexMap.delete(key);
    this.freeIndices.push(index);

    // Zero out the data to avoid stale reads
    const texelBase = index * this.TEXELS_PER_ITEM * 4;
    for (let i = 0; i < this.TEXELS_PER_ITEM * 4; i++) {
      this.data[texelBase + i] = 0;
    }

    this.markDirty(index);
  }

  /**
   * Gets the texture index for an item.
   * Returns -1 if item not found.
   */
  getIndex(key: string): number {
    return this.indexMap.get(key) ?? -1;
  }

  /**
   * Checks if an item has been allocated.
   */
  has(key: string): boolean {
    return this.indexMap.has(key);
  }

  /**
   * Marks an item index as dirty for upload.
   */
  protected markDirty(index: number): void {
    this.dirty = true;
    this.dirtyRangeStart = Math.min(this.dirtyRangeStart, index);
    this.dirtyRangeEnd = Math.max(this.dirtyRangeEnd, index + 1);
  }

  /**
   * Uploads dirty data to the GPU texture.
   * With 2D layout and multiple texels per item, uploads affected rows.
   */
  upload(): void {
    if (!this.dirty || !this.texture) return;

    const { gl, textureWidth } = this;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // Convert item range to texel range
    const startTexel = this.dirtyRangeStart * this.TEXELS_PER_ITEM;
    const endTexel = Math.min(this.dirtyRangeEnd * this.TEXELS_PER_ITEM, this.capacity * this.TEXELS_PER_ITEM);

    if (startTexel < endTexel) {
      // Calculate affected rows
      const startRow = Math.floor(startTexel / textureWidth);
      const endRow = Math.floor((endTexel - 1) / textureWidth);

      // Upload each affected row
      for (let row = startRow; row <= endRow; row++) {
        const rowStart = row * textureWidth;
        const rowEnd = Math.min(rowStart + textureWidth, this.capacity * this.TEXELS_PER_ITEM);

        // Calculate the actual range within this row that needs updating
        const uploadStart = Math.max(startTexel, rowStart);
        const uploadEnd = Math.min(endTexel, rowEnd);

        if (uploadStart < uploadEnd) {
          const xOffset = uploadStart - rowStart;
          const width = uploadEnd - uploadStart;
          const subData = this.data.subarray(uploadStart * 4, uploadEnd * 4);

          gl.texSubImage2D(gl.TEXTURE_2D, 0, xOffset, row, width, 1, gl.RGBA, gl.FLOAT, subData);
          this.writeCount++;
          this.bytesWritten += width * 16; // 4 floats * 4 bytes per texel
        }
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, null);

    // Reset dirty tracking
    this.dirty = false;
    this.dirtyRangeStart = Infinity;
    this.dirtyRangeEnd = -1;
  }

  /**
   * Binds the texture to a texture unit.
   */
  bind(textureUnit: number): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }

  /**
   * Gets the WebGL texture object.
   */
  getTexture(): WebGLTexture | null {
    return this.texture;
  }

  /**
   * Gets the current capacity (max items).
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Gets the texture width (needed for 2D coordinate calculation in shaders).
   */
  getTextureWidth(): number {
    return this.textureWidth;
  }

  /**
   * Gets the number of texels per item.
   */
  getTexelsPerItem(): number {
    return this.TEXELS_PER_ITEM;
  }

  /**
   * Gets the number of allocated items.
   */
  getCount(): number {
    return this.indexMap.size;
  }

  /**
   * Checks if there are pending changes to upload.
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Returns memory usage stats for this texture.
   */
  getMemoryStats(): { width: number; height: number; bytesPerTexel: number; totalBytes: number; itemCount: number; capacity: number } {
    return {
      width: this.textureWidth,
      height: this.textureHeight,
      bytesPerTexel: 16,
      totalBytes: this.textureWidth * this.textureHeight * 16,
      itemCount: this.indexMap.size,
      capacity: this.capacity,
    };
  }

  /**
   * Returns write stats for this texture.
   */
  getWriteStats(): { writes: number; bytesWritten: number } {
    return { writes: this.writeCount, bytesWritten: this.bytesWritten };
  }

  /**
   * Resets write stats counters.
   */
  resetWriteStats(): void {
    this.writeCount = 0;
    this.bytesWritten = 0;
  }

  /**
   * Clears all item allocations (but keeps the texture).
   */
  clear(): void {
    this.indexMap.clear();
    this.freeIndices = [];
    this.nextIndex = 0;
    this.data.fill(0);
    this.dirty = true;
    this.dirtyRangeStart = 0;
    this.dirtyRangeEnd = this.capacity;
  }

  /**
   * Destroys the texture and clears all data.
   */
  kill(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
      this.texture = null;
    }
    this.indexMap.clear();
    this.freeIndices = [];
  }
}

// ============================================================================
// Generic Attribute Layout and Texture
// ============================================================================

/**
 * Specification for an attribute to be stored in a texture.
 */
export interface AttributeSpec {
  name: string;
  size: 1 | 2 | 3 | 4;
}

/**
 * Describes the memory layout of attributes in a texture.
 */
export interface AttributeLayout {
  /** Total floats needed per item */
  floatsPerItem: number;
  /** Number of texels (4 floats each) per item */
  texelsPerItem: number;
  /** Map of attribute name (without a_ prefix) to float offset */
  offsets: Record<string, number>;
  /** Map of attribute name (without a_ prefix) to its spec */
  specs: Record<string, AttributeSpec>;
}

/**
 * Computes the memory layout for a collection of attributes.
 * Collects all unique attributes and assigns sequential offsets.
 *
 * @param sources - Array of objects containing attributes arrays
 * @returns Layout describing attribute positions in the texture
 */
export function computeAttributeLayout(sources: Array<{ attributes: AttributeSpec[] }>): AttributeLayout {
  const offsets: Record<string, number> = {};
  const specs: Record<string, AttributeSpec> = {};
  let offset = 0;

  for (const source of sources) {
    for (const attr of source.attributes) {
      const name = attr.name.replace(/^a_/, "");
      if (!(name in offsets)) {
        offsets[name] = offset;
        specs[name] = attr;
        offset += attr.size;
      }
    }
  }

  return {
    floatsPerItem: offset,
    texelsPerItem: Math.max(1, Math.ceil(offset / 4)),
    offsets,
    specs,
  };
}

/**
 * Generic attribute texture for storing per-item attribute data.
 * Used as base for both node layer attributes and edge path attributes.
 */
export class ItemAttributeTexture extends DataTexture {
  protected readonly TEXELS_PER_ITEM: number;
  protected readonly floatsPerItem: number;

  constructor(gl: WebGL2RenderingContext, layout: AttributeLayout, initialCapacity?: number) {
    super(gl, initialCapacity);
    this.floatsPerItem = layout.floatsPerItem;
    this.TEXELS_PER_ITEM = layout.texelsPerItem;
    this.initializeTexture();
  }

  /**
   * Updates all attributes for an item at once.
   * The packedData array should contain floatsPerItem values in the order
   * defined by the layout offsets.
   * Auto-allocates the item if not already allocated.
   */
  updateAllAttributes(key: string, packedData: ArrayLike<number>): void {
    let index = this.indexMap.get(key);
    if (index === undefined) {
      index = this.allocate(key);
    }

    const baseOffset = index * this.TEXELS_PER_ITEM * 4;
    const length = Math.min(packedData.length, this.floatsPerItem);

    for (let i = 0; i < length; i++) {
      this.data[baseOffset + i] = packedData[i];
    }

    this.markDirty(index);
  }

  /**
   * Gets the number of texels per item.
   */
  getTexelsPerItem(): number {
    return this.TEXELS_PER_ITEM;
  }
}
