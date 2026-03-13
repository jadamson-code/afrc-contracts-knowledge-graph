import { numberToGLSLFloat } from "sigma/rendering";

import { ContoursOptions } from "./types";

export default function getFragmentShader({
  feather,
  border,
  levels,
}: {
  feather: ContoursOptions["feather"];
  levels: ContoursOptions["levels"];
  border: ContoursOptions["border"];
}) {
  const levelsDesc = levels.map((o) => o.threshold).sort((a, b) => b - a);
  const levelsAsc = levelsDesc.slice(0).reverse();
  const limits = levelsAsc.map((threshold, i, a) => (i < a.length - 1 ? (threshold + a[i + 1]) / 2 : threshold + 1));
  // Limits in descending order, aligned with levelsDesc for the nextColor calculation
  const limitsDesc = limits.slice().reverse();
  // language=GLSL
  const SHADER = /*glsl*/ `#version 300 es
#define LEVELS_COUNT ${levelsAsc.length}
#define PI 3.141592653589793238

precision highp float;

const vec4 u_levelColor_0 = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 u_levelColor_${levelsDesc.length + 1} = vec4(0.0, 0.0, 0.0, 0.0);
const float incLevels[LEVELS_COUNT] = float[](${levelsAsc.map((o) => numberToGLSLFloat(o)).join(",")});
const float incLimits[LEVELS_COUNT] = float[](${limits.map((o) => numberToGLSLFloat(o)).join(",")});

// Density texture from splat pass:
uniform sampler2D u_densityTexture;

// Levels uniforms:
${levelsDesc.map((_, i) => `uniform vec4 u_levelColor_${i + 1};`).join("\n")}

// Border color:
${border ? `uniform vec4 u_borderColor;` : ""}

// Output
out vec4 fragColor;

// Library:
float linearstep(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

float hypot(vec2 v) {
  float x = abs(v.x);
  float y = abs(v.y);
  float t = min(x, y);
  x = max(x, y);
  t = t / x;
  return x * sqrt(1.0 + t * t);
}

// Fixed width contour lines via screen-space derivatives.
// See: https://observablehq.com/@rreusser/locally-scaled-domain-coloring-part-1-contour-plots
float contour(float score, float thickness, float feather) {
  float level = incLevels[0];
  for (int i = 0; i < LEVELS_COUNT - 1; i++) {
    if (score >= incLimits[i]) {
      level = incLevels[i + 1];
    } else {
      break;
    }
  }
  float gradient = (atan(score)) * 2.0 / PI;
  float normalizedGradient = (atan(score) - atan(level)) * 2.0 / PI;

  float screenSpaceGradient = hypot(vec2(dFdx(gradient), dFdy(gradient)));
  return linearstep(
    0.5 * (thickness + feather),
    0.5 * (thickness - feather),
    (0.5 - abs(fract(normalizedGradient) - 0.5)) / screenSpaceGradient
  );
}

void main() {
  float score = texelFetch(u_densityTexture, ivec2(gl_FragCoord.xy), 0).r;

  // Level colors are 1-indexed (u_levelColor_1 .. u_levelColor_N), with sentinel
  // transparent constants at indices 0 and N+1 for boundary transitions.
  // levelsDesc is sorted descending, so u_levelColor_1 = highest threshold's color.
  // nextColor picks the adjacent level color for feathered blending at boundaries:
  //   above the midpoint limit → blend toward higher level (i), below → toward lower level (i+2).
  vec4 levelColor = u_levelColor_${levelsDesc.length + 1};
  vec4 nextColor = u_levelColor_${levelsDesc.length + 1};
  ${levelsDesc
    .map(
      (threshold, i) => `if (score > ${numberToGLSLFloat(threshold)}) {
    levelColor = u_levelColor_${i + 1};
    ${!border ? `nextColor = score > ${numberToGLSLFloat(limitsDesc[i])} ? u_levelColor_${i} : u_levelColor_${i + 2};` : ""}
  }`,
    )
    .join(" else ")}

  // When thickness=0 (no border), the inverted linearstep in contour() produces a soft 50% blend
  // at level boundaries, creating a feathered transition between adjacent level colors.
  float t = contour(score, ${numberToGLSLFloat(border ? border.thickness : 0)}, ${numberToGLSLFloat(feather)});

  // Premultiply before mixing to avoid dark fringe when blending toward transparent
  vec4 baseColor = vec4(levelColor.rgb * levelColor.a, levelColor.a);
  vec4 blendColor = ${border ? "u_borderColor" : "nextColor"};
  blendColor = vec4(blendColor.rgb * blendColor.a, blendColor.a);
  fragColor = mix(baseColor, blendColor, t);
}
`;

  return SHADER;
}
