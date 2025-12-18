/**
 * Sigma.js SDF Shape - Circle
 * ============================
 *
 * Signed Distance Field for a circle shape.
 *
 * @module
 */
import { defineNodeShape } from "./factory";
import { SDFShape } from "../types";

/**
 * Schema for circle shape options (empty - no configurable properties).
 */
export const circleSchema = {} as const;

// Register the circle shape schema for type inference
declare module "../../../primitives/schema" {
  interface NodeShapeSchemaRegistry {
    circle: typeof circleSchema;
  }
}

/**
 * Circle shape definition with schema.
 */
export const circleDefinition = defineNodeShape("circle", circleSchema, (): SDFShape => {
  // language=GLSL
  const glsl = /*glsl*/ `
float sdf_circle(vec2 uv, float size) {
  return length(uv) - size;
}
`;

  return {
    name: "circle",
    glsl,
    uniforms: [],
  };
});

/**
 * Creates a circle SDF shape.
 * A circle has no configurable options - it's always a perfect circle.
 *
 * @returns Circle SDF shape definition
 *
 * @example
 * ```typescript
 * const circleShape = sdfCircle();
 * const program = createNodeProgram({
 *   shape: circleShape,
 *   layers: [layerFill()],
 * });
 * ```
 */
export const sdfCircle = circleDefinition.factory;
