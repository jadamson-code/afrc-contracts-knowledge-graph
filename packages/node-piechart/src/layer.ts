/**
 * Sigma.js Node Piechart Layer
 * ============================
 *
 * Fragment layer for rendering piechart nodes.
 * Works with any SDF shape from the composable node program system.
 *
 * @module
 */
import { AttributeSpecification, FragmentLayer, UniformSpecification, Vec4, numberToGLSLFloat } from "sigma/rendering";
import { colorToArray } from "sigma/utils";

import { DEFAULT_COLOR, LayerPiechartOptions, PiechartOffset } from "./types";

const TWO_PI = 2 * Math.PI;

/**
 * Converts a CSS color string to a Vec4 (normalized RGBA).
 */
function colorToVec4(color: string): Vec4 {
  const [r, g, b, a] = colorToArray(color);
  return [r / 255, g / 255, b / 255, a / 255];
}

/**
 * Generates the GLSL code for the piechart layer function.
 * Uses the global `context` struct for context (sdf, uv, etc.).
 */
function generatePiechartGLSL(slices: LayerPiechartOptions["slices"], offset: PiechartOffset): string {
  // Build function parameters: attributes first (as varyings), then uniforms
  // This order must match what the generator produces in generator.ts
  const attributeParams = [
    ...("attribute" in offset ? ["float v_offset"] : []),
    ...slices.flatMap(({ color }, i) => ("attribute" in color ? [`vec4 v_sliceColor_${i + 1}`] : [])),
    ...slices.flatMap(({ value }, i) => ("attribute" in value ? [`float v_sliceValue_${i + 1}`] : [])),
  ];

  const uniformParams = [
    "float u_cameraAngle",
    ...("value" in offset ? ["float u_offset"] : []),
    "vec4 u_defaultColor",
    ...slices.flatMap(({ color }, i) => ("value" in color ? [`vec4 u_sliceColor_${i + 1}`] : [])),
  ];

  // Combine all params with proper formatting
  const allParams = [...attributeParams, ...uniformParams].join(", ");

  // Generate color assignments
  const colorAssignments = slices
    .map(({ color }, i) => {
      if ("attribute" in color) {
        return `  vec4 sliceColor_${i + 1} = v_sliceColor_${i + 1};`;
      } else if ("transparent" in color) {
        return `  vec4 sliceColor_${i + 1} = vec4(0.0, 0.0, 0.0, 0.0);`;
      } else {
        return `  vec4 sliceColor_${i + 1} = u_sliceColor_${i + 1};`;
      }
    })
    .join("\n");

  // Generate color bias adjustments
  const colorBiasAdjustments = slices.map((_, i) => `  sliceColor_${i + 1}.a *= bias;`).join("\n");

  // Generate value assignments
  const valueAssignments = slices
    .map(
      ({ value }, i) =>
        `  float sliceValue_${i + 1} = ${"attribute" in value ? `v_sliceValue_${i + 1}` : numberToGLSLFloat(value.value)};`,
    )
    .join("\n");

  // Generate total calculation
  const totalCalc = slices.map((_, i) => `sliceValue_${i + 1}`).join(" + ");

  // Generate angle calculations and color selection
  const angleCalculations = slices
    .map(
      (_, i) => `    float angle_${i + 1} = angle_${i} + sliceValue_${i + 1} * ${numberToGLSLFloat(TWO_PI)} / total;`,
    )
    .join("\n");

  const colorSelections = slices
    .map((_, i) => `if (angle < angle_${i + 1}) color = sliceColor_${i + 1};`)
    .join("\n    else ");

  // Build the complete GLSL function
  // language=GLSL
  const glsl = /*glsl*/ `
vec4 layer_piechart(${allParams}) {
  const float bias = 255.0 / 254.0;
  float offsetValue = ${"attribute" in offset ? "v_offset" : "u_offset"};

  // Calculate angle from UV coordinates
  // atan2(y, x) gives angle in [-PI, PI], we convert to [0, 2*PI]
  float angle = atan(context.uv.y, context.uv.x);
  if (angle < 0.0) angle += ${numberToGLSLFloat(TWO_PI)};

  // Apply camera angle rotation and offset
  angle = angle - u_cameraAngle + offsetValue;
  angle = mod(angle, ${numberToGLSLFloat(TWO_PI)});

  // Set up colors
${colorAssignments}
${colorBiasAdjustments}

  // Set up values
${valueAssignments}

  // Calculate angles and select color
  float total = ${totalCalc};
  float angle_0 = 0.0;
  vec4 color = u_defaultColor;
  color.a *= bias;

  if (total > 0.0) {
${angleCalculations}
    ${colorSelections}
  }

  return color;
}
`;

  return glsl;
}

/**
 * Creates a piechart layer that renders slices around a shape.
 * The piechart follows the contour of whatever SDF shape is used.
 *
 * @param options - Piechart configuration options
 * @returns FragmentLayer definition
 *
 * @example
 * ```typescript
 * // Simple piechart with fixed colors
 * const piechartLayer = layerPiechart({
 *   slices: [
 *     { color: { value: "#ff0000" }, value: { attribute: "value1" } },
 *     { color: { value: "#00ff00" }, value: { attribute: "value2" } },
 *     { color: { value: "#0000ff" }, value: { attribute: "value3" } },
 *   ],
 * });
 *
 * // Use with createComposedNodeProgram
 * const program = createComposedNodeProgram({
 *   shape: sdfCircle(),
 *   layers: [piechartLayer],
 * });
 * ```
 */
export function layerPiechart(options: LayerPiechartOptions): FragmentLayer {
  const { slices, offset = { value: 0 }, defaultColor = DEFAULT_COLOR } = options;
  const { UNSIGNED_BYTE, FLOAT } = WebGL2RenderingContext;

  // Generate uniforms
  const uniforms: UniformSpecification[] = [
    // Camera angle for rotation (standard uniform passed to layer)
    { name: "u_cameraAngle", type: "float" as const, value: 0 },
    // Offset uniform (if value-based)
    ...("value" in offset ? [{ name: "u_offset", type: "float" as const, value: offset.value }] : []),
    // Default color uniform
    { name: "u_defaultColor", type: "vec4" as const, value: colorToVec4(defaultColor) },
    // Slice color uniforms (if value-based)
    ...slices.flatMap(({ color }, i) =>
      "value" in color
        ? [{ name: `u_sliceColor_${i + 1}`, type: "vec4" as const, value: colorToVec4(color.value) }]
        : [],
    ),
  ];

  // Generate attributes
  const attributes: AttributeSpecification[] = [
    // Offset attribute (if attribute-based)
    ...("attribute" in offset
      ? [
          {
            name: "offset",
            size: 1 as const,
            type: FLOAT,
            source: offset.attribute,
          },
        ]
      : []),
    // Slice color attributes (if attribute-based)
    ...slices.flatMap(({ color }, i) =>
      "attribute" in color
        ? [
            {
              name: `sliceColor_${i + 1}`,
              size: 4 as const,
              type: UNSIGNED_BYTE,
              normalized: true,
              source: color.attribute,
              defaultValue: color.defaultValue || DEFAULT_COLOR,
            },
          ]
        : [],
    ),
    // Slice value attributes (if attribute-based)
    ...slices.flatMap(({ value }, i) =>
      "attribute" in value
        ? [
            {
              name: `sliceValue_${i + 1}`,
              size: 1 as const,
              type: FLOAT,
              source: value.attribute,
            },
          ]
        : [],
    ),
  ];

  return {
    name: "piechart",
    uniforms,
    attributes,
    glsl: generatePiechartGLSL(slices, offset),
  };
}
