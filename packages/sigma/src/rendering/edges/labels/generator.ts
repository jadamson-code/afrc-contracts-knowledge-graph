/**
 * Sigma.js Edge Label Shader Generator
 * =====================================
 *
 * Generates GLSL shaders for edge label rendering.
 * Labels are positioned along the edge path (midpoint for straight edges,
 * curve-following for curved edges).
 *
 * @module
 */
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
 * For each character, the shader:
 * 1. Computes the character's position along the path (using arc distance)
 * 2. Gets the tangent at that point for rotation
 * 3. Positions the character quad accordingly
 *
 * For straight edges, all characters have the same rotation.
 * For curved edges, each character rotates independently to follow the curve.
 */
export function generateEdgeLabelVertexShader(options: EdgeLabelShaderOptions): string {
  const { path } = options;
  const pathName = path.name;

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

// ============================================================================
// Attributes
// ============================================================================

// Per-character (instanced)
in vec2 a_source;            // Edge source position in graph coordinates
in vec2 a_target;            // Edge target position in graph coordinates
in float a_curvature;        // Path curvature (0 for straight)
in vec2 a_charOffset;        // Character offset from label start (pixels)
in vec2 a_charSize;          // Character dimensions (pixels)
in vec4 a_texCoords;         // Atlas coords: (x, y, width, height) in pixels
in vec4 a_color;             // Text color (RGBA)
in float a_fontSize;         // Font size in pixels
in float a_labelOffset;      // Perpendicular offset from path (pixels)
in float a_labelWidth;       // Total label width (pixels)
in float a_charIndex;        // Index of this character in the label
in float a_totalChars;       // Total characters in the label

// Per-vertex (constant quad corners)
in vec2 a_quadCorner;        // Quad corner: [-1,-1], [1,-1], [-1,1], [1,1]

// ============================================================================
// Uniforms
// ============================================================================

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_zoomRatio;
uniform float u_cameraAngle;
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
const float PI = 3.14159265359;

// ============================================================================
// Path Functions
// ============================================================================

${path.glsl}

// ============================================================================
// Main
// ============================================================================

void main() {
  // -------------------------------------------------------------------------
  // Step 1: Compute path length and label centering
  // -------------------------------------------------------------------------
  float pathLen = path_${pathName}_length(a_source, a_target);

  // Scale factor for converting pixels to graph units
  float pixelToGraph = u_correctionRatio / u_sizeRatio;

  // Center label on path
  float labelWidthGraph = a_labelWidth * pixelToGraph;
  float labelStartDist = (pathLen - labelWidthGraph) * 0.5;

  // Character center distance along path
  float charCenterDist = labelStartDist + a_charOffset.x * pixelToGraph;

  // Clamp to valid range
  charCenterDist = clamp(charCenterDist, 0.0, pathLen);

  // -------------------------------------------------------------------------
  // Step 2: Find t parameter for this distance
  // -------------------------------------------------------------------------
  float t = path_${pathName}_t_at_distance(charCenterDist, a_source, a_target);

  // -------------------------------------------------------------------------
  // Step 3: Get position and tangent at this t
  // -------------------------------------------------------------------------
  vec2 pathPos = path_${pathName}_position(t, a_source, a_target);
  vec2 tangent = path_${pathName}_tangent(t, a_source, a_target);

  // Normal points "left" of the direction of travel (counterclockwise 90 degrees)
  vec2 normal = vec2(-tangent.y, tangent.x);

  // -------------------------------------------------------------------------
  // Step 4: Compute rotation angle from tangent
  // -------------------------------------------------------------------------
  float angle = atan(tangent.y, tangent.x);

  // Flip text if pointing left (for readability)
  // Also flip the offset direction when text is flipped
  float flipSign = 1.0;
  if (tangent.x < 0.0) {
    angle += PI;
    flipSign = -1.0;
  }

  // -------------------------------------------------------------------------
  // Step 5: Apply perpendicular offset (always below the edge in screen space)
  // -------------------------------------------------------------------------
  // Offset is in pixels, convert to graph units
  // Negate to place labels below the edge (normal points left/up from direction of travel)
  // Use flipSign to ensure label is always on the same visual side when text is flipped
  float offsetGraph = -a_labelOffset * pixelToGraph * flipSign;
  pathPos += normal * offsetGraph;

  // -------------------------------------------------------------------------
  // Step 6: Build rotation matrix
  // -------------------------------------------------------------------------
  float c = cos(angle);
  float s = sin(angle);
  mat2 rotation = mat2(c, s, -s, c);

  // -------------------------------------------------------------------------
  // Step 7: Compute character quad position
  // -------------------------------------------------------------------------
  // Map quad corners from [-1,1] to [0,1] range (same as node labels)
  vec2 cornerOffset01 = (a_quadCorner + 1.0) * 0.5;

  // Quad corner offset in pixels, centered on the character
  vec2 cornerOffset = (cornerOffset01 - 0.5) * a_charSize;

  // Character vertical offset (baseline adjustment)
  vec2 charVerticalOffset = vec2(0.0, a_charOffset.y);

  // Full local position in pixels
  vec2 localPosPx = charVerticalOffset + cornerOffset;

  // Convert to graph units
  vec2 localPos = localPosPx * pixelToGraph;

  // Rotate to align with path tangent
  vec2 rotatedPos = rotation * localPos;

  // Final world position
  vec2 worldPos = pathPos + rotatedPos;

  // -------------------------------------------------------------------------
  // Step 8: Transform to clip space
  // -------------------------------------------------------------------------
  gl_Position = vec4((u_matrix * vec3(worldPos, 1.0)).xy, 0.0, 1.0);

  // -------------------------------------------------------------------------
  // Step 9: Texture coordinates
  // -------------------------------------------------------------------------
  // Use same cornerOffset01 as position for consistent mapping
  vec2 texCorner = vec2((a_quadCorner.x + 1.0) * 0.5, (1.0 - a_quadCorner.y) * 0.5);
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
 * This is identical to the node label fragment shader.
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
  float gamma = u_gamma / u_pixelRatio;

  // Pure gamma-based anti-aliasing using smoothstep
  float alpha = smoothstep(edgeThreshold - gamma, edgeThreshold + gamma, sdfValue);

  // Discard fully transparent fragments
  if (alpha < 0.01) discard;

  fragColor = vec4(v_color.rgb, v_color.a * alpha);
  fragPicking = v_color;
}
`;

  return glsl;
}

// ============================================================================
// Uniform Collection
// ============================================================================

export function collectEdgeLabelUniforms(): string[] {
  return [
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_zoomRatio",
    "u_cameraAngle",
    "u_resolution",
    "u_atlasSize",
    "u_atlas",
    "u_gamma",
    "u_sdfBuffer",
    "u_pixelRatio",
  ];
}

// ============================================================================
// Main Generator Function
// ============================================================================

export function generateEdgeLabelShaders(options: EdgeLabelShaderOptions): GeneratedEdgeLabelShaders {
  return {
    vertexShader: generateEdgeLabelVertexShader(options),
    fragmentShader: generateEdgeLabelFragmentShader(),
    uniforms: collectEdgeLabelUniforms(),
  };
}
