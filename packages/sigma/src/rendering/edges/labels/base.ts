/**
 * Sigma.js WebGL Abstract Edge Label Program
 * ==========================================
 *
 * EdgeLabelProgram extends LabelProgram for edge-specific label data,
 * adding a processEdgeLabel entry point used by the label renderer.
 * @module
 */
import { Attributes } from "graphology-types";

import type Sigma from "../../../sigma";
import type { EdgeLabelDisplayData } from "../../../types";
import { LabelProgram } from "../../nodes/labels/base";
import type { EdgePath } from "../types";

export abstract class EdgeLabelProgram<
  Uniform extends string = string,
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends LabelProgram<Uniform, N, E, G, EdgeLabelDisplayData> {
  processEdgeLabel(labelKey: string, offset: number, data: EdgeLabelDisplayData): number {
    return super.processLabel(labelKey, offset, data);
  }

  /**
   * Measures a label's width in atlas (glyph) units — the unit consumed by
   * the edge label and background shaders for `a_totalTextWidth`.
   */
  abstract measureLabelAtlasWidth(text: string, fontKey?: string): number;
}

/**
 * Resolved shader-compile-time config shared by the edge label program
 * (character SDF shader) and the edge label background program (ribbon
 * shader). Both must agree on body bounds, visibility ramp, and
 * perpendicular offset, so both shader generators consume this same object.
 */
export interface EdgeLabelShaderConfig {
  paths: EdgePath[];
  headLengthRatio: number;
  tailLengthRatio: number;
  fontSizeMode: "fixed" | "scaled";
  minVisibilityThreshold: number;
  fullVisibilityThreshold: number;
}

/**
 * Normalizes a flat-options shape (as accepted by `createEdgeLabelProgram`
 * and the outer edge factory) into a resolved `EdgeLabelShaderConfig`.
 * Single source of truth for defaults — both sub-factories call this so
 * they cannot disagree.
 */
export function resolveEdgeLabelShaderConfig(options: {
  paths: EdgePath[];
  headLengthRatio?: number;
  tailLengthRatio?: number;
  fontSizeMode?: "fixed" | "scaled";
  minVisibilityThreshold?: number;
  fullVisibilityThreshold?: number;
}): EdgeLabelShaderConfig {
  return {
    paths: options.paths,
    headLengthRatio: options.headLengthRatio ?? 0,
    tailLengthRatio: options.tailLengthRatio ?? 0,
    fontSizeMode: options.fontSizeMode ?? "fixed",
    minVisibilityThreshold: options.minVisibilityThreshold ?? 0.7,
    fullVisibilityThreshold: options.fullVisibilityThreshold ?? 0.8,
  };
}

export type EdgeLabelProgramType<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = new (
  gl: WebGL2RenderingContext,
  pickingBuffer: WebGLFramebuffer | null,
  renderer: Sigma<N, E, G>,
) => EdgeLabelProgram<string, N, E, G>;
