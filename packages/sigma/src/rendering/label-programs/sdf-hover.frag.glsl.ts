/**
 * Sigma.js SDF Hover Label - Fragment Shader
 * ==========================================
 *
 * Fragment shader for hover labels with background and node halo.
 * Uses SDF for smooth rounded rectangles and circular halos.
 *
 * @module
 */

// language=GLSL
const SHADER_SOURCE = /*glsl*/ `#version 300 es
precision highp float;

// Varyings
in vec2 v_uv;                // Position relative to node center in pixels
in vec4 v_backgroundColor;
in vec4 v_haloColor;
in float v_nodeRadius;
in float v_haloSize;
in float v_cornerRadius;
in vec2 v_labelSize;
in vec2 v_nodeOffset;        // Center of label relative to node

// Outputs
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

// SDF for a rounded rectangle
float sdfRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 d = abs(p) - halfSize + vec2(radius);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
}

// SDF for a circle
float sdfCircle(vec2 p, float radius) {
  return length(p) - radius;
}

void main() {
  // Anti-aliasing width
  float aa = 1.0;

  // 1. Compute halo SDF (ring around the node)
  float nodeCircleSdf = sdfCircle(v_uv, v_nodeRadius);
  float haloOuterSdf = sdfCircle(v_uv, v_nodeRadius + v_haloSize);

  // Halo is the region between node edge and halo outer edge
  float haloAlpha = smoothstep(aa, -aa, haloOuterSdf) * smoothstep(-aa, aa, nodeCircleSdf);

  // 2. Compute label background SDF
  vec2 labelPos = v_uv - v_nodeOffset;
  vec2 labelHalfSize = v_labelSize * 0.5;
  float labelSdf = sdfRoundedRect(labelPos, labelHalfSize, v_cornerRadius);
  float labelAlpha = smoothstep(aa, -aa, labelSdf);

  // 3. Composite: label background on top of halo
  // Start with transparent
  vec4 color = vec4(0.0);

  // Add halo (behind everything)
  color = mix(color, v_haloColor, haloAlpha);

  // Add label background (on top of halo)
  color = mix(color, v_backgroundColor, labelAlpha);

  // Output
  fragColor = color;

  // Picking - treat the entire area as pickable
  if (haloAlpha > 0.5 || labelAlpha > 0.5) {
    fragPicking = vec4(1.0, 1.0, 1.0, 1.0);  // Generic hover indicator
  } else {
    fragPicking = vec4(0.0);
  }
}
`;

export default SHADER_SOURCE;
