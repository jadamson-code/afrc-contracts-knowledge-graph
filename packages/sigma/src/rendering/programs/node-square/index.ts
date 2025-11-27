/**
 * Sigma.js WebGL Renderer Node Program
 * =====================================
 *
 * Simple program rendering nodes as squares using the composable SDF-based
 * rendering system. Nodes are rendered as squares with solid color fill.
 * @module
 */
import { createComposedNodeProgram, layerFill, sdfSquare } from "../../composed";

export default createComposedNodeProgram({
  shape: sdfSquare(),
  layers: [layerFill()],
});
