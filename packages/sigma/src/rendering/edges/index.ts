/**
 * Sigma.js Composable Edge Programs
 * ==================================
 *
 * Composable edge program architecture for Sigma.js v4.
 * Edges are composed of path, extremities (head/tail), and layer components.
 *
 * @module
 */

// Base classes and types
export { EdgeProgram, AbstractEdgeProgram, createEdgeCompoundProgram } from "./base";
export type { EdgeProgramType } from "./base";

// Types
export type {
  EdgePath,
  EdgeExtremity,
  EdgeLayer,
  EdgeProgramOptions,
  EdgeLabelOptions,
  EdgeLabelColorSpecification,
  EdgeContextFields,
  EdgeLifecycleContext,
  EdgeLifecycleHooks,
  GeneratedEdgeShaders,
  AttributeSpecification,
  UniformSpecification,
} from "./types";

// Factory
export { createEdgeProgram } from "./factory";

// Paths
export {
  pathLine,
  pathCurved,
  type CurvedPathOptions,
  pathCurvedS,
  type CurvedSPathOptions,
  pathStep,
  type StepPathOptions,
  pathStepCurved,
  type StepCurvedPathOptions,
} from "./paths";

// Extremities
export { extremityArrow, type ArrowExtremityOptions } from "./extremities";

// Layers (edge body appearance)
export {
  layerDashed,
  layerPlain,
  type DashSize,
  type DashSizeMode,
  type LayerDashedOptions,
  type GapFilling,
  type SolidExtremities,
  type SolidMargin,
} from "./layers";

// Built-in programs
export { EdgeLineProgram, EdgeArrowProgram, EdgeCurveProgram, EdgeCurvedArrowProgram } from "./programs";

// Legacy constant for edge-curve package compatibility
export const DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS = {
  extremity: "target" as const,
  lengthToThicknessRatio: 2.5,
  widenessToThicknessRatio: 2,
};

// Shader generator (for advanced users)
export { generateEdgeShaders, type EdgeShaderGenerationOptions } from "./generator";

// Edge labels
export { createEdgeLabelProgram, type CreateEdgeLabelProgramOptions } from "./labels/factory";
export { EdgeLabelProgram, AbstractEdgeLabelProgram, type EdgeLabelProgramType } from "./labels/base";
export {
  generateEdgeLabelShaders,
  type EdgeLabelShaderOptions,
  type GeneratedEdgeLabelShaders,
} from "./labels/generator";
