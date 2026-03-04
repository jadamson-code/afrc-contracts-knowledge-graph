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
import { layerPlain } from "../layers";
import { computeAttributeLayout } from "../../data-texture";
import { generateEdgeAttributeTextureFetch } from "../path-attribute-texture";
import {
  generateFindSourceClampT,
  generateFindTargetClampT,
  generateNumericalTangentNormal,
  generatePathFallbacks,
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
  /** The path types for positioning labels along edges (supports multi-path) */
  paths: EdgePath[];
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
/**
 * Generates a path selector function for multi-path support.
 * Creates a switch statement that dispatches to the correct path function based on pathId.
 */
function generatePathSelector(
  paths: EdgePath[],
  queryName: string,
  pathFunc: string,
  returnType: string,
  params: string,
  args: string,
): string {
  if (paths.length === 1) {
    return `${returnType} ${queryName}(int pathId, ${params}) {
  return path_${paths[0].name}_${pathFunc}(${args});
}`;
  }

  const cases = paths.map((p, i) => `    case ${i}: return path_${p.name}_${pathFunc}(${args});`).join("\n");

  return `${returnType} ${queryName}(int pathId, ${params}) {
  switch (pathId) {
${cases}
    default: return path_${paths[0].name}_${pathFunc}(${args});
  }
}`;
}

/**
 * Generates all clamp T functions and their selectors for multi-path support.
 */
function generateAllClampFunctions(paths: EdgePath[]): string {
  // Generate individual clamp functions for each path
  const clampFunctions = paths
    .map(
      (p) => `${generateFindSourceClampT(p.name)}
${generateFindTargetClampT(p.name)}`,
    )
    .join("\n\n");

  // Generate selector functions
  let selectors: string;
  if (paths.length === 1) {
    selectors = `
float queryFindSourceClampT(int pathId, vec2 source, float sourceSize, int sourceShapeId, vec2 target, float margin) {
  return findSourceClampT_${paths[0].name}(source, sourceSize, sourceShapeId, target, margin);
}

float queryFindTargetClampT(int pathId, vec2 source, vec2 target, float targetSize, int targetShapeId, float margin) {
  return findTargetClampT_${paths[0].name}(source, target, targetSize, targetShapeId, margin);
}`;
  } else {
    const sourceCases = paths
      .map((p, i) => `    case ${i}: return findSourceClampT_${p.name}(source, sourceSize, sourceShapeId, target, margin);`)
      .join("\n");
    const targetCases = paths
      .map((p, i) => `    case ${i}: return findTargetClampT_${p.name}(source, target, targetSize, targetShapeId, margin);`)
      .join("\n");

    selectors = `
float queryFindSourceClampT(int pathId, vec2 source, float sourceSize, int sourceShapeId, vec2 target, float margin) {
  switch (pathId) {
${sourceCases}
    default: return findSourceClampT_${paths[0].name}(source, sourceSize, sourceShapeId, target, margin);
  }
}

float queryFindTargetClampT(int pathId, vec2 source, vec2 target, float targetSize, int targetShapeId, float margin) {
  switch (pathId) {
${targetCases}
    default: return findTargetClampT_${paths[0].name}(source, target, targetSize, targetShapeId, margin);
  }
}`;
  }

  return `${clampFunctions}\n${selectors}`;
}

export function generateEdgeLabelVertexShader(options: EdgeLabelShaderOptions): string {
  const {
    paths,
    hasBorder = false,
    fontSizeMode = "fixed",
    minVisibilityThreshold = 0.5,
    fullVisibilityThreshold = 0.6,
  } = options;
  const isScaledMode = fontSizeMode === "scaled";

  // Check if any path has sharp corners (for step/taxi edges)
  const hasAnySharpCorners = paths.some((p) => p.hasSharpCorners);

  // Compute attribute layout for path attributes (labels need curvature for curved paths)
  const layer = layerPlain(); // Use empty layer for labels
  const attributeLayout = computeAttributeLayout([...paths, layer]);
  const textureFetch = generateEdgeAttributeTextureFetch(attributeLayout);

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

// ============================================================================
// Attributes - Per Character (Instanced)
// ============================================================================

// Edge geometry: indices for texture lookup
// Edge data (source/target node indices, thickness, head/tail ratios) is fetched from edge data texture
// Edge path attributes (curvature, etc.) are fetched from edge attribute texture
in float a_edgeIndex;       // Index into edge data texture
in float a_edgeAttrIndex;   // Index into edge attribute texture (for curvature, etc.)
in float a_baseFontSize;    // Base font size in pixels (per-label)

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
// u_sdfBufferPixels kept for ABI compatibility but unused in shader
uniform float u_sdfBufferPixels;
uniform vec2 u_resolution;
uniform vec2 u_atlasSize;
uniform sampler2D u_nodeDataTexture; // Shared texture with node position/size/shape data
uniform int u_nodeDataTextureWidth;  // Width of 2D node data texture for coordinate calculation
uniform sampler2D u_edgeDataTexture; // Shared texture with edge data
uniform int u_edgeDataTextureWidth;  // Width of 2D edge data texture for coordinate calculation
${isScaledMode ? "uniform float u_zoomSizeRatio;  // Zoom-based size ratio from zoomToSizeRatioFunction" : ""}

// Edge path attribute texture uniforms (for curvature and other path attributes)
${textureFetch.uniformDeclarations}

// ============================================================================
// Varyings
// ============================================================================

out vec2 v_texCoord;
out vec4 v_color;
${hasBorder ? "out vec4 v_borderColor;" : ""}
out float v_edgeFade;  // 0 = fully visible, 1 = fully faded (outside body)
out float v_alphaModifier;  // 0-1 based on label visibility ratio
${hasBorder ? "out float v_positionMode;  // Position mode for conditional border (0=over needs border)" : ""}

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
// Path Attribute Variables (set in main, used by path functions)
// ============================================================================
// Path attributes are fetched from the edge attribute texture and stored in
// variables with v_ prefix (e.g., v_curvature) for path functions to access.
${textureFetch.vertexVaryingDeclarations.replace(/out /g, "")}

// Node size variables (set in main, used by some path functions like loops).
// These mirror the v_sourceNodeSize / v_targetNodeSize varyings in generator.ts,
// but are plain floats here since the label shader is vertex-only.
float v_sourceNodeSize;
float v_targetNodeSize;

// ============================================================================
// Node Shape SDFs (for binary search)
// ============================================================================

${getAllShapeGLSL()}

// Shape selector function
${generateShapeSelectorGLSL()}

// ============================================================================
// Path Functions (all paths for multi-path support)
// ============================================================================

${paths
  .map(
    (p) => `// --- Path: ${p.name} ---
${p.glsl}

// Tangent/normal functions: use analytical if provided, otherwise numerical
${p.analyticalTangentGlsl || generateNumericalTangentNormal(p.name)}

// Auto-generated fallbacks for any missing path functions
${generatePathFallbacks(p.name, p.glsl)}

// Corner skip helpers (for paths with sharp corners like step/taxi)
${p.cornerSkipGlsl || ""}
`,
  )
  .join("\n")}

// ============================================================================
// Path Selector Functions (dispatch based on pathId)
// ============================================================================

${generatePathSelector(paths, "queryPathPosition", "position", "vec2", "float t, vec2 source, vec2 target", "t, source, target")}

${generatePathSelector(paths, "queryPathTangent", "tangent", "vec2", "float t, vec2 source, vec2 target", "t, source, target")}

${generatePathSelector(paths, "queryPathNormal", "normal", "vec2", "float t, vec2 source, vec2 target", "t, source, target")}

${generatePathSelector(paths, "queryPathLength", "length", "float", "vec2 source, vec2 target", "source, target")}

${generatePathSelector(paths, "queryPathTAtDistance", "t_at_distance", "float", "float dist, vec2 source, vec2 target", "dist, source, target")}

${
  hasAnySharpCorners
    ? `// Corner function selectors (only some paths have sharp corners)
vec2 queryGetCornerTs(int pathId, vec2 source, vec2 target) {
  switch (pathId) {
${paths.map((p, i) => (p.hasSharpCorners ? `    case ${i}: return path_${p.name}_getCornerTs(source, target);` : `    case ${i}: return vec2(-1.0, -1.0); // No corners for ${p.name}`)).join("\n")}
    default: return vec2(-1.0, -1.0);
  }
}

vec2 queryGetCornerConcavity(int pathId, vec2 source, vec2 target, float perpOffset) {
  switch (pathId) {
${paths.map((p, i) => (p.hasSharpCorners ? `    case ${i}: return path_${p.name}_getCornerConcavity(source, target, perpOffset);` : `    case ${i}: return vec2(0.0, 0.0); // No corners for ${p.name}`)).join("\n")}
    default: return vec2(0.0, 0.0);
  }
}`
    : ""
}

// ============================================================================
// Binary Search Functions (from shared-glsl.ts)
// ============================================================================

${generateAllClampFunctions(paths)}

// ============================================================================
// Main
// ============================================================================

void main() {
  // -------------------------------------------------------------------------
  // Fetch edge data from edge texture (2 texels per edge)
  // -------------------------------------------------------------------------
  // Texel 0: sourceNodeIndex, targetNodeIndex, thickness, reserved
  // Texel 1: headLengthRatio, tailLengthRatio, pathId, extremityIds
  int edgeIdx = int(a_edgeIndex);
  int texel0Idx = edgeIdx * 2;
  int texel1Idx = edgeIdx * 2 + 1;
  ivec2 edgeTexCoord0 = ivec2(texel0Idx % u_edgeDataTextureWidth, texel0Idx / u_edgeDataTextureWidth);
  ivec2 edgeTexCoord1 = ivec2(texel1Idx % u_edgeDataTextureWidth, texel1Idx / u_edgeDataTextureWidth);
  vec4 edgeData0 = texelFetch(u_edgeDataTexture, edgeTexCoord0, 0);
  vec4 edgeData1 = texelFetch(u_edgeDataTexture, edgeTexCoord1, 0);

  // Unpack edge data
  int srcIdx = int(edgeData0.x);
  int tgtIdx = int(edgeData0.y);
  float thickness = edgeData0.z;
  // edgeData0.w is reserved
  float headLengthRatio = edgeData1.x;
  float tailLengthRatio = edgeData1.y;
  int pathId = int(edgeData1.z);  // Path type for multi-path support
  float baseFontSize = a_baseFontSize;

  // -------------------------------------------------------------------------
  // Fetch path attributes from edge attribute texture
  // -------------------------------------------------------------------------
  // Note: The fetch code uses 'edgeIdx' variable, so we set it to the attribute texture index
  {
    int edgeIdx = int(a_edgeAttrIndex);  // Use attribute texture index for path attributes
${textureFetch.fetchCode}
${textureFetch.varyingAssignments}
  }

  // -------------------------------------------------------------------------
  // Fetch node data from node texture
  // -------------------------------------------------------------------------
  // Texture format: vec4(x, y, size, shapeId)
  // 2D texture layout: texCoord = (index % width, index / width)
  ivec2 srcTexCoord = ivec2(srcIdx % u_nodeDataTextureWidth, srcIdx / u_nodeDataTextureWidth);
  ivec2 tgtTexCoord = ivec2(tgtIdx % u_nodeDataTextureWidth, tgtIdx / u_nodeDataTextureWidth);
  vec4 srcNodeData = texelFetch(u_nodeDataTexture, srcTexCoord, 0);
  vec4 tgtNodeData = texelFetch(u_nodeDataTexture, tgtTexCoord, 0);

  vec2 source = srcNodeData.xy;
  vec2 target = tgtNodeData.xy;
  float sourceSize = srcNodeData.z;
  float targetSize = tgtNodeData.z;
  v_sourceNodeSize = sourceSize;
  v_targetNodeSize = targetSize;
  int sourceShapeId = int(srcNodeData.w);
  int targetShapeId = int(tgtNodeData.w);
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
  float tStart = queryFindSourceClampT(pathId, source, sourceSize, sourceShapeId, target, 0.0);
  float tEnd = queryFindTargetClampT(pathId, source, target, targetSize, targetShapeId, 0.0);

  // Compute path length
  float pathLength = queryPathLength(pathId, source, target);
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
    charT = queryPathTAtDistance(pathId, charArcDist, source, target);
  } else {
    // Offset path traversal: walk along the offset curve to find character position
    // This ensures even character spacing regardless of curvature

    // Start from body center on offset path
    float centerT = queryPathTAtDistance(pathId, bodyCenterDist, source, target);

    ${
      hasAnySharpCorners
        ? `// -----------------------------------------------------------------------
    // Corner skip setup for step/taxi edges with above/below labels
    // -----------------------------------------------------------------------
    // At concave corners (inner side of the bend), characters would bunch up
    // because the offset path has near-zero arc length. We detect corner
    // crossings during the offset path traversal and add skip distance.

    // Get corner t values and concavity
    vec2 cornerTs = queryGetCornerTs(pathId, source, target);
    vec2 concavity = queryGetCornerConcavity(pathId, source, target, perpOffset);

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
      vec2 centerPos = queryPathPosition(pathId, centerT, source, target);
      vec2 centerNormal = queryPathNormal(pathId, centerT, source, target);
      vec2 offsetCenter = centerPos + centerNormal * perpOffset;

      float searchDir = charCenterOffset > 0.0 ? 1.0 : -1.0;

      // Search bounds (t values for body start and end)
      float tBodyStart = queryPathTAtDistance(pathId, bodyStartDist, source, target);
      float tBodyEnd = queryPathTAtDistance(pathId, bodyEndDist, source, target);

      // Walk along offset path to find character position
      float accumDist = 0.0;
      vec2 prevOffsetPos = offsetCenter;
      float prevT = centerT;
      float foundT = centerT;

      // Search range depends on direction
      float tSearchEnd = searchDir > 0.0 ? tBodyEnd : tBodyStart;

      ${
        hasAnySharpCorners
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
          hasAnySharpCorners
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
        vec2 stepPos = queryPathPosition(pathId, stepT, source, target);
        vec2 stepNormal = queryPathNormal(pathId, stepT, source, target);
        vec2 offsetPos = stepPos + stepNormal * perpOffset;

        // Distance along offset path
        float segDist = length(offsetPos - prevOffsetPos);

        ${
          hasAnySharpCorners
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
  vec2 pathPos = queryPathPosition(pathId, charT, source, target);
  vec2 tangent = queryPathTangent(pathId, charT, source, target);

  // Compute perpendicular direction (90 degrees from tangent)
  vec2 perpDir = vec2(-tangent.y, tangent.x);

  // Apply perpendicular offset to path position
  vec2 offsetPathPos = pathPos + perpDir * perpOffset;

  // -------------------------------------------------------------------------
  // Step 8: Build character quad
  // -------------------------------------------------------------------------
  // Character size in screen pixels
  vec2 charSizePixels = charSize * fontScale;

  // Character offset from origin to the atlas region's top-left corner.
  // bearingX/bearingY already include the SDF buffer.
  vec2 charOffsetPixels = charOffset * fontScale;

  // The character's local X offset from pathPos (which is at character center)
  float charLocalX = -charAdvance * 0.5 * fontScale;

  // Build quad position:
  // - Start at character origin (charLocalX on X axis, 0 on Y axis = baseline)
  // - Add bearing offset to get to atlas region corner
  // - Add quad corner * size to get vertex position
  vec2 quadPos;
  quadPos.x = charLocalX + charOffsetPixels.x + a_quadCorner.x * charSizePixels.x;
  // charOffset.y = -bearingY (negated), so -charOffsetPixels.y = bearingY * fontScale
  // (distance from baseline to atlas region top, positive = upward)
  // Quad corner (0,0) = bottom-left, (1,1) = top-right
  quadPos.y = -charOffsetPixels.y - charSizePixels.y * (1.0 - a_quadCorner.y);

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
${hasBorder ? "  v_borderColor = a_borderColor;\n  v_borderColor.a *= bias;\n  v_positionMode = positionMode;" : ""}
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
${hasBorder ? "in float v_positionMode;  // Position mode (0=over, 1=above, 2=below, 3=auto)" : ""}

uniform sampler2D u_atlas;
uniform float u_gamma;
uniform float u_sdfBuffer;
uniform float u_pixelRatio;
${hasBorder ? "uniform float u_borderWidth;  // Border width in SDF units (normalized)" : ""}

// Fragment output (single target - picking handled via separate pass)
out vec4 fragColor;

void main() {
  #ifdef PICKING_MODE
    // Edge labels are not pickable - discard all fragments in picking mode
    discard;
  #else
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
    ? `  // Fill alpha: fully opaque inside the glyph
  float fillAlpha = smoothstep(edge - aaWidth, edge + aaWidth, sdfValue);

  // Only apply border for "over" position mode (v_positionMode == 0.0)
  // Labels positioned above/below/auto don't overlap the edge line and don't need borders
  if (v_positionMode < 0.5) {
    // Border rendering: compute alpha for both fill and border regions
    // Border extends from (edge - borderWidth) to edge
    float borderEdge = edge - u_borderWidth;

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

    fragColor = vec4(finalColor, finalAlpha);
  } else {
    // No border for above/below/auto positions - simple text rendering
    float finalAlpha = v_color.a * fillAlpha * edgeAlpha;
    fragColor = vec4(v_color.rgb * finalAlpha, finalAlpha);
  }`
    : `  // Smooth transition from transparent to opaque at glyph edge
  float alpha = smoothstep(edge - aaWidth, edge + aaWidth, sdfValue);

  // Premultiplied alpha output
  float finalAlpha = v_color.a * alpha * edgeAlpha;
  fragColor = vec4(v_color.rgb * finalAlpha, finalAlpha);`
}
  #endif
}
`;

  return glsl;
}

// ============================================================================
// Uniform Collection
// ============================================================================

export function collectEdgeLabelUniforms(
  paths: EdgePath[],
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
    "u_edgeDataTexture",
    "u_edgeDataTextureWidth",
    // Edge path attribute texture uniforms
    "u_edgeAttributeTexture",
    "u_edgeAttributeTextureWidth",
    "u_edgeAttributeTexelsPerEdge",
  ];

  // Add zoom size ratio uniform for scaled font size mode
  if (fontSizeMode === "scaled") {
    uniforms.push("u_zoomSizeRatio");
  }

  // Add border width uniform if border is enabled
  if (hasBorder) {
    uniforms.push("u_borderWidth");
  }

  // Add path-specific uniforms from all paths
  for (const path of paths) {
    for (const uniform of path.uniforms) {
      if (!uniforms.includes(uniform.name)) {
        uniforms.push(uniform.name);
      }
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
    uniforms: collectEdgeLabelUniforms(options.paths, hasBorder, fontSizeMode),
  };
}
