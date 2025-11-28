/**
 * Sigma.js Node Label Programs - Exports
 * =======================================
 *
 * Exports for label program creation and shader generation.
 *
 * @module
 */

export { LabelProgram, AbstractLabelProgram } from "./base";
export type { LabelProgramType } from "./base";

export { createLabelProgram } from "./factory";
export type { CreateLabelProgramOptions } from "./factory";

export {
  generateLabelShaders,
  generateLabelVertexShader,
  generateLabelFragmentShader,
  collectLabelUniforms,
} from "./generator";
export type { GeneratedLabelShaders, LabelShaderOptions } from "./generator";
