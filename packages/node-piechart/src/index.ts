/**
 * Sigma.js Node Piechart Package
 * ==============================
 *
 * A package for rendering nodes as piecharts.
 *
 * Main exports:
 * - layerPiechart(): Fragment layer factory for use with createNodeProgram
 *
 * @module @sigma/node-piechart
 */
// Layer factory
export { layerPiechart } from "./layer";

// Schema
export { piechartSchema } from "./types";

// Types
export type { CreateNodePiechartProgramOptions, LayerPiechartOptions } from "./types";
export { DEFAULT_COLOR, DEFAULT_CREATE_NODE_PIECHART_OPTIONS } from "./types";
