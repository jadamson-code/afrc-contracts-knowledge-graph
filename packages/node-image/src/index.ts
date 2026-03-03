/**
 * Sigma.js Node Image Package
 * ===========================
 *
 * A package for rendering nodes with images.
 *
 * Main exports:
 * - layerImage(): Fragment layer factory for use with createNodeProgram
 *
 * @module @sigma/node-image
 */
// Layer factory
export { layerImage } from "./layer";

// Schema
export { imageSchema } from "./types";

// Types
export type { CreateNodeImageProgramOptions, DrawingMode, LayerImageOptions } from "./types";
export { DEFAULT_CREATE_NODE_IMAGE_OPTIONS, DEFAULT_LAYER_IMAGE_OPTIONS } from "./types";

// Texture management (re-exported for advanced use cases)
export { DEFAULT_TEXTURE_MANAGER_OPTIONS, TextureManager, loadImage, loadRasterImage, loadSVGImage } from "./texture";
export type { Atlas, ImageType, TextureManagerOptions } from "./texture";
