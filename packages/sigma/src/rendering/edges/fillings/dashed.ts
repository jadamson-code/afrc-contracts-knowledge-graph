/**
 * Sigma.js Edge Filling - Dashed
 * ===============================
 *
 * Dashed pattern filling for edges with antialiased boundaries.
 *
 * @module
 */
import { parseColor } from "../../../utils";
import { Vec3, Vec4 } from "../../nodes/types";
import { EdgeFilling } from "../types";

/**
 * Represents a dash-related value that can be specified either
 * in absolute pixels or relative to the edge thickness.
 */
export type DashValue =
  | number
  | {
      /** Value as a multiple of edge thickness */
      thicknessRelative: number;
    };

/**
 * Specifies how gaps between dashes should be rendered.
 */
export type GapFilling = "transparent" | number | string | { attribute: string };

/**
 * Specifies which extremities should be rendered solid (not dashed).
 */
export type SolidExtremities = boolean | "head" | "tail";

/**
 * Specifies solid margin at each end of the edge.
 */
export type SolidMargin = number | { head?: number; tail?: number };

/**
 * Options for the dashed filling.
 */
export interface FillingDashedOptions {
  /**
   * Size of each dash.
   * Can be a number (pixels) or { thicknessRelative: number } (multiple of thickness).
   * Default: 10 (pixels)
   */
  dashSize?: DashValue;

  /**
   * Size of gaps between dashes.
   * Can be a number (pixels) or { thicknessRelative: number } (multiple of thickness).
   * Default: 10 (pixels)
   */
  gapSize?: DashValue;

  /**
   * Offset to shift the dash pattern along the edge.
   * Can be a number (pixels) or { thicknessRelative: number } (multiple of thickness).
   * Default: 0 (pixels)
   */
  dashOffset?: DashValue;

  /**
   * How gaps should be filled:
   * - "transparent": Fully transparent gaps (default)
   * - number (0-1): Same color as dash but with this opacity
   * - string: CSS color for gaps (constant for all edges)
   * - { attribute: string }: Per-edge attribute name for gap color
   *
   * Default: "transparent"
   */
  gap?: GapFilling;

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
 * Helper to extract value and mode from a DashValue.
 */
function parseDashValue(value: DashValue | undefined, defaultValue: number): { value: number; isRatio: boolean } {
  if (value === undefined) {
    return { value: defaultValue, isRatio: false };
  }
  if (typeof value === "number") {
    return { value, isRatio: false };
  }
  return { value: value.thicknessRelative, isRatio: true };
}

/**
 * Gap mode constants for shader.
 */
const GAP_MODE_TRANSPARENT = 0;
const GAP_MODE_OPACITY = 1;
const GAP_MODE_CONSTANT_COLOR = 2;
const GAP_MODE_ATTRIBUTE_COLOR = 3;

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
 * Parses the gap option and returns mode, color value, and attribute info.
 */
function parseGapOption(gap: GapFilling | undefined): {
  mode: number;
  color: Vec4;
  opacity: number;
  attribute: string | null;
} {
  if (gap === undefined || gap === "transparent") {
    return { mode: GAP_MODE_TRANSPARENT, color: [0, 0, 0, 0], opacity: 0, attribute: null };
  }
  if (typeof gap === "number") {
    return { mode: GAP_MODE_OPACITY, color: [0, 0, 0, 0], opacity: gap, attribute: null };
  }
  if (typeof gap === "string") {
    // CSS color string - parse to RGBA components
    const parsed = parseColor(gap);
    // Convert to 0-1 range and premultiply alpha for correct blending
    const a = parsed.a;
    const r = (parsed.r / 255) * a;
    const g = (parsed.g / 255) * a;
    const b = (parsed.b / 255) * a;
    return { mode: GAP_MODE_CONSTANT_COLOR, color: [r, g, b, a], opacity: 0, attribute: null };
  }
  // Per-edge attribute
  return { mode: GAP_MODE_ATTRIBUTE_COLOR, color: [0, 0, 0, 0], opacity: 0, attribute: gap.attribute };
}

/**
 * Creates a dashed pattern filling for edges.
 *
 * The edge is rendered with a repeating dash-gap pattern. Each parameter
 * can be specified in absolute pixels or relative to the edge thickness,
 * allowing for flexible visual styles. Boundaries between dashes and gaps
 * are properly antialiased.
 *
 * @param options - Configuration for dash size, gap size, offset, gap color, and alignment
 * @returns EdgeFilling definition for dashed pattern
 *
 * @example
 * ```typescript
 * // Simple dashed line (10px dash, 5px gap, centered)
 * fillingDashed({ dashSize: 10, gapSize: 5 })
 *
 * // Dashes relative to thickness
 * fillingDashed({
 *   dashSize: { thicknessRelative: 2 },
 *   gapSize: { thicknessRelative: 1 },
 * })
 *
 * // Semi-transparent gaps
 * fillingDashed({ dashSize: 10, gapSize: 10, gap: 0.3 })
 *
 * // Colored gaps
 * fillingDashed({ dashSize: 10, gapSize: 10, gap: "#ff0000" })
 *
 * // Pattern aligned to start
 * fillingDashed({ dashSize: 10, gapSize: 5, align: 0 })
 *
 * // Solid extremities (arrows stay solid, body is dashed)
 * fillingDashed({ dashSize: 10, gapSize: 5, solidExtremities: true })
 *
 * // Only head extremity solid
 * fillingDashed({ dashSize: 10, gapSize: 5, solidExtremities: "head" })
 *
 * // Extra solid margin at head end (5px solid before dashes)
 * fillingDashed({ dashSize: 10, gapSize: 5, solidMargin: { head: 5 } })
 *
 * // Combine solid extremities with extra margins
 * fillingDashed({
 *   dashSize: 10,
 *   gapSize: 5,
 *   solidExtremities: true,
 *   solidMargin: { head: 10, tail: 5 },
 * })
 * ```
 */
export function fillingDashed(options: FillingDashedOptions = {}): EdgeFilling {
  const dash = parseDashValue(options.dashSize, 10);
  const gap = parseDashValue(options.gapSize, 10);
  const offset = parseDashValue(options.dashOffset, 0);
  const gapConfig = parseGapOption(options.gap);
  const align = options.align ?? 0.5;
  const solidExtremities = parseSolidExtremities(options.solidExtremities);
  const solidMargin = parseSolidMargin(options.solidMargin);

  // Encode mode as vec3: 0.0 = pixels, 1.0 = ratio (relative to thickness)
  const sizeMode: Vec3 = [dash.isRatio ? 1.0 : 0.0, gap.isRatio ? 1.0 : 0.0, offset.isRatio ? 1.0 : 0.0];

  // Build uniforms list
  const uniforms: EdgeFilling["uniforms"] = [
    { name: "u_dashSize", type: "float", value: dash.value },
    { name: "u_gapSize", type: "float", value: gap.value },
    { name: "u_dashOffset", type: "float", value: offset.value },
    { name: "u_sizeMode", type: "vec3", value: sizeMode },
    { name: "u_gapMode", type: "float", value: gapConfig.mode },
    { name: "u_gapOpacity", type: "float", value: gapConfig.opacity },
    { name: "u_gapColor", type: "vec4", value: gapConfig.color },
    { name: "u_align", type: "float", value: align },
    // Solid extremities: vec2(tail, head) as 0.0 or 1.0
    {
      name: "u_solidExtremities",
      type: "vec2",
      value: [solidExtremities.tail ? 1.0 : 0.0, solidExtremities.head ? 1.0 : 0.0],
    },
    // Solid margin: vec2(tail margin in pixels, head margin in pixels)
    { name: "u_solidMargin", type: "vec2", value: [solidMargin.tail, solidMargin.head] },
  ];

  // Build attributes list (only if using per-edge gap color)
  const attributes: EdgeFilling["attributes"] = [];
  if (gapConfig.attribute) {
    attributes.push({
      name: "a_gapColor",
      size: 4,
      type: WebGL2RenderingContext.UNSIGNED_BYTE,
      normalized: true,
      source: gapConfig.attribute,
    });
  }

  // language=GLSL
  const glsl = /*glsl*/ `
// Dashed pattern filling with antialiased boundaries
// Uniforms:
//   u_dashSize: size of each dash
//   u_gapSize: size of gaps between dashes
//   u_dashOffset: offset to shift the pattern
//   u_sizeMode: vec3 indicating if values are thickness-relative (x=dash, y=gap, z=offset)
//   u_gapMode: 0.0=transparent, 1.0=opacity, 2.0=constant color, 3.0=attribute color
//   u_gapOpacity: opacity for gap when gapMode=1
//   u_gapColor: color for gap when gapMode=2
//   u_align: pattern alignment (0=start, 0.5=center, 1=end)
//   u_solidExtremities: vec2(tail, head) - 1.0 means solid, 0.0 means dashed
//   u_solidMargin: vec2(tail, head) - extra solid margin in pixels
${gapConfig.attribute ? "// Varying: v_gapColor for per-edge gap color" : ""}

vec4 filling_dashed(EdgeContext ctx) {
  // Check for solid zones first (extremities and margins)
  // v_zone: 0=tail extremity, 1=body, 2=head extremity
  // v_tailLengthRatio and v_headLengthRatio give extremity lengths as ratio of thickness

  // Tail solid zone check
  if (u_solidExtremities.x > 0.5 && v_zone < 0.5) {
    // In tail extremity zone and solidExtremities.tail is enabled
    return v_color;
  }
  // Head solid zone check
  if (u_solidExtremities.y > 0.5 && v_zone > 1.5) {
    // In head extremity zone and solidExtremities.head is enabled
    return v_color;
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
    return v_color;
  }

  // Head margin check (margin starts before extremity zone)
  float headSolidZone = (u_solidExtremities.y > 0.5 ? headExtremityLength : 0.0) + headMarginWorld;
  if (ctx.distanceToTarget < headSolidZone) {
    return v_color;
  }

  // Compute actual sizes (either in pixels converted to world units, or relative to thickness)
  float pixelToWorld = u_correctionRatio / u_sizeRatio;
  float dashSize = u_dashSize * (u_sizeMode.x > 0.5 ? ctx.thickness : pixelToWorld);
  float gapSize = u_gapSize * (u_sizeMode.y > 0.5 ? ctx.thickness : pixelToWorld);
  float dashOffset = u_dashOffset * (u_sizeMode.z > 0.5 ? ctx.thickness : pixelToWorld);

  // Pattern length is dash + gap
  float patternLength = dashSize + gapSize;

  // Avoid issues with very small patterns
  if (patternLength < 0.001) {
    return v_color;
  }

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
  // Note: Colors must be premultiplied alpha for correct blending
  vec4 gapColor;
  if (u_gapMode < 0.5) {
    // Mode 0: Transparent
    gapColor = vec4(0.0);
  } else if (u_gapMode < 1.5) {
    // Mode 1: Same color with reduced opacity (premultiplied)
    float gapAlpha = v_color.a * u_gapOpacity;
    gapColor = vec4(v_color.rgb * gapAlpha, gapAlpha);
  } else if (u_gapMode < 2.5) {
    // Mode 2: Constant color (already premultiplied from uniform)
    gapColor = u_gapColor;
  } else {
    // Mode 3: Per-edge attribute color (already premultiplied from attribute)
    ${gapConfig.attribute ? "gapColor = v_gapColor;" : "gapColor = vec4(0.0);"}
  }

  // Blend between gap and dash colors
  return mix(gapColor, v_color, dashAlpha);
}
`;

  return {
    name: "dashed",
    glsl,
    uniforms,
    attributes,
  };
}
