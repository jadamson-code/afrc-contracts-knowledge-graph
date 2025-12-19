/**
 * Sigma.js Primitives Parser
 * ==========================
 *
 * Functions to parse primitives declarations (string, declarative, custom forms)
 * into factory outputs (SDFShape, FragmentLayer, EdgePath, etc.).
 *
 * @module
 */
import { Attributes } from "graphology-types";

import {
  SDFShape,
  FragmentLayer,
  EdgePath,
  EdgeLayer,
  EdgeExtremity,
  NodeProgramType,
  EdgeProgramType,
  createNodeProgram,
  createEdgeProgram,
} from "../rendering";
import { getFactory } from "./registry";
import {
  BuiltInNodeShape,
  DeclarativeNodeShape,
  NodeShapeSpec,
  NodeLayerSpec,
  BuiltInEdgePath,
  DeclarativeEdgePath,
  EdgePathSpec,
  EdgeLayerSpec,
  BuiltInEdgeExtremity,
  EdgeExtremitySpec,
  NodePrimitives,
  EdgePrimitives,
  isDeclarativeNodeLayer,
  isCustomNodeLayer,
  isNodeLayerShorthand,
  isDeclarativeEdgeLayer,
  isCustomEdgeLayer,
  isEdgeLayerShorthand,
  DEFAULT_NODE_PRIMITIVES,
  DEFAULT_EDGE_PRIMITIVES,
} from "./types";

// =============================================================================
// TYPE GUARDS FOR SHAPES
// =============================================================================

function isNodeShapeShorthand(spec: NodeShapeSpec): spec is BuiltInNodeShape {
  return typeof spec === "string";
}

function isDeclarativeNodeShape(spec: NodeShapeSpec): spec is DeclarativeNodeShape {
  return typeof spec === "object" && "type" in spec && !("glsl" in spec);
}

function isCustomNodeShape(spec: NodeShapeSpec): spec is { name: string; glsl: string } {
  return typeof spec === "object" && "glsl" in spec && "name" in spec;
}

// =============================================================================
// TYPE GUARDS FOR EDGE PATHS
// =============================================================================

function isEdgePathShorthand(spec: EdgePathSpec): spec is BuiltInEdgePath {
  return typeof spec === "string";
}

function isDeclarativeEdgePath(spec: EdgePathSpec): spec is DeclarativeEdgePath {
  return typeof spec === "object" && "type" in spec && !("glsl" in spec);
}

function isCustomEdgePath(spec: EdgePathSpec): spec is { name: string; glsl: string; segments: number } {
  return typeof spec === "object" && "glsl" in spec && "name" in spec;
}

// =============================================================================
// TYPE GUARDS FOR EDGE EXTREMITIES
// =============================================================================

function isEdgeExtremityShorthand(spec: EdgeExtremitySpec): spec is BuiltInEdgeExtremity {
  return typeof spec === "string";
}

function isCustomEdgeExtremity(
  spec: EdgeExtremitySpec,
): spec is { name: string; glsl: string; length: number; widthFactor: number } {
  return typeof spec === "object" && "glsl" in spec && "name" in spec;
}

// =============================================================================
// SPEC PARSERS
// =============================================================================

// Type guard for already-parsed SDFShape
function isSDFShape(spec: NodeShapeSpec): spec is SDFShape {
  return typeof spec === "object" && "uniforms" in spec && Array.isArray(spec.uniforms);
}

// Type guard for already-parsed FragmentLayer
function isFragmentLayer(spec: NodeLayerSpec): spec is FragmentLayer {
  return typeof spec === "object" && "uniforms" in spec && "attributes" in spec && "glsl" in spec;
}

// Type guard for already-parsed EdgePath
function isEdgePath(spec: EdgePathSpec): spec is EdgePath {
  return (
    typeof spec === "object" && "uniforms" in spec && "attributes" in spec && "vertexGlsl" in spec && "segments" in spec
  );
}

// Type guard for already-parsed EdgeExtremity
function isEdgeExtremity(spec: EdgeExtremitySpec): spec is EdgeExtremity {
  return typeof spec === "object" && "uniforms" in spec && "attributes" in spec && "length" in spec;
}

// Type guard for already-parsed EdgeLayer
function isEdgeLayer(spec: EdgeLayerSpec): spec is EdgeLayer {
  return typeof spec === "object" && "uniforms" in spec && "attributes" in spec && "glsl" in spec;
}

/**
 * Parses a node shape specification into an SDFShape.
 *
 * @param spec - Shape specification (string, declarative, or custom)
 * @returns SDFShape instance
 * @throws Error if factory not found for built-in shapes
 */
export function parseNodeShape(spec: NodeShapeSpec): SDFShape {
  // Already a parsed SDFShape - return as-is
  if (isSDFShape(spec)) {
    return spec;
  }

  if (isNodeShapeShorthand(spec)) {
    // String form: "circle" -> getFactory("nodeShape", "circle")()
    const factory = getFactory("nodeShape", spec);
    if (!factory) {
      throw new Error(`Unknown node shape: "${spec}". Make sure the shape is registered.`);
    }
    return factory();
  }

  if (isDeclarativeNodeShape(spec)) {
    // Declarative form: { type: "circle", ... } -> getFactory("nodeShape", "circle")(config)
    const { type, ...config } = spec;
    const factory = getFactory("nodeShape", type);
    if (!factory) {
      throw new Error(`Unknown node shape: "${type}". Make sure the shape is registered.`);
    }
    return factory(config);
  }

  if (isCustomNodeShape(spec)) {
    // Custom form: { name: "...", glsl: "..." } -> use directly as SDFShape
    return {
      name: spec.name,
      glsl: spec.glsl,
      inradiusFactor: spec.inradiusFactor,
      uniforms: [],
    };
  }

  throw new Error(`Invalid node shape specification: ${JSON.stringify(spec)}`);
}

/**
 * Parses a node layer specification into a FragmentLayer.
 *
 * @param spec - Layer specification (string, declarative, or custom)
 * @returns FragmentLayer instance
 * @throws Error if factory not found for built-in layers
 */
export function parseNodeLayer(spec: NodeLayerSpec): FragmentLayer {
  // Already a parsed FragmentLayer - return as-is
  if (isFragmentLayer(spec)) {
    return spec;
  }

  if (isNodeLayerShorthand(spec)) {
    // String form: "fill" -> getFactory("nodeLayer", "fill")()
    const factory = getFactory("nodeLayer", spec);
    if (!factory) {
      throw new Error(`Unknown node layer: "${spec}". Make sure the layer is registered.`);
    }
    return factory();
  }

  if (isDeclarativeNodeLayer(spec)) {
    // Declarative form: { type: "fill", color: "myVar" } -> getFactory("nodeLayer", "fill")({ color: { attribute: "myVar" } })
    const { type, ...config } = spec;
    const factory = getFactory("nodeLayer", type);
    if (!factory) {
      throw new Error(`Unknown node layer: "${type}". Make sure the layer is registered.`);
    }
    // Transform variable references (strings) into attribute sources
    const resolvedConfig = resolveVariableReferences(config);
    return factory(resolvedConfig);
  }

  if (isCustomNodeLayer(spec)) {
    // Custom form: { name: "...", glsl: "...", graphicVariables: [...] }
    return {
      name: spec.name,
      glsl: spec.glsl,
      uniforms: [],
      attributes: [],
    };
  }

  throw new Error(`Invalid node layer specification: ${JSON.stringify(spec)}`);
}

/**
 * Parses an edge path specification into an EdgePath.
 *
 * @param spec - Path specification (string, declarative, or custom)
 * @returns EdgePath instance
 * @throws Error if factory not found for built-in paths
 */
export function parseEdgePath(spec: EdgePathSpec): EdgePath {
  // Already a parsed EdgePath - return as-is
  if (isEdgePath(spec)) {
    return spec;
  }

  if (isEdgePathShorthand(spec)) {
    // String form: "line" -> getFactory("edgePath", "line")()
    const factory = getFactory("edgePath", spec);
    if (!factory) {
      throw new Error(`Unknown edge path: "${spec}". Make sure the path is registered.`);
    }
    return factory();
  }

  if (isDeclarativeEdgePath(spec)) {
    // Declarative form: { type: "curved", curvature: 0.5 }
    const { type, ...config } = spec;
    const factory = getFactory("edgePath", type);
    if (!factory) {
      throw new Error(`Unknown edge path: "${type}". Make sure the path is registered.`);
    }
    const resolvedConfig = resolveVariableReferences(config);
    return factory(resolvedConfig);
  }

  if (isCustomEdgePath(spec)) {
    // Custom form: { name: "...", glsl: "...", segments: 10 }
    return {
      name: spec.name,
      glsl: spec.glsl,
      segments: spec.segments,
      vertexGlsl: "", // Custom paths use standard parametric tessellation
      uniforms: [],
      attributes: [],
    };
  }

  throw new Error(`Invalid edge path specification: ${JSON.stringify(spec)}`);
}

/**
 * Parses an edge layer specification into an EdgeLayer.
 *
 * @param spec - Layer specification (string, declarative, or custom)
 * @returns EdgeLayer instance
 * @throws Error if factory not found for built-in layers
 */
export function parseEdgeLayer(spec: EdgeLayerSpec): EdgeLayer {
  // Already a parsed EdgeLayer - return as-is
  if (isEdgeLayer(spec)) {
    return spec;
  }

  if (isEdgeLayerShorthand(spec)) {
    // String form: "plain" -> getFactory("edgeLayer", "plain")()
    const factory = getFactory("edgeLayer", spec);
    if (!factory) {
      throw new Error(`Unknown edge layer: "${spec}". Make sure the layer is registered.`);
    }
    return factory();
  }

  if (isDeclarativeEdgeLayer(spec)) {
    // Declarative form: { type: "plain", color: "#ff0000" }
    const { type, ...config } = spec;
    const factory = getFactory("edgeLayer", type);
    if (!factory) {
      throw new Error(`Unknown edge layer: "${type}". Make sure the layer is registered.`);
    }
    const resolvedConfig = resolveVariableReferences(config);
    return factory(resolvedConfig);
  }

  if (isCustomEdgeLayer(spec)) {
    // Custom form: { name: "...", glsl: "...", graphicVariables: [...] }
    return {
      name: spec.name,
      glsl: spec.glsl,
      uniforms: [],
      attributes: [],
    };
  }

  throw new Error(`Invalid edge layer specification: ${JSON.stringify(spec)}`);
}

/**
 * Parses an edge extremity specification into an EdgeExtremity.
 *
 * @param spec - Extremity specification (string or custom)
 * @returns EdgeExtremity instance
 * @throws Error if factory not found for built-in extremities
 */
export function parseEdgeExtremity(spec: EdgeExtremitySpec): EdgeExtremity | null {
  // "none" is handled internally by createEdgeProgram, return null to skip
  if (spec === "none") {
    return null;
  }

  // Already a parsed EdgeExtremity - return as-is
  if (isEdgeExtremity(spec)) {
    return spec;
  }

  if (isEdgeExtremityShorthand(spec)) {
    // String form: "arrow" -> getFactory("edgeExtremity", "arrow")()
    const factory = getFactory("edgeExtremity", spec);
    if (!factory) {
      throw new Error(`Unknown edge extremity: "${spec}". Make sure the extremity is registered.`);
    }
    return factory();
  }

  if (isCustomEdgeExtremity(spec)) {
    // Custom form: { name: "...", glsl: "...", length: 5, widthFactor: 4 }
    return {
      name: spec.name,
      glsl: spec.glsl,
      length: spec.length,
      widthFactor: spec.widthFactor,
      margin: 0,
      uniforms: [],
      attributes: [],
    };
  }

  throw new Error(`Invalid edge extremity specification: ${JSON.stringify(spec)}`);
}

// =============================================================================
// PRIMITIVES PARSERS
// =============================================================================

export interface ParsedNodePrimitives {
  shapes: SDFShape[];
  layers: FragmentLayer[];
}

export interface ParsedEdgePrimitives {
  paths: EdgePath[];
  extremities: EdgeExtremity[];
  layers: EdgeLayer[];
}

/**
 * Parses node primitives declaration into arrays of factory outputs.
 *
 * @param nodePrimitives - Node primitives declaration (may be undefined)
 * @returns Parsed shapes and layers ready for createNodeProgram
 */
export function parseNodePrimitives(nodePrimitives?: NodePrimitives): ParsedNodePrimitives {
  const shapesSpecs = nodePrimitives?.shapes ?? DEFAULT_NODE_PRIMITIVES.shapes;
  const layersSpecs = nodePrimitives?.layers ?? DEFAULT_NODE_PRIMITIVES.layers;

  const shapes = shapesSpecs.map(parseNodeShape);
  const layers = layersSpecs.map(parseNodeLayer);

  if (shapes.length === 0) {
    throw new Error("At least one node shape must be specified.");
  }
  if (layers.length === 0) {
    throw new Error("At least one node layer must be specified.");
  }

  return { shapes, layers };
}

/**
 * Parses edge primitives declaration into arrays of factory outputs.
 *
 * @param edgePrimitives - Edge primitives declaration (may be undefined)
 * @returns Parsed paths, extremities, and layers ready for createEdgeProgram
 */
export function parseEdgePrimitives(edgePrimitives?: EdgePrimitives): ParsedEdgePrimitives {
  const pathsSpecs = edgePrimitives?.paths ?? DEFAULT_EDGE_PRIMITIVES.paths;
  const extremitiesSpecs = edgePrimitives?.extremities ?? DEFAULT_EDGE_PRIMITIVES.extremities;
  const layersSpecs = edgePrimitives?.layers ?? DEFAULT_EDGE_PRIMITIVES.layers;

  const paths = pathsSpecs.map(parseEdgePath);
  const extremities = extremitiesSpecs
    .map(parseEdgeExtremity)
    .filter((e): e is EdgeExtremity => e !== null);
  const layers = layersSpecs.map(parseEdgeLayer);

  if (paths.length === 0) {
    throw new Error("At least one edge path must be specified.");
  }
  if (layers.length === 0) {
    throw new Error("At least one edge layer must be specified.");
  }

  return { paths, extremities, layers };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Transforms string values (variable references) in a config object
 * into { attribute: varName } format for factory consumption.
 *
 * This handles the declarative API where users write:
 *   { type: "fill", color: "myColorVar" }
 *
 * And it gets transformed to:
 *   { color: { attribute: "myColorVar" } }
 */
function resolveVariableReferences(config: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string") {
      // String values are treated as variable references -> { attribute: value }
      resolved[key] = { attribute: value };
    } else if (Array.isArray(value)) {
      // Arrays need recursive handling for nested objects (e.g., borders array)
      resolved[key] = value.map((item) => {
        if (typeof item === "object" && item !== null) {
          return resolveVariableReferences(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (typeof value === "object" && value !== null) {
      // Nested objects need recursive handling
      // But if it's already an attribute source { attribute: ... }, keep it as-is
      if ("attribute" in value) {
        resolved[key] = value;
      } else {
        resolved[key] = resolveVariableReferences(value as Record<string, unknown>);
      }
    } else {
      // Numbers, booleans, etc. pass through unchanged
      resolved[key] = value;
    }
  }

  return resolved;
}

// =============================================================================
// PROGRAM GENERATION
// =============================================================================

/**
 * Generates a NodeProgram from a primitives declaration.
 *
 * This is a high-level function that:
 * 1. Parses the node primitives specs into factory outputs
 * 2. Calls createNodeProgram with the parsed shapes and layers
 *
 * @param nodePrimitives - Node primitives declaration
 * @returns NodeProgram class ready for use with Sigma
 *
 * @example
 * ```typescript
 * const NodeProgram = generateNodeProgram({
 *   shapes: ["circle", "square"],
 *   layers: ["fill", { type: "border", size: 2, color: "#fff" }],
 * });
 *
 * const sigma = new Sigma(graph, container, {
 *   nodeProgramClasses: { default: NodeProgram },
 * });
 * ```
 */
export function generateNodeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(nodePrimitives?: NodePrimitives): NodeProgramType<N, E, G> {
  const { shapes, layers } = parseNodePrimitives(nodePrimitives);

  return createNodeProgram<N, E, G>({
    shapes,
    layers,
    rotateWithCamera: nodePrimitives?.rotateWithCamera,
  });
}

/**
 * Generates an EdgeProgram from a primitives declaration.
 *
 * This is a high-level function that:
 * 1. Parses the edge primitives specs into factory outputs
 * 2. Calls createEdgeProgram with the parsed paths, extremities, and layers
 *
 * @param edgePrimitives - Edge primitives declaration
 * @returns EdgeProgram class ready for use with Sigma
 *
 * @example
 * ```typescript
 * const EdgeProgram = generateEdgeProgram({
 *   paths: ["line", "curved"],
 *   extremities: ["arrow"],
 *   layers: ["plain"],
 * });
 *
 * const sigma = new Sigma(graph, container, {
 *   edgeProgramClasses: { default: EdgeProgram },
 * });
 * ```
 */
export function generateEdgeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(edgePrimitives?: EdgePrimitives): EdgeProgramType<N, E, G> {
  const { paths, extremities, layers } = parseEdgePrimitives(edgePrimitives);

  return createEdgeProgram<N, E, G>({
    paths,
    extremities,
    layers,
  });
}
