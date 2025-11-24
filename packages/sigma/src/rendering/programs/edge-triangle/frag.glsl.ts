// language=GLSL
const SHADER_SOURCE = /*glsl*/ `#version 300 es
precision mediump float;

in vec4 v_color;
in vec4 v_id;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

void main(void) {
  fragColor = v_color;
  fragPicking = v_id;
}
`;

export default SHADER_SOURCE;
