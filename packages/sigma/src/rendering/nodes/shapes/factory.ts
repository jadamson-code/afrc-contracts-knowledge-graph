/**
 * Sigma.js Node Shape - Factory Helper
 * =====================================
 *
 * Typed wrapper for defining and registering node shapes with schemas.
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
import { SDFShape } from "../types";

export type NodeShapeFactory<Options = unknown> = (options?: Options) => SDFShape;

export const defineNodeShape = <Name extends string, Schema extends PrimitiveSchema>(
  name: Name,
  schema: Schema,
  factory: (options?: FactoryOptionsFromSchema<Schema>) => PrimitiveKindOutputs["nodeShape"],
) => definePrimitive("nodeShape", name, schema, factory);

/**
 * Registers a node shape factory directly (for extensions without schema).
 * Satellite packages should use this to register additional shapes.
 * Accepts both optional and required options signatures.
 */
export function registerNodeShapeFactory<Options>(
  name: string,
  factory: NodeShapeFactory<Options> | ((options: Options) => SDFShape),
): void {
  registerFactory("nodeShape", name, factory as NodeShapeFactory);
}
