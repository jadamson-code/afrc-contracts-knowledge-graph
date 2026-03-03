/**
 * Sigma.js Edge Layer - Dashed
 * ============================
 *
 * Dashed pattern layer for edges with antialiased boundaries.
 *
 * @module
 */
import { colorToVec4 } from "../../../utils";
import { ValueSource, Vec3, Vec4 } from "../../nodes";
import { EdgeLayer } from "../types";

/**
 * Mode for border size specification.
 * - "relative": Size is a fraction of the edge thickness (0.0 to 1.0)
 * - "pixels": Size is in screen pixels
 */
export type DashSizeMode = "relative" | "pixels";
export const DEFAULT_DASH_SIZE_MODE: DashSizeMode = "pixels";

/**
 * Represents a dash-related value.
 * - { value, mode? }: Fixed value
 * - { attribute, default?, mode? }: Read from node attribute
 */
export type DashSize =
  | { value: number; mode?: DashSizeMode }
  | { attribute: string; default?: number; mode?: DashSizeMode };

/**
 * Specifies how gaps between dashes should be rendered.
 * - 0: Fully transparent gaps
 * - number (0-1): Same color as dash but with this opacity
 * - string: CSS color for gaps (constant for all edges)
 * - { attribute, default? }: Per-edge attribute name for gap color
 */
export type GapFilling = number | ValueSource<string>;

/**
 * Specifies which extremities should be rendered solid (not dashed).
 */
export type SolidExtremities = boolean | "head" | "tail";

/**
 * Specifies solid margin at each end of the edge.
 */
export type SolidMargin = number | { head?: number; tail?: number };

/**
 * Options for the dashed layer.
 */
export interface LayerDashedOptions {
  /**
   * Size of each dash.
   * Default: { value: 10, mode: 'pixels' }
   */
  dashSize?: DashSize;

  /**
   * Custom dash color:
   * - String: Fixed color value (e.g., "#ff0000")
   * - Object with `attribute`: Read from node attribute (e.g., { attribute: "fillColor" })
   *
   * @default { attribute: "color" }
   */
  dashColor?: ValueSource<string>;

  /**
   * Offset to shift the dash pattern along the edge.
   * Default: { value: 0, mode: 'pixels' }
   */
  dashOffset?: DashSize;

  /**
   * Size of gaps between dashes.
   * Default: { value: 10, mode: 'pixels' }
   */
  gapSize?: DashSize;

  /**
   * How gaps should be filled:
   * - 0: Fully transparent gaps (default)
   * - number (0-1): Same color as dash but with this opacity
   * - string: CSS color for gaps (constant for all edges)
   * - { attribute: string }: Per-edge attribute name for gap color
   *
   * Default: 0
   */
  gapColor?: GapFilling;

  /**
   * Controls where the dash pattern is anchored along the edge:
   * - 0: Pattern starts at the beginning of the edge
   * - 0.5: Pattern is centered on the edge (default)
   * - 1: Pattern ends at the end of the edge
   *
   * Default: 0.5
   */
  align?: number;

  /**
   * Render extremity zones with solid color instead of dashes.
   * - true: Both head and tail extremities are solid
   * - "head": Only head (target) extremity is solid
   * - "tail": Only tail (source) extremity is solid
   * - false: Dashes continue through extremities (default)
   *
   * Default: false
   */
  solidExtremities?: SolidExtremities;

  /**
   * Extra solid margin (in pixels) before the dash pattern starts.
   * This is in addition to the extremity zone when solidExtremities is enabled.
   * - number: Same margin on both ends
   * - { head?: number, tail?: number }: Different margins for each end
   *
   * Default: 0
   */
  solidMargin?: SolidMargin;
}

/**
 * Gap mode constants for shader.
 */
const GAP_MODE_OPACITY = 0;
const GAP_MODE_CONSTANT_COLOR = 1;
const GAP_MODE_ATTRIBUTE_COLOR = 2;
type GapMode = 0 | 1 | 2;

/**
 * Parses the solidExtremities option.
 */
function parseSolidExtremities(value: SolidExtremities | undefined): { tail: boolean; head: boolean } {
  if (value === undefined || value === false) {
    return { tail: false, head: false };
  }
  if (value === true) {
    return { tail: true, head: true };
  }
  if (value === "head") {
    return { tail: false, head: true };
  }
  // value === "tail"
  return { tail: true, head: false };
}

/**
 * Parses the solidMargin option.
 */
function parseSolidMargin(value: SolidMargin | undefined): { tail: number; head: number } {
  if (value === undefined) {
    return { tail: 0, head: 0 };
  }
  if (typeof value === "number") {
    return { tail: value, head: value };
  }
  return { tail: value.tail ?? 0, head: value.head ?? 0 };
}

/**
 * Creates a dashed pattern edge layer.
 *
 * The layer renders edges with customizable dash patterns, supporting variable
 * dash and gap sizes, custom colors, alignment options, and solid extremity zones.
 *
 * @param options - Dash pattern configuration
 * @returns EdgeLayer definition for dashed edges
 */
export function layerDashed(options?: LayerDashedOptions): EdgeLayer {
    const opts = options ?? {};
    const dashColor = opts.dashColor ?? { attribute: "color" };
    const gapColor = opts.gapColor ?? 0;
    const sizes = {
      dashSize: opts.dashSize ?? { value: 10, mode: "pixels" },
      gapSize: opts.gapSize ?? { value: 10, mode: "pixels" },
      dashOffset: opts.dashOffset ?? { value: 0, mode: "pixels" },
    };
    const align = opts.align ?? 0.5;
    const solidExtremities = parseSolidExtremities(opts.solidExtremities);
    const solidMargin = parseSolidMargin(opts.solidMargin);

  // Parse custom dash color if provided
  const hasCustomColor = typeof dashColor === "string";
  let constantDashColor: Vec4 = [0, 0, 0, 0];
  if (hasCustomColor) {
    constantDashColor = colorToVec4(dashColor);
  }

  // Encode mode as vec3: 0.0 = pixels, 1.0 = ratio (relative to thickness)
  const sizeMode = [sizes.dashSize, sizes.gapSize, sizes.dashOffset].map((dashSize) =>
    (dashSize.mode ?? DEFAULT_DASH_SIZE_MODE) === "relative" ? 1 : 0,
  ) as Vec3;

  // Build uniforms list
  const uniforms: EdgeLayer["uniforms"] = [
    { name: "u_sizeMode", type: "vec3", value: sizeMode },
    { name: "u_align", type: "float", value: align },
    // Solid extremities: vec2(tail, head) as 0.0 or 1.0
    {
      name: "u_solidExtremities",
      type: "vec2",
      value: [solidExtremities.tail ? 1.0 : 0.0, solidExtremities.head ? 1.0 : 0.0],
    },
    // Solid margin: vec2(tail margin in pixels, head margin in pixels)
    { name: "u_solidMargin", type: "vec2", value: [solidMargin.tail, solidMargin.head] },
    // Custom dash color: vec4 (premultiplied alpha) and mode flag
    { name: "u_dashColor", type: "vec4", value: constantDashColor },
  ];

  const attributes: EdgeLayer["attributes"] = [];
  let gapColorGLSL: string;
  let gapMode: GapMode;

  // Opacity mode for gaps:
  if (typeof gapColor === "number") {
    gapMode = GAP_MODE_OPACITY;
    uniforms.push({ name: "u_gapOpacity", type: "float", value: gapColor });
    // language=GLSL
    gapColorGLSL = /*glsl*/ `
  float gapAlpha = dashColor.a * u_gapOpacity;
  gapColor = vec4(dashColor.rgb, gapAlpha);
    `;
  }

  // Constant color mode for gaps:
  else if (typeof gapColor === "string") {
    gapMode = GAP_MODE_CONSTANT_COLOR;
    uniforms.push({
      name: "u_gapColor",
      type: "vec4",
      value: colorToVec4(gapColor),
    });
    // language=GLSL
    gapColorGLSL = /*glsl*/ `
  gapColor = u_gapColor;
    `;
  }

  // Attribute color mode for gaps:
  else {
    gapMode = GAP_MODE_ATTRIBUTE_COLOR;
    attributes.push({
      name: "a_gapColor",
      size: 4,
      type: WebGL2RenderingContext.UNSIGNED_BYTE,
      normalized: true,
      source: gapColor.attribute,
      defaultValue: gapColor.default,
    });
    // language=GLSL
    gapColorGLSL = /*glsl*/ `
  gapColor = v_gapColor;
    `;
  }

  uniforms.push({ name: "u_gapMode", type: "float", value: gapMode });

  if (typeof dashColor === "object" && "attribute" in dashColor) {
    attributes.push({
      name: "a_dashColor",
      size: 4,
      type: WebGL2RenderingContext.UNSIGNED_BYTE,
      normalized: true,
      source: dashColor.attribute,
    });
  }

  // Track which parameters use attributes for conditional GLSL generation
  const hasDashSizeAttr = !("value" in sizes.dashSize);
  const hasGapSizeAttr = !("value" in sizes.gapSize);
  const hasDashOffsetAttr = !("value" in sizes.dashOffset);

  (["dashSize", "gapSize", "dashOffset"] as const).forEach((key) => {
    if ("value" in sizes[key]) {
      uniforms.push({
        name: `u_${key}`,
        type: "float",
        value: sizes[key].value,
      });
    } else {
      attributes.push({
        name: `a_${key}`,
        size: 1,
        type: WebGL2RenderingContext.FLOAT,
        source: sizes[key].attribute,
      });
      uniforms.push({
        name: `u_${key}`,
        type: "float",
        value: sizes[key].default ?? 0,
      });
    }
  });

  // Helper to generate GLSL for reading dash size values
  // When attribute is used: read from varying, fall back to uniform if 0
  // When constant: just use the uniform
  const getDashSizeGLSL = (name: string, hasAttr: boolean) =>
    hasAttr ? `(v_${name} > 0.0 ? v_${name} : u_${name})` : `u_${name}`;

  // language=GLSL
  const glsl = /*glsl*/ `
// Dashed pattern layer with antialiased boundaries
// Uniforms:
//   u_dashSize: size of each dash (or default when using attribute)
//   u_gapSize: size of gaps between dashes (or default when using attribute)
//   u_dashOffset: offset to shift the pattern (or default when using attribute)
//   u_sizeMode: vec3 indicating if values are thickness-relative (x=dash, y=gap, z=offset)
//   u_gapMode: 0.0=opacity, 1.0=constant color, 2.0=attribute color
//   u_gapOpacity: opacity for gap when gapMode=0
//   u_gapColor: color for gap when gapMode=1
//   u_align: pattern alignment (0=start, 0.5=center, 1=end)
//   u_solidExtremities: vec2(tail, head) - 1.0 means solid, 0.0 means dashed
//   u_solidMargin: vec2(tail, head) - extra solid margin in pixels
//   u_dashColor: custom dash color (premultiplied alpha)
${typeof dashColor === "object" && "attribute" in dashColor ? "// Varying: v_dashColor for per-edge dash color" : ""}
${gapMode === GAP_MODE_ATTRIBUTE_COLOR ? "// Varying: v_gapColor for per-edge gap color" : ""}
${hasDashSizeAttr ? "// Varying: v_dashSize for per-edge dash size" : ""}
${hasGapSizeAttr ? "// Varying: v_gapSize for per-edge gap size" : ""}
${hasDashOffsetAttr ? "// Varying: v_dashOffset for per-edge dash offset" : ""}

vec4 layer_dashed(EdgeContext ctx) {
  // Get dash color (either custom or edge color)
  vec4 dashColor = ${hasCustomColor ? "u_dashColor" : "v_dashColor"};

  // Check for solid zones first (extremities and margins)
  // v_zone: 0=tail extremity, 1=body, 2=head extremity
  // v_tailLengthRatio and v_headLengthRatio give extremity lengths as ratio of thickness

  // Tail solid zone check
  if (u_solidExtremities.x > 0.5 && v_zone < 0.5) {
    // In tail extremity zone and solidExtremities.tail is enabled
    return dashColor;
  }
  // Head solid zone check
  if (u_solidExtremities.y > 0.5 && v_zone > 1.5) {
    // In head extremity zone and solidExtremities.head is enabled
    return dashColor;
  }

  // Compute extremity lengths in world units for margin calculation
  float tailExtremityLength = v_tailLengthRatio * ctx.thickness;
  float headExtremityLength = v_headLengthRatio * ctx.thickness;

  // Convert pixel margins to world units (same formula as thickness conversion)
  float tailMarginWorld = u_solidMargin.x * u_correctionRatio / u_sizeRatio;
  float headMarginWorld = u_solidMargin.y * u_correctionRatio / u_sizeRatio;

  // Tail margin check (margin starts after extremity zone)
  float tailSolidZone = (u_solidExtremities.x > 0.5 ? tailExtremityLength : 0.0) + tailMarginWorld;
  if (ctx.distanceFromSource < tailSolidZone) {
    return dashColor;
  }

  // Head margin check (margin starts before extremity zone)
  float headSolidZone = (u_solidExtremities.y > 0.5 ? headExtremityLength : 0.0) + headMarginWorld;
  if (ctx.distanceToTarget < headSolidZone) {
    return dashColor;
  }

  // Get dash size values (from attribute if available, otherwise uniform)
  float dashSizeValue = ${getDashSizeGLSL("dashSize", hasDashSizeAttr)};
  float gapSizeValue = ${getDashSizeGLSL("gapSize", hasGapSizeAttr)};
  float dashOffsetValue = ${getDashSizeGLSL("dashOffset", hasDashOffsetAttr)};

  // Compute actual sizes (either in pixels converted to world units, or relative to thickness)
  float pixelToWorld = u_correctionRatio / u_sizeRatio;
  float dashSize = dashSizeValue * (u_sizeMode.x > 0.5 ? ctx.thickness : pixelToWorld);
  float gapSize = gapSizeValue * (u_sizeMode.y > 0.5 ? ctx.thickness : pixelToWorld);
  float dashOffset = dashOffsetValue * (u_sizeMode.z > 0.5 ? ctx.thickness : pixelToWorld);

  // Early return when no visible dash pattern:
  // - dashSize ≈ 0: no dashes to show, return transparent (let plain layer show through)
  // - gapSize ≈ 0: all dash/no gap, effectively solid, return transparent (let plain layer handle it)
  if (dashSize < 0.001 || gapSize < 0.001) {
    return vec4(0.0);
  }

  // Pattern length is dash + gap
  float patternLength = dashSize + gapSize;

  // Adjust distances for solid zones (pattern starts after solid zones)
  float adjustedDistFromSource = ctx.distanceFromSource - tailSolidZone;
  float adjustedDistToTarget = ctx.distanceToTarget - headSolidZone;

  // Compute alignment anchor point
  // - align: 0 → anchor at start, pattern begins with a dash
  // - align: 1 → anchor at end, pattern ends with a dash
  // - align: 0.5 → anchor at center, pattern is symmetric
  float dashedLength = adjustedDistFromSource + adjustedDistToTarget;
  float anchorDist = u_align * dashedLength;

  // Position within the repeating pattern
  // By subtracting anchorDist, we ensure the anchor point maps to position 0 in the pattern
  // This avoids the unstable mod(dashedLength, patternLength) operation
  float posInPattern = mod(adjustedDistFromSource - anchorDist + dashOffset, patternLength);

  // Compute signed distance field for the dash
  // Positive inside dash, negative inside gap
  float sdf;
  if (posInPattern < dashSize) {
    // Inside dash region [0, dashSize)
    float distToDashStart = posInPattern;
    float distToDashEnd = dashSize - posInPattern;
    sdf = min(distToDashStart, distToDashEnd);
  } else {
    // Inside gap region [dashSize, patternLength)
    float distFromDashEnd = posInPattern - dashSize;
    float distToNextDashStart = patternLength - posInPattern;
    sdf = -min(distFromDashEnd, distToNextDashStart);
  }

  // Apply antialiasing using smoothstep
  // aaWidth is in world units, same as our distance
  float dashAlpha = smoothstep(-ctx.aaWidth, ctx.aaWidth, sdf);

  // Determine gap color based on mode (using float comparisons for compatibility)
  // Note: All colors must be non-premultiplied (straight alpha) to match v_color and blendOver
  vec4 gapColor;
${gapColorGLSL}

  // Blend between gap and dash colors
  return mix(gapColor, dashColor, dashAlpha);
}
`;

    return {
      name: "dashed",
      glsl,
      uniforms,
      attributes,
    };
}
