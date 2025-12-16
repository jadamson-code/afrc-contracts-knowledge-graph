/**
 * Sigma.js Edge Program - Curved Line
 * ====================================
 *
 * Built-in edge program for curved lines without arrows.
 *
 * @module
 */
import { extremityNone } from "../extremities";
import { createEdgeProgram } from "../factory";
import { layerPlain } from "../layers";
import { pathCurved } from "../paths";

/**
 * EdgeCurveProgram renders edges as quadratic Bezier curves.
 *
 * This is the v4 composable edge program for curved lines - a smooth curved
 * line between source and target nodes.
 *
 * Edge attributes:
 * - `curvature`: How much the curve bends (0 = straight, 0.5 = moderate, 1.0 = strong)
 *
 * @example
 * ```typescript
 * import { EdgeCurveProgram } from "sigma/rendering";
 *
 * const sigma = new Sigma(graph, container, {
 *   edgeProgramClasses: { curved: EdgeCurveProgram },
 * });
 *
 * graph.addEdge("a", "b", { type: "curved", curvature: 0.5 });
 * ```
 */
export const EdgeCurveProgram = createEdgeProgram({
  paths: [pathCurved()],
  heads: [extremityNone()],
  tails: [extremityNone()],
  layers: [layerPlain()],
});

export default EdgeCurveProgram;
