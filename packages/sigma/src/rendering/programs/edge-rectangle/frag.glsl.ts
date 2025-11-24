// language=GLSL
const SHADER_SOURCE = /*glsl*/ `#version 300 es
precision mediump float;

in vec4 v_color;
in vec4 v_id;
in vec2 v_normal;
in float v_thickness;
in float v_feather;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float dist = length(v_normal) * v_thickness;

  float t = smoothstep(
    v_thickness - v_feather,
    v_thickness,
    dist
  );

  // Output 0: Visual rendering with antialiasing
  fragColor = mix(v_color, transparent, t);

  // Output 1: Picking (no antialiasing)
  fragPicking = v_id;
}
`;

export default SHADER_SOURCE;
