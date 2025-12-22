/**
 * Sigma.js v4 Primitives API - Type Definitions
 * ==============================================
 *
 * Generic types for the primitives declaration system.
 * All types are derived from schema registries, allowing external packages
 * to register new primitives via module augmentation.
 *
 * @module
 */
import type { EdgeExtremity, EdgeLabelOptions, EdgeLayer, EdgePath } from "../rendering/edges/types";
import type { FragmentLayer, LabelOptions, SDFShape } from "../rendering/nodes/types";

import {
  DeclarativeConfigFromSchema,
  EdgeExtremitySchemaRegistry,
  EdgeLayerSchemaRegistry,
  EdgePathSchemaRegistry,
  ExtractVariablesFromConfig,
  NodeLayerSchemaRegistry,
  NodeShapeSchemaRegistry,
  UnionToIntersection,
  ValidatedConfigFromSchema,
} from "./schema";

// =============================================================================
// GRAPHIC VARIABLES
// =============================================================================

export type GraphicVariableType = "number" | "string" | "color" | "boolean";

export interface GraphicVariableDefinition<T = unknown> {
  type: GraphicVariableType;
  default: T;
}

export type VariablesDefinition = Record<string, GraphicVariableDefinition>;

// =============================================================================
// NODE SHAPES (schema-derived)
// =============================================================================

export type BuiltInNodeShape = keyof NodeShapeSchemaRegistry;

export type DeclarativeNodeShape = {
  [K in keyof NodeShapeSchemaRegistry]: { type: K } & DeclarativeConfigFromSchema<NodeShapeSchemaRegistry[K]>;
}[keyof NodeShapeSchemaRegistry];

export interface CustomNodeShape {
  name: string;
  glsl: string;
  inradiusFactor?: number;
}

export type NodeShapeSpec = BuiltInNodeShape | DeclarativeNodeShape | CustomNodeShape | SDFShape;

// =============================================================================
// NODE LAYERS (schema-derived)
// =============================================================================

export type BuiltInNodeLayerType = keyof NodeLayerSchemaRegistry;

export type DeclarativeNodeLayer = {
  [K in keyof NodeLayerSchemaRegistry]: { type: K } & DeclarativeConfigFromSchema<NodeLayerSchemaRegistry[K]>;
}[keyof NodeLayerSchemaRegistry];

export interface CustomNodeLayer {
  name: string;
  glsl: string;
  graphicVariables: readonly GraphicVariableDefinition[];
}

export type NodeLayerSpec = BuiltInNodeLayerType | DeclarativeNodeLayer | CustomNodeLayer | FragmentLayer;

// =============================================================================
// VALIDATED NODE LAYERS (context-aware variable validation)
// =============================================================================

/**
 * Validated declarative node layer that only accepts declared variable names.
 * Used by defineSigmaOptions to ensure variable references are valid.
 */
export type ValidatedDeclarativeNodeLayer<AllowedVars extends string> = {
  [K in keyof NodeLayerSchemaRegistry]: { type: K } & ValidatedConfigFromSchema<NodeLayerSchemaRegistry[K], AllowedVars>;
}[keyof NodeLayerSchemaRegistry];

/**
 * Node layer spec with validated variable references.
 */
export type ValidatedNodeLayerSpec<AllowedVars extends string> =
  | BuiltInNodeLayerType
  | ValidatedDeclarativeNodeLayer<AllowedVars>
  | CustomNodeLayer;

// =============================================================================
// EDGE PATHS (schema-derived)
// =============================================================================

export type BuiltInEdgePath = keyof EdgePathSchemaRegistry;

export type DeclarativeEdgePath = {
  [K in keyof EdgePathSchemaRegistry]: { type: K } & DeclarativeConfigFromSchema<EdgePathSchemaRegistry[K]>;
}[keyof EdgePathSchemaRegistry];

export interface CustomEdgePath {
  name: string;
  segments: number;
  glsl: string;
  graphicVariables?: readonly GraphicVariableDefinition[];
}

export type EdgePathSpec = BuiltInEdgePath | DeclarativeEdgePath | CustomEdgePath | EdgePath;

// =============================================================================
// EDGE EXTREMITIES (schema-derived)
// =============================================================================

export type BuiltInEdgeExtremity = keyof EdgeExtremitySchemaRegistry | "none";

export interface CustomEdgeExtremity {
  name: string;
  glsl: string;
  length: number;
  widthFactor: number;
}

export type EdgeExtremitySpec = BuiltInEdgeExtremity | CustomEdgeExtremity | EdgeExtremity;

// =============================================================================
// EDGE LAYERS (schema-derived)
// =============================================================================

export type BuiltInEdgeLayerType = keyof EdgeLayerSchemaRegistry;

export type DeclarativeEdgeLayer = {
  [K in keyof EdgeLayerSchemaRegistry]: { type: K } & DeclarativeConfigFromSchema<EdgeLayerSchemaRegistry[K]>;
}[keyof EdgeLayerSchemaRegistry];

export interface CustomEdgeLayer {
  name: string;
  glsl: string;
  graphicVariables: readonly GraphicVariableDefinition[];
}

export type EdgeLayerSpec = BuiltInEdgeLayerType | DeclarativeEdgeLayer | CustomEdgeLayer | EdgeLayer;

// =============================================================================
// VALIDATED EDGE LAYERS (context-aware variable validation)
// =============================================================================

/**
 * Validated declarative edge layer that only accepts declared variable names.
 */
export type ValidatedDeclarativeEdgeLayer<AllowedVars extends string> = {
  [K in keyof EdgeLayerSchemaRegistry]: { type: K } & ValidatedConfigFromSchema<EdgeLayerSchemaRegistry[K], AllowedVars>;
}[keyof EdgeLayerSchemaRegistry];

/**
 * Edge layer spec with validated variable references.
 */
export type ValidatedEdgeLayerSpec<AllowedVars extends string> =
  | BuiltInEdgeLayerType
  | ValidatedDeclarativeEdgeLayer<AllowedVars>
  | CustomEdgeLayer;

// =============================================================================
// PRIMITIVES DECLARATIONS
// =============================================================================

export interface NodePrimitives {
  shapes?: readonly NodeShapeSpec[] | NodeShapeSpec[];
  variables?: VariablesDefinition;
  layers?: readonly NodeLayerSpec[] | NodeLayerSpec[];
  rotateWithCamera?: boolean;
  label?: LabelOptions;
}

export interface EdgePrimitives {
  paths?: readonly EdgePathSpec[] | EdgePathSpec[];
  extremities?: readonly EdgeExtremitySpec[] | EdgeExtremitySpec[];
  variables?: VariablesDefinition;
  layers?: readonly EdgeLayerSpec[] | EdgeLayerSpec[];
  defaultHead?: string;
  defaultTail?: string;
  label?: EdgeLabelOptions;
}

export interface PrimitivesDeclaration {
  nodes?: NodePrimitives;
  edges?: EdgePrimitives;
  layers?: string[];
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isNodeLayerShorthand(spec: NodeLayerSpec): spec is BuiltInNodeLayerType {
  return typeof spec === "string";
}

export function isDeclarativeNodeLayer(spec: NodeLayerSpec): spec is DeclarativeNodeLayer {
  return typeof spec === "object" && "type" in spec;
}

export function isCustomNodeLayer(spec: NodeLayerSpec): spec is CustomNodeLayer {
  return typeof spec === "object" && "glsl" in spec;
}

export function isEdgeLayerShorthand(spec: EdgeLayerSpec): spec is BuiltInEdgeLayerType {
  return typeof spec === "string";
}

export function isDeclarativeEdgeLayer(spec: EdgeLayerSpec): spec is DeclarativeEdgeLayer {
  return typeof spec === "object" && "type" in spec;
}

export function isCustomEdgeLayer(spec: EdgeLayerSpec): spec is CustomEdgeLayer {
  return typeof spec === "object" && "glsl" in spec;
}

// =============================================================================
// VARIABLE EXTRACTION (generic, schema-based)
// =============================================================================

type ExtractNodeShapeVariables<S> = S extends { type: infer T extends keyof NodeShapeSchemaRegistry }
  ? ExtractVariablesFromConfig<Omit<S, "type">, NodeShapeSchemaRegistry[T]>
  : object;

type ExtractNodeLayerVariables<L> = L extends { type: infer T extends keyof NodeLayerSchemaRegistry }
  ? ExtractVariablesFromConfig<Omit<L, "type">, NodeLayerSchemaRegistry[T]>
  : object;

type ExtractEdgePathVariables<P> = P extends { type: infer T extends keyof EdgePathSchemaRegistry }
  ? ExtractVariablesFromConfig<Omit<P, "type">, EdgePathSchemaRegistry[T]>
  : object;

type ExtractEdgeLayerVariables<L> = L extends { type: infer T extends keyof EdgeLayerSchemaRegistry }
  ? ExtractVariablesFromConfig<Omit<L, "type">, EdgeLayerSchemaRegistry[T]>
  : object;

type VariablesDefinitionToType<V extends VariablesDefinition> = {
  [K in keyof V]: V[K]["type"] extends "number"
    ? number
    : V[K]["type"] extends "color" | "string"
      ? string
      : V[K]["type"] extends "boolean"
        ? boolean
        : unknown;
};

type ExtractNodeShapesVariables<Shapes extends readonly NodeShapeSpec[]> = Shapes extends readonly [
  infer First extends NodeShapeSpec,
  ...infer Rest extends NodeShapeSpec[],
]
  ? ExtractNodeShapeVariables<First> & ExtractNodeShapesVariables<Rest>
  : object;

type ExtractNodeLayersVariables<Layers extends readonly NodeLayerSpec[]> = Layers extends readonly [
  infer First extends NodeLayerSpec,
  ...infer Rest extends NodeLayerSpec[],
]
  ? ExtractNodeLayerVariables<First> & ExtractNodeLayersVariables<Rest>
  : object;

type ExtractEdgePathsVariables<Paths extends readonly EdgePathSpec[]> = Paths extends readonly [
  infer First extends EdgePathSpec,
  ...infer Rest extends EdgePathSpec[],
]
  ? ExtractEdgePathVariables<First> & ExtractEdgePathsVariables<Rest>
  : object;

type ExtractEdgeLayersVariables<Layers extends readonly EdgeLayerSpec[]> = Layers extends readonly [
  infer First extends EdgeLayerSpec,
  ...infer Rest extends EdgeLayerSpec[],
]
  ? ExtractEdgeLayerVariables<First> & ExtractEdgeLayersVariables<Rest>
  : object;

export type ExtractAllNodeVariables<N extends NodePrimitives> = UnionToIntersection<
  | (N["variables"] extends VariablesDefinition ? VariablesDefinitionToType<N["variables"]> : object)
  | (N["shapes"] extends readonly NodeShapeSpec[] ? ExtractNodeShapesVariables<N["shapes"]> : object)
  | (N["layers"] extends readonly NodeLayerSpec[] ? ExtractNodeLayersVariables<N["layers"]> : object)
>;

export type ExtractAllEdgeVariables<E extends EdgePrimitives> = UnionToIntersection<
  | (E["variables"] extends VariablesDefinition ? VariablesDefinitionToType<E["variables"]> : object)
  | (E["paths"] extends readonly EdgePathSpec[] ? ExtractEdgePathsVariables<E["paths"]> : object)
  | (E["layers"] extends readonly EdgeLayerSpec[] ? ExtractEdgeLayersVariables<E["layers"]> : object)
>;

// =============================================================================
// DEFAULT VALUES
// =============================================================================

export const DEFAULT_NODE_PRIMITIVES: Required<NodePrimitives> = {
  shapes: ["circle" as BuiltInNodeShape],
  variables: {},
  layers: ["fill" as BuiltInNodeLayerType],
  rotateWithCamera: false,
  label: {},
};

export const DEFAULT_EDGE_PRIMITIVES: Required<EdgePrimitives> = {
  paths: ["straight" as BuiltInEdgePath],
  extremities: ["none"],
  variables: {},
  layers: ["plain" as BuiltInEdgeLayerType],
  defaultHead: "none",
  defaultTail: "none",
  label: {},
};

export const DEFAULT_DEPTH_LAYERS = ["edges", "nodes", "edgeLabels", "nodeLabels"] as const;

export const DEFAULT_PRIMITIVES: Required<PrimitivesDeclaration> = {
  nodes: DEFAULT_NODE_PRIMITIVES,
  edges: DEFAULT_EDGE_PRIMITIVES,
  layers: [...DEFAULT_DEPTH_LAYERS],
};
