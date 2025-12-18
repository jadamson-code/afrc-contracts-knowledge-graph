/**
 * Sigma.js Node Image Package
 * ===========================
 *
 * A package for rendering nodes with images.
 *
 * Main exports:
 * - layerImage(): Fragment layer factory for use with createNodeProgram
 * - createNodeImageProgram(): Program factory with circle shape
 * - NodeImageProgram: Pre-configured program with default options
 * - NodePictogramProgram: Pre-configured program for pictograms
 *
 * @module
 */
import { NodeProgramType, layerFill, registerNodeLayerFactory, sdfSquare } from "sigma/rendering";

import { layerImage } from "./layer";
import { createNodeImageProgram } from "./program";

// Register the runtime factory
registerNodeLayerFactory("image", layerImage);

// Layer factory
export { layerImage } from "./layer";

// Program factory
export { createNodeImageProgram } from "./program";

// Types
export type { CreateNodeImageProgramOptions, DrawingMode, LayerImageOptions } from "./types";
export { DEFAULT_CREATE_NODE_IMAGE_OPTIONS, DEFAULT_LAYER_IMAGE_OPTIONS } from "./types";

// Texture management (re-exported for advanced use cases)
export { DEFAULT_TEXTURE_MANAGER_OPTIONS, TextureManager, loadImage, loadRasterImage, loadSVGImage } from "./texture";
export type { Atlas, ImageType, TextureManagerOptions } from "./texture";

// Pre-configured default programs
export const NodeImageProgram: NodeProgramType = createNodeImageProgram();
export const NodePictogramProgram: NodeProgramType = createNodeImageProgram({
  shapeFactory: sdfSquare,
  backgroundLayerFactory: () => layerFill({ color: "#ffffff00" }),
  size: { mode: "force", value: 256 },
  drawingMode: "color",
  correctCentering: true,
});
