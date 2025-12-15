/**
 * Sigma.js Fragment Layer - Fill
 * ===============================
 *
 * Simple color fill layer using the node's color attribute.
 *
 * @module
 */
import { colorToGLSLString } from "../../../utils";
import { AttributeSpecification, FragmentLayer } from "../types";

/**
 * Options for the layerFill() function.
 */
export interface LayerFillOptions {
  /**
   * Optional fixed color value (CSS color string).
   * If provided, this color is used instead of the node's color attribute.
   * Takes precedence over colorAttribute.
   */
  value?: string;

  /**
   * Name of the node attribute to read the fill color from.
   * If not specified, uses the default node "color" attribute.
   * Ignored if value is specified.
   * @default "color"
   */
  colorAttribute?: string;
}

/**
 * Creates a fill layer that fills the shape with the node's color.
 * This is typically the base layer for most node programs.
 *
 * @param options - Optional configuration
 * @returns Fill layer definition
 *
 * @example
 * ```typescript
 * // Use node color (default)
 * const program = createNodeProgram({
 *   shape: sdfCircle(),
 *   layers: [layerFill()],
 * });
 *
 * // Use fixed color
 * const redProgram = createNodeProgram({
 *   shape: sdfCircle(),
 *   layers: [layerFill({ value: "#ff0000" })],
 * });
 *
 * // Use a custom attribute
 * const customProgram = createNodeProgram({
 *   shape: sdfCircle(),
 *   layers: [layerFill({ colorAttribute: "fillColor" })],
 * });
 * ```
 */
export function layerFill({ value, colorAttribute }: Partial<LayerFillOptions> = {}): FragmentLayer {
  const { UNSIGNED_BYTE } = WebGL2RenderingContext;

  // If a fixed value is provided, no attributes needed
  if (value) {
    // language=GLSL
    const glsl = `
vec4 layer_fill() {
  return ${colorToGLSLString(value)};
}
`;
    return {
      name: "fill",
      uniforms: [],
      attributes: [],
      glsl,
    };
  }

  // Use attribute-based color (either custom or default "color")
  const source = colorAttribute || "color";

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
