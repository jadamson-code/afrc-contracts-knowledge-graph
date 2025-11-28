/**
 * Sigma.js Node Programs
 * =======================
 *
 * Main exports for the node program system.
 *
 * @module
 */

// Core factory function
export { createNodeProgram } from "./factory";

// Base classes and types
export { NodeProgram, AbstractNodeProgram } from "./base";
export type { NodeProgramType } from "./base";

// Type definitions
export type {
  SDFShape,
  FragmentLayer,
  NodeProgramOptions,
  LabelOptions,
  LabelFontOptions,
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

// Label program creation
export { createLabelProgram } from "./labels";
export type { CreateLabelProgramOptions } from "./labels";

// Shader generators (advanced usage)
export {
  generateShaders,
  generateVertexShader,
  generateFragmentShader,
  collectUniforms,
  collectAttributes,
} from "./shaders";
export type { GeneratedShaders, ShaderGenerationOptions } from "./shaders";

export {
  generateLabelShaders,
  generateLabelVertexShader,
  generateLabelFragmentShader,
  collectLabelUniforms,
} from "./labels";
export type { GeneratedLabelShaders, LabelShaderOptions } from "./labels";

// Built-in node programs
export { NodeCircleProgram, NodeSquareProgram } from "./programs";
