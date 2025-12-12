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
import { DataTexture } from "./data-texture";

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
 * Edge index N maps to texel coordinates:
 *   texel0: (N * 2) % textureWidth, (N * 2) / textureWidth
 *   texel1: (N * 2 + 1) % textureWidth, (N * 2 + 1) / textureWidth
 */
export class EdgeDataTexture extends DataTexture {
  protected readonly TEXELS_PER_ITEM = 2;

  constructor(gl: WebGL2RenderingContext, initialCapacity?: number) {
    super(gl, initialCapacity);
    this.initializeTexture();
  }

  /**
   * Allocates a texture index for an edge.
   * Returns existing index if edge already allocated.
   */
  allocateEdge(edgeKey: string): number {
    return this.allocate(edgeKey);
  }

  /**
   * Frees an edge's texture index for reuse.
   */
  freeEdge(edgeKey: string): void {
    this.free(edgeKey);
  }

  /**
   * Gets the texture index for an edge.
   * Returns -1 if edge not found.
   */
  getEdgeIndex(edgeKey: string): number {
    return this.getIndex(edgeKey);
  }

  /**
   * Checks if an edge has been allocated.
   */
  hasEdge(edgeKey: string): boolean {
    return this.has(edgeKey);
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
    const index = this.indexMap.get(edgeKey);
    if (index === undefined) {
      throw new Error(`Edge "${edgeKey}" not allocated in EdgeDataTexture`);
    }

    const texelBase = index * this.TEXELS_PER_ITEM * 4;

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
   * Gets the number of allocated edges.
   */
  getEdgeCount(): number {
    return this.getCount();
  }
}
