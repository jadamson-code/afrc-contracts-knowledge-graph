/**
 * Sigma.js WebGL Renderer Node Program
 * =====================================
 *
 * Simple program rendering nodes as discs using the composable SDF-based
 * rendering system. Nodes are rendered as perfect circles with solid color fill.
 * @module
 */
import { createComposedNodeProgram, layerFill, sdfCircle } from "../../composed";

export default createComposedNodeProgram({
  shape: sdfCircle(),
  layers: [layerFill()],
});
