/**
 * Sigma.js Primitive Schema
 * =========================
 *
 * Schema-based primitive definition system.
 * Provides types, helpers, and utilities for defining primitives with type-safe schemas
 * that automatically derive factory options and declarative configs.
 *
 * @module
 */
import { ValueSource } from "../rendering";
import { BuiltInPrimitiveKind, PrimitiveKindOutputs } from "./kinds";
import { registerFactory } from "./registry";

// =============================================================================
// CORE SCHEMA TYPES
// =============================================================================

/**
 * Primitive property types that map directly to TypeScript types.
 */
export type PrimitivePropertyType = "number" | "string" | "color" | "boolean";

/**
 * Enum property type - restricted to a set of string literal values.
 */
export interface EnumPropertyType<T extends string = string> {
  enum: readonly T[];
}

/**
 * Complete union of all property types.
 */
export type PropertyType = PrimitivePropertyType | EnumPropertyType<string>;

/**
 * Schema definition for a single property.
 *
 * @template T - The TypeScript type of the property value
 * @template PT - The property type literal (e.g., "number", "color")
 * @template V - The variable flag type (true, false, or boolean for unknown)
 */
export interface PropertySchema<T = unknown, PT extends PropertyType = PropertyType, V extends boolean = boolean> {
  /** The data type of this property */
  type: PT;

  /** Default value when not specified */
  default: T;

  /**
   * Whether this property can be a variable reference in the declarative API.
   * When true: declarative config allows `string | T` (e.g., "myVar" or 0.5)
   * When false: declarative config only allows `T`
   * Default: false
   */
  variable?: V;
}

/**
 * Schema for an array property with nested item schema.
 * Used for complex primitives like `borders` and `slices`.
 *
 * @template ItemSchema - Schema for each array item
 */
export interface ArrayPropertySchema<ItemSchema extends Record<string, PropertySchema> = Record<string, PropertySchema>> {
  type: "array";

  /** Schema for each item in the array */
  items: ItemSchema;

  /** Minimum number of items required */
  minItems?: number;
}

/**
 * Type guard to check if a schema entry is an array property.
 */
export function isArrayPropertySchema(
  schema: PropertySchema | ArrayPropertySchema,
): schema is ArrayPropertySchema {
  return (schema as ArrayPropertySchema).type === "array";
}

/**
 * Full schema for a primitive's configurable properties.
 * Maps property names to their schemas.
 */
export type PrimitiveSchema = Record<string, PropertySchema | ArrayPropertySchema>;

/**
 * Empty schema for primitives with no configurable properties.
 */
export type EmptySchema = Record<string, never>;

/**
 * Result of defining a primitive with its schema.
 *
 * @template Name - The primitive's unique name
 * @template Schema - The primitive's property schema
 * @template Result - The type returned by the factory function
 */
export interface PrimitiveDefinition<
  Name extends string = string,
  Schema extends PrimitiveSchema = PrimitiveSchema,
  Result = unknown,
> {
  /** Unique identifier for this primitive */
  name: Name;

  /** Schema defining configurable properties */
  schema: Schema;

  /** Factory function that creates the primitive */
  factory: (options?: Record<string, unknown>) => Result;
}

// =============================================================================
// SCHEMA HELPER FUNCTIONS
// =============================================================================

/**
 * Options for property schema creation with variable support.
 */
export interface PropertyOptionsWithVariable {
  /** Whether this property can be a variable reference in declarative configs */
  variable: true;
}

/**
 * Options for property schema creation without variable support.
 */
export interface PropertyOptionsNoVariable {
  /** Whether this property can be a variable reference in declarative configs */
  variable?: false;
}

/**
 * Creates a number property schema with variable support.
 * @overload
 */
export function numberProp(
  defaultValue: number,
  options: PropertyOptionsWithVariable,
): PropertySchema<number, "number", true>;

/**
 * Creates a number property schema without variable support.
 * @overload
 */
export function numberProp(
  defaultValue: number,
  options?: PropertyOptionsNoVariable,
): PropertySchema<number, "number", false>;

/**
 * Creates a number property schema.
 *
 * @param defaultValue - Default value when not specified
 * @param options - Property options
 * @returns Number property schema
 */
export function numberProp(
  defaultValue: number,
  options?: PropertyOptionsWithVariable | PropertyOptionsNoVariable,
): PropertySchema<number, "number", boolean> {
  return {
    type: "number",
    default: defaultValue,
    variable: options?.variable,
  };
}

/**
 * Creates a color property schema with variable support.
 * @overload
 */
export function colorProp(
  defaultValue: string,
  options: PropertyOptionsWithVariable,
): PropertySchema<string, "color", true>;

/**
 * Creates a color property schema without variable support.
 * @overload
 */
export function colorProp(
  defaultValue: string,
  options?: PropertyOptionsNoVariable,
): PropertySchema<string, "color", false>;

/**
 * Creates a color property schema.
 * Colors are strings in CSS format (e.g., "#ff0000", "rgba(255,0,0,1)").
 *
 * @param defaultValue - Default color value
 * @param options - Property options
 * @returns Color property schema
 */
export function colorProp(
  defaultValue: string,
  options?: PropertyOptionsWithVariable | PropertyOptionsNoVariable,
): PropertySchema<string, "color", boolean> {
  return {
    type: "color",
    default: defaultValue,
    variable: options?.variable,
  };
}

/**
 * Creates a string property schema with variable support.
 * @overload
 */
export function stringProp(
  defaultValue: string,
  options: PropertyOptionsWithVariable,
): PropertySchema<string, "string", true>;

/**
 * Creates a string property schema without variable support.
 * @overload
 */
export function stringProp(
  defaultValue: string,
  options?: PropertyOptionsNoVariable,
): PropertySchema<string, "string", false>;

/**
 * Creates a string property schema.
 *
 * @param defaultValue - Default string value
 * @param options - Property options
 * @returns String property schema
 */
export function stringProp(
  defaultValue: string,
  options?: PropertyOptionsWithVariable | PropertyOptionsNoVariable,
): PropertySchema<string, "string", boolean> {
  return {
    type: "string",
    default: defaultValue,
    variable: options?.variable,
  };
}

/**
 * Creates a boolean property schema with variable support.
 * @overload
 */
export function booleanProp(
  defaultValue: boolean,
  options: PropertyOptionsWithVariable,
): PropertySchema<boolean, "boolean", true>;

/**
 * Creates a boolean property schema without variable support.
 * @overload
 */
export function booleanProp(
  defaultValue: boolean,
  options?: PropertyOptionsNoVariable,
): PropertySchema<boolean, "boolean", false>;

/**
 * Creates a boolean property schema.
 *
 * @param defaultValue - Default boolean value
 * @param options - Property options
 * @returns Boolean property schema
 */
export function booleanProp(
  defaultValue: boolean,
  options?: PropertyOptionsWithVariable | PropertyOptionsNoVariable,
): PropertySchema<boolean, "boolean", boolean> {
  return {
    type: "boolean",
    default: defaultValue,
    variable: options?.variable,
  };
}

/**
 * Creates an enum property schema with restricted string values.
 * Enum properties cannot be variable references.
 *
 * @param values - Array of allowed string values
 * @param defaultValue - Default value (must be one of the allowed values)
 * @returns Enum property schema
 */
export function enumProp<T extends string>(
  values: readonly T[],
  defaultValue: T,
): PropertySchema<T, EnumPropertyType<T>> {
  return {
    type: { enum: values },
    default: defaultValue,
    variable: false,
  };
}

/**
 * Options for array property schema creation.
 */
export interface ArrayPropertyOptions {
  /** Minimum number of items required */
  minItems?: number;
}

/**
 * Creates an array property schema for nested structures.
 *
 * @param items - Schema for each array item
 * @param options - Array property options
 * @returns Array property schema
 */
export function arrayProp<S extends Record<string, PropertySchema>>(
  items: S,
  options?: ArrayPropertyOptions,
): ArrayPropertySchema<S> {
  return {
    type: "array",
    items,
    minItems: options?.minItems,
  };
}

// =============================================================================
// SCHEMA REGISTRIES (augmented by primitives via declare module)
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NodeShapeSchemaRegistry {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NodeLayerSchemaRegistry {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EdgePathSchemaRegistry {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EdgeLayerSchemaRegistry {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EdgeExtremitySchemaRegistry {}

// =============================================================================
// TYPE UTILITIES (re-exported from registry)
// =============================================================================

export type { BuiltInVariableNames, IsCustomVariable, UnionToIntersection } from "./registry";

// =============================================================================
// TYPE MAPPING FROM SCHEMA TO TYPESCRIPT
// =============================================================================

/**
 * Extracts the TypeScript type from a PropertyType.
 */
export type TypeFromPropertyType<T> = T extends "number"
  ? number
  : T extends "string" | "color"
    ? string
    : T extends "boolean"
      ? boolean
      : T extends EnumPropertyType<infer E>
        ? E
        : never;

/**
 * Extracts the TypeScript type from a PropertySchema.
 */
export type TypeFromPropertySchema<P extends PropertySchema> = TypeFromPropertyType<P["type"]>;

// =============================================================================
// FACTORY OPTIONS DERIVATION
// =============================================================================

/**
 * Checks if a property schema is variable-capable.
 * Uses the third type parameter (V) from PropertySchema<T, PT, V>.
 */
type IsVariableProperty<P> =
  P extends PropertySchema<unknown, PropertyType, infer V> ? (V extends true ? true : false) : false;

/**
 * Derives the factory option type from a single property schema.
 * - Variable-capable properties become `ValueSource<T>`
 * - Static properties remain `T`
 */
export type FactoryOptionFromProperty<P extends PropertySchema> =
  IsVariableProperty<P> extends true ? ValueSource<TypeFromPropertySchema<P>> : TypeFromPropertySchema<P>;

/**
 * Derives factory options from an item schema (for array properties).
 */
export type FactoryOptionsFromItemSchema<S extends Record<string, PropertySchema>> = {
  [K in keyof S]?: FactoryOptionFromProperty<S[K]>;
};

/**
 * Derives factory options from a complete primitive schema.
 * All properties are optional (for input).
 */
export type FactoryOptionsFromSchema<S extends PrimitiveSchema> = {
  [K in keyof S]?: S[K] extends ArrayPropertySchema<infer Items>
    ? Array<FactoryOptionsFromItemSchema<Items>>
    : S[K] extends PropertySchema
      ? FactoryOptionFromProperty<S[K]>
      : never;
};

/**
 * Derives resolved factory options from an item schema (for array properties).
 * All properties are required (after defaults applied).
 */
export type ResolvedOptionsFromItemSchema<S extends Record<string, PropertySchema>> = {
  [K in keyof S]: FactoryOptionFromProperty<S[K]>;
};

/**
 * Derives resolved factory options from a complete primitive schema.
 * All properties are required (after defaults applied).
 * Use this type for the merged options object inside factory functions.
 */
export type ResolvedOptionsFromSchema<S extends PrimitiveSchema> = {
  [K in keyof S]: S[K] extends ArrayPropertySchema<infer Items>
    ? Array<ResolvedOptionsFromItemSchema<Items>>
    : S[K] extends PropertySchema
      ? FactoryOptionFromProperty<S[K]>
      : never;
};

// =============================================================================
// DECLARATIVE CONFIG DERIVATION
// =============================================================================

/**
 * Derives the declarative config type from a single property schema.
 * - Variable-capable properties become `string | T` (string = variable name)
 * - Static properties remain `T`
 */
export type DeclarativeConfigFromProperty<P extends PropertySchema> =
  IsVariableProperty<P> extends true ? string | TypeFromPropertySchema<P> : TypeFromPropertySchema<P>;

/**
 * Derives declarative config from an item schema (for array properties).
 */
export type DeclarativeConfigFromItemSchema<S extends Record<string, PropertySchema>> = {
  [K in keyof S]?: DeclarativeConfigFromProperty<S[K]>;
};

/**
 * Derives declarative config from a complete primitive schema.
 * All properties are optional.
 */
export type DeclarativeConfigFromSchema<S extends PrimitiveSchema> = {
  [K in keyof S]?: S[K] extends ArrayPropertySchema<infer Items>
    ? Array<DeclarativeConfigFromItemSchema<Items>>
    : S[K] extends PropertySchema
      ? DeclarativeConfigFromProperty<S[K]>
      : never;
};

// =============================================================================
// VALIDATED DECLARATIVE CONFIG (context-aware variable validation)
// =============================================================================

/**
 * Derives the validated declarative config type from a single property schema.
 * Variable-capable properties only accept declared variable names, not any string.
 *
 * @template P - The property schema
 * @template AllowedVars - Union of allowed variable names (declared + built-in)
 */
export type ValidatedConfigFromProperty<P extends PropertySchema, AllowedVars extends string> =
  IsVariableProperty<P> extends true ? AllowedVars | TypeFromPropertySchema<P> : TypeFromPropertySchema<P>;

/**
 * Derives validated config from an item schema (for array properties).
 * Only allows declared variable names for variable-capable properties.
 */
export type ValidatedConfigFromItemSchema<S extends Record<string, PropertySchema>, AllowedVars extends string> = {
  [K in keyof S]?: ValidatedConfigFromProperty<S[K], AllowedVars>;
};

/**
 * Derives validated config from a complete primitive schema.
 * Only allows declared variable names for variable-capable properties.
 *
 * @template S - The primitive schema
 * @template AllowedVars - Union of allowed variable names
 */
export type ValidatedConfigFromSchema<S extends PrimitiveSchema, AllowedVars extends string> = {
  [K in keyof S]?: S[K] extends ArrayPropertySchema<infer Items>
    ? Array<ValidatedConfigFromItemSchema<Items, AllowedVars>>
    : S[K] extends PropertySchema
      ? ValidatedConfigFromProperty<S[K], AllowedVars>
      : never;
};

// =============================================================================
// VARIABLE EXTRACTION
// =============================================================================

import { IsCustomVariable } from "./registry";

/**
 * Extracts variable type from a property schema.
 */
type VariableTypeFromProperty<P extends PropertySchema> = P["type"] extends "number"
  ? number
  : P["type"] extends "color" | "string"
    ? string
    : P["type"] extends "boolean"
      ? boolean
      : never;

/**
 * Extracts variables from a single property in a config.
 * Returns { [varName]: type } if the value is a custom variable string.
 */
export type ExtractPropertyVariable<Value, P extends PropertySchema> =
  IsVariableProperty<P> extends true
    ? Value extends string
      ? IsCustomVariable<Value> extends true
        ? { [K in Value]: VariableTypeFromProperty<P> }
        : object
      : object
    : object;

/**
 * Extracts variables from an array item config.
 */
export type ExtractItemVariables<
  Item extends Record<string, unknown>,
  ItemSchema extends Record<string, PropertySchema>,
> = {
  [K in keyof Item & keyof ItemSchema]: ExtractPropertyVariable<Item[K], ItemSchema[K]>;
}[keyof Item & keyof ItemSchema];

/**
 * Extracts all variables from a declarative config using its schema.
 * This is a generic replacement for the manual Extract*Variables types.
 */
export type ExtractVariablesFromConfig<
  Config extends Record<string, unknown>,
  Schema extends PrimitiveSchema,
> = import("./registry").UnionToIntersection<
  {
    [K in keyof Config & keyof Schema]: Schema[K] extends ArrayPropertySchema<infer Items>
      ? Config[K] extends Array<infer Item>
        ? Item extends Record<string, unknown>
          ? ExtractItemVariables<Item, Items>
          : object
        : object
      : Schema[K] extends PropertySchema
        ? ExtractPropertyVariable<Config[K], Schema[K]>
        : object;
  }[keyof Config & keyof Schema]
>;

// =============================================================================
// DEFINE PRIMITIVE FUNCTION
// =============================================================================

/**
 * Defines a primitive with its schema.
 * Registers the factory at runtime and returns the definition for type-level usage.
 */
export function definePrimitive<
  Kind extends BuiltInPrimitiveKind,
  Name extends string,
  Schema extends PrimitiveSchema,
>(
  kind: Kind,
  name: Name,
  schema: Schema,
  factory: (options?: FactoryOptionsFromSchema<Schema>) => PrimitiveKindOutputs[Kind],
): PrimitiveDefinition<Name, Schema, PrimitiveKindOutputs[Kind]> {
  registerFactory(kind, name, factory as (options?: unknown) => PrimitiveKindOutputs[Kind]);
  return { name, schema, factory: factory as (options?: Record<string, unknown>) => PrimitiveKindOutputs[Kind] };
}
