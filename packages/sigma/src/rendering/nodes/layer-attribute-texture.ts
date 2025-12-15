/**
 * Sigma.js Node Layer Attribute Texture
 * ======================================
 *
 * Manages a GPU texture containing per-node layer attribute data.
 * This texture stores all layer-defined attributes (colors, sizes, etc.)
 * for efficient shader access, reducing buffer attribute usage.
 *
 * @module
 */
import { DataTexture } from "../data-texture";
import { FragmentLayer } from "./types";

/**
 * Describes the memory layout of layer attributes in the texture.
 */
export interface LayerAttributeLayout {
  /** Total floats needed per node */
  floatsPerNode: number;
  /** Number of texels (4 floats each) per node */
  texelsPerNode: number;
  /** Map of attribute name to float offset within the node's texel range */
  offsets: Record<string, number>;
}

/**
 * Computes the memory layout for layer attributes.
 * Collects all unique attributes from all layers and assigns sequential offsets.
 * Used by both the factory (for texture allocation) and generator (for GLSL code).
 */
export function computeLayerAttributeLayout(layers: FragmentLayer[]): LayerAttributeLayout {
  const offsets: Record<string, number> = {};
  let offset = 0;

  for (const layer of layers) {
    for (const attr of layer.attributes) {
      const name = attr.name.replace(/^a_/, "");
      if (!(name in offsets)) {
        offsets[name] = offset;
        offset += attr.size;
      }
    }
  }

  return {
    floatsPerNode: offset,
    texelsPerNode: Math.ceil(offset / 4),
    offsets,
  };
}

/**
 * Manages a GPU texture storing layer attribute data for nodes.
 *
 * The texture is a 2D RGBA32F texture where each node uses `texelsPerNode` texels.
 * Attributes are packed sequentially and can span multiple texels.
 *
 * Node index N maps to texels starting at:
 *   baseTexel = N * texelsPerNode
 *   texCoord = (baseTexel % textureWidth, baseTexel / textureWidth)
 */
export class NodeLayerAttributeTexture extends DataTexture {
  protected readonly TEXELS_PER_ITEM: number;
  private readonly layout: LayerAttributeLayout;

  constructor(gl: WebGL2RenderingContext, layout: LayerAttributeLayout, initialCapacity?: number) {
    super(gl, initialCapacity);
    this.layout = layout;
    // Handle case where there are no attributes (empty layout)
    this.TEXELS_PER_ITEM = Math.max(1, layout.texelsPerNode);
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
   * Updates all attributes for a node at once.
   * The packedData array should contain floatsPerNode values in the order
   * defined by the layout offsets.
   * Auto-allocates the node if not already allocated.
   */
  updateAllAttributes(nodeKey: string, packedData: ArrayLike<number>): void {
    let index = this.indexMap.get(nodeKey);
    if (index === undefined) {
      // Auto-allocate if not already allocated
      index = this.allocateNode(nodeKey);
    }

    const baseOffset = index * this.TEXELS_PER_ITEM * 4;
    const length = Math.min(packedData.length, this.layout.floatsPerNode);

    for (let i = 0; i < length; i++) {
      this.data[baseOffset + i] = packedData[i];
    }

    this.markDirty(index);
  }

  /**
   * Gets the number of texels per node.
   */
  getTexelsPerNode(): number {
    return this.TEXELS_PER_ITEM;
  }

  /**
   * Gets the layout describing attribute positions.
   */
  getLayout(): LayerAttributeLayout {
    return this.layout;
  }

  /**
   * Gets the number of allocated nodes.
   */
  getNodeCount(): number {
    return this.getCount();
  }
}
