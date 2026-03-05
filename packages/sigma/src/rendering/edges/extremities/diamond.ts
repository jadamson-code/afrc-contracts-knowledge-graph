/**
 * Sigma.js Edge Extremity - Diamond
 * ==================================
 *
 * Diamond (rhombus) head/tail decoration for edges.
 *
 * @module
 */
import { EdgeExtremity } from "../types";

/**
 * Options for diamond extremity creation.
 */
export interface DiamondExtremityOptions {
  lengthRatio?: number;
  widthRatio?: number;
  margin?: number;
}

/**
 * Creates a diamond extremity (rhombus shape).
 *
 * The diamond has its left vertex at x=0, right vertex at x=lengthRatio,
 * and top/bottom vertices at ±widthRatio/2.
 */
export function extremityDiamond(options?: DiamondExtremityOptions): EdgeExtremity {
  const { lengthRatio = 5, widthRatio = 4, margin = 0 } = options ?? {};

  // language=GLSL
  const glsl = /*glsl*/ `
// Diamond SDF: rhombus with vertices at (0,0), (L/2, W/2), (L, 0), (L/2, -W/2)
float extremity_diamond(vec2 uv, float lengthRatio, float widthRatio) {
  float halfL = lengthRatio * 0.5;
  float halfW = widthRatio * 0.5;

  // Center the diamond at (halfL, 0)
  vec2 p = abs(uv - vec2(halfL, 0.0));

  // Diamond is the set |x/halfL| + |y/halfW| <= 1
  // Signed distance: (p.x/halfL + p.y/halfW - 1) * normalization
  float d = p.x / halfL + p.y / halfW - 1.0;

  // Scale by the distance from center to edge along the gradient direction
  float norm = length(vec2(1.0 / halfL, 1.0 / halfW));
  return d / norm;
}
`;

  return {
    name: "diamond",
    glsl,
    length: lengthRatio,
    widthFactor: widthRatio,
    margin,
    uniforms: [],
    attributes: [],
  };
}
