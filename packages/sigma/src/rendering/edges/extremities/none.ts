/**
 * Sigma.js Edge Extremity - None
 * ===============================
 *
 * No decoration at edge endpoint.
 *
 * @module
 */
import { EdgeExtremity } from "../types";

/**
 * Creates an empty extremity (no decoration).
 *
 * Use this for edges that should simply end without any arrow or marker.
 *
 * @returns EdgeExtremity definition for no decoration
 *
 * @example
 * ```typescript
 * const EdgeLineProgram = createEdgeProgram({
 *   path: pathStraight(),
 *   head: extremityNone(),
 *   tail: extremityNone(),
 *   filling: fillingPlain(),
 * });
 * ```
 */
export function extremityNone(): EdgeExtremity {
  // language=GLSL
  const glsl = /*glsl*/ `
// No extremity - always returns positive (outside)
float extremity_none(vec2 uv, float lengthRatio, float widthRatio) {
  return 1.0;
}
`;

  return {
    name: "none",
    glsl,
    length: 0,
    widthFactor: 1.0,
    margin: 0,
    uniforms: [],
    attributes: [],
  };
}
