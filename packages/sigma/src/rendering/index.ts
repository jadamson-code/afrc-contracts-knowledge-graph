/**
 * Sigma.js Rendering - Main Exports
 * ==================================
 *
 * Exports for all rendering-related functionality.
 */

// GLSL utilities
export * from "./glsl";

// Node programs
export * from "./nodes";

// Base classes
export { EdgeProgram } from "./edges";
export type { EdgeProgramType } from "./edges";
export { Program } from "./program";
export type { ProgramType } from "./program";
export { LabelProgram } from "./nodes/labels";
export type { LabelProgramType } from "./nodes/labels";
export { BackdropProgram } from "./nodes/backdrops";
export type { BackdropProgramType, BackdropDisplayData } from "./nodes/backdrops";
export { Bucket, BucketCollection, clampZIndex } from "./bucket";
export type { ProcessItemFunction } from "./bucket";

// Other various program helpers
export * from "./utils";

// Composable edge programs (v4 architecture)
export * from "./edges";

// Shape registry
export * from "./shapes";

// Data textures
export { DataTexture } from "./data-texture";
export { NodeDataTexture } from "./node-data-texture";
export { EdgeDataTexture } from "./edge-data-texture";
