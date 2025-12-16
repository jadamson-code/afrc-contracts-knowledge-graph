/**
 * Sigma.js Fragment Layer - Fill
 * ===============================
 *
 * Simple color fill layer using the node's color attribute.
 *
 * @module
 */
import { colorToGLSLString } from "../../../utils";
import { FragmentLayer, ValueSource, isAttributeSource } from "../types";

/**
 * Options for the layerFill() function.
 */
export interface LayerFillOptions {
  /**
   * Color source: either a fixed CSS color string or an attribute reference.
   * - String: Fixed color value (e.g., "#ff0000")
   * - Object with `attribute`: Read from node attribute (e.g., { attribute: "fillColor" })
   *
   * @default { attribute: "color" }
   */
  color?: ValueSource<string>;
}

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
export function layerFill({ color }: LayerFillOptions = {}): FragmentLayer {
  const { UNSIGNED_BYTE } = WebGL2RenderingContext;

  // Default to reading from "color" attribute
  const colorSource: ValueSource<string> = color ?? { attribute: "color" };

  // If a fixed value is provided, no attributes needed
  if (!isAttributeSource(colorSource)) {
    // language=GLSL
    const glsl = `
vec4 layer_fill() {
  return ${colorToGLSLString(colorSource)};
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
}
