/**
 * Sigma.js Hover Shader Generator
 * ================================
 *
 * Generates GLSL shaders for hover background rendering. The hover background
 * is the union of an enlarged node shape and a label rectangle, with a soft
 * shadow effect.
 *
 * @module
 */
import {
  GLSL_GET_LABEL_DIRECTION,
  GLSL_NODE_SIZE_TO_PIXELS,
  GLSL_SDF_BOX,
  GLSL_SDF_ROTATED_BOX,
  POSITION_MODE_MAP,
  generateFindEdgeDistance,
} from "../../glsl";
import { SDFShape } from "../types";

export { POSITION_MODE_MAP };

export interface GeneratedHoverShaders {
  vertexShader: string;
  fragmentShader: string;
  uniforms: string[];
}

export interface HoverShaderOptions {
  shape: SDFShape;
  rotateWithCamera?: boolean;
}

export function generateHoverVertexShader(options: HoverShaderOptions): string {
  const { shape, rotateWithCamera = false } = options;

  const shapeFunctionName = `sdf_${shape.name}`;
  const shapeUniformDeclarations = shape.uniforms.map((u) => `uniform ${u.type} ${u.name};`).join("\n");
  const shapeUniformParams = shape.uniforms.map((u) => u.name).join(", ");
  const shapeCall = shapeUniformParams
    ? `${shapeFunctionName}(uv, size, ${shapeUniformParams})`
    : `${shapeFunctionName}(uv, size)`;

  const findEdgeDistanceCode = generateFindEdgeDistance(shapeCall, rotateWithCamera);

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

in vec2 a_nodePosition;
in float a_nodeSize;
in float a_labelWidth;
in float a_labelHeight;
in float a_positionMode;
in vec2 a_quadCorner;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_cameraAngle;
uniform float u_labelAngle;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_labelMargin;
uniform float u_padding;
uniform float u_shadowBlur;
${shapeUniformDeclarations}

out vec2 v_uv;
out vec2 v_nodeCenter;
out float v_nodeRadius;
out vec2 v_labelCenter;
out vec2 v_labelHalfSize;
out float v_aaWidth;

${shape.glsl}
${findEdgeDistanceCode}
${GLSL_GET_LABEL_DIRECTION}

void main() {
  ${GLSL_NODE_SIZE_TO_PIXELS}
  float enlargedRadius = nodeRadiusPixels + u_padding;

  vec2 labelHalfSize = vec2(a_labelWidth * 0.5, a_labelHeight * 0.5);
  vec2 labelOffset = vec2(0.0);

  float la_c = cos(u_labelAngle);
  float la_s = sin(u_labelAngle);
  mat2 labelRotMat = mat2(la_c, -la_s, la_s, la_c);

  if (a_positionMode < 4.0 && a_labelWidth > 0.0) {
    vec2 screenDir = getLabelDirection(a_positionMode);
    vec2 rotatedScreenDir = labelRotMat * screenDir;
    vec2 sdfDir = vec2(rotatedScreenDir.x, -rotatedScreenDir.y);

    float edgeDistNormalized = findEdgeDistance(sdfDir, 1.0);
    float edgeDistPixels = nodeRadiusPixels * edgeDistNormalized;
    float labelEnd = edgeDistPixels + u_padding + u_labelMargin;

    if (a_positionMode < 0.5) {
      float boxRightEdge = labelEnd + a_labelWidth;
      labelOffset = vec2(boxRightEdge * 0.5, 0.0);
      labelHalfSize.x = boxRightEdge * 0.5;
    } else if (a_positionMode < 1.5) {
      float boxLeftEdge = labelEnd + a_labelWidth;
      labelOffset = vec2(-boxLeftEdge * 0.5, 0.0);
      labelHalfSize.x = boxLeftEdge * 0.5;
    } else if (a_positionMode < 2.5) {
      float boxStart = labelEnd;
      float baselineOffset = a_labelHeight * 0.25;
      labelOffset = vec2(0.0, -(boxStart + a_labelHeight * 0.5 - baselineOffset));
    } else if (a_positionMode < 3.5) {
      float boxStart = labelEnd;
      float baselineOffset = a_labelHeight * 0.25;
      labelOffset = vec2(0.0, boxStart + a_labelHeight * 0.5 - baselineOffset);
    }

    labelOffset = labelRotMat * labelOffset;
  }

  vec2 minBound, maxBound;

  if (a_labelWidth > 0.0 && a_positionMode < 4.0) {
    vec2 labelMin, labelMax;

    if (u_labelAngle != 0.0) {
      vec2 corner1 = labelOffset + labelRotMat * vec2(-labelHalfSize.x, -labelHalfSize.y);
      vec2 corner2 = labelOffset + labelRotMat * vec2(labelHalfSize.x, -labelHalfSize.y);
      vec2 corner3 = labelOffset + labelRotMat * vec2(labelHalfSize.x, labelHalfSize.y);
      vec2 corner4 = labelOffset + labelRotMat * vec2(-labelHalfSize.x, labelHalfSize.y);
      labelMin = min(min(corner1, corner2), min(corner3, corner4));
      labelMax = max(max(corner1, corner2), max(corner3, corner4));
    } else {
      labelMin = labelOffset - labelHalfSize;
      labelMax = labelOffset + labelHalfSize;
    }

    minBound = min(-vec2(enlargedRadius), labelMin) - u_shadowBlur;
    maxBound = max(vec2(enlargedRadius), labelMax) + u_shadowBlur;
  } else {
    float totalRadius = enlargedRadius + u_shadowBlur;
    if (a_positionMode >= 3.5 && a_labelWidth > 0.0) {
      vec2 rotatedHalfSize = labelHalfSize;
      if (u_labelAngle != 0.0) {
        vec2 corner1 = labelRotMat * vec2(-labelHalfSize.x, -labelHalfSize.y);
        vec2 corner2 = labelRotMat * vec2(labelHalfSize.x, -labelHalfSize.y);
        vec2 corner3 = labelRotMat * vec2(labelHalfSize.x, labelHalfSize.y);
        vec2 corner4 = labelRotMat * vec2(-labelHalfSize.x, labelHalfSize.y);
        vec2 labelMin = min(min(corner1, corner2), min(corner3, corner4));
        vec2 labelMax = max(max(corner1, corner2), max(corner3, corner4));
        rotatedHalfSize = max(abs(labelMin), abs(labelMax));
      }
      minBound = -vec2(max(totalRadius, rotatedHalfSize.x + u_shadowBlur),
                       max(totalRadius, rotatedHalfSize.y + u_shadowBlur));
      maxBound = -minBound;
    } else {
      minBound = -vec2(totalRadius);
      maxBound = vec2(totalRadius);
    }
  }

  vec2 quadSize = maxBound - minBound;
  vec2 quadCenter = (minBound + maxBound) * 0.5;

  vec2 localPos = quadCenter + a_quadCorner * quadSize * 0.5;
  vec3 nodeClip = u_matrix * vec3(a_nodePosition, 1.0);
  vec2 ndcOffset = localPos * 2.0 / u_resolution;
  ndcOffset.y = -ndcOffset.y;

  gl_Position = vec4(nodeClip.xy + ndcOffset, 0.0, 1.0);

  v_uv = localPos;
  v_nodeCenter = vec2(0.0);
  v_nodeRadius = nodeRadiusPixels;
  v_labelCenter = labelOffset;
  v_labelHalfSize = labelHalfSize;
  v_aaWidth = 1.0;
}
`;

  return glsl;
}

export function generateHoverFragmentShader(options: HoverShaderOptions): string {
  const { shape, rotateWithCamera = false } = options;

  const shapeFunctionName = `sdf_${shape.name}`;
  const shapeUniformDeclarations = shape.uniforms.map((u) => `uniform ${u.type} ${u.name};`).join("\n");
  const shapeUniformParams = shape.uniforms.map((u) => u.name).join(", ");
  const shapeCall = shapeUniformParams
    ? `${shapeFunctionName}(nodeUV, 1.0, ${shapeUniformParams})`
    : `${shapeFunctionName}(nodeUV, 1.0)`;

  const nodeUVCode = rotateWithCamera
    ? `float ca_c = cos(u_cameraAngle);
  float ca_s = sin(u_cameraAngle);
  vec2 rotatedScreenUV = mat2(ca_c, -ca_s, ca_s, ca_c) * screenUV;
  vec2 nodeUV = vec2(rotatedScreenUV.x, -rotatedScreenUV.y) / v_nodeRadius;`
    : `vec2 nodeUV = vec2(screenUV.x, -screenUV.y) / v_nodeRadius;`;

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es
precision highp float;

in vec2 v_uv;
in vec2 v_nodeCenter;
in float v_nodeRadius;
in vec2 v_labelCenter;
in vec2 v_labelHalfSize;
in float v_aaWidth;

uniform vec4 u_backgroundColor;
uniform vec4 u_shadowColor;
uniform float u_shadowOpacity;
uniform float u_cameraAngle;
uniform float u_labelAngle;
uniform float u_padding;
uniform float u_shadowBlur;
${shapeUniformDeclarations}

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

${shape.glsl}
${GLSL_SDF_BOX}
${GLSL_SDF_ROTATED_BOX}

void main() {
  float enlargedRadius = v_nodeRadius + u_padding;
  vec2 screenUV = v_uv - v_nodeCenter;
  ${nodeUVCode}

  // Is the fragment in the shape behind the node?
  float nodeSdfNormalized = ${shapeCall};
  float nodeSdfPixels = nodeSdfNormalized * v_nodeRadius - u_padding;

  // Is the fragment in the white rectangle behind the label?
  float labelSdfPixels;
  if (v_labelHalfSize.x > 0.0) {
    if (u_labelAngle != 0.0) {
      labelSdfPixels = sdfRotatedBox(v_uv - v_labelCenter, v_labelHalfSize, u_labelAngle);
    } else {
      labelSdfPixels = sdfBox(v_uv - v_labelCenter, v_labelHalfSize);
    }
  } else {
    // No label - use a large value so it doesn't affect the union
    labelSdfPixels = 10000.0;
  }

  // Compute union of node and label
  float combinedSdf = min(nodeSdfPixels, labelSdfPixels);

  float bgAlpha = smoothstep(v_aaWidth, -v_aaWidth, combinedSdf);
  vec4 background = vec4(u_backgroundColor.rgb * bgAlpha, bgAlpha);

  float shadowAlpha = (1.0 - smoothstep(0.0, u_shadowBlur, combinedSdf)) * u_shadowOpacity;
  vec4 shadow = vec4(u_shadowColor.rgb * shadowAlpha, shadowAlpha);

  fragColor = background + shadow * (1.0 - background.a);
  fragPicking = vec4(0.0);
}
`;

  return glsl;
}

export function collectHoverUniforms(shape: SDFShape): string[] {
  const uniforms = [
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_cameraAngle",
    "u_labelAngle",
    "u_resolution",
    "u_pixelRatio",
    "u_backgroundColor",
    "u_shadowColor",
    "u_shadowOpacity",
    "u_labelMargin",
    "u_padding",
    "u_shadowBlur",
  ];

  for (const uniform of shape.uniforms) {
    if (!uniforms.includes(uniform.name)) {
      uniforms.push(uniform.name);
    }
  }

  return uniforms;
}

export function generateHoverShaders(options: HoverShaderOptions): GeneratedHoverShaders {
  return {
    vertexShader: generateHoverVertexShader(options),
    fragmentShader: generateHoverFragmentShader(options),
    uniforms: collectHoverUniforms(options.shape),
  };
}
