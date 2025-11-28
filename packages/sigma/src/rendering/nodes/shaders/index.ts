/**
 * Sigma.js Shader Generators - Exports
 * =====================================
 *
 * Exports for shader generation utilities.
 *
 * @module
 */

export {
  generateShaders,
  generateVertexShader,
  generateFragmentShader,
  collectUniforms,
  collectAttributes,
} from "./generator";

export type { GeneratedShaders, ShaderGenerationOptions } from "./generator";
