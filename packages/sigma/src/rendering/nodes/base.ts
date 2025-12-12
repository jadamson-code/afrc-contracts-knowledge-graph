/**
 * Sigma.js WebGL Abstract Node Program
 * =====================================
 *
 * @module
 */
import { Attributes } from "graphology-types";

import Sigma from "../../sigma";
import { NodeDisplayData, RenderParams } from "../../types";
import { indexToColor } from "../../utils";
import { HoverProgramType } from "./hovers";
import { LabelProgramType } from "./labels";
import { AbstractProgram, Program } from "../program";

export abstract class AbstractNodeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends AbstractProgram<N, E, G> {
  abstract process(nodeIndex: number, offset: number, data: NodeDisplayData, textureIndex: number): void;
}

export abstract class NodeProgram<
    Uniform extends string = string,
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  >
  extends Program<Uniform, N, E, G>
  implements AbstractNodeProgram<N, E, G>
{
  /**
   * Static reference to the associated LabelProgram class.
   * This is set by createNodeProgram() for programs created via the factory.
   */
  static LabelProgram: LabelProgramType | undefined;

  /**
   * Static reference to the associated HoverProgram class.
   * This is set by createNodeProgram() for programs created via the factory.
   */
  static HoverProgram: HoverProgramType | undefined;

  kill(): void {
    super.kill();
  }

  process(nodeIndex: number, offset: number, data: NodeDisplayData, textureIndex: number): void {
    let i = offset * this.STRIDE;
    // NOTE: dealing with hidden items automatically
    if (data.hidden) {
      for (let l = i + this.STRIDE; i < l; i++) {
        this.array[i] = 0;
      }
      return;
    }

    return this.processVisibleItem(indexToColor(nodeIndex), i, data, textureIndex);
  }

  abstract processVisibleItem(nodeIndex: number, i: number, data: NodeDisplayData, textureIndex: number): void;
}

class _NodeProgramClass<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> implements AbstractNodeProgram<N, E, G>
{
  static LabelProgram: LabelProgramType | undefined;
  static HoverProgram: HoverProgramType | undefined;

  constructor(_gl: WebGL2RenderingContext, _pickingBuffer: WebGLFramebuffer | null, _renderer: Sigma<N, E, G>) {
    return this;
  }

  kill(): void {
    return undefined;
  }
  reallocate(_capacity: number): void {
    return undefined;
  }
  process(_nodeIndex: number, _offset: number, _data: NodeDisplayData, _textureIndex: number): void {
    return undefined;
  }
  render(_params: RenderParams): void {
    return undefined;
  }
}
export type NodeProgramType<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = typeof _NodeProgramClass<N, E, G>;
