/**
 * Sigma.js Shared GLSL Utilities
 * ===============================
 *
 * Common GLSL code snippets shared across shader generators (nodes, labels, backdrops).
 * @module
 */

import { LabelPosition } from "../types";

/**
 * Maps label position names to numeric values for shaders.
 */
export const POSITION_MODE_MAP: Record<LabelPosition, number> = {
  right: 0,
  left: 1,
  above: 2,
  below: 3,
  over: 4,
};

/**
 * Converts node size from graph coordinates to screen pixels.
 * Requires uniforms: u_matrix, u_correctionRatio, u_sizeRatio, u_resolution
 * Requires attribute: a_nodeSize
 */
export const GLSL_NODE_SIZE_TO_PIXELS = /*glsl*/ `
float matrixScaleX = length(vec2(u_matrix[0][0], u_matrix[1][0]));
float nodeRadiusGraphSpace = a_nodeSize * u_correctionRatio / u_sizeRatio * 2.0;
float nodeRadiusNDC = nodeRadiusGraphSpace * matrixScaleX;
float nodeRadiusPixels = nodeRadiusNDC * u_resolution.x / 2.0;
`;

export const GLSL_ROTATE_2D = /*glsl*/ `
mat2 rotate2D(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}
`;

/**
 * Get screen-space direction for label position mode.
 * Maps position mode (0-4) to direction vectors.
 * Directions use screen coordinates (Y-down).
 *
 * Position modes:
 *   0: right  → (1, 0)
 *   1: left   → (-1, 0)
 *   2: above  → (0, -1)
 *   3: below  → (0, 1)
 *   4: over   → (0, 0)
 */
export const GLSL_GET_LABEL_DIRECTION = /*glsl*/ `
vec2 getLabelDirection(float positionMode) {
  if (positionMode < 0.5) return vec2(1.0, 0.0);   // Right
  if (positionMode < 1.5) return vec2(-1.0, 0.0);  // Left
  if (positionMode < 2.5) return vec2(0.0, -1.0);  // Above
  if (positionMode < 3.5) return vec2(0.0, 1.0);   // Below
  return vec2(0.0);                                 // Over (centered)
}
`;

/**
 * SDF for an axis-aligned box.
 * Returns signed distance from point p to the box boundary.
 */
export const GLSL_SDF_BOX = /*glsl*/ `
float sdfBox(vec2 p, vec2 halfSize) {
  vec2 d = abs(p) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
`;

/**
 * SDF for a rotated box.
 * Rotates the point by -angle to align with the box, then computes box SDF.
 * Requires sdfBox to be defined before this.
 */
export const GLSL_SDF_ROTATED_BOX = /*glsl*/ `
float sdfRotatedBox(vec2 p, vec2 halfSize, float angle) {
  float c = cos(-angle);
  float s = sin(-angle);
  vec2 rotatedP = mat2(c, -s, s, c) * p;
  return sdfBox(rotatedP, halfSize);
}
`;

/**
 * SDF for an axis-aligned rounded box.
 * Shrinks box by radius, computes box SDF, subtracts radius.
 * When radius=0, equivalent to sdfBox.
 */
export const GLSL_SDF_ROUNDED_BOX = /*glsl*/ `
float sdfRoundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 d = abs(p) - halfSize + radius;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
}
`;

/**
 * SDF for a rotated rounded box.
 * Rotates the point by -angle to align with the box, then computes rounded box SDF.
 * Requires sdfRoundedBox to be defined before this.
 */
export const GLSL_SDF_ROUNDED_ROTATED_BOX = /*glsl*/ `
float sdfRoundedRotatedBox(vec2 p, vec2 halfSize, float angle, float radius) {
  float c = cos(-angle);
  float s = sin(-angle);
  vec2 rotatedP = mat2(c, -s, s, c) * p;
  return sdfRoundedBox(rotatedP, halfSize, radius);
}
`;

/** Generates findEdgeDistance GLSL function that finds shape edge via binary search. */
export function generateFindEdgeDistance(shapeCall: string, rotateWithCamera: boolean): string {
  if (rotateWithCamera) {
    return /*glsl*/ `
float findEdgeDistance(vec2 direction, float size) {
  // Counter-rotate for shapes that rotate with camera
  float c = cos(-u_cameraAngle);
  float s = sin(-u_cameraAngle);
  vec2 rotatedDir = mat2(c, -s, s, c) * direction;
  float lo = 0.0, hi = size * 1.5;
  for (int i = 0; i < 10; i++) {
    float mid = (lo + hi) * 0.5;
    vec2 uv = rotatedDir * mid;
    if (${shapeCall} < 0.0) lo = mid; else hi = mid;
  }
  return (lo + hi) * 0.5;
}
`;
  }

  return /*glsl*/ `
float findEdgeDistance(vec2 direction, float size) {
  float lo = 0.0, hi = size * 1.5;
  for (int i = 0; i < 10; i++) {
    float mid = (lo + hi) * 0.5;
    vec2 uv = direction * mid;
    if (${shapeCall} < 0.0) lo = mid; else hi = mid;
  }
  return (lo + hi) * 0.5;
}
`;
}
