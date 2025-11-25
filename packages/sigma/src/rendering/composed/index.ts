/**
 * Sigma.js Composable Node Programs
 * ==================================
 *
 * Main exports for the composable node program system.
 *
 * @module
 */

// Core factory function
export { createComposedNodeProgram } from "./factory";

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

// Shader generator (advanced usage)
export { generateShaders, generateVertexShader, generateFragmentShader, collectUniforms, collectAttributes } from "./generator";
export type { GeneratedShaders } from "./generator";
