/**
 * Sigma.js v4 Styling API - Type Definitions
 * ==========================================
 *
 * This file defines the types for the "styles" part of the new API.
 * The "programs declaration" part (shapes, layers, paths, etc.) is not yet covered.
 *
 * @module
 */
import { AbstractGraph } from "graphology-types";

/**
 * Generic attributes type (user-defined).
 */
export type Attributes = Record<string, unknown>;

/**
 * Empty record type for default program variables (no additional variables).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type EmptyVariables = {};

/**
 * Built-in state flags for nodes.
 * Can be extended by users via generics.
 */
export interface BaseNodeState {
  isHovered: boolean;
  isHidden: boolean;
  isHighlighted: boolean;
}

/**
 * Built-in state flags for edges.
 * Can be extended by users via generics.
 */
export interface BaseEdgeState {
  isHovered: boolean;
  isHidden: boolean;
  isHighlighted: boolean;
}

/**
 * Built-in state for the graph instance.
 * Can be extended by users via generics.
 */
export interface BaseGraphState {
  isIdle: boolean;
  isPanning: boolean;
  isZooming: boolean;
  isDragging: boolean;
  hasHovered: boolean;
  hasHighlighted: boolean;
}

/**
 * State predicate for conditional styling.
 * Used in both inline conditionals and array-form rules.
 *
 * - string: Single state flag name (e.g., "isHovered") - true if flag is true
 * - string[]: Array of state flags - true if ALL flags are true (AND logic)
 * - object: Map of state flags to expected values (AND logic)
 * - function: Full control predicate function
 */
export type StatePredicate<A extends Attributes = Attributes, S = BaseNodeState | BaseEdgeState, GS = BaseGraphState> =
  | keyof S
  | readonly (keyof S)[]
  | Partial<S>
  | ((attributes: A, state: S, graphState: GS, graph: AbstractGraph) => boolean);

/**
 * Direct attribute binding - reads value directly from an attribute.
 */
export interface DirectAttributeBinding<T> {
  attribute: string;
  defaultValue?: T;
}

/**
 * Numerical attribute binding with range mapping.
 * Maps attribute values to a min/max range with optional easing.
 */
export interface NumericalAttributeBinding extends DirectAttributeBinding<number> {
  min?: number;
  max?: number;
  /** Attribute value corresponding to min (defaults to data min) */
  minValue?: number;
  /** Attribute value corresponding to max (defaults to data max) */
  maxValue?: number;
  /** Easing function for interpolation */
  easing?: EasingFunction;
}

/**
 * Categorical attribute binding with dictionary mapping.
 * Maps attribute values to specific output values via a dictionary.
 */
export interface CategoricalAttributeBinding<T> extends DirectAttributeBinding<T> {
  dict: Record<string, T>;
}

/**
 * Easing functions for numerical interpolation.
 */
export type EasingFunction =
  | "linear"
  | "quadraticIn"
  | "quadraticOut"
  | "quadraticInOut"
  | "cubicIn"
  | "cubicOut"
  | "cubicInOut"
  | "exponentialIn"
  | "exponentialOut"
  | "exponentialInOut"
  | ((t: number) => number);

/**
 * Any attribute binding type.
 * Note: [T] wrapping prevents distributive conditional type behavior.
 */
export type AttributeBinding<T> =
  | DirectAttributeBinding<T>
  | ([T] extends [number] ? NumericalAttributeBinding : never)
  | CategoricalAttributeBinding<T>;

/**
 * Function-based value resolution.
 * Receives attributes, state, graph state, and the graph instance.
 */
export type ValueFunction<A extends Attributes, S, GS, T> = (
  attributes: A,
  state: S,
  graphState: GS,
  graph: AbstractGraph,
) => T;

/**
 * Inline conditional value.
 * Chooses between `then` and `else` based on the predicate.
 * - `then` and `else` can be direct values, attribute bindings, or functions
 * - `else` is optional; if omitted, falls back to the graphic variable's default
 */
export interface InlineConditional<A extends Attributes, S, GS, T> {
  when: StatePredicate<A, S, GS>;
  then: GraphicValue<A, S, GS, T>;
  else?: GraphicValue<A, S, GS, T>;
}

/**
 * Complete value specification for a graphic variable.
 * Can be any of: direct value, attribute binding, function, or inline conditional.
 */
export type GraphicValue<A extends Attributes, S, GS, T> =
  | T
  | AttributeBinding<T>
  | ValueFunction<A, S, GS, T>
  | InlineConditional<A, S, GS, T>;

/**
 * Type guard: checks if a value is an attribute binding.
 */
export function isAttributeBinding<T>(value: unknown): value is AttributeBinding<T> {
  return typeof value === "object" && value !== null && "attribute" in value;
}

/**
 * Type guard: checks if a value is a value function.
 */
export function isValueFunction<A extends Attributes, S, GS, T>(value: unknown): value is ValueFunction<A, S, GS, T> {
  return typeof value === "function";
}

/**
 * Type guard: checks if a value is an inline conditional.
 */
export function isInlineConditional<A extends Attributes, S, GS, T>(
  value: unknown,
): value is InlineConditional<A, S, GS, T> {
  return typeof value === "object" && value !== null && "when" in value && "then" in value;
}

/**
 * Built-in graphic variables for nodes.
 * These are always available regardless of program declaration.
 */
export interface NodeBuiltInVariables<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  Shape extends string = string,
  Layer extends string = string,
> {
  /** Node shape (must match a shape declared in programs) */
  shape?: GraphicValue<NA, NS, GS, Shape>;
  /** X coordinate in graph space */
  x?: GraphicValue<NA, NS, GS, number>;
  /** Y coordinate in graph space */
  y?: GraphicValue<NA, NS, GS, number>;
  /** Node size (diameter in pixels) */
  size?: GraphicValue<NA, NS, GS, number>;
  /** Node color */
  color?: GraphicValue<NA, NS, GS, string>;
  /** Overall opacity (0-1) */
  opacity?: GraphicValue<NA, NS, GS, number>;
  /** Visibility */
  visibility?: GraphicValue<NA, NS, GS, "visible" | "hidden">;
  /** Depth layer for render ordering */
  depth?: GraphicValue<NA, NS, GS, Layer>;
  /** Z-index within the depth layer */
  zIndex?: GraphicValue<NA, NS, GS, number>;
}

/**
 * Built-in graphic variables for node backdrops.
 * Controls the background shape rendered behind nodes (and optionally their labels).
 */
export interface NodeBackdropBuiltInVariables<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
> {
  /** Backdrop visibility */
  backdropVisibility?: GraphicValue<NA, NS, GS, "visible" | "hidden">;
  /** Backdrop fill color (transparent = no backdrop) */
  backdropColor?: GraphicValue<NA, NS, GS, string>;
  /** Backdrop shadow color */
  backdropShadowColor?: GraphicValue<NA, NS, GS, string>;
  /** Backdrop shadow blur radius in pixels */
  backdropShadowBlur?: GraphicValue<NA, NS, GS, number>;
  /** Backdrop padding around node+label in pixels */
  backdropPadding?: GraphicValue<NA, NS, GS, number>;
  /** Backdrop border color (transparent = no border) */
  backdropBorderColor?: GraphicValue<NA, NS, GS, string>;
  /** Backdrop border width in pixels */
  backdropBorderWidth?: GraphicValue<NA, NS, GS, number>;
  /** Backdrop corner radius in pixels */
  backdropCornerRadius?: GraphicValue<NA, NS, GS, number>;
  /** Backdrop label padding in pixels (-1 = fall back to backdropPadding) */
  backdropLabelPadding?: GraphicValue<NA, NS, GS, number>;
  /** Which area the backdrop covers */
  backdropArea?: GraphicValue<NA, NS, GS, "both" | "node" | "label">;
}

/**
 * Built-in graphic variables for node labels.
 * These are always available regardless of program declaration.
 */
export interface NodeLabelBuiltInVariables<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  Layer extends string = string,
> {
  /** Label text content */
  label?: GraphicValue<NA, NS, GS, string>;
  /** Label text color */
  labelColor?: GraphicValue<NA, NS, GS, string>;
  /** Label font size in pixels */
  labelSize?: GraphicValue<NA, NS, GS, number>;
  /** Label font family */
  labelFont?: GraphicValue<NA, NS, GS, string>;
  /** Label visibility */
  labelVisibility?: GraphicValue<NA, NS, GS, "auto" | "visible" | "hidden">;
  /** Label position relative to node */
  labelPosition?: GraphicValue<NA, NS, GS, "right" | "left" | "above" | "below" | "over">;
  /** Label angle */
  labelAngle?: GraphicValue<NA, NS, GS, number>;
  /** Depth layer for label render ordering */
  labelDepth?: GraphicValue<NA, NS, GS, Layer>;
  /** Label attachment name (references a key in primitives.nodes.labelAttachments) */
  labelAttachment?: GraphicValue<NA, NS, GS, string | null>;
  /** Where to place the attachment relative to the label */
  labelAttachmentPlacement?: GraphicValue<NA, NS, GS, "below" | "above" | "left" | "right">;
}

/**
 * All node graphic variables (built-in + program-declared).
 * Program-declared variables are added via intersection with additional types.
 */
export type NodeStyleProperties<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> = NodeBuiltInVariables<NA, NS, GS> &
  NodeBackdropBuiltInVariables<NA, NS, GS> &
  NodeLabelBuiltInVariables<NA, NS, GS> & {
    [K in keyof ProgramVariables]?: GraphicValue<NA, NS, GS, ProgramVariables[K]>;
  };

/**
 * Built-in graphic variables for edges.
 * These are always available regardless of program declaration.
 */
export interface EdgeBuiltInVariables<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  Path extends string = string,
  Layer extends string = string,
> {
  /** Edge path type (must match a path declared in programs) */
  path?: GraphicValue<EA, ES, GS, Path>;
  /** Edge thickness in pixels */
  size?: GraphicValue<EA, ES, GS, number>;
  /** Edge color */
  color?: GraphicValue<EA, ES, GS, string>;
  /** Overall opacity (0-1) */
  opacity?: GraphicValue<EA, ES, GS, number>;
  /** Source extremity (tail) */
  tail?: GraphicValue<EA, ES, GS, string>;
  /** Target extremity (head) */
  head?: GraphicValue<EA, ES, GS, string>;
  /** Visibility */
  visibility?: GraphicValue<EA, ES, GS, "visible" | "hidden">;
  /** Depth layer for render ordering */
  depth?: GraphicValue<EA, ES, GS, Layer>;
  /** Z-index within the depth layer */
  zIndex?: GraphicValue<EA, ES, GS, number>;
}

/**
 * Built-in graphic variables for edge labels.
 * These are always available regardless of program declaration.
 */
export interface EdgeLabelBuiltInVariables<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  Layer extends string = string,
> {
  /** Label text content */
  label?: GraphicValue<EA, ES, GS, string>;
  /** Label text color */
  labelColor?: GraphicValue<EA, ES, GS, string>;
  /** Label font size in pixels */
  labelSize?: GraphicValue<EA, ES, GS, number>;
  /** Label font family */
  labelFont?: GraphicValue<EA, ES, GS, string>;
  /** Label visibility */
  labelVisibility?: GraphicValue<EA, ES, GS, "auto" | "visible" | "hidden">;
  /** Label position along edge (0 = source, 0.5 = middle, 1 = target) or mode */
  labelPosition?: GraphicValue<EA, ES, GS, number | "over" | "above" | "below" | "auto">;
  /** Depth layer for label render ordering */
  labelDepth?: GraphicValue<EA, ES, GS, Layer>;
}

/**
 * All edge graphic variables (built-in + program-declared).
 * Program-declared variables are added via intersection with additional types.
 */
export type EdgeStyleProperties<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> = EdgeBuiltInVariables<EA, ES, GS> &
  EdgeLabelBuiltInVariables<EA, ES, GS> & {
    [K in keyof ProgramVariables]?: GraphicValue<EA, ES, GS, ProgramVariables[K]>;
  };

/**
 * Leaf value - a value without conditionals.
 * Used inside rule-level conditionals where nesting is not allowed.
 */
export type LeafValue<A extends Attributes, S, GS, T> = T | AttributeBinding<T> | ValueFunction<A, S, GS, T>;

/**
 * Helper type to extract the base value type from a GraphicValue.
 * Note: [GV] wrapping prevents distributive conditional type behavior.
 */
type ExtractBaseType<GV> = [GV] extends [GraphicValue<infer _A, infer _S, infer _GS, infer T>] ? T : never;

/**
 * Node style properties with LEAF values only (no conditionals).
 * Used as the then/else type for rule-level conditionals.
 */
export type NodeStylePropertiesLeaf<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> = {
  [K in keyof NodeStyleProperties<NA, NS, GS, ProgramVariables>]?: LeafValue<
    NA,
    NS,
    GS,
    ExtractBaseType<NodeStyleProperties<NA, NS, GS, ProgramVariables>[K]>
  >;
};

/**
 * Edge style properties with LEAF values only (no conditionals).
 * Used as the then/else type for rule-level conditionals.
 */
export type EdgeStylePropertiesLeaf<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> = {
  [K in keyof EdgeStyleProperties<EA, ES, GS, ProgramVariables>]?: LeafValue<
    EA,
    ES,
    GS,
    ExtractBaseType<EdgeStyleProperties<EA, ES, GS, ProgramVariables>[K]>
  >;
};

/**
 * Rule-level conditional for nodes.
 * The then/else contain property objects WITHOUT nested conditionals.
 */
export interface NodeStyleRuleConditional<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> {
  when: StatePredicate<NA, NS, GS>;
  then: NodeStylePropertiesLeaf<NA, NS, GS, ProgramVariables>;
  else?: NodeStylePropertiesLeaf<NA, NS, GS, ProgramVariables>;
}

/**
 * Rule-level conditional for edges.
 * The then/else contain property objects WITHOUT nested conditionals.
 */
export interface EdgeStyleRuleConditional<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> {
  when: StatePredicate<EA, ES, GS>;
  then: EdgeStylePropertiesLeaf<EA, ES, GS, ProgramVariables>;
  else?: EdgeStylePropertiesLeaf<EA, ES, GS, ProgramVariables>;
}

/**
 * Node style properties object where each property CAN have conditionals.
 */
export type NodeStylePropertiesWithConditionals<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> = {
  [K in keyof NodeStyleProperties<NA, NS, GS, ProgramVariables>]?: GraphicValue<
    NA,
    NS,
    GS,
    ExtractBaseType<NodeStyleProperties<NA, NS, GS, ProgramVariables>[K]>
  >;
};

/**
 * Edge style properties object where each property CAN have conditionals.
 */
export type EdgeStylePropertiesWithConditionals<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> = {
  [K in keyof EdgeStyleProperties<EA, ES, GS, ProgramVariables>]?: GraphicValue<
    EA,
    ES,
    GS,
    ExtractBaseType<EdgeStyleProperties<EA, ES, GS, ProgramVariables>[K]>
  >;
};

/**
 * A style rule for nodes.
 * Either:
 * - A rule-level conditional (then/else have NO nested conditionals)
 * - A properties object (each property CAN have conditionals)
 */
export type NodeStyleRule<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> =
  | NodeStyleRuleConditional<NA, NS, GS, ProgramVariables>
  | NodeStylePropertiesWithConditionals<NA, NS, GS, ProgramVariables>;

/**
 * A style rule for edges.
 * Either:
 * - A rule-level conditional (then/else have NO nested conditionals)
 * - A properties object (each property CAN have conditionals)
 */
export type EdgeStyleRule<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> =
  | EdgeStyleRuleConditional<EA, ES, GS, ProgramVariables>
  | EdgeStylePropertiesWithConditionals<EA, ES, GS, ProgramVariables>;

/**
 * Node styles declaration.
 * Can be either:
 * - Object form: simple case with inline conditionals
 * - Array form: ordered rules for complex cases
 */
export type NodeStyles<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> = NodeStyleRule<NA, NS, GS, ProgramVariables> | NodeStyleRule<NA, NS, GS, ProgramVariables>[];

/**
 * Edge styles declaration.
 * Can be either:
 * - Object form: simple case with inline conditionals
 * - Array form: ordered rules for complex cases
 */
export type EdgeStyles<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  ProgramVariables = EmptyVariables,
> = EdgeStyleRule<EA, ES, GS, ProgramVariables> | EdgeStyleRule<EA, ES, GS, ProgramVariables>[];

/**
 * Complete styles declaration.
 *
 * Generic parameters:
 * - NA: Node attributes type
 * - EA: Edge attributes type
 * - NS: Node state type (extends BaseNodeState)
 * - ES: Edge state type (extends BaseEdgeState)
 * - GS: Graph state type (extends BaseGraphState)
 * - NodeProgramVariables: Additional variables exposed by node program layers
 * - EdgeProgramVariables: Additional variables exposed by edge program layers
 */
export interface StylesDeclaration<
  NA extends Attributes = Attributes,
  EA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  NodeProgramVariables = EmptyVariables,
  EdgeProgramVariables = EmptyVariables,
> {
  nodes?: NodeStyles<NA, NS, GS, NodeProgramVariables>;
  edges?: EdgeStyles<EA, ES, GS, EdgeProgramVariables>;
}

/**
 * Default node state values.
 */
export const DEFAULT_NODE_STATE: BaseNodeState = {
  isHovered: false,
  isHidden: false,
  isHighlighted: false,
};

/**
 * Default edge state values.
 */
export const DEFAULT_EDGE_STATE: BaseEdgeState = {
  isHovered: false,
  isHidden: false,
  isHighlighted: false,
};

/**
 * Default graph state values.
 */
export const DEFAULT_GRAPH_STATE: BaseGraphState = {
  isIdle: true,
  isPanning: false,
  isZooming: false,
  isDragging: false,
  hasHovered: false,
  hasHighlighted: false,
};

/**
 * Creates a new node state with default values.
 */
export function createNodeState<NS extends BaseNodeState = BaseNodeState>(defaults?: Partial<NS>): NS {
  return { ...DEFAULT_NODE_STATE, ...defaults } as NS;
}

/**
 * Creates a new edge state with default values.
 */
export function createEdgeState<ES extends BaseEdgeState = BaseEdgeState>(defaults?: Partial<ES>): ES {
  return { ...DEFAULT_EDGE_STATE, ...defaults } as ES;
}

/**
 * Creates a new graph state with default values.
 */
export function createGraphState<GS extends BaseGraphState = BaseGraphState>(defaults?: Partial<GS>): GS {
  return { ...DEFAULT_GRAPH_STATE, ...defaults } as GS;
}

/**
 * Default styles declaration.
 *
 * Provides sensible defaults with hover/highlight handling:
 * - Node size increases slightly on hover
 * - Node zIndex increases on highlight (1) and hover (2) for proper layering
 * - Hidden items via isHidden state
 *
 * Users can:
 * - Use DEFAULT_STYLES as-is for sensible defaults
 * - Extend with spread: { nodes: { ...DEFAULT_STYLES.nodes, size: 20 } }
 * - Replace entirely by providing their own styles object
 */
export const DEFAULT_STYLES: { nodes: NodeStyleRule; edges: EdgeStyleRule } = {
  nodes: {
    x: { attribute: "x" },
    y: { attribute: "y" },
    size: {
      when: "isHovered",
      then: { attribute: "size", defaultValue: 12 },
      else: { attribute: "size", defaultValue: 10 },
    },
    color: { attribute: "color", defaultValue: "#666" },
    label: { attribute: "label" },
    visibility: {
      when: "isHidden",
      then: "hidden",
      else: "visible",
    },
    depth: {
      when: "isHovered",
      then: "topNodes",
      else: "nodes",
    },
    labelDepth: {
      when: "isHovered",
      then: "topNodeLabels",
      else: "nodeLabels",
    },
    labelVisibility: {
      when: "isHovered",
      then: "visible",
      else: "auto",
    },
    zIndex: {
      when: "isHovered",
      then: 1,
      else: 0,
    },
    backdropVisibility: {
      when: "isHovered",
      then: "visible",
      else: "hidden",
    },
    backdropColor: "#ffffff",
    backdropShadowColor: "rgba(0, 0, 0, 0.5)",
    backdropShadowBlur: 12,
    backdropPadding: 6,
  },
  edges: {
    size: { attribute: "size", defaultValue: 1 },
    color: { attribute: "color", defaultValue: "#ccc" },
    label: { attribute: "label" },
    visibility: {
      when: "isHidden",
      then: "hidden",
      else: "visible",
    },
    depth: {
      when: ["isHighlighted", "isHovered"],
      then: "topNodes",
      else: "nodes",
    },
    labelDepth: {
      when: ["isHighlighted", "isHovered"],
      then: "topNodeLabels",
      else: "nodeLabels",
    },
    zIndex: {
      when: "isHovered",
      then: 1,
      else: 0,
    },
  },
} as const;
