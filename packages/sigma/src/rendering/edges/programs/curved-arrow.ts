/**
 * Sigma.js Edge Program - Curved Arrow
 * =====================================
 *
 * Built-in edge program for curved edges with arrow heads.
 *
 * @module
 */
import { extremityArrow, extremityNone } from "../extremities";
import { createEdgeProgram } from "../factory";
import { fillingPlain } from "../fillings";
import { pathQuadratic } from "../paths";

/**
 * EdgeCurvedArrowProgram renders edges as curved lines with arrow heads.
 *
 * This is the v4 composable edge program for curved directed edges.
 * Uses quadratic Bezier curves with an arrow head at the target.
 *
 * Edge attributes:
 * - `curvature`: How much the curve bends (0 = straight, 0.5 = moderate, 1.0 = strong)
 *
 * @example
 * ```typescript
 * import { EdgeCurvedArrowProgram } from "sigma/rendering";
 *
 * const sigma = new Sigma(graph, container, {
 *   edgeProgramClasses: { curved: EdgeCurvedArrowProgram },
 * });
 *
 * graph.addEdge("a", "b", { type: "curved", curvature: 0.5 });
 * ```
 */
export const EdgeCurvedArrowProgram = createEdgeProgram({
  path: pathQuadratic(),
  head: extremityArrow(),
  tail: extremityNone(),
  filling: fillingPlain(),
});

export default EdgeCurvedArrowProgram;
