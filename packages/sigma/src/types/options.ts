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

import { NodeBuiltInVariableNames, EdgeBuiltInVariableNames } from "../primitives/registry";
import {
  BuiltInEdgeExtremity,
  BuiltInEdgePath,
  BuiltInNodeShape,
  CustomEdgeExtremity,
  CustomEdgePath,
  CustomNodeShape,
  DeclarativeEdgePath,
  DeclarativeNodeShape,
  EdgeExtremitySpec,
  EdgePathSpec,
  EdgePrimitives,
  ExtractAllEdgeVariables,
  ExtractAllNodeVariables,
  NodePrimitives,
  NodeShapeSpec,
  PrimitivesDeclaration,
  ValidatedNodeLayerSpec,
  ValidatedEdgeLayerSpec,
  VariablesDefinition,
} from "../primitives/types";
import {
  BaseEdgeState,
  BaseGraphState,
  BaseNodeState,
  EdgeStyleProperties,
  GraphicValue,
  InlineConditional,
  NodeStyleProperties,
} from "./styles";

/**
 * Extracts the name from a shape spec (built-in string, declarative config, or custom shape).
 */
type ExtractShapeName<S extends NodeShapeSpec> = S extends BuiltInNodeShape
  ? S
  : S extends DeclarativeNodeShape
    ? S["type"]
    : S extends CustomNodeShape
      ? S["name"]
      : never;

/**
 * Extracts the name from a path spec (built-in string, declarative config, or custom path).
 */
type ExtractPathName<P extends EdgePathSpec> = P extends BuiltInEdgePath
  ? P
  : P extends DeclarativeEdgePath
    ? P["type"]
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
 * Extracts extremity names from an EdgePrimitives declaration.
 */
type ExtractExtremityName<E extends EdgeExtremitySpec> = E extends BuiltInEdgeExtremity
  ? E
  : E extends CustomEdgeExtremity
    ? E["name"]
    : never;

type ExtractExtremityNames<Extremities extends readonly EdgeExtremitySpec[]> = Extremities extends readonly [
  infer First extends EdgeExtremitySpec,
  ...infer Rest extends EdgeExtremitySpec[],
]
  ? ExtractExtremityName<First> | ExtractExtremityNames<Rest>
  : never;

// =============================================================================
// VARIABLE NAME EXTRACTION FROM PRIMITIVES
// =============================================================================

/**
 * Extracts declared variable names from a VariablesDefinition.
 */
type ExtractDeclaredVarNames<V> = V extends VariablesDefinition ? keyof V & string : never;

/**
 * Computes allowed node variable names: built-ins + declared in primitives.nodes.variables.
 */
type AllowedNodeVarNames<P extends PrimitivesDeclaration> = NodeBuiltInVariableNames | ExtractDeclaredVarNames<P["nodes"] extends { variables: infer V } ? V : never>;

/**
 * Computes allowed edge variable names: built-ins + declared in primitives.edges.variables.
 */
type AllowedEdgeVarNames<P extends PrimitivesDeclaration> = EdgeBuiltInVariableNames | ExtractDeclaredVarNames<P["edges"] extends { variables: infer V } ? V : never>;

// =============================================================================
// VALIDATED PRIMITIVES (layer variable refs must match declared vars)
// =============================================================================

/**
 * Node primitives with validated layer variable references.
 */
interface ValidatedNodePrimitives<AllowedVars extends string> {
  shapes?: readonly NodeShapeSpec[] | NodeShapeSpec[];
  variables?: VariablesDefinition;
  layers?: readonly ValidatedNodeLayerSpec<AllowedVars>[] | ValidatedNodeLayerSpec<AllowedVars>[];
}

/**
 * Edge primitives with validated layer variable references.
 */
interface ValidatedEdgePrimitives<AllowedVars extends string> {
  paths?: readonly EdgePathSpec[] | EdgePathSpec[];
  extremities?: readonly EdgeExtremitySpec[] | EdgeExtremitySpec[];
  variables?: VariablesDefinition;
  layers?: readonly ValidatedEdgeLayerSpec<AllowedVars>[] | ValidatedEdgeLayerSpec<AllowedVars>[];
}

/**
 * Primitives declaration with validated layer variable references.
 * This type ensures that variable references in layers match declared variables.
 */
interface ValidatedPrimitivesDeclaration<NodeVars extends string, EdgeVars extends string> {
  nodes?: ValidatedNodePrimitives<NodeVars>;
  edges?: ValidatedEdgePrimitives<EdgeVars>;
  layers?: string[];
}

/**
 * Options structure for inference - separates primitives for proper type flow.
 */
export interface SigmaOptionsInput<
  P extends PrimitivesDeclaration,
  NA extends Attributes = Attributes,
  EA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
> {
  primitives?: P;
  styles?: InferredStylesDeclaration<P, NA, EA, NS, ES, GS>;
}

/**
 * Validated options input that enforces variable reference constraints.
 */
export interface ValidatedSigmaOptionsInput<
  P extends PrimitivesDeclaration,
  NA extends Attributes = Attributes,
  EA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
> {
  primitives?: ValidatedPrimitivesDeclaration<AllowedNodeVarNames<P>, AllowedEdgeVarNames<P>>;
  styles?: InferredStylesDeclaration<P, NA, EA, NS, ES, GS>;
}

/**
 * Computes the styles declaration type from a primitives declaration.
 */
export type InferredStylesDeclaration<
  P extends PrimitivesDeclaration,
  NA extends Attributes = Attributes,
  EA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
> = {
  nodes?: InferredNodeStyles<P, NA, NS, GS>;
  edges?: InferredEdgeStyles<P, EA, ES, GS>;
};

/**
 * Computes node styles type from primitives.
 */
type InferredNodeStyles<
  P extends PrimitivesDeclaration,
  NA extends Attributes,
  NS extends BaseNodeState,
  GS extends BaseGraphState,
> = P["nodes"] extends NodePrimitives
  ? InferredNodeStylesFromNodePrimitives<P["nodes"], NA, NS, GS>
  : NodeStyleProperties<NA, NS, GS> | NodeStyleProperties<NA, NS, GS>[];

type InferredNodeStylesFromNodePrimitives<
  N extends NodePrimitives,
  NA extends Attributes,
  NS extends BaseNodeState,
  GS extends BaseGraphState,
> = InferredNodeStyleProperties<N, NA, NS, GS> | InferredNodeStyleRule<N, NA, NS, GS>[];

type InferredNodeStyleProperties<
  N extends NodePrimitives,
  NA extends Attributes,
  NS extends BaseNodeState,
  GS extends BaseGraphState,
  NPV = ExtractAllNodeVariables<N>,
  Shape extends string = N["shapes"] extends readonly NodeShapeSpec[]
    ? ExtractShapeNames<N["shapes"]>
    : BuiltInNodeShape,
> = Omit<NodeStyleProperties<NA, NS, GS>, "shape"> & {
  shape?: GraphicValue<NA, NS, GS, Shape>;
} & {
  [K in keyof NPV]?: GraphicValue<NA, NS, GS, NPV[K]>;
};

type InferredNodeStyleRule<
  N extends NodePrimitives,
  NA extends Attributes,
  NS extends BaseNodeState,
  GS extends BaseGraphState,
  NPV = ExtractAllNodeVariables<N>,
  Shape extends string = N["shapes"] extends readonly NodeShapeSpec[]
    ? ExtractShapeNames<N["shapes"]>
    : BuiltInNodeShape,
> =
  | InferredNodeStyleProperties<N, NA, NS, GS, NPV, Shape>
  | InlineConditional<NA, NS, GS, InferredNodeStyleProperties<N, NA, NS, GS, NPV, Shape>>;

/**
 * Computes edge styles type from primitives.
 */
type InferredEdgeStyles<
  P extends PrimitivesDeclaration,
  EA extends Attributes,
  ES extends BaseEdgeState,
  GS extends BaseGraphState,
> = P["edges"] extends EdgePrimitives
  ? InferredEdgeStylesFromEdgePrimitives<P["edges"], EA, ES, GS>
  : EdgeStyleProperties<EA, ES, GS> | EdgeStyleProperties<EA, ES, GS>[];

type InferredEdgeStylesFromEdgePrimitives<
  E extends EdgePrimitives,
  EA extends Attributes,
  ES extends BaseEdgeState,
  GS extends BaseGraphState,
> = InferredEdgeStyleProperties<E, EA, ES, GS> | InferredEdgeStyleRule<E, EA, ES, GS>[];

type InferredEdgeStyleProperties<
  E extends EdgePrimitives,
  EA extends Attributes,
  ES extends BaseEdgeState,
  GS extends BaseGraphState,
  EPV = ExtractAllEdgeVariables<E>,
  Path extends string = E["paths"] extends readonly EdgePathSpec[] ? ExtractPathNames<E["paths"]> : BuiltInEdgePath,
  Extremity extends string = E["extremities"] extends readonly EdgeExtremitySpec[]
    ? ExtractExtremityNames<E["extremities"]>
    : BuiltInEdgeExtremity,
> = Omit<EdgeStyleProperties<EA, ES, GS>, "path" | "head" | "tail"> & {
  path?: GraphicValue<EA, ES, GS, Path>;
  head?: GraphicValue<EA, ES, GS, Extremity | "none">;
  tail?: GraphicValue<EA, ES, GS, Extremity | "none">;
} & {
  [K in keyof EPV]?: GraphicValue<EA, ES, GS, EPV[K]>;
};

type InferredEdgeStyleRule<
  E extends EdgePrimitives,
  EA extends Attributes,
  ES extends BaseEdgeState,
  GS extends BaseGraphState,
  EPV = ExtractAllEdgeVariables<E>,
  Path extends string = E["paths"] extends readonly EdgePathSpec[] ? ExtractPathNames<E["paths"]> : BuiltInEdgePath,
  Extremity extends string = E["extremities"] extends readonly EdgeExtremitySpec[]
    ? ExtractExtremityNames<E["extremities"]>
    : BuiltInEdgeExtremity,
> =
  | InferredEdgeStyleProperties<E, EA, ES, GS, EPV, Path, Extremity>
  | InlineConditional<EA, ES, GS, InferredEdgeStyleProperties<E, EA, ES, GS, EPV, Path, Extremity>>;

// =============================================================================
// STYLES DECLARATION TYPE
// =============================================================================

/**
 * Full styles declaration with node and edge styles.
 * This is what gets stored on the Sigma instance.
 */
export interface StylesDeclaration<
  NA extends Attributes = Attributes,
  EA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
> {
  nodes?: NodeStyleProperties<NA, NS, GS> | NodeStyleProperties<NA, NS, GS>[];
  edges?: EdgeStyleProperties<EA, ES, GS> | EdgeStyleProperties<EA, ES, GS>[];
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function for creating type-safe sigma options.
 *
 * This function provides type safety for sigma options with automatic inference:
 * - Shapes/paths are inferred from primitives and enforced in styles
 * - Custom variables declared in primitives or used in layers become available in styles
 * - Variable references in layers are validated against declared variables
 *
 * Note: When used with the Sigma constructor, node/edge attribute types are
 * automatically inferred from the Graphology graph instance.
 *
 * @example
 * ```typescript
 * // Variables are inferred automatically from primitives and layers
 * const options = defineSigmaOptions({
 *   primitives: {
 *     nodes: {
 *       shapes: ["circle", "square"],
 *       variables: {
 *         borderSize: { type: "number", default: 2 },
 *         borderColor: { type: "color", default: "#fff" },
 *       },
 *       layers: [
 *         "fill",
 *         // Only "borderSize" and "borderColor" (+ built-ins) are valid here
 *         { type: "border", borders: [{ size: "borderSize", color: "borderColor" }] },
 *       ],
 *     },
 *     edges: { paths: ["straight", "curved"] },
 *   },
 *   styles: {
 *     nodes: {
 *       color: "#666",
 *       shape: "circle",    // Only "circle" | "square" allowed
 *       borderSize: 2,      // Inferred from variables
 *       borderColor: "#fff",
 *     },
 *     edges: {
 *       path: "straight",   // Only "straight" | "curved" allowed
 *     },
 *   },
 * });
 * ```
 */
export function defineSigmaOptions<const P extends PrimitivesDeclaration>(
  options: SigmaOptionsInput<P, Attributes, Attributes, BaseNodeState, BaseEdgeState, BaseGraphState> &
    ValidatedSigmaOptionsInput<P, Attributes, Attributes, BaseNodeState, BaseEdgeState, BaseGraphState>,
): SigmaOptionsInput<P, Attributes, Attributes, BaseNodeState, BaseEdgeState, BaseGraphState> {
  return options;
}
