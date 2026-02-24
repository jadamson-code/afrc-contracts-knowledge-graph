/**
 * Sigma.js Generic Primitive Registry
 * ====================================
 *
 * Generic factory registry for all primitive types.
 * Primitive-specific code lives in their respective rendering folders.
 *
 * @module
 */
import {
  EdgeBuiltInVariables,
  EdgeLabelBuiltInVariables,
  NodeBuiltInVariables,
  NodeLabelBuiltInVariables,
} from "../types/styles";
import { BuiltInPrimitiveKind, PrimitiveKindOutputs } from "./kinds";

// =============================================================================
// BUILT-IN VARIABLE NAMES
// =============================================================================

export type NodeBuiltInVariableNames = keyof NodeBuiltInVariables | keyof NodeLabelBuiltInVariables;
export type EdgeBuiltInVariableNames = keyof EdgeBuiltInVariables | keyof EdgeLabelBuiltInVariables;
export type BuiltInVariableNames = NodeBuiltInVariableNames | EdgeBuiltInVariableNames;

// =============================================================================
// TYPE UTILITIES
// =============================================================================

export type IsCustomVariable<S, BuiltIns = BuiltInVariableNames> = S extends BuiltIns
  ? false
  : S extends string
    ? true
    : false;

export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

// =============================================================================
// GENERIC FACTORY REGISTRY
// =============================================================================

type AnyFactory = (options?: unknown) => unknown;
const factories = new Map<string, Map<string, AnyFactory>>();

export function registerFactory<K extends BuiltInPrimitiveKind>(
  kind: K,
  name: string,
  factory: (options?: unknown) => PrimitiveKindOutputs[K],
): void {
  if (!factories.has(kind)) factories.set(kind, new Map());
  factories.get(kind)!.set(name, factory as AnyFactory);
}

export function getFactory<K extends BuiltInPrimitiveKind>(
  kind: K,
  name: string,
): ((options?: unknown) => PrimitiveKindOutputs[K]) | undefined {
  return factories.get(kind)?.get(name) as ((options?: unknown) => PrimitiveKindOutputs[K]) | undefined;
}

export function clearFactoryRegistry(): void {
  factories.clear();
}
