/**
 * Sigma.js Edge Path - Line
 * =========================
 *
 * Straight line path for edges.
 * This is the simplest path type, rendered as a quad.
 *
 * @module
 */
import { defineEdgePath } from "./factory";
import { EdgePath } from "../types";

/**
 * Schema for line path options (empty - no configurable properties).
 */
export const lineSchema = {} as const;

// Register the line path schema for type inference
declare module "../../../primitives/schema" {
  interface EdgePathSchemaRegistry {
    straight: typeof lineSchema;
  }
}

/**
 * Line path definition with schema.
 */
export const lineDefinition = defineEdgePath("straight", lineSchema, (): EdgePath => {
  // language=GLSL
  const glsl = /*glsl*/ `
// Position at parameter t ∈ [0, 1]
vec2 path_line_position(float t, vec2 source, vec2 target) {
  return mix(source, target, t);
}

// Total length of the path (analytical - more efficient than sampling)
float path_line_length(vec2 source, vec2 target) {
  return length(target - source);
}
`;

  return {
    name: "line",
    segments: 1, // Simple quad
    minBodyLengthRatio: 0, // No minimum for straight edges
    linearParameterization: true, // t maps directly to arc distance
    glsl,
    vertexGlsl: "", // No special vertex logic needed for straight edges
    uniforms: [],
    attributes: [],
  };
});

/**
 * Creates a straight line edge path.
 *
 * Line edges are the most efficient, rendered as a single quad (6 vertices).
 * All path functions have closed-form solutions.
 *
 * @returns EdgePath definition for straight lines
 *
 * @example
 * ```typescript
 * const EdgeLineProgram = createEdgeProgram({
 *   paths: [pathLine()],
 *   extremities: [extremityNone()],
 *   layers: [layerPlain()],
 * });
 * ```
 */
export const pathLine = lineDefinition.factory;
