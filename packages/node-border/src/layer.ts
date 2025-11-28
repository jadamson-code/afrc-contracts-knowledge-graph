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

import { BorderSize, DEFAULT_BORDER_SIZE_MODE, LayerBorderOptions } from "./types";

/**
 * Converts a CSS color string to a Vec4 (normalized RGBA).
 */
function colorToVec4(color: string): Vec4 {
  const [r, g, b, a] = colorToArray(color);
  return [r / 255, g / 255, b / 255, a / 255];
}

/**
 * Generates the GLSL code for the border layer function.
 * Uses the global `context` struct for context (sdf, shapeSize, aaWidth, pixelSize).
 */
function generateBorderGLSL(borders: LayerBorderOptions["borders"]): string {
  const fillCount = borders.filter(({ size }) => "fill" in size).length;
  const fillCountGLSL = numberToGLSLFloat(fillCount || 1); // Avoid division by zero

  // Generate size calculation code (using context.shapeSize and context.pixelSize)
  const sizeCalculations = borders
    .flatMap(({ size }, i) => {
      if ("fill" in size) return [];

      size = size as Exclude<BorderSize, { fill: true }>;
      const value = "attribute" in size ? `v_borderSize_${i + 1}` : numberToGLSLFloat(size.value);
      // For relative mode: multiply by context.shapeSize (size is a fraction 0-1 of the shape)
      // For pixels mode: convert pixels to UV space using context.pixelToUV
      //   - context.pixelToUV converts screen pixels to UV units
      //   - Multiply by 2.0 because pixel values are interpreted as radius (distance from boundary)
      const mode = size.mode || DEFAULT_BORDER_SIZE_MODE;
      if (mode === "pixels") {
        return [`  float borderSize_${i + 1} = ${value} * context.pixelToUV;`];
      } else {
        return [`  float borderSize_${i + 1} = context.shapeHalfSize * ${value};`];
      }
    })
    .join("\n");

  // Generate non-fill size sum for fill calculation
  const nonFillSizes = borders.flatMap(({ size }, i) => (!("fill" in size) ? [`borderSize_${i + 1}`] : [])).join(" + ");
  const nonFillSizesExpr = nonFillSizes || "0.0";

  // Generate fill border sizes
  const fillSizeCalculations = borders
    .flatMap(({ size }, i) => ("fill" in size ? [`  float borderSize_${i + 1} = fillBorderSize;`] : []))
    .join("\n");

  // Generate cumulative boundary calculations (from outside to inside)
  // In SDF space: boundary_0 = 0.0 (shape edge), boundaries go negative (inside)
  const boundaryCalculations = borders
    .map((_, i) => `  float boundary_${i + 1} = boundary_${i} - borderSize_${i + 1};`)
    .join("\n");

  // Generate color assignments
  const colorAssignments = borders
    .map(({ color }, i) => {
      if ("attribute" in color) {
        return `  vec4 borderColor_${i + 1} = v_borderColor_${i + 1};`;
      } else if ("transparent" in color) {
        return `  vec4 borderColor_${i + 1} = vec4(0.0, 0.0, 0.0, 0.0);`;
      } else {
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
    ...borders.flatMap(({ color }, i) => ("attribute" in color ? [`vec4 v_borderColor_${i + 1}`] : [])),
    ...borders.flatMap(({ size }, i) => ("attribute" in size ? [`float v_borderSize_${i + 1}`] : [])),
  ];

  const uniformParams = borders.flatMap(({ color }, i) => ("value" in color ? [`vec4 u_borderColor_${i + 1}`] : []));

  // Combine all params with proper formatting
  const allParams = [...attributeParams, ...uniformParams].join(", ");

  // Build the complete GLSL function
  // Context (sdf, shapeSize, aaWidth, pixelSize) accessed via global context struct
  // language=GLSL
  const glsl = /*glsl*/ `
vec4 layer_border(${allParams}) {
  const float bias = 255.0 / 254.0;

  // Calculate border sizes (using context.shapeSize and context.pixelSize)
${sizeCalculations}

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
 *     { size: { value: 0.1 }, color: { attribute: "borderColor" } },
 *     { size: { fill: true }, color: { attribute: "color" } },
 *   ],
 * });
 *
 * // Use with createNodeProgram
 * const program = createNodeProgram({
 *   shape: sdfSquare({ cornerRadius: 0.1 }),
 *   layers: [borderLayer],
 * });
 * ```
 */
export function layerBorder(options: LayerBorderOptions): FragmentLayer {
  const { borders } = options;
  const { UNSIGNED_BYTE, FLOAT } = WebGL2RenderingContext;

  // Generate uniforms for fixed-value colors
  const uniforms: UniformSpecification[] = [
    // Always include u_correctionRatio for pixel-mode borders
    // (it's also in standard uniforms, but we need access in the layer)
    ...borders.flatMap(({ color }, i) =>
      "value" in color
        ? [{ name: `u_borderColor_${i + 1}`, type: "vec4" as const, value: colorToVec4(color.value) }]
        : [],
    ),
  ];

  // Generate attributes for attribute-based colors/sizes
  const attributes: AttributeSpecification[] = [
    ...borders.flatMap(({ color }, i) =>
      "attribute" in color
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
      "attribute" in size
        ? [
            {
              name: `borderSize_${i + 1}`,
              size: 1 as const,
              type: FLOAT,
              source: size.attribute,
              defaultValue: size.defaultValue,
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
