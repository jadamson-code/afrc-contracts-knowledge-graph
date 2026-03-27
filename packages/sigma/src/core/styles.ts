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
  AttributeBinding,
  Attributes,
  BaseEdgeState,
  BaseGraphState,
  BaseNodeState,
  CategoricalAttributeBinding,
  DataPredicate,
  DirectAttributeBinding,
  EasingFunction,
  GraphicValue,
  NumericalAttributeBinding,
  type StageInlineConditional,
  type StageInlineFunctionConditional,
  type StagePredicate,
  type StageStyleValue,
  StatePredicate,
  ValueFunction,
  isAttributeBinding,
  isInlineDataConditional,
  isInlineFunctionConditional,
  isInlineStateConditional,
  isValueFunction,
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
 * Evaluates a state predicate (shorthand form) against the current state.
 * For function predicates, use `when` in style rules or `InlineFunctionConditional` for inline values.
 *
 * @param predicate - The shorthand predicate to evaluate
 * @param state - The element's state (node or edge)
 * @returns Whether the predicate matches
 */
export function evaluateStatePredicate<S extends BaseNodeState | BaseEdgeState = BaseNodeState>(
  predicate: StatePredicate<S>,
  state: S,
): boolean {
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
function resolveCategoricalBinding<T>(binding: CategoricalAttributeBinding<T>, attributes: Attributes): T | undefined {
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
 * Evaluates a data predicate (shorthand form) against the item's graph attributes.
 * For function predicates, use `when` in style rules or `InlineFunctionConditional` for inline values.
 */
export function evaluateDataPredicate<A extends Attributes = Attributes>(
  predicate: DataPredicate<A>,
  attributes: A,
): boolean {
  // Uses truthiness (not === true) since data attributes are arbitrary types, not strict booleans.
  if (typeof predicate === "string") return !!attributes[predicate as keyof A];
  if (Array.isArray(predicate)) return predicate.every((key) => !!attributes[key as keyof A]);
  if (typeof predicate === "object" && predicate !== null) {
    return Object.entries(predicate).every(([key, value]) => attributes[key as keyof A] === value);
  }
  return false;
}

/**
 * Resolves a GraphicValue to its actual value.
 *
 * This is the main entry point for style resolution. It handles all value types:
 * - Literal values (pass-through)
 * - Attribute bindings (direct, numerical range, categorical dict)
 * - Function values
 * - Inline conditionals
 */
export function resolveGraphicValue<
  A extends Attributes = Attributes,
  S extends BaseNodeState | BaseEdgeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
  T = unknown,
>(value: GraphicValue<A, S, GS, T>, attributes: A, state: S, graphState: GS, graph: AbstractGraph, defaultValue: T): T {
  if (value === null || value === undefined) return defaultValue;

  if (isInlineFunctionConditional<A, S, GS, T>(value)) {
    const branch = value.when(attributes, state, graphState, graph) ? value.then : value.else;
    if (branch === undefined) return defaultValue;
    return resolveGraphicValue(branch as GraphicValue<A, S, GS, T>, attributes, state, graphState, graph, defaultValue);
  }

  if (isInlineStateConditional<A, S, GS, T>(value)) {
    const branch = evaluateStatePredicate(value.whenState, state) ? value.then : value.else;
    if (branch === undefined) return defaultValue;
    return resolveGraphicValue(branch as GraphicValue<A, S, GS, T>, attributes, state, graphState, graph, defaultValue);
  }

  if (isInlineDataConditional<A, S, GS, T>(value)) {
    const branch = evaluateDataPredicate(value.whenData, attributes) ? value.then : value.else;
    if (branch === undefined) return defaultValue;
    return resolveGraphicValue(branch as GraphicValue<A, S, GS, T>, attributes, state, graphState, graph, defaultValue);
  }

  if (isValueFunction<A, S, GS, T>(value)) {
    const result = (value as ValueFunction<A, S, GS, T>)(attributes, state, graphState, graph);
    return result ?? defaultValue;
  }

  if (isAttributeBinding<T>(value)) {
    const result = resolveAttributeBinding(value, attributes, graph);
    return result ?? defaultValue;
  }

  return value as T;
}

/**
 * Style dependency classification for optimization.
 * - "static": no rules depend on state at all
 * - "item-state": rules depend on item state (e.g. isHovered) but not graph state
 * - "graph-state": rules may depend on graph state (conservative for opaque functions)
 */
export type StyleDependency = "static" | "item-state" | "graph-state";

/**
 * Pre-computed metadata extracted from a style declaration.
 */
export interface StyleAnalysis {
  dependency: StyleDependency;
  // Position attribute names inferred from attribute bindings on x/y.
  // null when x/y are set via functions, conditionals, or not set at all.
  xAttribute: string | null;
  yAttribute: string | null;
}

/**
 * Classifies the state dependency of a single property value.
 * Uses the same type guards as resolveGraphicValue to stay in sync.
 */
function classifyValue(value: unknown): StyleDependency {
  if (value === null || value === undefined) return "static";
  // when: function → always graph-state regardless of branch dependencies
  if (isInlineFunctionConditional(value)) return "graph-state";
  if (isInlineStateConditional(value)) {
    // whenState shorthand predicates are always "item-state"
    const thenDep = classifyValue(value.then);
    const elseDep = value.else !== undefined ? classifyValue(value.else) : ("static" as StyleDependency);
    return worstDependency("item-state", worstDependency(thenDep, elseDep));
  }
  // whenData conditions only depend on attributes → "static" for the predicate itself
  if (isInlineDataConditional(value)) {
    const thenDep = classifyValue(value.then);
    const elseDep = value.else !== undefined ? classifyValue(value.else) : ("static" as StyleDependency);
    return worstDependency(thenDep, elseDep);
  }
  if (isValueFunction(value)) return "graph-state";
  if (isAttributeBinding(value)) return "static";
  return "static";
}

/**
 * Returns the "worst" (most conservative) of two dependency classifications.
 */
function worstDependency(a: StyleDependency, b: StyleDependency): StyleDependency {
  if (a === "graph-state" || b === "graph-state") return "graph-state";
  if (a === "item-state" || b === "item-state") return "item-state";
  return "static";
}

/**
 * Analyzes a style declaration to extract pre-computed metadata:
 * state dependency level, and position attribute names for x/y.
 */
export function analyzeStyleDeclaration(
  styleDeclaration: Record<string, unknown> | Record<string, unknown>[] | undefined,
): StyleAnalysis {
  if (!styleDeclaration) return { dependency: "static", xAttribute: null, yAttribute: null };

  const rules = Array.isArray(styleDeclaration) ? styleDeclaration : [styleDeclaration];
  let dependency: StyleDependency = "static";
  let xAttribute: string | null = null;
  let yAttribute: string | null = null;

  for (const rule of rules) {
    // matchData/cases — depends on graph attributes only: classify branch values, predicate is "static"
    if ("matchData" in rule && "cases" in rule) {
      const cases = rule.cases as Record<string, Record<string, unknown>>;
      for (const branch of Object.values(cases)) {
        for (const value of Object.values(branch)) {
          dependency = worstDependency(dependency, classifyValue(value));
        }
      }
    }
    // matchState/cases — depends on item state: "item-state" + classify branch values
    else if ("matchState" in rule && "cases" in rule) {
      dependency = worstDependency(dependency, "item-state");
      const cases = rule.cases as Record<string, Record<string, unknown>>;
      for (const branch of Object.values(cases)) {
        for (const value of Object.values(branch)) {
          dependency = worstDependency(dependency, classifyValue(value));
        }
      }
    }
    // when: function conditional — always graph-state
    else if ("when" in rule && "then" in rule) {
      dependency = "graph-state";
    }
    // whenState conditional — shorthand predicate is always "item-state", classify branch values
    else if ("whenState" in rule) {
      dependency = worstDependency(dependency, "item-state");
      const thenObj = rule.then as Record<string, unknown> | undefined;
      if (thenObj && typeof thenObj === "object") {
        for (const value of Object.values(thenObj)) {
          dependency = worstDependency(dependency, classifyValue(value));
        }
      }
      const elseObj = rule.else as Record<string, unknown> | undefined;
      if (elseObj && typeof elseObj === "object") {
        for (const value of Object.values(elseObj)) {
          dependency = worstDependency(dependency, classifyValue(value));
        }
      }
    }
    // whenData conditional — predicate is "static", classify branch values only
    else if ("whenData" in rule) {
      const thenObj = rule.then as Record<string, unknown> | undefined;
      if (thenObj && typeof thenObj === "object") {
        for (const value of Object.values(thenObj)) {
          dependency = worstDependency(dependency, classifyValue(value));
        }
      }
      const elseObj = rule.else as Record<string, unknown> | undefined;
      if (elseObj && typeof elseObj === "object") {
        for (const value of Object.values(elseObj)) {
          dependency = worstDependency(dependency, classifyValue(value));
        }
      }
    } else {
      // Regular rule — check each property value and extract position bindings
      for (const [key, value] of Object.entries(rule)) {
        if (RULE_CONTROL_KEYS.has(key)) continue;
        dependency = worstDependency(dependency, classifyValue(value));

        // Extract position attribute names from direct bindings
        if ((key === "x" || key === "y") && isAttributeBinding(value)) {
          const attr = (value as DirectAttributeBinding<number>).attribute;
          if (key === "x" && !xAttribute) xAttribute = attr;
          if (key === "y" && !yAttribute) yAttribute = attr;
        }
      }
    }
  }

  return { dependency, xAttribute, yAttribute };
}

/**
 * Resolved node style values (all properties resolved to concrete values).
 */
export interface ResolvedNodeStyle {
  x?: number;
  y?: number;
  size: number;
  color: string;
  opacity: number;
  shape: string;
  visibility: "visible" | "hidden";
  depth: string;
  zIndex: number;
  label: string;
  labelColor: string;
  labelSize: number;
  labelFont: string;
  labelVisibility: "auto" | "visible" | "hidden";
  labelPosition: "right" | "left" | "above" | "below" | "over";
  labelAngle: number;
  labelDepth: string;
  backdropVisibility: "visible" | "hidden";
  backdropColor: string;
  backdropShadowColor: string;
  backdropShadowBlur: number;
  backdropPadding: number;
  backdropBorderColor: string;
  backdropBorderWidth: number;
  backdropCornerRadius: number;
  backdropLabelPadding: number;
  backdropArea: "both" | "node" | "label";
  labelAttachment: string | null;
  labelAttachmentPlacement: "below" | "above" | "left" | "right";
  cursor?: string;
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
  selfLoopPath: string;
  parallelPath: string | undefined;
  parallelSpread: number;
  tail: string;
  head: string;
  visibility: "visible" | "hidden";
  depth: string;
  zIndex: number;
  label: string;
  labelColor: string;
  labelSize: number;
  labelFont: string;
  labelVisibility: "auto" | "visible" | "hidden";
  labelPosition: number | "over" | "above" | "below" | "auto";
  labelDepth: string;
  cursor?: string;
  // Additional program-declared variables stored here
  [key: string]: unknown;
}

/**
 * Default values for resolved node styles.
 */
const DEFAULT_RESOLVED_NODE_STYLE: ResolvedNodeStyle = {
  size: 10,
  color: "#666",
  opacity: 1,
  shape: "circle",
  visibility: "visible",
  depth: "nodes",
  zIndex: 0,
  label: "",
  labelColor: "#000",
  labelSize: 12,
  labelFont: "Arial, sans-serif",
  labelVisibility: "auto",
  labelPosition: "right",
  labelAngle: 0,
  labelDepth: "nodeLabels",
  backdropVisibility: "hidden",
  backdropColor: "transparent",
  backdropShadowColor: "transparent",
  backdropShadowBlur: 0,
  backdropPadding: 0,
  backdropBorderColor: "transparent",
  backdropBorderWidth: 0,
  backdropCornerRadius: 0,
  backdropLabelPadding: -1,
  backdropArea: "both",
  labelAttachment: null,
  labelAttachmentPlacement: "below",
};

/**
 * Default values for resolved edge styles.
 */
const DEFAULT_RESOLVED_EDGE_STYLE: ResolvedEdgeStyle = {
  size: 1,
  color: "#ccc",
  opacity: 1,
  path: "straight",
  selfLoopPath: "loop",
  parallelPath: undefined,
  parallelSpread: 0.25,
  tail: "none",
  head: "none",
  visibility: "visible",
  depth: "edges",
  zIndex: 0,
  label: "",
  labelColor: "#666",
  labelSize: 10,
  labelFont: "Arial, sans-serif",
  labelVisibility: "auto",
  labelPosition: 0.5,
  labelDepth: "edgeLabels",
};

// Keys used as rule control flow — skipped when iterating over style properties.
const RULE_CONTROL_KEYS = new Set(["when", "whenState", "whenData", "then", "else"]);

// Initialize pre-computed key/value arrays for fast reset
const NODE_DEFAULT_KEYS = Object.keys(DEFAULT_RESOLVED_NODE_STYLE);
const NODE_DEFAULT_VALUES = Object.values(DEFAULT_RESOLVED_NODE_STYLE);
const EDGE_DEFAULT_KEYS = Object.keys(DEFAULT_RESOLVED_EDGE_STYLE);
const EDGE_DEFAULT_VALUES = Object.values(DEFAULT_RESOLVED_EDGE_STYLE);

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
  target?: ResolvedNodeStyle,
): ResolvedNodeStyle {
  const result: ResolvedNodeStyle = target || ({} as ResolvedNodeStyle);
  for (let i = 0, l = NODE_DEFAULT_KEYS.length; i < l; i++) {
    (result as Record<string, unknown>)[NODE_DEFAULT_KEYS[i]] = NODE_DEFAULT_VALUES[i];
  }

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
    if ("matchData" in rule && "cases" in rule) {
      const { matchData, cases } = rule as { matchData: string; cases: Record<string, Record<string, unknown>> };
      const key = String(attributes[matchData] ?? "");
      if (key in cases) applyNodeStyleRule(result, cases[key], attributes, state, graphState, graph);
    } else if ("matchState" in rule && "cases" in rule) {
      const { matchState, cases } = rule as { matchState: string; cases: Record<string, Record<string, unknown>> };
      const key = String(state[matchState as keyof NS] ?? "");
      if (key in cases) applyNodeStyleRule(result, cases[key], attributes, state, graphState, graph);
    } else if ("when" in rule && "then" in rule) {
      const conditional = rule as {
        when: (a: NA, s: NS, gs: GS, g: AbstractGraph) => boolean;
        then: Record<string, unknown>;
      };
      if (!conditional.when(attributes, state, graphState, graph)) continue;
      applyNodeStyleRule(result, conditional.then, attributes, state, graphState, graph);
    } else if ("whenState" in rule && "then" in rule) {
      const conditional = rule as { whenState: StatePredicate<NS>; then: Record<string, unknown> };
      if (!evaluateStatePredicate(conditional.whenState, state)) continue;
      applyNodeStyleRule(result, conditional.then, attributes, state, graphState, graph);
    } else if ("whenData" in rule && "then" in rule) {
      const conditional = rule as { whenData: DataPredicate<NA>; then: Record<string, unknown> };
      if (!evaluateDataPredicate(conditional.whenData, attributes)) continue;
      applyNodeStyleRule(result, conditional.then, attributes, state, graphState, graph);
    } else {
      applyNodeStyleRule(result, rule, attributes, state, graphState, graph);
    }
  }

  return result;
}

/**
 * Applies a single style rule to the result object.
 */
function applyNodeStyleRule<NA extends Attributes, NS extends BaseNodeState, GS extends BaseGraphState>(
  result: ResolvedNodeStyle,
  rule: Record<string, unknown>,
  attributes: NA,
  state: NS,
  graphState: GS,
  graph: AbstractGraph,
): void {
  for (const key in rule) {
    if (RULE_CONTROL_KEYS.has(key)) continue;

    const defaultValue = result[key] ?? DEFAULT_RESOLVED_NODE_STYLE[key as keyof ResolvedNodeStyle];
    result[key] = resolveGraphicValue(
      rule[key] as GraphicValue<NA, NS, GS, unknown>,
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
  target?: ResolvedEdgeStyle,
): ResolvedEdgeStyle {
  const result: ResolvedEdgeStyle = target || ({} as ResolvedEdgeStyle);
  for (let i = 0, l = EDGE_DEFAULT_KEYS.length; i < l; i++) {
    (result as Record<string, unknown>)[EDGE_DEFAULT_KEYS[i]] = EDGE_DEFAULT_VALUES[i];
  }

  if (!styleDeclaration) {
    result.size = (attributes.size as number) ?? 1;
    result.color = (attributes.color as string) ?? "#ccc";
    result.label = (attributes.label as string) ?? "";
    return result;
  }

  // Normalize to array form
  const rules = Array.isArray(styleDeclaration) ? styleDeclaration : [styleDeclaration];

  // Process each rule
  for (const rule of rules) {
    if ("matchData" in rule && "cases" in rule) {
      const { matchData, cases } = rule as { matchData: string; cases: Record<string, Record<string, unknown>> };
      const key = String(attributes[matchData] ?? "");
      if (key in cases) applyEdgeStyleRule(result, cases[key], attributes, state, graphState, graph);
    } else if ("matchState" in rule && "cases" in rule) {
      const { matchState, cases } = rule as { matchState: string; cases: Record<string, Record<string, unknown>> };
      const key = String(state[matchState as keyof ES] ?? "");
      if (key in cases) applyEdgeStyleRule(result, cases[key], attributes, state, graphState, graph);
    } else if ("when" in rule && "then" in rule) {
      const conditional = rule as {
        when: (a: EA, s: ES, gs: GS, g: AbstractGraph) => boolean;
        then: Record<string, unknown>;
      };
      if (!conditional.when(attributes, state, graphState, graph)) continue;
      applyEdgeStyleRule(result, conditional.then, attributes, state, graphState, graph);
    } else if ("whenState" in rule && "then" in rule) {
      const conditional = rule as { whenState: StatePredicate<ES>; then: Record<string, unknown> };
      if (!evaluateStatePredicate(conditional.whenState, state)) continue;
      applyEdgeStyleRule(result, conditional.then, attributes, state, graphState, graph);
    } else if ("whenData" in rule && "then" in rule) {
      const conditional = rule as { whenData: DataPredicate<EA>; then: Record<string, unknown> };
      if (!evaluateDataPredicate(conditional.whenData, attributes)) continue;
      applyEdgeStyleRule(result, conditional.then, attributes, state, graphState, graph);
    } else {
      applyEdgeStyleRule(result, rule, attributes, state, graphState, graph);
    }
  }

  return result;
}

/**
 * Applies a single style rule to the result object.
 */
function applyEdgeStyleRule<EA extends Attributes, ES extends BaseEdgeState, GS extends BaseGraphState>(
  result: ResolvedEdgeStyle,
  rule: Record<string, unknown>,
  attributes: EA,
  state: ES,
  graphState: GS,
  graph: AbstractGraph,
): void {
  for (const key in rule) {
    if (RULE_CONTROL_KEYS.has(key)) continue;

    const defaultValue = result[key] ?? DEFAULT_RESOLVED_EDGE_STYLE[key as keyof ResolvedEdgeStyle];
    result[key] = resolveGraphicValue(
      rule[key] as GraphicValue<EA, ES, GS, unknown>,
      attributes,
      state,
      graphState,
      graph,
      defaultValue,
    );
  }
}

/**
 * Resolved stage style values.
 */
export interface ResolvedStageStyle {
  cursor?: string;
  background?: string;
}

/**
 * Resolves a single StageStyleValue to a concrete value.
 */
function resolveStageStyleValue<GS extends BaseGraphState, T>(
  value: StageStyleValue<GS, T> | undefined,
  graphState: GS,
  defaultValue?: T,
): T | undefined {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "function") return (value as (gs: GS) => T)(graphState) ?? defaultValue;
  if (typeof value === "object" && "when" in value) {
    const cond = value as StageInlineFunctionConditional<GS, T>;
    const matches = cond.when(graphState);
    const branch = matches ? cond.then : cond.else;
    if (branch === undefined) return defaultValue;
    if (typeof branch === "function") return (branch as (gs: GS) => T)(graphState) ?? defaultValue;
    return branch ?? defaultValue;
  }
  if (typeof value === "object" && "whenState" in value) {
    const cond = value as StageInlineConditional<GS, T>;
    const matches = evaluateStagePredicate(cond.whenState, graphState);
    const branch = matches ? cond.then : cond.else;
    if (branch === undefined) return defaultValue;
    if (typeof branch === "function") return (branch as (gs: GS) => T)(graphState) ?? defaultValue;
    return branch ?? defaultValue;
  }
  return (value as T) ?? defaultValue;
}

/**
 * Evaluates a stage predicate (shorthand form) against graph state.
 */
function evaluateStagePredicate<GS extends BaseGraphState>(predicate: StagePredicate<GS>, graphState: GS): boolean {
  if (typeof predicate === "string") return graphState[predicate as keyof GS] === true;
  if (Array.isArray(predicate)) return predicate.every((flag) => graphState[flag as keyof GS] === true);
  if (typeof predicate === "object" && predicate !== null) {
    return Object.entries(predicate).every(([key, value]) => graphState[key as keyof GS] === value);
  }
  return false;
}

/**
 * Evaluates a complete stage style declaration.
 */
export function evaluateStageStyle<GS extends BaseGraphState>(
  styleDeclaration: Record<string, unknown> | Record<string, unknown>[] | undefined,
  graphState: GS,
): ResolvedStageStyle {
  const result: ResolvedStageStyle = {};
  if (!styleDeclaration) return result;

  const rules = Array.isArray(styleDeclaration) ? styleDeclaration : [styleDeclaration];

  for (const rule of rules) {
    if ("when" in rule && "then" in rule) {
      const matches = (rule.when as (gs: GS) => boolean)(graphState);
      const branch = matches ? rule.then : rule.else;
      if (branch && typeof branch === "object") {
        applyStageStyleRule(result, branch as Record<string, unknown>, graphState);
      }
    } else if ("whenState" in rule && "then" in rule) {
      const matches = evaluateStagePredicate(rule.whenState as StagePredicate<GS>, graphState);
      const branch = matches ? rule.then : rule.else;
      if (branch && typeof branch === "object") {
        applyStageStyleRule(result, branch as Record<string, unknown>, graphState);
      }
    } else {
      applyStageStyleRule(result, rule, graphState);
    }
  }

  return result;
}

function applyStageStyleRule<GS extends BaseGraphState>(
  result: ResolvedStageStyle,
  rule: Record<string, unknown>,
  graphState: GS,
): void {
  for (const [key, value] of Object.entries(rule)) {
    if (RULE_CONTROL_KEYS.has(key)) continue;
    (result as Record<string, unknown>)[key] = resolveStageStyleValue(
      value as StageStyleValue<GS, unknown>,
      graphState,
    );
  }
}
