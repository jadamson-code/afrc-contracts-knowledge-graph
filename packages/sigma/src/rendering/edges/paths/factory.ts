/**
 * Sigma.js Edge Path - Factory Helper
 * ====================================
 *
 * Typed wrapper for defining and registering edge paths with schemas.
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
import { EdgePath } from "../types";

export type EdgePathFactory<Options = unknown> = (options?: Options) => EdgePath;

export const defineEdgePath = <Name extends string, Schema extends PrimitiveSchema>(
  name: Name,
  schema: Schema,
  factory: (options?: FactoryOptionsFromSchema<Schema>) => PrimitiveKindOutputs["edgePath"],
) => definePrimitive("edgePath", name, schema, factory);

/**
 * Registers an edge path factory directly (for extensions without schema).
 * Satellite packages should use this to register additional paths.
 * Accepts both optional and required options signatures.
 */
export function registerEdgePathFactory<Options>(
  name: string,
  factory: EdgePathFactory<Options> | ((options: Options) => EdgePath),
): void {
  registerFactory("edgePath", name, factory as EdgePathFactory);
}
