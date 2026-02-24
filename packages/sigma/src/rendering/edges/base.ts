/**
 * Sigma.js WebGL Abstract Edge Program
 * =====================================
 *
 * @module
 */
import { Attributes } from "graphology-types";

import Sigma from "../../sigma";
import { EdgeDisplayData, NodeDisplayData } from "../../types";
import { indexToColor } from "../../utils";
import { Program } from "../program";
import { EdgeLabelProgramType } from "./labels";

export abstract class EdgeProgram<
  Uniform extends string = string,
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends Program<Uniform, N, E, G> {
  /**
   * Static reference to the associated LabelProgram class.
   * This is set by createEdgeProgram() for programs created via the factory.
   */
  static LabelProgram: EdgeLabelProgramType | undefined;

  kill(): void {
    super.kill();
  }

  process(
    edgeIndex: number,
    offset: number,
    sourceData: NodeDisplayData,
    targetData: NodeDisplayData,
    data: EdgeDisplayData,
    edgeTextureIndex: number,
  ): void {
    let i = offset * this.STRIDE;
    // NOTE: dealing with hidden items automatically
    if (data.hidden || sourceData.hidden || targetData.hidden) {
      for (let l = i + this.STRIDE; i < l; i++) {
        this.array[i] = 0;
      }
      return;
    }

    return this.processVisibleItem(indexToColor(edgeIndex), i, sourceData, targetData, data, edgeTextureIndex);
  }

  abstract processVisibleItem(
    edgeIndex: number,
    startIndex: number,
    sourceData: NodeDisplayData,
    targetData: NodeDisplayData,
    data: EdgeDisplayData,
    edgeTextureIndex: number,
  ): void;
}

export type EdgeProgramType<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = {
  new (
    gl: WebGL2RenderingContext,
    pickingBuffer: WebGLFramebuffer | null,
    renderer: Sigma<N, E, G>,
  ): EdgeProgram<string, N, E, G>;
  LabelProgram?: EdgeLabelProgramType<N, E, G>;
};
