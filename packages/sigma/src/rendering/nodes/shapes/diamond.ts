/**
 * Sigma.js SDF Shape - Diamond
 * =============================
 *
 * Signed Distance Field for a diamond (rhombus) shape.
 *
 * @module
 */
import { SDFShape } from "../types";

export type DiamondOptions = {
  cornerRadius?: number;
  rotation?: number;
};

/**
 * Creates a diamond (rhombus) SDF shape.
 *
 * @param options - Configuration options for the diamond
 * @returns Diamond SDF shape definition
 *
 * @example
 * ```typescript
 * // Sharp diamond
 * const diamond = sdfDiamond();
 *
 * // Rounded diamond
 * const rounded = sdfDiamond({ cornerRadius: 0.1 });
 *
 * // Rotated diamond
 * const rotated = sdfDiamond({ rotation: Math.PI / 4 });
 * ```
 */
export function sdfDiamond(options: DiamondOptions = {}): SDFShape {
  const { cornerRadius = 0, rotation = 0 } = options;

  // language=GLSL
  const glsl = /*glsl*/ `
// 2D rotation matrix
mat2 rotate2D(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float sdf_diamond(vec2 uv, float size, float cornerRadius, float rotation) {
  // Apply rotation if needed
  vec2 p = uv;
  if (rotation != 0.0) {
    p = rotate2D(rotation) * p;
  }

  // Diamond SDF - using rhombus formula from Inigo Quilez
  // https://iquilezles.org/articles/distfunctions2d/
  // For a diamond (square rotated 45°), b = (size, size)
  vec2 b = vec2(size, -size);
  p = abs(p);
  float h = clamp((dot(b, p) + b.y * b.y) / dot(b, b), 0.0, 1.0);
  p -= b * vec2(h, h - 1.0);
  float d = length(p) * sign(p.x);

  // Apply corner radius if specified
  if (cornerRadius > 0.0) {
    d = d + cornerRadius;
  }

  return d;
}
`;

  return {
    name: "diamond",
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
    // For diamond (square rotated 45°): inradius = circumradius * √2/2
    inradiusFactor: Math.SQRT1_2,
  };
}
