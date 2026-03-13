export default function getSplatFragmentShader() {
  // language=GLSL
  const SHADER = /*glsl*/ `#version 300 es
precision highp float;

in vec2 v_offset;
in float v_weight;

out vec4 fragColor;

void main() {
  float dist = length(v_offset);
  if (dist > 1.0) discard;
  float score = smoothstep(1.0, 0.0, dist) * v_weight;
  fragColor = vec4(score, 0.0, 0.0, 0.0);
}
  `;

  return SHADER;
}
