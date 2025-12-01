/**
 * Sigma.js SDF Shape - Square
 * ============================
 *
 * Signed Distance Field for a square/rounded rectangle shape.
 *
 * @module
 */
import { GLSL_ROTATE_2D } from "../../glsl";
import { SDFShape } from "../types";

export type SquareOptions = {
  cornerRadius?: number;
  rotation?: number;
};

/**
 * Creates a square/rounded rectangle SDF shape.
 *
 * @param options - Configuration options for the square
 * @returns Square SDF shape definition
 *
 * @example
 * ```typescript
 * // Sharp square
 * const square = sdfSquare();
 *
 * // Rounded square
 * const rounded = sdfSquare({ cornerRadius: 0.2 });
 *
 * // Rotated square (45 degrees)
 * const diamond = sdfSquare({ rotation: Math.PI / 4 });
 * ```
 */
export function sdfSquare(options: SquareOptions = {}): SDFShape {
  const { cornerRadius = 0, rotation = 0 } = options;

  // language=GLSL
  const glsl = /*glsl*/ `
${GLSL_ROTATE_2D}
float sdf_square(vec2 uv, float size, float cornerRadius, float rotation) {
  // Apply rotation if needed
  vec2 p = uv;
  if (rotation != 0.0) {
    p = rotate2D(rotation) * p;
  }

  // Distance to box with given corner radius
  // Based on Inigo Quilez's box SDF: https://iquilezles.org/articles/distfunctions2d/
  vec2 d = abs(p) - vec2(size - cornerRadius);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - cornerRadius;
}
`;

  return {
    name: "square",
    glsl,
    uniforms: [
      {
        name: "u_cornerRadius",
        type: "float",
        value: cornerRadius,
      },
      {
        name: "u_rotation",
        type: "float",
        value: rotation,
      },
    ],
    // For axis-aligned square: inradius = circumradius * √2/2
    // (the inscribed circle touches the middle of each side, not the corners)
    inradiusFactor: Math.SQRT1_2,
  };
}
