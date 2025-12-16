/**
 * Sigma.js Edge Program - Arrow
 * ==============================
 *
 * Built-in edge program for directed edges with arrow heads.
 *
 * @module
 */
import { extremityArrow } from "../extremities";
import { createEdgeProgram } from "../factory";
import { layerPlain } from "../layers";
import { pathLine } from "../paths";

/**
 * EdgeArrowProgram renders edges as straight lines with arrow heads.
 *
 * This is the v4 composable edge program for directed edges.
 * Useful for directed graphs where edge direction matters.
 * The arrow head size is proportional to edge thickness.
 *
 * @example
 * ```typescript
 * import { EdgeArrowProgram } from "sigma/rendering";
 *
 * const sigma = new Sigma(graph, container, {
 *   edgeProgramClasses: { arrow: EdgeArrowProgram },
 * });
 * ```
 */
export const EdgeArrowProgram = createEdgeProgram({
  paths: [pathLine()],
  extremities: [extremityArrow()],
  layers: [layerPlain()],
  defaultHead: "arrow",
});

export default EdgeArrowProgram;
