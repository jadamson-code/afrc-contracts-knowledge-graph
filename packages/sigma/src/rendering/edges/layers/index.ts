/**
 * Sigma.js Edge Layers - Exports
 * ==============================
 *
 * @module
 */

export { layerDashed } from "./dashed";
export type { DashSize, DashSizeMode, LayerDashedOptions, GapFilling, SolidExtremities, SolidMargin } from "./dashed";
export { layerPlain } from "./plain";
export { registerEdgeLayerFactory, type EdgeLayerFactory } from "./factory";
