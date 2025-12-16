/**
 * Sigma.js Node Border Layer
 * ==========================
 *
 * Fragment layer for rendering borders around nodes.
 * Works with any SDF shape from the composable node program system.
 *
 * @module
 */
import { AttributeSpecification, FragmentLayer, UniformSpecification, Vec4, numberToGLSLFloat } from "sigma/rendering";
import { colorToArray } from "sigma/utils";

import { BorderColor, BorderSize, LayerBorderOptions } from "./types";

/**
 * Converts a CSS color string to a Vec4 (normalized RGBA).
 */
function colorToVec4(color: string): Vec4 {
  const [r, g, b, a] = colorToArray(color);
  return [r / 255, g / 255, b / 255, a / 255];
}

/**
 * Type guards for BorderColor variants
 */
function isTransparentColor(color: BorderColor): color is { transparent: true } {
  return typeof color === "object" && "transparent" in color;
}

function isFixedColor(color: BorderColor): color is string {
  return typeof color === "string";
}

function isAttributeColor(color: BorderColor): color is { attribute: string; default?: string } {
  return typeof color === "object" && "attribute" in color;
}

/**
 * Type guards for BorderSize variants
 */
function isFillSize(size: BorderSize): size is { fill: true } {
  return typeof size === "object" && "fill" in size;
}

function isAttributeSize(
  size: BorderSize,
): size is { attribute: string; default?: number; mode?: "relative" | "pixels" } {
  return typeof size === "object" && "attribute" in size;
}

/**
 * Generates the GLSL code for the border layer function.
 * Uses the global `context` struct for context (sdf, shapeSize, aaWidth, pixelSize).
 */
function generateBorderGLSL(borders: LayerBorderOptions["borders"]): string {
  const fillCount = borders.filter(({ size }) => isFillSize(size)).length;
  const fillCountGLSL = numberToGLSLFloat(fillCount || 1); // Avoid division by zero

  // Generate size calculation code (using context.shapeSize and context.pixelSize)
  const sizeCalculations = borders
    .flatMap(({ size }, i) => {
      if (isFillSize(size)) return [];

      // Determine value and mode based on size type
      let value: string;
      let isPixelMode: boolean;

      if (isAttributeSize(size)) {
        value = `v_borderSize_${i + 1}`;
        isPixelMode = size.mode === "pixels";
      } else {
        value = numberToGLSLFloat(size.value);
        isPixelMode = size.mode === "pixels";
      }

      // For relative mode: multiply by context.shapeHalfSize (size is a fraction 0-1 of the shape)
      // For pixels mode: convert pixels to UV space using context.pixelToUV
      if (isPixelMode) {
        return [`  float borderSize_${i + 1} = ${value} * context.pixelToUV;`];
      } else {
        return [`  float borderSize_${i + 1} = context.shapeHalfSize * ${value};`];
      }
    })
    .join("\n");

  // Generate non-fill size sum for fill calculation
  const nonFillSizes = borders.flatMap(({ size }, i) => (!isFillSize(size) ? [`borderSize_${i + 1}`] : [])).join(" + ");
  const nonFillSizesExpr = nonFillSizes || "0.0";

  // Generate fill border sizes
  const fillSizeCalculations = borders
    .flatMap(({ size }, i) => (isFillSize(size) ? [`  float borderSize_${i + 1} = fillBorderSize;`] : []))
    .join("\n");

  // Generate cumulative boundary calculations (from outside to inside)
  // In SDF space: boundary_0 = 0.0 (shape edge), boundaries go negative (inside)
  const boundaryCalculations = borders
    .map((_, i) => `  float boundary_${i + 1} = boundary_${i} - borderSize_${i + 1};`)
    .join("\n");

  // Generate color assignments
  const colorAssignments = borders
    .map(({ color }, i) => {
      if (isTransparentColor(color)) {
        return `  vec4 borderColor_${i + 1} = vec4(0.0, 0.0, 0.0, 0.0);`;
      } else if (isAttributeColor(color)) {
        return `  vec4 borderColor_${i + 1} = v_borderColor_${i + 1};`;
      } else {
        // Fixed color string - use uniform
        return `  vec4 borderColor_${i + 1} = u_borderColor_${i + 1};`;
      }
    })
    .join("\n");

  // Generate color adjustments (bias and skip tiny borders)
  // Use 2.0 * context.aaWidth as threshold to match internal AA band width
  // For the first border (i=0), fall back to itself (no borderColor_0)
  const colorAdjustments = borders
    .map(
      (_, i) => `  borderColor_${i + 1}.a *= bias;
  if (borderSize_${i + 1} <= 2.0 * context.aaWidth) { borderColor_${i + 1} = ${i === 0 ? `borderColor_1` : `borderColor_${i}`}; }`,
    )
    .join("\n");

  // Generate the color selection logic with antialiasing
  // In SDF space: context.sdf > 0 means outside, context.sdf < 0 means inside
  // boundary_0 = 0.0, boundary_1 = -borderSize_1, etc.
  const colorSelection = borders
    .map((_, i) => {
      if (i === 0) {
        // First border: no AA at outer edge (generator handles that)
        // Solid color from shape edge (sdf=0) down to boundary_1
        return `if (context.sdf > boundary_1) {
    color = borderColor_1;
  } else `;
      } else {
        // Internal borders: AA transition between border colors using 2x context.aaWidth
        // The AA band spans from boundary_i to boundary_i - 2*aaWidth
        return `if (context.sdf > boundary_${i} - 2.0 * context.aaWidth) {
    color = mix(borderColor_${i + 1}, borderColor_${i}, (context.sdf - boundary_${i} + 2.0 * context.aaWidth) / (2.0 * context.aaWidth));
  } else if (context.sdf > boundary_${i + 1}) {
    color = borderColor_${i + 1};
  } else `;
      }
    })
    .join("");

  // Build function parameters: attributes first (as varyings), then uniforms
  // This order must match what the generator produces in generator.ts
  const attributeParams = [
    ...borders.flatMap(({ color }, i) => (isAttributeColor(color) ? [`vec4 v_borderColor_${i + 1}`] : [])),
    ...borders.flatMap(({ size }, i) => (isAttributeSize(size) ? [`float v_borderSize_${i + 1}`] : [])),
  ];

  const uniformParams = borders.flatMap(({ color }, i) => (isFixedColor(color) ? [`vec4 u_borderColor_${i + 1}`] : []));

  // Combine all params with proper formatting
  const allParams = [...attributeParams, ...uniformParams].join(", ");

  // Check if the first border uses an attribute (dynamic size)
  const firstBorderUsesAttribute = isAttributeSize(borders[0].size);

  // Build the complete GLSL function
  // Context (sdf, shapeSize, aaWidth, pixelSize) accessed via global context struct
  // language=GLSL
  const glsl = /*glsl*/ `
vec4 layer_border(${allParams}) {
  const float bias = 255.0 / 254.0;

  // Calculate border sizes (using context.shapeSize and context.pixelSize)
${sizeCalculations}
${
  firstBorderUsesAttribute
    ? `
  // Early return if first border size is effectively zero (layer disabled)
  if (borderSize_1 <= context.aaWidth) {
    return vec4(0.0);
  }
`
    : ""
}
  // Calculate fill border size (distribute remaining space)
  // Use inradiusFactor to get actual shape depth from the bounding size
  // For circle/square (inradiusFactor=1.0), this equals shapeSize
  // For triangle (inradiusFactor=0.5), this is half of shapeSize
  float shapeDepth = context.shapeSize * context.inradiusFactor;
  float fillBorderSize = (shapeDepth - (${nonFillSizesExpr})) / ${fillCountGLSL};
${fillSizeCalculations}

  // Calculate cumulative boundaries (from outside to inside in SDF space)
  float boundary_0 = 0.0;  // Shape edge at context.sdf=0
${boundaryCalculations}

  // Set up colors
${colorAssignments}
${colorAdjustments}

  // Select color based on SDF position with antialiasing
  // Note: outer edge AA (context.sdf > 0 transition) is handled by the composed generator's smoothstep
  vec4 color = vec4(0.0);
  ${colorSelection}{ color = borderColor_${borders.length}; }

  return color;
}
`;

  return glsl;
}

/**
 * Creates a border layer that renders one or more concentric borders around a shape.
 * The borders follow the contour of whatever SDF shape is used.
 *
 * @param options - Border configuration options
 * @returns FragmentLayer definition
 *
 * @example
 * ```typescript
 * // Simple border with fill
 * const borderLayer = layerBorder({
 *   borders: [
 *     { size: 0.1, color: { attribute: "borderColor" } },
 *     { size: { fill: true }, color: { attribute: "color" } },
 *   ],
 * });
 *
 * // Use with createNodeProgram
 * const program = createNodeProgram({
 *   shapes: [sdfSquare({ cornerRadius: 0.1 })],
 *   layers: [borderLayer],
 * });
 * ```
 */
export function layerBorder(options: LayerBorderOptions): FragmentLayer {
  const { borders } = options;
  const { UNSIGNED_BYTE, FLOAT } = WebGL2RenderingContext;

  // Generate uniforms for fixed-value colors (direct string values)
  const uniforms: UniformSpecification[] = borders.flatMap(({ color }, i) =>
    isFixedColor(color) ? [{ name: `u_borderColor_${i + 1}`, type: "vec4" as const, value: colorToVec4(color) }] : [],
  );

  // Generate attributes for attribute-based colors/sizes
  const attributes: AttributeSpecification[] = [
    ...borders.flatMap(({ color }, i) =>
      isAttributeColor(color)
        ? [
            {
              name: `borderColor_${i + 1}`,
              size: 4 as const,
              type: UNSIGNED_BYTE,
              normalized: true,
              source: color.attribute,
            },
          ]
        : [],
    ),
    ...borders.flatMap(({ size }, i) =>
      isAttributeSize(size)
        ? [
            {
              name: `borderSize_${i + 1}`,
              size: 1 as const,
              type: FLOAT,
              source: size.attribute,
              defaultValue: size.default,
            },
          ]
        : [],
    ),
  ];

  return {
    name: "border",
    uniforms,
    attributes,
    glsl: generateBorderGLSL(borders),
  };
}
