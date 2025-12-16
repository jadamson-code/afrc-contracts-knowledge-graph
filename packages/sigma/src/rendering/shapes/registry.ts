/**
 * Sigma.js Shape Registry
 * ========================
 *
 * Global registry for SDF shapes used by both node and edge programs.
 * Edge programs use this registry to access node shape SDFs for shape-aware
 * edge clamping (edges stopping at node boundaries).
 *
 * Shapes are registered with auto-generated slugs that encode:
 * - Base shape name (e.g., "square")
 * - Uniform values (e.g., cornerRadius=0.2)
 * - rotateWithCamera flag
 *
 * This allows multiple variants of the same base shape to coexist.
 *
 * @module
 */
import { SDFShape } from "../nodes/types";
import { numberToGLSLFloat } from "../utils";

/**
 * Registered shape with all metadata needed for edge clamping.
 */
interface RegisteredShape {
  shape: SDFShape;
  uniformValues: Record<string, number>;
  rotatesWithCamera: boolean;
  slug: string;
}

/**
 * Global registry mapping shape slugs to their full definitions.
 */
const shapeRegistry = new Map<string, RegisteredShape>();

/**
 * Map of shape slugs to their numeric IDs for GPU-side shape selection.
 * IDs are assigned incrementally as shapes are registered.
 */
const shapeIdMap = new Map<string, number>();
let nextShapeId = 0;

/**
 * Generates a unique slug for a shape variant.
 * The slug encodes the base name, non-default uniform values, and rotateWithCamera flag.
 *
 * Examples:
 * - "circle" → "circle"
 * - "square" with cornerRadius=0.2 → "square#cornerRadius=0.2"
 * - "square" with cornerRadius=0.2 and rotateWithCamera → "square#cornerRadius=0.2#rwc"
 */
function generateShapeSlug(shape: SDFShape, rotatesWithCamera: boolean): string {
  let slug = shape.name;

  // Add non-zero uniform values (sorted for consistency)
  const nonZeroParams = shape.uniforms
    .filter((u) => u.type === "float" && u.value !== undefined && u.value !== 0)
    .map((u) => `${u.name.replace("u_", "")}=${u.value}`)
    .sort();

  if (nonZeroParams.length > 0) {
    slug += "#" + nonZeroParams.join("#");
  }

  // Add rotateWithCamera flag
  if (rotatesWithCamera) {
    slug += "#rwc";
  }

  return slug;
}

/**
 * Registers a shape variant in the global registry.
 * Called automatically by createNodeProgram() when a node program is created.
 *
 * @param shape - The SDF shape to register
 * @param rotatesWithCamera - Whether this shape variant rotates with camera
 * @returns The generated slug for this shape variant
 */
export function registerShape(shape: SDFShape, rotatesWithCamera = false): string {
  const slug = generateShapeSlug(shape, rotatesWithCamera);

  if (!shapeRegistry.has(slug)) {
    // Extract uniform values
    const uniformValues: Record<string, number> = {};
    for (const u of shape.uniforms) {
      if (u.type === "float" && u.value !== undefined) {
        uniformValues[u.name] = u.value;
      }
    }

    shapeRegistry.set(slug, { shape, uniformValues, rotatesWithCamera, slug });
    shapeIdMap.set(slug, nextShapeId++);
  }

  return slug;
}

/**
 * Gets a registered shape by its slug.
 *
 * @param slug - The shape slug (e.g., "circle", "square#cornerRadius=0.2")
 * @returns The RegisteredShape, or undefined if not registered
 */
export function getRegisteredShape(slug: string): RegisteredShape | undefined {
  return shapeRegistry.get(slug);
}

/**
 * Gets the SDFShape definition from a slug.
 *
 * @param slug - The shape slug
 * @returns The SDFShape definition, or undefined if not registered
 */
export function getShape(slug: string): SDFShape | undefined {
  return shapeRegistry.get(slug)?.shape;
}

/**
 * Gets the numeric ID assigned to a shape variant.
 * Used for GPU-side shape selection in edge shaders.
 *
 * @param slug - The shape slug
 * @returns The shape ID, or -1 if not registered
 */
export function getShapeId(slug: string): number {
  return shapeIdMap.get(slug) ?? -1;
}

/**
 * Gets all registered shape slugs.
 *
 * @returns Array of registered shape slugs
 */
export function getRegisteredShapeSlugs(): string[] {
  return Array.from(shapeRegistry.keys());
}

/**
 * Gets the GLSL code for a specific shape's SDF function.
 *
 * @param slug - The shape slug
 * @returns The GLSL code defining the sdf_{name}() function, or empty string if not found
 */
export function getShapeGLSL(slug: string): string {
  const registered = shapeRegistry.get(slug);
  return registered?.shape.glsl ?? "";
}

/**
 * Deduplicates GLSL code from multiple shapes.
 * Removes duplicate shape definitions and common helper functions (like rotate2D).
 *
 * @param shapes - Iterable of SDFShape objects to process
 * @returns Combined GLSL code with duplicates removed
 */
function deduplicateShapeGLSL(shapes: Iterable<SDFShape>): string {
  const glslParts: string[] = [];
  const seenHelpers = new Set<string>();
  const seenShapes = new Set<string>();

  // Pattern for common helper functions that may be duplicated across shapes
  const rotate2DPattern = /mat2 rotate2D\(float angle\)\s*\{[^}]+\}/;

  for (const shape of shapes) {
    // Skip if we've already included this base shape's GLSL
    if (seenShapes.has(shape.name)) {
      continue;
    }
    seenShapes.add(shape.name);

    // Filter out duplicate helper functions
    let glsl = shape.glsl;
    if (rotate2DPattern.test(glsl)) {
      if (seenHelpers.has("rotate2D")) {
        glsl = glsl.replace(rotate2DPattern, "");
      } else {
        seenHelpers.add("rotate2D");
      }
    }

    glslParts.push(glsl);
  }

  return glslParts.join("\n");
}

/**
 * Gets all registered shapes' GLSL code combined.
 * Used by edge shaders to have access to all node shape SDFs.
 *
 * Note: This deduplicates common helper functions (like rotate2D) that may
 * appear in multiple shape definitions, and also deduplicates shape functions
 * that appear in multiple variants (e.g., "square" and "square#cornerRadius=0.2"
 * both use the same sdf_square function).
 *
 * @returns Combined GLSL code with all shape SDF functions
 */
export function getAllShapeGLSL(): string {
  const shapes = Array.from(shapeRegistry.values()).map((r) => r.shape);
  return deduplicateShapeGLSL(shapes);
}

/**
 * Generates GLSL code for a shape selector function.
 * This function takes a shape ID and UV coordinates and returns the SDF value.
 *
 * Each shape variant (unique slug) gets its own case with:
 * - Actual uniform values (cornerRadius, rotation, etc.) baked in
 * - Counter-rotation applied for shapes that DON'T rotate with camera
 *   (because their node quad is counter-rotated in the vertex shader)
 *
 * @returns GLSL code for the querySDF() function
 */
export function generateShapeSelectorGLSL(): string {
  const shapes = Array.from(shapeRegistry.entries());

  if (shapes.length === 0) {
    // Default fallback when no shapes registered - assume circle
    return /*glsl*/ `
float querySDF(int shapeId, vec2 uv, float size) {
  return length(uv) - size;
}
`;
  }

  // Generate switch statement for shape selection
  // Each shape variant gets its own case with actual param values
  const cases = shapes
    .map(([slug, registered], index) => {
      const { shape, uniformValues, rotatesWithCamera } = registered;

      // Get the ordered float uniform values
      const floatUniforms = shape.uniforms.filter((u) => u.type === "float");
      const paramValues = floatUniforms.map((u) => numberToGLSLFloat(uniformValues[u.name] ?? 0));

      // Build the SDF function call
      let sdfCall: string;
      if (paramValues.length === 0) {
        sdfCall = `sdf_${shape.name}(queryUV, size)`;
      } else {
        sdfCall = `sdf_${shape.name}(queryUV, size, ${paramValues.join(", ")})`;
      }

      // Shapes that don't rotate with camera need counter-rotation:
      // The node quad is rotated by +θ to stay upright, so edge queries need -θ.
      if (!rotatesWithCamera) {
        return `    case ${index}: { // ${slug}
      float c = cos(u_cameraAngle), s = sin(u_cameraAngle);
      vec2 queryUV = mat2(c, -s, s, c) * uv;
      return ${sdfCall};
    }`;
      } else {
        return `    case ${index}: // ${slug}
      return ${sdfCall.replace("queryUV", "uv")};`;
      }
    })
    .join("\n");

  return /*glsl*/ `
float querySDF(int shapeId, vec2 uv, float size) {
  switch (shapeId) {
${cases}
    default: return length(uv) - size; // Default to circle
  }
}
`;
}

/**
 * Gets the combined GLSL code for a specific set of shapes.
 * Used by node programs that support multiple shapes.
 *
 * @param shapes - Array of shapes to include
 * @returns Combined GLSL code with all shape SDF functions
 */
export function getShapeGLSLForShapes(shapes: SDFShape[]): string {
  return deduplicateShapeGLSL(shapes);
}

/**
 * Generates GLSL code for a node shape selector function.
 * Unlike querySDF() for edges, this function:
 * - Works with a specific set of shapes (not all registered shapes)
 * - Sets both context.sdf and context.inradiusFactor
 * - Does NOT apply counter-rotation (vertex shader handles that)
 *
 * For multi-shape programs, the node data texture stores GLOBAL shape IDs
 * (for edge clamping compatibility), but this function uses LOCAL indices
 * in its switch statement. When shapeGlobalIds is provided, a conversion
 * function is generated to map global IDs back to local indices.
 *
 * @param shapes - Array of shapes this program supports
 * @param rotatesWithCamera - Whether nodes rotate with camera
 * @param shapeGlobalIds - Optional array mapping local index to global ID (for multi-shape programs)
 * @returns GLSL code for the queryNodeSDF() function
 */
export function generateNodeShapeSelectorGLSL(
  shapes: SDFShape[],
  _rotatesWithCamera: boolean,
  shapeGlobalIds?: number[],
): string {
  if (shapes.length === 0) {
    // Default fallback - circle
    return /*glsl*/ `
void queryNodeSDF(int shapeId, vec2 uv, float size) {
  context.sdf = length(uv) - size;
  context.inradiusFactor = 1.0;
}
`;
  }

  if (shapes.length === 1) {
    // Single shape - no switch needed
    const shape = shapes[0];
    const floatUniforms = shape.uniforms.filter((u) => u.type === "float") as Array<{ name: string; type: "float"; value: number }>;
    const paramValues = floatUniforms.map((u) => numberToGLSLFloat(u.value ?? 0));

    let sdfCall: string;
    if (paramValues.length === 0) {
      sdfCall = `sdf_${shape.name}(uv, size)`;
    } else {
      sdfCall = `sdf_${shape.name}(uv, size, ${paramValues.join(", ")})`;
    }

    return /*glsl*/ `
void queryNodeSDF(int shapeId, vec2 uv, float size) {
  context.sdf = ${sdfCall};
  context.inradiusFactor = ${numberToGLSLFloat(shape.inradiusFactor ?? 1.0)};
}
`;
  }

  // Multiple shapes - generate switch statement
  // Uses local indices (0, 1, 2, ...) matching the order in the shapes array
  const cases = shapes
    .map((shape, index) => {
      const floatUniforms = shape.uniforms.filter((u) => u.type === "float") as Array<{ name: string; type: "float"; value: number }>;
      const paramValues = floatUniforms.map((u) => numberToGLSLFloat(u.value ?? 0));

      let sdfCall: string;
      if (paramValues.length === 0) {
        sdfCall = `sdf_${shape.name}(uv, size)`;
      } else {
        sdfCall = `sdf_${shape.name}(uv, size, ${paramValues.join(", ")})`;
      }

      const inradiusFactor = numberToGLSLFloat(shape.inradiusFactor ?? 1.0);

      return `    case ${index}: // ${shape.name}
      context.sdf = ${sdfCall};
      context.inradiusFactor = ${inradiusFactor};
      break;`;
    })
    .join("\n");

  // Default case uses first shape
  const defaultShape = shapes[0];
  const defaultFloatUniforms = defaultShape.uniforms.filter((u) => u.type === "float") as Array<{ name: string; type: "float"; value: number }>;
  const defaultParamValues = defaultFloatUniforms.map((u) => numberToGLSLFloat(u.value ?? 0));
  const defaultSdfCall =
    defaultParamValues.length === 0
      ? `sdf_${defaultShape.name}(uv, size)`
      : `sdf_${defaultShape.name}(uv, size, ${defaultParamValues.join(", ")})`;

  // Generate global→local conversion function if shapeGlobalIds is provided
  // This is needed because node data texture stores global IDs (for edge clamping)
  // but the switch statement uses local indices
  let globalToLocalFunction = "";
  let shapeIdExpr = "shapeId";

  if (shapeGlobalIds && shapeGlobalIds.length > 1) {
    const conversionCases = shapeGlobalIds
      .map((globalId, localIndex) => `    case ${globalId}: return ${localIndex}; // ${shapes[localIndex].name}`)
      .join("\n");

    globalToLocalFunction = /*glsl*/ `
int globalToLocalShapeId(int globalId) {
  switch (globalId) {
${conversionCases}
    default: return 0; // Default to first shape
  }
}
`;
    shapeIdExpr = "globalToLocalShapeId(shapeId)";
  }

  return /*glsl*/ `${globalToLocalFunction}
void queryNodeSDF(int shapeId, vec2 uv, float size) {
  switch (${shapeIdExpr}) {
${cases}
    default: // Default to first shape (${defaultShape.name})
      context.sdf = ${defaultSdfCall};
      context.inradiusFactor = ${numberToGLSLFloat(defaultShape.inradiusFactor ?? 1.0)};
  }
}
`;
}

/**
 * Clears the shape registry.
 * Primarily useful for testing.
 */
export function clearShapeRegistry(): void {
  shapeRegistry.clear();
  shapeIdMap.clear();
  nextShapeId = 0;
}
