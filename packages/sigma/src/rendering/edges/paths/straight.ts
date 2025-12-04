/**
 * Sigma.js Edge Path - Straight
 * ==============================
 *
 * Straight line path for edges.
 * This is the simplest path type, rendered as a quad.
 *
 * @module
 */
import { EdgePath } from "../types";

/**
 * Creates a straight line edge path.
 *
 * Straight edges are the most efficient, rendered as a single quad (6 vertices).
 * All path functions have closed-form solutions.
 *
 * @returns EdgePath definition for straight lines
 *
 * @example
 * ```typescript
 * const EdgeLineProgram = createEdgeProgram({
 *   path: pathStraight(),
 *   head: extremityNone(),
 *   tail: extremityNone(),
 *   filling: fillingPlain(),
 * });
 * ```
 */
export function pathStraight(): EdgePath {
  // language=GLSL
  const glsl = /*glsl*/ `
// Position at parameter t ∈ [0, 1]
vec2 path_straight_position(float t, vec2 source, vec2 target) {
  return mix(source, target, t);
}

// Unit tangent (constant along straight line)
vec2 path_straight_tangent(float t, vec2 source, vec2 target) {
  vec2 delta = target - source;
  float len = length(delta);
  if (len < 0.0001) return vec2(1.0, 0.0);
  return delta / len;
}

// Unit normal (perpendicular to tangent, constant along straight line)
vec2 path_straight_normal(float t, vec2 source, vec2 target) {
  vec2 tang = path_straight_tangent(t, source, target);
  return vec2(-tang.y, tang.x);
}

// Total length of the path
float path_straight_length(vec2 source, vec2 target) {
  return length(target - source);
}

// Signed distance from point p to the path
// Negative = left of path direction, Positive = right
float path_straight_distance(vec2 p, vec2 source, vec2 target) {
  vec2 pa = p - source;
  vec2 ba = target - source;
  float denom = dot(ba, ba);
  if (denom < 0.0001) return length(pa);
  float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  vec2 closest = source + ba * h;
  vec2 diff = p - closest;
  // Sign based on which side of the line (cross product)
  return sign(diff.x * ba.y - diff.y * ba.x) * length(diff);
}

// Find parameter t for a given arc distance from source
float path_straight_t_at_distance(float d, vec2 source, vec2 target) {
  float totalLen = path_straight_length(source, target);
  if (totalLen < 0.0001) return 0.0;
  return clamp(d / totalLen, 0.0, 1.0);
}

// Find closest parameter t for a given point
float path_straight_closest_t(vec2 p, vec2 source, vec2 target) {
  vec2 pa = p - source;
  vec2 ba = target - source;
  float denom = dot(ba, ba);
  if (denom < 0.0001) return 0.0;
  return clamp(dot(pa, ba) / denom, 0.0, 1.0);
}
`;

  return {
    name: "straight",
    segments: 1, // Simple quad
    minBodyLengthRatio: 0, // No minimum for straight edges
    linearParameterization: true, // t maps directly to arc distance
    glsl,
    vertexGlsl: "", // No special vertex logic needed for straight edges
    uniforms: [],
    attributes: [],
  };
}
