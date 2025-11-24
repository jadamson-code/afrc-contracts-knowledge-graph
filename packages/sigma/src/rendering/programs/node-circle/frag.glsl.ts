// language=GLSL
const SHADER_SOURCE = /*glsl*/ `#version 300 es
precision highp float;

in vec4 v_color;
in vec4 v_id;
in vec2 v_diffVector;
in float v_radius;

uniform float u_correctionRatio;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

const float bias = 255.0 / 254.0;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float border = u_correctionRatio * 2.0;
  float dist = length(v_diffVector) - v_radius + border;

  float t = 0.0;
  if (dist > border)
    t = 1.0;
  else if (dist > 0.0)
    t = dist / border;

  // Output 0: Visual rendering with antialiasing
  fragColor = mix(v_color, transparent, t);

  // Output 1: Picking (no antialiasing)
  if (dist > border)
    fragPicking = transparent;
  else {
    fragPicking = v_id;
    fragPicking.a *= bias;
  }
}
`;

export default SHADER_SOURCE;
