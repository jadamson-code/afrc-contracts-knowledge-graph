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

export abstract class EdgeLabelProgram<
  Uniform extends string = string,
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends LabelProgram<Uniform, N, E, G, EdgeLabelDisplayData> {
  processEdgeLabel(labelKey: string, offset: number, data: EdgeLabelDisplayData): number {
    return super.processLabel(labelKey, offset, data);
  }
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
