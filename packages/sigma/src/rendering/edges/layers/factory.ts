/**
 * Sigma.js Edge Layer - Factory Helper
 * =====================================
 *
 * Typed wrapper for defining and registering edge layers with schemas.
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
import { EdgeLayer } from "../types";

export type EdgeLayerFactory<Options = unknown> = (options?: Options) => EdgeLayer;

export const defineEdgeLayer = <Name extends string, Schema extends PrimitiveSchema>(
  name: Name,
  schema: Schema,
  factory: (options?: FactoryOptionsFromSchema<Schema>) => PrimitiveKindOutputs["edgeLayer"],
) => definePrimitive("edgeLayer", name, schema, factory);

/**
 * Registers an edge layer factory directly (for extensions without schema).
 * Satellite packages should use this to register additional layers.
 * Accepts both optional and required options signatures.
 */
export function registerEdgeLayerFactory<Options>(
  name: string,
  factory: EdgeLayerFactory<Options> | ((options: Options) => EdgeLayer),
): void {
  registerFactory("edgeLayer", name, factory as EdgeLayerFactory);
}
