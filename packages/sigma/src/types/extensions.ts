/**
 * Sigma.js Extensions API
 * =======================
 *
 * Types for satellite packages to extend sigma's primitives system.
 * Supports two use cases:
 *
 * 1. PrimitiveExtension: Add primitives to existing kinds
 *    (e.g., @sigma/node-border adds "border" layer to nodeLayer kind)
 *
 * 2. KindExtension: Add entirely new primitive kinds
 *    (e.g., @sigma/node-badges adds "nodeBadge" kind)
 *
 * @module
 */
import { BuiltInPrimitiveKind, PrimitiveKindOutputs, registerFactory } from "../primitives";
import { PrimitiveSchema } from "../primitives/schema";

/**
 * Extension that adds primitives to an EXISTING built-in kind.
 *
 * @example
 * ```typescript
 * // @sigma/node-border
 * export const nodeBorderExtension = defineExtension({
 *   kind: "nodeLayer",
 *   primitives: {
 *     border: { schema: borderSchema, factory: borderFactory },
 *   },
 * });
 * ```
 */
export interface PrimitiveExtension<
  Kind extends BuiltInPrimitiveKind,
  Primitives extends Record<
    string,
    { schema: PrimitiveSchema; factory: (opts?: unknown) => PrimitiveKindOutputs[Kind] }
  >,
> {
  kind: Kind;
  primitives: Primitives;
}

/**
 * Extension that adds a NEW primitive kind.
 *
 * @example
 * ```typescript
 * // @sigma/node-badges
 * export const nodeBadgesExtension = defineExtension({
 *   kind: "nodeBadge",
 *   entity: "node",
 *   primitives: {
 *     icon: { schema: iconSchema, factory: iconFactory },
 *   },
 * });
 * ```
 */
export interface KindExtension<
  Kind extends string,
  Entity extends "node" | "edge",
  Output,
  Primitives extends Record<string, { schema: PrimitiveSchema; factory: (opts?: unknown) => Output }>,
> {
  kind: Kind;
  entity: Entity;
  primitives: Primitives;
}

/**
 * Union type for any extension.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Extension = PrimitiveExtension<any, any> | KindExtension<any, any, any, any>;

/**
 * Type guard for PrimitiveExtension.
 */
export function isPrimitiveExtension(
  ext: Extension,
): ext is PrimitiveExtension<
  BuiltInPrimitiveKind,
  Record<string, { schema: PrimitiveSchema; factory: (opts?: unknown) => PrimitiveKindOutputs[BuiltInPrimitiveKind] }>
> {
  return !("entity" in ext);
}

/**
 * Type guard for KindExtension.
 */
export function isKindExtension(
  ext: Extension,
): ext is KindExtension<
  string,
  "node" | "edge",
  unknown,
  Record<string, { schema: PrimitiveSchema; factory: (opts?: unknown) => unknown }>
> {
  return "entity" in ext;
}

/**
 * Registers all primitives from an extension.
 * Called automatically by defineExtension for PrimitiveExtension.
 * Can also be called manually if needed.
 */
export function registerExtension(ext: Extension): void {
  if (isPrimitiveExtension(ext)) {
    const { kind, primitives } = ext;
    for (const [name, { factory }] of Object.entries(primitives)) {
      registerFactory(kind, name, factory);
    }
  }
  // KindExtension handling would require extending the registry system
  // to support dynamic kinds - deferred until actually needed
}

/**
 * Helper to define an extension with proper type inference.
 * Automatically registers PrimitiveExtension primitives at define time.
 */
export function defineExtension<E extends Extension>(ext: E): E {
  registerExtension(ext);
  return ext;
}
