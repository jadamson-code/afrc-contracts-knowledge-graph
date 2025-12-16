/**
 * Sigma.js Node Square Program
 * =============================
 *
 * Built-in program for rendering square nodes.
 *
 * @module
 */
import { createNodeProgram } from "../factory";
import { layerFill } from "../layers";
import { sdfSquare } from "../shapes";

/**
 * Node program that renders square nodes.
 *
 * @example
 * ```typescript
 * import { NodeSquareProgram } from "sigma/rendering";
 *
 * const sigma = new Sigma(graph, container, {
 *   nodeProgramClasses: { square: NodeSquareProgram },
 *   labelProgramClasses: { square: NodeSquareProgram.LabelProgram },
 * });
 * ```
 */
const NodeSquareProgram = createNodeProgram({
  shapes: [sdfSquare()],
  layers: [layerFill()],
});

export default NodeSquareProgram;
