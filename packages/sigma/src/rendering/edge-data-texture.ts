/**
 * Sigma.js Edge Data Texture
 * ==========================
 *
 * Manages a GPU texture containing edge data (source/target indices, thickness,
 * curvature, extremity ratios). This texture is shared between edge and edge
 * label programs, enabling:
 * - Reduced edge buffer size (edge index instead of full edge data)
 * - Unified data source for both edge and edge label rendering
 * - Future support for per-edge path/extremity selection
 *
 * @module
 */

const INITIAL_CAPACITY = 1024;
const GROWTH_FACTOR = 1.5;
// Maximum texture width to stay within WebGL limits (4096 is widely supported)
const MAX_TEXTURE_WIDTH = 4096;
// Number of texels per edge (we use 2 texels = 8 floats per edge)
const TEXELS_PER_EDGE = 2;

/**
 * Manages a GPU texture storing edge data.
 *
 * The texture is a 2D RGBA32F texture where each edge uses 2 texels:
 *
 * Texel 0 (edgeIndex * 2 + 0):
 * - R: sourceNodeIndex (index into node data texture)
 * - G: targetNodeIndex (index into node data texture)
 * - B: thickness
 * - A: curvature
 *
 * Texel 1 (edgeIndex * 2 + 1):
 * - R: headLengthRatio
 * - G: tailLengthRatio
 * - B: reserved (for future pathId)
 * - A: reserved (for future extremityIds)
 *
 * The texture uses a 2D layout (width x height) to stay within WebGL
 * maximum texture dimension limits.
 *
 * Edge indices are allocated via a free-list strategy for efficient
 * add/remove operations without compaction.
 */
export class EdgeDataTexture {
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture | null = null;
  private data: Float32Array;
  private capacity: number; // Number of edges
  private textureWidth: number;
  private textureHeight: number;
  private dirty: boolean = false;
  private dirtyRangeStart: number = Infinity;
  private dirtyRangeEnd: number = -1;

  // Edge key -> texture index mapping
  private edgeIndexMap: Map<string, number> = new Map();
  // Free list for recycling indices when edges are removed
  private freeIndices: number[] = [];
  // Next index to allocate if free list is empty
  private nextIndex: number = 0;

  constructor(gl: WebGL2RenderingContext, initialCapacity: number = INITIAL_CAPACITY) {
    this.gl = gl;
    this.capacity = this.roundUpToPowerOfTwo(initialCapacity);
    const dims = this.computeTextureDimensions(this.capacity);
    this.textureWidth = dims.width;
    this.textureHeight = dims.height;
    // Each edge uses TEXELS_PER_EDGE texels, each texel has 4 floats
    this.data = new Float32Array(this.textureWidth * this.textureHeight * 4);
    this.createTexture();
  }

  /**
   * Computes 2D texture dimensions for a given edge capacity.
   * Width is capped at MAX_TEXTURE_WIDTH, height grows as needed.
   * Note: We need TEXELS_PER_EDGE texels per edge.
   */
  private computeTextureDimensions(edgeCapacity: number): { width: number; height: number } {
    const totalTexels = edgeCapacity * TEXELS_PER_EDGE;
    const width = Math.min(totalTexels, MAX_TEXTURE_WIDTH);
    const height = Math.ceil(totalTexels / width);
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
   * Resizes the texture to accommodate more edges.
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
   * Allocates a texture index for an edge.
   * Returns existing index if edge already allocated.
   */
  allocateEdge(edgeKey: string): number {
    // Check if already allocated
    const existing = this.edgeIndexMap.get(edgeKey);
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

    this.edgeIndexMap.set(edgeKey, index);
    return index;
  }

  /**
   * Frees an edge's texture index for reuse.
   */
  freeEdge(edgeKey: string): void {
    const index = this.edgeIndexMap.get(edgeKey);
    if (index === undefined) return;

    this.edgeIndexMap.delete(edgeKey);
    this.freeIndices.push(index);

    // Zero out the data to avoid stale reads
    const texelBase = index * TEXELS_PER_EDGE * 4;
    for (let i = 0; i < TEXELS_PER_EDGE * 4; i++) {
      this.data[texelBase + i] = 0;
    }

    this.markDirty(index);
  }

  /**
   * Gets the texture index for an edge.
   * Returns -1 if edge not found.
   */
  getEdgeIndex(edgeKey: string): number {
    return this.edgeIndexMap.get(edgeKey) ?? -1;
  }

  /**
   * Checks if an edge has been allocated.
   */
  hasEdge(edgeKey: string): boolean {
    return this.edgeIndexMap.has(edgeKey);
  }

  /**
   * Updates all data for an edge.
   *
   * @param edgeKey - The edge identifier
   * @param sourceNodeIndex - Index of source node in node data texture
   * @param targetNodeIndex - Index of target node in node data texture
   * @param thickness - Edge thickness
   * @param curvature - Path curvature (0 for straight)
   * @param headLengthRatio - Head extremity length as ratio of thickness
   * @param tailLengthRatio - Tail extremity length as ratio of thickness
   */
  updateEdge(
    edgeKey: string,
    sourceNodeIndex: number,
    targetNodeIndex: number,
    thickness: number,
    curvature: number,
    headLengthRatio: number,
    tailLengthRatio: number,
  ): void {
    const index = this.edgeIndexMap.get(edgeKey);
    if (index === undefined) {
      throw new Error(`Edge "${edgeKey}" not allocated in EdgeDataTexture`);
    }

    const texelBase = index * TEXELS_PER_EDGE * 4;

    // Texel 0: sourceNodeIndex, targetNodeIndex, thickness, curvature
    this.data[texelBase + 0] = sourceNodeIndex;
    this.data[texelBase + 1] = targetNodeIndex;
    this.data[texelBase + 2] = thickness;
    this.data[texelBase + 3] = curvature;

    // Texel 1: headLengthRatio, tailLengthRatio, reserved, reserved
    this.data[texelBase + 4] = headLengthRatio;
    this.data[texelBase + 5] = tailLengthRatio;
    this.data[texelBase + 6] = 0; // Reserved for pathId
    this.data[texelBase + 7] = 0; // Reserved for extremityIds

    this.markDirty(index);
  }

  /**
   * Marks an edge index as dirty for upload.
   */
  private markDirty(edgeIndex: number): void {
    this.dirty = true;
    this.dirtyRangeStart = Math.min(this.dirtyRangeStart, edgeIndex);
    this.dirtyRangeEnd = Math.max(this.dirtyRangeEnd, edgeIndex + 1);
  }

  /**
   * Uploads dirty data to the GPU texture.
   * With 2D layout and multiple texels per edge, uploads affected rows.
   */
  upload(): void {
    if (!this.dirty || !this.texture) return;

    const { gl, textureWidth } = this;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // Convert edge range to texel range
    const startTexel = this.dirtyRangeStart * TEXELS_PER_EDGE;
    const endTexel = Math.min(this.dirtyRangeEnd * TEXELS_PER_EDGE, this.capacity * TEXELS_PER_EDGE);

    if (startTexel < endTexel) {
      // Calculate affected rows
      const startRow = Math.floor(startTexel / textureWidth);
      const endRow = Math.floor((endTexel - 1) / textureWidth);

      // Upload each affected row
      for (let row = startRow; row <= endRow; row++) {
        const rowStart = row * textureWidth;
        const rowEnd = Math.min(rowStart + textureWidth, this.capacity * TEXELS_PER_EDGE);

        // Calculate the actual range within this row that needs updating
        const uploadStart = Math.max(startTexel, rowStart);
        const uploadEnd = Math.min(endTexel, rowEnd);

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
   * Gets the current capacity (max edges).
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
   * Gets the number of texels per edge.
   */
  getTexelsPerEdge(): number {
    return TEXELS_PER_EDGE;
  }

  /**
   * Gets the number of allocated edges.
   */
  getEdgeCount(): number {
    return this.edgeIndexMap.size;
  }

  /**
   * Checks if there are pending changes to upload.
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Clears all edge allocations (but keeps the texture).
   */
  clear(): void {
    this.edgeIndexMap.clear();
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
    this.edgeIndexMap.clear();
    this.freeIndices = [];
  }
}
