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
import { DataTexture } from "./data-texture";

/**
 * Manages a GPU texture storing node data (x, y, size, shapeId).
 *
 * The texture is a 2D RGBA32F texture where each texel contains:
 * - R: x position (graph coordinates)
 * - G: y position (graph coordinates)
 * - B: size
 * - A: shapeId (integer ID for shape registry lookup)
 *
 * Node index N maps to texel coordinates:
 *   x = N % textureWidth
 *   y = N / textureWidth
 */
export class NodeDataTexture extends DataTexture {
  protected readonly TEXELS_PER_ITEM = 1;

  constructor(gl: WebGL2RenderingContext, initialCapacity?: number) {
    super(gl, initialCapacity);
    this.initializeTexture();
  }

  /**
   * Allocates a texture index for a node.
   * Returns existing index if node already allocated.
   */
  allocateNode(nodeKey: string): number {
    return this.allocate(nodeKey);
  }

  /**
   * Frees a node's texture index for reuse.
   */
  freeNode(nodeKey: string): void {
    this.free(nodeKey);
  }

  /**
   * Gets the texture index for a node.
   * Returns -1 if node not found.
   */
  getNodeIndex(nodeKey: string): number {
    return this.getIndex(nodeKey);
  }

  /**
   * Checks if a node has been allocated.
   */
  hasNode(nodeKey: string): boolean {
    return this.has(nodeKey);
  }

  /**
   * Updates all data for a node.
   */
  updateNode(nodeKey: string, x: number, y: number, size: number, shapeId: number): void {
    const index = this.indexMap.get(nodeKey);
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
   * Gets the number of allocated nodes.
   */
  getNodeCount(): number {
    return this.getCount();
  }
}
