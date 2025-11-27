/**
 * Sigma.js SDF Text Label - Vertex Shader
 * ========================================
 *
 * Vertex shader for SDF-based text rendering using instanced rendering.
 * Each character is rendered as a textured quad positioned in screen space.
 *
 * ## Architecture
 *
 * This is the "fallback" vertex shader that assumes all nodes are circles.
 * For shape-aware label positioning (squares, triangles, etc.), use
 * `createComposedPrograms()` which generates a label program with the
 * actual shape SDF embedded for accurate edge detection.
 *
 * ## Instanced Rendering
 *
 * Characters are rendered using instanced rendering:
 * - Per-instance attributes define character position and appearance
 * - Constant attributes define the quad corners (4 vertices per character)
 * - Each instance draws one character as a textured quad
 *
 * ## Coordinate Systems
 *
 * 1. **Graph space**: Original node positions (a_anchorPosition)
 * 2. **Clip space**: After u_matrix transform, range [-1, 1]
 * 3. **Screen pixels**: Actual pixel positions for character layout
 *
 * @module
 */

// language=GLSL
const SHADER_SOURCE = /*glsl*/ `#version 300 es

// ============================================================================
// Per-Instance Attributes (one set per character)
// ============================================================================

in vec2 a_anchorPosition;    // Node center position in graph space
in vec2 a_charOffset;        // Character offset from label origin in pixels
in vec2 a_charSize;          // Character glyph dimensions in pixels (w, h)
in vec4 a_texCoords;         // Atlas texture coords (x, y, w, h) in pixels
in vec4 a_color;             // Text color (packed RGBA as normalized bytes)
in float a_nodeSize;         // Node size in graph coordinates
in float a_margin;           // Gap between node boundary and label in pixels
in float a_positionMode;     // Label position: 0=right, 1=left, 2=above, 3=below, 4=over

// ============================================================================
// Constant Attributes (per vertex - defines quad geometry)
// ============================================================================

in vec2 a_quadCorner;        // Quad corner: [-1,-1], [1,-1], [-1,1], [1,1]

// ============================================================================
// Transform Uniforms
// ============================================================================

uniform mat3 u_matrix;           // Graph-to-clip-space transformation
uniform float u_sizeRatio;       // Camera zoom ratio
uniform float u_correctionRatio; // Size correction for consistent appearance
uniform float u_cameraAngle;     // Camera rotation angle in radians

// ============================================================================
// Label Rendering Uniforms
// ============================================================================

uniform vec2 u_resolution;       // Viewport dimensions in pixels
uniform vec2 u_atlasSize;        // Glyph atlas texture dimensions in pixels

// ============================================================================
// Varyings (passed to fragment shader)
// ============================================================================

out vec2 v_texCoord;             // Texture coordinate for glyph sampling
out vec4 v_color;                // Text color

// ============================================================================
// Constants
// ============================================================================

const float bias = 255.0 / 254.0;  // Color bias to avoid precision issues

// ============================================================================
// Main Vertex Shader
// ============================================================================

void main() {
  // -------------------------------------------------------------------------
  // Step 1: Transform node anchor to clip space
  // -------------------------------------------------------------------------
  vec3 anchorClip = u_matrix * vec3(a_anchorPosition, 1.0);

  // -------------------------------------------------------------------------
  // Step 2: Calculate node radius in screen pixels
  // -------------------------------------------------------------------------
  // The node size goes through these transformations:
  // - a_nodeSize: size in graph coordinates
  // - u_correctionRatio / u_sizeRatio: converts to NDC-like clip space
  // - u_resolution.x / 2: converts from NDC range [-1,1] to pixels
  float nodeRadiusNDC = a_nodeSize * u_correctionRatio / u_sizeRatio * 2.0;
  float nodeRadiusPixels = nodeRadiusNDC * u_resolution.x / 2.0;

  // For circles, the edge is at the full radius (inradiusFactor = 1.0)
  // For other shapes, use the composed label program which embeds the actual SDF
  float boundaryDistPixels = nodeRadiusPixels;

  // -------------------------------------------------------------------------
  // Step 3: Calculate position offset based on label position mode
  // -------------------------------------------------------------------------
  vec2 positionOffset = vec2(0.0);

  if (a_positionMode < 0.5) {
    // Right: label starts at node boundary + margin
    positionOffset.x = boundaryDistPixels + a_margin;
  } else if (a_positionMode < 1.5) {
    // Left: label ends at node boundary - margin (negative offset)
    positionOffset.x = -(boundaryDistPixels + a_margin);
  } else if (a_positionMode < 2.5) {
    // Above: label below node boundary + margin (positive Y in graph space)
    positionOffset.y = boundaryDistPixels + a_margin;
  } else if (a_positionMode < 3.5) {
    // Below: label above node boundary - margin (negative Y in graph space)
    positionOffset.y = -(boundaryDistPixels + a_margin);
  }
  // Position mode 4 (over): label centered on node, no offset needed

  // -------------------------------------------------------------------------
  // Step 4: Counter-rotate position offset for camera rotation
  // -------------------------------------------------------------------------
  // Labels stay screen-aligned (don't rotate with camera), so we must
  // counter-rotate the position offset to find the correct screen position
  float c = cos(u_cameraAngle);
  float s = sin(u_cameraAngle);
  positionOffset = mat2(c, s, -s, c) * positionOffset;

  // -------------------------------------------------------------------------
  // Step 5: Calculate final vertex position
  // -------------------------------------------------------------------------
  // Map quad corner from [-1,1] to [0,1] for interpolation
  vec2 cornerOffset = (a_quadCorner + 1.0) * 0.5;

  // Compute character position in screen pixels:
  // - positionOffset: distance from node center to label origin
  // - a_charOffset: character position within the label
  // - cornerOffset * a_charSize: position within the character quad
  vec2 charPixelPos = positionOffset + a_charOffset + cornerOffset * a_charSize;

  // Convert pixel offset to NDC offset
  // Note: Y is negated because screen Y increases downward, but clip Y increases upward
  vec2 ndcOffset = vec2(charPixelPos.x, -charPixelPos.y) * 2.0 / u_resolution;

  gl_Position = vec4(anchorClip.xy + ndcOffset, 0.0, 1.0);

  // -------------------------------------------------------------------------
  // Step 6: Calculate texture coordinates for glyph sampling
  // -------------------------------------------------------------------------
  // a_texCoords contains (atlasX, atlasY, glyphWidth, glyphHeight) in pixels
  // cornerOffset interpolates across the glyph in the atlas
  v_texCoord = (a_texCoords.xy + cornerOffset * a_texCoords.zw) / u_atlasSize;

  // -------------------------------------------------------------------------
  // Step 7: Pass color to fragment shader
  // -------------------------------------------------------------------------
  v_color = a_color;
  v_color.a *= bias;  // Apply bias to avoid precision issues with alpha
}
`;

export default SHADER_SOURCE;
