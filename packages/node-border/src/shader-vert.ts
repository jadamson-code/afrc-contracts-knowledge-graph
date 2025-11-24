import { CreateNodeBorderProgramOptions } from "./utils";

export default function getVertexShader({ borders }: CreateNodeBorderProgramOptions) {
  // language=GLSL
  const SHADER = /*glsl*/ `#version 300 es

in vec2 a_position;
in float a_size;
in float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

out vec2 v_diffVector;
out float v_radius;
out vec4 v_color;
out vec4 v_id;

in vec4 a_id;
${borders
  .flatMap(({ size }, i) =>
    "attribute" in size ? [`in float a_borderSize_${i + 1};`, `out float v_borderSize_${i + 1};`] : [],
  )
  .join("\n")}
${borders
  .flatMap(({ color }, i) =>
    "attribute" in color ? [`in vec4 a_borderColor_${i + 1};`, `out vec4 v_borderColor_${i + 1};`] : [],
  )
  .join("\n")}

const float bias = 255.0 / 254.0;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_radius = size / 2.0;
  v_diffVector = diffVector;

  v_color = vec4(0.0);
  v_id = a_id;
${borders
  .flatMap(({ size }, i) => ("attribute" in size ? [`  v_borderSize_${i + 1} = a_borderSize_${i + 1};`] : []))
  .join("\n")}
${borders
  .flatMap(({ color }, i) => ("attribute" in color ? [`  v_borderColor_${i + 1} = a_borderColor_${i + 1};`] : []))
  .join("\n")}
}
`;

  return SHADER;
}
