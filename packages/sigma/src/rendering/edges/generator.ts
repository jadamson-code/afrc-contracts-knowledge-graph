/**
 * Sigma.js Edge Shader Generator
 * ===============================
 *
 * Generates GLSL shaders for composable edge programs.
 * Composes path geometry, extremities (head/tail), and fillings into
 * single-pass WebGL shaders.
 *
 * @module
 */
import { generateShapeSelectorGLSL, getAllShapeGLSL } from "../shapes/registry";
import { numberToGLSLFloat } from "../utils";
import { computeEdgeAttributeLayout, generateEdgeAttributeTextureFetch } from "./path-attribute-texture";
import {
  generateFindSourceClampT,
  generateFindTargetClampT,
  generateNumericalTangentNormal,
  generatePathFallbacks,
} from "./shared-glsl";
import {
  AttributeSpecification,
  EdgeExtremity,
  EdgeFilling,
  EdgePath,
  EdgeProgramOptions,
  GeneratedEdgeShaders,
  normalizeEdgeProgramOptions,
} from "./types";

const { FLOAT, UNSIGNED_BYTE } = WebGL2RenderingContext;

/**
 * Options for generating edge shaders.
 * Alias for EdgeProgramOptions for backward compatibility.
 */
export type EdgeShaderGenerationOptions = EdgeProgramOptions;

// ============================================================================
// Multi-Path GLSL Generation Helpers
// ============================================================================

/**
 * Collects all uniforms from multiple paths, heads, tails, and filling.
 */
function collectUniformsMulti(
  paths: EdgePath[],
  heads: EdgeExtremity[],
  tails: EdgeExtremity[],
  filling: EdgeFilling,
): string[] {
  const standardUniforms = new Set([
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_zoomRatio",
    "u_pixelRatio",
    "u_cameraAngle",
    "u_minEdgeThickness",
    "u_nodeDataTexture",
    "u_nodeDataTextureWidth",
    "u_edgeDataTexture",
    "u_edgeDataTextureWidth",
    // Edge path attribute texture uniforms
    "u_edgeAttributeTexture",
    "u_edgeAttributeTextureWidth",
    "u_edgeAttributeTexelsPerEdge",
  ]);

  const uniforms = new Set<string>(standardUniforms);

  paths.forEach((p) => p.uniforms.forEach((u) => uniforms.add(u.name)));
  heads.forEach((h) => h.uniforms.forEach((u) => uniforms.add(u.name)));
  tails.forEach((t) => t.uniforms.forEach((u) => uniforms.add(u.name)));
  filling.uniforms.forEach((u) => uniforms.add(u.name));

  return Array.from(uniforms);
}

/**
 * Generates GLSL code for all paths (combined).
 */
function generateAllPathsGLSL(paths: EdgePath[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const path of paths) {
    if (!seen.has(path.name)) {
      seen.add(path.name);
      parts.push(`// Path: ${path.name}`);
      parts.push(path.glsl);
      parts.push(generateNumericalTangentNormal(path.name));
      parts.push(generatePathFallbacks(path.name, path.glsl));
      if (path.vertexGlsl) {
        parts.push(path.vertexGlsl);
      }
    }
  }

  return parts.join("\n\n");
}

/**
 * Generates GLSL code for all extremities (combined).
 */
function generateAllExtremitiesGLSL(heads: EdgeExtremity[], tails: EdgeExtremity[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];

  const addExtremity = (ext: EdgeExtremity) => {
    if (!seen.has(ext.name)) {
      seen.add(ext.name);
      parts.push(`// Extremity: ${ext.name}`);
      parts.push(ext.glsl);
    }
  };

  heads.forEach(addExtremity);
  tails.forEach(addExtremity);

  return parts.join("\n\n");
}

/**
 * Generates a GLSL switch statement for path position lookup.
 */
function generatePathPositionSelector(paths: EdgePath[]): string {
  if (paths.length === 1) {
    return `vec2 queryPathPosition(int pathId, float t, vec2 source, vec2 target) {
  return path_${paths[0].name}_position(t, source, target);
}`;
  }

  const cases = paths
    .map((p, i) => `    case ${i}: return path_${p.name}_position(t, source, target);`)
    .join("\n");

  return `vec2 queryPathPosition(int pathId, float t, vec2 source, vec2 target) {
  switch (pathId) {
${cases}
    default: return path_${paths[0].name}_position(t, source, target);
  }
}`;
}

/**
 * Generates a GLSL switch statement for path tangent lookup.
 */
function generatePathTangentSelector(paths: EdgePath[]): string {
  if (paths.length === 1) {
    return `vec2 queryPathTangent(int pathId, float t, vec2 source, vec2 target) {
  return path_${paths[0].name}_tangent(t, source, target);
}`;
  }

  const cases = paths
    .map((p, i) => `    case ${i}: return path_${p.name}_tangent(t, source, target);`)
    .join("\n");

  return `vec2 queryPathTangent(int pathId, float t, vec2 source, vec2 target) {
  switch (pathId) {
${cases}
    default: return path_${paths[0].name}_tangent(t, source, target);
  }
}`;
}

/**
 * Generates a GLSL switch statement for path normal lookup.
 */
function generatePathNormalSelector(paths: EdgePath[]): string {
  if (paths.length === 1) {
    return `vec2 queryPathNormal(int pathId, float t, vec2 source, vec2 target) {
  return path_${paths[0].name}_normal(t, source, target);
}`;
  }

  const cases = paths
    .map((p, i) => `    case ${i}: return path_${p.name}_normal(t, source, target);`)
    .join("\n");

  return `vec2 queryPathNormal(int pathId, float t, vec2 source, vec2 target) {
  switch (pathId) {
${cases}
    default: return path_${paths[0].name}_normal(t, source, target);
  }
}`;
}

/**
 * Generates a GLSL switch statement for path length lookup.
 */
function generatePathLengthSelector(paths: EdgePath[]): string {
  if (paths.length === 1) {
    return `float queryPathLength(int pathId, vec2 source, vec2 target) {
  return path_${paths[0].name}_length(source, target);
}`;
  }

  const cases = paths
    .map((p, i) => `    case ${i}: return path_${p.name}_length(source, target);`)
    .join("\n");

  return `float queryPathLength(int pathId, vec2 source, vec2 target) {
  switch (pathId) {
${cases}
    default: return path_${paths[0].name}_length(source, target);
  }
}`;
}

/**
 * Generates a GLSL switch statement for path closest_t lookup.
 */
function generatePathClosestTSelector(paths: EdgePath[]): string {
  if (paths.length === 1) {
    return `float queryPathClosestT(int pathId, vec2 p, vec2 source, vec2 target) {
  return path_${paths[0].name}_closest_t(p, source, target);
}`;
  }

  const cases = paths
    .map((p, i) => `    case ${i}: return path_${p.name}_closest_t(p, source, target);`)
    .join("\n");

  return `float queryPathClosestT(int pathId, vec2 p, vec2 source, vec2 target) {
  switch (pathId) {
${cases}
    default: return path_${paths[0].name}_closest_t(p, source, target);
  }
}`;
}

/**
 * Generates a GLSL switch statement for extremity SDF lookup.
 */
function generateExtremitySdfSelector(extremities: EdgeExtremity[], prefix: string): string {
  if (extremities.length === 1) {
    return `float query${prefix}SDF(int ${prefix.toLowerCase()}Id, vec2 uv, float lengthRatio, float widthRatio) {
  return extremity_${extremities[0].name}(uv, lengthRatio, widthRatio);
}`;
  }

  const cases = extremities
    .map((e, i) => `    case ${i}: return extremity_${e.name}(uv, lengthRatio, widthRatio);`)
    .join("\n");

  return `float query${prefix}SDF(int ${prefix.toLowerCase()}Id, vec2 uv, float lengthRatio, float widthRatio) {
  switch (${prefix.toLowerCase()}Id) {
${cases}
    default: return extremity_${extremities[0].name}(uv, lengthRatio, widthRatio);
  }
}`;
}

/**
 * Generates find source/target clamp functions for all paths.
 */
function generateAllClampFunctions(paths: EdgePath[]): string {
  const parts: string[] = [];

  // Generate individual clamp functions for each path
  for (const path of paths) {
    parts.push(generateFindSourceClampT(path.name));
    parts.push(generateFindTargetClampT(path.name));
  }

  // Generate selector functions if multi-path
  if (paths.length > 1) {
    const sourceCases = paths
      .map((p, i) => `    case ${i}: return findSourceClampT_${p.name}(source, sourceSize, sourceShapeId, target, margin);`)
      .join("\n");

    const targetCases = paths
      .map((p, i) => `    case ${i}: return findTargetClampT_${p.name}(source, target, targetSize, targetShapeId, margin);`)
      .join("\n");

    parts.push(`
float queryFindSourceClampT(int pathId, vec2 source, float sourceSize, int sourceShapeId, vec2 target, float margin) {
  switch (pathId) {
${sourceCases}
    default: return findSourceClampT_${paths[0].name}(source, sourceSize, sourceShapeId, target, margin);
  }
}

float queryFindTargetClampT(int pathId, vec2 source, vec2 target, float targetSize, int targetShapeId, float margin) {
  switch (pathId) {
${targetCases}
    default: return findTargetClampT_${paths[0].name}(source, target, targetSize, targetShapeId, margin);
  }
}`);
  }

  return parts.join("\n\n");
}

// Zone constants: tail extremity, body, head extremity
const ZONE_TAIL = 0;
const ZONE_BODY = 1;
const ZONE_HEAD = 2;

/**
 * Generates constant vertex data for zone-based edge geometry.
 * Each edge is a triangle strip with 3 zones: tail quad, body segments, head quad.
 */
function generateZonedConstantData(
  bodySegments: number,
  hasHead: boolean,
  hasTail: boolean,
): {
  data: number[][];
  attributes: Array<{ name: string; size: number; type: number }>;
  verticesPerEdge: number;
} {
  // Vertex format: [zone, zoneT, side]
  const data: number[][] = [];

  if (hasTail) {
    // Tail: zoneT=0 at tip, zoneT=1 at body junction
    data.push([ZONE_TAIL, 0, -1], [ZONE_TAIL, 0, +1]);
    data.push([ZONE_TAIL, 1, -1], [ZONE_TAIL, 1, +1]);
  }

  // Body: includes junction vertices at zoneT=0 and zoneT=1
  for (let i = 0; i <= bodySegments; i++) {
    const t = i / bodySegments;
    data.push([ZONE_BODY, t, -1], [ZONE_BODY, t, +1]);
  }

  if (hasHead) {
    // Head: zoneT=0 at body junction, zoneT=1 at tip
    data.push([ZONE_HEAD, 0, -1], [ZONE_HEAD, 0, +1]);
    data.push([ZONE_HEAD, 1, -1], [ZONE_HEAD, 1, +1]);
  }

  return {
    data,
    attributes: [
      { name: "a_zone", size: 1, type: FLOAT },
      { name: "a_zoneT", size: 1, type: FLOAT },
      { name: "a_side", size: 1, type: FLOAT },
    ],
    verticesPerEdge: data.length,
  };
}

/**
 * Collects all unique uniforms from path, extremities, and filling.
 */
function collectUniforms(path: EdgePath, head: EdgeExtremity, tail: EdgeExtremity, filling: EdgeFilling): string[] {
  const standardUniforms = new Set([
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_zoomRatio",
    "u_pixelRatio",
    "u_cameraAngle",
    "u_minEdgeThickness",
    "u_nodeDataTexture",
    "u_nodeDataTextureWidth",
    "u_edgeDataTexture",
    "u_edgeDataTextureWidth",
    // Edge path attribute texture uniforms
    "u_edgeAttributeTexture",
    "u_edgeAttributeTextureWidth",
    "u_edgeAttributeTexelsPerEdge",
  ]);

  const uniforms = new Set<string>(standardUniforms);

  // Add path uniforms
  path.uniforms.forEach((u) => uniforms.add(u.name));

  // Add head/tail uniforms
  head.uniforms.forEach((u) => uniforms.add(u.name));
  tail.uniforms.forEach((u) => uniforms.add(u.name));

  // Add filling uniforms
  filling.uniforms.forEach((u) => uniforms.add(u.name));

  return Array.from(uniforms);
}

/**
 * Collects attributes for the edge vertex buffer.
 * Path/filling attributes are now stored in the edge path attribute texture,
 * so only core per-edge attributes are included in the vertex buffer.
 */
function collectAttributes(
  _path: EdgePath,
  _head: EdgeExtremity,
  _tail: EdgeExtremity,
  _filling: EdgeFilling,
): AttributeSpecification[] {
  // Core per-edge attributes (path/filling attributes are in the attribute texture)
  return [
    // Edge index for texture lookup (used for both edge data and path attribute textures)
    { name: "a_edgeIndex", size: 1, type: FLOAT },
    { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
    { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true },
  ];
}

/**
 * Generates the vertex shader for multi-path edge rendering.
 * Uses query functions (selectors) instead of direct path function calls.
 */
function generateVertexShaderMulti(
  paths: EdgePath[],
  heads: EdgeExtremity[],
  tails: EdgeExtremity[],
  filling: EdgeFilling,
  constantAttributes: Array<{ name: string; size: number; type: number }>,
): string {
  // Compute attribute layout for path/filling attributes from texture
  const attributeLayout = computeEdgeAttributeLayout(paths, filling);
  const textureFetch = generateEdgeAttributeTextureFetch(attributeLayout);

  // Collect all unique uniforms
  const standardUniforms = new Set([
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_zoomRatio",
    "u_pixelRatio",
    "u_cameraAngle",
    "u_minEdgeThickness",
    "u_nodeDataTexture",
  ]);

  const seenUniforms = new Set<string>();
  const customUniforms: string[] = [];
  const addUniform = (u: { name: string; type: string }) => {
    if (!standardUniforms.has(u.name) && !seenUniforms.has(u.name)) {
      seenUniforms.add(u.name);
      customUniforms.push(`uniform ${u.type} ${u.name};`);
    }
  };
  paths.forEach((p) => p.uniforms.forEach(addUniform));
  heads.forEach((h) => h.uniforms.forEach(addUniform));
  tails.forEach((t) => t.uniforms.forEach(addUniform));
  filling.uniforms.forEach(addUniform);

  // Generate constant attribute declarations
  const constantAttrDeclarations = constantAttributes
    .map((attr) => {
      const glslType = attr.size === 1 ? "float" : `vec${attr.size}`;
      return `in ${glslType} ${attr.name};`;
    })
    .join("\n");

  // Generate extremity width factor uniforms
  // For multi-mode, we store width factors as uniform arrays since they're per-extremity-type
  const headWidthFactors = heads.map((h) => numberToGLSLFloat(h.widthFactor)).join(", ");
  const tailWidthFactors = tails.map((t) => numberToGLSLFloat(t.widthFactor)).join(", ");

  // Generate min body length ratio (use max across all paths)
  const maxMinBodyLengthRatio = Math.max(...paths.map((p) => p.minBodyLengthRatio || 0));

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

// Constant attributes (per vertex)
${constantAttrDeclarations}

// Per-edge attributes
// Edge data (source/target indices, thickness, extremity ratios, path/extremity IDs)
// is fetched from edge data texture via edge index
in float a_edgeIndex;   // Index into edge data texture
in vec4 a_color;        // Edge color
in vec4 a_id;           // Edge ID for picking

// Standard uniforms
uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_cameraAngle;
uniform float u_minEdgeThickness;
uniform sampler2D u_nodeDataTexture;
uniform int u_nodeDataTextureWidth;
uniform sampler2D u_edgeDataTexture;
uniform int u_edgeDataTextureWidth;

// Edge path attribute texture uniforms
${textureFetch.uniformDeclarations}

// Custom uniforms
${customUniforms.join("\n")}

// Standard varyings
out vec4 v_color;
out vec4 v_id;
out float v_thickness;       // Edge body thickness (in consistent units)
out float v_maxWidthFactor;  // Max width factor for geometry expansion
out float v_t;
out float v_tStart;
out float v_tEnd;
out float v_side;
out float v_antialiasingWidth;  // Anti-aliasing width (normalized: u_correctionRatio / thickness)
out vec2 v_source;
out vec2 v_target;
out float v_edgeLength;
out vec2 v_position;         // World position of the vertex (for position-based distance)

// Zone varyings
out float v_zone;            // 0=tail, 1=body, 2=head
out float v_zoneT;           // Position within zone [0,1]
out float v_headLengthRatio; // Head length as ratio of thickness
out float v_tailLengthRatio; // Tail length as ratio of thickness
out float v_headWidthRatio;  // Head width factor
out float v_tailWidthRatio;  // Tail width factor

// Multi-path/extremity varyings
flat out int v_pathId;
flat out int v_headId;
flat out int v_tailId;

// Path/filling attribute varyings (fetched from edge attribute texture)
${textureFetch.vertexVaryingDeclarations}

const float bias = 255.0 / 254.0;

// Width factor arrays for extremities
const float HEAD_WIDTH_FACTORS[${heads.length}] = float[](${headWidthFactors});
const float TAIL_WIDTH_FACTORS[${tails.length}] = float[](${tailWidthFactors});

// Include all registered shape SDFs (with helper functions like rotate2D)
${getAllShapeGLSL()}

// Shape selector function
${generateShapeSelectorGLSL()}

// All path functions
${generateAllPathsGLSL(paths)}

// Path selector functions
${generatePathPositionSelector(paths)}
${generatePathTangentSelector(paths)}
${generatePathNormalSelector(paths)}
${generatePathLengthSelector(paths)}

// All clamp functions
${generateAllClampFunctions(paths)}

void main() {
  // Fetch edge data from edge texture (2 texels per edge)
  // Texel 0: sourceNodeIndex, targetNodeIndex, thickness, reserved
  // Texel 1: headLengthRatio, tailLengthRatio, pathId, (headId << 4) | tailId
  int edgeIdx = int(a_edgeIndex);
  int texel0Idx = edgeIdx * 2;
  int texel1Idx = edgeIdx * 2 + 1;
  ivec2 edgeTexCoord0 = ivec2(texel0Idx % u_edgeDataTextureWidth, texel0Idx / u_edgeDataTextureWidth);
  ivec2 edgeTexCoord1 = ivec2(texel1Idx % u_edgeDataTextureWidth, texel1Idx / u_edgeDataTextureWidth);
  vec4 edgeData0 = texelFetch(u_edgeDataTexture, edgeTexCoord0, 0);
  vec4 edgeData1 = texelFetch(u_edgeDataTexture, edgeTexCoord1, 0);

  // Unpack edge data
  int srcIdx = int(edgeData0.x);
  int tgtIdx = int(edgeData0.y);
  float a_thickness = edgeData0.z;
  // edgeData0.w is now reserved (curvature moved to path attribute texture)
  float a_headLengthRatio = edgeData1.x;
  float a_tailLengthRatio = edgeData1.y;
  int pathId = int(edgeData1.z);
  int extremityPacked = int(edgeData1.w);
  int headId = extremityPacked >> 4;
  int tailId = extremityPacked & 15;

  // Fetch path/filling attributes from edge attribute texture
${textureFetch.fetchCode}

  // Assign path/filling attribute varyings
${textureFetch.varyingAssignments}

  // Fetch source and target node data from node texture
  ivec2 srcTexCoord = ivec2(srcIdx % u_nodeDataTextureWidth, srcIdx / u_nodeDataTextureWidth);
  ivec2 tgtTexCoord = ivec2(tgtIdx % u_nodeDataTextureWidth, tgtIdx / u_nodeDataTextureWidth);
  vec4 srcNodeData = texelFetch(u_nodeDataTexture, srcTexCoord, 0);
  vec4 tgtNodeData = texelFetch(u_nodeDataTexture, tgtTexCoord, 0);

  vec2 a_source = srcNodeData.xy;
  vec2 a_target = tgtNodeData.xy;
  float a_sourceSize = srcNodeData.z;
  float a_targetSize = tgtNodeData.z;
  float a_sourceShapeId = srcNodeData.w;
  float a_targetShapeId = tgtNodeData.w;

  // Convert thickness to WebGL units
  float minThickness = u_minEdgeThickness;
  float pixelsThickness = max(a_thickness, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Extremity parameters from ID lookups
  float headLengthRatio = a_headLengthRatio;
  float tailLengthRatio = a_tailLengthRatio;
  float headWidthFactor = HEAD_WIDTH_FACTORS[headId];
  float tailWidthFactor = TAIL_WIDTH_FACTORS[tailId];
  float minBodyLengthRatio = ${numberToGLSLFloat(maxMinBodyLengthRatio)};

  // Find clamped t values using path-specific functions
  // For extremityNone (length=0), skip clamping - edge goes to node center
  float tStart = tailLengthRatio > 0.0 ? queryFindSourceClampT(pathId, a_source, a_sourceSize, int(a_sourceShapeId), a_target, 0.0) : 0.0;
  float tEnd = headLengthRatio > 0.0 ? queryFindTargetClampT(pathId, a_source, a_target, a_targetSize, int(a_targetShapeId), 0.0) : 1.0;

  // Width factor for geometry expansion (use max of both extremities)
  float widthFactor = max(max(headWidthFactor, tailWidthFactor), 1.0);

  // Anti-aliasing width (~1 pixel, normalized by thickness)
  float antialiasingWidth = u_correctionRatio / webGLThickness;

  // Compute path length and visible length using path selector
  float pathLength = queryPathLength(pathId, a_source, a_target);
  float visibleLength = pathLength * (tEnd - tStart);

  // Compute extremity lengths in world units
  float headLength = headLengthRatio * webGLThickness;
  float tailLength = tailLengthRatio * webGLThickness;
  float minBodyLength = minBodyLengthRatio * webGLThickness;

  // Handle short edges: scale down extremities if needed
  float totalNeededLength = headLength + tailLength + minBodyLength;
  float extremityScale = 1.0;
  if (totalNeededLength > visibleLength && totalNeededLength > 0.0001) {
    extremityScale = visibleLength / totalNeededLength;
    headLength *= extremityScale;
    tailLength *= extremityScale;
  }

  // Convert lengths to t-values
  float headLengthT = pathLength > 0.0001 ? headLength / pathLength : 0.0;
  float tailLengthT = pathLength > 0.0001 ? tailLength / pathLength : 0.0;

  // Zone boundaries in t-space
  float tTailEnd = tStart + tailLengthT;
  float tHeadStart = tEnd - headLengthT;

  // Ensure body has non-negative length
  if (tTailEnd > tHeadStart) {
    float mid = (tStart + tEnd) * 0.5;
    tTailEnd = mid;
    tHeadStart = mid;
  }

  // Convert to webGL units for geometry expansion
  float aaWidthWebGL = antialiasingWidth * webGLThickness;

  // Zone-based vertex processing using path selectors
  vec2 position;
  vec2 normal;
  float t;
  float zone = a_zone;
  float zoneT = a_zoneT;
  float side = a_side;

  if (zone < 0.5) {
    // TAIL ZONE: rectangular quad with width = tailWidthFactor
    vec2 tang = queryPathTangent(pathId, tTailEnd, a_source, a_target);
    normal = vec2(-tang.y, tang.x);
    vec2 centerPos = mix(queryPathPosition(pathId, tStart, a_source, a_target),
                         queryPathPosition(pathId, tTailEnd, a_source, a_target), zoneT);
    float halfWidth = webGLThickness * tailWidthFactor * 0.5 + aaWidthWebGL;
    position = centerPos + normal * side * halfWidth;
    t = mix(tStart, tTailEnd, zoneT);

  } else if (zone < 1.5) {
    // BODY ZONE: follows path curvature with width = 1.0
    t = mix(tTailEnd, tHeadStart, zoneT);
    normal = queryPathNormal(pathId, t, a_source, a_target);
    float halfWidth = webGLThickness * 0.5 + aaWidthWebGL;
    position = queryPathPosition(pathId, t, a_source, a_target) + normal * side * halfWidth;

  } else {
    // HEAD ZONE: rectangular quad with width = headWidthFactor
    vec2 tang = queryPathTangent(pathId, tHeadStart, a_source, a_target);
    normal = vec2(-tang.y, tang.x);
    vec2 centerPos = mix(queryPathPosition(pathId, tHeadStart, a_source, a_target),
                         queryPathPosition(pathId, tEnd, a_source, a_target), zoneT);
    float halfWidth = webGLThickness * headWidthFactor * 0.5 + aaWidthWebGL;
    position = centerPos + normal * side * halfWidth;
    t = mix(tHeadStart, tEnd, zoneT);
  }

  gl_Position = vec4((u_matrix * vec3(position, 1.0)).xy, 0.0, 1.0);

  // Pass varyings to fragment shader
  v_color = a_color;
  v_color.a *= bias;
  v_id = a_id;
  v_thickness = webGLThickness;
  v_maxWidthFactor = widthFactor;
  v_t = t;
  v_tStart = tStart;
  v_tEnd = tEnd;
  v_side = side;
  v_antialiasingWidth = antialiasingWidth;
  v_source = a_source;
  v_target = a_target;
  v_edgeLength = pathLength;
  v_position = position;

  // Zone varyings
  v_zone = zone;
  v_zoneT = zoneT;
  v_headLengthRatio = headLengthRatio * extremityScale;
  v_tailLengthRatio = tailLengthRatio * extremityScale;
  v_headWidthRatio = headWidthFactor;
  v_tailWidthRatio = tailWidthFactor;

  // Multi-path varyings
  v_pathId = pathId;
  v_headId = headId;
  v_tailId = tailId;
}
`;

  return glsl;
}

/**
 * Generates the vertex shader for edge rendering.
 */
function generateVertexShader(
  path: EdgePath,
  head: EdgeExtremity,
  tail: EdgeExtremity,
  filling: EdgeFilling,
  constantAttributes: Array<{ name: string; size: number; type: number }>,
): string {
  const pathName = path.name;
  const hasCustomConstantData = !!path.generateConstantData;

  // Compute attribute layout for path/filling attributes from texture
  const attributeLayout = computeEdgeAttributeLayout([path], filling);
  const textureFetch = generateEdgeAttributeTextureFetch(attributeLayout);

  // Collect custom uniforms (not standard ones)
  const standardUniforms = new Set([
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_zoomRatio",
    "u_pixelRatio",
    "u_cameraAngle",
    "u_minEdgeThickness",
    "u_nodeDataTexture",
  ]);

  const seenUniforms = new Set<string>();
  const customUniforms = [...path.uniforms, ...head.uniforms, ...tail.uniforms, ...filling.uniforms]
    .filter((u) => {
      if (standardUniforms.has(u.name) || seenUniforms.has(u.name)) {
        return false;
      }
      seenUniforms.add(u.name);
      return true;
    })
    .map((u) => `uniform ${u.type} ${u.name};`)
    .join("\n");

  // Get head/tail margin values
  const headMargin =
    head.margin === undefined
      ? "0.0"
      : typeof head.margin === "number"
        ? numberToGLSLFloat(head.margin)
        : `a_${head.margin.attribute}`;
  const tailMargin =
    tail.margin === undefined
      ? "0.0"
      : typeof tail.margin === "number"
        ? numberToGLSLFloat(tail.margin)
        : `a_${tail.margin.attribute}`;

  // Generate constant attribute declarations
  const constantAttrDeclarations = constantAttributes
    .map((attr) => {
      const glslType = attr.size === 1 ? "float" : `vec${attr.size}`;
      return `in ${glslType} ${attr.name};`;
    })
    .join("\n");

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

// Constant attributes (per vertex)
${constantAttrDeclarations}

// Per-edge attributes
// Edge data (source/target indices, thickness, extremity ratios)
// is fetched from edge data texture via edge index
in float a_edgeIndex;   // Index into edge data texture
in vec4 a_color;        // Edge color
in vec4 a_id;           // Edge ID for picking

// Standard uniforms
uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_cameraAngle;
uniform float u_minEdgeThickness;
uniform sampler2D u_nodeDataTexture;
uniform int u_nodeDataTextureWidth;
uniform sampler2D u_edgeDataTexture;
uniform int u_edgeDataTextureWidth;

// Edge path attribute texture uniforms
${textureFetch.uniformDeclarations}

// Custom uniforms
${customUniforms}

// Standard varyings
out vec4 v_color;
out vec4 v_id;
out float v_thickness;       // Edge body thickness (in consistent units)
out float v_maxWidthFactor;  // Max width factor for geometry expansion
out float v_t;
out float v_tStart;
out float v_tEnd;
out float v_side;
out float v_antialiasingWidth;  // Anti-aliasing width (normalized: u_correctionRatio / thickness)
out vec2 v_source;
out vec2 v_target;
out float v_edgeLength;
out vec2 v_position;         // World position of the vertex (for position-based distance)

// Zone varyings
out float v_zone;            // 0=tail, 1=body, 2=head
out float v_zoneT;           // Position within zone [0,1]
out float v_headLengthRatio; // Head length as ratio of thickness
out float v_tailLengthRatio; // Tail length as ratio of thickness
out float v_headWidthRatio;  // Head width factor
out float v_tailWidthRatio;  // Tail width factor

// Path/filling attribute varyings (fetched from edge attribute texture)
${textureFetch.vertexVaryingDeclarations}

const float bias = 255.0 / 254.0;

// Include all registered shape SDFs (with helper functions like rotate2D)
${getAllShapeGLSL()}

// Shape selector function
${generateShapeSelectorGLSL()}

// Path functions (user-provided)
${path.glsl}

// Auto-generated tangent/normal (numerical differentiation from position)
${generateNumericalTangentNormal(pathName)}

// Auto-generated fallbacks for any missing path functions
${generatePathFallbacks(pathName, path.glsl)}

// Custom vertex processing (if any)
${path.vertexGlsl || ""}

// Binary search to find where path exits/enters a node.
// (Generated from shared-glsl.ts)
${generateFindSourceClampT(pathName)}
${generateFindTargetClampT(pathName)}

void main() {
  // Fetch edge data from edge texture (2 texels per edge)
  // Texel 0: sourceNodeIndex, targetNodeIndex, thickness, reserved
  // Texel 1: headLengthRatio, tailLengthRatio, reserved, reserved
  int edgeIdx = int(a_edgeIndex);
  int texel0Idx = edgeIdx * 2;
  int texel1Idx = edgeIdx * 2 + 1;
  ivec2 edgeTexCoord0 = ivec2(texel0Idx % u_edgeDataTextureWidth, texel0Idx / u_edgeDataTextureWidth);
  ivec2 edgeTexCoord1 = ivec2(texel1Idx % u_edgeDataTextureWidth, texel1Idx / u_edgeDataTextureWidth);
  vec4 edgeData0 = texelFetch(u_edgeDataTexture, edgeTexCoord0, 0);
  vec4 edgeData1 = texelFetch(u_edgeDataTexture, edgeTexCoord1, 0);

  // Unpack edge data
  int srcIdx = int(edgeData0.x);
  int tgtIdx = int(edgeData0.y);
  float a_thickness = edgeData0.z;
  // edgeData0.w is now reserved (curvature moved to path attribute texture)
  float a_headLengthRatio = edgeData1.x;
  float a_tailLengthRatio = edgeData1.y;

  // Fetch path/filling attributes from edge attribute texture
${textureFetch.fetchCode}

  // Assign path/filling attribute varyings
${textureFetch.varyingAssignments}

  // Fetch source and target node data from node texture
  // Texture format: vec4(x, y, size, shapeId)
  // 2D texture layout: texCoord = (index % width, index / width)
  ivec2 srcTexCoord = ivec2(srcIdx % u_nodeDataTextureWidth, srcIdx / u_nodeDataTextureWidth);
  ivec2 tgtTexCoord = ivec2(tgtIdx % u_nodeDataTextureWidth, tgtIdx / u_nodeDataTextureWidth);
  vec4 srcNodeData = texelFetch(u_nodeDataTexture, srcTexCoord, 0);
  vec4 tgtNodeData = texelFetch(u_nodeDataTexture, tgtTexCoord, 0);

  vec2 a_source = srcNodeData.xy;
  vec2 a_target = tgtNodeData.xy;
  float a_sourceSize = srcNodeData.z;
  float a_targetSize = tgtNodeData.z;
  float a_sourceShapeId = srcNodeData.w;
  float a_targetShapeId = tgtNodeData.w;

  // Convert thickness to WebGL units
  float minThickness = u_minEdgeThickness;
  float pixelsThickness = max(a_thickness, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Find clamped t values (where edge starts/ends at node boundaries)
  float headMarginValue = ${headMargin};
  float tailMarginValue = ${tailMargin};

  // Extremity parameters
  // Length ratios come from edge texture (per-edge), width factors from program (per-program)
  float headLengthRatio = a_headLengthRatio;
  float tailLengthRatio = a_tailLengthRatio;
  float headWidthFactor = ${numberToGLSLFloat(head.widthFactor)};
  float tailWidthFactor = ${numberToGLSLFloat(tail.widthFactor)};
  float minBodyLengthRatio = ${numberToGLSLFloat(path.minBodyLengthRatio || 0)};

  // For extremityNone (length=0), skip clamping - edge goes to node center
  float tStart = tailLengthRatio > 0.0 ? findSourceClampT_${pathName}(a_source, a_sourceSize, int(a_sourceShapeId), a_target, tailMarginValue) : 0.0;
  float tEnd = headLengthRatio > 0.0 ? findTargetClampT_${pathName}(a_source, a_target, a_targetSize, int(a_targetShapeId), headMarginValue) : 1.0;

  // Width factor for geometry expansion (use max of both extremities)
  float widthFactor = max(max(headWidthFactor, tailWidthFactor), 1.0);

  // Anti-aliasing width (~1 pixel, normalized by thickness)
  float antialiasingWidth = u_correctionRatio / webGLThickness;

  // Compute path length and visible length
  float pathLength = path_${pathName}_length(a_source, a_target);
  float visibleLength = pathLength * (tEnd - tStart);

  // Compute extremity lengths in world units
  float headLength = headLengthRatio * webGLThickness;
  float tailLength = tailLengthRatio * webGLThickness;
  float minBodyLength = minBodyLengthRatio * webGLThickness;

  // Handle short edges: scale down extremities if needed
  float totalNeededLength = headLength + tailLength + minBodyLength;
  float extremityScale = 1.0;
  if (totalNeededLength > visibleLength && totalNeededLength > 0.0001) {
    extremityScale = visibleLength / totalNeededLength;
    headLength *= extremityScale;
    tailLength *= extremityScale;
  }

  // Convert lengths to t-values
  float headLengthT = pathLength > 0.0001 ? headLength / pathLength : 0.0;
  float tailLengthT = pathLength > 0.0001 ? tailLength / pathLength : 0.0;

  // Zone boundaries in t-space
  float tTailEnd = tStart + tailLengthT;   // Where tail ends / body starts
  float tHeadStart = tEnd - headLengthT;   // Where body ends / head starts

  // Ensure body has non-negative length
  if (tTailEnd > tHeadStart) {
    float mid = (tStart + tEnd) * 0.5;
    tTailEnd = mid;
    tHeadStart = mid;
  }

  // Convert to webGL units for geometry expansion
  float aaWidthWebGL = antialiasingWidth * webGLThickness;

  ${
    hasCustomConstantData
      ? `// Custom vertex processing for path with generateConstantData
  vec2 position;
  vec2 normal;
  float vertexT;
  float zone = a_zone;
  float zoneT = a_zoneT;
  ${pathName}_getVertexPosition(
    a_source, a_target,
    tStart, tEnd, tTailEnd, tHeadStart,
    a_zone, a_zoneT, a_side,
    webGLThickness, aaWidthWebGL,
    headWidthFactor, tailWidthFactor,
    position, normal, vertexT
  );

  float t = vertexT;
  float side = a_side;`
      : `// Zone-based vertex processing
  vec2 position;
  vec2 normal;
  float t;
  float zone = a_zone;
  float zoneT = a_zoneT;
  float side = a_side;

  if (zone < 0.5) {
    // TAIL ZONE: rectangular quad with width = tailWidthFactor
    vec2 tang = path_${pathName}_tangent(tTailEnd, a_source, a_target);
    normal = vec2(-tang.y, tang.x);
    vec2 centerPos = mix(path_${pathName}_position(tStart, a_source, a_target),
                         path_${pathName}_position(tTailEnd, a_source, a_target), zoneT);
    float halfWidth = webGLThickness * tailWidthFactor * 0.5 + aaWidthWebGL;
    position = centerPos + normal * side * halfWidth;
    t = mix(tStart, tTailEnd, zoneT);

  } else if (zone < 1.5) {
    // BODY ZONE: follows path curvature with width = 1.0
    t = mix(tTailEnd, tHeadStart, zoneT);
    normal = path_${pathName}_normal(t, a_source, a_target);
    float halfWidth = webGLThickness * 0.5 + aaWidthWebGL;
    position = path_${pathName}_position(t, a_source, a_target) + normal * side * halfWidth;

  } else {
    // HEAD ZONE: rectangular quad with width = headWidthFactor
    vec2 tang = path_${pathName}_tangent(tHeadStart, a_source, a_target);
    normal = vec2(-tang.y, tang.x);
    vec2 centerPos = mix(path_${pathName}_position(tHeadStart, a_source, a_target),
                         path_${pathName}_position(tEnd, a_source, a_target), zoneT);
    float halfWidth = webGLThickness * headWidthFactor * 0.5 + aaWidthWebGL;
    position = centerPos + normal * side * halfWidth;
    t = mix(tHeadStart, tEnd, zoneT);
  }`
  }

  gl_Position = vec4((u_matrix * vec3(position, 1.0)).xy, 0.0, 1.0);

  // Pass varyings to fragment shader
  v_color = a_color;
  v_color.a *= bias;
  v_id = a_id;
  v_thickness = webGLThickness;
  v_maxWidthFactor = widthFactor;
  v_t = t;
  v_tStart = tStart;
  v_tEnd = tEnd;
  v_side = side;
  v_antialiasingWidth = antialiasingWidth;
  v_source = a_source;
  v_target = a_target;
  v_edgeLength = pathLength;
  v_position = position;

  // Zone varyings
  v_zone = zone;
  v_zoneT = zoneT;
  v_headLengthRatio = headLengthRatio * extremityScale;
  v_tailLengthRatio = tailLengthRatio * extremityScale;
  v_headWidthRatio = headWidthFactor;
  v_tailWidthRatio = tailWidthFactor;
}
`;

  return glsl;
}

/**
 * Generates the fragment shader for multi-path edge rendering.
 * Uses query functions (selectors) for path and extremity operations.
 */
function generateFragmentShaderMulti(
  paths: EdgePath[],
  heads: EdgeExtremity[],
  tails: EdgeExtremity[],
  filling: EdgeFilling,
): string {
  // Compute attribute layout for path/filling attributes from texture
  const attributeLayout = computeEdgeAttributeLayout(paths, filling);
  const textureFetch = generateEdgeAttributeTextureFetch(attributeLayout);

  // Collect all unique uniforms
  const standardUniforms = new Set([
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_zoomRatio",
    "u_pixelRatio",
    "u_cameraAngle",
    "u_minEdgeThickness",
  ]);

  const seenUniforms = new Set<string>();
  const customUniforms: string[] = [];
  const addUniform = (u: { name: string; type: string }) => {
    if (!standardUniforms.has(u.name) && !seenUniforms.has(u.name)) {
      seenUniforms.add(u.name);
      customUniforms.push(`uniform ${u.type} ${u.name};`);
    }
  };
  paths.forEach((p) => p.uniforms.forEach(addUniform));
  heads.forEach((h) => h.uniforms.forEach(addUniform));
  tails.forEach((t) => t.uniforms.forEach(addUniform));
  filling.uniforms.forEach(addUniform);

  // Generate base ratio arrays for extremities
  const headBaseRatios = heads.map((h) => numberToGLSLFloat(h.baseRatio ?? 0.5)).join(", ");
  const tailBaseRatios = tails.map((t) => numberToGLSLFloat(t.baseRatio ?? 0.5)).join(", ");

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es
precision highp float;

// Standard varyings
in vec4 v_color;
in vec4 v_id;
in float v_thickness;       // Edge body thickness
in float v_maxWidthFactor;  // Max width factor for geometry expansion
in float v_t;
in float v_tStart;
in float v_tEnd;
in float v_side;
in float v_antialiasingWidth;  // Anti-aliasing width (normalized: u_correctionRatio / thickness)
in vec2 v_source;
in vec2 v_target;
in float v_edgeLength;
in vec2 v_position;          // World position of the fragment

// Zone varyings
in float v_zone;            // 0=tail, 1=body, 2=head
in float v_zoneT;           // Position within zone [0,1]
in float v_headLengthRatio; // Head length as ratio of thickness (scaled for short edges)
in float v_tailLengthRatio; // Tail length as ratio of thickness (scaled for short edges)
in float v_headWidthRatio;  // Head width factor
in float v_tailWidthRatio;  // Tail width factor

// Multi-path/extremity varyings
flat in int v_pathId;
flat in int v_headId;
flat in int v_tailId;

// Path/filling attribute varyings (from vertex shader texture fetch)
${textureFetch.fragmentVaryingDeclarations}

// Standard uniforms (needed by some path types)
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_cameraAngle;

// Custom uniforms
${customUniforms.join("\n")}

// Fragment output (single target - picking handled via separate pass)
out vec4 fragColor;

// Base ratio arrays for extremities
const float HEAD_BASE_RATIOS[${heads.length}] = float[](${headBaseRatios});
const float TAIL_BASE_RATIOS[${tails.length}] = float[](${tailBaseRatios});

// EdgeContext struct
struct EdgeContext {
  float t;                   // Position along path [0, 1]
  float sdf;                 // Signed distance from centerline
  vec2 position;             // World position
  vec2 tangent;              // Path tangent
  vec2 normal;               // Path normal
  float thickness;           // Edge thickness
  float aaWidth;             // Anti-aliasing width
  float edgeLength;          // Total path length
  float tStart;              // Clamped start t
  float tEnd;                // Clamped end t
  float distanceFromSource;  // Arc distance from source
  float distanceToTarget;    // Arc distance to target
};

EdgeContext context;

// All path functions
${generateAllPathsGLSL(paths)}

// Path selector functions
${generatePathPositionSelector(paths)}
${generatePathTangentSelector(paths)}
${generatePathNormalSelector(paths)}
${generatePathClosestTSelector(paths)}

// All extremity functions
${generateAllExtremitiesGLSL(heads, tails)}

// Extremity SDF selectors
${generateExtremitySdfSelector(heads, "Head")}
${generateExtremitySdfSelector(tails, "Tail")}

// Filling function
${filling.glsl}

// Helper: Compute arc length using path selector
float computeArcLengthMulti(int pathId, float t0, float t1, vec2 source, vec2 target, int samples) {
  float arcLen = 0.0;
  vec2 prev = queryPathPosition(pathId, t0, source, target);
  for (int i = 1; i <= samples; i++) {
    float t = t0 + (t1 - t0) * float(i) / float(samples);
    vec2 curr = queryPathPosition(pathId, t, source, target);
    arcLen += length(curr - prev);
    prev = curr;
  }
  return arcLen;
}

void main() {
  // Compute normalized t within visible edge (0 = start, 1 = end)
  float tNorm = (v_t - v_tStart) / max(v_tEnd - v_tStart, 0.0001);

  // Edge body half-thickness
  float halfThickness = v_thickness * 0.5;

  // Convert normalized AA width to webGL units (~1 pixel)
  float aaWidthWebGL = v_antialiasingWidth * v_thickness;

  // Distance from centerline based on v_side interpolation
  float zoneWidthFactor = v_zone < 0.5 ? v_tailWidthRatio :
                          v_zone < 1.5 ? 1.0 :
                          v_headWidthRatio;
  float halfGeometryWidth = halfThickness * zoneWidthFactor + aaWidthWebGL;
  float distFromCenter = abs(v_side) * halfGeometryWidth;

  // Populate EdgeContext (for filling function)
  context.t = tNorm;
  context.sdf = distFromCenter - halfThickness;
  context.position = queryPathPosition(v_pathId, v_t, v_source, v_target);
  context.tangent = queryPathTangent(v_pathId, v_t, v_source, v_target);
  context.normal = queryPathNormal(v_pathId, v_t, v_source, v_target);
  context.thickness = v_thickness;
  context.aaWidth = aaWidthWebGL;
  context.edgeLength = v_edgeLength;
  context.tStart = v_tStart;
  context.tEnd = v_tEnd;

  // Compute arc distances using numerical integration (multi-path always uses this)
  float visibleLength = v_edgeLength * (v_tEnd - v_tStart);
  float pathT = v_t;
  float pathTNorm = tNorm;
  context.distanceFromSource = computeArcLengthMulti(v_pathId, v_tStart, pathT, v_source, v_target, 16);
  context.distanceToTarget = computeArcLengthMulti(v_pathId, pathT, v_tEnd, v_source, v_target, 16);

  // Compute SDF based on zone using extremity selectors
  float bodySDF = distFromCenter - halfThickness;
  float finalSDF;

  // Get base ratios from arrays
  float headBaseRatio = HEAD_BASE_RATIOS[v_headId];
  float tailBaseRatio = TAIL_BASE_RATIOS[v_tailId];

  if (v_zone < 0.5) {
    // TAIL ZONE: v_zoneT goes 0 (tip) to 1 (base)
    vec2 uv = vec2((1.0 - v_zoneT) * v_tailLengthRatio, v_side * v_tailWidthRatio * 0.5);
    float tailSDF = queryTailSDF(v_tailId, uv, v_tailLengthRatio, v_tailWidthRatio) * v_thickness;

    // Apply union only near base (v_zoneT > 1 - baseRatio)
    if (v_zoneT > 1.0 - tailBaseRatio) {
      finalSDF = min(tailSDF, bodySDF);
    } else {
      finalSDF = tailSDF;
    }
  } else if (v_zone < 1.5) {
    // BODY ZONE: distance from centerline
    finalSDF = bodySDF;
  } else {
    // HEAD ZONE: v_zoneT goes 0 (base) to 1 (tip)
    vec2 uv = vec2(v_zoneT * v_headLengthRatio, v_side * v_headWidthRatio * 0.5);
    float headSDF = queryHeadSDF(v_headId, uv, v_headLengthRatio, v_headWidthRatio) * v_thickness;

    // Apply union only near base (v_zoneT < baseRatio)
    if (v_zoneT < headBaseRatio) {
      finalSDF = min(headSDF, bodySDF);
    } else {
      finalSDF = headSDF;
    }
  }

  #ifdef PICKING_MODE
    // Picking pass: output edge ID for pixels inside edge
    if (finalSDF > 0.0) discard;
    fragColor = v_id;
  #else
    // Visual pass: anti-aliased edge with filling
    float alpha = smoothstep(aaWidthWebGL, -aaWidthWebGL, finalSDF);
    if (alpha < 0.01) discard;

    vec4 color = filling_${filling.name}(context);
    // Mix with transparent to fade both color AND alpha (pre-multiplied alpha for correct blending)
    fragColor = mix(vec4(0.0), color, alpha);
  #endif
}
`;

  return glsl;
}

/**
 * Generates the fragment shader for edge rendering.
 */
function generateFragmentShader(
  path: EdgePath,
  head: EdgeExtremity,
  tail: EdgeExtremity,
  filling: EdgeFilling,
): string {
  const pathName = path.name;
  const hasCustomConstantData = !!path.generateConstantData;

  // Compute attribute layout for path/filling attributes from texture
  const attributeLayout = computeEdgeAttributeLayout([path], filling);
  const textureFetch = generateEdgeAttributeTextureFetch(attributeLayout);

  // Collect custom uniforms
  const standardUniforms = new Set([
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_zoomRatio",
    "u_pixelRatio",
    "u_cameraAngle",
    "u_minEdgeThickness",
  ]);

  const seenUniforms = new Set<string>();
  const customUniforms = [...path.uniforms, ...head.uniforms, ...tail.uniforms, ...filling.uniforms]
    .filter((u) => {
      if (standardUniforms.has(u.name) || seenUniforms.has(u.name)) {
        return false;
      }
      seenUniforms.add(u.name);
      return true;
    })
    .map((u) => `uniform ${u.type} ${u.name};`)
    .join("\n");

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es
precision highp float;

// Standard varyings
in vec4 v_color;
in vec4 v_id;
in float v_thickness;       // Edge body thickness
in float v_maxWidthFactor;  // Max width factor for geometry expansion
in float v_t;
in float v_tStart;
in float v_tEnd;
in float v_side;
in float v_antialiasingWidth;  // Anti-aliasing width (normalized: u_correctionRatio / thickness)
in vec2 v_source;
in vec2 v_target;
in float v_edgeLength;
in vec2 v_position;          // World position of the fragment

// Zone varyings
in float v_zone;            // 0=tail, 1=body, 2=head
in float v_zoneT;           // Position within zone [0,1]
in float v_headLengthRatio; // Head length as ratio of thickness (scaled for short edges)
in float v_tailLengthRatio; // Tail length as ratio of thickness (scaled for short edges)
in float v_headWidthRatio;  // Head width factor
in float v_tailWidthRatio;  // Tail width factor

// Path/filling attribute varyings (from vertex shader texture fetch)
${textureFetch.fragmentVaryingDeclarations}

// Standard uniforms (needed by some path types)
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_cameraAngle;

// Custom uniforms
${customUniforms}

// Fragment output (single target - picking handled via separate pass)
out vec4 fragColor;

// EdgeContext struct
struct EdgeContext {
  float t;                   // Position along path [0, 1]
  float sdf;                 // Signed distance from centerline
  vec2 position;             // World position
  vec2 tangent;              // Path tangent
  vec2 normal;               // Path normal
  float thickness;           // Edge thickness
  float aaWidth;             // Anti-aliasing width
  float edgeLength;          // Total path length
  float tStart;              // Clamped start t
  float tEnd;                // Clamped end t
  float distanceFromSource;  // Arc distance from source
  float distanceToTarget;    // Arc distance to target
};

EdgeContext context;

// Path functions (user-provided)
${path.glsl}

// Auto-generated tangent/normal (numerical differentiation from position)
${generateNumericalTangentNormal(pathName)}

// Auto-generated fallbacks for any missing path functions
${generatePathFallbacks(pathName, path.glsl)}

// Extremity SDF functions
${head.glsl}
${head.name !== tail.name ? tail.glsl : "// (tail uses same extremity as head)"}

// Filling function
${filling.glsl}

${
  !path.linearParameterization
    ? `// Helper: Compute arc length from t0 to t1 along the path using numerical integration
float computeArcLength(float t0, float t1, vec2 source, vec2 target, int samples) {
  float arcLen = 0.0;
  vec2 prev = path_${pathName}_position(t0, source, target);
  for (int i = 1; i <= samples; i++) {
    float t = t0 + (t1 - t0) * float(i) / float(samples);
    vec2 curr = path_${pathName}_position(t, source, target);
    arcLen += length(curr - prev);
    prev = curr;
  }
  return arcLen;
}`
    : ""
}

void main() {
  // Compute normalized t within visible edge (0 = start, 1 = end)
  float tNorm = (v_t - v_tStart) / max(v_tEnd - v_tStart, 0.0001);

  // Edge body half-thickness
  float halfThickness = v_thickness * 0.5;

  // Convert normalized AA width to webGL units (~1 pixel)
  float aaWidthWebGL = v_antialiasingWidth * v_thickness;

  // Distance from centerline based on v_side interpolation
  // Width is CONSTANT within each zone:
  // - Tail: v_tailWidthRatio (to contain full arrow shape)
  // - Body: 1.0
  // - Head: v_headWidthRatio (to contain full arrow shape)
  float zoneWidthFactor = v_zone < 0.5 ? v_tailWidthRatio :
                          v_zone < 1.5 ? 1.0 :
                          v_headWidthRatio;
  float halfGeometryWidth = halfThickness * zoneWidthFactor + aaWidthWebGL;
  float distFromCenter = abs(v_side) * halfGeometryWidth;

  // Populate EdgeContext (for filling function)
  context.t = tNorm;
  context.sdf = distFromCenter - halfThickness;
  context.position = path_${pathName}_position(v_t, v_source, v_target);
  context.tangent = path_${pathName}_tangent(v_t, v_source, v_target);
  context.normal = path_${pathName}_normal(v_t, v_source, v_target);
  context.thickness = v_thickness;
  context.aaWidth = aaWidthWebGL;
  context.edgeLength = v_edgeLength;
  context.tStart = v_tStart;
  context.tEnd = v_tEnd;
  // Compute arc distances
  // - Paths with custom geometry (generateConstantData) use position-based t via closest_t
  // - Paths with linearParameterization use direct linear formula
  // - Other paths use numerical integration for accurate arc distances
  float visibleLength = v_edgeLength * (v_tEnd - v_tStart);
  ${
    hasCustomConstantData
      ? `// Position-based t for paths with custom geometry (e.g., miter corners)
  float pathT = path_${pathName}_closest_t(v_position, v_source, v_target);
  float pathTNorm = clamp((pathT - v_tStart) / (v_tEnd - v_tStart), 0.0, 1.0);`
      : `// Interpolated t for standard parametric paths
  float pathT = v_t;
  float pathTNorm = tNorm;`
  }
  ${
    path.linearParameterization
      ? `// Linear parameterization: t maps directly to arc length
  context.distanceFromSource = pathTNorm * visibleLength;
  context.distanceToTarget = (1.0 - pathTNorm) * visibleLength;`
      : `// Non-linear parameterization: use numerical integration
  context.distanceFromSource = computeArcLength(v_tStart, pathT, v_source, v_target, 16);
  context.distanceToTarget = computeArcLength(pathT, v_tEnd, v_source, v_target, 16);`
  }

  // Compute SDF based on zone
  // For head/tail zones, we use SDF union (min) with the body near the BASE
  // to create seamless connection, but use extremity-only SDF near the TIP
  float bodySDF = distFromCenter - halfThickness;
  float finalSDF;

  // Base ratios: how far from base toward tip the union extends
  const float HEAD_BASE_RATIO = ${numberToGLSLFloat(head.baseRatio ?? 0.5)};
  const float TAIL_BASE_RATIO = ${numberToGLSLFloat(tail.baseRatio ?? 0.5)};

  if (v_zone < 0.5) {
    // TAIL ZONE: v_zoneT goes 0 (tip) to 1 (base)
    vec2 uv = vec2((1.0 - v_zoneT) * v_tailLengthRatio, v_side * v_tailWidthRatio * 0.5);
    float tailSDF = extremity_${tail.name}(uv, v_tailLengthRatio, v_tailWidthRatio) * v_thickness;

    // Apply union only near base (v_zoneT > 1 - baseRatio)
    if (v_zoneT > 1.0 - TAIL_BASE_RATIO) {
      finalSDF = min(tailSDF, bodySDF);
    } else {
      finalSDF = tailSDF;
    }
  } else if (v_zone < 1.5) {
    // BODY ZONE: distance from centerline
    finalSDF = bodySDF;
  } else {
    // HEAD ZONE: v_zoneT goes 0 (base) to 1 (tip)
    vec2 uv = vec2(v_zoneT * v_headLengthRatio, v_side * v_headWidthRatio * 0.5);
    float headSDF = extremity_${head.name}(uv, v_headLengthRatio, v_headWidthRatio) * v_thickness;

    // Apply union only near base (v_zoneT < baseRatio)
    if (v_zoneT < HEAD_BASE_RATIO) {
      finalSDF = min(headSDF, bodySDF);
    } else {
      finalSDF = headSDF;
    }
  }

  #ifdef PICKING_MODE
    // Picking pass: output edge ID for pixels inside edge
    if (finalSDF > 0.0) discard;
    fragColor = v_id;
  #else
    // Visual pass: anti-aliased edge with filling
    float alpha = smoothstep(aaWidthWebGL, -aaWidthWebGL, finalSDF);
    if (alpha < 0.01) discard;

    vec4 color = filling_${filling.name}(context);
    // Mix with transparent to fade both color AND alpha (pre-multiplied alpha for correct blending)
    fragColor = mix(vec4(0.0), color, alpha);
  #endif
}
`;

  return glsl;
}

/**
 * Generates constant data for a specific path/head/tail combination.
 */
function getConstantDataForCombination(
  path: EdgePath,
  head: EdgeExtremity,
  tail: EdgeExtremity,
): {
  data: number[][];
  attributes: Array<{ name: string; size: number; type: number }>;
  verticesPerEdge: number;
} {
  const hasHead = typeof head.length === "number" ? head.length > 0 : true;
  const hasTail = typeof tail.length === "number" ? tail.length > 0 : true;

  if (path.generateConstantData) {
    const custom = path.generateConstantData();
    return {
      data: custom.data,
      attributes: custom.attributes,
      verticesPerEdge: custom.verticesPerEdge,
    };
  }

  return generateZonedConstantData(path.segments, hasHead, hasTail);
}

/**
 * Main generator function that produces complete shader code and metadata.
 * Supports both single-path mode (backward compatible) and multi-path mode.
 */
export function generateEdgeShaders(options: EdgeShaderGenerationOptions): GeneratedEdgeShaders {
  const { paths, heads, tails, filling, isMultiMode: multiMode } = normalizeEdgeProgramOptions(options);

  if (multiMode) {
    // Multi-path mode: use selectors and generate per-combination metadata
    const vertexCountsPerCombination = new Map<string, number>();
    const constantDataPerCombination = new Map<string, number[][]>();

    // Generate constant data for all combinations
    for (const path of paths) {
      for (const head of heads) {
        for (const tail of tails) {
          const key = `${path.name}:${head.name}:${tail.name}`;
          const constantData = getConstantDataForCombination(path, head, tail);
          vertexCountsPerCombination.set(key, constantData.verticesPerEdge);
          constantDataPerCombination.set(key, constantData.data);
        }
      }
    }

    // Find the maximum vertex count across all combinations
    // This is used for instanced rendering where all edges need the same vertex count
    let maxVerticesPerEdge = 0;
    let maxConstantData: number[][] = [];
    for (const [, vertexCount] of vertexCountsPerCombination) {
      if (vertexCount > maxVerticesPerEdge) {
        maxVerticesPerEdge = vertexCount;
      }
    }
    // Find a combination with max vertices to use its constant data
    for (const [key, vertexCount] of vertexCountsPerCombination) {
      if (vertexCount === maxVerticesPerEdge) {
        maxConstantData = constantDataPerCombination.get(key)!;
        break;
      }
    }

    // For multi-path, we use zone-based constant data (3 attributes: zone, zoneT, side)
    // Paths with custom vertex processing (like step) will use zone-based in multi-mode
    // but their vertex GLSL can still reference a_vertexId if needed
    const multiModeConstantAttributes = [
      { name: "a_zone", size: 1, type: FLOAT },
      { name: "a_zoneT", size: 1, type: FLOAT },
      { name: "a_side", size: 1, type: FLOAT },
    ];

    return {
      vertexShader: generateVertexShaderMulti(paths, heads, tails, filling, multiModeConstantAttributes),
      fragmentShader: generateFragmentShaderMulti(paths, heads, tails, filling),
      uniforms: collectUniformsMulti(paths, heads, tails, filling),
      attributes: collectAttributesMulti(paths, heads, tails, filling),
      // In multi-path mode, use max vertices to accommodate all path types
      verticesPerEdge: maxVerticesPerEdge,
      constantData: maxConstantData,
      constantAttributes: multiModeConstantAttributes,
      // Multi-path specific fields
      vertexCountsPerCombination,
      constantDataPerCombination,
    };
  } else {
    // Single-path mode (backward compatible)
    const path = paths[0];
    const head = heads[0];
    const tail = tails[0];

    // Determine if extremities are present (length > 0)
    const hasHead = typeof head.length === "number" ? head.length > 0 : true;
    const hasTail = typeof tail.length === "number" ? tail.length > 0 : true;

    // Use custom constant data generator if provided, otherwise use zone-based default
    let constantData: {
      data: number[][];
      attributes: Array<{ name: string; size: number; type: number }>;
      verticesPerEdge: number;
    };

    if (path.generateConstantData) {
      const custom = path.generateConstantData();
      constantData = {
        data: custom.data,
        attributes: custom.attributes,
        verticesPerEdge: custom.verticesPerEdge,
      };
    } else {
      // Use zone-based constant data generation
      constantData = generateZonedConstantData(path.segments, hasHead, hasTail);
    }

    return {
      vertexShader: generateVertexShader(path, head, tail, filling, constantData.attributes),
      fragmentShader: generateFragmentShader(path, head, tail, filling),
      uniforms: collectUniforms(path, head, tail, filling),
      attributes: collectAttributes(path, head, tail, filling),
      verticesPerEdge: constantData.verticesPerEdge,
      constantData: constantData.data,
      constantAttributes: constantData.attributes,
    };
  }
}

/**
 * Collects all attributes needed for multi-path edge rendering.
 * Path/filling attributes are now stored in the edge path attribute texture,
 * so only core per-edge attributes are included in the vertex buffer.
 */
function collectAttributesMulti(
  _paths: EdgePath[],
  _heads: EdgeExtremity[],
  _tails: EdgeExtremity[],
  _filling: EdgeFilling,
): Array<{ name: string; size: number; type: number; normalized?: boolean }> {
  // Core per-edge attributes (path/filling attributes are in the attribute texture)
  return [
    // Edge index for texture lookup (used for both edge data and path attribute textures)
    { name: "a_edgeIndex", size: 1, type: FLOAT },
    { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
    { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true },
  ];
}
