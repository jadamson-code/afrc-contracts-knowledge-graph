/**
 * Sigma.js Edge Extremity - Factory Helper
 * =========================================
 *
 * Typed wrapper for defining and registering edge extremities with schemas.
 *
 * @module
 */
import {
  FactoryOptionsFromSchema,
  PrimitiveKindOutputs,
  PrimitiveSchema,
  definePrimitive,
  registerFactory,
} from "../../../primitives";
import { EdgeExtremity } from "../types";

export type EdgeExtremityFactory<Options = unknown> = (options?: Options) => EdgeExtremity;

export const defineEdgeExtremity = <Name extends string, Schema extends PrimitiveSchema>(
  name: Name,
  schema: Schema,
  factory: (options?: FactoryOptionsFromSchema<Schema>) => PrimitiveKindOutputs["edgeExtremity"],
) => definePrimitive("edgeExtremity", name, schema, factory);

/**
 * Registers an edge extremity factory directly (for extensions without schema).
 * Satellite packages should use this to register additional extremities.
 * Accepts both optional and required options signatures.
 */
export function registerEdgeExtremityFactory<Options>(
  name: string,
  factory: EdgeExtremityFactory<Options> | ((options: Options) => EdgeExtremity),
): void {
  registerFactory("edgeExtremity", name, factory as EdgeExtremityFactory);
}
