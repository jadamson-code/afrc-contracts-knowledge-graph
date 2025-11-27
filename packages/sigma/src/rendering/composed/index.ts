/**
 * Sigma.js Composable Node Programs
 * ==================================
 *
 * Main exports for the composable node program system.
 *
 * @module
 */

// Core factory functions
export { createComposedNodeProgram, createComposedPrograms } from "./factory";
export type { ComposedPrograms } from "./factory";

// Label factory (for advanced usage - separate label program creation)
export { createComposedLabelProgram } from "./label-factory";
export type { ComposedLabelProgramOptions } from "./label-factory";

// Type definitions
export type {
  SDFShape,
  FragmentLayer,
  ComposedProgramOptions,
  UniformSpecification,
  AttributeSpecification,
  ValueSource,
  LayerContext,
  LayerConfig,
  LayerLifecycleContext,
  LayerLifecycleHooks,
  Vec2,
  Vec3,
  Vec4,
  Mat3,
  Mat4,
} from "./types";

// SDF Shapes
export { sdfCircle, sdfSquare, sdfTriangle, sdfDiamond } from "./shapes";
export type { SquareOptions, TriangleOptions, DiamondOptions } from "./shapes";

// Fragment Layers (core)
export { layerFill } from "./layers";

// Shader generators (advanced usage)
export { generateShaders, generateVertexShader, generateFragmentShader, collectUniforms, collectAttributes } from "./generator";
export type { GeneratedShaders } from "./generator";
export { generateLabelShaders, generateLabelVertexShader, generateLabelFragmentShader, collectLabelUniforms } from "./label-generator";
export type { GeneratedLabelShaders, LabelShaderOptions } from "./label-generator";
