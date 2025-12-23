/**
 * Sigma.js v4 Style Evaluation System
 * ====================================
 *
 * Functions for resolving GraphicValue declarations to actual values.
 *
 * @module
 */
import { AbstractGraph } from "graphology-types";

import {
  Attributes,
  AttributeBinding,
  BaseEdgeState,
  BaseGraphState,
  BaseNodeState,
  CategoricalAttributeBinding,
  DirectAttributeBinding,
  EasingFunction,
  GraphicValue,
  InlineConditional,
  isAttributeBinding,
  isInlineConditional,
  isValueFunction,
  NumericalAttributeBinding,
  StatePredicate,
  ValueFunction,
} from "../types/styles";

/**
 * Built-in easing functions for numerical interpolation.
 */
const EASING_FUNCTIONS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  quadraticIn: (t) => t * t,
  quadraticOut: (t) => t * (2 - t),
  quadraticInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => --t * t * t + 1,
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  exponentialIn: (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  exponentialOut: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  exponentialInOut: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) return Math.pow(2, 10 * (2 * t - 1)) / 2;
    return (2 - Math.pow(2, -10 * (2 * t - 1))) / 2;
  },
};

/**
 * Get an easing function from its name or return the function directly.
 */
function getEasingFunction(easing: EasingFunction | undefined): (t: number) => number {
  if (!easing) return EASING_FUNCTIONS.linear;
  if (typeof easing === "function") return easing;
  return EASING_FUNCTIONS[easing] || EASING_FUNCTIONS.linear;
}

/**
 * Type guard: checks if a binding has numerical range properties.
 */
function isNumericalBinding(binding: AttributeBinding<unknown>): binding is NumericalAttributeBinding {
  return "min" in binding || "max" in binding || "minValue" in binding || "maxValue" in binding || "easing" in binding;
}

/**
 * Type guard: checks if a binding has categorical dict property.
 */
function isCategoricalBinding<T>(binding: AttributeBinding<T>): binding is CategoricalAttributeBinding<T> {
  return "dict" in binding;
}

/**
 * Evaluates a state predicate against the current state.
 *
 * @param predicate - The predicate to evaluate
 * @param attributes - The element's attributes
 * @param state - The element's state (node or edge)
 * @param graphState - The graph-level state
 * @param graph - The graph instance
 * @returns Whether the predicate matches
 */
export function evaluateStatePredicate<
  A extends Attributes = Attributes,
  S extends BaseNodeState | BaseEdgeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
>(predicate: StatePredicate<A, S, GS>, attributes: A, state: S, graphState: GS, graph: AbstractGraph): boolean {
  // Function predicate: call it directly
  if (typeof predicate === "function") {
    return predicate(attributes, state, graphState, graph);
  }

  // String predicate: single flag name
  if (typeof predicate === "string") {
    return state[predicate as keyof S] === true;
  }

  // Array predicate: all flags must be true (AND logic)
  if (Array.isArray(predicate)) {
    return predicate.every((flag) => state[flag as keyof S] === true);
  }

  // Object predicate: all specified values must match (AND logic)
  if (typeof predicate === "object" && predicate !== null) {
    return Object.entries(predicate).every(([key, value]) => state[key as keyof S] === value);
  }

  return false;
}

/**
 * Resolves a direct attribute binding to its value.
 */
function resolveDirectBinding<T>(binding: DirectAttributeBinding<T>, attributes: Attributes): T | undefined {
  const value = attributes[binding.attribute];
  if (value === undefined) {
    return binding.defaultValue;
  }
  return value as T;
}

/**
 * Resolves a numerical attribute binding with range mapping.
 */
function resolveNumericalBinding(
  binding: NumericalAttributeBinding,
  attributes: Attributes,
  _graph: AbstractGraph,
): number | undefined {
  const rawValue = attributes[binding.attribute];
  if (rawValue === undefined) {
    return binding.defaultValue;
  }

  const value = Number(rawValue);
  if (isNaN(value)) {
    return binding.defaultValue;
  }

  // If no range mapping, return the raw value
  if (binding.min === undefined && binding.max === undefined) {
    return value;
  }

  // Get data range bounds (use provided or default to value itself)
  const minValue = binding.minValue ?? value;
  const maxValue = binding.maxValue ?? value;

  // Avoid division by zero
  if (maxValue === minValue) {
    return binding.min ?? value;
  }

  // Normalize to 0-1 range
  let t = (value - minValue) / (maxValue - minValue);
  t = Math.max(0, Math.min(1, t)); // Clamp

  // Apply easing
  const easingFn = getEasingFunction(binding.easing);
  t = easingFn(t);

  // Map to output range
  const min = binding.min ?? 0;
  const max = binding.max ?? 1;
  return min + t * (max - min);
}

/**
 * Resolves a categorical attribute binding via dictionary lookup.
 */
function resolveCategoricalBinding<T>(
  binding: CategoricalAttributeBinding<T>,
  attributes: Attributes,
): T | undefined {
  const value = attributes[binding.attribute];
  if (value === undefined) {
    return binding.defaultValue;
  }

  const key = String(value);
  if (key in binding.dict) {
    return binding.dict[key];
  }

  return binding.defaultValue;
}

/**
 * Resolves an attribute binding to its value.
 */
function resolveAttributeBinding<T>(
  binding: AttributeBinding<T>,
  attributes: Attributes,
  graph: AbstractGraph,
): T | undefined {
  if (isCategoricalBinding(binding)) {
    return resolveCategoricalBinding(binding, attributes);
  }

  if (isNumericalBinding(binding)) {
    return resolveNumericalBinding(binding, attributes, graph) as T | undefined;
  }

  return resolveDirectBinding(binding as DirectAttributeBinding<T>, attributes);
}

/**
 * Resolves an inline conditional to its value.
 */
function resolveInlineConditional<
  A extends Attributes,
  S extends BaseNodeState | BaseEdgeState,
  GS extends BaseGraphState,
  T,
>(
  conditional: InlineConditional<A, S, GS, T>,
  attributes: A,
  state: S,
  graphState: GS,
  graph: AbstractGraph,
  defaultValue: T,
): T {
  const matches = evaluateStatePredicate(conditional.when, attributes, state, graphState, graph);

  const branch = matches ? conditional.then : conditional.else;

  if (branch === undefined) {
    return defaultValue;
  }

  // Recursively resolve the branch value
  return resolveGraphicValue(branch as GraphicValue<A, S, GS, T>, attributes, state, graphState, graph, defaultValue);
}

/**
 * Resolves a GraphicValue to its actual value.
 *
 * This is the main entry point for style resolution. It handles all value types:
 * - Literal values (pass-through)
 * - Attribute bindings (direct, numerical range, categorical dict)
 * - Function values
 * - Inline conditionals
 *
 * @param value - The GraphicValue to resolve
 * @param attributes - The element's attributes
 * @param state - The element's state (node or edge)
 * @param graphState - The graph-level state
 * @param graph - The graph instance
 * @param defaultValue - Default value if resolution fails
 * @returns The resolved value
 */
export function resolveGraphicValue<
  A extends Attributes = Attributes,
  S extends BaseNodeState | BaseEdgeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  T = unknown,
>(value: GraphicValue<A, S, GS, T>, attributes: A, state: S, graphState: GS, graph: AbstractGraph, defaultValue: T): T {
  // Null/undefined: return default
  if (value === null || value === undefined) {
    return defaultValue;
  }

  // Inline conditional: { when, then, else }
  if (isInlineConditional<A, S, GS, T>(value)) {
    return resolveInlineConditional(value, attributes, state, graphState, graph, defaultValue);
  }

  // Function value: call it
  if (isValueFunction<A, S, GS, T>(value)) {
    const result = (value as ValueFunction<A, S, GS, T>)(attributes, state, graphState, graph);
    return result ?? defaultValue;
  }

  // Attribute binding: resolve it
  if (isAttributeBinding<T>(value)) {
    const result = resolveAttributeBinding(value, attributes, graph);
    return result ?? defaultValue;
  }

  // Literal value: pass-through
  return value as T;
}

/**
 * Resolved node style values (all properties resolved to concrete values).
 */
export interface ResolvedNodeStyle {
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  shape: string;
  visibility: "visible" | "hidden";
  layer: string;
  zIndex: number;
  label: string;
  labelColor: string;
  labelSize: number;
  labelFont: string;
  labelVisibility: "auto" | "visible" | "hidden";
  labelPosition: "right" | "left" | "above" | "below" | "over";
  labelAngle: number;
  labelLayer: string;
  backdropColor: string;
  backdropShadowColor: string;
  backdropShadowBlur: number;
  backdropPadding: number;
  // Additional program-declared variables stored here
  [key: string]: unknown;
}

/**
 * Resolved edge style values (all properties resolved to concrete values).
 */
export interface ResolvedEdgeStyle {
  size: number;
  color: string;
  opacity: number;
  path: string;
  tail: string;
  head: string;
  visibility: "visible" | "hidden";
  layer: string;
  zIndex: number;
  label: string;
  labelColor: string;
  labelSize: number;
  labelFont: string;
  labelVisibility: "auto" | "visible" | "hidden";
  labelPosition: number | "over" | "above" | "below" | "auto";
  labelLayer: string;
  // Additional program-declared variables stored here
  [key: string]: unknown;
}

/**
 * Default values for resolved node styles.
 */
const DEFAULT_RESOLVED_NODE_STYLE: ResolvedNodeStyle = {
  x: 0,
  y: 0,
  size: 10,
  color: "#666",
  opacity: 1,
  shape: "circle",
  visibility: "visible",
  layer: "nodes",
  zIndex: 0,
  label: "",
  labelColor: "#000",
  labelSize: 12,
  labelFont: "Arial, sans-serif",
  labelVisibility: "auto",
  labelPosition: "right",
  labelAngle: 0,
  labelLayer: "nodeLabels",
  backdropColor: "transparent",
  backdropShadowColor: "transparent",
  backdropShadowBlur: 0,
  backdropPadding: 0,
};

/**
 * Default values for resolved edge styles.
 */
const DEFAULT_RESOLVED_EDGE_STYLE: ResolvedEdgeStyle = {
  size: 1,
  color: "#ccc",
  opacity: 1,
  path: "straight",
  tail: "none",
  head: "none",
  visibility: "visible",
  layer: "edges",
  zIndex: 0,
  label: "",
  labelColor: "#666",
  labelSize: 10,
  labelFont: "Arial, sans-serif",
  labelVisibility: "auto",
  labelPosition: 0.5,
  labelLayer: "edgeLabels",
};

/**
 * Evaluates a complete node style declaration for a specific node.
 *
 * @param styleDeclaration - The style declaration (object or array of rules)
 * @param attributes - The node's attributes
 * @param state - The node's state
 * @param graphState - The graph-level state
 * @param graph - The graph instance
 * @returns Fully resolved node style values
 */
export function evaluateNodeStyle<
  NA extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
>(
  styleDeclaration: Record<string, unknown> | Record<string, unknown>[] | undefined,
  attributes: NA,
  state: NS,
  graphState: GS,
  graph: AbstractGraph,
): ResolvedNodeStyle {
  const result = { ...DEFAULT_RESOLVED_NODE_STYLE };

  if (!styleDeclaration) {
    // No styles, resolve from attributes with defaults
    result.x = (attributes.x as number) ?? 0;
    result.y = (attributes.y as number) ?? 0;
    result.size = (attributes.size as number) ?? 10;
    result.color = (attributes.color as string) ?? "#666";
    result.label = (attributes.label as string) ?? "";
    return result;
  }

  // Normalize to array form
  const rules = Array.isArray(styleDeclaration) ? styleDeclaration : [styleDeclaration];

  // Process each rule
  for (const rule of rules) {
    // Check if this is a conditional rule (has 'when' property)
    if ("when" in rule && "then" in rule) {
      const conditional = rule as { when: StatePredicate<NA, NS, GS>; then: Record<string, unknown> };
      if (!evaluateStatePredicate(conditional.when, attributes, state, graphState, graph)) {
        continue; // Skip this rule
      }
      // Apply the 'then' values
      applyNodeStyleRule(result, conditional.then, attributes, state, graphState, graph);
    } else {
      // Regular rule - apply all properties
      applyNodeStyleRule(result, rule, attributes, state, graphState, graph);
    }
  }

  return result;
}

/**
 * Applies a single style rule to the result object.
 */
function applyNodeStyleRule<
  NA extends Attributes,
  NS extends BaseNodeState,
  GS extends BaseGraphState,
>(
  result: ResolvedNodeStyle,
  rule: Record<string, unknown>,
  attributes: NA,
  state: NS,
  graphState: GS,
  graph: AbstractGraph,
): void {
  for (const [key, value] of Object.entries(rule)) {
    if (key === "when" || key === "then" || key === "else") continue;

    const defaultValue = result[key] ?? DEFAULT_RESOLVED_NODE_STYLE[key as keyof ResolvedNodeStyle];
    result[key] = resolveGraphicValue(
      value as GraphicValue<NA, NS, GS, unknown>,
      attributes,
      state,
      graphState,
      graph,
      defaultValue,
    );
  }
}

/**
 * Evaluates a complete edge style declaration for a specific edge.
 *
 * @param styleDeclaration - The style declaration (object or array of rules)
 * @param attributes - The edge's attributes
 * @param state - The edge's state
 * @param graphState - The graph-level state
 * @param graph - The graph instance
 * @returns Fully resolved edge style values
 */
export function evaluateEdgeStyle<
  EA extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
>(
  styleDeclaration: Record<string, unknown> | Record<string, unknown>[] | undefined,
  attributes: EA,
  state: ES,
  graphState: GS,
  graph: AbstractGraph,
): ResolvedEdgeStyle {
  const result = { ...DEFAULT_RESOLVED_EDGE_STYLE };

  if (!styleDeclaration) {
    // No styles, resolve from attributes with defaults
    result.size = (attributes.size as number) ?? 1;
    result.color = (attributes.color as string) ?? "#ccc";
    result.label = (attributes.label as string) ?? "";
    return result;
  }

  // Normalize to array form
  const rules = Array.isArray(styleDeclaration) ? styleDeclaration : [styleDeclaration];

  // Process each rule
  for (const rule of rules) {
    // Check if this is a conditional rule (has 'when' property)
    if ("when" in rule && "then" in rule) {
      const conditional = rule as { when: StatePredicate<EA, ES, GS>; then: Record<string, unknown> };
      if (!evaluateStatePredicate(conditional.when, attributes, state, graphState, graph)) {
        continue; // Skip this rule
      }
      // Apply the 'then' values
      applyEdgeStyleRule(result, conditional.then, attributes, state, graphState, graph);
    } else {
      // Regular rule - apply all properties
      applyEdgeStyleRule(result, rule, attributes, state, graphState, graph);
    }
  }

  return result;
}

/**
 * Applies a single style rule to the result object.
 */
function applyEdgeStyleRule<
  EA extends Attributes,
  ES extends BaseEdgeState,
  GS extends BaseGraphState,
>(
  result: ResolvedEdgeStyle,
  rule: Record<string, unknown>,
  attributes: EA,
  state: ES,
  graphState: GS,
  graph: AbstractGraph,
): void {
  for (const [key, value] of Object.entries(rule)) {
    if (key === "when" || key === "then" || key === "else") continue;

    const defaultValue = result[key] ?? DEFAULT_RESOLVED_EDGE_STYLE[key as keyof ResolvedEdgeStyle];
    result[key] = resolveGraphicValue(
      value as GraphicValue<EA, ES, GS, unknown>,
      attributes,
      state,
      graphState,
      graph,
      defaultValue,
    );
  }
}
