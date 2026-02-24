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
import { AttributeLayout } from "../data-texture";

/** WebGL texture unit used for edge path attribute texture */
export const EDGE_ATTRIBUTE_TEXTURE_UNIT = 6;

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
  const { offsets, specs, texelsPerItem, floatsPerItem } = layout;
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
  for (let i = 0; i < texelsPerItem; i++) {
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
