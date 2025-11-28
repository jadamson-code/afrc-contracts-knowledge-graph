/**
 * Sigma.js Rendering - Main Exports
 * ==================================
 *
 * Exports for all rendering-related functionality.
 */

// Node programs
export * from "./nodes";

// Base classes
export { EdgeProgram, AbstractEdgeProgram, createEdgeCompoundProgram } from "./edge";
export type { EdgeProgramType } from "./edge";
export { Program, AbstractProgram } from "./program";
export type { ProgramType } from "./program";
export { LabelProgram, AbstractLabelProgram } from "./label";
export type { LabelProgramType } from "./label";
export { Bucket, BucketCollection, clampZIndex } from "./bucket";
export type { ProcessItemFunction } from "./bucket";

// Canvas helpers
export type { EdgeLabelDrawingFunction } from "./edge-labels";
export { drawStraightEdgeLabel } from "./edge-labels";
export type { NodeLabelDrawingFunction } from "./node-labels";
export { drawDiscNodeLabel } from "./node-labels";
export type { NodeHoverDrawingFunction } from "./node-hover";
export { drawDiscNodeHover } from "./node-hover";

// Other various program helpers
export * from "./utils";

// Built-in edge programs
export {
  default as EdgeArrowHeadProgram,
  createEdgeArrowHeadProgram,
  DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS,
  type CreateEdgeArrowHeadProgramOptions,
} from "./programs/edge-arrow-head";
export {
  default as EdgeClampedProgram,
  createEdgeClampedProgram,
  DEFAULT_EDGE_CLAMPED_PROGRAM_OPTIONS,
  type CreateEdgeClampedProgramOptions,
} from "./programs/edge-clamped";
export {
  default as EdgeDoubleClampedProgram,
  createEdgeDoubleClampedProgram,
  DEFAULT_EDGE_DOUBLE_CLAMPED_PROGRAM_OPTIONS,
  type CreateEdgeDoubleClampedProgramOptions,
} from "./programs/edge-double-clamped";
export { default as EdgeArrowProgram, createEdgeArrowProgram } from "./programs/edge-arrow";
export { default as EdgeDoubleArrowProgram, createEdgeDoubleArrowProgram } from "./programs/edge-double-arrow";
export { default as EdgeLineProgram } from "./programs/edge-line";
export { default as EdgeRectangleProgram } from "./programs/edge-rectangle";
export { default as EdgeTriangleProgram } from "./programs/edge-triangle";
