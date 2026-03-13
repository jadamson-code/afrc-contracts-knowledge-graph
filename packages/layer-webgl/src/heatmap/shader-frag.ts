import { numberToGLSLFloat } from "sigma/rendering";

import { HeatmapOptions } from "./types";

export default function getFragmentShader({
  colorStops,
  shading,
}: {
  colorStops: HeatmapOptions["colorStops"];
  shading: HeatmapOptions["shading"];
}) {
  // language=GLSL
  const SHADER = /*glsl*/ `#version 300 es
precision highp float;

uniform sampler2D u_densityTexture;

// Color stop uniforms
${colorStops.map((_, i) => `uniform vec4 u_stopColor_${i};`).join("\n")}

${
  shading
    ? `// Shading uniforms
uniform vec3 u_lightDir;
uniform float u_shadingIntensity;
uniform float u_specular;
uniform float u_shininess;
uniform float u_smoothing;`
    : ""
}

out vec4 fragColor;

const int N_STOPS = ${colorStops.length};
const float stops[N_STOPS] = float[](${colorStops.map((s) => numberToGLSLFloat(s.value)).join(", ")});

void main() {
  float density = texelFetch(u_densityTexture, ivec2(gl_FragCoord.xy), 0).r;

  // Color ramp: each segment overwrites the previous, clamp handles boundaries
  vec4 color = u_stopColor_0;
  ${colorStops
    .slice(0, -1)
    .map(
      (_, i) =>
        `if (density >= stops[${i}]) {
    color = mix(u_stopColor_${i}, u_stopColor_${i + 1}, clamp((density - stops[${i}]) / (stops[${i + 1}] - stops[${i}]), 0.0, 1.0));
  }`,
    )
    .join("\n  ")}

  ${
    shading
      ? `// Central differences on density² for smooth normals.
  // Using density² as the height field makes the gradient vanish at the boundary
  // (d/dx(d²) = 2d·d/dx(d) → 0 as d → 0), avoiding dark contours at heatmap edges.
  // Manual sampling at u_smoothing pixel offset replaces dFdx/dFdy for smoother results.
  int s = int(u_smoothing);
  ivec2 coord = ivec2(gl_FragCoord.xy);
  float dR = texelFetch(u_densityTexture, coord + ivec2(s, 0), 0).r;
  float dL = texelFetch(u_densityTexture, coord - ivec2(s, 0), 0).r;
  float dU = texelFetch(u_densityTexture, coord + ivec2(0, s), 0).r;
  float dD = texelFetch(u_densityTexture, coord - ivec2(0, s), 0).r;
  float dx = (dR * dR - dL * dL) / (2.0 * u_smoothing);
  float dy = (dU * dU - dD * dD) / (2.0 * u_smoothing);
  // Empirical scale factor: density gradients are small, so amplify to get visible relief
  float bumpScale = 25.0 * u_shadingIntensity;
  vec3 normal = normalize(vec3(-dx * bumpScale, -dy * bumpScale, 1.0));

  // Blinn-Phong lighting
  float diffuse = max(dot(normal, u_lightDir), 0.0);
  vec3 halfDir = normalize(u_lightDir + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(normal, halfDir), 0.0), u_shininess) * u_specular;

  float ambient = 0.5;
  float lighting = ambient + (1.0 - ambient) * diffuse;
  color.rgb = color.rgb * lighting + vec3(spec);`
      : ""
  }

  // Output premultiplied alpha
  fragColor = vec4(color.rgb * color.a, color.a);
}
`;

  return SHADER;
}
