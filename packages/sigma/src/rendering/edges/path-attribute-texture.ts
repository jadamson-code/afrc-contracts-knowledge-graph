/**
 * Sigma.js Edge Path Attribute Texture Fetch
 * ===========================================
 *
 * Generates GLSL code to fetch per-edge path and layer attribute data
 * from a texture. The texture stores all attributes declared by EdgePath
 * and EdgeLayer for efficient shader access.
 *
 * @module
 */
import { AttributeLayout, generateAttributeTextureFetch } from "../data-texture";

/** WebGL texture unit used for edge path attribute texture */
export const EDGE_ATTRIBUTE_TEXTURE_UNIT = 6;

// ============================================================================
// Edge Path Attribute Texture Fetch Generation
// ============================================================================

/**
 * Generates GLSL code to fetch path/layer attributes from the edge attribute texture.
 * Wraps the shared generateAttributeTextureFetch() with edge-specific uniform and varying declarations.
 *
 * @param layout - The attribute layout computed from paths and layers
 * @returns Object containing uniforms, fetch code, and varying declarations
 */
export function generateEdgeAttributeTextureFetch(layout: AttributeLayout): {
  uniformDeclarations: string;
  uniformNames: string[];
  vertexVaryingDeclarations: string;
  fragmentVaryingDeclarations: string;
  fetchCode: string;
  varyingAssignments: string;
} {
  const { offsets, specs, floatsPerItem } = layout;
  const attributeNames = Object.keys(offsets);

  // If no attributes, return empty
  if (attributeNames.length === 0 || floatsPerItem === 0) {
    return {
      uniformDeclarations: "",
      uniformNames: [],
      vertexVaryingDeclarations: "",
      fragmentVaryingDeclarations: "",
      fetchCode: "",
      varyingAssignments: "",
    };
  }

  // Edge-specific uniform declarations
  const uniformDeclarations = `
uniform sampler2D u_edgeAttributeTexture;
uniform int u_edgeAttributeTextureWidth;
uniform int u_edgeAttributeTexelsPerEdge;`;

  const uniformNames = ["u_edgeAttributeTexture", "u_edgeAttributeTextureWidth", "u_edgeAttributeTexelsPerEdge"];

  // Edge-specific varying declarations
  const varyingLines = attributeNames.map((name) => {
    const glslType = specs[name].size === 1 ? "float" : `vec${specs[name].size}`;
    return `${glslType} v_${name};`;
  });
  const vertexVaryingDeclarations = varyingLines.map((line) => `out ${line}`).join("\n");
  const fragmentVaryingDeclarations = varyingLines.map((line) => `in ${line}`).join("\n");

  // Delegate extraction logic to the shared function
  const { fetchCode, varyingAssignments } = generateAttributeTextureFetch(layout, {
    varPrefix: "attr",
    baseTexelExpr: "edgeIdx * u_edgeAttributeTexelsPerEdge",
    textureWidthUniform: "u_edgeAttributeTextureWidth",
    textureSamplerUniform: "u_edgeAttributeTexture",
  });

  return {
    uniformDeclarations,
    uniformNames,
    vertexVaryingDeclarations,
    fragmentVaryingDeclarations,
    fetchCode,
    varyingAssignments,
  };
}
