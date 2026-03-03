/**
 * Sigma.js v4 Primitives API - Type Definitions
 * ==============================================
 *
 * Types for the primitives declaration system.
 *
 * @module
 */
import type { EdgeExtremity, EdgeLabelOptions, EdgeLayer, EdgePath } from "../rendering/edges/types";
import type { FragmentLayer, LabelOptions, SDFShape } from "../rendering/nodes/types";

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
// NODE SHAPES
// =============================================================================

export interface CustomNodeShape {
  name: string;
  glsl: string;
  inradiusFactor?: number;
}

export type NodeShapeSpec = CustomNodeShape | SDFShape;

// =============================================================================
// NODE LAYERS
// =============================================================================

export interface CustomNodeLayer {
  name: string;
  glsl: string;
  graphicVariables: readonly GraphicVariableDefinition[];
}

export type NodeLayerSpec = CustomNodeLayer | FragmentLayer;

// =============================================================================
// EDGE PATHS
// =============================================================================

export interface CustomEdgePath {
  name: string;
  segments: number;
  glsl: string;
  graphicVariables?: readonly GraphicVariableDefinition[];
}

export type EdgePathSpec = CustomEdgePath | EdgePath;

// =============================================================================
// EDGE EXTREMITIES
// =============================================================================

export interface CustomEdgeExtremity {
  name: string;
  glsl: string;
  length: number;
  widthFactor: number;
}

export type EdgeExtremitySpec = CustomEdgeExtremity | EdgeExtremity;

// =============================================================================
// EDGE LAYERS
// =============================================================================

export interface CustomEdgeLayer {
  name: string;
  glsl: string;
  graphicVariables: readonly GraphicVariableDefinition[];
}

export type EdgeLayerSpec = CustomEdgeLayer | EdgeLayer;

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isCustomNodeLayer(spec: NodeLayerSpec): spec is CustomNodeLayer {
  return typeof spec === "object" && "glsl" in spec && !("attributes" in spec);
}

export function isCustomEdgeLayer(spec: EdgeLayerSpec): spec is CustomEdgeLayer {
  return typeof spec === "object" && "glsl" in spec && !("attributes" in spec);
}

// =============================================================================
// PRIMITIVES DECLARATIONS
// =============================================================================

/**
 * Backdrop style configuration for hover effects.
 * Values can be constants (baked into shader) or attribute references (per-node storage).
 */
export interface BackdropOptions {
  color?: string | { attribute: string; default?: string };
  shadowColor?: string | { attribute: string; default?: string };
  shadowBlur?: number | { attribute: string; default?: number };
  padding?: number | { attribute: string; default?: number };
}

/**
 * A label attachment renderer receives context about the node and returns
 * a drawable image source (canvas, image, etc.) or null to skip.
 */
export interface LabelAttachmentContext {
  node: string;
  attributes: Record<string, unknown>;
  pixelRatio: number;
  labelWidth: number;
  labelHeight: number;
}

/**
 * The content returned by a label attachment renderer.
 * - "canvas": an already-rendered HTMLCanvasElement (dimensions from canvas.width/height)
 * - "svg": an SVG string or element (dimensions parsed from width/height attributes or viewBox)
 * - "html": an HTML string or element with explicit dimensions (rendered via SVG foreignObject)
 */
export type LabelAttachmentContent =
  | { type: "canvas"; canvas: HTMLCanvasElement }
  | { type: "svg"; svg: string | SVGElement }
  | { type: "html"; html: string | HTMLElement; css?: string; width?: number; height?: number };

export type LabelAttachmentRenderer = (
  ctx: LabelAttachmentContext,
) => LabelAttachmentContent | null | Promise<LabelAttachmentContent | null>;

export interface NodePrimitives {
  shapes?: readonly NodeShapeSpec[] | NodeShapeSpec[];
  variables?: VariablesDefinition;
  layers?: readonly NodeLayerSpec[] | NodeLayerSpec[];
  rotateWithCamera?: boolean;
  label?: LabelOptions;
  backdrop?: BackdropOptions;
  labelAttachments?: Record<string, LabelAttachmentRenderer>;
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
  depthLayers?: string[];
}

// =============================================================================
// VARIABLE EXTRACTION
// =============================================================================

type VariablesDefinitionToType<V extends VariablesDefinition> = {
  [K in keyof V]: V[K]["type"] extends "number"
    ? number
    : V[K]["type"] extends "color" | "string"
      ? string
      : V[K]["type"] extends "boolean"
        ? boolean
        : unknown;
};

export type ExtractAllNodeVariables<N extends NodePrimitives> =
  N["variables"] extends VariablesDefinition ? VariablesDefinitionToType<N["variables"]> : object;

export type ExtractAllEdgeVariables<E extends EdgePrimitives> =
  E["variables"] extends VariablesDefinition ? VariablesDefinitionToType<E["variables"]> : object;

// =============================================================================
// DEFAULT VALUES
// =============================================================================

// Lazy imports to avoid circular dependencies
import { sdfCircle } from "../rendering/nodes/shapes";
import { layerFill } from "../rendering/nodes/layers";
import { pathLine } from "../rendering/edges/paths";
import { layerPlain } from "../rendering/edges/layers";

export const DEFAULT_NODE_PRIMITIVES: Required<NodePrimitives> = {
  shapes: [sdfCircle()],
  variables: {},
  layers: [layerFill()],
  rotateWithCamera: false,
  label: {},
  backdrop: {},
  labelAttachments: {},
};

export const DEFAULT_EDGE_PRIMITIVES: Required<EdgePrimitives> = {
  paths: [pathLine()],
  extremities: [],
  variables: {},
  layers: [layerPlain()],
  defaultHead: "none",
  defaultTail: "none",
  label: {},
};

export const DEFAULT_DEPTH_LAYERS = [
  "edges",
  "edgeLabels",
  "nodes",
  "nodeLabels",
  "topNodes",
  "topNodeLabels",
] as const;

export const DEFAULT_PRIMITIVES: Required<PrimitivesDeclaration> = {
  nodes: DEFAULT_NODE_PRIMITIVES,
  edges: DEFAULT_EDGE_PRIMITIVES,
  depthLayers: [...DEFAULT_DEPTH_LAYERS],
};
