/**
 * Sigma.js v4 Primitives API - Type Definitions
 * ==============================================
 *
 * This file defines the types for the "primitives" part of the new API.
 * Primitives declare rendering capabilities: shapes, paths, layers, and
 * the custom graphic variables they expose.
 *
 * @module
 */

// =============================================================================
// PART 1: GRAPHIC VARIABLE DEFINITIONS
// =============================================================================

/**
 * Supported types for graphic variables.
 */
export type GraphicVariableType = "number" | "string" | "color" | "boolean";

/**
 * Definition of a custom graphic variable exposed by a layer.
 */
export interface GraphicVariableDefinition<T = unknown> {
  /** The type of this variable (for validation and type inference) */
  type: GraphicVariableType;
  /** Default value when not specified in styles */
  default: T;
}

/**
 * Map of variable names to their definitions.
 */
export type VariablesDefinition = Record<string, GraphicVariableDefinition>;

// =============================================================================
// PART 2: NODE SHAPES
// =============================================================================

/**
 * Built-in node shape names.
 *
 * TODO:
 * Deduce this type from the actual shapes exported from ../rendering/nodes/shapes
 */
export type BuiltInNodeShape = "circle" | "square" | "triangle" | "diamond";

/**
 * Custom shape definition (for advanced users).
 * This mirrors the SDFShape interface from rendering.
 */
export interface CustomNodeShape {
  /** Unique identifier for this shape */
  name: string;
  /** GLSL code for the SDF function */
  glsl: string;
  /** Ratio of inradius to circumradius */
  inradiusFactor?: number;
}

/**
 * Shape specification: built-in name or custom shape.
 */
export type NodeShapeSpec = BuiltInNodeShape | CustomNodeShape;

// =============================================================================
// PART 3: NODE LAYERS
// =============================================================================

/**
 * Built-in node layer type names.
 *
 * TODO:
 * Deduce this type from the actual layers exported from ../rendering/nodes/layers
 */
export type BuiltInNodeLayerType = "fill" | "border" | "image";

/**
 * Fill layer configuration (declarative).
 * Uses the built-in "color" variable by default.
 */
export interface FillLayerConfig {
  type: "fill";
  /** Variable name for fill color (defaults to "color") */
  color?: string;
}

/**
 * Mode for border size specification.
 * - "relative": Size is a fraction of the shape size (0.0 to 1.0)
 * - "pixels": Size is in screen pixels
 */
export type BorderSizeMode = "relative" | "pixels";

/**
 * Border specification within a BorderLayerConfig.
 * Supports both simple (single variable) and advanced (multiple borders) configurations.
 */
export interface BorderSpec {
  /** Variable name for border size, or fixed value */
  size: string | number;
  /** Variable name for border color, or fixed color, or "transparent" */
  color: string | "transparent";
  /** Size mode: "relative" (fraction of shape) or "pixels" (screen pixels) */
  mode?: BorderSizeMode;
  /** If true, this border fills remaining space (for innermost border) */
  fill?: boolean;
}

/**
 * Border layer configuration (declarative).
 * Supports single border (simple) or multiple stacked borders (advanced).
 *
 * Simple usage:
 *   { type: "border", size: "borderSize", color: "borderColor" }
 *
 * Advanced usage (multiple borders):
 *   { type: "border", borders: [
 *     { size: 0.1, color: "borderColor" },
 *     { fill: true, color: "color" }
 *   ]}
 */
export interface BorderLayerConfig {
  type: "border";
  /** Variable name for border size (simple mode) */
  size?: string | number;
  /** Variable name for border color (simple mode) */
  color?: string;
  /** Size mode for simple mode */
  mode?: BorderSizeMode;
  /** Array of border definitions for advanced multi-border mode */
  borders?: BorderSpec[];
}

/**
 * Drawing mode for image layer.
 * - "image": Image is rendered as-is (transparent pixels show through)
 * - "color": Image pixels are colorized with the node color (for pictograms/icons)
 */
export type ImageDrawingMode = "image" | "color";

/**
 * Image layer configuration (declarative).
 * Renders images inside nodes with optional padding and colorization.
 */
export interface ImageLayerConfig {
  type: "image";
  /**
   * Variable name for image URL.
   * Defaults to "image".
   */
  url?: string;
  /**
   * Drawing mode:
   * - "image": Render image as-is
   * - "color": Colorize image with node color (for pictograms)
   * Defaults to "image".
   */
  drawingMode?: ImageDrawingMode;
  /**
   * Padding around the image (0-1, as fraction of node size).
   * Defaults to 0.
   */
  padding?: number;
  /**
   * Variable name for color in "color" drawing mode.
   * Defaults to "color".
   */
  color?: string;
}

/**
 * Declarative node layer configuration.
 *
 * TODO:
 * Deduce this type from the actual layers exported from ../rendering/nodes/layers
 */
export type DeclarativeNodeLayer = FillLayerConfig | BorderLayerConfig | ImageLayerConfig;

/**
 * Custom layer definition (for advanced users).
 * This mirrors the FragmentLayer interface from rendering.
 */
export interface CustomNodeLayer {
  /** Unique identifier for this layer */
  name: string;
  /** GLSL code for the layer function */
  glsl: string;
  /** Variables this layer exposes */
  graphicVariables: readonly GraphicVariableDefinition[];
}

/**
 * Node layer specification:
 * - string: shorthand for built-in layer with defaults (e.g., "fill")
 * - DeclarativeNodeLayer: declarative configuration for built-in layers
 * - CustomNodeLayer: fully custom layer
 */
export type NodeLayerSpec = BuiltInNodeLayerType | DeclarativeNodeLayer | CustomNodeLayer;

// =============================================================================
// PART 4: EDGE PATHS
// =============================================================================

/**
 * Built-in edge path names.
 *
 * TODO:
 * Deduce this type from the actual paths exported from ../rendering/edges/paths
 */
export type BuiltInEdgePath = "straight" | "curved" | "step" | "step-curved";

/**
 * Custom path definition (for advanced users).
 */
export interface CustomEdgePath {
  /** Unique identifier for this path */
  name: string;
  /** Number of segments for tessellation */
  segments: number;
  /** GLSL code for path functions */
  glsl: string;
  /** Variables this path uses */
  graphicVariables?: readonly GraphicVariableDefinition[];
}

/**
 * Edge path specification: built-in name or custom path.
 */
export type EdgePathSpec = BuiltInEdgePath | CustomEdgePath;

// =============================================================================
// PART 5: EDGE EXTREMITIES
// =============================================================================

/**
 * Built-in edge extremity names.
 *
 * TODO:
 * Deduce this type from the actual extremity shapes exported from ../rendering/edges/extremities
 */
export type BuiltInEdgeExtremity = "none" | "arrow";

/**
 * Custom extremity definition (for advanced users).
 */
export interface CustomEdgeExtremity {
  /** Unique identifier for this extremity */
  name: string;
  /** GLSL code for the extremity SDF */
  glsl: string;
  /** Length ratio relative to edge thickness */
  length: number;
  /** Width factor relative to edge thickness */
  widthFactor: number;
}

/**
 * Edge extremity specification: built-in name or custom extremity.
 */
export type EdgeExtremitySpec = BuiltInEdgeExtremity | CustomEdgeExtremity;

// =============================================================================
// PART 6: EDGE LAYERS
// =============================================================================

/**
 * Built-in edge layer type names.
 *
 * TODO:
 * Deduce this type from the actual layers exported from ../rendering/edges/layers
 */
export type BuiltInEdgeLayerType = "plain" | "dashed";

/**
 * Plain edge layer configuration (declarative).
 */
export interface PlainEdgeLayerConfig {
  type: "plain";
  /** Variable name for edge color (defaults to "color") */
  color?: string;
}

/**
 * Dashed edge layer configuration (declarative).
 */
export interface DashedEdgeLayerConfig {
  type: "dashed";
  /** Variable name for dash size */
  dashSize: string;
  /** Variable name for gap size */
  gapSize: string;
  /** Variable name for dash color (optional, defaults to edge color) */
  dashColor?: string;
}

/**
 * Declarative edge layer configuration.
 *
 * TODO:
 * Deduce this type from the actual layers exported from ../rendering/edges/layers
 */
export type DeclarativeEdgeLayer = PlainEdgeLayerConfig | DashedEdgeLayerConfig;

/**
 * Custom edge layer definition (for advanced users).
 */
export interface CustomEdgeLayer {
  /** Unique identifier for this layer */
  name: string;
  /** GLSL code for the layer function */
  glsl: string;
  /** Variables this layer exposes */
  graphicVariables: readonly GraphicVariableDefinition[];
}

/**
 * Edge layer specification:
 * - string: shorthand for built-in layer with defaults (e.g., "plain")
 * - DeclarativeEdgeLayer: declarative configuration for built-in layers
 * - CustomEdgeLayer: fully custom layer
 */
export type EdgeLayerSpec = BuiltInEdgeLayerType | DeclarativeEdgeLayer | CustomEdgeLayer;

// =============================================================================
// PART 7: NODE PRIMITIVES
// =============================================================================

/**
 * Node primitives declaration.
 * Defines available shapes, layers, and custom graphic variables.
 */
export interface NodePrimitives {
  /**
   * Available shapes for nodes.
   * Default: ["circle"]
   */
  shapes?: readonly NodeShapeSpec[] | NodeShapeSpec[];

  /**
   * Custom graphic variables exposed by layers.
   * Built-in variables (color, size, etc.) don't need to be declared.
   */
  variables?: VariablesDefinition;

  /**
   * Layers that compose the node appearance.
   * Rendered in order (first = bottom, last = top).
   * Default: ["fill"]
   */
  layers?: readonly NodeLayerSpec[] | NodeLayerSpec[];
}

// =============================================================================
// PART 8: EDGE PRIMITIVES
// =============================================================================

/**
 * Edge primitives declaration.
 * Defines available paths, extremities, layers, and custom graphic variables.
 */
export interface EdgePrimitives {
  /**
   * Available paths for edges.
   * Default: ["straight"]
   */
  paths?: readonly EdgePathSpec[] | EdgePathSpec[];

  /**
   * Available extremities for edge heads/tails.
   * "none" is always implicitly available.
   * Default: ["none"]
   */
  extremities?: readonly EdgeExtremitySpec[] | EdgeExtremitySpec[];

  /**
   * Custom graphic variables exposed by layers.
   * Built-in variables (color, size, etc.) don't need to be declared.
   */
  variables?: VariablesDefinition;

  /**
   * Layers that compose the edge appearance.
   * Rendered in order (first = bottom, last = top).
   * Default: ["plain"]
   */
  layers?: readonly EdgeLayerSpec[] | EdgeLayerSpec[];
}

// =============================================================================
// PART 9: COMPLETE PRIMITIVES DECLARATION
// =============================================================================

/**
 * Complete primitives declaration.
 * Defines all rendering capabilities for the sigma instance.
 */
export interface PrimitivesDeclaration {
  /**
   * Node rendering primitives.
   */
  nodes?: NodePrimitives;

  /**
   * Edge rendering primitives.
   */
  edges?: EdgePrimitives;

  /**
   * Depth layers for rendering order.
   * Items are rendered in this order (first = back, last = front).
   * Default: ["edges", "nodes", "edgeLabels", "nodeLabels"]
   */
  layers?: string[];
}

// =============================================================================
// PART 10: TYPE GUARDS
// =============================================================================

/**
 * Type guard: checks if a node layer spec is a string shorthand.
 */
export function isNodeLayerShorthand(spec: NodeLayerSpec): spec is BuiltInNodeLayerType {
  return typeof spec === "string";
}

/**
 * Type guard: checks if a node layer spec is a declarative config.
 */
export function isDeclarativeNodeLayer(spec: NodeLayerSpec): spec is DeclarativeNodeLayer {
  return typeof spec === "object" && "type" in spec;
}

/**
 * Type guard: checks if a node layer spec is a custom layer.
 */
export function isCustomNodeLayer(spec: NodeLayerSpec): spec is CustomNodeLayer {
  return typeof spec === "object" && "glsl" in spec;
}

/**
 * Type guard: checks if an edge layer spec is a string shorthand.
 */
export function isEdgeLayerShorthand(spec: EdgeLayerSpec): spec is BuiltInEdgeLayerType {
  return typeof spec === "string";
}

/**
 * Type guard: checks if an edge layer spec is a declarative config.
 */
export function isDeclarativeEdgeLayer(spec: EdgeLayerSpec): spec is DeclarativeEdgeLayer {
  return typeof spec === "object" && "type" in spec;
}

/**
 * Type guard: checks if an edge layer spec is a custom layer.
 */
export function isCustomEdgeLayer(spec: EdgeLayerSpec): spec is CustomEdgeLayer {
  return typeof spec === "object" && "glsl" in spec;
}

// =============================================================================
// PART 11: DEFAULT VALUES
// =============================================================================

/**
 * Default node primitives.
 */
export const DEFAULT_NODE_PRIMITIVES: Required<NodePrimitives> = {
  shapes: ["circle"],
  variables: {},
  layers: ["fill"],
};

/**
 * Default edge primitives.
 */
export const DEFAULT_EDGE_PRIMITIVES: Required<EdgePrimitives> = {
  paths: ["straight"],
  extremities: ["none"],
  variables: {},
  layers: ["plain"],
};

/**
 * Default depth layers.
 */
export const DEFAULT_DEPTH_LAYERS = ["edges", "nodes", "edgeLabels", "nodeLabels"] as const;

/**
 * Default primitives declaration.
 */
export const DEFAULT_PRIMITIVES: Required<PrimitivesDeclaration> = {
  nodes: DEFAULT_NODE_PRIMITIVES,
  edges: DEFAULT_EDGE_PRIMITIVES,
  layers: [...DEFAULT_DEPTH_LAYERS],
};
