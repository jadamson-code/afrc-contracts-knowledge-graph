/**
 * Sigma.js v4 Options API - Factory and Type Utilities
 * =====================================================
 *
 * This file provides the `defineSigmaOptions` factory function that enables
 * type-safe configuration of sigma instances with automatic inference of
 * graphic variables from primitives declarations.
 *
 * @module
 */
import { Attributes } from "graphology-types";

import {
  BuiltInEdgePath,
  BuiltInNodeShape,
  CustomEdgePath,
  CustomNodeShape,
  EdgePathSpec,
  EdgePrimitives,
  NodePrimitives,
  NodeShapeSpec,
  PrimitivesDeclaration,
  VariablesDefinition,
} from "./primitives";
import {
  BaseEdgeState,
  BaseGraphState,
  BaseNodeState,
  EdgeBuiltInVariables,
  EdgeLabelBuiltInVariables,
  EdgeStyleProperties,
  GraphicValue,
  NodeBuiltInVariables,
  NodeLabelBuiltInVariables,
  NodeStyleProperties,
  StylesDeclaration,
} from "./styles";

// =============================================================================
// PART 1: BUILT-IN VARIABLES (DERIVED FROM STYLE PROPERTIES)
// =============================================================================

/**
 * Keys of built-in node variables (derived from NodeBuiltInVariables + NodeLabelBuiltInVariables).
 * These are reserved and cannot be overridden by program variables.
 */
export type BuiltInNodeVariableKeys = keyof NodeBuiltInVariables | keyof NodeLabelBuiltInVariables;

/**
 * Keys of built-in edge variables (derived from EdgeBuiltInVariables + EdgeLabelBuiltInVariables).
 * These are reserved and cannot be overridden by program variables.
 */
export type BuiltInEdgeVariableKeys = keyof EdgeBuiltInVariables | keyof EdgeLabelBuiltInVariables;

// =============================================================================
// PART 2: SHAPE AND PATH EXTRACTION FROM PRIMITIVES
// =============================================================================

/**
 * Extracts the name from a shape spec (built-in string or custom shape).
 */
type ExtractShapeName<S extends NodeShapeSpec> = S extends BuiltInNodeShape
  ? S
  : S extends CustomNodeShape
    ? S["name"]
    : never;

/**
 * Extracts the name from a path spec (built-in string or custom path).
 */
type ExtractPathName<P extends EdgePathSpec> = P extends BuiltInEdgePath
  ? P
  : P extends CustomEdgePath
    ? P["name"]
    : never;

/**
 * Extracts all shape names from an array of shape specs.
 */
type ExtractShapeNames<Shapes extends readonly NodeShapeSpec[]> = Shapes extends readonly [
  infer First extends NodeShapeSpec,
  ...infer Rest extends NodeShapeSpec[],
]
  ? ExtractShapeName<First> | ExtractShapeNames<Rest>
  : never;

/**
 * Extracts all path names from an array of path specs.
 */
type ExtractPathNames<Paths extends readonly EdgePathSpec[]> = Paths extends readonly [
  infer First extends EdgePathSpec,
  ...infer Rest extends EdgePathSpec[],
]
  ? ExtractPathName<First> | ExtractPathNames<Rest>
  : never;

/**
 * Extracts shape names from NodePrimitives declaration.
 */
export type InferNodeShapes<N extends NodePrimitives> = N["shapes"] extends readonly NodeShapeSpec[]
  ? ExtractShapeNames<N["shapes"]>
  : BuiltInNodeShape;

/**
 * Extracts path names from EdgePrimitives declaration.
 */
export type InferEdgePaths<E extends EdgePrimitives> = E["paths"] extends readonly EdgePathSpec[]
  ? ExtractPathNames<E["paths"]>
  : BuiltInEdgePath;

// =============================================================================
// PART 3: EXPLICIT VARIABLE DECLARATION TO TYPE
// =============================================================================

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

// =============================================================================
// PART 4: COMPLETE VARIABLE EXTRACTION
// =============================================================================

/**
 * Extracts node program variables from a NodePrimitives declaration.
 * Uses explicitly declared variables in the `variables` field.
 *
 * @example
 * ```typescript
 * const primitives = {
 *   nodes: {
 *     variables: {
 *       borderSize: { type: "number" as const, default: 0 },
 *       borderColor: { type: "color" as const, default: "#000" },
 *     },
 *   },
 * } as const;
 *
 * type NodeVars = ExtractNodeProgramVariables<typeof primitives.nodes>;
 * // Result: { borderSize: number; borderColor: string }
 * ```
 */
export type ExtractNodeProgramVariables<N extends NodePrimitives> = N["variables"] extends VariablesDefinition
  ? VariablesDefinitionToType<N["variables"]>
  : object;

/**
 * Extracts edge program variables from an EdgePrimitives declaration.
 * Uses explicitly declared variables in the `variables` field.
 *
 * @example
 * ```typescript
 * const primitives = {
 *   edges: {
 *     variables: {
 *       dashSize: { type: "number" as const, default: 5 },
 *       gapSize: { type: "number" as const, default: 5 },
 *     },
 *   },
 * } as const;
 *
 * type EdgeVars = ExtractEdgeProgramVariables<typeof primitives.edges>;
 * // Result: { dashSize: number; gapSize: number }
 * ```
 */
export type ExtractEdgeProgramVariables<E extends EdgePrimitives> = E["variables"] extends VariablesDefinition
  ? VariablesDefinitionToType<E["variables"]>
  : object;

// =============================================================================
// PART 5: BUILT-IN VARIABLE VALIDATION
// =============================================================================

/**
 * Checks if any keys in T overlap with built-in node variable keys.
 * Returns the type if valid, or an error type if there's an overlap.
 *
 * @example
 * ```typescript
 * // Valid - no conflicts
 * type Valid = ValidateNoBuiltInNodeOverride<{ borderSize: number }>;
 * // Result: { borderSize: number }
 *
 * // Invalid - 'color' is built-in
 * type Invalid = ValidateNoBuiltInNodeOverride<{ color: string }>;
 * // Result: { ERROR: "Cannot override built-in node variables"; CONFLICTING_KEYS: "color" }
 * ```
 */
export type ValidateNoBuiltInNodeOverride<T> = keyof T & BuiltInNodeVariableKeys extends never
  ? T
  : {
      ERROR: "Cannot override built-in node variables";
      CONFLICTING_KEYS: keyof T & BuiltInNodeVariableKeys;
    };

/**
 * Checks if any keys in T overlap with built-in edge variable keys.
 * Returns the type if valid, or an error type if there's an overlap.
 *
 * @example
 * ```typescript
 * // Valid - no conflicts
 * type Valid = ValidateNoBuiltInEdgeOverride<{ dashSize: number }>;
 * // Result: { dashSize: number }
 *
 * // Invalid - 'color' is built-in
 * type Invalid = ValidateNoBuiltInEdgeOverride<{ color: string }>;
 * // Result: { ERROR: "Cannot override built-in edge variables"; CONFLICTING_KEYS: "color" }
 * ```
 */
export type ValidateNoBuiltInEdgeOverride<T> = keyof T & BuiltInEdgeVariableKeys extends never
  ? T
  : {
      ERROR: "Cannot override built-in edge variables";
      CONFLICTING_KEYS: keyof T & BuiltInEdgeVariableKeys;
    };

// =============================================================================
// PART 6: TYPED STYLE PROPERTIES (WITH SHAPES/PATHS)
// =============================================================================

/**
 * Node style properties with typed shapes.
 * The `shape` property only accepts shapes declared in primitives.
 */
export type TypedNodeStyleProperties<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  Shape extends string = string,
  NPV extends object = object,
> = Omit<NodeStyleProperties<NA, NS, GS, NPV>, "shape"> & {
  shape?: GraphicValue<NA, NS, GS, Shape>;
};

/**
 * Edge style properties with typed paths and extremities.
 * The `path`, `head`, and `tail` properties only accept values declared in primitives.
 */
export type TypedEdgeStyleProperties<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  Path extends string = string,
  Extremity extends string = string,
  EPV extends object = object,
> = Omit<EdgeStyleProperties<EA, ES, GS, EPV>, "path" | "head" | "tail"> & {
  path?: GraphicValue<EA, ES, GS, Path>;
  head?: GraphicValue<EA, ES, GS, Extremity | "none">;
  tail?: GraphicValue<EA, ES, GS, Extremity | "none">;
};

/**
 * Typed styles declaration with shape/path type checking.
 */
export interface TypedStylesDeclaration<
  NA extends Attributes = Attributes,
  EA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  Shape extends string = string,
  Path extends string = string,
  Extremity extends string = string,
  NPV extends object = object,
  EPV extends object = object,
> {
  nodes?:
    | TypedNodeStyleProperties<NA, NS, GS, Shape, NPV>
    | TypedNodeStyleProperties<NA, NS, GS, Shape, NPV>[];
  edges?:
    | TypedEdgeStyleProperties<EA, ES, GS, Path, Extremity, EPV>
    | TypedEdgeStyleProperties<EA, ES, GS, Path, Extremity, EPV>[];
}

// =============================================================================
// PART 7: SIGMA OPTIONS TYPE
// =============================================================================

/**
 * Complete sigma options with primitives and styles.
 */
export interface SigmaOptions<
  NA extends Attributes = Attributes,
  EA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  NPV extends object = object,
  EPV extends object = object,
> {
  /**
   * Primitives declaration defining rendering capabilities.
   */
  primitives?: PrimitivesDeclaration;

  /**
   * Styles declaration defining how to compute graphic variables.
   */
  styles?: StylesDeclaration<NA, EA, NS, ES, GS, NPV, EPV>;
}

// =============================================================================
// PART 8: FACTORY FUNCTION
// =============================================================================

/**
 * Factory function for creating type-safe sigma options.
 *
 * This function provides type safety for sigma options with:
 * - Shape/path type checking: Only declared shapes/paths are allowed in styles
 * - Program variable support: Specify NPV and EPV type parameters for custom variables
 * - Attribute type safety: Specify NA and EA for typed attribute bindings
 *
 * @example
 * ```typescript
 * // Simple usage - shapes/paths are type-checked automatically
 * const simpleOptions = defineSigmaOptions({
 *   primitives: {
 *     nodes: { shapes: ["circle", "square"] },
 *     edges: { paths: ["straight", "curved"] },
 *   },
 *   styles: {
 *     nodes: {
 *       color: "#666",
 *       shape: "circle", // Only "circle" | "square" allowed
 *     },
 *     edges: {
 *       path: "straight", // Only "straight" | "curved" allowed
 *     },
 *   },
 * });
 *
 * // Usage with program variables (explicit type parameters)
 * type NodeVars = { borderSize: number; borderColor: string };
 * const optionsWithVars = defineSigmaOptions<NodeVars>({
 *   primitives: {
 *     nodes: {
 *       shapes: ["circle"],
 *       variables: {
 *         borderSize: { type: "number", default: 0 },
 *         borderColor: { type: "color", default: "#000" },
 *       },
 *     },
 *   },
 *   styles: {
 *     nodes: {
 *       borderSize: { when: "isHovered", then: 3 },
 *       borderColor: "#fff",
 *     },
 *   },
 * });
 * ```
 */
export function defineSigmaOptions<
  NA extends Attributes = Attributes,
  EA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  NPV extends object = object,
  EPV extends object = object,
>(options: SigmaOptions<NA, EA, NS, ES, GS, NPV, EPV>): SigmaOptions<NA, EA, NS, ES, GS, NPV, EPV> {
  return options;
}

// =============================================================================
// PART 9: HELPER TYPES FOR ADVANCED USAGE
// =============================================================================

/**
 * Infers node program variables from a PrimitivesDeclaration.
 */
export type InferNodeProgramVariables<P extends PrimitivesDeclaration> = P["nodes"] extends NodePrimitives
  ? ExtractNodeProgramVariables<P["nodes"]>
  : object;

/**
 * Infers edge program variables from a PrimitivesDeclaration.
 */
export type InferEdgeProgramVariables<P extends PrimitivesDeclaration> = P["edges"] extends EdgePrimitives
  ? ExtractEdgeProgramVariables<P["edges"]>
  : object;

/**
 * Combined node style properties including built-in and program variables.
 */
export type CompleteNodeStyleProperties<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  NPV extends object = object,
> = NodeStyleProperties<NA, NS, GS> & {
  [K in keyof NPV]?: NPV[K];
};

/**
 * Combined edge style properties including built-in and program variables.
 */
export type CompleteEdgeStyleProperties<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
  EPV extends object = object,
> = EdgeStyleProperties<EA, ES, GS> & {
  [K in keyof EPV]?: EPV[K];
};
