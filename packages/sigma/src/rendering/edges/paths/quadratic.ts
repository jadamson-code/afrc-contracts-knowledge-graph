/**
 * Sigma.js Edge Path - Quadratic Bezier
 * =====================================
 *
 * Quadratic Bezier curve path for edges.
 * Renders curved edges using tessellation for efficient GPU rendering.
 *
 * @module
 */
import { EdgePath } from "../types";

/**
 * Options for quadratic path creation.
 */
export interface QuadraticPathOptions {
  /**
   * Number of segments to tessellate the curve.
   * Higher values = smoother curves but more vertices.
   * Default: 16
   */
  segments?: number;

  /**
   * Default curvature value if not provided per-edge.
   * Curvature determines how much the curve bends away from the straight line.
   * 0 = straight line, 0.5 = moderate curve, 1.0 = strong curve
   * Default: 0.25
   */
  defaultCurvature?: number;
}

/**
 * Creates a quadratic Bezier curve edge path.
 *
 * The curve is controlled by a single control point positioned perpendicular
 * to the midpoint of the straight line between source and target. The curvature
 * parameter controls how far this control point is from the midpoint.
 *
 * @param options - Path configuration
 * @returns EdgePath definition for quadratic Bezier curves
 *
 * @example
 * ```typescript
 * const EdgeCurvedProgram = createEdgeProgram({
 *   path: pathQuadratic({ segments: 16 }),
 *   head: extremityArrow(),
 *   tail: extremityNone(),
 *   filling: fillingPlain(),
 * });
 * ```
 */
export function pathQuadratic(options: QuadraticPathOptions = {}): EdgePath {
  const { segments = 16 } = options;

  // language=GLSL
  const glsl = /*glsl*/ `
// Compute control point from curvature
// Control point is placed perpendicular to the midpoint of source-target line
vec2 computeControlPoint(vec2 source, vec2 target, float curvature) {
  vec2 midpoint = 0.5 * (source + target);
  vec2 delta = target - source;
  // Perpendicular direction (rotated 90 degrees)
  vec2 perp = vec2(-delta.y, delta.x);
  float len = length(perp);
  if (len < 0.0001) return midpoint;
  perp = perp / len;
  // Offset by curvature * edge length
  return midpoint + perp * curvature * len;
}

// Position at parameter t ∈ [0, 1]
vec2 path_quadratic_position(float t, vec2 source, vec2 target) {
  float curvature = a_curvature;
  vec2 control = computeControlPoint(source, target, curvature);
  float u = 1.0 - t;
  return u * u * source + 2.0 * u * t * control + t * t * target;
}

// Derivative of quadratic Bezier (for tangent computation)
vec2 path_quadratic_derivative(float t, vec2 source, vec2 target) {
  float curvature = a_curvature;
  vec2 control = computeControlPoint(source, target, curvature);
  // B'(t) = 2(1-t)(P1-P0) + 2t(P2-P1)
  return 2.0 * (1.0 - t) * (control - source) + 2.0 * t * (target - control);
}

// Unit tangent at parameter t
vec2 path_quadratic_tangent(float t, vec2 source, vec2 target) {
  vec2 d = path_quadratic_derivative(t, source, target);
  float len = length(d);
  if (len < 0.0001) return normalize(target - source);
  return d / len;
}

// Unit normal at parameter t (perpendicular to tangent)
vec2 path_quadratic_normal(float t, vec2 source, vec2 target) {
  vec2 tang = path_quadratic_tangent(t, source, target);
  return vec2(-tang.y, tang.x);
}

// Approximate arc length using 5-point Gauss-Legendre quadrature
float path_quadratic_length(vec2 source, vec2 target) {
  // Gauss-Legendre 5-point weights and abscissae
  // Points: ±0.9061798459, ±0.5384693101, 0
  // Weights: 0.2369268850, 0.4786286705, 0.5688888889
  const float x1 = 0.9061798459;
  const float x2 = 0.5384693101;
  const float w1 = 0.2369268850;
  const float w2 = 0.4786286705;
  const float w3 = 0.5688888889;

  // Transform from [-1,1] to [0,1]: t = 0.5 * (x + 1)
  float t1a = 0.5 * (-x1 + 1.0);
  float t1b = 0.5 * (x1 + 1.0);
  float t2a = 0.5 * (-x2 + 1.0);
  float t2b = 0.5 * (x2 + 1.0);
  float t3 = 0.5;

  // Evaluate derivative magnitudes at sample points
  float d1a = length(path_quadratic_derivative(t1a, source, target));
  float d1b = length(path_quadratic_derivative(t1b, source, target));
  float d2a = length(path_quadratic_derivative(t2a, source, target));
  float d2b = length(path_quadratic_derivative(t2b, source, target));
  float d3 = length(path_quadratic_derivative(t3, source, target));

  // Sum weighted samples (factor of 0.5 for interval transformation)
  return 0.5 * (w1 * (d1a + d1b) + w2 * (d2a + d2b) + w3 * d3);
}

// Find parameter t for a given arc distance from source using binary search
float path_quadratic_t_at_distance(float targetDist, vec2 source, vec2 target) {
  if (targetDist <= 0.0) return 0.0;

  float totalLen = path_quadratic_length(source, target);
  if (targetDist >= totalLen) return 1.0;

  // Binary search for t
  float lo = 0.0, hi = 1.0;
  for (int i = 0; i < 12; i++) {
    float mid = 0.5 * (lo + hi);

    // Approximate arc length from 0 to mid using Simpson's rule
    float d0 = length(path_quadratic_derivative(0.0, source, target));
    float dMid2 = length(path_quadratic_derivative(mid * 0.5, source, target));
    float dMid = length(path_quadratic_derivative(mid, source, target));
    float arcLen = (mid / 6.0) * (d0 + 4.0 * dMid2 + dMid);

    if (arcLen < targetDist) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

// Find closest parameter t for a given point using sampling + refinement
float path_quadratic_closest_t(vec2 p, vec2 source, vec2 target) {
  // Coarse search
  float bestT = 0.0;
  float bestDist = 1e10;

  for (int i = 0; i <= 8; i++) {
    float t = float(i) / 8.0;
    vec2 pos = path_quadratic_position(t, source, target);
    float d = length(p - pos);
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }

  // Refine with binary search
  float lo = max(0.0, bestT - 0.125);
  float hi = min(1.0, bestT + 0.125);

  for (int i = 0; i < 8; i++) {
    float mid1 = lo + (hi - lo) / 3.0;
    float mid2 = hi - (hi - lo) / 3.0;

    float d1 = length(p - path_quadratic_position(mid1, source, target));
    float d2 = length(p - path_quadratic_position(mid2, source, target));

    if (d1 < d2) {
      hi = mid2;
    } else {
      lo = mid1;
    }
  }

  return 0.5 * (lo + hi);
}

// Signed distance from point p to the curve (approximate)
float path_quadratic_distance(vec2 p, vec2 source, vec2 target) {
  // Find closest point on curve using iterative search
  float closestT = path_quadratic_closest_t(p, source, target);
  vec2 closest = path_quadratic_position(closestT, source, target);
  vec2 diff = p - closest;
  float dist = length(diff);

  // Determine sign based on which side of the curve
  vec2 normal = path_quadratic_normal(closestT, source, target);
  return dist * sign(dot(diff, normal));
}
`;

  return {
    name: "quadratic",
    segments,
    glsl,
    vertexGlsl: "", // Uses the standard tessellation from generator
    uniforms: [],
    attributes: [
      { name: "a_curvature", size: 1, type: WebGL2RenderingContext.FLOAT },
    ],
  };
}
