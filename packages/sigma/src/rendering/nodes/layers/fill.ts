/**
 * Sigma.js Fragment Layer - Fill
 * ===============================
 *
 * Simple color fill layer using the node's color attribute.
 *
 * @module
 */
import { FactoryOptionsFromSchema, colorProp } from "../../../primitives";
import { colorToGLSLString } from "../../../utils";
import { FragmentLayer, isAttributeSource } from "../types";
import { defineNodeLayer } from "./factory";

/**
 * Schema for fill layer options.
 */
export const fillSchema = {
  color: colorProp("#000000", { variable: true }),
} as const;

// Register the fill layer schema for type inference
declare module "../../../primitives/schema" {
  interface NodeLayerSchemaRegistry {
    fill: typeof fillSchema;
  }
}

/**
 * Factory options derived from schema.
 */
export type LayerFillOptions = FactoryOptionsFromSchema<typeof fillSchema>;

/**
 * Fill layer definition with schema.
 */
export const fillDefinition = defineNodeLayer("fill", fillSchema, (options): FragmentLayer => {
  const { UNSIGNED_BYTE } = WebGL2RenderingContext;

  // Default to reading from "color" attribute
  const colorSource = options?.color ?? { attribute: "color" };

  // If a fixed value is provided, no attributes needed
  if (!isAttributeSource(colorSource)) {
    // At this point, colorSource is a string (fixed color value)
    const colorString = colorSource as string;
    // language=GLSL
    const glsl = `
vec4 layer_fill() {
  return ${colorToGLSLString(colorString)};
}
`;
    return {
      name: "fill",
      uniforms: [],
      attributes: [],
      glsl,
    };
  }

  // Use attribute-based color
  const source = colorSource.attribute;

  // language=GLSL
  const glsl = `
vec4 layer_fill(vec4 v_fillColor) {
  return v_fillColor;
}
`;

  return {
    name: "fill",
    uniforms: [],
    attributes: [
      {
        name: "fillColor",
        size: 4 as const,
        type: UNSIGNED_BYTE,
        normalized: true,
        source,
      },
    ],
    glsl,
  };
});

/**
 * Creates a fill layer that fills the shape with a color.
 * This is typically the base layer for most node programs.
 *
 * @param options - Optional configuration
 * @returns Fill layer definition
 *
 * @example
 * ```typescript
 * // Use node color (default)
 * const program = createNodeProgram({
 *   shapes: [sdfCircle()],
 *   layers: [layerFill()],
 * });
 *
 * // Use fixed color
 * const redProgram = createNodeProgram({
 *   shapes: [sdfCircle()],
 *   layers: [layerFill({ color: "#ff0000" })],
 * });
 *
 * // Use a custom attribute
 * const customProgram = createNodeProgram({
 *   shapes: [sdfCircle()],
 *   layers: [layerFill({ color: { attribute: "fillColor" } })],
 * });
 * ```
 */
export const layerFill = fillDefinition.factory;
