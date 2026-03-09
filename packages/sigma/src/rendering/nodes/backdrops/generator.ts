/**
 * Sigma.js Backdrop Shader Generator
 * ===================================
 *
 * Generates GLSL shaders for backdrop rendering. The backdrop is the union of
 * an enlarged node shape and a label rectangle, with a soft shadow effect.
 *
 * @module
 */
import {
  GLSL_GET_LABEL_DIRECTION,
  GLSL_NODE_SIZE_TO_PIXELS,
  GLSL_SDF_BOX,
  GLSL_SDF_ROTATED_BOX,
  GLSL_SDF_ROUNDED_BOX,
  GLSL_SDF_ROUNDED_ROTATED_BOX,
  generateFindEdgeDistance,
} from "../../glsl";
import { getShapeGLSLForShapes } from "../../shapes";
import { numberToGLSLFloat } from "../../utils";
import { SDFShape } from "../types";

export interface GeneratedBackdropShaders {
  vertexShader: string;
  fragmentShader: string;
  uniforms: string[];
}

export interface BackdropShaderOptions {
  shapes: SDFShape[];
  rotateWithCamera?: boolean;
  /** Maps local shape index to global shape ID (for multi-shape programs). */
  shapeGlobalIds?: number[];
}

export function generateBackdropVertexShader(options: BackdropShaderOptions): string {
  const { shapes, rotateWithCamera = false, shapeGlobalIds } = options;

  // Get all shape SDF functions (deduplicated)
  const shapeGLSL = getShapeGLSLForShapes(shapes);

  // Collect all shape uniforms (deduplicated)
  const seenUniforms = new Set<string>();
  const shapeUniformDeclarations = shapes
    .flatMap((shape) => shape.uniforms)
    .filter((u) => {
      if (seenUniforms.has(u.name)) return false;
      seenUniforms.add(u.name);
      return true;
    })
    .map((u) => `uniform ${u.type} ${u.name};`)
    .join("\n");

  // Generate shape selector function for findEdgeDistance
  let findEdgeDistanceCode: string;

  if (shapes.length === 1) {
    const shape = shapes[0];
    const floatUniforms = shape.uniforms.filter((u) => u.type === "float") as Array<{
      name: string;
      type: "float";
      value: number;
    }>;
    const paramValues = floatUniforms.map((u) => numberToGLSLFloat(u.value ?? 0));
    const shapeCall =
      paramValues.length > 0 ? `sdf_${shape.name}(uv, size, ${paramValues.join(", ")})` : `sdf_${shape.name}(uv, size)`;
    findEdgeDistanceCode = generateFindEdgeDistance(shapeCall, rotateWithCamera);
  } else {
    // Multi-shape: generate switch-based SDF query
    // Use global shape IDs as case values when available (a_shapeId contains global IDs)
    const cases = shapes
      .map((shape, index) => {
        const floatUniforms = shape.uniforms.filter((u) => u.type === "float") as Array<{
          name: string;
          type: "float";
          value: number;
        }>;
        const paramValues = floatUniforms.map((u) => numberToGLSLFloat(u.value ?? 0));
        const sdfCall =
          paramValues.length > 0
            ? `sdf_${shape.name}(uv, size, ${paramValues.join(", ")})`
            : `sdf_${shape.name}(uv, size)`;
        const caseId = shapeGlobalIds ? shapeGlobalIds[index] : index;
        return `    case ${caseId}: return ${sdfCall};`;
      })
      .join("\n");

    // Default to first shape
    const defaultShape = shapes[0];
    const defaultFloatUniforms = defaultShape.uniforms.filter((u) => u.type === "float") as Array<{
      name: string;
      type: "float";
      value: number;
    }>;
    const defaultParams = defaultFloatUniforms.map((u) => numberToGLSLFloat(u.value ?? 0));
    const defaultCall =
      defaultParams.length > 0
        ? `sdf_${defaultShape.name}(uv, size, ${defaultParams.join(", ")})`
        : `sdf_${defaultShape.name}(uv, size)`;

    // Generate queryShapeSDF function
    const queryShapeSDF = /*glsl*/ `
float queryShapeSDF(int shapeId, vec2 uv, float size) {
  switch (shapeId) {
${cases}
    default: return ${defaultCall};
  }
}
`;

    // Generate findEdgeDistance that uses queryShapeSDF with global shapeId
    const cameraRotation = rotateWithCamera
      ? `float c = cos(u_cameraAngle);
    float s = sin(u_cameraAngle);
    uv = mat2(c, -s, s, c) * uv;`
      : "";

    findEdgeDistanceCode =
      queryShapeSDF +
      /*glsl*/ `

// Global shape ID set by main() before calling findEdgeDistance
int g_shapeId;

float findEdgeDistance(vec2 direction, float size) {
  float low = 0.0;
  float high = 2.0;

  for (int i = 0; i < 8; i++) {
    float mid = (low + high) * 0.5;
    vec2 uv = direction * mid;
    ${cameraRotation}
    float d = queryShapeSDF(g_shapeId, uv, size);
    if (d < 0.0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) * 0.5;
}
`;
  }

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

in vec2 a_nodePosition;
in float a_nodeSize;
in float a_shapeId;
in float a_labelWidth;
in float a_labelHeight;
in float a_positionMode;
in float a_labelAngle;
in vec4 a_backdropColor;
in vec4 a_backdropShadowColor;
in float a_backdropShadowBlur;
in float a_backdropPadding;
in vec4 a_backdropBorderColor;
in vec4 a_backdropExtra; // [borderWidth, cornerRadius, labelPadding, area]
in vec2 a_labelBoxOffset;
in vec2 a_quadCorner;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_cameraAngle;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_labelMargin;
uniform float u_zoomLabelSizeRatio;
${shapeUniformDeclarations}

out vec2 v_uv;
out vec2 v_nodeCenter;
out float v_nodeRadius;
out vec2 v_labelCenter;
out vec2 v_labelHalfSize;
out float v_aaWidth;
out float v_shapeId;
out float v_labelAngle;
out vec4 v_backdropColor;
out vec4 v_backdropShadowColor;
out float v_backdropShadowBlur;
out float v_backdropPadding;
out vec4 v_backdropBorderColor;
out float v_backdropBorderWidth;
out float v_backdropCornerRadius;
out float v_backdropArea;

${shapeGLSL}
${findEdgeDistanceCode}
${GLSL_GET_LABEL_DIRECTION}

void main() {
  ${shapes.length > 1 ? "g_shapeId = int(a_shapeId);  // Set global shape ID for multi-shape mode" : "// Single-shape mode"}
  ${GLSL_NODE_SIZE_TO_PIXELS}
  float padding = a_backdropPadding;
  float shadowBlur = a_backdropShadowBlur;
  // Unpack a_backdropExtra: [borderWidth, cornerRadius, labelPadding, area]
  float borderWidth = a_backdropExtra.x;
  float cornerRadius = a_backdropExtra.y;
  float labelPad = a_backdropExtra.z;
  float backdropArea = a_backdropExtra.w;
  // Use 2x shadowBlur so the Gaussian fully decays before the quad edge
  float totalExpansion = shadowBlur * 2.0 + borderWidth;
  float enlargedRadius = nodeRadiusPixels + padding;

  // Apply zoom-dependent label size scaling
  float zoomScale = u_zoomLabelSizeRatio;
  float labelW = a_labelWidth * zoomScale;
  float labelH = a_labelHeight * zoomScale;
  float labelMargin = u_labelMargin * zoomScale;

  // Only apply labelPad when a label is actually present
  float effectiveLabelPad = labelW > 0.0 ? labelPad : 0.0;
  vec2 labelHalfSize = vec2(labelW * 0.5 + effectiveLabelPad, labelH * 0.5 + effectiveLabelPad);
  vec2 labelOffset = vec2(0.0);

  float la_c = cos(a_labelAngle);
  float la_s = sin(a_labelAngle);
  mat2 labelRotMat = mat2(la_c, -la_s, la_s, la_c);

  if (a_positionMode < 4.0 && labelW > 0.0) {
    vec2 screenDir = getLabelDirection(a_positionMode);
    vec2 rotatedScreenDir = labelRotMat * screenDir;
    vec2 sdfDir = vec2(rotatedScreenDir.x, -rotatedScreenDir.y);

    float edgeDistNormalized = findEdgeDistance(sdfDir, 1.0);
    float edgeDistPixels = nodeRadiusPixels * edgeDistNormalized;
    // labelMargin matches the label shader's margin (gap from node edge to text)
    float labelStart = edgeDistPixels + labelMargin;

    if (a_positionMode < 0.5) {
      // Right: box spans from node center to text end + padding
      float boxRightEdge = labelStart + labelW + labelPad;
      labelOffset = vec2(boxRightEdge * 0.5, 0.0);
      labelHalfSize.x = boxRightEdge * 0.5;
    } else if (a_positionMode < 1.5) {
      // Left: mirror of right
      float boxLeftEdge = labelStart + labelW + labelPad;
      labelOffset = vec2(-boxLeftEdge * 0.5, 0.0);
      labelHalfSize.x = boxLeftEdge * 0.5;
    } else if (a_positionMode < 2.5) {
      // Above: text bottom at labelStart, centered horizontally
      labelOffset = vec2(0.0, -(labelStart + labelH * 0.5));
    } else if (a_positionMode < 3.5) {
      // Below: text top at labelStart, centered horizontally
      labelOffset = vec2(0.0, labelStart + labelH * 0.5);
    }

    labelOffset = labelRotMat * labelOffset;

    // Shift the label box center to cover attachments (e.g., below the label)
    labelOffset += a_labelBoxOffset * zoomScale;
  }

  // For node-only mode, zero out label dimensions
  if (backdropArea > 0.5 && backdropArea < 1.5) {
    labelHalfSize = vec2(0.0);
    labelOffset = vec2(0.0);
  }

  vec2 minBound, maxBound;

  bool hasLabelBounds = labelW > 0.0 && (backdropArea > 1.5 || (a_positionMode < 4.0 && backdropArea < 0.5));

  if (hasLabelBounds) {
    // Union with label bounds (area=both) or label-only bounds (area=label)
    vec2 labelMin, labelMax;

    if (a_labelAngle != 0.0) {
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

    if (backdropArea > 1.5) {
      // Label-only: bounds from label rect only
      minBound = labelMin - totalExpansion;
      maxBound = labelMax + totalExpansion;
    } else {
      // Both: union of node + label
      minBound = min(-vec2(enlargedRadius), labelMin) - totalExpansion;
      maxBound = max(vec2(enlargedRadius), labelMax) + totalExpansion;
    }
  } else {
    // Node-only or no visible label
    float totalRadius = enlargedRadius + totalExpansion;
    if (a_positionMode >= 3.5 && labelW > 0.0 && backdropArea < 0.5) {
      // "over" position with label, area=both
      vec2 rotatedHalfSize = labelHalfSize;
      if (a_labelAngle != 0.0) {
        vec2 corner1 = labelRotMat * vec2(-labelHalfSize.x, -labelHalfSize.y);
        vec2 corner2 = labelRotMat * vec2(labelHalfSize.x, -labelHalfSize.y);
        vec2 corner3 = labelRotMat * vec2(labelHalfSize.x, labelHalfSize.y);
        vec2 corner4 = labelRotMat * vec2(-labelHalfSize.x, labelHalfSize.y);
        vec2 labelMin = min(min(corner1, corner2), min(corner3, corner4));
        vec2 labelMax = max(max(corner1, corner2), max(corner3, corner4));
        rotatedHalfSize = max(abs(labelMin), abs(labelMax));
      }
      minBound = -vec2(max(totalRadius, rotatedHalfSize.x + totalExpansion),
                       max(totalRadius, rotatedHalfSize.y + totalExpansion));
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
  v_shapeId = a_shapeId;
  v_labelAngle = a_labelAngle;
  v_backdropColor = a_backdropColor;
  v_backdropShadowColor = a_backdropShadowColor;
  v_backdropShadowBlur = a_backdropShadowBlur;
  v_backdropPadding = a_backdropPadding;
  v_backdropBorderColor = a_backdropBorderColor;
  v_backdropBorderWidth = borderWidth;
  v_backdropCornerRadius = cornerRadius;
  v_backdropArea = backdropArea;
}
`;

  return glsl;
}

export function generateBackdropFragmentShader(options: BackdropShaderOptions): string {
  const { shapes, rotateWithCamera = false, shapeGlobalIds } = options;

  // Get all shape SDF functions (deduplicated)
  const shapeGLSL = getShapeGLSLForShapes(shapes);

  // Collect all shape uniforms (deduplicated)
  const seenUniforms = new Set<string>();
  const shapeUniformDeclarations = shapes
    .flatMap((shape) => shape.uniforms)
    .filter((u) => {
      if (seenUniforms.has(u.name)) return false;
      seenUniforms.add(u.name);
      return true;
    })
    .map((u) => `uniform ${u.type} ${u.name};`)
    .join("\n");

  // Generate shape selector for fragment shader
  let shapeCallCode: string;

  if (shapes.length === 1) {
    const shape = shapes[0];
    const floatUniforms = shape.uniforms.filter((u) => u.type === "float") as Array<{
      name: string;
      type: "float";
      value: number;
    }>;
    const paramValues = floatUniforms.map((u) => numberToGLSLFloat(u.value ?? 0));
    const shapeCall =
      paramValues.length > 0
        ? `sdf_${shape.name}(nodeUV, 1.0, ${paramValues.join(", ")})`
        : `sdf_${shape.name}(nodeUV, 1.0)`;
    shapeCallCode = `float nodeSdfNormalized = ${shapeCall};`;
  } else {
    // Multi-shape: generate switch-based SDF query
    // Use global shape IDs as case values when available (v_shapeId contains global IDs)
    const cases = shapes
      .map((shape, index) => {
        const floatUniforms = shape.uniforms.filter((u) => u.type === "float") as Array<{
          name: string;
          type: "float";
          value: number;
        }>;
        const paramValues = floatUniforms.map((u) => numberToGLSLFloat(u.value ?? 0));
        const sdfCall =
          paramValues.length > 0
            ? `sdf_${shape.name}(nodeUV, 1.0, ${paramValues.join(", ")})`
            : `sdf_${shape.name}(nodeUV, 1.0)`;
        const caseId = shapeGlobalIds ? shapeGlobalIds[index] : index;
        return `    case ${caseId}: nodeSdfNormalized = ${sdfCall}; break;`;
      })
      .join("\n");

    // Default to first shape
    const defaultShape = shapes[0];
    const defaultFloatUniforms = defaultShape.uniforms.filter((u) => u.type === "float") as Array<{
      name: string;
      type: "float";
      value: number;
    }>;
    const defaultParams = defaultFloatUniforms.map((u) => numberToGLSLFloat(u.value ?? 0));
    const defaultCall =
      defaultParams.length > 0
        ? `sdf_${defaultShape.name}(nodeUV, 1.0, ${defaultParams.join(", ")})`
        : `sdf_${defaultShape.name}(nodeUV, 1.0)`;

    shapeCallCode = `float nodeSdfNormalized;
  int shapeId = int(v_shapeId);
  switch (shapeId) {
${cases}
    default: nodeSdfNormalized = ${defaultCall};
  }`;
  }

  // Evaluate node SDF at effective scale (enlarged - cornerRadius) then subtract
  // cornerRadius. This "shrink, evaluate, expand" technique rounds convex corners.
  // When cornerRadius=0, effectiveRadius=enlargedRadius and the subtraction is a no-op.
  const nodeUVCode = rotateWithCamera
    ? `float effectiveRadius = max(enlargedRadius - cornerRadius, 0.01);
  float ca_c = cos(u_cameraAngle);
  float ca_s = sin(u_cameraAngle);
  vec2 rotatedScreenUV = mat2(ca_c, -ca_s, ca_s, ca_c) * screenUV;
  vec2 nodeUV = vec2(rotatedScreenUV.x, -rotatedScreenUV.y) / effectiveRadius;`
    : `float effectiveRadius = max(enlargedRadius - cornerRadius, 0.01);
  vec2 nodeUV = vec2(screenUV.x, -screenUV.y) / effectiveRadius;`;

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es
precision highp float;

in vec2 v_uv;
in vec2 v_nodeCenter;
in float v_nodeRadius;
in vec2 v_labelCenter;
in vec2 v_labelHalfSize;
in float v_aaWidth;
in float v_shapeId;
in float v_labelAngle;
in vec4 v_backdropColor;
in vec4 v_backdropShadowColor;
in float v_backdropShadowBlur;
in float v_backdropPadding;
in vec4 v_backdropBorderColor;
in float v_backdropBorderWidth;
in float v_backdropCornerRadius;
in float v_backdropArea;

uniform float u_cameraAngle;
${shapeUniformDeclarations}

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

${shapeGLSL}
${GLSL_SDF_BOX}
${GLSL_SDF_ROTATED_BOX}
${GLSL_SDF_ROUNDED_BOX}
${GLSL_SDF_ROUNDED_ROTATED_BOX}

void main() {
  vec4 backdropColor = v_backdropColor;
  vec4 shadowColor = v_backdropShadowColor;
  float shadowBlur = v_backdropShadowBlur;
  float padding = v_backdropPadding;
  vec4 borderColor = v_backdropBorderColor;
  float borderWidth = v_backdropBorderWidth;
  float cornerRadius = v_backdropCornerRadius;

  float enlargedRadius = v_nodeRadius + padding;
  vec2 screenUV = v_uv - v_nodeCenter;
  ${nodeUVCode}

  // Query the correct shape SDF based on shapeId
  ${shapeCallCode}
  float nodeSdfPixels = nodeSdfNormalized * effectiveRadius - cornerRadius;

  // Label SDF with optional corner radius and rotation
  float labelSdfPixels;
  if (v_labelHalfSize.x > 0.0) {
    vec2 labelP = v_uv - v_labelCenter;
    labelSdfPixels = sdfRoundedRotatedBox(labelP, v_labelHalfSize, v_labelAngle, cornerRadius);
  } else {
    labelSdfPixels = 10000.0;
  }

  // Select area: 0=both, 1=node, 2=label
  float combinedSdf;
  if (v_backdropArea > 1.5) {
    combinedSdf = labelSdfPixels;
  } else if (v_backdropArea > 0.5) {
    combinedSdf = nodeSdfPixels;
  } else {
    combinedSdf = min(nodeSdfPixels, labelSdfPixels);
  }

  // Fill + border composite
  float outerEdge = smoothstep(v_aaWidth, -v_aaWidth, combinedSdf);
  vec4 background;
  if (borderWidth > 0.5) {
    float innerEdge = smoothstep(v_aaWidth, -v_aaWidth, combinedSdf + borderWidth);
    float fillAlpha = innerEdge * backdropColor.a;
    vec4 fill = vec4(backdropColor.rgb * fillAlpha, fillAlpha);
    float borderAlpha = (outerEdge - innerEdge) * borderColor.a;
    vec4 border = vec4(borderColor.rgb * borderAlpha, borderAlpha);
    background = fill + border * (1.0 - fill.a);
  } else {
    float fillAlpha = outerEdge * backdropColor.a;
    background = vec4(backdropColor.rgb * fillAlpha, fillAlpha);
  }

  // Gaussian-like shadow falloff (mimics canvas shadowBlur)
  float shadowDist = max(0.0, combinedSdf);
  float sigma = shadowBlur / 2.5;
  float shadowAlpha = exp(-(shadowDist * shadowDist) / (2.0 * sigma * sigma)) * shadowColor.a;
  vec4 shadow = vec4(shadowColor.rgb * shadowAlpha, shadowAlpha);

  fragColor = background + shadow * (1.0 - background.a);
  fragPicking = vec4(0.0);
}
`;

  return glsl;
}

export function collectBackdropUniforms(shapes: SDFShape[]): string[] {
  const uniforms = [
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_cameraAngle",
    "u_resolution",
    "u_pixelRatio",
    "u_labelMargin",
    "u_zoomLabelSizeRatio",
  ];

  for (const shape of shapes) {
    for (const uniform of shape.uniforms) {
      if (!uniforms.includes(uniform.name)) {
        uniforms.push(uniform.name);
      }
    }
  }

  return uniforms;
}

export function generateBackdropShaders(options: BackdropShaderOptions): GeneratedBackdropShaders {
  return {
    vertexShader: generateBackdropVertexShader(options),
    fragmentShader: generateBackdropFragmentShader(options),
    uniforms: collectBackdropUniforms(options.shapes),
  };
}
