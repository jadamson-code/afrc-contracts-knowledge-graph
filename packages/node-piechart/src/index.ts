/**
 * Sigma.js Node Piechart Package
 * ==============================
 *
 * A package for rendering nodes as piecharts.
 *
 * Main exports:
 * - layerPiechart(): Fragment layer factory for use with createComposedNodeProgram
 * - createNodePiechartProgram(): Program factory for backward compatibility (circle shapes)
 *
 * @module
 */

// Layer factory (main export for new API)
export { layerPiechart } from "./layer";

// Program factory (for backward compatibility)
export { createNodePiechartProgram } from "./program";

// Types
export type {
  CreateNodePiechartProgramOptions,
  LayerPiechartOptions,
  // Backward compatibility aliases
  NodeSliceColor,
  NodeSliceValue,
  PiechartOffset,
  PiechartSliceColor,
  PiechartSliceValue,
} from "./types";
export { DEFAULT_COLOR, DEFAULT_CREATE_NODE_PIECHART_OPTIONS } from "./types";
