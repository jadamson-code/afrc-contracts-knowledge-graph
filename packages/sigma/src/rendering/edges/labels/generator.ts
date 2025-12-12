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
import { DEFAULT_SDF_ATLAS_OPTIONS } from "../../../core/sdf-atlas";
import { generateShapeSelectorGLSL, getAllShapeGLSL } from "../../shapes";
import { numberToGLSLFloat } from "../../utils";
import {
  generateFindSourceClampT,
  generateFindTargetClampT,
  generateNumericalTangentNormal,
} from "../shared-glsl";
import { EdgePath } from "../types";

// Atlas font size constant - used for converting glyph units to screen pixels
const ATLAS_FONT_SIZE = DEFAULT_SDF_ATLAS_OPTIONS.fontSize;

// Vertical center offset ratio: the distance from baseline to visual center,
// as a fraction of the atlas font size. This is approximately 0.265 (17/64).
const VERTICAL_CENTER_RATIO = 17 / 64;

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
  /** Font size mode: "fixed" or "scaled" */
  fontSizeMode?: "fixed" | "scaled";
  /** Minimum visibility ratio to show label (default: 0.5) */
  minVisibilityThreshold?: number;
  /** Visibility ratio for full opacity (default: 0.6) */
  fullVisibilityThreshold?: number;
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
 *    f. Apply perpendicular offset (for above/below positioning)
 */
export function generateEdgeLabelVertexShader(options: EdgeLabelShaderOptions): string {
  const {
    path,
    hasBorder = false,
    fontSizeMode = "fixed",
    minVisibilityThreshold = 0.5,
    fullVisibilityThreshold = 0.6,
  } = options;
  const pathName = path.name;
  const isScaledMode = fontSizeMode === "scaled";

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

// ============================================================================
// Attributes - Per Character (Instanced)
// ============================================================================

// Edge geometry: node indices for texture lookup (replaces packed node data)
in vec2 a_nodeIndices;      // (sourceNodeIndex, targetNodeIndex)
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
uniform sampler2D u_nodeDataTexture; // Shared texture with node position/size/shape data
uniform int u_nodeDataTextureWidth;  // Width of 2D node data texture for coordinate calculation
${isScaledMode ? "uniform float u_zoomSizeRatio;  // Zoom-based size ratio from zoomToSizeRatioFunction" : ""}

// ============================================================================
// Varyings
// ============================================================================

out vec2 v_texCoord;
out vec4 v_color;
${hasBorder ? "out vec4 v_borderColor;" : ""}
out float v_edgeFade;  // 0 = fully visible, 1 = fully faded (outside body)
out float v_alphaModifier;  // 0-1 based on label visibility ratio

// ============================================================================
// Constants
// ============================================================================

const float bias = 255.0 / 254.0;
const float FADE_WIDTH_PIXELS = 15.0;  // Width of fade gradient in pixels
const float MIN_VISIBILITY_THRESHOLD = ${numberToGLSLFloat(minVisibilityThreshold)};
const float FULL_VISIBILITY_THRESHOLD = ${numberToGLSLFloat(fullVisibilityThreshold)};
const float ATLAS_FONT_SIZE = ${numberToGLSLFloat(ATLAS_FONT_SIZE)};  // Base font size used in SDF atlas
const float VERTICAL_CENTER_RATIO = ${numberToGLSLFloat(VERTICAL_CENTER_RATIO)};  // Baseline to visual center ratio

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

// Tangent/normal functions: use analytical if provided, otherwise numerical
${path.analyticalTangentGlsl || generateNumericalTangentNormal(pathName)}

// Corner skip helpers (for paths with sharp corners like step/taxi)
${path.cornerSkipGlsl || ""}

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
  // Unpack attributes: Fetch node data from texture
  // -------------------------------------------------------------------------
  // Texture format: vec4(x, y, size, shapeId)
  // 2D texture layout: texCoord = (index % width, index / width)
  int srcIdx = int(a_nodeIndices.x);
  int tgtIdx = int(a_nodeIndices.y);
  ivec2 srcTexCoord = ivec2(srcIdx % u_nodeDataTextureWidth, srcIdx / u_nodeDataTextureWidth);
  ivec2 tgtTexCoord = ivec2(tgtIdx % u_nodeDataTextureWidth, tgtIdx / u_nodeDataTextureWidth);
  vec4 srcNodeData = texelFetch(u_nodeDataTexture, srcTexCoord, 0);
  vec4 tgtNodeData = texelFetch(u_nodeDataTexture, tgtTexCoord, 0);

  vec2 source = srcNodeData.xy;
  vec2 target = tgtNodeData.xy;
  float sourceSize = srcNodeData.z;
  float targetSize = tgtNodeData.z;
  int sourceShapeId = int(srcNodeData.w);
  int targetShapeId = int(tgtNodeData.w);

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
  // Compute pixel-to-graph conversion (for fixed font size mode)
  // -------------------------------------------------------------------------
  // This converts screen pixels to graph units such that N pixels on screen
  // becomes N pixels regardless of zoom level.
  // matrixScaleX is how much the matrix scales graph units to clip space
  float matrixScaleX = length(vec2(u_matrix[0][0], u_matrix[1][0]));
  float pixelToGraph = 2.0 / (matrixScaleX * u_resolution.x);

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
  // Font size modes:
  // - "fixed": Constant pixel size regardless of zoom, using pixelToGraph conversion
  // - "scaled": Scales with zoom using zoomToSizeRatioFunction
  ${
    isScaledMode
      ? `// Scaled mode: font scales with zoom
  float fontScale = baseFontSize / ATLAS_FONT_SIZE * u_zoomSizeRatio;
  // Convert glyph-unit metrics to WebGL units (scales with zoom)
  float textWidthWebGL = totalTextWidth * fontScale * u_correctionRatio / u_sizeRatio;
  float charOffsetWebGL = charTextOffset * fontScale * u_correctionRatio / u_sizeRatio;
  float charAdvanceWebGL = charAdvance * fontScale * u_correctionRatio / u_sizeRatio;`
      : `// Fixed mode: font stays constant in screen pixels
  float fontScale = baseFontSize / ATLAS_FONT_SIZE;
  // Convert glyph-unit metrics to graph units using pixelToGraph (zoom-independent)
  float textWidthWebGL = totalTextWidth * fontScale * pixelToGraph;
  float charOffsetWebGL = charTextOffset * fontScale * pixelToGraph;
  float charAdvanceWebGL = charAdvance * fontScale * pixelToGraph;`
  }

  // -------------------------------------------------------------------------
  // Step 4: Compute visibility ratio and alpha modifier
  // -------------------------------------------------------------------------
  // Visibility ratio: how much of the label fits in the body
  float visibilityRatio = textWidthWebGL > 0.0001 ? min(bodyLength / textWidthWebGL, 1.0) : 1.0;

  // Compute alpha modifier based on visibility thresholds:
  // - Below MIN_VISIBILITY_THRESHOLD: hidden (alpha = 0)
  // - Between thresholds: gradual fade in
  // - Above FULL_VISIBILITY_THRESHOLD: full opacity (alpha = 1)
  float alphaModifier;
  if (visibilityRatio < MIN_VISIBILITY_THRESHOLD) {
    alphaModifier = 0.0;
  } else if (visibilityRatio < FULL_VISIBILITY_THRESHOLD) {
    alphaModifier = (visibilityRatio - MIN_VISIBILITY_THRESHOLD) / (FULL_VISIBILITY_THRESHOLD - MIN_VISIBILITY_THRESHOLD);
  } else {
    alphaModifier = 1.0;
  }

  // -------------------------------------------------------------------------
  // Step 5: Compute character center offset (truncation check moved to after curvature adjustment)
  // -------------------------------------------------------------------------
  // Character center position relative to label center (on centerline, before curvature adjustment)
  float charCenterOffset = charOffsetWebGL + charAdvanceWebGL * 0.5 - textWidthWebGL * 0.5;

  // -------------------------------------------------------------------------
  // Step 6: Compute perpendicular offset based on position mode
  // -------------------------------------------------------------------------
  // Position modes: 0=over, 1=above, 2=below, 3=auto
  // We need to compute this early for curvature-adaptive spacing
  float halfThickness = webGLThickness * 0.5;
  ${
    isScaledMode
      ? `// Scaled mode: margin and text height scale with zoom (same factor as font)
  // Use u_zoomSizeRatio so margin scales consistently with the font
  float marginWebGL = margin * u_zoomSizeRatio * u_correctionRatio / u_sizeRatio;
  float halfTextHeight = baseFontSize * 0.35 * u_zoomSizeRatio * u_correctionRatio / u_sizeRatio;`
      : `// Fixed mode: margin and text height stay constant in screen pixels
  float marginWebGL = margin * pixelToGraph;
  float halfTextHeight = baseFontSize * 0.35 * pixelToGraph;`
  }
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
  // Step 7: Position character on path using offset path traversal
  // -------------------------------------------------------------------------
  // Body center in arc distance
  float bodyCenterDist = (bodyStartDist + bodyEndDist) * 0.5;

  // For "over" mode (perpOffset = 0), use simple centerline placement
  // For above/below modes, walk along the offset path to find correct position
  float charT;

  if (perpOffset == 0.0) {
    // Simple case: place on centerline
    float charArcDist = bodyCenterDist + charCenterOffset;
    charT = path_${pathName}_t_at_distance(charArcDist, source, target);
  } else {
    // Offset path traversal: walk along the offset curve to find character position
    // This ensures even character spacing regardless of curvature

    // Start from body center on offset path
    float centerT = path_${pathName}_t_at_distance(bodyCenterDist, source, target);

    ${
      path.hasSharpCorners
        ? `// -----------------------------------------------------------------------
    // Corner skip setup for step/taxi edges with above/below labels
    // -----------------------------------------------------------------------
    // At concave corners (inner side of the bend), characters would bunch up
    // because the offset path has near-zero arc length. We detect corner
    // crossings during the offset path traversal and add skip distance.

    // Get corner t values and concavity
    vec2 cornerTs = path_${pathName}_getCornerTs(source, target);
    vec2 concavity = path_${pathName}_getCornerConcavity(source, target, perpOffset);

    // Skip distance in graph units, proportional to on-screen font size
    // For fixed mode: use pixelToGraph so gap stays constant regardless of zoom
    // For scaled mode: use the same conversion as text width
    ${
      isScaledMode
        ? `float skipDistGraph = STEP_INNER_CORNER_SKIP_FACTOR * baseFontSize * u_zoomSizeRatio * u_correctionRatio / u_sizeRatio;`
        : `float skipDistGraph = STEP_INNER_CORNER_SKIP_FACTOR * baseFontSize * pixelToGraph;`
    }

    // Corner t values for detecting crossings during traversal
    float corner1T = cornerTs.x;
    float corner2T = cornerTs.y;
    bool corner1IsConcave = concavity.x > 0.5;
    bool corner2IsConcave = concavity.y > 0.5;`
        : ``
    }

    // Target distance along offset path from center
    float targetOffsetDist = abs(charCenterOffset);

    // Handle center character (charCenterOffset ≈ 0) - no search needed
    if (targetOffsetDist < 0.0001) {
      charT = centerT;
    } else {
      vec2 centerPos = path_${pathName}_position(centerT, source, target);
      vec2 centerNormal = path_${pathName}_normal(centerT, source, target);
      vec2 offsetCenter = centerPos + centerNormal * perpOffset;

      float searchDir = charCenterOffset > 0.0 ? 1.0 : -1.0;

      // Search bounds (t values for body start and end)
      float tBodyStart = path_${pathName}_t_at_distance(bodyStartDist, source, target);
      float tBodyEnd = path_${pathName}_t_at_distance(bodyEndDist, source, target);

      // Walk along offset path to find character position
      float accumDist = 0.0;
      vec2 prevOffsetPos = offsetCenter;
      float prevT = centerT;
      float foundT = centerT;

      // Search range depends on direction
      float tSearchEnd = searchDir > 0.0 ? tBodyEnd : tBodyStart;

      ${
        path.hasSharpCorners
          ? `// Track which concave corners we've crossed to add skip distance
      bool crossedCorner1 = false;
      bool crossedCorner2 = false;
      float effectiveTargetDist = targetOffsetDist;`
          : ``
      }

      const int STEPS = 32;
      for (int i = 1; i <= STEPS; i++) {
        // Step along centerline t, from center toward target
        float stepT = centerT + searchDir * float(i) * abs(tSearchEnd - centerT) / float(STEPS);

        ${
          path.hasSharpCorners
            ? `// Check for concave corner crossings and add skip distance
        // Corner 1 crossing check
        if (corner1IsConcave && !crossedCorner1) {
          bool crossingCorner1 = (searchDir > 0.0)
            ? (prevT < corner1T && stepT >= corner1T)
            : (prevT > corner1T && stepT <= corner1T);
          if (crossingCorner1) {
            crossedCorner1 = true;
            effectiveTargetDist += skipDistGraph;
          }
        }

        // Corner 2 crossing check
        if (corner2IsConcave && !crossedCorner2) {
          bool crossingCorner2 = (searchDir > 0.0)
            ? (prevT < corner2T && stepT >= corner2T)
            : (prevT > corner2T && stepT <= corner2T);
          if (crossingCorner2) {
            crossedCorner2 = true;
            effectiveTargetDist += skipDistGraph;
          }
        }`
            : ``
        }

        // Compute offset position at this t
        vec2 stepPos = path_${pathName}_position(stepT, source, target);
        vec2 stepNormal = path_${pathName}_normal(stepT, source, target);
        vec2 offsetPos = stepPos + stepNormal * perpOffset;

        // Distance along offset path
        float segDist = length(offsetPos - prevOffsetPos);

        ${
          path.hasSharpCorners
            ? `if (accumDist + segDist >= effectiveTargetDist) {
          // Interpolate within segment to find exact t
          float remaining = effectiveTargetDist - accumDist;
          float segT = remaining / max(segDist, 0.0001);
          foundT = mix(prevT, stepT, segT);
          break;
        }`
            : `if (accumDist + segDist >= targetOffsetDist) {
          // Interpolate within segment to find exact t
          float remaining = targetOffsetDist - accumDist;
          float segT = remaining / max(segDist, 0.0001);
          foundT = mix(prevT, stepT, segT);
          break;
        }`
        }

        accumDist += segDist;
        prevOffsetPos = offsetPos;
        prevT = stepT;
        // Update foundT to last valid position in case loop exhausts without finding target
        foundT = stepT;
      }

      charT = foundT;
    }
  }

  // Get position and tangent at final character position
  vec2 pathPos = path_${pathName}_position(charT, source, target);
  vec2 tangent = path_${pathName}_tangent(charT, source, target);

  // Compute perpendicular direction (90 degrees from tangent)
  vec2 perpDir = vec2(-tangent.y, tangent.x);

  // Apply perpendicular offset to path position
  vec2 offsetPathPos = pathPos + perpDir * perpOffset;

  // -------------------------------------------------------------------------
  // Step 8: Build character quad
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
  // VERTICAL_CENTER_RATIO is the distance from baseline to visual center as a ratio of atlas font size
  float verticalCenterOffset = VERTICAL_CENTER_RATIO * ATLAS_FONT_SIZE * fontScale;
  quadPos.y -= verticalCenterOffset;

  // -------------------------------------------------------------------------
  // Step 9: Rotate quad to align with tangent
  // -------------------------------------------------------------------------
  // Rotation matrix from tangent
  // tangent = (cos(angle), sin(angle)), so we can build rotation directly
  mat2 rotation = mat2(tangent.x, tangent.y, -tangent.y, tangent.x);

  // Convert pixel offset to WebGL units for rotation
  ${
    isScaledMode
      ? `vec2 quadPosWebGL = quadPos * u_correctionRatio / u_sizeRatio; // Scaled mode`
      : `vec2 quadPosWebGL = quadPos * pixelToGraph; // Fixed mode: use pixelToGraph for zoom-independent size`
  }

  // Rotate around character center on path
  vec2 rotatedOffset = rotation * quadPosWebGL;

  // Final position in graph space (using offset path position for above/below modes)
  vec2 worldPos = offsetPathPos + rotatedOffset;

  // -------------------------------------------------------------------------
  // Step 10: Transform to clip space
  // -------------------------------------------------------------------------
  vec3 clipPos = u_matrix * vec3(worldPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);

  // -------------------------------------------------------------------------
  // Step 11: Texture coordinates
  // -------------------------------------------------------------------------
  // Flip Y for texture coordinates (texture Y goes down, quad Y goes up)
  vec2 texCorner = vec2(a_quadCorner.x, 1.0 - a_quadCorner.y);
  v_texCoord = (a_texCoords.xy + texCorner * a_texCoords.zw) / u_atlasSize;

  // -------------------------------------------------------------------------
  // Step 12: Pass color, border color, and alpha modifier
  // -------------------------------------------------------------------------
  v_color = a_color;
  v_color.a *= bias;
${hasBorder ? "  v_borderColor = a_borderColor;\n  v_borderColor.a *= bias;" : ""}
  v_alphaModifier = alphaModifier;

  // -------------------------------------------------------------------------
  // Step 13: Compute edge fade for soft truncation
  // -------------------------------------------------------------------------
  // Convert fade width from pixels to WebGL units
  ${
    isScaledMode
      ? `float fadeWidthWebGL = FADE_WIDTH_PIXELS * u_correctionRatio / u_sizeRatio;`
      : `float fadeWidthWebGL = FADE_WIDTH_PIXELS * pixelToGraph;`
  }

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
in float v_alphaModifier;  // 0-1 based on label visibility ratio

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
  // Also apply visibility-based alpha modifier for short edge labels
  float edgeAlpha = (1.0 - v_edgeFade) * v_alphaModifier;

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

export function collectEdgeLabelUniforms(
  path: EdgePath,
  hasBorder = false,
  fontSizeMode: "fixed" | "scaled" = "fixed",
): string[] {
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
    "u_nodeDataTexture",
    "u_nodeDataTextureWidth",
  ];

  // Add zoom size ratio uniform for scaled font size mode
  if (fontSizeMode === "scaled") {
    uniforms.push("u_zoomSizeRatio");
  }

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
  const { hasBorder = false, fontSizeMode = "fixed" } = options;
  return {
    vertexShader: generateEdgeLabelVertexShader(options),
    fragmentShader: generateEdgeLabelFragmentShader({ hasBorder }),
    uniforms: collectEdgeLabelUniforms(options.path, hasBorder, fontSizeMode),
  };
}
