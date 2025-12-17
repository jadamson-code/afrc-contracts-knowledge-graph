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

/**
 * Built-in node shape names.
 *
 * TODO:
 * Deduce this type from the actual shapes exported from ../rendering/nodes/shapes
 */
export type BuiltInNodeShape = "circle" | "square" | "triangle" | "diamond";

/**
 * Circle shape configuration.
 * Circle has no configurable variables.
 */
export interface CircleShapeConfig {
  type: "circle";
}

/**
 * Square shape configuration (declarative).
 * Allows configuring corner radius and rotation via variable references.
 */
export interface SquareShapeConfig {
  type: "square";
  /** Variable name for corner radius (0-1), or fixed value. Defaults to 0. */
  cornerRadius?: string | number;
  /** Variable name for rotation in radians, or fixed value. Defaults to 0. */
  rotation?: string | number;
}

/**
 * Triangle shape configuration (declarative).
 * Allows configuring corner radius and rotation via variable references.
 */
export interface TriangleShapeConfig {
  type: "triangle";
  /** Variable name for corner radius (0-1), or fixed value. Defaults to 0. */
  cornerRadius?: string | number;
  /** Variable name for rotation in radians, or fixed value. Defaults to 0. */
  rotation?: string | number;
}

/**
 * Diamond shape configuration (declarative).
 * Allows configuring corner radius and rotation via variable references.
 */
export interface DiamondShapeConfig {
  type: "diamond";
  /** Variable name for corner radius (0-1), or fixed value. Defaults to 0. */
  cornerRadius?: string | number;
  /** Variable name for rotation in radians, or fixed value. Defaults to 0. */
  rotation?: string | number;
}

/**
 * Declarative node shape configuration.
 */
export type DeclarativeNodeShape = CircleShapeConfig | SquareShapeConfig | TriangleShapeConfig | DiamondShapeConfig;

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
 * Shape specification: built-in name, declarative config, or custom shape.
 */
export type NodeShapeSpec = BuiltInNodeShape | DeclarativeNodeShape | CustomNodeShape;

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

/**
 * Built-in edge path names.
 *
 * TODO:
 * Deduce this type from the actual paths exported from ../rendering/edges/paths
 */
export type BuiltInEdgePath = "straight" | "curved" | "step" | "step-curved";

/**
 * Straight path configuration.
 * Straight paths have no configurable variables.
 */
export interface StraightPathConfig {
  type: "straight";
}

/**
 * Curved path configuration (declarative).
 * Allows configuring curvature via variable reference.
 */
export interface CurvedPathConfig {
  type: "curved";
  /**
   * Variable name for curvature, or fixed value.
   * Curvature determines how much the curve bends away from the straight line.
   * 0 = straight line, 0.25 = moderate curve (default), 0.5+ = strong curve.
   */
  curvature?: string | number;
}

/**
 * Step path orientation preference.
 */
export type StepPathOrientation = "horizontal" | "vertical" | "automatic";

/**
 * Step path configuration (declarative).
 * Orthogonal path with right-angle connections.
 */
export interface StepPathConfig {
  type: "step";
  /**
   * Path orientation preference.
   * - "horizontal": Always go horizontal first (H→V→H)
   * - "vertical": Always go vertical first (V→H→V)
   * - "automatic": Choose based on which delta is larger
   * Default: "automatic"
   */
  orientation?: StepPathOrientation;
  /**
   * Position of the middle segment as ratio [0-1].
   * 0 = at source, 0.5 = centered, 1 = at target.
   * Default: 0.5
   */
  offset?: number;
}

/**
 * Step-curved path configuration (declarative).
 * Step path with rounded corners.
 */
export interface StepCurvedPathConfig {
  type: "step-curved";
  /**
   * Path orientation preference.
   * Default: "automatic"
   */
  orientation?: StepPathOrientation;
  /**
   * Position of the middle segment as ratio [0-1].
   * Default: 0.5
   */
  offset?: number;
  /**
   * Variable name for corner radius, or fixed value.
   * Default: 0.5
   */
  cornerRadius?: string | number;
}

/**
 * Declarative edge path configuration.
 */
export type DeclarativeEdgePath = StraightPathConfig | CurvedPathConfig | StepPathConfig | StepCurvedPathConfig;

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
 * Edge path specification: built-in name, declarative config, or custom path.
 */
export type EdgePathSpec = BuiltInEdgePath | DeclarativeEdgePath | CustomEdgePath;

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

/**
 * Built-in variable names that should not be extracted from layers.
 * These are always available and don't need to be inferred.
 */
type BuiltInVariableNames = "color" | "size" | "opacity" | "x" | "y" | "label";

/**
 * Helper to check if a string is a custom variable name (not built-in).
 */
type IsCustomVariable<S> = S extends BuiltInVariableNames ? false : S extends string ? true : false;

/**
 * Extracts variables from a FillLayerConfig.
 * Fill layers can reference a custom color variable.
 */
type ExtractFillLayerVariables<L extends FillLayerConfig> = L["color"] extends string
  ? IsCustomVariable<L["color"]> extends true
    ? { [K in L["color"]]: string }
    : object
  : object;

/**
 * Extracts variables from a BorderLayerConfig.
 * Border layers can reference size (number) and color (string) variables.
 */
type ExtractBorderLayerVariables<L extends BorderLayerConfig> = (L["size"] extends string
  ? IsCustomVariable<L["size"]> extends true
    ? { [K in L["size"]]: number }
    : object
  : object) &
  (L["color"] extends string
    ? IsCustomVariable<L["color"]> extends true
      ? { [K in L["color"]]: string }
      : object
    : object);

/**
 * Extracts variables from an ImageLayerConfig.
 * Image layers can reference url (string) and color (string) variables.
 */
type ExtractImageLayerVariables<L extends ImageLayerConfig> = (L["url"] extends string
  ? IsCustomVariable<L["url"]> extends true
    ? { [K in L["url"]]: string }
    : object
  : object) &
  (L["color"] extends string
    ? IsCustomVariable<L["color"]> extends true
      ? { [K in L["color"]]: string }
      : object
    : object);

/**
 * Extracts variables from a PlainEdgeLayerConfig.
 */
type ExtractPlainEdgeLayerVariables<L extends PlainEdgeLayerConfig> = L["color"] extends string
  ? IsCustomVariable<L["color"]> extends true
    ? { [K in L["color"]]: string }
    : object
  : object;

/**
 * Extracts variables from a DashedEdgeLayerConfig.
 * Dashed layers reference dashSize (number), gapSize (number), and optionally dashColor (string).
 */
type ExtractDashedEdgeLayerVariables<L extends DashedEdgeLayerConfig> = (L["dashSize"] extends string
  ? IsCustomVariable<L["dashSize"]> extends true
    ? { [K in L["dashSize"]]: number }
    : object
  : object) &
  (L["gapSize"] extends string
    ? IsCustomVariable<L["gapSize"]> extends true
      ? { [K in L["gapSize"]]: number }
      : object
    : object) &
  (L["dashColor"] extends string
    ? IsCustomVariable<L["dashColor"]> extends true
      ? { [K in L["dashColor"]]: string }
      : object
    : object);

/**
 * Extracts variables from any node layer spec.
 */
type ExtractNodeLayerVariables<L extends NodeLayerSpec> = L extends FillLayerConfig
  ? ExtractFillLayerVariables<L>
  : L extends BorderLayerConfig
    ? ExtractBorderLayerVariables<L>
    : L extends ImageLayerConfig
      ? ExtractImageLayerVariables<L>
      : object;

/**
 * Extracts variables from any edge layer spec.
 */
type ExtractEdgeLayerVariables<L extends EdgeLayerSpec> = L extends PlainEdgeLayerConfig
  ? ExtractPlainEdgeLayerVariables<L>
  : L extends DashedEdgeLayerConfig
    ? ExtractDashedEdgeLayerVariables<L>
    : object;

/**
 * Recursively extracts variables from an array of node layer specs.
 */
type ExtractNodeLayersVariables<Layers extends readonly NodeLayerSpec[]> = Layers extends readonly [
  infer First extends NodeLayerSpec,
  ...infer Rest extends NodeLayerSpec[],
]
  ? ExtractNodeLayerVariables<First> & ExtractNodeLayersVariables<Rest>
  : object;

/**
 * Recursively extracts variables from an array of edge layer specs.
 */
type ExtractEdgeLayersVariables<Layers extends readonly EdgeLayerSpec[]> = Layers extends readonly [
  infer First extends EdgeLayerSpec,
  ...infer Rest extends EdgeLayerSpec[],
]
  ? ExtractEdgeLayerVariables<First> & ExtractEdgeLayersVariables<Rest>
  : object;

/**
 * Extracts variables from a SquareShapeConfig.
 */
type ExtractSquareShapeVariables<S extends SquareShapeConfig> = (S["cornerRadius"] extends string
  ? IsCustomVariable<S["cornerRadius"]> extends true
    ? { [K in S["cornerRadius"]]: number }
    : object
  : object) &
  (S["rotation"] extends string
    ? IsCustomVariable<S["rotation"]> extends true
      ? { [K in S["rotation"]]: number }
      : object
    : object);

/**
 * Extracts variables from a TriangleShapeConfig.
 */
type ExtractTriangleShapeVariables<S extends TriangleShapeConfig> = (S["cornerRadius"] extends string
  ? IsCustomVariable<S["cornerRadius"]> extends true
    ? { [K in S["cornerRadius"]]: number }
    : object
  : object) &
  (S["rotation"] extends string
    ? IsCustomVariable<S["rotation"]> extends true
      ? { [K in S["rotation"]]: number }
      : object
    : object);

/**
 * Extracts variables from a DiamondShapeConfig.
 */
type ExtractDiamondShapeVariables<S extends DiamondShapeConfig> = (S["cornerRadius"] extends string
  ? IsCustomVariable<S["cornerRadius"]> extends true
    ? { [K in S["cornerRadius"]]: number }
    : object
  : object) &
  (S["rotation"] extends string
    ? IsCustomVariable<S["rotation"]> extends true
      ? { [K in S["rotation"]]: number }
      : object
    : object);

/**
 * Extracts variables from any node shape spec.
 */
type ExtractNodeShapeVariables<S extends NodeShapeSpec> = S extends SquareShapeConfig
  ? ExtractSquareShapeVariables<S>
  : S extends TriangleShapeConfig
    ? ExtractTriangleShapeVariables<S>
    : S extends DiamondShapeConfig
      ? ExtractDiamondShapeVariables<S>
      : object;

/**
 * Recursively extracts variables from an array of node shape specs.
 */
type ExtractNodeShapesVariables<Shapes extends readonly NodeShapeSpec[]> = Shapes extends readonly [
  infer First extends NodeShapeSpec,
  ...infer Rest extends NodeShapeSpec[],
]
  ? ExtractNodeShapeVariables<First> & ExtractNodeShapesVariables<Rest>
  : object;

/**
 * Extracts variables from a CurvedPathConfig.
 */
type ExtractCurvedPathVariables<P extends CurvedPathConfig> = P["curvature"] extends string
  ? IsCustomVariable<P["curvature"]> extends true
    ? { [K in P["curvature"]]: number }
    : object
  : object;

/**
 * Extracts variables from a StepCurvedPathConfig.
 */
type ExtractStepCurvedPathVariables<P extends StepCurvedPathConfig> = P["cornerRadius"] extends string
  ? IsCustomVariable<P["cornerRadius"]> extends true
    ? { [K in P["cornerRadius"]]: number }
    : object
  : object;

/**
 * Extracts variables from any edge path spec.
 */
type ExtractEdgePathVariables<P extends EdgePathSpec> = P extends CurvedPathConfig
  ? ExtractCurvedPathVariables<P>
  : P extends StepCurvedPathConfig
    ? ExtractStepCurvedPathVariables<P>
    : object;

/**
 * Recursively extracts variables from an array of edge path specs.
 */
type ExtractEdgePathsVariables<Paths extends readonly EdgePathSpec[]> = Paths extends readonly [
  infer First extends EdgePathSpec,
  ...infer Rest extends EdgePathSpec[],
]
  ? ExtractEdgePathVariables<First> & ExtractEdgePathsVariables<Rest>
  : object;

/**
 * Extracts all variables from a NodePrimitives declaration.
 * Combines explicitly declared variables with variables inferred from shapes and layers.
 */
export type ExtractAllNodeVariables<N extends NodePrimitives> = (N["variables"] extends VariablesDefinition
  ? VariablesDefinitionToType<N["variables"]>
  : object) &
  (N["shapes"] extends readonly NodeShapeSpec[] ? ExtractNodeShapesVariables<N["shapes"]> : object) &
  (N["layers"] extends readonly NodeLayerSpec[] ? ExtractNodeLayersVariables<N["layers"]> : object);

/**
 * Extracts all variables from an EdgePrimitives declaration.
 * Combines explicitly declared variables with variables inferred from paths and layers.
 */
export type ExtractAllEdgeVariables<E extends EdgePrimitives> = (E["variables"] extends VariablesDefinition
  ? VariablesDefinitionToType<E["variables"]>
  : object) &
  (E["paths"] extends readonly EdgePathSpec[] ? ExtractEdgePathsVariables<E["paths"]> : object) &
  (E["layers"] extends readonly EdgeLayerSpec[] ? ExtractEdgeLayersVariables<E["layers"]> : object);

/**
 * Converts a VariablesDefinition to a typed object.
 */
type VariablesDefinitionToType<V extends VariablesDefinition> = {
  [K in keyof V]: V[K]["type"] extends "number"
    ? number
    : V[K]["type"] extends "color"
      ? string
      : V[K]["type"] extends "string"
        ? string
        : V[K]["type"] extends "boolean"
          ? boolean
          : unknown;
};

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
