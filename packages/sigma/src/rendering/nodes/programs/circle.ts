/**
 * Sigma.js Node Circle Program
 * =============================
 *
 * Built-in program for rendering circular nodes.
 *
 * @module
 */
import { createNodeProgram } from "../factory";
import { layerFill } from "../layers";
import { sdfCircle } from "../shapes";

/**
 * Node program that renders circular nodes.
 * This is the default node program used by Sigma.
 *
 * @example
 * ```typescript
 * import { NodeCircleProgram } from "sigma/rendering";
 *
 * const sigma = new Sigma(graph, container, {
 *   nodeProgramClasses: { circle: NodeCircleProgram },
 *   labelProgramClasses: { circle: NodeCircleProgram.LabelProgram },
 * });
 * ```
 */
const NodeCircleProgram = createNodeProgram({
  shapes: [sdfCircle()],
  layers: [layerFill()],
});

export default NodeCircleProgram;
