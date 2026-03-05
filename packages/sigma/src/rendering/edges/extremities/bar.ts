/**
 * Sigma.js Edge Extremity - Bar
 * ==============================
 *
 * Bar / tee (flat perpendicular line) head/tail decoration for edges.
 *
 * @module
 */
import { EdgeExtremity } from "../types";

/**
 * Options for bar extremity creation.
 */
export interface BarExtremityOptions {
  lengthRatio?: number;
  widthRatio?: number;
  margin?: number;
}

/**
 * Creates a bar extremity (perpendicular flat line / tee shape).
 *
 * The bar is a thin rectangle perpendicular to the edge direction.
 */
export function extremityBar(options?: BarExtremityOptions): EdgeExtremity {
  const { lengthRatio = 0.75, widthRatio = 4, margin = 0 } = options ?? {};

  // language=GLSL
  const glsl = /*glsl*/ `
// Box SDF (same geometry as square, different defaults)
float extremity_bar(vec2 uv, float lengthRatio, float widthRatio) {
  float halfW = widthRatio * 0.5;

  // Box SDF: distance to rectangle [0, lengthRatio] × [-halfW, halfW]
  vec2 center = vec2(lengthRatio * 0.5, 0.0);
  vec2 halfSize = vec2(lengthRatio * 0.5, halfW);
  vec2 d = abs(uv - center) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
`;

  return {
    name: "bar",
    glsl,
    length: lengthRatio,
    widthFactor: widthRatio,
    margin,
    baseRatio: 1.0,
    uniforms: [],
    attributes: [],
  };
}
