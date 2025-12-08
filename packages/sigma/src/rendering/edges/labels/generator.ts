/**
 * Sigma.js Edge Label Shader Generator
 * =====================================
 *
 * Generates GLSL shaders for edge label rendering using SDF text.
 * Characters are positioned along the edge path on the GPU, with
 * each character rotated to follow the path tangent.
 *
 * ## Architecture
 *
 * The CPU writes all characters of every label to the GPU buffer.
 * The GPU then:
 * 1. Computes the edge body bounds (after node boundaries and extremities)
 * 2. Centers the label on the body
 * 3. Truncates characters that don't fit
 * 4. Positions each character along the path at the correct arc distance
 * 5. Rotates each character to align with the path tangent
 *
 * @module
 */
import { generateShapeSelectorGLSL, getAllShapeGLSL } from "../../shapes";
import { generateFindSourceClampT, generateFindTargetClampT } from "../shared-glsl";
import { EdgePath } from "../types";

// ============================================================================
// Types
// ============================================================================

export interface GeneratedEdgeLabelShaders {
  vertexShader: string;
  fragmentShader: string;
  uniforms: string[];
}

export interface EdgeLabelShaderOptions {
  /** The path type for positioning labels along the edge */
  path: EdgePath;
  /** Whether to render text border (outline) */
  hasBorder?: boolean;
}

// ============================================================================
// Vertex Shader Generation
// ============================================================================

/**
 * Generates the vertex shader for edge label rendering.
 *
 * ## Coordinate Systems
 *
 * - **Graph space**: Node positions (a_source, a_target)
 * - **WebGL units**: After correctionRatio/sizeRatio conversion
 * - **Screen pixels**: Final display units (fontSize, character sizes)
 * - **Glyph units**: Typographic units at atlas font size
 * - **Arc distance**: Length along the path curve
 * - **Parameter t**: Parametric position [0, 1] along path
 *
 * ## Character Positioning Algorithm
 *
 * 1. Compute body bounds using binary search (findSourceClampT/findTargetClampT)
 * 2. Compute body center in arc distance
 * 3. For each character:
 *    a. Compute its arc distance from body center
 *    b. Check if it fits within body bounds (discard if not)
 *    c. Convert arc distance to parameter t
 *    d. Get position and tangent at that t
 *    e. Rotate character quad to align with tangent
 *    f. Apply perpendicular offset (for above/below positioning - Milestone 3)
 */
export function generateEdgeLabelVertexShader(options: EdgeLabelShaderOptions): string {
  const { path, hasBorder = false } = options;
  const pathName = path.name;

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

// ============================================================================
// Attributes - Per Character (Instanced)
// ============================================================================

// Edge geometry (packed to reduce attribute count)
in vec4 a_sourceTarget;     // (sourceX, sourceY, targetX, targetY)
in vec4 a_nodeSizes;        // (sourceSize, targetSize, sourceShapeId, targetShapeId)
in vec4 a_edgeParams;       // (thickness, headLengthRatio, tailLengthRatio, baseFontSize)

// Character metrics (in glyph units = atlas font size pixels)
in vec4 a_charMetrics;      // (charTextOffset, charAdvance, totalTextWidth, positionMode)
in vec4 a_charDims;         // (charSize.x, charSize.y, charOffset.x, charOffset.y)

// Atlas texture coordinates
in vec4 a_texCoords;        // (x, y, width, height) in atlas pixels

// Label parameters
in vec2 a_labelParams;      // (margin, unused)

// Appearance
in vec4 a_color;            // Character color (RGBA, normalized)
${hasBorder ? "in vec4 a_borderColor;      // Border color (RGBA, normalized)" : ""}

// Path-specific attributes
${path.attributes
  .map((a) => {
    const glslType = a.size === 1 ? "float" : `vec${a.size}`;
    const name = a.name.startsWith("a_") ? a.name : `a_${a.name}`;
    return `in ${glslType} ${name};`;
  })
  .join("\n")}

// ============================================================================
// Attributes - Per Vertex (Constant)
// ============================================================================

in vec2 a_quadCorner;       // Quad corner: (0,0), (1,0), (0,1), (1,1)

// ============================================================================
// Uniforms
// ============================================================================

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_pixelRatio;
uniform float u_cameraAngle;    // Required by node shape SDFs
uniform float u_sdfBufferPixels; // SDF buffer size in atlas font size pixels
uniform vec2 u_resolution;
uniform vec2 u_atlasSize;

// ============================================================================
// Varyings
// ============================================================================

out vec2 v_texCoord;
out vec4 v_color;
${hasBorder ? "out vec4 v_borderColor;" : ""}
out float v_edgeFade;  // 0 = fully visible, 1 = fully faded (outside body)

// ============================================================================
// Constants
// ============================================================================

const float bias = 255.0 / 254.0;
const float FADE_WIDTH_PIXELS = 15.0;  // Width of fade gradient in pixels

// ============================================================================
// Node Shape SDFs (for binary search)
// ============================================================================

${getAllShapeGLSL()}

// Shape selector function
${generateShapeSelectorGLSL()}

// ============================================================================
// Path Functions
// ============================================================================

${path.glsl}

// ============================================================================
// Binary Search Functions (from shared-glsl.ts)
// ============================================================================

${generateFindSourceClampT(pathName)}
${generateFindTargetClampT(pathName)}

// ============================================================================
// Main
// ============================================================================

void main() {
  // -------------------------------------------------------------------------
  // Unpack attributes
  // -------------------------------------------------------------------------
  vec2 source = a_sourceTarget.xy;
  vec2 target = a_sourceTarget.zw;
  float sourceSize = a_nodeSizes.x;
  float targetSize = a_nodeSizes.y;
  int sourceShapeId = int(a_nodeSizes.z);
  int targetShapeId = int(a_nodeSizes.w);
  float thickness = a_edgeParams.x;
  float headLengthRatio = a_edgeParams.y;
  float tailLengthRatio = a_edgeParams.z;
  float baseFontSize = a_edgeParams.w;
  float charTextOffset = a_charMetrics.x;
  float charAdvance = a_charMetrics.y;
  float totalTextWidth = a_charMetrics.z;
  float positionMode = a_charMetrics.w;
  vec2 charSize = a_charDims.xy;
  vec2 charOffset = a_charDims.zw;
  float margin = a_labelParams.x;

  // -------------------------------------------------------------------------
  // Step 1: Convert thickness to WebGL units
  // -------------------------------------------------------------------------
  float webGLThickness = thickness * u_correctionRatio / u_sizeRatio;

  // -------------------------------------------------------------------------
  // Step 2: Compute body bounds
  // -------------------------------------------------------------------------
  // Always find where path exits source node and enters target node
  // This ensures labels are truncated at node boundaries, not node centers
  float tStart = findSourceClampT(source, sourceSize, sourceShapeId, target, 0.0);
  float tEnd = findTargetClampT(source, target, targetSize, targetShapeId, 0.0);

  // Compute path length
  float pathLength = path_${pathName}_length(source, target);
  float visibleLength = pathLength * (tEnd - tStart);

  // Compute extremity lengths in WebGL units
  float headLength = headLengthRatio * webGLThickness;
  float tailLength = tailLengthRatio * webGLThickness;

  // Handle short edges: scale down extremities if needed
  float totalNeededLength = headLength + tailLength;
  if (totalNeededLength > visibleLength && totalNeededLength > 0.0001) {
    float extremityScale = visibleLength / totalNeededLength;
    headLength *= extremityScale;
    tailLength *= extremityScale;
  }

  // Body bounds in arc distance (WebGL units)
  float bodyStartDist = tStart * pathLength + tailLength;
  float bodyEndDist = tEnd * pathLength - headLength;
  float bodyLength = max(bodyEndDist - bodyStartDist, 0.0);

  // -------------------------------------------------------------------------
  // Step 3: Compute font scale and text dimensions
  // -------------------------------------------------------------------------
  // For Milestone 1, font size is fixed (no zoom scaling)
  float fontScale = baseFontSize / 64.0; // 64 = atlas font size

  // Convert glyph-unit metrics to WebGL units
  // Text dimensions need to be in the same coordinate system as the path
  float textWidthWebGL = totalTextWidth * fontScale * u_correctionRatio / u_sizeRatio;
  float charOffsetWebGL = charTextOffset * fontScale * u_correctionRatio / u_sizeRatio;
  float charAdvanceWebGL = charAdvance * fontScale * u_correctionRatio / u_sizeRatio;

  // -------------------------------------------------------------------------
  // Step 4: Compute character center offset (truncation check moved to after curvature adjustment)
  // -------------------------------------------------------------------------
  // Character center position relative to label center (on centerline, before curvature adjustment)
  float charCenterOffset = charOffsetWebGL + charAdvanceWebGL * 0.5 - textWidthWebGL * 0.5;

  // -------------------------------------------------------------------------
  // Step 5: Compute perpendicular offset based on position mode
  // -------------------------------------------------------------------------
  // Position modes: 0=over, 1=above, 2=below, 3=auto
  // We need to compute this early for curvature-adaptive spacing
  float halfThickness = webGLThickness * 0.5;
  float marginWebGL = margin * u_correctionRatio / u_sizeRatio;
  // Half text height to center the label visually on the offset line
  // Using 0.35 factor (not 0.5) because the visual center of mixed-case text
  // is typically below the midpoint between baseline and cap height
  float halfTextHeight = baseFontSize * 0.35 * u_correctionRatio / u_sizeRatio;
  float perpOffset = 0.0;

  if (positionMode == 1.0) {
    // "above": positive perpendicular offset
    perpOffset = halfThickness + marginWebGL + halfTextHeight;
  } else if (positionMode == 2.0) {
    // "below": negative perpendicular offset
    perpOffset = -(halfThickness + marginWebGL + halfTextHeight);
  } else if (positionMode == 3.0) {
    // "auto": determine based on screen positions of source and target
    // Transform source and target to clip space to compare screen X positions
    vec3 sourceClip = u_matrix * vec3(source, 1.0);
    vec3 targetClip = u_matrix * vec3(target, 1.0);
    // If source is to the left of target on screen, use "above"; otherwise "below"
    // This ensures text is always readable (not upside-down)
    perpOffset = sourceClip.x < targetClip.x
      ? (halfThickness + marginWebGL + halfTextHeight)
      : -(halfThickness + marginWebGL + halfTextHeight);
  }
  // else positionMode == 0.0 ("over"): perpOffset stays 0

  // -------------------------------------------------------------------------
  // Step 6: Position character on path with curvature-adaptive spacing
  // -------------------------------------------------------------------------
  // Body center in arc distance
  float bodyCenterDist = (bodyStartDist + bodyEndDist) * 0.5;

  // Base character position on centerline
  float baseCharArcDist = bodyCenterDist + charCenterOffset;
  float charT = path_${pathName}_t_at_distance(baseCharArcDist, source, target);

  // For above/below modes, apply curvature-adaptive spacing
  // When offset from the centerline, the arc length on the offset path differs.
  // We need to compute the CUMULATIVE arc difference from the label center to this character.
  if (perpOffset != 0.0) {
    // Get the t value at body center for reference
    float centerT = path_${pathName}_t_at_distance(bodyCenterDist, source, target);
    vec2 tangentAtCenter = path_${pathName}_tangent(centerT, source, target);
    float angleAtCenter = atan(tangentAtCenter.y, tangentAtCenter.x);

    // Iterative refinement: the adjustment changes the character position,
    // which changes the angle, which changes the adjustment. For paths with
    // concentrated curvature (like taxiRounded corners), we need to iterate.
    float adjustedCharArcDist = baseCharArcDist;
    for (int iter = 0; iter < 3; iter++) {
      // Compute angle at current character position
      vec2 tangentAtChar = path_${pathName}_tangent(charT, source, target);
      float angleAtChar = atan(tangentAtChar.y, tangentAtChar.x);

      // Handle angle wraparound
      float totalAngleChange = angleAtChar - angleAtCenter;
      if (totalAngleChange > 3.14159) totalAngleChange -= 6.28318;
      if (totalAngleChange < -3.14159) totalAngleChange += 6.28318;

      // The arc length difference on the offset path is: perpOffset * totalAngleChange
      // This is exact for any curve: integral of (1 + curvature * offset) ds = s + offset * delta_angle
      // We apply a 2x scale factor because the visual offset includes both the perpendicular offset
      // from centerline AND the curvature effect on the character positioning itself
      float arcAdjustment = perpOffset * totalAngleChange;

      // Apply the adjustment to get the corrected arc distance
      adjustedCharArcDist = baseCharArcDist + arcAdjustment;
      charT = path_${pathName}_t_at_distance(adjustedCharArcDist, source, target);
    }

    // Store adjusted offset for edge fade calculation
    charCenterOffset = adjustedCharArcDist - bodyCenterDist;
  }
  // For "over" mode, charCenterOffset is already set correctly

  // Get position and tangent at final character position
  vec2 pathPos = path_${pathName}_position(charT, source, target);
  vec2 tangent = path_${pathName}_tangent(charT, source, target);

  // Compute perpendicular direction (90 degrees from tangent)
  vec2 perpDir = vec2(-tangent.y, tangent.x);

  // Apply perpendicular offset to path position
  vec2 offsetPathPos = pathPos + perpDir * perpOffset;

  // -------------------------------------------------------------------------
  // Step 7: Build character quad
  // -------------------------------------------------------------------------
  // Character size in screen pixels
  vec2 charSizePixels = charSize * fontScale;

  // Character offset within the glyph (bearing adjustment)
  // charOffset.x = bearingX (horizontal offset from origin to glyph left edge)
  // charOffset.y = -bearingY (vertical offset from baseline to glyph top, negated)
  vec2 charOffsetPixels = charOffset * fontScale;

  // The character's local X offset from pathPos (which is at character center)
  // Since pathPos is at (origin + advance/2), the character origin is at pathPos - advance/2
  // So the quad starts at -advance/2 relative to pathPos (in pixels)
  float charLocalX = -charAdvance * 0.5 * fontScale;

  // Build quad position:
  // - Start at character origin (charLocalX on X axis, 0 on Y axis = baseline)
  // - Add bearing offset to get to glyph corner
  // - Subtract SDF buffer (the atlas texture has padding around each glyph)
  // - Add quad corner * size to get vertex position
  vec2 quadPos;
  float sdfBufferOffset = u_sdfBufferPixels * fontScale;
  quadPos.x = charLocalX + charOffsetPixels.x - sdfBufferOffset + a_quadCorner.x * charSizePixels.x;
  // For Y: bearingY points UP from baseline to top of glyph
  // charOffset.y = -bearingY, so it's negative (pointing down from baseline)
  // We want: top of glyph at bearingY above baseline, bottom at bearingY - height
  // With charOffset.y = -bearingY: glyph top at -charOffset.y, bottom at -charOffset.y - height
  // Also subtract sdfBufferOffset to account for top padding in atlas texture
  // Quad corner (0,0) = bottom-left, (1,1) = top-right
  quadPos.y = -charOffsetPixels.y + sdfBufferOffset - charSizePixels.y * (1.0 - a_quadCorner.y);

  // Center vertically on the path by offsetting by half the visual text height
  // The offset should scale linearly with font size (not quadratically)
  // 17.0 is approximately the distance from baseline to visual center in atlas units (64px base)
  float verticalCenterOffset = 17.0 * fontScale;
  quadPos.y -= verticalCenterOffset;

  // -------------------------------------------------------------------------
  // Step 8: Rotate quad to align with tangent
  // -------------------------------------------------------------------------
  // Rotation matrix from tangent
  // tangent = (cos(angle), sin(angle)), so we can build rotation directly
  mat2 rotation = mat2(tangent.x, tangent.y, -tangent.y, tangent.x);

  // Convert pixel offset to WebGL units for rotation
  vec2 quadPosWebGL = quadPos * u_correctionRatio / u_sizeRatio;

  // Rotate around character center on path
  vec2 rotatedOffset = rotation * quadPosWebGL;

  // Final position in graph space (using offset path position for above/below modes)
  vec2 worldPos = offsetPathPos + rotatedOffset;

  // -------------------------------------------------------------------------
  // Step 9: Transform to clip space
  // -------------------------------------------------------------------------
  vec3 clipPos = u_matrix * vec3(worldPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);

  // -------------------------------------------------------------------------
  // Step 10: Texture coordinates
  // -------------------------------------------------------------------------
  // Flip Y for texture coordinates (texture Y goes down, quad Y goes up)
  vec2 texCorner = vec2(a_quadCorner.x, 1.0 - a_quadCorner.y);
  v_texCoord = (a_texCoords.xy + texCorner * a_texCoords.zw) / u_atlasSize;

  // -------------------------------------------------------------------------
  // Step 11: Pass color and border color
  // -------------------------------------------------------------------------
  v_color = a_color;
  v_color.a *= bias;
${hasBorder ? "  v_borderColor = a_borderColor;\n  v_borderColor.a *= bias;" : ""}

  // -------------------------------------------------------------------------
  // Step 12: Compute edge fade for soft truncation
  // -------------------------------------------------------------------------
  // Convert fade width from pixels to WebGL units
  float fadeWidthWebGL = FADE_WIDTH_PIXELS * u_correctionRatio / u_sizeRatio;

  // Compute the arc position of THIS VERTEX (not just character center)
  // The quad extends from charCenter - advance/2 to charCenter + advance/2
  // a_quadCorner.x is 0 for left edge, 1 for right edge
  float vertexLocalOffset = (a_quadCorner.x - 0.5) * charAdvanceWebGL;
  float vertexArcOffset = charCenterOffset + vertexLocalOffset;

  // Compute distance from body edges (positive = inside body, negative = outside)
  float halfBody = bodyLength * 0.5;
  float distFromStart = vertexArcOffset + halfBody;  // Distance from body start edge
  float distFromEnd = halfBody - vertexArcOffset;    // Distance from body end edge
  float distFromEdge = min(distFromStart, distFromEnd);

  // Compute fade: 0 = fully visible (deep inside body), 1 = fully faded (at body edge)
  // Fade goes from 0 (at 2*fadeWidth inside) to 1 (at body edge)
  // This ensures text is fully transparent before reaching extremities
  v_edgeFade = 1.0 - smoothstep(0.0, fadeWidthWebGL * 2.0, distFromEdge);
}
`;

  return glsl;
}

// ============================================================================
// Fragment Shader Generation
// ============================================================================

/**
 * Generates the fragment shader for SDF-based text rendering.
 *
 * Uses signed distance field (SDF) textures to render crisp text at any scale.
 * The SDF stores distance-to-edge values, and we use smoothstep for anti-aliasing.
 *
 * When border is enabled, renders a colored outline around the text using
 * a wider SDF threshold for the border than for the fill.
 */
export function generateEdgeLabelFragmentShader(options: { hasBorder?: boolean } = {}): string {
  const { hasBorder = false } = options;

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec4 v_color;
${hasBorder ? "in vec4 v_borderColor;" : ""}
in float v_edgeFade;  // 0 = fully visible, 1 = fully faded

uniform sampler2D u_atlas;
uniform float u_gamma;
uniform float u_sdfBuffer;
uniform float u_pixelRatio;
${hasBorder ? "uniform float u_borderWidth;  // Border width in SDF units (normalized)" : ""}

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

void main() {
  // SDF stores normalized distance: 0.5 = on edge, >0.5 = inside glyph
  float sdfValue = texture(u_atlas, v_texCoord).a;

  // Edge threshold accounting for SDF buffer padding
  float edge = 1.0 - u_sdfBuffer;

  // Anti-aliasing width adjusted for pixel density
  float aaWidth = u_gamma / u_pixelRatio;

  // Apply edge fade for soft truncation at body boundaries
  float edgeAlpha = 1.0 - v_edgeFade;

${
  hasBorder
    ? `  // Border rendering: compute alpha for both fill and border regions
  // Border extends from (edge - borderWidth) to edge
  float borderEdge = edge - u_borderWidth;

  // Fill alpha: fully opaque inside the glyph
  float fillAlpha = smoothstep(edge - aaWidth, edge + aaWidth, sdfValue);

  // Border alpha: opaque in the border region (between borderEdge and edge)
  float borderAlpha = smoothstep(borderEdge - aaWidth, borderEdge + aaWidth, sdfValue);

  // Composite: fill on top of border
  // Border is visible where borderAlpha > 0 but fillAlpha < 1
  vec3 borderColorPremult = v_borderColor.rgb * v_borderColor.a * borderAlpha * edgeAlpha;
  vec3 fillColorPremult = v_color.rgb * v_color.a * fillAlpha * edgeAlpha;

  // Blend fill over border (fill replaces border where fill is opaque)
  float finalBorderAlpha = borderAlpha * (1.0 - fillAlpha);
  vec3 finalColor = fillColorPremult + v_borderColor.rgb * v_borderColor.a * finalBorderAlpha * edgeAlpha;
  float finalAlpha = (v_color.a * fillAlpha + v_borderColor.a * finalBorderAlpha) * edgeAlpha;

  fragColor = vec4(finalColor, finalAlpha);`
    : `  // Smooth transition from transparent to opaque at glyph edge
  float alpha = smoothstep(edge - aaWidth, edge + aaWidth, sdfValue);

  // Premultiplied alpha output
  float finalAlpha = v_color.a * alpha * edgeAlpha;
  fragColor = vec4(v_color.rgb * finalAlpha, finalAlpha);`
}

  // Edge labels are not pickable
  fragPicking = vec4(0.0);
}
`;

  return glsl;
}

// ============================================================================
// Uniform Collection
// ============================================================================

export function collectEdgeLabelUniforms(path: EdgePath, hasBorder = false): string[] {
  const uniforms = [
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_pixelRatio",
    "u_cameraAngle",
    "u_sdfBufferPixels",
    "u_resolution",
    "u_atlasSize",
    "u_atlas",
    "u_gamma",
    "u_sdfBuffer",
  ];

  // Add border width uniform if border is enabled
  if (hasBorder) {
    uniforms.push("u_borderWidth");
  }

  // Add path-specific uniforms
  for (const uniform of path.uniforms) {
    if (!uniforms.includes(uniform.name)) {
      uniforms.push(uniform.name);
    }
  }

  return uniforms;
}

// ============================================================================
// Main Generator Function
// ============================================================================

export function generateEdgeLabelShaders(options: EdgeLabelShaderOptions): GeneratedEdgeLabelShaders {
  const { hasBorder = false } = options;
  return {
    vertexShader: generateEdgeLabelVertexShader(options),
    fragmentShader: generateEdgeLabelFragmentShader({ hasBorder }),
    uniforms: collectEdgeLabelUniforms(options.path, hasBorder),
  };
}
