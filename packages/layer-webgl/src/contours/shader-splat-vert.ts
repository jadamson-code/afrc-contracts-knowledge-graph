export default function getSplatVertexShader() {
  // language=GLSL
  const SHADER = /*glsl*/ `#version 300 es
in vec2 a_position;

uniform sampler2D u_nodesTexture;
uniform mat3 u_matrix;
uniform float u_radius;
uniform float u_correctionRatio;
uniform float u_zoomModifier;

out vec2 v_offset;

void main() {
  vec2 nodePos = texelFetch(u_nodesTexture, ivec2(gl_InstanceID, 0), 0).xy;

  float factor = 0.5 / u_correctionRatio;
  float radius = u_radius * u_zoomModifier;
  float correctedRadius = radius / factor;

  vec2 worldPos = nodePos + a_position * correctedRadius;
  vec3 clip = u_matrix * vec3(worldPos, 1.0);

  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_offset = a_position;
}
  `;

  return SHADER;
}
