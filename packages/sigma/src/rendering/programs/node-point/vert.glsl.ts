// language=GLSL
const SHADER_SOURCE = /*glsl*/ `#version 300 es

in vec4 a_id;
in vec4 a_color;
in vec2 a_position;
in float a_size;

uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform mat3 u_matrix;

out vec4 v_color;
out vec4 v_id;
out float v_border;

const float bias = 255.0 / 254.0;

void main() {
  gl_Position = vec4(
    (u_matrix * vec3(a_position, 1)).xy,
    0,
    1
  );

  // Multiply the point size twice:
  //  - x SCALING_RATIO to correct the canvas scaling
  //  - x 2 to correct the formulae
  gl_PointSize = a_size / u_sizeRatio * u_pixelRatio * 2.0;

  v_border = (0.5 / a_size) * u_sizeRatio;

  // For normal mode, we use the color:
  v_color = a_color;
  // For picking mode, we use the ID:
  v_id = a_id;

  v_color.a *= bias;
}
`;

export default SHADER_SOURCE;
