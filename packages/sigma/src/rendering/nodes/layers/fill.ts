/**
 * Sigma.js Fragment Layer - Fill
 * ===============================
 *
 * Simple color fill layer using the node's color attribute.
 *
 * @module
 */
import { colorToGLSLString } from "../../../utils";
import { FragmentLayer } from "../types";

/**
 * Options for the layerFill() function.
 */
export interface LayerFillOptions {
  /**
   * Optional fixed color value (CSS color string).
   * If provided, this color is used instead of the node's color attribute.
   */
  value?: string;
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
 * ```
 */
export function layerFill({ value }: Partial<LayerFillOptions> = {}): FragmentLayer {
  // language=GLSL
  const glsl = `
vec4 layer_fill() {
  // Return the node's base color (v_color is a standard varying) or the fixed value if given
  return ${value ? colorToGLSLString(value) : `v_color`};
}
`;

  return {
    name: "fill",
    uniforms: [],
    attributes: [],
    glsl,
  };
}
