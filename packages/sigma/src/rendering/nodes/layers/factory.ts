/**
 * Sigma.js Node Layer - Factory Helper
 * =====================================
 *
 * Typed wrapper for defining and registering node layers with schemas.
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
import { FragmentLayer } from "../types";

export type NodeLayerFactory<Options = unknown> = (options?: Options) => FragmentLayer;

export const defineNodeLayer = <Name extends string, Schema extends PrimitiveSchema>(
  name: Name,
  schema: Schema,
  factory: (options?: FactoryOptionsFromSchema<Schema>) => PrimitiveKindOutputs["nodeLayer"],
) => definePrimitive("nodeLayer", name, schema, factory);

/**
 * Registers a node layer factory directly (for extensions without schema).
 * Satellite packages should use this to register additional layers.
 * Accepts both optional and required options signatures.
 */
export function registerNodeLayerFactory<Options>(
  name: string,
  factory: NodeLayerFactory<Options> | ((options: Options) => FragmentLayer),
): void {
  registerFactory("nodeLayer", name, factory as NodeLayerFactory);
}
