/**
 * Sigma.js Edge Data Texture
 * ==========================
 *
 * Manages a GPU texture containing core edge data (source/target indices, thickness,
 * extremity ratios, path/extremity IDs). This texture is shared between edge and edge
 * label programs, enabling:
 * - Reduced edge buffer size (edge index instead of full edge data)
 * - Unified data source for both edge and edge label rendering
 * - Per-edge path/extremity selection for multi-mode programs
 *
 * Note: Path-specific attributes (like curvature) are stored in a per-program attribute texture.
 * This texture contains only the core data shared across all programs.
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
 * - A: reserved
 *
 * Texel 1 (edgeIndex * 2 + 1):
 * - R: headLengthRatio
 * - G: tailLengthRatio
 * - B: pathId (for multi-path programs)
 * - A: (headId << 4) | tailId (for multi-extremity programs)
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
   * Updates all data for an edge.
   *
   * @param edgeKey - The edge identifier
   * @param sourceNodeIndex - Index of source node in node data texture
   * @param targetNodeIndex - Index of target node in node data texture
   * @param thickness - Edge thickness
   * @param headLengthRatio - Head extremity length as ratio of thickness
   * @param tailLengthRatio - Tail extremity length as ratio of thickness
   * @param pathId - Path index for multi-path programs (default 0)
   * @param headId - Head extremity index for multi-extremity programs (default 0)
   * @param tailId - Tail extremity index for multi-extremity programs (default 0)
   */
  updateEdge(
    edgeKey: string,
    sourceNodeIndex: number,
    targetNodeIndex: number,
    thickness: number,
    headLengthRatio: number,
    tailLengthRatio: number,
    pathId: number = 0,
    headId: number = 0,
    tailId: number = 0,
  ): void {
    const index = this.indexMap.get(edgeKey);
    if (index === undefined) {
      throw new Error(`Edge "${edgeKey}" not allocated in EdgeDataTexture`);
    }

    const texelBase = index * this.TEXELS_PER_ITEM * 4;

    // Texel 0: sourceNodeIndex, targetNodeIndex, thickness, reserved
    this.data[texelBase + 0] = sourceNodeIndex;
    this.data[texelBase + 1] = targetNodeIndex;
    this.data[texelBase + 2] = thickness;
    this.data[texelBase + 3] = 0; // Reserved

    // Texel 1: headLengthRatio, tailLengthRatio, pathId, (headId << 4) | tailId
    // headId and tailId are packed into 4 bits each (supports up to 16 extremity types)
    this.data[texelBase + 4] = headLengthRatio;
    this.data[texelBase + 5] = tailLengthRatio;
    this.data[texelBase + 6] = pathId;
    this.data[texelBase + 7] = ((headId & 0xf) << 4) | (tailId & 0xf);

    this.markDirty(index);
  }
}
