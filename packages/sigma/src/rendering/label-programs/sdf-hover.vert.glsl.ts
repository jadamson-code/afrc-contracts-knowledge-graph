/**
 * Sigma.js SDF Hover Label - Vertex Shader
 * =========================================
 *
 * Vertex shader for hover labels with background and node halo.
 *
 * ## What This Shader Does
 *
 * Renders a quad that encompasses both:
 * 1. A rounded rectangle background behind the label text
 * 2. A halo ring around the node
 *
 * The fragment shader then uses SDF functions to actually draw these shapes
 * with anti-aliased edges.
 *
 * ## Coordinate Calculation
 *
 * The quad must be large enough to contain both the node halo and the label
 * background. This shader computes the union of these two bounding boxes
 * to determine the final quad size and position.
 *
 * @module
 */

// language=GLSL
const SHADER_SOURCE = /*glsl*/ `#version 300 es

// ============================================================================
// Per-Instance Attributes (one set per hover label)
// ============================================================================

in vec2 a_nodePosition;      // Node position in graph space
in float a_nodeSize;         // Node size in graph coordinates
in vec4 a_labelBounds;       // Label bounding box (x, y, width, height) in pixels relative to node
in vec4 a_backgroundColor;   // Background color (packed RGBA as normalized bytes)
in vec4 a_haloColor;         // Halo color (packed RGBA as normalized bytes)
in float a_haloSize;         // Halo ring width in pixels
in float a_cornerRadius;     // Background corner radius in pixels
in float a_padding;          // Padding around text in pixels

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

// ============================================================================
// Varyings (passed to fragment shader)
// ============================================================================

out vec2 v_uv;               // UV coordinates for SDF calculations (centered at node)
out vec4 v_backgroundColor;  // Background color
out vec4 v_haloColor;        // Halo color
out float v_nodeRadius;      // Node radius in screen pixels
out float v_haloSize;        // Halo ring width in pixels
out float v_cornerRadius;    // Corner radius for rounded rectangle
out vec2 v_labelSize;        // Label size including padding (for SDF)
out vec2 v_nodeOffset;       // Offset from node center to label center

// ============================================================================
// Constants
// ============================================================================

const float bias = 255.0 / 254.0;  // Color bias to avoid precision issues

// ============================================================================
// Main Vertex Shader
// ============================================================================

void main() {
  // -------------------------------------------------------------------------
  // Step 1: Transform node position to clip space
  // -------------------------------------------------------------------------
  vec3 nodeClip = u_matrix * vec3(a_nodePosition, 1.0);

  // -------------------------------------------------------------------------
  // Step 2: Calculate node radius in screen pixels
  // -------------------------------------------------------------------------
  // Convert node size from graph coordinates to screen pixels
  float nodeRadius = a_nodeSize * u_correctionRatio / u_sizeRatio;

  // -------------------------------------------------------------------------
  // Step 3: Calculate total bounds (union of halo circle and label rectangle)
  // -------------------------------------------------------------------------
  // The quad needs to encompass both the node halo and the label background

  // Halo extends beyond the node by haloSize pixels
  float haloRadius = nodeRadius + a_haloSize;

  // Label bounds are relative to node center (x, y, width, height)
  vec2 labelMin = a_labelBounds.xy;
  vec2 labelMax = a_labelBounds.xy + a_labelBounds.zw;

  // Compute the union of halo circle bounding box and label rectangle
  vec2 boundsMin = vec2(
    min(-haloRadius, labelMin.x - a_padding),
    min(-haloRadius, labelMin.y - a_padding)
  );
  vec2 boundsMax = vec2(
    max(haloRadius, labelMax.x + a_padding),
    max(haloRadius, labelMax.y + a_padding)
  );

  // Quad dimensions and center
  vec2 quadSize = boundsMax - boundsMin;
  vec2 quadCenter = (boundsMin + boundsMax) * 0.5;

  // -------------------------------------------------------------------------
  // Step 4: Counter-rotate for camera rotation
  // -------------------------------------------------------------------------
  // The quad stays screen-aligned, so we counter-rotate positions
  float c = cos(u_cameraAngle);
  float s = sin(u_cameraAngle);
  mat2 rotMat = mat2(c, s, -s, c);

  // -------------------------------------------------------------------------
  // Step 5: Calculate final vertex position
  // -------------------------------------------------------------------------
  // Map quad corner from [-1,1] to [0,1] for interpolation
  vec2 cornerOffset = (a_quadCorner + 1.0) * 0.5;

  // Local position within the quad (in screen pixels)
  vec2 localPos = boundsMin + cornerOffset * quadSize;

  // Apply camera rotation
  vec2 rotatedPos = rotMat * localPos;

  // Convert to NDC offset and apply to node clip position
  vec2 ndcOffset = rotatedPos * 2.0 / u_resolution;
  gl_Position = vec4(nodeClip.xy + ndcOffset, 0.0, 1.0);

  // -------------------------------------------------------------------------
  // Step 6: Calculate UV for fragment shader SDF calculations
  // -------------------------------------------------------------------------
  // UV is centered at quad center for easier SDF math
  v_uv = rotMat * (localPos - quadCenter);

  // -------------------------------------------------------------------------
  // Step 7: Pass data to fragment shader
  // -------------------------------------------------------------------------

  // Colors (apply bias for precision)
  v_backgroundColor = a_backgroundColor;
  v_backgroundColor.a *= bias;
  v_haloColor = a_haloColor;
  v_haloColor.a *= bias;

  // Geometry data for SDF calculations
  v_nodeRadius = nodeRadius;
  v_haloSize = a_haloSize;
  v_cornerRadius = a_cornerRadius;
  v_labelSize = a_labelBounds.zw + vec2(a_padding * 2.0);

  // Offset from node center to label center (for rounded rectangle positioning)
  v_nodeOffset = rotMat * (vec2(a_labelBounds.x, a_labelBounds.y) + a_labelBounds.zw * 0.5);
}
`;

export default SHADER_SOURCE;
