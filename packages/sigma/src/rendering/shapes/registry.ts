/**
 * Sigma.js Shape Registry
 * ========================
 *
 * Global registry for SDF shapes used by both node and edge programs.
 * Edge programs use this registry to access node shape SDFs for shape-aware
 * edge clamping (edges stopping at node boundaries).
 *
 * @module
 */
import { SDFShape } from "../nodes/types";

/**
 * Global registry mapping shape names to their SDF definitions.
 */
const shapeRegistry = new Map<string, SDFShape>();

/**
 * Map of shape names to their numeric IDs for GPU-side shape selection.
 * IDs are assigned incrementally as shapes are registered.
 */
const shapeIdMap = new Map<string, number>();
let nextShapeId = 0;

/**
 * Registers a shape in the global registry.
 * Called automatically by createNodeProgram() when a node program is created.
 *
 * @param shape - The SDF shape to register
 */
export function registerShape(shape: SDFShape): void {
  if (!shapeRegistry.has(shape.name)) {
    shapeRegistry.set(shape.name, shape);
    shapeIdMap.set(shape.name, nextShapeId++);
  }
}

/**
 * Gets a shape from the registry by name.
 *
 * @param name - The shape name (e.g., "circle", "square")
 * @returns The SDFShape definition, or undefined if not registered
 */
export function getShape(name: string): SDFShape | undefined {
  return shapeRegistry.get(name);
}

/**
 * Gets the numeric ID assigned to a shape.
 * Used for GPU-side shape selection in edge shaders.
 *
 * @param name - The shape name
 * @returns The shape ID, or -1 if not registered
 */
export function getShapeId(name: string): number {
  return shapeIdMap.get(name) ?? -1;
}

/**
 * Gets all registered shape names.
 *
 * @returns Array of registered shape names
 */
export function getRegisteredShapeNames(): string[] {
  return Array.from(shapeRegistry.keys());
}

/**
 * Gets the GLSL code for a specific shape's SDF function.
 *
 * @param name - The shape name
 * @returns The GLSL code defining the sdf_{name}() function, or empty string if not found
 */
export function getShapeGLSL(name: string): string {
  const shape = shapeRegistry.get(name);
  return shape?.glsl ?? "";
}

/**
 * Gets all registered shapes' GLSL code combined.
 * Used by edge shaders to have access to all node shape SDFs.
 *
 * Note: This deduplicates common helper functions (like rotate2D) that may
 * appear in multiple shape definitions.
 *
 * @returns Combined GLSL code with all shape SDF functions
 */
export function getAllShapeGLSL(): string {
  const glslParts: string[] = [];
  const seenHelpers = new Set<string>();

  shapeRegistry.forEach((shape) => {
    // Filter out duplicate helper functions that may be included in multiple shapes
    let glsl = shape.glsl;

    // Check for common helpers and deduplicate
    const rotate2DPattern = /mat2 rotate2D\(float angle\)\s*\{[^}]+\}/;
    if (rotate2DPattern.test(glsl)) {
      if (seenHelpers.has("rotate2D")) {
        // Remove the duplicate
        glsl = glsl.replace(rotate2DPattern, "");
      } else {
        seenHelpers.add("rotate2D");
      }
    }

    glslParts.push(glsl);
  });
  return glslParts.join("\n");
}

/**
 * Generates GLSL code for a shape selector function.
 * This function takes a shape ID and UV coordinates and returns the SDF value.
 *
 * For edge clamping, we use default values for shape-specific parameters
 * (like cornerRadius, rotation) since we just need the basic shape boundary.
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
  // Each shape needs to be called with appropriate default parameters
  const cases = shapes
    .map(([name, shape], index) => {
      // Determine the default parameter values for this shape
      const paramCount = shape.uniforms.filter((u) => u.type === "float").length;

      if (paramCount === 0) {
        return `    case ${index}: return sdf_${name}(uv, size);`;
      } else if (paramCount === 1) {
        // Shapes with 1 param (e.g., triangle rotation) - use 0.0 as default
        return `    case ${index}: return sdf_${name}(uv, size, 0.0);`;
      } else if (paramCount === 2) {
        // Shapes with 2 params (e.g., square cornerRadius, rotation) - use 0.0 for both
        return `    case ${index}: return sdf_${name}(uv, size, 0.0, 0.0);`;
      } else {
        // Fallback for shapes with more params
        const defaults = Array(paramCount).fill("0.0").join(", ");
        return `    case ${index}: return sdf_${name}(uv, size, ${defaults});`;
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
 * Generates GLSL code for a shape selector that includes additional parameters.
 * This version passes shape-specific uniforms as additional parameters.
 *
 * Note: For shape-aware edge clamping, we typically use the basic querySDF()
 * since we only need to know where the node boundary is, not the exact
 * corner radius or rotation.
 *
 * @returns GLSL code for the querySDFWithParams() function
 */
export function generateShapeSelectorWithParamsGLSL(): string {
  const shapes = Array.from(shapeRegistry.entries());

  if (shapes.length === 0) {
    return /*glsl*/ `
float querySDFWithParams(int shapeId, vec2 uv, float size, float param1, float param2) {
  return length(uv) - size;
}
`;
  }

  // Generate switch statement with parameter passing
  const cases = shapes
    .map(([name, shape], index) => {
      // Determine how many params the shape needs
      const paramCount = shape.uniforms.filter((u) => u.type === "float").length;

      if (paramCount === 0) {
        return `    case ${index}: return sdf_${name}(uv, size);`;
      } else if (paramCount === 1) {
        return `    case ${index}: return sdf_${name}(uv, size, param1);`;
      } else {
        return `    case ${index}: return sdf_${name}(uv, size, param1, param2);`;
      }
    })
    .join("\n");

  return /*glsl*/ `
float querySDFWithParams(int shapeId, vec2 uv, float size, float param1, float param2) {
  switch (shapeId) {
${cases}
    default: return length(uv) - size;
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
