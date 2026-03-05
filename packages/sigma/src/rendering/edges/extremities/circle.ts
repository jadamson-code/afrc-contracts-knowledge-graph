/**
 * Sigma.js Edge Extremity - Circle
 * =================================
 *
 * Circle (filled dot) head/tail decoration for edges.
 *
 * @module
 */
import { EdgeExtremity } from "../types";

/**
 * Options for circle extremity creation.
 */
export interface CircleExtremityOptions {
  lengthRatio?: number;
  widthRatio?: number;
  margin?: number;
}

/**
 * Creates a circle extremity (filled dot).
 *
 * The circle is centered at (radius, 0) so that it starts at the edge body
 * and extends outward. The radius is half the lengthRatio × thickness.
 */
export function extremityCircle(options?: CircleExtremityOptions): EdgeExtremity {
  const { lengthRatio = 4, widthRatio = lengthRatio + 1, margin = 0 } = options ?? {};

  // language=GLSL
  const glsl = /*glsl*/ `
// Circle SDF: circle centered at (lengthRatio/2, 0) with radius = lengthRatio/2
// uv.x: 0 (base) to lengthRatio (far edge), uv.y: [-halfW, +halfW]
float extremity_circle(vec2 uv, float lengthRatio, float widthRatio) {
  float radius = lengthRatio * 0.5;
  vec2 center = vec2(radius, 0.0);
  return length(uv - center) - radius;
}
`;

  return {
    name: "circle",
    glsl,
    length: lengthRatio,
    widthFactor: widthRatio,
    margin,
    uniforms: [],
    attributes: [],
  };
}
