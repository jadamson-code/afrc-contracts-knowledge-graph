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
// Arrow SDF: triangle with base at x=0, tip at x=lengthRatio
// uv.x: 0 (base) to lengthRatio (tip), uv.y: [-halfW, +halfW]
// Returns signed distance (negative inside, positive outside)
float extremity_arrow(vec2 uv, float lengthRatio, float widthRatio) {
  float x = uv.x;
  float y = abs(uv.y);
  float halfW = widthRatio * 0.5;

  // Past the tip: euclidean distance to tip point
  if (x > lengthRatio) {
    return length(vec2(x - lengthRatio, y));
  }

  // Back edge: signed distance to x=0 line
  float backDist = -x;

  // Side edge: signed distance to sloped triangle edge
  float clampedX = max(0.0, x);
  float maxY = halfW * (1.0 - clampedX / lengthRatio);
  float sideDist = y - maxY;

  // Convex shape SDF = max of half-plane distances
  return max(backDist, sideDist);
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
