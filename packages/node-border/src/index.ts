/**
 * Sigma.js Node Border Package
 * ============================
 *
 * A package for rendering nodes with configurable borders.
 *
 * Main exports:
 * - layerBorder(): Fragment layer factory for use with createNodeProgram
 *
 * @module @sigma/node-border
 */
// Layer factory
export { layerBorder } from "./layer";

// Schema
export { borderSchema } from "./types";

// Types
export type { BorderSizeMode, CreateNodeBorderProgramOptions, LayerBorderOptions } from "./types";
export { DEFAULT_BORDER_SIZE_MODE, DEFAULT_BORDERS, DEFAULT_COLOR, DEFAULT_CREATE_NODE_BORDER_OPTIONS } from "./types";
