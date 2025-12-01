/**
 * Sigma.js Edge Extremity - Arrow
 * ================================
 *
 * Arrow head/tail decoration for edges.
 *
 * @module
 */
import { EdgeExtremity } from "../types";

export interface ArrowExtremityOptions {
  /**
   * Arrow length as a ratio of edge thickness.
   * Default: 2.5 (arrow is 2.5x as long as the edge is thick)
   */
  lengthRatio?: number;

  /**
   * Arrow width as a ratio of edge thickness.
   * Default: 2.0 (arrow is 2x as wide as the edge is thick)
   */
  widthRatio?: number;

  /**
   * Gap from node boundary in pixels.
   * Default: 0 (arrow tip touches node boundary)
   */
  margin?: number;
}

/**
 * Creates an arrow extremity (triangular arrow head).
 *
 * The arrow is rendered as a triangle pointing in the direction of travel.
 * Size is relative to edge thickness.
 *
 * @param options - Arrow configuration
 * @returns EdgeExtremity definition for arrow
 *
 * @example
 * ```typescript
 * // Default arrow
 * const EdgeArrowProgram = createEdgeProgram({
 *   path: pathStraight(),
 *   head: extremityArrow(),
 *   tail: extremityNone(),
 *   filling: fillingPlain(),
 * });
 *
 * // Custom arrow with margin
 * const EdgeArrowMarginProgram = createEdgeProgram({
 *   path: pathStraight(),
 *   head: extremityArrow({ lengthRatio: 3, widthRatio: 2.5, margin: 5 }),
 *   tail: extremityNone(),
 *   filling: fillingPlain(),
 * });
 * ```
 */
export function extremityArrow(options: ArrowExtremityOptions = {}): EdgeExtremity {
  const { lengthRatio = 5, widthRatio = 4.0, margin = 0 } = options;

  // language=GLSL
  const glsl = /*glsl*/ `
// Arrow extremity SDF
// uv is in arrow-local coordinates:
//   - x: 0 at base of arrow, lengthRatio at tip
//   - y: perpendicular offset, normalized to [-widthRatio/2, widthRatio/2]
float extremity_arrow(vec2 uv, float lengthRatio, float widthRatio) {
  // Triangle pointing right (positive x direction)
  // Base is at x=0, tip is at x=lengthRatio
  // Width tapers from widthRatio at base to 0 at tip

  float x = uv.x;
  float y = abs(uv.y);

  // If x < 0, we're before the arrow base (in the edge body)
  if (x < 0.0) return -1.0; // Inside

  // If x > lengthRatio, we're past the tip
  if (x > lengthRatio) return x - lengthRatio;

  // Triangle edge: y = widthRatio/2 * (1 - x/lengthRatio)
  float maxY = widthRatio * 0.5 * (1.0 - x / lengthRatio);

  // Distance to triangle edge
  return y - maxY;
}
`;

  return {
    name: "arrow",
    glsl,
    length: lengthRatio,
    widthFactor: widthRatio,
    margin,
    uniforms: [
      { name: "u_arrowLengthRatio", type: "float", value: lengthRatio },
      { name: "u_arrowWidthRatio", type: "float", value: widthRatio },
    ],
    attributes: [],
  };
}
