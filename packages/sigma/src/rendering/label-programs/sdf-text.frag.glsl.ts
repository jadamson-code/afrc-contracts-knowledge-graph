/**
 * Sigma.js SDF Text Label - Fragment Shader
 * ==========================================
 *
 * Fragment shader for SDF-based text rendering.
 * Uses signed distance field for smooth, scalable text.
 *
 * @module
 */

// language=GLSL
const SHADER_SOURCE = /*glsl*/ `#version 300 es
precision highp float;

// Varyings
in vec2 v_texCoord;
in vec4 v_color;

// Uniforms
uniform sampler2D u_atlas;
uniform float u_gamma;       // Controls edge sharpness (typically 1.0-2.0)
uniform float u_sdfBuffer;   // SDF buffer size (typically 0.5 for TinySDF)

// Outputs - MRT for picking support
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

void main() {
  // Sample the SDF value from the atlas texture
  // TinySDF stores the distance in the alpha channel using formula:
  //   value = 255 - 255 * (d / radius + cutoff)
  // At edge (d=0): value = 255 * (1 - cutoff) = 191 for cutoff=0.25
  // HIGH values (255) = inside glyph, LOW values (0) = outside
  // Edge is at value = 1 - cutoff (0.75 for cutoff=0.25)
  float sdfValue = texture(u_atlas, v_texCoord).a;

  // Normalize: convert to signed distance where 0 = edge
  // The edge threshold is (1.0 - u_sdfBuffer), not u_sdfBuffer directly
  // signedDist > 0 means inside glyph (we want alpha = 1)
  // signedDist < 0 means outside glyph (we want alpha = 0)
  // Subtract a small offset to make text slightly thicker (compensate for thin rendering)
  float edgeThreshold = 1.0 - u_sdfBuffer - 0.02;
  float signedDist = sdfValue - edgeThreshold;

  // Compute anti-aliased alpha using smoothstep with adaptive edge width
  // fwidth() gives the screen-space rate of change of signedDist
  // This provides proper anti-aliasing for all angles (especially diagonals like "/")
  float edgeWidth = fwidth(signedDist) * 0.75;
  // Clamp to reasonable bounds to prevent too soft or too sharp edges
  edgeWidth = clamp(edgeWidth, 0.01, 0.1);
  float alpha = smoothstep(-edgeWidth, edgeWidth, signedDist);

  // DEBUG: Show texture coordinates as colors to debug aliasing
  // fragColor = vec4(v_texCoord.x, v_texCoord.y, 0.0, 1.0);

  // Apply color with computed alpha
  fragColor = vec4(v_color.rgb, v_color.a * alpha);

  // Picking output - solid color within text bounds
  // Use a harder threshold for picking
  if (alpha > 0.5) {
    fragPicking = v_color;
  } else {
    fragPicking = vec4(0.0);
  }
}
`;

export default SHADER_SOURCE;
