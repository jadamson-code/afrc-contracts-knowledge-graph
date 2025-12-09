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
import {
  generateFindSourceClampT,
  generateFindTargetClampT,
  generateNumericalTangentNormal,
} from "./shared-glsl";
import { AttributeSpecification, EdgeExtremity, EdgeFilling, EdgePath, GeneratedEdgeShaders } from "./types";

const { FLOAT, UNSIGNED_BYTE } = WebGL2RenderingContext;

// ============================================================================
// Attribute GLSL Generation Helpers
// ============================================================================

/**
 * Collects all custom attributes from path, head, tail, and filling.
 */
function collectAllCustomAttributes(
  path: EdgePath,
  head: EdgeExtremity,
  tail: EdgeExtremity,
  filling: EdgeFilling,
): AttributeSpecification[] {
  return [...path.attributes, ...head.attributes, ...tail.attributes, ...filling.attributes];
}

/**
 * Converts attribute size to GLSL type.
 */
function sizeToGlslType(size: number): string {
  return size === 1 ? "float" : `vec${size}`;
}

/**
 * Ensures attribute name has "a_" prefix.
 */
function ensureAttrPrefix(name: string): string {
  return name.startsWith("a_") ? name : `a_${name}`;
}

/**
 * Gets base name without "a_" prefix.
 */
function getBaseName(name: string): string {
  return name.startsWith("a_") ? name.slice(2) : name;
}

/**
 * Generates GLSL input declarations for custom attributes.
 */
function generateAttributeDeclarations(attributes: AttributeSpecification[]): string {
  return attributes
    .map((a) => `in ${sizeToGlslType(a.size)} ${ensureAttrPrefix(a.name)};`)
    .join("\n");
}

/**
 * Generates GLSL output varying declarations for custom attributes.
 */
function generateVaryingDeclarations(attributes: AttributeSpecification[], direction: "in" | "out"): string {
  return attributes
    .map((a) => `${direction} ${sizeToGlslType(a.size)} v_${getBaseName(a.name)};`)
    .join("\n");
}

/**
 * Generates GLSL assignments from attributes to varyings.
 */
function generateVaryingAssignments(attributes: AttributeSpecification[]): string {
  return attributes
    .map((a) => `  v_${getBaseName(a.name)} = ${ensureAttrPrefix(a.name)};`)
    .join("\n");
}

/**
 * Generates #define statements to map a_* attributes to v_* varyings.
 * This allows the same path GLSL to work in both vertex and fragment shaders.
 */
function generateAttributeDefines(attributes: AttributeSpecification[]): string {
  return attributes
    .map((a) => `#define ${ensureAttrPrefix(a.name)} v_${getBaseName(a.name)}`)
    .join("\n");
}

// ============================================================================
// Types
// ============================================================================

export interface EdgeShaderGenerationOptions {
  path: EdgePath;
  head: EdgeExtremity;
  tail: EdgeExtremity;
  filling: EdgeFilling;
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
 * Collects all attributes needed for edge rendering.
 */
function collectAttributes(
  path: EdgePath,
  head: EdgeExtremity,
  tail: EdgeExtremity,
  filling: EdgeFilling,
): AttributeSpecification[] {
  const attributes: AttributeSpecification[] = [
    // Standard edge attributes
    { name: "a_source", size: 2, type: FLOAT },
    { name: "a_target", size: 2, type: FLOAT },
    { name: "a_sourceSize", size: 1, type: FLOAT },
    { name: "a_targetSize", size: 1, type: FLOAT },
    { name: "a_sourceShapeId", size: 1, type: FLOAT },
    { name: "a_targetShapeId", size: 1, type: FLOAT },
    { name: "a_thickness", size: 1, type: FLOAT },
    { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
    { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true },
  ];

  // Add path-specific attributes
  path.attributes.forEach((attr) => {
    const name = attr.name.startsWith("a_") ? attr.name : `a_${attr.name}`;
    if (!attributes.find((a) => a.name === name)) {
      attributes.push({ ...attr, name });
    }
  });

  // Add extremity attributes
  [head, tail].forEach((extremity) => {
    extremity.attributes.forEach((attr) => {
      const name = attr.name.startsWith("a_") ? attr.name : `a_${attr.name}`;
      if (!attributes.find((a) => a.name === name)) {
        attributes.push({ ...attr, name });
      }
    });
  });

  // Add filling attributes
  filling.attributes.forEach((attr) => {
    const name = attr.name.startsWith("a_") ? attr.name : `a_${attr.name}`;
    if (!attributes.find((a) => a.name === name)) {
      attributes.push({ ...attr, name });
    }
  });

  return attributes;
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

  // Collect custom uniforms (not standard ones)
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

  // Collect all custom attributes and generate GLSL code
  const allCustomAttributes = collectAllCustomAttributes(path, head, tail, filling);
  const customAttributes = generateAttributeDeclarations(allCustomAttributes);
  const customVaryings = generateVaryingDeclarations(allCustomAttributes, "out");
  const varyingAssignments = generateVaryingAssignments(allCustomAttributes);

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
in vec2 a_source;       // Source node position
in vec2 a_target;       // Target node position
in float a_sourceSize;  // Source node size
in float a_targetSize;  // Target node size
in float a_sourceShapeId; // Source node shape ID
in float a_targetShapeId; // Target node shape ID
in float a_thickness;   // Edge thickness
in vec4 a_color;        // Edge color
in vec4 a_id;           // Edge ID for picking

// Custom attributes
${customAttributes}

// Standard uniforms
uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_cameraAngle;
uniform float u_minEdgeThickness;

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

// Custom varyings
${customVaryings}

const float bias = 255.0 / 254.0;

// Include all registered shape SDFs (with helper functions like rotate2D)
${getAllShapeGLSL()}

// Shape selector function
${generateShapeSelectorGLSL()}

// Path functions
${path.glsl}

// Auto-generated tangent/normal (numerical differentiation from position)
${generateNumericalTangentNormal(pathName)}

// Custom vertex processing (if any)
${path.vertexGlsl || ""}

// Binary search to find where path exits/enters a node.
// (Generated from shared-glsl.ts)
${generateFindSourceClampT(pathName)}
${generateFindTargetClampT(pathName)}

void main() {
  // Convert thickness to WebGL units
  float minThickness = u_minEdgeThickness;
  float pixelsThickness = max(a_thickness, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Find clamped t values (where edge starts/ends at node boundaries)
  float headMarginValue = ${headMargin};
  float tailMarginValue = ${tailMargin};

  // Extremity parameters
  float headLengthRatio = ${numberToGLSLFloat(head.length as number)};
  float tailLengthRatio = ${numberToGLSLFloat(tail.length as number)};
  float headWidthFactor = ${numberToGLSLFloat(head.widthFactor)};
  float tailWidthFactor = ${numberToGLSLFloat(tail.widthFactor)};
  float minBodyLengthRatio = ${numberToGLSLFloat(path.minBodyLengthRatio || 0)};

  // For extremityNone (length=0), skip clamping - edge goes to node center
  float tStart = tailLengthRatio > 0.0 ? findSourceClampT(a_source, a_sourceSize, int(a_sourceShapeId), a_target, tailMarginValue) : 0.0;
  float tEnd = headLengthRatio > 0.0 ? findTargetClampT(a_source, a_target, a_targetSize, int(a_targetShapeId), headMarginValue) : 1.0;

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

  // Pass custom varyings
${varyingAssignments}
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

  // Collect all custom attributes and generate GLSL code
  const allCustomAttributes = collectAllCustomAttributes(path, head, tail, filling);
  const customVaryings = generateVaryingDeclarations(allCustomAttributes, "in");
  const attributeDefines = generateAttributeDefines(allCustomAttributes);

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es
precision highp float;

// Map attribute names to varying names (so path GLSL works in fragment shader)
${attributeDefines}

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

// Custom varyings
${customVaryings}

// Standard uniforms (needed by some path types)
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_cameraAngle;

// Custom uniforms
${customUniforms}

// Multiple Render Targets outputs
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

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

// Path functions
${path.glsl}

// Auto-generated tangent/normal (numerical differentiation from position)
${generateNumericalTangentNormal(pathName)}

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

  // Anti-aliasing via smoothstep on SDF
  float alpha = smoothstep(aaWidthWebGL, -aaWidthWebGL, finalSDF);
  if (alpha < 0.01) discard;

  vec4 color = filling_${filling.name}(context);
  color.a *= alpha;
  fragColor = color;
  fragPicking = finalSDF > 0.0 ? transparent : v_id;
}
`;

  return glsl;
}

/**
 * Main generator function that produces complete shader code and metadata.
 */
export function generateEdgeShaders(options: EdgeShaderGenerationOptions): GeneratedEdgeShaders {
  const { path, head, tail, filling } = options;

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
