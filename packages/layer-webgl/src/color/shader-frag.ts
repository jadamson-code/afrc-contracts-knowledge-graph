export default function getFragmentShader(): string {
  return `#version 300 es
precision mediump float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  // Premultiply alpha to match sigma's (ONE, ONE_MINUS_SRC_ALPHA) blend mode
  fragColor = vec4(u_color.rgb * u_color.a, u_color.a);
}
`;
}
