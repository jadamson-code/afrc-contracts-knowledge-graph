import Sigma from "sigma";

import { WebGLLayerProgramType } from "./webgl-layer-program";

/**
 * Binds a custom layer program to a Sigma instance at the given depth layer position.
 * The depth name must be declared in the primitives depthLayers array.
 * Returns a cleanup function.
 */
export default function bindWebGLLayer(id: string, renderer: Sigma, ProgramClass: WebGLLayerProgramType): () => void {
  const gl = renderer.getWebGLContext();
  const program = new ProgramClass(gl, null, renderer);
  renderer.addCustomLayerProgram(id, program);

  return () => renderer.removeCustomLayerProgram(id);
}
