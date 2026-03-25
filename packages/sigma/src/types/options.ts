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
  CustomEdgeExtremity,
  CustomEdgePath,
  CustomNodeShape,
  EdgeExtremitySpec,
  EdgePathSpec,
  EdgePrimitives,
  ExtractAllEdgeVariables,
  ExtractAllNodeVariables,
  NodePrimitives,
  NodeShapeSpec,
  PrimitivesDeclaration,
} from "../primitives";
import type { EdgeExtremity, EdgePath, SDFShape } from "../rendering";
import {
  BaseEdgeState,
  BaseGraphState,
  BaseNodeState,
  EdgeStyleProperties,
  FullEdgeState,
  FullGraphState,
  FullNodeState,
  GraphicValue,
  InlineConditional,
  NodeStyleProperties,
} from "./styles";

// =============================================================================
// NAME EXTRACTION FROM SPECS
// =============================================================================

/**
 * Extracts the name from a shape spec.
 */
type ExtractShapeName<S extends NodeShapeSpec> = S extends SDFShape
  ? S["name"]
  : S extends CustomNodeShape
    ? S["name"]
    : never;

/**
 * Extracts the name from a path spec.
 */
type ExtractPathName<P extends EdgePathSpec> = P extends EdgePath
  ? P["name"]
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
type ExtractExtremityName<E extends EdgeExtremitySpec> = E extends EdgeExtremity
  ? E["name"]
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
// OPTIONS INPUT TYPE
// =============================================================================

/**
 * Options structure for inference - separates primitives for proper type flow.
 */
export interface SigmaOptionsInput<
  P extends PrimitivesDeclaration,
  NA extends Attributes = Attributes,
  EA extends Attributes = Attributes,
  NS = {}, // additional custom node state fields
  ES = {}, // additional custom edge state fields
  GS = {}, // additional custom graph state fields
> {
  primitives?: P;
  styles?: InferredStylesDeclaration<P, NA, EA, NS, ES, GS>;
}

/**
 * Computes the styles declaration type from a primitives declaration.
 */
export type InferredStylesDeclaration<
  P extends PrimitivesDeclaration,
  NA extends Attributes = Attributes,
  EA extends Attributes = Attributes,
  NS = {}, // additional custom node state fields
  ES = {}, // additional custom edge state fields
  GS = {}, // additional custom graph state fields
> = {
  nodes?: InferredNodeStyles<P, NA, FullNodeState<NS>, FullGraphState<GS>>;
  edges?: InferredEdgeStyles<P, EA, FullEdgeState<ES>, FullGraphState<GS>>;
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
  Shape extends string = N["shapes"] extends readonly NodeShapeSpec[] ? ExtractShapeNames<N["shapes"]> : string,
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
  Shape extends string = N["shapes"] extends readonly NodeShapeSpec[] ? ExtractShapeNames<N["shapes"]> : string,
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
  Path extends string = E["paths"] extends readonly EdgePathSpec[] ? ExtractPathNames<E["paths"]> : string,
  Extremity extends string = E["extremities"] extends readonly EdgeExtremitySpec[]
    ? ExtractExtremityNames<E["extremities"]>
    : string,
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
  Path extends string = E["paths"] extends readonly EdgePathSpec[] ? ExtractPathNames<E["paths"]> : string,
  Extremity extends string = E["extremities"] extends readonly EdgeExtremitySpec[]
    ? ExtractExtremityNames<E["extremities"]>
    : string,
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
  NS = {}, // additional custom node state fields
  ES = {}, // additional custom edge state fields
  GS = {}, // additional custom graph state fields
> {
  nodes?:
    | NodeStyleProperties<NA, FullNodeState<NS>, FullGraphState<GS>>
    | NodeStyleProperties<NA, FullNodeState<NS>, FullGraphState<GS>>[];
  edges?:
    | EdgeStyleProperties<EA, FullEdgeState<ES>, FullGraphState<GS>>
    | EdgeStyleProperties<EA, FullEdgeState<ES>, FullGraphState<GS>>[];
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function for creating type-safe sigma options.
 *
 * This function provides type safety for sigma options with automatic inference:
 * - Shapes/paths are inferred from primitives and enforced in styles
 * - Custom variables declared in primitives become available in styles
 *
 * @example
 * ```typescript
 * const options = defineSigmaOptions({
 *   primitives: {
 *     nodes: {
 *       shapes: [sdfCircle(), sdfSquare()],
 *       variables: {
 *         borderSize: { type: "number", default: 2 },
 *         borderColor: { type: "color", default: "#fff" },
 *       },
 *       layers: [layerFill()],
 *     },
 *     edges: { paths: [pathLine(), pathCurved()] },
 *   },
 *   styles: {
 *     nodes: {
 *       color: "#666",
 *       shape: "circle",    // Only names from declared shapes allowed
 *       borderSize: 2,      // Inferred from variables
 *       borderColor: "#fff",
 *     },
 *   },
 * });
 * ```
 */
export function defineSigmaOptions<const P extends PrimitivesDeclaration>(
  options: SigmaOptionsInput<P>,
): SigmaOptionsInput<P> {
  return options;
}
