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
import { AttributeLayout, computeAttributeLayout, ItemAttributeTexture } from "../data-texture";
import { FragmentLayer } from "./types";

/**
 * Describes the memory layout of layer attributes in the texture.
 * Alias for AttributeLayout with node-specific naming.
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
  const layout = computeAttributeLayout(layers);
  return {
    floatsPerNode: layout.floatsPerItem,
    texelsPerNode: layout.texelsPerItem,
    offsets: layout.offsets,
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
export class NodeLayerAttributeTexture extends ItemAttributeTexture {
  constructor(gl: WebGL2RenderingContext, layout: LayerAttributeLayout, initialCapacity?: number) {
    super(
      gl,
      {
        floatsPerItem: layout.floatsPerNode,
        texelsPerItem: layout.texelsPerNode,
        offsets: layout.offsets,
      },
      initialCapacity,
    );
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
   * Gets the number of texels per node.
   */
  getTexelsPerNode(): number {
    return this.TEXELS_PER_ITEM;
  }

  /**
   * Gets the number of allocated nodes.
   */
  getNodeCount(): number {
    return this.getCount();
  }
}
