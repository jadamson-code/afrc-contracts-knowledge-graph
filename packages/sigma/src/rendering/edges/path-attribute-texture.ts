/**
 * Sigma.js Edge Path Attribute Texture
 * =====================================
 *
 * Manages a GPU texture containing per-edge path and layer attribute data.
 * This texture stores all attributes declared by EdgePath and EdgeLayer
 * for efficient shader access, eliminating the need for hardcoded global
 * variables like `a_curvature`.
 *
 * @module
 */
import { AttributeLayout, computeAttributeLayout, ItemAttributeTexture } from "../data-texture";
import { AttributeSpecification } from "../nodes";
import { EdgeLayer, EdgePath } from "./types";

/** WebGL texture unit used for edge path attribute texture */
export const EDGE_ATTRIBUTE_TEXTURE_UNIT = 6;

/**
 * Describes the memory layout of path/layer attributes in the texture.
 */
export interface EdgeAttributeLayout {
  /** Total floats needed per edge */
  floatsPerEdge: number;
  /** Number of texels (4 floats each) per edge */
  texelsPerEdge: number;
  /** Map of attribute name to float offset within the edge's texel range */
  offsets: Record<string, number>;
  /** Map of attribute name to its specification (for type info in GLSL generation) */
  specs: Record<string, AttributeSpecification>;
}

/**
 * Computes the memory layout for edge path/layer attributes.
 * Collects all unique attributes from all paths and all layers, assigns sequential offsets.
 * Used by both the factory (for texture allocation) and generator (for GLSL code).
 *
 * @param paths - Array of EdgePath definitions (all paths in multi-path mode)
 * @param layers - Array of EdgeLayer definitions (all layers for multi-layer support)
 * @returns Layout describing attribute positions in the texture
 */
export function computeEdgeAttributeLayout(paths: EdgePath[], layers: EdgeLayer[]): EdgeAttributeLayout {
  // Use the generic layout computation
  const baseLayout = computeAttributeLayout([...paths, ...layers]);

  // Build specs map (edge-specific, needed for GLSL generation)
  const specs: Record<string, AttributeSpecification> = {};
  for (const path of paths) {
    for (const attr of path.attributes) {
      const name = attr.name.replace(/^a_/, "");
      if (!(name in specs)) {
        specs[name] = attr;
      }
    }
  }
  for (const layer of layers) {
    for (const attr of layer.attributes) {
      const name = attr.name.replace(/^a_/, "");
      if (!(name in specs)) {
        specs[name] = attr;
      }
    }
  }

  return {
    floatsPerEdge: baseLayout.floatsPerItem,
    texelsPerEdge: baseLayout.texelsPerItem,
    offsets: baseLayout.offsets,
    specs,
  };
}

// ============================================================================
// Edge Path Attribute Texture Fetch Generation
// ============================================================================

/**
 * Converts attribute size to GLSL type name.
 */
function sizeToGlslType(size: number): string {
  return size === 1 ? "float" : `vec${size}`;
}

/**
 * Generates GLSL code to fetch path/layer attributes from the edge attribute texture.
 * This replaces the hardcoded `a_curvature` global variable with a clean texture-based system.
 *
 * @param layout - The attribute layout computed from paths and layer
 * @returns Object containing uniforms, fetch code, and varying declarations
 */
export function generateEdgeAttributeTextureFetch(layout: EdgeAttributeLayout): {
  uniformDeclarations: string;
  uniformNames: string[];
  vertexVaryingDeclarations: string;
  fragmentVaryingDeclarations: string;
  fetchCode: string;
  varyingAssignments: string;
} {
  const { offsets, specs, texelsPerEdge, floatsPerEdge } = layout;
  const attributeNames = Object.keys(offsets);

  // If no attributes, return empty
  if (attributeNames.length === 0 || floatsPerEdge === 0) {
    return {
      uniformDeclarations: "",
      uniformNames: [],
      vertexVaryingDeclarations: "",
      fragmentVaryingDeclarations: "",
      fetchCode: "",
      varyingAssignments: "",
    };
  }

  // Uniforms for the attribute texture
  const uniformDeclarations = `
uniform sampler2D u_edgeAttributeTexture;
uniform int u_edgeAttributeTextureWidth;
uniform int u_edgeAttributeTexelsPerEdge;`;

  const uniformNames = ["u_edgeAttributeTexture", "u_edgeAttributeTextureWidth", "u_edgeAttributeTexelsPerEdge"];

  // Generate varying declarations for vertex shader (out) and fragment shader (in)
  const varyingLines: string[] = [];
  for (const name of attributeNames) {
    const spec = specs[name];
    const glslType = sizeToGlslType(spec.size);
    varyingLines.push(`${glslType} v_${name};`);
  }

  const vertexVaryingDeclarations = varyingLines.map((line) => `out ${line}`).join("\n");
  const fragmentVaryingDeclarations = varyingLines.map((line) => `in ${line}`).join("\n");

  // Generate texture fetch code for vertex shader
  // First, calculate which texels we need to fetch
  const texelFetches: string[] = [];
  for (let i = 0; i < texelsPerEdge; i++) {
    texelFetches.push(`
  int attrTexel${i}Idx = attrBaseTexel + ${i};
  ivec2 attrCoord${i} = ivec2(attrTexel${i}Idx % u_edgeAttributeTextureWidth, attrTexel${i}Idx / u_edgeAttributeTextureWidth);
  vec4 attrTexel${i} = texelFetch(u_edgeAttributeTexture, attrCoord${i}, 0);`);
  }

  // Generate extraction code for each attribute
  const extractions: string[] = [];
  for (const name of attributeNames) {
    const spec = specs[name];
    const offset = offsets[name];
    const texelIndex = Math.floor(offset / 4);
    const componentOffset = offset % 4;
    const components = ["r", "g", "b", "a"];

    if (spec.size === 1) {
      // Single float: extract one component
      extractions.push(`  float fetched_${name} = attrTexel${texelIndex}.${components[componentOffset]};`);
    } else if (spec.size === 2) {
      // vec2: extract two components
      if (componentOffset <= 2) {
        // Can use swizzle from same texel
        extractions.push(
          `  vec2 fetched_${name} = attrTexel${texelIndex}.${components[componentOffset]}${components[componentOffset + 1]};`,
        );
      } else {
        // Spans two texels
        extractions.push(
          `  vec2 fetched_${name} = vec2(attrTexel${texelIndex}.${components[componentOffset]}, attrTexel${texelIndex + 1}.r);`,
        );
      }
    } else if (spec.size === 3) {
      // vec3: extract three components
      if (componentOffset === 0) {
        extractions.push(`  vec3 fetched_${name} = attrTexel${texelIndex}.rgb;`);
      } else if (componentOffset === 1) {
        extractions.push(`  vec3 fetched_${name} = attrTexel${texelIndex}.gba;`);
      } else {
        // Spans two texels
        const remaining = 4 - componentOffset;
        const fromNext = 3 - remaining;
        const first = components.slice(componentOffset, 4).join("");
        const second = components.slice(0, fromNext).join("");
        extractions.push(
          `  vec3 fetched_${name} = vec3(attrTexel${texelIndex}.${first}, attrTexel${texelIndex + 1}.${second});`,
        );
      }
    } else if (spec.size === 4) {
      // vec4: extract four components
      if (componentOffset === 0) {
        extractions.push(`  vec4 fetched_${name} = attrTexel${texelIndex};`);
      } else {
        // Spans two texels
        const remaining = 4 - componentOffset;
        const fromNext = 4 - remaining;
        const first = components.slice(componentOffset, 4).join("");
        const second = components.slice(0, fromNext).join("");
        extractions.push(
          `  vec4 fetched_${name} = vec4(attrTexel${texelIndex}.${first}, attrTexel${texelIndex + 1}.${second});`,
        );
      }
    }
  }

  const fetchCode = `
  // Fetch path/layer attributes from edge attribute texture
  int attrBaseTexel = edgeIdx * u_edgeAttributeTexelsPerEdge;
${texelFetches.join("\n")}

  // Extract individual attributes
${extractions.join("\n")}`;

  // Generate varying assignments
  const assignments = attributeNames.map((name) => `  v_${name} = fetched_${name};`);
  const varyingAssignments = assignments.join("\n");

  return {
    uniformDeclarations,
    uniformNames,
    vertexVaryingDeclarations,
    fragmentVaryingDeclarations,
    fetchCode,
    varyingAssignments,
  };
}

/**
 * Manages a GPU texture storing path/layer attribute data for edges.
 *
 * The texture is a 2D RGBA32F texture where each edge uses `texelsPerEdge` texels.
 * Attributes are packed sequentially and can span multiple texels.
 *
 * Edge index N maps to texels starting at:
 *   baseTexel = N * texelsPerEdge
 *   texCoord = (baseTexel % textureWidth, baseTexel / textureWidth)
 */
export class EdgePathAttributeTexture extends ItemAttributeTexture {
  constructor(gl: WebGL2RenderingContext, layout: EdgeAttributeLayout, initialCapacity?: number) {
    super(
      gl,
      {
        floatsPerItem: layout.floatsPerEdge,
        texelsPerItem: layout.texelsPerEdge,
        offsets: layout.offsets,
      },
      initialCapacity,
    );
  }

  /**
   * Gets the number of texels per edge.
   */
  getTexelsPerEdge(): number {
    return this.TEXELS_PER_ITEM;
  }
}
