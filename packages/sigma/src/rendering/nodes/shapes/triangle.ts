/**
 * Sigma.js SDF Shape - Triangle
 * ==============================
 *
 * Signed Distance Field for an equilateral triangle shape.
 *
 * @module
 */
import { ValueSource } from "../types";
import { GLSL_ROTATE_2D } from "../../glsl";
import { SDFShape } from "../types";

export interface TriangleOptions {
  cornerRadius?: ValueSource<number>;
  rotation?: ValueSource<number>;
}

/**
 * Extracts a number from a ValueSource or returns the default.
 */
function resolveNumber(value: unknown, defaultValue: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "attribute" in value) return defaultValue;
  return defaultValue;
}

/**
 * Creates an equilateral triangle SDF shape.
 *
 * @param options - Configuration options for the triangle
 * @returns Triangle SDF shape definition
 *
 * @example
 * ```typescript
 * // Sharp triangle pointing up
 * const triangle = sdfTriangle();
 *
 * // Rounded triangle
 * const rounded = sdfTriangle({ cornerRadius: 0.1 });
 *
 * // Triangle pointing down
 * const inverted = sdfTriangle({ rotation: Math.PI });
 * ```
 */
export function sdfTriangle(options?: TriangleOptions): SDFShape {
  const { cornerRadius, rotation } = options ?? {};

  const cornerRadiusValue = resolveNumber(cornerRadius, 0);
  const rotationValue = resolveNumber(rotation, 0);

  // language=GLSL
  const glsl = /*glsl*/ `
${GLSL_ROTATE_2D}
float sdf_triangle(vec2 uv, float size, float cornerRadius, float rotation) {
  // Apply rotation if needed
  vec2 p = uv;
  if (rotation != 0.0) {
    p = rotate2D(rotation) * p;
  }

  // Equilateral triangle SDF
  // Based on Inigo Quilez's triangle SDF: https://iquilezles.org/articles/distfunctions2d/
  //
  // The IQ formula uses parameter 'r' where the triangle has width = 2r.
  // For circumradius R (distance from centroid to vertex):
  //   R = r * 2 / sqrt(3), so r = R * sqrt(3) / 2
  const float k = sqrt(3.0);
  float r = size * k / 2.0;

  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) {
    p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  }
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  float dist = -length(p) * sign(p.y);

  // Apply corner radius if specified
  if (cornerRadius > 0.0) {
    dist = dist + cornerRadius;
  }

  return dist;
}
`;

  return {
    name: "triangle",
    glsl,
    uniforms: [
      {
        name: "u_cornerRadius",
        type: "float",
        value: cornerRadiusValue,
      },
      {
        name: "u_rotation",
        type: "float",
        value: rotationValue,
      },
    ],
    // For equilateral triangle: inradius = circumradius / 2
    inradiusFactor: 0.5,
  };
}
