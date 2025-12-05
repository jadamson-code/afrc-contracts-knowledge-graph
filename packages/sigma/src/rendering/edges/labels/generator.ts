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
  const { path } = options;
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
in vec4 a_charMetrics;      // (charTextOffset, charAdvance, totalTextWidth, unused)
in vec4 a_charDims;         // (charSize.x, charSize.y, charOffset.x, charOffset.y)

// Atlas texture coordinates
in vec4 a_texCoords;        // (x, y, width, height) in atlas pixels

// Appearance
in vec4 a_color;            // Character color (RGBA, normalized)

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

// ============================================================================
// Constants
// ============================================================================

const float bias = 255.0 / 254.0;

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
  vec2 charSize = a_charDims.xy;
  vec2 charOffset = a_charDims.zw;

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
  // Step 4: Truncation check
  // -------------------------------------------------------------------------
  // Discard characters that don't fit within the body
  // Character center position relative to label center
  float charCenterOffset = charOffsetWebGL + charAdvanceWebGL * 0.5 - textWidthWebGL * 0.5;

  // Check if this character fits within half the body length
  if (abs(charCenterOffset) > bodyLength * 0.5) {
    // Character doesn't fit - move vertex off-screen
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  // -------------------------------------------------------------------------
  // Step 5: Position character on path
  // -------------------------------------------------------------------------
  // Body center in arc distance
  float bodyCenterDist = (bodyStartDist + bodyEndDist) * 0.5;

  // Character center in arc distance
  float charArcDist = bodyCenterDist + charCenterOffset;

  // Convert arc distance to parameter t
  float charT = path_${pathName}_t_at_distance(charArcDist, source, target);

  // Get position and tangent at this t
  vec2 pathPos = path_${pathName}_position(charT, source, target);
  vec2 tangent = path_${pathName}_tangent(charT, source, target);

  // -------------------------------------------------------------------------
  // Step 6: Build character quad
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

  // Center vertically on the path (offset by half the typical cap height)
  // This is approximate - a proper solution would use font metrics
  quadPos.y -= charSizePixels.y * 0.15;

  // -------------------------------------------------------------------------
  // Step 7: Rotate quad to align with tangent
  // -------------------------------------------------------------------------
  // Rotation matrix from tangent
  // tangent = (cos(angle), sin(angle)), so we can build rotation directly
  mat2 rotation = mat2(tangent.x, tangent.y, -tangent.y, tangent.x);

  // Convert pixel offset to WebGL units for rotation
  vec2 quadPosWebGL = quadPos * u_correctionRatio / u_sizeRatio;

  // Rotate around character center on path
  vec2 rotatedOffset = rotation * quadPosWebGL;

  // Final position in graph space
  vec2 worldPos = pathPos + rotatedOffset;

  // -------------------------------------------------------------------------
  // Step 8: Transform to clip space
  // -------------------------------------------------------------------------
  vec3 clipPos = u_matrix * vec3(worldPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);

  // -------------------------------------------------------------------------
  // Step 9: Texture coordinates
  // -------------------------------------------------------------------------
  // Flip Y for texture coordinates (texture Y goes down, quad Y goes up)
  vec2 texCorner = vec2(a_quadCorner.x, 1.0 - a_quadCorner.y);
  v_texCoord = (a_texCoords.xy + texCorner * a_texCoords.zw) / u_atlasSize;

  // -------------------------------------------------------------------------
  // Step 10: Pass color
  // -------------------------------------------------------------------------
  v_color = a_color;
  v_color.a *= bias;
}
`;

  return glsl;
}

// ============================================================================
// Fragment Shader Generation
// ============================================================================

/**
 * Generates the fragment shader for SDF-based text rendering.
 * Uses smoothstep for anti-aliased edges.
 *
 * Edge labels are NOT pickable (picking output is transparent).
 */
export function generateEdgeLabelFragmentShader(): string {
  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec4 v_color;

uniform sampler2D u_atlas;
uniform float u_gamma;
uniform float u_sdfBuffer;
uniform float u_pixelRatio;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

void main() {
  // Sample SDF value from atlas (high = inside glyph, low = outside)
  float sdfValue = texture(u_atlas, v_texCoord).a;

  // Edge threshold: 1.0 - cutoff = 0.75 for default cutoff=0.25
  float edgeThreshold = 1.0 - u_sdfBuffer;

  // Gamma controls the anti-aliasing band width
  // Scale by pixel ratio for HiDPI support
  float gamma = u_gamma / u_pixelRatio;

  // Anti-aliasing using smoothstep
  float alpha = smoothstep(edgeThreshold - gamma, edgeThreshold + gamma, sdfValue);

  // Use premultiplied alpha output to match the blend function (ONE, ONE_MINUS_SRC_ALPHA)
  // This ensures that when alpha=0, RGB is also 0 and doesn't affect blending
  float finalAlpha = v_color.a * alpha;
  fragColor = vec4(v_color.rgb * finalAlpha, finalAlpha);

  // Edge labels are not pickable
  fragPicking = vec4(0.0);
}
`;

  return glsl;
}

// ============================================================================
// Uniform Collection
// ============================================================================

export function collectEdgeLabelUniforms(path: EdgePath): string[] {
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
  return {
    vertexShader: generateEdgeLabelVertexShader(options),
    fragmentShader: generateEdgeLabelFragmentShader(),
    uniforms: collectEdgeLabelUniforms(options.path),
  };
}
