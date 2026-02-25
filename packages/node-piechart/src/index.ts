/**
 * Sigma.js Node Piechart Package
 * ==============================
 *
 * A package for rendering nodes as piecharts.
 *
 * Main exports:
 * - layerPiechart(): Fragment layer factory for use with createNodeProgram
 *
 * @module
 */
import { registerNodeLayerFactory } from "sigma/rendering";

import { layerPiechart } from "./layer";
import { piechartSchema } from "./types";

// Module augmentation: makes "piechart" a recognized node layer type
declare module "sigma/primitives" {
  interface NodeLayerSchemaRegistry {
    piechart: typeof piechartSchema;
  }
}

// Register the runtime factory
registerNodeLayerFactory("piechart", layerPiechart);

// Layer factory
export { layerPiechart } from "./layer";

// Schema
export { piechartSchema } from "./types";

// Types
export type { CreateNodePiechartProgramOptions, LayerPiechartOptions } from "./types";
export { DEFAULT_COLOR, DEFAULT_CREATE_NODE_PIECHART_OPTIONS } from "./types";
