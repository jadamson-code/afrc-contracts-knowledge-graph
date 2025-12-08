/**
 * Sigma.js Edge Program - Line
 * =============================
 *
 * Built-in edge program for simple straight lines without arrows.
 *
 * @module
 */
import { extremityNone } from "../extremities";
import { createEdgeProgram } from "../factory";
import { fillingPlain } from "../fillings";
import { pathLine } from "../paths";

/**
 * EdgeLineProgram renders edges as simple straight lines.
 *
 * This is the v4 composable edge program for basic lines - a solid colored
 * line between source and target nodes, with shape-aware endpoint clamping.
 *
 * @example
 * ```typescript
 * import { EdgeLineProgram } from "sigma/rendering";
 *
 * const sigma = new Sigma(graph, container, {
 *   edgeProgramClasses: { line: EdgeLineProgram },
 * });
 * ```
 */
export const EdgeLineProgram = createEdgeProgram({
  path: pathLine(),
  head: extremityNone(),
  tail: extremityNone(),
  filling: fillingPlain(),
});

export default EdgeLineProgram;
