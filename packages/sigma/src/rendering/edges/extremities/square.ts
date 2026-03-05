/**
 * Sigma.js Edge Extremity - Square
 * ==================================
 *
 * Square head/tail decoration for edges.
 *
 * @module
 */
import { EdgeExtremity } from "../types";

/**
 * Options for square extremity creation.
 */
export interface SquareExtremityOptions {
  lengthRatio?: number;
  widthRatio?: number;
  margin?: number;
}

/**
 * Creates a square extremity (filled square/rectangle).
 *
 * The square extends from x=0 to x=lengthRatio and
 * from y=-widthRatio/2 to y=widthRatio/2.
 */
export function extremitySquare(options?: SquareExtremityOptions): EdgeExtremity {
  const { lengthRatio = 4, widthRatio = 4, margin = 0 } = options ?? {};

  // language=GLSL
  const glsl = /*glsl*/ `
// Box SDF (same geometry as bar, different defaults)
float extremity_square(vec2 uv, float lengthRatio, float widthRatio) {
  float halfW = widthRatio * 0.5;
  vec2 center = vec2(lengthRatio * 0.5, 0.0);
  vec2 halfSize = vec2(lengthRatio * 0.5, halfW);
  vec2 d = abs(uv - center) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
`;

  return {
    name: "square",
    glsl,
    length: lengthRatio,
    widthFactor: widthRatio,
    margin,
    baseRatio: 1.0,
    uniforms: [],
    attributes: [],
  };
}
