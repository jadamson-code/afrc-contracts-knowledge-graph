/**
 * Sigma.js Edge Shared GLSL Utilities
 * ====================================
 *
 * Common GLSL code generation functions shared between edge shaders and
 * edge label shaders. These functions generate GLSL code for:
 * - Binary search to find where path exits/enters nodes
 * - Thickness conversion between coordinate systems
 * - Extremity length computation
 * - Numerical tangent/normal computation from position
 *
 * @module
 */

/**
 * Generates GLSL for finding where the path exits the source node.
 * Uses binary search with node SDF to find the intersection point.
 *
 * Required uniforms: u_correctionRatio, u_sizeRatio
 * Required functions: path_{pathName}_position, path_{pathName}_length, querySDF
 *
 * @param pathName - Name of the path (e.g., "straight", "quadratic")
 * @returns GLSL function definition string
 */
export function generateFindSourceClampT(pathName: string): string {
  return /*glsl*/ `
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
`;
}

/**
 * Generates GLSL for finding where the path enters the target node.
 * Uses binary search with node SDF to find the intersection point.
 *
 * Required uniforms: u_correctionRatio, u_sizeRatio
 * Required functions: path_{pathName}_position, path_{pathName}_length, querySDF
 *
 * @param pathName - Name of the path (e.g., "straight", "quadratic")
 * @returns GLSL function definition string
 */
export function generateFindTargetClampT(pathName: string): string {
  return /*glsl*/ `
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
`;
}

/**
 * Generates GLSL code for converting thickness from graph units to WebGL units.
 * This is used both in edge shaders and edge label shaders.
 *
 * Required uniforms: u_minEdgeThickness, u_sizeRatio, u_correctionRatio
 * Required attribute: a_thickness
 *
 * Outputs:
 * - pixelsThickness: thickness in pixels
 * - webGLThickness: thickness in WebGL units
 *
 * @returns GLSL code snippet
 */
export function generateThicknessConversion(): string {
  return /*glsl*/ `
  // Convert thickness to WebGL units
  float minThickness = u_minEdgeThickness;
  float pixelsThickness = max(a_thickness, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;
`;
}

/**
 * Generates GLSL code for computing extremity lengths and handling short edges.
 * Produces bodyStartDist, bodyEndDist, and bodyLength in world units (WebGL coordinates).
 *
 * Required inputs:
 * - tStart, tEnd: clamped t values from findSourceClampT/findTargetClampT
 * - webGLThickness: from generateThicknessConversion
 * - pathLength: from path_{name}_length
 *
 * Required parameters (passed to the function):
 * - headLengthRatio, tailLengthRatio: extremity length as ratio of thickness
 * - minBodyLengthRatio: minimum body length as ratio of thickness
 *
 * Outputs:
 * - bodyStartDist: arc distance where body starts (after tail)
 * - bodyEndDist: arc distance where body ends (before head)
 * - bodyLength: length of the body in world units
 * - extremityScale: scale factor applied to extremities for short edges
 *
 * @returns GLSL code snippet
 */
export function generateExtremityLengthComputation(): string {
  return /*glsl*/ `
  // Compute path length and visible length
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

  // Compute body bounds in arc distance (world units)
  float bodyStartDist = tStart * pathLength + tailLength;
  float bodyEndDist = tEnd * pathLength - headLength;
  float bodyLength = max(bodyEndDist - bodyStartDist, 0.0);
`;
}

/**
 * Generates GLSL code for numerical tangent and normal computation.
 * Uses finite differences on the position function to derive tangent,
 * then perpendicular rotation to derive normal.
 *
 * This allows path authors to only implement the position function,
 * and get tangent/normal for free.
 *
 * @param pathName - Name of the path (e.g., "line", "curved")
 * @returns GLSL function definitions for tangent and normal
 */
export function generateNumericalTangentNormal(pathName: string): string {
  return `
// Auto-generated numerical tangent (from position via finite differences)
vec2 path_${pathName}_tangent(float t, vec2 source, vec2 target) {
  float epsilon = 0.001;
  float t1 = max(0.0, t - epsilon);
  float t2 = min(1.0, t + epsilon);
  vec2 p1 = path_${pathName}_position(t1, source, target);
  vec2 p2 = path_${pathName}_position(t2, source, target);
  return normalize(p2 - p1);
}

// Auto-generated normal (perpendicular to tangent)
vec2 path_${pathName}_normal(float t, vec2 source, vec2 target) {
  vec2 tangent = path_${pathName}_tangent(t, source, target);
  return vec2(-tangent.y, tangent.x);
}
`;
}
