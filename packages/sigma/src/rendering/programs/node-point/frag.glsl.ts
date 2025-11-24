// language=GLSL
const SHADER_SOURCE = /*glsl*/ `#version 300 es
precision mediump float;

in vec4 v_color;
in vec4 v_id;
in float v_border;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

const float bias = 255.0 / 254.0;
const float radius = 0.5;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  vec2 m = gl_PointCoord - vec2(0.5, 0.5);
  float dist = radius - length(m);

  float t = 0.0;
  if (dist > v_border)
    t = 1.0;
  else if (dist > 0.0)
    t = dist / v_border;

  // Output 0: Visual rendering with antialiasing
  fragColor = mix(transparent, v_color, t);

  // Output 1: Picking (no antialiasing)
  if (dist > v_border) {
    fragPicking = v_id;
    fragPicking.a *= bias;
  } else
    fragPicking = transparent;
}
`;

export default SHADER_SOURCE;
