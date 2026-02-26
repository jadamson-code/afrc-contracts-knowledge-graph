/**
 * Sigma.js Label Shader Generator
 * ================================
 *
 * Generates GLSL shaders for shape-aware label positioning. Labels are placed
 * at precise distances from node boundaries by embedding the node's SDF into
 * the vertex shader and using binary search to find edge distances.
 *
 * @module
 */
import { GLSL_GET_LABEL_DIRECTION, generateFindEdgeDistance } from "../../glsl";
import { getShapeGLSLForShapes } from "../../shapes";
import { numberToGLSLFloat } from "../../utils";
import { SDFShape } from "../types";

// ============================================================================
// Types
// ============================================================================

export interface GeneratedLabelShaders {
  vertexShader: string;
  fragmentShader: string;
  uniforms: string[];
}

export interface LabelShaderOptions {
  shapes: SDFShape[];
  rotateWithCamera?: boolean;
}

// ============================================================================
// Vertex Shader Generation
// ============================================================================

/**
 * Generates the vertex shader for shape-aware label positioning.
 *
 * ## Coordinate Systems
 *
 * - **Graph space**: Node positions (a_anchorPosition)
 * - **Clip space**: After u_matrix transform, range [-1, 1]
 * - **Screen space**: Pixel positions, Y-down
 * - **SDF space**: Shape coordinates, Y-up, normalized to size 1.0
 */
export function generateLabelVertexShader(options: LabelShaderOptions): string {
  const { shapes, rotateWithCamera = false } = options;

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
  // For single shape, use simple call; for multiple shapes, use switch
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
    findEdgeDistanceCode = generateFindEdgeDistance(shapeCall, false);
  } else {
    // Multi-shape: generate switch-based SDF query
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
        return `    case ${index}: return ${sdfCall};`;
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

  // Step 3 computes label offset from node center using the shape's SDF.
  // The offset direction accounts for label angle, and for rotateWithCamera=true,
  // also counter-rotates by camera angle to query the SDF in shape-local space.
  const step3Code = rotateWithCamera
    ? `  // -------------------------------------------------------------------------
  // Step 3: Calculate position offset using shape SDF
  // -------------------------------------------------------------------------
  vec2 positionOffset = vec2(0.0);

  if (a_positionMode < 4.0) {
    // Base screen direction for this position mode
    vec2 screenDir = getLabelDirection(a_positionMode);

    // Rotate by label angle to get actual offset direction
    float la_c = cos(a_labelAngle);
    float la_s = sin(a_labelAngle);
    vec2 rotatedScreenDir = mat2(la_c, -la_s, la_s, la_c) * screenDir;

    // Convert to SDF space: flip Y (screen Y-down -> SDF Y-up),
    // then counter-rotate by camera angle (shape rotates with camera)
    vec2 sdfDir = vec2(rotatedScreenDir.x, -rotatedScreenDir.y);
    float c = cos(-u_cameraAngle);
    float s = sin(-u_cameraAngle);
    vec2 shapeDir = mat2(c, -s, s, c) * sdfDir;

    // Find edge distance and compute offset
    float edgeDistNormalized = findEdgeDistance(shapeDir, 1.0);
    float boundaryDistPixels = nodeRadiusPixels * edgeDistNormalized;
    positionOffset = screenDir * (boundaryDistPixels + margin);
  }`
    : `  // -------------------------------------------------------------------------
  // Step 3: Calculate position offset using shape SDF
  // -------------------------------------------------------------------------
  vec2 positionOffset = vec2(0.0);

  if (a_positionMode < 4.0) {
    // Base screen direction for this position mode
    vec2 screenDir = getLabelDirection(a_positionMode);

    // Rotate by label angle to get actual offset direction
    float la_c = cos(a_labelAngle);
    float la_s = sin(a_labelAngle);
    vec2 rotatedScreenDir = mat2(la_c, -la_s, la_s, la_c) * screenDir;

    // Convert to SDF space: flip Y (screen Y-down -> SDF Y-up)
    vec2 sdfDir = vec2(rotatedScreenDir.x, -rotatedScreenDir.y);

    // Find edge distance and compute offset
    float edgeDistNormalized = findEdgeDistance(sdfDir, 1.0);
    float boundaryDistPixels = nodeRadiusPixels * edgeDistNormalized;
    positionOffset = screenDir * (boundaryDistPixels + margin);
  }`;

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

// ============================================================================
// Attributes
// ============================================================================

// Per-character (instanced)
in float a_nodeIndex;        // Index into node data texture
in vec2 a_charOffset;        // Character offset from label origin (pixels)
in vec2 a_charSize;          // Character dimensions (pixels)
in vec4 a_texCoords;         // Atlas coords: (x, y, width, height) in pixels
in vec4 a_color;             // Text color (RGBA)
in float a_margin;           // Gap between node edge and label (pixels)
in float a_positionMode;     // Position: 0=right, 1=left, 2=above, 3=below, 4=over
in float a_labelWidth;       // Total label width (pixels)
in float a_labelHeight;      // Label height (pixels)
in float a_labelAngle;       // Label rotation angle (radians)

// Per-vertex (constant quad corners)
in vec2 a_quadCorner;        // Quad corner: [-1,-1], [1,-1], [-1,1], [1,1]

// ============================================================================
// Uniforms
// ============================================================================

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_cameraAngle;
uniform vec2 u_resolution;
uniform vec2 u_atlasSize;
uniform sampler2D u_nodeDataTexture;
uniform int u_nodeDataTextureWidth;
uniform float u_zoomLabelSizeRatio;
${shapeUniformDeclarations}

// ============================================================================
// Varyings
// ============================================================================

out vec2 v_texCoord;
out vec4 v_color;

// ============================================================================
// Constants
// ============================================================================

const float bias = 255.0 / 254.0;

// ============================================================================
// Shape SDF Functions
// ============================================================================

${shapeGLSL}

// ============================================================================
// Helper Functions
// ============================================================================

${findEdgeDistanceCode}
${GLSL_GET_LABEL_DIRECTION}

// ============================================================================
// Main
// ============================================================================

void main() {
  // -------------------------------------------------------------------------
  // Step 0: Fetch node data from texture
  // -------------------------------------------------------------------------
  // Texture format: vec4(x, y, size, shapeId)
  // 2D texture layout: texCoord = (index % width, index / width)
  int nodeIdx = int(a_nodeIndex);
  ivec2 texCoord = ivec2(nodeIdx % u_nodeDataTextureWidth, nodeIdx / u_nodeDataTextureWidth);
  vec4 nodeData = texelFetch(u_nodeDataTexture, texCoord, 0);
  vec2 a_anchorPosition = nodeData.xy;
  float a_nodeSize = nodeData.z;
  ${shapes.length > 1 ? "g_shapeId = int(nodeData.w);  // Set global shape ID for multi-shape mode" : "// Single-shape mode - shapeId not used"}

  // Apply zoom-dependent label size scaling
  float zoomScale = u_zoomLabelSizeRatio;
  float margin = a_margin * zoomScale;
  vec2 charOffset = a_charOffset * zoomScale;
  vec2 charSize = a_charSize * zoomScale;
  float labelWidth = a_labelWidth * zoomScale;
  float labelHeight = a_labelHeight * zoomScale;

  // -------------------------------------------------------------------------
  // Step 1: Transform node position to clip space
  // -------------------------------------------------------------------------
  vec3 anchorClip = u_matrix * vec3(a_anchorPosition, 1.0);

  // -------------------------------------------------------------------------
  // Step 2: Convert node size to screen pixels
  // -------------------------------------------------------------------------
  float matrixScaleX = length(vec2(u_matrix[0][0], u_matrix[1][0]));
  float nodeRadiusGraphSpace = a_nodeSize * u_correctionRatio / u_sizeRatio * 2.0;
  float nodeRadiusNDC = nodeRadiusGraphSpace * matrixScaleX;
  float nodeRadiusPixels = nodeRadiusNDC * u_resolution.x / 2.0;

${step3Code}

  // -------------------------------------------------------------------------
  // Step 4: Calculate final vertex position
  // -------------------------------------------------------------------------
  vec2 cornerOffset = (a_quadCorner + 1.0) * 0.5;
  vec2 charPixelPos = positionOffset + charOffset + cornerOffset * charSize;

  // Apply text alignment based on position mode
  float verticalCenter = labelHeight * 0.2;
  float baselineToBottom = labelHeight * 0.25;

  if (a_positionMode < 0.5) {
    // Right: vertically center
    charPixelPos.y += verticalCenter;
  } else if (a_positionMode < 1.5) {
    // Left: right-align and vertically center
    charPixelPos.x -= labelWidth + 1.0;
    charPixelPos.y += verticalCenter;
  } else if (a_positionMode < 2.5) {
    // Above: center horizontally
    charPixelPos.x -= labelWidth * 0.5;
    charPixelPos.y -= baselineToBottom;
  } else if (a_positionMode < 3.5) {
    // Below: center horizontally
    charPixelPos.x -= labelWidth * 0.5;
    charPixelPos.y += labelHeight - baselineToBottom;
  } else {
    // Over: center both
    charPixelPos.x -= labelWidth * 0.5;
    charPixelPos.y += verticalCenter;
  }

  // Apply label angle rotation
  float la_c = cos(a_labelAngle);
  float la_s = sin(a_labelAngle);
  charPixelPos = mat2(la_c, -la_s, la_s, la_c) * charPixelPos;

  // Convert to NDC (flip Y: screen Y-down -> clip Y-up)
  vec2 ndcOffset = vec2(charPixelPos.x, -charPixelPos.y) * 2.0 / u_resolution;
  gl_Position = vec4(anchorClip.xy + ndcOffset, 0.0, 1.0);

  // -------------------------------------------------------------------------
  // Step 5: Texture coordinates
  // -------------------------------------------------------------------------
  v_texCoord = (a_texCoords.xy + cornerOffset * a_texCoords.zw) / u_atlasSize;

  // -------------------------------------------------------------------------
  // Step 6: Pass color
  // -------------------------------------------------------------------------
  v_color = a_color;
  v_color.a *= bias;
}
`;

  return glsl;
}

// ============================================================================
// Fragment Shader Generation
// ============================================================================

/**
 * Generates the fragment shader for SDF-based text rendering with anti-aliasing.
 */
export function generateLabelFragmentShader(): string {
  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec4 v_color;

uniform sampler2D u_atlas;
uniform float u_gamma;
uniform float u_sdfBuffer;
uniform float u_pixelRatio;

// Fragment output (single target - picking handled via separate pass)
out vec4 fragColor;

void main() {
  #ifdef PICKING_MODE
    // Labels are not pickable - discard all fragments in picking mode
    discard;
  #else
    // Sample SDF value from atlas (high = inside glyph, low = outside)
    float sdfValue = texture(u_atlas, v_texCoord).a;

    // Edge threshold: 1.0 - cutoff = 0.75 for default cutoff=0.25
    // This is where the glyph edge is located in the SDF
    float edgeThreshold = 1.0 - u_sdfBuffer;

    // Gamma controls the anti-aliasing band width
    // Scale by pixel ratio for HiDPI support (sharper on high-DPI)
    float gamma = u_gamma / u_pixelRatio;

    // Pure gamma-based anti-aliasing using smoothstep
    // The AA band extends from (threshold - gamma) to (threshold + gamma)
    float alpha = smoothstep(edgeThreshold - gamma, edgeThreshold + gamma, sdfValue);

    // Premultiplied alpha output for correct blending
    float finalAlpha = v_color.a * alpha;
    fragColor = vec4(v_color.rgb * finalAlpha, finalAlpha);
  #endif
}
`;

  return glsl;
}

// ============================================================================
// Uniform Collection
// ============================================================================

export function collectLabelUniforms(shapes: SDFShape[]): string[] {
  const uniforms = [
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_cameraAngle",
    "u_resolution",
    "u_atlasSize",
    "u_atlas",
    "u_gamma",
    "u_sdfBuffer",
    "u_pixelRatio",
    "u_nodeDataTexture",
    "u_nodeDataTextureWidth",
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

// ============================================================================
// Main Generator Function
// ============================================================================

export function generateLabelShaders(options: LabelShaderOptions): GeneratedLabelShaders {
  return {
    vertexShader: generateLabelVertexShader(options),
    fragmentShader: generateLabelFragmentShader(),
    uniforms: collectLabelUniforms(options.shapes),
  };
}
