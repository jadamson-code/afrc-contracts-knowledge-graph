/**
 * Sigma.js Edge Layer - Plain
 * ===========================
 *
 * Solid color layer for edges.
 *
 * @module
 */
import { defineEdgeLayer } from "./factory";
import { EdgeLayer } from "../types";

/**
 * Schema for plain layer options (empty - no configurable properties).
 */
export const plainSchema = {} as const;

// Register the plain layer schema for type inference
declare module "../../../primitives/schema" {
  interface EdgeLayerSchemaRegistry {
    plain: typeof plainSchema;
  }
}

/**
 * Plain layer definition with schema.
 */
export const plainDefinition = defineEdgeLayer("plain", plainSchema, (): EdgeLayer => {
  // language=GLSL
  const glsl = /*glsl*/ `
// Plain solid color layer
vec4 layer_plain(EdgeContext ctx) {
  return v_color;
}
`;

  return {
    name: "plain",
    glsl,
    uniforms: [],
    attributes: [],
  };
});

/**
 * Creates a plain solid color layer.
 *
 * The edge is rendered with its assigned color (from EdgeDisplayData.color).
 *
 * @returns EdgeLayer definition for solid color
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
export const layerPlain = plainDefinition.factory;
