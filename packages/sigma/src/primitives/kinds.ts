/**
 * Sigma.js Primitive Kinds
 * ========================
 *
 * Central type definitions for built-in primitive kinds.
 * Used to reduce boilerplate in registry and define functions.
 *
 * @module
 */
import { EdgeExtremity, EdgeLayer, EdgePath } from "../rendering";
import { FragmentLayer, SDFShape } from "../rendering";

// Output type mapping for built-in kinds
export interface PrimitiveKindOutputs {
  nodeShape: SDFShape;
  nodeLayer: FragmentLayer;
  edgePath: EdgePath;
  edgeLayer: EdgeLayer;
  edgeExtremity: EdgeExtremity;
}

export type BuiltInPrimitiveKind = keyof PrimitiveKindOutputs;

// Entity derivation (for variable extraction)
export type KindEntity<K extends string> = K extends `node${string}` ? "node" : "edge";
