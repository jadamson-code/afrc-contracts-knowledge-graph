/**
 * Sigma.js Edge Programs - Type Definitions
 * ==========================================
 *
 * Types and interfaces for the composable edge program architecture.
 * This system separates path geometry, extremities (head/tail), and filling
 * to enable flexible edge rendering with single-pass WebGL drawing.
 *
 * @module
 */
import { Attributes } from "graphology-types";

import Sigma from "../../sigma";
import { LabelPosition } from "../../types";
import { AttributeSpecification, LabelFontOptions, UniformSpecification } from "../nodes";

export type { AttributeSpecification, UniformSpecification } from "../nodes/types";

/**
 * EdgePath - defines the geometry of an edge via GLSL functions.
 *
 * Each path type must provide GLSL functions for:
 * - Position at parameter t
 * - Tangent at parameter t
 * - Normal at parameter t
 * - Total path length
 * - Distance from point to path
 * - Parameter t at a given arc distance
 * - Closest t for a given point
 */
export interface EdgePath {
  /**
   * Unique identifier for this path type (e.g., "straight", "quadratic").
   * Used to generate GLSL function names: path_{name}_position, etc.
   */
  name: string;

  /**
   * Number of segments for vertex tessellation.
   * - 1 for straight edges (simple quad with 4 vertices)
   * - 8-16 for curved edges (triangle strip along curve)
   */
  segments: number;

  /**
   * GLSL code defining the path computation functions.
   *
   * Required functions (replace {name} with the path name):
   * - vec2 path_{name}_position(float t, vec2 source, vec2 target, ...)
   * - vec2 path_{name}_tangent(float t, vec2 source, vec2 target, ...)
   * - vec2 path_{name}_normal(float t, vec2 source, vec2 target, ...)
   * - float path_{name}_length(vec2 source, vec2 target, ...)
   * - float path_{name}_distance(vec2 p, vec2 source, vec2 target, ...)
   * - float path_{name}_t_at_distance(float d, vec2 source, vec2 target, ...)
   * - float path_{name}_closest_t(vec2 p, vec2 source, vec2 target, ...)
   *
   * The ... represents path-specific parameters (e.g., curvature for Bezier).
   */
  glsl: string;

  /**
   * GLSL code for vertex shader tessellation.
   * For curved paths, this generates the triangle strip vertices along the curve.
   */
  vertexGlsl: string;

  /**
   * Additional uniforms required by this path (e.g., curvature for Bezier).
   */
  uniforms: UniformSpecification[];

  /**
   * Additional per-edge attributes required by this path.
   */
  attributes: AttributeSpecification[];

  /**
   * Optional custom constant data generator for advanced tessellation.
   * If provided, overrides the default triangle strip generation.
   *
   * This is useful for paths with sharp corners (like taxi with cornerRadius=0)
   * where the default smooth parametric approach doesn't work well.
   *
   * The returned data should contain vertex attributes that the shader will use
   * to compute final positions. Standard attributes are [t, side] but custom
   * attributes can be added for special geometry (e.g., miter joins).
   */
  generateConstantData?: () => {
    /** Vertex data as array of attribute values per vertex */
    data: number[][];
    /** Attribute specifications for the vertex data */
    attributes: Array<{ name: string; size: number; type: number }>;
    /** Number of vertices per edge instance */
    verticesPerEdge: number;
  };

  /**
   * Minimum body length as a ratio of edge thickness.
   * Ensures the body zone has at least this length even when extremities are large.
   * Useful for paths with corners (taxi) to ensure corners stay in body zone.
   * Default: 0 (no minimum)
   */
  minBodyLengthRatio?: number;
}

/**
 * EdgeExtremity - defines head or tail decorations for edges.
 *
 * Extremities are rendered using SDF (Signed Distance Field) functions
 * in the fragment shader, allowing smooth anti-aliased rendering.
 */
export interface EdgeExtremity {
  /**
   * Unique identifier for this extremity type (e.g., "none", "arrow", "diamond").
   * Used to generate GLSL function names: extremity_{name}
   */
  name: string;

  /**
   * GLSL code defining the extremity SDF function.
   *
   * Function signature:
   *   float extremity_{name}(vec2 uv, ...)
   *
   * where uv is the local coordinate relative to the extremity center,
   * normalized so the edge thickness corresponds to [-0.5, 0.5] in the
   * perpendicular direction.
   *
   * Returns: signed distance (negative inside, positive outside)
   */
  glsl: string;

  /**
   * Length of the extremity beyond the edge body, relative to edge thickness.
   * Can be a constant or read from a per-edge attribute.
   *
   * For example, an arrow with lengthRatio=2.5 extends 2.5 * thickness
   * beyond where the edge body ends.
   */
  length: number | { attribute: string };

  /**
   * Width factor of the extremity relative to edge thickness.
   * Used to allocate vertex space for the extremity.
   *
   * For example, an arrow with widthFactor=2.0 needs 2x the edge thickness
   * in the perpendicular direction.
   */
  widthFactor: number;

  /**
   * Margin from node boundary in pixels.
   * The edge (including extremity) stops this many pixels away from the node.
   * Can be a constant or read from a per-edge attribute.
   */
  margin?: number | { attribute: string };

  /**
   * Ratio of the extremity length (from base toward tip) where the body SDF
   * union is applied for seamless anti-aliasing at the junction.
   *
   * - 0: No union (may cause gap at junction)
   * - 0.5: Union for first 50% of extremity (default)
   * - 1: Union for entire extremity (may affect tip shape)
   *
   * Default: 0.5
   */
  baseRatio?: number;

  /**
   * Additional uniforms required by this extremity.
   */
  uniforms: UniformSpecification[];

  /**
   * Additional per-edge attributes required by this extremity.
   */
  attributes: AttributeSpecification[];
}

/**
 * Context provided to edge lifecycle hooks.
 */
export interface EdgeLifecycleContext {
  /** WebGL2 rendering context */
  gl: WebGL2RenderingContext;

  /** Sigma renderer instance */
  renderer: {
    refresh: () => void;
  };

  /** Get uniform location from the current program */
  getUniformLocation: (name: string) => WebGLUniformLocation | null;

  /** Request shader regeneration */
  requestShaderRegeneration: () => void;

  /** Request a re-render */
  requestRefresh: () => void;
}

/**
 * Lifecycle hooks for edge fillings that need async resources.
 */
export interface EdgeLifecycleHooks {
  /**
   * Called after the program is initialized.
   */
  init?: () => void;

  /**
   * Called before each render.
   */
  beforeRender?: () => void;

  /**
   * Called when the filling's shader needs regeneration.
   */
  regenerate?: () => EdgeFilling;

  /**
   * Called when the program is destroyed.
   */
  kill?: () => void;

  /**
   * Returns data for special attribute sources.
   */
  getAttributeData?: (data: Record<string, unknown>, attributeSource: string) => number | number[] | null;
}

/**
 * EdgeFilling - defines the appearance of the edge body.
 *
 * Fillings determine how the edge body is colored/textured.
 * The simplest filling is plain solid color; more complex fillings
 * can implement dashes, gradients, or textures.
 */
export interface EdgeFilling {
  /**
   * Unique identifier for this filling type (e.g., "plain", "dashed", "gradient").
   * Used to generate GLSL function names: filling_{name}
   */
  name: string;

  /**
   * GLSL code defining the filling color function.
   *
   * Function signature:
   *   vec4 filling_{name}(EdgeContext ctx)
   *
   * The EdgeContext provides information about the current fragment:
   * - t: position along path [0, 1]
   * - sdf: signed distance from path centerline
   * - thickness: edge thickness
   * - edgeLength: total path length
   * - etc.
   *
   * Returns: RGBA color for this fragment
   */
  glsl: string;

  /**
   * Additional uniforms required by this filling.
   */
  uniforms: UniformSpecification[];

  /**
   * Additional per-edge attributes required by this filling.
   */
  attributes: AttributeSpecification[];

  /**
   * Optional lifecycle factory for fillings that need async resources.
   */
  lifecycle?: (context: EdgeLifecycleContext) => EdgeLifecycleHooks;
}

/**
 * EdgeContext - available to all edge GLSL functions.
 *
 * This struct is populated in the fragment shader and provides
 * information about the current fragment's position on the edge.
 *
 * GLSL definition:
 * ```glsl
 * struct EdgeContext {
 *   float t;                  // Position along path [0, 1]
 *   float sdf;                // Signed distance from centerline
 *   vec2 position;            // World position of fragment
 *   vec2 tangent;             // Path tangent at current point
 *   vec2 normal;              // Path normal at current point
 *   float thickness;          // Edge thickness in world units
 *   float aaWidth;            // Anti-aliasing width
 *   float edgeLength;         // Total path length
 *   float tStart;             // Where edge starts (after source node)
 *   float tEnd;               // Where edge ends (before target node)
 *   float distanceFromSource; // Arc distance from source
 *   float distanceToTarget;   // Arc distance to target
 * };
 * ```
 */
export interface EdgeContextFields {
  /** Position along path [0, 1] where 0 = source, 1 = target */
  t: "float";
  /** Signed distance from path centerline (negative = left, positive = right) */
  sdf: "float";
  /** World position of the current fragment */
  position: "vec2";
  /** Unit tangent vector at current position (direction of travel) */
  tangent: "vec2";
  /** Unit normal vector at current position (perpendicular to tangent) */
  normal: "vec2";
  /** Edge thickness in world units */
  thickness: "float";
  /** Anti-aliasing width in world units */
  aaWidth: "float";
  /** Total arc length of the edge path */
  edgeLength: "float";
  /** Parameter t where edge actually starts (after source node boundary) */
  tStart: "float";
  /** Parameter t where edge actually ends (before target node boundary) */
  tEnd: "float";
  /** Arc distance from source node boundary to current position */
  distanceFromSource: "float";
  /** Arc distance from current position to target node boundary */
  distanceToTarget: "float";
}

/**
 * Options for edge label rendering.
 */
export interface EdgeLabelOptions {
  /**
   * Label positioning mode:
   * - "midpoint": Label placed at edge midpoint, rotated to match edge angle
   * - "curve-following": Characters positioned individually along the path
   *
   * Default: "midpoint" for straight edges, "curve-following" for curved edges
   */
  mode?: "midpoint" | "curve-following";

  /**
   * Perpendicular offset from edge centerline in pixels.
   * Positive values offset above/left of the edge direction.
   * Default: half the edge thickness + small margin
   */
  offset?: number;

  /**
   * Font configuration for labels.
   */
  font?: LabelFontOptions;

  /**
   * Label color (CSS color string).
   * Default: "#000000"
   */
  color?: string;

  /**
   * Default label position relative to edge (for midpoint mode).
   * Default: "over" (centered on edge)
   */
  position?: LabelPosition;
}

/**
 * Options for creating an edge program via createEdgeProgram().
 */
export interface EdgeProgramOptions {
  /**
   * The path definition (geometry) for this edge type.
   */
  path: EdgePath;

  /**
   * The head extremity (target end decoration).
   */
  head: EdgeExtremity;

  /**
   * The tail extremity (source end decoration).
   */
  tail: EdgeExtremity;

  /**
   * The filling (body appearance) for this edge type.
   */
  filling: EdgeFilling;

  /**
   * Label configuration options.
   * If provided, a LabelProgram is automatically generated.
   */
  label?: EdgeLabelOptions;
}

/**
 * Generated shader metadata from the edge shader generator.
 */
export interface GeneratedEdgeShaders {
  /** Complete vertex shader source */
  vertexShader: string;
  /** Complete fragment shader source */
  fragmentShader: string;
  /** List of uniform names used */
  uniforms: string[];
  /** List of attribute specifications */
  attributes: Array<{ name: string; size: number; type: number }>;
  /** Number of vertices per edge instance */
  verticesPerEdge: number;
  /** Constant attribute data (for tessellation) */
  constantData: number[][];
  /** Constant attribute specification */
  constantAttributes: Array<{ name: string; size: number; type: number }>;
}

/**
 * Abstract base class interface for edge programs.
 */
export interface AbstractEdgeProgram {
  process(
    edgeIndex: number,
    offset: number,
    sourceData: Record<string, unknown>,
    targetData: Record<string, unknown>,
    data: Record<string, unknown>,
  ): void;
  render(params: Record<string, unknown>): void;
  reallocate(capacity: number): void;
  kill(): void;
}

/**
 * Type for an EdgeProgram class constructor.
 */
export type EdgeProgramType<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = {
  new (
    gl: WebGL2RenderingContext,
    pickingBuffer: WebGLFramebuffer | null,
    renderer: Sigma<N, E, G>,
  ): AbstractEdgeProgram;

  /** Static reference to the generated shaders */
  readonly generatedShaders?: GeneratedEdgeShaders;

  /** Static reference to the program options */
  readonly programOptions?: EdgeProgramOptions;

  /** Static reference to the associated LabelProgram (if labels enabled) */
  LabelProgram?: unknown;
};
