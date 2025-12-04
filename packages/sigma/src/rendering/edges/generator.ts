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
import { AttributeSpecification, EdgeExtremity, EdgeFilling, EdgePath, GeneratedEdgeShaders } from "./types";

const { FLOAT, UNSIGNED_BYTE } = WebGL2RenderingContext;

export interface EdgeShaderGenerationOptions {
  path: EdgePath;
  head: EdgeExtremity;
  tail: EdgeExtremity;
  filling: EdgeFilling;
}

/**
 * Generates constant vertex data for edge tessellation.
 * For straight edges (segments=1): 6 vertices forming 2 triangles
 * For curved edges (segments>1): 2*(segments+1) vertices forming a triangle strip
 *
 * @param segments - Number of segments for tessellation
 */
function generateConstantData(segments: number): {
  data: number[][];
  attributes: Array<{ name: string; size: number; type: number }>;
} {
  if (segments === 1) {
    // Simple quad: 6 vertices (2 triangles)
    // Each vertex has: [t, side] where t is position along edge and side is -1 or 1
    return {
      data: [
        [0, 1], // Source, top
        [0, -1], // Source, bottom
        [1, 1], // Target, top
        [1, 1], // Target, top
        [0, -1], // Source, bottom
        [1, -1], // Target, bottom
      ],
      attributes: [
        { name: "a_t", size: 1, type: FLOAT },
        { name: "a_side", size: 1, type: FLOAT },
      ],
    };
  }

  // Curved path: triangle strip along the curve
  // Vertices alternate: top, bottom, top, bottom...
  const data: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    data.push([t, 1]); // Top side
    data.push([t, -1]); // Bottom side
  }

  return {
    data,
    attributes: [
      { name: "a_t", size: 1, type: FLOAT },
      { name: "a_side", size: 1, type: FLOAT },
    ],
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
    "u_feather",
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
    "u_feather",
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

  // Collect custom attributes
  const customAttributes = [...path.attributes, ...head.attributes, ...tail.attributes, ...filling.attributes]
    .map((a) => {
      const glslType = a.size === 1 ? "float" : `vec${a.size}`;
      const name = a.name.startsWith("a_") ? a.name : `a_${a.name}`;
      return `in ${glslType} ${name};`;
    })
    .join("\n");

  // Generate varyings for custom attributes
  const customVaryings = [...path.attributes, ...head.attributes, ...tail.attributes, ...filling.attributes]
    .map((a) => {
      const glslType = a.size === 1 ? "float" : `vec${a.size}`;
      const baseName = a.name.startsWith("a_") ? a.name.slice(2) : a.name;
      return `out ${glslType} v_${baseName};`;
    })
    .join("\n");

  // Generate varying assignments
  const varyingAssignments = [...path.attributes, ...head.attributes, ...tail.attributes, ...filling.attributes]
    .map((a) => {
      const baseName = a.name.startsWith("a_") ? a.name.slice(2) : a.name;
      const attrName = a.name.startsWith("a_") ? a.name : `a_${a.name}`;
      return `  v_${baseName} = ${attrName};`;
    })
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
uniform float u_feather;
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
out float v_feather;
out vec2 v_source;
out vec2 v_target;
out float v_edgeLength;

// Custom varyings
${customVaryings}

const float bias = 255.0 / 254.0;

// Include all registered shape SDFs (with helper functions like rotate2D)
${getAllShapeGLSL()}

// Shape selector function
${generateShapeSelectorGLSL()}

// Path functions
${path.glsl}

// Custom vertex processing (if any)
${path.vertexGlsl || ""}

// Binary search to find where path exits/enters a node.
// Coordinate system: localPos is normalized so 1.0 = node quad boundary.
// effectiveSize accounts for AA width to match the visual node boundary.
float findSourceClampT(vec2 source, float sourceSize, int sourceShapeId, vec2 target, float margin) {
  float lo = 0.0, hi = 0.5;
  float nodeExtent = sourceSize * u_correctionRatio / u_sizeRatio * 2.0;
  float effectiveSize = 1.0 - u_correctionRatio / nodeExtent;

  for (int i = 0; i < 12; i++) {
    float mid = (lo + hi) * 0.5;
    vec2 pos = path_${pathName}_position(mid, source, target);
    vec2 localPos = (pos - source) / nodeExtent;
    float sdf = querySDF(sourceShapeId, localPos, effectiveSize);
    if (sdf < 0.0) lo = mid;
    else hi = mid;
  }

  float pathLen = path_${pathName}_length(source, target);
  float marginT = (margin * u_correctionRatio / u_sizeRatio) / pathLen;
  return (lo + hi) * 0.5 + marginT;
}

float findTargetClampT(vec2 source, vec2 target, float targetSize, int targetShapeId, float margin) {
  float lo = 0.5, hi = 1.0;
  float nodeExtent = targetSize * u_correctionRatio / u_sizeRatio * 2.0;
  float effectiveSize = 1.0 - u_correctionRatio / nodeExtent;

  for (int i = 0; i < 12; i++) {
    float mid = (lo + hi) * 0.5;
    vec2 pos = path_${pathName}_position(mid, source, target);
    vec2 localPos = (pos - target) / nodeExtent;
    float sdf = querySDF(targetShapeId, localPos, effectiveSize);
    if (sdf < 0.0) hi = mid;
    else lo = mid;
  }

  float pathLen = path_${pathName}_length(source, target);
  float marginT = (margin * u_correctionRatio / u_sizeRatio) / pathLen;
  return (lo + hi) * 0.5 - marginT;
}

void main() {
  // Convert thickness to WebGL units
  float minThickness = u_minEdgeThickness;
  float pixelsThickness = max(a_thickness, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Find clamped t values (where edge starts/ends at node boundaries)
  // Note: We only add the margin to the clamp, NOT the arrow length.
  // The arrow extends from the edge body to touch the node boundary.
  float headMarginValue = ${headMargin};
  float tailMarginValue = ${tailMargin};

  // For extremityNone (length=0), skip clamping - edge goes to node center
  float headLengthValue = ${numberToGLSLFloat(head.length as number)};
  float tailLengthValue = ${numberToGLSLFloat(tail.length as number)};

  float tStart = tailLengthValue > 0.0 ? findSourceClampT(a_source, a_sourceSize, int(a_sourceShapeId), a_target, tailMarginValue) : 0.0;
  float tEnd = headLengthValue > 0.0 ? findTargetClampT(a_source, a_target, a_targetSize, int(a_targetShapeId), headMarginValue) : 1.0;

  // Width factors for geometry expansion
  float headWidthFactor = ${numberToGLSLFloat(head.widthFactor)};
  float tailWidthFactor = ${numberToGLSLFloat(tail.widthFactor)};
  float widthFactor = max(headWidthFactor, tailWidthFactor);
  float featherWidth = u_feather * u_correctionRatio / u_sizeRatio;

  ${
    hasCustomConstantData
      ? `// Custom vertex processing for path with generateConstantData
  vec2 position;
  vec2 normal;
  float vertexT;
  ${pathName}_getVertexPosition(
    a_source, a_target,
    tStart, tEnd,
    a_segment, a_localPos, a_side, a_corner,
    webGLThickness * widthFactor, featherWidth,
    position, normal, vertexT
  );

  float t = vertexT;
  float side = a_side;`
      : `// Standard vertex processing
  // Remap a_t from [0,1] to [tStart, tEnd]
  float t = mix(tStart, tEnd, a_t);

  // Compute position on path
  vec2 pathPos = path_${pathName}_position(t, a_source, a_target);

  // Compute normal at this point
  vec2 normal = path_${pathName}_normal(t, a_source, a_target);

  // Compute offset from path centerline
  float halfThickness = webGLThickness * widthFactor * 0.5;
  vec2 offset = normal * (halfThickness + featherWidth) * a_side;

  // Final position
  vec2 position = pathPos + offset;
  float side = a_side;`
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
  v_feather = featherWidth;
  v_source = a_source;
  v_target = a_target;
  v_edgeLength = path_${pathName}_length(a_source, a_target);

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

  // Collect custom uniforms
  const standardUniforms = new Set([
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_zoomRatio",
    "u_pixelRatio",
    "u_cameraAngle",
    "u_feather",
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

  // Collect custom varyings
  const customVaryings = [...path.attributes, ...head.attributes, ...tail.attributes, ...filling.attributes]
    .map((a) => {
      const glslType = a.size === 1 ? "float" : `vec${a.size}`;
      const baseName = a.name.startsWith("a_") ? a.name.slice(2) : a.name;
      return `in ${glslType} v_${baseName};`;
    })
    .join("\n");

  // Generate #define statements to map a_* attributes to v_* varyings in fragment shader
  // This allows the same path GLSL to work in both vertex and fragment shaders
  const attributeDefines = [...path.attributes, ...head.attributes, ...tail.attributes, ...filling.attributes]
    .map((a) => {
      const attrName = a.name.startsWith("a_") ? a.name : `a_${a.name}`;
      const baseName = a.name.startsWith("a_") ? a.name.slice(2) : a.name;
      return `#define ${attrName} v_${baseName}`;
    })
    .join("\n");

  // Get head/tail length as GLSL expressions
  const headLength = typeof head.length === "number" ? numberToGLSLFloat(head.length) : `v_${head.length.attribute}`;
  const tailLength = typeof tail.length === "number" ? numberToGLSLFloat(tail.length) : `v_${tail.length.attribute}`;

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
in float v_feather;
in vec2 v_source;
in vec2 v_target;
in float v_edgeLength;

// Custom varyings
${customVaryings}

// Standard uniforms (needed by some path types like taxi)
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

// Extremity SDF functions
${head.glsl}
${head.name !== tail.name ? tail.glsl : "// (tail uses same extremity as head)"}

// Filling function
${filling.glsl}

void main() {
  // Compute normalized t within visible edge (0 = start, 1 = end)
  float tNorm = (v_t - v_tStart) / max(v_tEnd - v_tStart, 0.0001);

  // The geometry is expanded by v_maxWidthFactor to accommodate arrow width
  // v_side goes from -1 to +1 across this expanded geometry
  // So the actual distance from centerline is:
  float halfGeometryWidth = v_thickness * v_maxWidthFactor * 0.5;
  float distFromCenter = abs(v_side) * halfGeometryWidth;

  // Edge body half-thickness (the actual edge line width)
  float halfThickness = v_thickness * 0.5;

  // Populate EdgeContext
  context.t = tNorm;
  context.sdf = distFromCenter - halfThickness;
  context.position = path_${pathName}_position(v_t, v_source, v_target);
  context.tangent = path_${pathName}_tangent(v_t, v_source, v_target);
  context.normal = path_${pathName}_normal(v_t, v_source, v_target);
  context.thickness = v_thickness;
  context.aaWidth = v_feather;
  context.edgeLength = v_edgeLength;
  context.tStart = v_tStart;
  context.tEnd = v_tEnd;
  context.distanceFromSource = tNorm * v_edgeLength * (v_tEnd - v_tStart);
  context.distanceToTarget = (1.0 - tNorm) * v_edgeLength * (v_tEnd - v_tStart);

  // Get extremity parameters
  float headLengthRatio = ${headLength};
  float tailLengthRatio = ${tailLength};
  float headWidthRatio = ${numberToGLSLFloat(head.widthFactor)};
  float tailWidthRatio = ${numberToGLSLFloat(tail.widthFactor)};

  // Visible edge length in the same units as thickness
  float visibleLength = v_edgeLength * (v_tEnd - v_tStart);

  // Arrow length in world units (based on edge thickness)
  float headLength = headLengthRatio * v_thickness;
  float tailLength = tailLengthRatio * v_thickness;

  // Distance along the visible edge from source
  float distFromSource = tNorm * visibleLength;
  // Distance along the visible edge to target
  float distToTarget = (1.0 - tNorm) * visibleLength;

  // Default: edge body SDF (distance from centerline minus half thickness)
  float finalSDF = distFromCenter - halfThickness;

  // Check if we're in the head region (arrow at target)
  // The arrow occupies the last 'headLength' world units before the target
  if (distToTarget < headLength && headLengthRatio > 0.0) {
    // How far into the arrow are we? 0 = base, 1 = tip
    float arrowProgress = 1.0 - distToTarget / headLength;

    // Arrow half-width tapers from (headWidthRatio * halfThickness) at base to 0 at tip
    float arrowHalfWidth = halfThickness * headWidthRatio * (1.0 - arrowProgress);

    finalSDF = distFromCenter - arrowHalfWidth;
  }
  // Check if we're in the tail region (arrow at source)
  else if (distFromSource < tailLength && tailLengthRatio > 0.0) {
    // How far into the arrow are we? 0 = base, 1 = tip (pointing backward)
    float arrowProgress = 1.0 - distFromSource / tailLength;

    // Arrow half-width tapers from (tailWidthRatio * halfThickness) at base to 0 at tip
    float arrowHalfWidth = halfThickness * tailWidthRatio * (1.0 - arrowProgress);

    finalSDF = distFromCenter - arrowHalfWidth;
  }

  // Apply anti-aliasing
  float alpha = smoothstep(v_feather, -v_feather, finalSDF);

  // Discard fully transparent fragments
  if (alpha < 0.01) discard;

  // Get filling color
  vec4 fillColor = filling_${filling.name}(context);

  // Apply alpha
  vec4 color = fillColor;
  color.a *= alpha;

  // Output to render targets
  fragColor = color;

  // Picking (hard cutoff)
  if (finalSDF > 0.0) {
    fragPicking = transparent;
  } else {
    fragPicking = v_id;
  }
}
`;

  return glsl;
}

/**
 * Main generator function that produces complete shader code and metadata.
 */
export function generateEdgeShaders(options: EdgeShaderGenerationOptions): GeneratedEdgeShaders {
  const { path, head, tail, filling } = options;

  // Use custom constant data generator if provided, otherwise use default
  let constantData: { data: number[][]; attributes: Array<{ name: string; size: number; type: number }> };
  let verticesPerEdge: number;

  if (path.generateConstantData) {
    const custom = path.generateConstantData();
    constantData = { data: custom.data, attributes: custom.attributes };
    verticesPerEdge = custom.verticesPerEdge;
  } else {
    constantData = generateConstantData(path.segments);
    verticesPerEdge = path.segments === 1 ? 6 : 2 * (path.segments + 1);
  }

  return {
    vertexShader: generateVertexShader(path, head, tail, filling, constantData.attributes),
    fragmentShader: generateFragmentShader(path, head, tail, filling),
    uniforms: collectUniforms(path, head, tail, filling),
    attributes: collectAttributes(path, head, tail, filling),
    verticesPerEdge,
    constantData: constantData.data,
    constantAttributes: constantData.attributes,
  };
}
