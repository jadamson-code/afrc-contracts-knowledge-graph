/**
 * Sigma.js Node Border Package
 * ============================
 *
 * A package for rendering nodes with configurable borders.
 *
 * Main exports:
 * - layerBorder(): Fragment layer factory for use with createComposedNodeProgram
 * - createNodeBorderProgram(): Program factory for backward compatibility (circle shapes)
 * - NodeBorderProgram: Pre-configured program with default options
 *
 * @module
 */
import { NodeProgramType } from "sigma/rendering";

import { createNodeBorderProgram } from "./program";

// Layer factory (main export for new API)
export { layerBorder } from "./layer";

// Program factory (for backward compatibility)
export { createNodeBorderProgram } from "./program";

// Types
export type {
  BorderColor,
  BorderSize,
  BorderSizeMode,
  CreateNodeBorderProgramOptions,
  LayerBorderOptions,
} from "./types";
export { DEFAULT_BORDER_SIZE_MODE, DEFAULT_BORDERS, DEFAULT_COLOR, DEFAULT_CREATE_NODE_BORDER_OPTIONS } from "./types";

// Pre-configured default program
export const NodeBorderProgram: NodeProgramType = createNodeBorderProgram();
