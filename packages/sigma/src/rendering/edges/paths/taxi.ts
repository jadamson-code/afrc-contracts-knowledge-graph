/**
 * Sigma.js Edge Path - Taxi (Orthogonal)
 * ======================================
 *
 * Taxi path for edges that renders orthogonal (right-angle) connections.
 * The path connects nodes using only horizontal and vertical segments,
 * similar to how a taxi would navigate a city grid.
 *
 * This implementation uses exact geometry with perfect miter joins at corners,
 * achieved through custom generateConstantData().
 *
 * @module
 */
import { numberToGLSLFloat } from "../../utils";
import { EdgePath } from "../types";

/**
 * Options for taxi path creation.
 */
export interface TaxiPathOptions {
  /**
   * Path orientation preference.
   * - "horizontal": Always go horizontal first (H→V→H)
   * - "vertical": Always go vertical first (V→H→V)
   * - "automatic": Choose based on which delta is larger (abs(dx) vs abs(dy))
   * - number: Fixed angle in radians for the first/last segments
   * Default: "automatic"
   */
  orientation?: "horizontal" | "vertical" | "automatic" | number;

  /**
   * Whether edges rotate with camera or stay screen-aligned.
   * - false: Edges stay horizontal/vertical on screen
   * - true: Edges rotate with the graph (world-aligned)
   * Default: false
   */
  rotateWithCamera?: boolean;

  /**
   * Position of the middle segment as ratio [0-1].
   * 0 = at source, 0.5 = centered, 1 = at target.
   * Default: 0.5
   */
  offset?: number;
}

/**
 * Creates a taxi (orthogonal) edge path with sharp corners.
 *
 * The path consists of 3 segments with 2 90° corners, forming a Z-shape or
 * step pattern depending on the orientation. Corners have perfect miter joins.
 *
 * @param options - Path configuration
 * @returns EdgePath definition for taxi paths
 *
 * @example
 * ```typescript
 * const EdgeTaxiProgram = createEdgeProgram({
 *   path: pathTaxi({ orientation: "horizontal" }),
 *   head: extremityArrow(),
 *   tail: extremityNone(),
 *   filling: fillingPlain(),
 * });
 * ```
 */
export function pathTaxi(options: TaxiPathOptions = {}): EdgePath {
  const { orientation = "automatic", rotateWithCamera = false, offset = 0.5 } = options;

  // Determine orientation mode:
  // 0 = automatic, 1 = horizontal, 2 = vertical, 3 = fixed angle
  let orientationCode: number;
  let fixedAngle = 0;

  if (typeof orientation === "number") {
    orientationCode = 3;
    fixedAngle = orientation;
  } else if (orientation === "horizontal") {
    orientationCode = 1;
  } else if (orientation === "vertical") {
    orientationCode = 2;
  } else {
    orientationCode = 0;
  }

  // language=GLSL
  const glsl = /*glsl*/ `
// Taxi path constants (baked from options)
const float TAXI_OFFSET = ${numberToGLSLFloat(offset)};
const int TAXI_ORIENTATION = ${orientationCode};
const float TAXI_FIXED_ANGLE = ${numberToGLSLFloat(fixedAngle)};
const bool TAXI_ROTATE_WITH_CAMERA = ${rotateWithCamera ? "true" : "false"};
const float TAXI_SQRT2 = 1.41421356237;

// ============================================================================
// HELPER: Rotate a 2D vector by angle (counter-clockwise)
// ============================================================================
vec2 taxi_rotate(vec2 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// ============================================================================
// HELPER: Get taxi segment points (source, corner1, corner2, target)
// ============================================================================
void getTaxiSegmentPoints(vec2 source, vec2 target, out vec2 c1, out vec2 c2) {
  vec2 delta = target - source;

  // Determine orientation
  bool horizontalFirst;
  if (TAXI_ORIENTATION == 1) {
    horizontalFirst = true;
  } else if (TAXI_ORIENTATION == 2) {
    horizontalFirst = false;
  } else if (TAXI_ORIENTATION == 3) {
    // Fixed angle mode: first segment goes in fixed direction
    vec2 dir = vec2(cos(TAXI_FIXED_ANGLE), sin(TAXI_FIXED_ANGLE));
    float projLen = dot(delta, dir) * TAXI_OFFSET;
    c1 = source + dir * projLen;
    // Last segment goes in same fixed direction
    c2 = target - dir * (dot(delta, dir) * (1.0 - TAXI_OFFSET));
    return;
  } else {
    // Automatic: choose based on which delta is larger
    horizontalFirst = abs(delta.x) >= abs(delta.y);
  }

  if (horizontalFirst) {
    // H→V→H pattern
    float midX = source.x + delta.x * TAXI_OFFSET;
    c1 = vec2(midX, source.y);
    c2 = vec2(midX, target.y);
  } else {
    // V→H→V pattern
    float midY = source.y + delta.y * TAXI_OFFSET;
    c1 = vec2(source.x, midY);
    c2 = vec2(target.x, midY);
  }
}

// ============================================================================
// HELPER: Compute miter normal at corner between two segments
// Returns the normal direction and miter scale factor
// ============================================================================
vec2 taxi_miterNormal(vec2 dir1, vec2 dir2, float side) {
  // Normals for each segment
  vec2 n1 = vec2(-dir1.y, dir1.x);
  vec2 n2 = vec2(-dir2.y, dir2.x);

  // Miter is average of normals, normalized
  vec2 miter = normalize(n1 + n2);

  // Scale factor for 90° corner: 1/cos(45°) = sqrt(2)
  return miter * side * TAXI_SQRT2;
}

// ============================================================================
// POSITION - Core function for vertex placement
// ============================================================================
vec2 path_taxi_position(float t, vec2 source, vec2 target) {
  // Apply camera rotation if not rotating with camera
  vec2 src = source;
  vec2 tgt = target;
  if (!TAXI_ROTATE_WITH_CAMERA) {
    src = taxi_rotate(source, -u_cameraAngle);
    tgt = taxi_rotate(target, -u_cameraAngle);
  }

  vec2 delta = tgt - src;

  // Handle degenerate case (aligned nodes) -> straight line
  if (abs(delta.x) < 0.0001 || abs(delta.y) < 0.0001) {
    vec2 result = mix(src, tgt, t);
    if (!TAXI_ROTATE_WITH_CAMERA) {
      result = taxi_rotate(result, u_cameraAngle);
    }
    return result;
  }

  // Get segment points
  vec2 c1, c2;
  getTaxiSegmentPoints(src, tgt, c1, c2);

  // Compute segment lengths
  float L1 = length(c1 - src);
  float L2 = length(c2 - c1);
  float L3 = length(tgt - c2);
  float totalLen = L1 + L2 + L3;

  // Find position along path
  float dist = t * totalLen;
  vec2 result;

  if (dist <= L1) {
    float localT = dist / max(L1, 0.0001);
    result = mix(src, c1, localT);
  } else if (dist <= L1 + L2) {
    float localT = (dist - L1) / max(L2, 0.0001);
    result = mix(c1, c2, localT);
  } else {
    float localT = (dist - L1 - L2) / max(L3, 0.0001);
    result = mix(c2, tgt, localT);
  }

  // Rotate back to world space if needed
  if (!TAXI_ROTATE_WITH_CAMERA) {
    result = taxi_rotate(result, u_cameraAngle);
  }

  return result;
}

// ============================================================================
// TANGENT - Direction of travel
// ============================================================================
vec2 path_taxi_tangent(float t, vec2 source, vec2 target) {
  // Apply camera rotation if not rotating with camera
  vec2 src = source;
  vec2 tgt = target;
  if (!TAXI_ROTATE_WITH_CAMERA) {
    src = taxi_rotate(source, -u_cameraAngle);
    tgt = taxi_rotate(target, -u_cameraAngle);
  }

  vec2 delta = tgt - src;

  // Handle degenerate case
  if (abs(delta.x) < 0.0001 || abs(delta.y) < 0.0001) {
    vec2 tang = normalize(delta);
    if (!TAXI_ROTATE_WITH_CAMERA) {
      tang = taxi_rotate(tang, u_cameraAngle);
    }
    return tang;
  }

  vec2 c1, c2;
  getTaxiSegmentPoints(src, tgt, c1, c2);

  float L1 = length(c1 - src);
  float L2 = length(c2 - c1);
  float L3 = length(tgt - c2);
  float totalLen = L1 + L2 + L3;

  vec2 dir1 = normalize(c1 - src);
  vec2 dir2 = normalize(c2 - c1);
  vec2 dir3 = normalize(tgt - c2);

  float dist = t * totalLen;
  vec2 tang;

  if (dist < L1) {
    tang = dir1;
  } else if (dist < L1 + L2) {
    tang = dir2;
  } else {
    tang = dir3;
  }

  // Rotate back to world space if needed
  if (!TAXI_ROTATE_WITH_CAMERA) {
    tang = taxi_rotate(tang, u_cameraAngle);
  }

  return tang;
}

// ============================================================================
// NORMAL - Perpendicular to tangent (used in fragment shader for SDF)
// ============================================================================
vec2 path_taxi_normal(float t, vec2 source, vec2 target) {
  vec2 tang = path_taxi_tangent(t, source, target);
  return vec2(-tang.y, tang.x);
}

// ============================================================================
// LENGTH - Total path length
// ============================================================================
float path_taxi_length(vec2 source, vec2 target) {
  // Apply camera rotation if not rotating with camera
  vec2 src = source;
  vec2 tgt = target;
  if (!TAXI_ROTATE_WITH_CAMERA) {
    src = taxi_rotate(source, -u_cameraAngle);
    tgt = taxi_rotate(target, -u_cameraAngle);
  }

  vec2 delta = tgt - src;

  // Handle degenerate case
  if (abs(delta.x) < 0.0001 || abs(delta.y) < 0.0001) {
    return length(delta);
  }

  vec2 c1, c2;
  getTaxiSegmentPoints(src, tgt, c1, c2);

  return length(c1 - src) + length(c2 - c1) + length(tgt - c2);
}

// ============================================================================
// T_AT_DISTANCE - Find t for given arc distance
// ============================================================================
float path_taxi_t_at_distance(float d, vec2 source, vec2 target) {
  float totalLen = path_taxi_length(source, target);
  if (totalLen < 0.0001) return 0.0;
  return clamp(d / totalLen, 0.0, 1.0);
}

// ============================================================================
// CLOSEST_T - Find t for closest point on path (approximate)
// ============================================================================
float path_taxi_closest_t(vec2 p, vec2 source, vec2 target) {
  // Apply camera rotation if not rotating with camera
  vec2 pt = p;
  vec2 src = source;
  vec2 tgt = target;
  if (!TAXI_ROTATE_WITH_CAMERA) {
    pt = taxi_rotate(p, -u_cameraAngle);
    src = taxi_rotate(source, -u_cameraAngle);
    tgt = taxi_rotate(target, -u_cameraAngle);
  }

  vec2 delta = tgt - src;

  // Handle degenerate case
  if (abs(delta.x) < 0.0001 || abs(delta.y) < 0.0001) {
    vec2 ab = tgt - src;
    float len2 = dot(ab, ab);
    if (len2 < 0.0001) return 0.0;
    return clamp(dot(pt - src, ab) / len2, 0.0, 1.0);
  }

  vec2 c1, c2;
  getTaxiSegmentPoints(src, tgt, c1, c2);

  float L1 = length(c1 - src);
  float L2 = length(c2 - c1);
  float L3 = length(tgt - c2);
  float totalLen = L1 + L2 + L3;

  // Project onto each segment
  vec2 ab1 = c1 - src;
  vec2 ab2 = c2 - c1;
  vec2 ab3 = tgt - c2;

  float t1 = clamp(dot(pt - src, ab1) / max(dot(ab1, ab1), 0.0001), 0.0, 1.0);
  float t2 = clamp(dot(pt - c1, ab2) / max(dot(ab2, ab2), 0.0001), 0.0, 1.0);
  float t3 = clamp(dot(pt - c2, ab3) / max(dot(ab3, ab3), 0.0001), 0.0, 1.0);

  vec2 p1 = mix(src, c1, t1);
  vec2 p2 = mix(c1, c2, t2);
  vec2 p3 = mix(c2, tgt, t3);

  float d1 = length(pt - p1);
  float d2 = length(pt - p2);
  float d3 = length(pt - p3);

  if (d1 <= d2 && d1 <= d3) {
    return (t1 * L1) / totalLen;
  } else if (d2 <= d3) {
    return (L1 + t2 * L2) / totalLen;
  } else {
    return (L1 + L2 + t3 * L3) / totalLen;
  }
}

// ============================================================================
// DISTANCE - Signed distance from point to path
// ============================================================================
float path_taxi_distance(vec2 p, vec2 source, vec2 target) {
  float closestT = path_taxi_closest_t(p, source, target);
  vec2 closest = path_taxi_position(closestT, source, target);
  vec2 normal = path_taxi_normal(closestT, source, target);
  vec2 diff = p - closest;
  return length(diff) * sign(dot(diff, normal));
}
`;

  // Custom vertex GLSL for exact miter geometry
  // language=GLSL
  const vertexGlsl = /*glsl*/ `
// Taxi-specific vertex processing with exact miter geometry
// Attributes from generateConstantData:
// a_segment: which segment (0, 1, 2)
// a_localPos: position within segment (0 = start, 1 = end)
// a_side: -1 for left edge, +1 for right edge
// a_corner: 0 for regular vertex, 1 for corner vertex (needs miter)

void taxi_getVertexPosition(
  vec2 source, vec2 target,
  float tStart, float tEnd,
  float segment, float localPos, float side, float corner,
  float thickness, float aaWidth,
  out vec2 position, out vec2 normal, out float outT
) {
  // Apply camera rotation if not rotating with camera
  vec2 src = source;
  vec2 tgt = target;
  if (!TAXI_ROTATE_WITH_CAMERA) {
    src = taxi_rotate(source, -u_cameraAngle);
    tgt = taxi_rotate(target, -u_cameraAngle);
  }

  vec2 delta = tgt - src;
  float halfThickness = (thickness + aaWidth) * 0.5;

  // Get clamped start and end positions (where edge touches nodes)
  vec2 clampedStart = path_taxi_position(tStart, source, target);
  vec2 clampedEnd = path_taxi_position(tEnd, source, target);
  if (!TAXI_ROTATE_WITH_CAMERA) {
    clampedStart = taxi_rotate(clampedStart, -u_cameraAngle);
    clampedEnd = taxi_rotate(clampedEnd, -u_cameraAngle);
  }

  // Handle degenerate case (aligned nodes) -> straight line
  if (abs(delta.x) < 0.0001 || abs(delta.y) < 0.0001) {
    vec2 dir = normalize(delta);
    vec2 n = vec2(-dir.y, dir.x);
    float localT = (segment == 0.0) ? localPos * 0.333 :
                   (segment == 1.0) ? 0.333 + localPos * 0.334 :
                                      0.667 + localPos * 0.333;
    outT = mix(tStart, tEnd, localT);
    position = mix(clampedStart, clampedEnd, localT) + n * side * halfThickness;
    normal = n * side;
    if (!TAXI_ROTATE_WITH_CAMERA) {
      position = taxi_rotate(position, u_cameraAngle);
      normal = taxi_rotate(normal, u_cameraAngle);
    }
    return;
  }

  // Get segment points (corners)
  vec2 c1, c2;
  getTaxiSegmentPoints(src, tgt, c1, c2);

  // Compute segment lengths for t mapping
  float L1 = length(c1 - src);
  float L2 = length(c2 - c1);
  float L3 = length(tgt - c2);
  float totalLen = L1 + L2 + L3;

  // t values at corners
  float tCorner1 = L1 / totalLen;
  float tCorner2 = (L1 + L2) / totalLen;

  // Segment directions (using clamped positions for first/last)
  vec2 dir1 = normalize(c1 - clampedStart);
  vec2 dir2 = normalize(c2 - c1);
  vec2 dir3 = normalize(clampedEnd - c2);

  // Segment normals
  vec2 n1 = vec2(-dir1.y, dir1.x);
  vec2 n2 = vec2(-dir2.y, dir2.x);
  vec2 n3 = vec2(-dir3.y, dir3.x);

  vec2 pos;
  vec2 norm;

  if (segment < 0.5) {
    // Segment 0: clampedStart to corner1
    if (localPos < 0.5) {
      // Start of segment (clamped)
      pos = clampedStart;
      norm = n1;
      outT = tStart;
    } else {
      // End of segment (corner1)
      pos = c1;
      outT = mix(tStart, tEnd, (tCorner1 - tStart) / (1.0 - tStart - (1.0 - tEnd)));
      if (corner > 0.5) {
        norm = taxi_miterNormal(dir1, dir2, 1.0);
      } else {
        norm = n1;
      }
    }
  } else if (segment < 1.5) {
    // Segment 1: corner1 to corner2
    if (localPos < 0.5) {
      // Start of segment (corner1)
      pos = c1;
      outT = mix(tStart, tEnd, (tCorner1 - tStart) / (1.0 - tStart - (1.0 - tEnd)));
      if (corner > 0.5) {
        norm = taxi_miterNormal(dir1, dir2, 1.0);
      } else {
        norm = n2;
      }
    } else {
      // End of segment (corner2)
      pos = c2;
      outT = mix(tStart, tEnd, (tCorner2 - tStart) / (1.0 - tStart - (1.0 - tEnd)));
      if (corner > 0.5) {
        norm = taxi_miterNormal(dir2, dir3, 1.0);
      } else {
        norm = n2;
      }
    }
  } else {
    // Segment 2: corner2 to clampedEnd
    if (localPos < 0.5) {
      // Start of segment (corner2)
      pos = c2;
      outT = mix(tStart, tEnd, (tCorner2 - tStart) / (1.0 - tStart - (1.0 - tEnd)));
      if (corner > 0.5) {
        norm = taxi_miterNormal(dir2, dir3, 1.0);
      } else {
        norm = n3;
      }
    } else {
      // End of segment (clamped)
      pos = clampedEnd;
      norm = n3;
      outT = tEnd;
    }
  }

  position = pos + norm * side * halfThickness;
  normal = norm * sign(side);

  // Rotate back to world space if needed
  if (!TAXI_ROTATE_WITH_CAMERA) {
    position = taxi_rotate(position, u_cameraAngle);
    normal = taxi_rotate(normal, u_cameraAngle);
  }
}
`;

  /**
   * Generate constant vertex data for taxi path with exact miter geometry.
   * Uses triangle strip with 8 vertices forming 6 triangles.
   */
  function generateConstantData() {
    const FLOAT = WebGL2RenderingContext.FLOAT;

    // Triangle strip vertices for 3 segments with miter joins:
    // v0,v1: start of segment 0
    // v2,v3: corner1 (end of seg0 / start of seg1) with miter
    // v4,v5: corner2 (end of seg1 / start of seg2) with miter
    // v6,v7: end of segment 2
    //
    // Triangle strip: v0-v1-v2-v3-v4-v5-v6-v7
    // Forms triangles: (v0,v1,v2), (v1,v2,v3), (v2,v3,v4), (v3,v4,v5), (v4,v5,v6), (v5,v6,v7)

    const data: number[][] = [
      // [segment, localPos, side, corner]
      [0, 0, -1, 0], // v0: seg0 start, left
      [0, 0, 1, 0], // v1: seg0 start, right
      [0, 1, -1, 1], // v2: corner1, left miter
      [0, 1, 1, 1], // v3: corner1, right miter
      [2, 0, -1, 1], // v4: corner2, left miter (use seg2 to get dir2→dir3 miter)
      [2, 0, 1, 1], // v5: corner2, right miter
      [2, 1, -1, 0], // v6: seg2 end, left
      [2, 1, 1, 0], // v7: seg2 end, right
    ];

    return {
      data,
      attributes: [
        { name: "a_segment", size: 1, type: FLOAT },
        { name: "a_localPos", size: 1, type: FLOAT },
        { name: "a_side", size: 1, type: FLOAT },
        { name: "a_corner", size: 1, type: FLOAT },
      ],
      verticesPerEdge: 8,
    };
  }

  return {
    name: "taxi",
    segments: 1, // Not used when generateConstantData is provided
    glsl,
    vertexGlsl,
    uniforms: [],
    attributes: [],
    generateConstantData,
  };
}
