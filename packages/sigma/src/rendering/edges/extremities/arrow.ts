/**
 * Sigma.js Edge Extremity - Arrow
 * ================================
 *
 * Arrow head/tail decoration for edges.
 *
 * @module
 */
import { FactoryOptionsFromSchema, numberProp } from "../../../primitives";
import { defineEdgeExtremity } from "./factory";
import { EdgeExtremity } from "../types";

/**
 * Schema for arrow extremity options.
 */
export const arrowSchema = {
  lengthRatio: numberProp(5),
  widthRatio: numberProp(4.0),
  margin: numberProp(0),
} as const;

// Register the arrow extremity schema for type inference
declare module "../../../primitives/schema" {
  interface EdgeExtremitySchemaRegistry {
    arrow: typeof arrowSchema;
  }
}

/**
 * Options for arrow extremity creation.
 */
export type ArrowExtremityOptions = FactoryOptionsFromSchema<typeof arrowSchema>;

/**
 * Arrow extremity definition with schema.
 */
export const arrowDefinition = defineEdgeExtremity("arrow", arrowSchema, (options): EdgeExtremity => {
  const { lengthRatio = 5, widthRatio = 4.0, margin = 0 } = options ?? {};

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
});

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
 * // Arrow with default settings
 * const EdgeArrowProgram = createEdgeProgram({
 *   paths: [pathLine()],
 *   extremities: [extremityNone(), extremityArrow()],
 *   layers: [layerPlain()],
 * });
 *
 * // Custom arrow with margin
 * const EdgeArrowMarginProgram = createEdgeProgram({
 *   paths: [pathLine()],
 *   extremities: [extremityNone(), extremityArrow({ lengthRatio: 3, widthRatio: 2.5, margin: 5 })],
 *   layers: [layerPlain()],
 * });
 * ```
 */
export const extremityArrow = arrowDefinition.factory;
