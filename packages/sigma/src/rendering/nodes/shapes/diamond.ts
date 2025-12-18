/**
 * Sigma.js SDF Shape - Diamond
 * =============================
 *
 * Signed Distance Field for a diamond (rhombus) shape.
 *
 * @module
 */
import { FactoryOptionsFromSchema, numberProp } from "../../../primitives";
import { defineNodeShape } from "./factory";
import { GLSL_ROTATE_2D } from "../../glsl";
import { SDFShape } from "../types";

/**
 * Schema for diamond shape options.
 */
export const diamondSchema = {
  cornerRadius: numberProp(0, { variable: true }),
  rotation: numberProp(0, { variable: true }),
} as const;

// Register the diamond shape schema for type inference
declare module "../../../primitives/schema" {
  interface NodeShapeSchemaRegistry {
    diamond: typeof diamondSchema;
  }
}

/**
 * Factory options derived from schema.
 */
export type DiamondOptions = FactoryOptionsFromSchema<typeof diamondSchema>;

/**
 * Extracts a number from a ValueSource or returns the default.
 */
function resolveNumber(value: unknown, defaultValue: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "attribute" in value) return defaultValue;
  return defaultValue;
}

/**
 * Diamond shape definition with schema.
 */
export const diamondDefinition = defineNodeShape("diamond", diamondSchema, (options): SDFShape => {
  const { cornerRadius, rotation } = options ?? {};

  const cornerRadiusValue = resolveNumber(cornerRadius, 0);
  const rotationValue = resolveNumber(rotation, 0);

  // language=GLSL
  const glsl = /*glsl*/ `
${GLSL_ROTATE_2D}
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
        value: cornerRadiusValue,
      },
      {
        name: "u_rotation",
        type: "float",
        value: rotationValue,
      },
    ],
    // For diamond (square rotated 45°): inradius = circumradius * √2/2
    inradiusFactor: Math.SQRT1_2,
  };
});

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
export const sdfDiamond = diamondDefinition.factory;
