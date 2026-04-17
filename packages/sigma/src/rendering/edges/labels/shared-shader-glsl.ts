/**
 * Sigma.js Edge Label Shared GLSL Helpers
 * ========================================
 *
 * GLSL generators and function bodies used by both the edge label program
 * (character SDF rendering) and the edge label background program (ribbon
 * rendering). Keeping them in one place ensures the two programs agree on
 * body bounds, visibility ramp, and perpendicular offset by position mode
 * — any drift there would misalign the background with its label.
 *
 * Consumers splice the GLSL strings into their vertex shader *after* the
 * path dispatch block (which declares `queryFindSourceClampT`,
 * `queryFindTargetClampT`, `queryPathLength`, etc.).
 *
 * @module
 */
import { numberToGLSLFloat } from "../../utils";
import { generateFindSourceClampT, generateFindTargetClampT } from "../shared-glsl";
import type { EdgePath } from "../types";

/**
 * Generates a path selector function for multi-path support. Creates a
 * switch statement that dispatches to the correct path function by pathId.
 */
export function generatePathSelector(
  paths: EdgePath[],
  queryName: string,
  pathFunc: string,
  returnType: string,
  params: string,
  args: string,
): string {
  if (paths.length === 1) {
    return `${returnType} ${queryName}(int pathId, ${params}) {
  return path_${paths[0].name}_${pathFunc}(${args});
}`;
  }

  const cases = paths.map((p, i) => `    case ${i}: return path_${p.name}_${pathFunc}(${args});`).join("\n");

  return `${returnType} ${queryName}(int pathId, ${params}) {
  switch (pathId) {
${cases}
    default: return path_${paths[0].name}_${pathFunc}(${args});
  }
}`;
}

/**
 * Generates all clamp T functions and their selectors for multi-path support.
 * Declares `findSourceClampT_<name>` / `findTargetClampT_<name>` for each path,
 * then wraps them in `queryFindSourceClampT` / `queryFindTargetClampT`.
 */
export function generateAllClampFunctions(paths: EdgePath[]): string {
  const clampFunctions = paths
    .map((p) => `${generateFindSourceClampT(p.name)}\n${generateFindTargetClampT(p.name)}`)
    .join("\n\n");

  if (paths.length === 1) {
    return `${clampFunctions}

float queryFindSourceClampT(int pathId, vec2 source, float sourceSize, int sourceShapeId, vec2 target, float margin) {
  return findSourceClampT_${paths[0].name}(source, sourceSize, sourceShapeId, target, margin);
}

float queryFindTargetClampT(int pathId, vec2 source, vec2 target, float targetSize, int targetShapeId, float margin) {
  return findTargetClampT_${paths[0].name}(source, target, targetSize, targetShapeId, margin);
}`;
  }

  const srcCases = paths
    .map(
      (p, i) => `    case ${i}: return findSourceClampT_${p.name}(source, sourceSize, sourceShapeId, target, margin);`,
    )
    .join("\n");
  const tgtCases = paths
    .map(
      (p, i) => `    case ${i}: return findTargetClampT_${p.name}(source, target, targetSize, targetShapeId, margin);`,
    )
    .join("\n");

  return `${clampFunctions}

float queryFindSourceClampT(int pathId, vec2 source, float sourceSize, int sourceShapeId, vec2 target, float margin) {
  switch (pathId) {
${srcCases}
    default: return findSourceClampT_${paths[0].name}(source, sourceSize, sourceShapeId, target, margin);
  }
}

float queryFindTargetClampT(int pathId, vec2 source, vec2 target, float targetSize, int targetShapeId, float margin) {
  switch (pathId) {
${tgtCases}
    default: return findTargetClampT_${paths[0].name}(source, target, targetSize, targetShapeId, margin);
  }
}`;
}

/**
 * Body-bounds helper in WebGL units: finds where the path exits the source
 * node, enters the target node, then shrinks by head/tail extremities.
 * Depends on `queryFindSourceClampT`, `queryFindTargetClampT`, `queryPathLength`.
 *
 * Returns (bodyStartDist, bodyEndDist, bodyLength).
 */
export const EDGE_LABEL_BODY_BOUNDS_GLSL = /*glsl*/ `
vec3 computeEdgeLabelBodyBounds(
  int pathId,
  vec2 source, float sourceSize, int sourceShapeId,
  vec2 target, float targetSize, int targetShapeId,
  float webGLThickness, float headLengthRatio, float tailLengthRatio
) {
  float tStart = queryFindSourceClampT(pathId, source, sourceSize, sourceShapeId, target, 0.0);
  float tEnd = queryFindTargetClampT(pathId, source, target, targetSize, targetShapeId, 0.0);
  float pathLength = queryPathLength(pathId, source, target);
  float visibleLength = pathLength * (tEnd - tStart);

  float headLength = headLengthRatio * webGLThickness;
  float tailLength = tailLengthRatio * webGLThickness;
  float totalNeededLength = headLength + tailLength;
  if (totalNeededLength > visibleLength && totalNeededLength > 0.0001) {
    float extremityScale = visibleLength / totalNeededLength;
    headLength *= extremityScale;
    tailLength *= extremityScale;
  }

  float bodyStartDist = tStart * pathLength + tailLength;
  float bodyEndDist = tEnd * pathLength - headLength;
  return vec3(bodyStartDist, bodyEndDist, max(bodyEndDist - bodyStartDist, 0.0));
}
`;

/**
 * Alpha ramp based on how much of the label fits inside the edge body.
 * Below `minVis`: hidden. Above `fullVis`: opaque. Between: linear fade.
 */
export function generateEdgeLabelAlphaGlsl(minVisibilityThreshold: number, fullVisibilityThreshold: number): string {
  const minVis = numberToGLSLFloat(minVisibilityThreshold);
  const fullVis = numberToGLSLFloat(fullVisibilityThreshold);
  return /*glsl*/ `
float computeEdgeLabelAlpha(float bodyLength, float textWidthWebGL) {
  float ratio = textWidthWebGL > 0.0001 ? min(bodyLength / textWidthWebGL, 1.0) : 1.0;
  if (ratio < ${minVis}) return 0.0;
  if (ratio < ${fullVis}) return (ratio - ${minVis}) / (${fullVis} - ${minVis});
  return 1.0;
}
`;
}

/**
 * Perpendicular offset per position mode: 0=over, 1=above, 2=below, 3=auto.
 * "auto" picks above/below based on source/target screen-X ordering.
 */
export const EDGE_LABEL_PERP_OFFSET_GLSL = /*glsl*/ `
float computeEdgeLabelPerpOffset(
  float positionMode,
  float halfThickness, float marginWebGL, float halfTextHeight,
  vec2 source, vec2 target, mat3 matrix
) {
  float magnitude = halfThickness + marginWebGL + halfTextHeight;
  if (positionMode == 1.0) return magnitude;
  if (positionMode == 2.0) return -magnitude;
  if (positionMode == 3.0) {
    vec3 sc = matrix * vec3(source, 1.0);
    vec3 tc = matrix * vec3(target, 1.0);
    return sc.x < tc.x ? magnitude : -magnitude;
  }
  return 0.0;
}
`;
