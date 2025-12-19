/**
 * Sigma.js Node Border Package
 * ============================
 *
 * A package for rendering nodes with configurable borders.
 *
 * Main exports:
 * - layerBorder(): Fragment layer factory for use with createNodeProgram
 * - createNodeBorderProgram(): Program factory with circle shape
 * - NodeBorderProgram: Pre-configured program with default options
 *
 * @module
 */
import { NodeProgramType, registerNodeLayerFactory } from "sigma/rendering";

import { layerBorder } from "./layer";
import { createNodeBorderProgram } from "./program";
import { borderSchema } from "./types";

// Module augmentation: makes "border" a recognized node layer type
declare module "sigma/primitives" {
  interface NodeLayerSchemaRegistry {
    border: typeof borderSchema;
  }
}

// Register the runtime factory
registerNodeLayerFactory("border", layerBorder);

// Layer factory
export { layerBorder } from "./layer";

// Program factory (for backward compatibility)
export { createNodeBorderProgram } from "./program";

// Schema
export { borderSchema } from "./types";

// Types
export type { BorderSizeMode, CreateNodeBorderProgramOptions, LayerBorderOptions } from "./types";
export { DEFAULT_BORDER_SIZE_MODE, DEFAULT_BORDERS, DEFAULT_COLOR, DEFAULT_CREATE_NODE_BORDER_OPTIONS } from "./types";

// Pre-configured default program
export const NodeBorderProgram: NodeProgramType = createNodeBorderProgram();
