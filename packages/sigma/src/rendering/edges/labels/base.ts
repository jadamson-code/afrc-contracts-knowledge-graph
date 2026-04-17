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
   * Optional: implementations backed by an SDF atlas provide this.
   */
  measureLabelAtlasWidth?(text: string, fontKey?: string): number;
}

/**
 * Resolved shader config exposed by `createEdgeLabelProgram`. The background
 * program reads it to stay in lockstep with the label's body bounds,
 * visibility ramp, and perpendicular offset.
 */
export interface EdgeLabelShaderConfig {
  paths: EdgePath[];
  headLengthRatio: number;
  tailLengthRatio: number;
  fontSizeMode: "fixed" | "scaled";
  minVisibilityThreshold: number;
  fullVisibilityThreshold: number;
}

export type EdgeLabelProgramType<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = (new (
  gl: WebGL2RenderingContext,
  pickingBuffer: WebGLFramebuffer | null,
  renderer: Sigma<N, E, G>,
) => EdgeLabelProgram<string, N, E, G>) & {
  readonly labelShaderConfig: EdgeLabelShaderConfig;
};
