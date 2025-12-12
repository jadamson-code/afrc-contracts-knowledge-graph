/**
 * Sigma.js Node Data Texture
 * ==========================
 *
 * Manages a GPU texture containing node position, size, and shape data.
 * This texture is shared between node and edge programs, enabling:
 * - Reduced edge buffer size (node indices instead of full node data)
 * - Faster node updates (only texture needs updating, not edge buffers)
 * - Unified data source for both node and edge rendering
 *
 * @module
 */

const INITIAL_CAPACITY = 1024;
const GROWTH_FACTOR = 1.5;
// Maximum texture width to stay within WebGL limits (4096 is widely supported)
const MAX_TEXTURE_WIDTH = 4096;

/**
 * Manages a GPU texture storing node data (x, y, size, shapeId).
 *
 * The texture is a 2D RGBA32F texture where each texel contains:
 * - R: x position (graph coordinates)
 * - G: y position (graph coordinates)
 * - B: size
 * - A: shapeId (integer ID for shape registry lookup)
 *
 * The texture uses a 2D layout (width × height) to stay within WebGL
 * maximum texture dimension limits. Node index N maps to:
 *   x = N % textureWidth
 *   y = N / textureWidth
 *
 * Node indices are allocated via a free-list strategy for efficient
 * add/remove operations without compaction.
 */
export class NodeDataTexture {
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture | null = null;
  private data: Float32Array;
  private capacity: number;
  private textureWidth: number;
  private textureHeight: number;
  private dirty: boolean = false;
  private dirtyRangeStart: number = Infinity;
  private dirtyRangeEnd: number = -1;

  // Node key -> texture index mapping
  private nodeIndexMap: Map<string, number> = new Map();
  // Free list for recycling indices when nodes are removed
  private freeIndices: number[] = [];
  // Next index to allocate if free list is empty
  private nextIndex: number = 0;

  constructor(gl: WebGL2RenderingContext, initialCapacity: number = INITIAL_CAPACITY) {
    this.gl = gl;
    this.capacity = this.roundUpToPowerOfTwo(initialCapacity);
    const dims = this.computeTextureDimensions(this.capacity);
    this.textureWidth = dims.width;
    this.textureHeight = dims.height;
    this.data = new Float32Array(this.textureWidth * this.textureHeight * 4); // 4 floats per texel (RGBA)
    this.createTexture();
  }

  /**
   * Computes 2D texture dimensions for a given capacity.
   * Width is capped at MAX_TEXTURE_WIDTH, height grows as needed.
   */
  private computeTextureDimensions(capacity: number): { width: number; height: number } {
    const width = Math.min(capacity, MAX_TEXTURE_WIDTH);
    const height = Math.ceil(capacity / width);
    return { width, height };
  }

  /**
   * Rounds up to next power of two for efficient WebGL texture sizing.
   */
  private roundUpToPowerOfTwo(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));
  }

  /**
   * Creates the WebGL texture with appropriate format and filtering.
   */
  private createTexture(): void {
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
   * Resizes the texture to accommodate more nodes.
   */
  private resize(newCapacity: number): void {
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
   * Allocates a texture index for a node.
   * Returns existing index if node already allocated.
   */
  allocateNode(nodeKey: string): number {
    // Check if already allocated
    const existing = this.nodeIndexMap.get(nodeKey);
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

    this.nodeIndexMap.set(nodeKey, index);
    return index;
  }

  /**
   * Frees a node's texture index for reuse.
   */
  freeNode(nodeKey: string): void {
    const index = this.nodeIndexMap.get(nodeKey);
    if (index === undefined) return;

    this.nodeIndexMap.delete(nodeKey);
    this.freeIndices.push(index);

    // Zero out the data to avoid stale reads
    const offset = index * 4;
    this.data[offset] = 0;
    this.data[offset + 1] = 0;
    this.data[offset + 2] = 0;
    this.data[offset + 3] = 0;

    this.markDirty(index);
  }

  /**
   * Gets the texture index for a node.
   * Returns -1 if node not found.
   */
  getNodeIndex(nodeKey: string): number {
    return this.nodeIndexMap.get(nodeKey) ?? -1;
  }

  /**
   * Checks if a node has been allocated.
   */
  hasNode(nodeKey: string): boolean {
    return this.nodeIndexMap.has(nodeKey);
  }

  /**
   * Updates all data for a node.
   */
  updateNode(nodeKey: string, x: number, y: number, size: number, shapeId: number): void {
    const index = this.nodeIndexMap.get(nodeKey);
    if (index === undefined) {
      throw new Error(`Node "${nodeKey}" not allocated in NodeDataTexture`);
    }

    const offset = index * 4;
    this.data[offset] = x;
    this.data[offset + 1] = y;
    this.data[offset + 2] = size;
    this.data[offset + 3] = shapeId;

    this.markDirty(index);
  }

  /**
   * Updates only the position of a node.
   */
  updateNodePosition(nodeKey: string, x: number, y: number): void {
    const index = this.nodeIndexMap.get(nodeKey);
    if (index === undefined) return;

    const offset = index * 4;
    this.data[offset] = x;
    this.data[offset + 1] = y;

    this.markDirty(index);
  }

  /**
   * Updates only the size of a node.
   */
  updateNodeSize(nodeKey: string, size: number): void {
    const index = this.nodeIndexMap.get(nodeKey);
    if (index === undefined) return;

    const offset = index * 4;
    this.data[offset + 2] = size;

    this.markDirty(index);
  }

  /**
   * Updates only the shapeId of a node.
   */
  updateNodeShapeId(nodeKey: string, shapeId: number): void {
    const index = this.nodeIndexMap.get(nodeKey);
    if (index === undefined) return;

    const offset = index * 4;
    this.data[offset + 3] = shapeId;

    this.markDirty(index);
  }

  /**
   * Marks an index as dirty for upload.
   */
  private markDirty(index: number): void {
    this.dirty = true;
    this.dirtyRangeStart = Math.min(this.dirtyRangeStart, index);
    this.dirtyRangeEnd = Math.max(this.dirtyRangeEnd, index + 1);
  }

  /**
   * Uploads dirty data to the GPU texture.
   * With 2D layout, uploads each affected row separately.
   */
  upload(): void {
    if (!this.dirty || !this.texture) return;

    const { gl, textureWidth } = this;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // Calculate the range to upload
    const start = this.dirtyRangeStart;
    const end = Math.min(this.dirtyRangeEnd, this.capacity);

    if (start < end) {
      // Calculate affected rows
      const startRow = Math.floor(start / textureWidth);
      const endRow = Math.floor((end - 1) / textureWidth);

      // Upload each affected row
      for (let row = startRow; row <= endRow; row++) {
        const rowStart = row * textureWidth;
        const rowEnd = Math.min(rowStart + textureWidth, this.capacity);

        // Calculate the actual range within this row that needs updating
        const uploadStart = Math.max(start, rowStart);
        const uploadEnd = Math.min(end, rowEnd);

        if (uploadStart < uploadEnd) {
          const xOffset = uploadStart - rowStart;
          const width = uploadEnd - uploadStart;
          const subData = this.data.subarray(uploadStart * 4, uploadEnd * 4);

          gl.texSubImage2D(gl.TEXTURE_2D, 0, xOffset, row, width, 1, gl.RGBA, gl.FLOAT, subData);
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
   * Gets the current capacity (max nodes).
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
   * Gets the number of allocated nodes.
   */
  getNodeCount(): number {
    return this.nodeIndexMap.size;
  }

  /**
   * Checks if there are pending changes to upload.
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Clears all node allocations.
   */
  clear(): void {
    this.nodeIndexMap.clear();
    this.freeIndices = [];
    this.nextIndex = 0;
    this.data.fill(0);
    this.dirty = true;
    this.dirtyRangeStart = 0;
    this.dirtyRangeEnd = this.capacity;
  }

  /**
   * Releases WebGL resources.
   */
  kill(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
      this.texture = null;
    }
    this.nodeIndexMap.clear();
    this.freeIndices = [];
  }
}
