/**
 * Sigma.js Edge Filling - Plain
 * ==============================
 *
 * Solid color filling for edges.
 *
 * @module
 */
import { EdgeFilling } from "../types";

/**
 * Creates a plain solid color filling.
 *
 * The edge is rendered with its assigned color (from EdgeDisplayData.color).
 *
 * @returns EdgeFilling definition for solid color
 *
 * @example
 * ```typescript
 * const EdgeLineProgram = createEdgeProgram({
 *   path: pathLine(),
 *   head: extremityNone(),
 *   tail: extremityNone(),
 *   filling: fillingPlain(),
 * });
 * ```
 */
export function fillingPlain(): EdgeFilling {
  // language=GLSL
  const glsl = /*glsl*/ `
// Plain solid color filling
vec4 filling_plain(EdgeContext ctx) {
  return v_color;
}
`;

  return {
    name: "plain",
    glsl,
    uniforms: [],
    attributes: [],
  };
}
