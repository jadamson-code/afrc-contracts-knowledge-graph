/**
 * Sigma.js WebGL Abstract Hover Program
 * ======================================
 *
 * Base classes for WebGL hover programs.
 * Hover programs render the background shape (node + label union) with shadow
 * for highlighted/hovered nodes.
 * @module
 */
import { Attributes } from "graphology-types";

import type Sigma from "../../../sigma";
import type { RenderParams } from "../../../types";
import { AbstractProgram, Program } from "../../program";
import { InstancedProgramDefinition, ProgramDefinition, ProgramInfo } from "../../utils";

export interface HoverDisplayData {
  key: string;
  x: number;
  y: number;
  size: number;
  label: string | null;
  labelWidth: number;
  labelHeight: number;
  type: string;
  shapeId: number;
}

export abstract class AbstractHoverProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends AbstractProgram<N, E, G> {
  abstract processHover(offset: number, data: HoverDisplayData): void;
}

export abstract class HoverProgram<
    Uniform extends string = string,
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  >
  extends Program<Uniform, N, E, G>
  implements AbstractHoverProgram<N, E, G>
{
  protected totalHoverCount = 0;
  protected bufferCapacity = 0;

  abstract processHover(offset: number, data: HoverDisplayData): void;

  hasNothingToRender(): boolean {
    return this.totalHoverCount === 0;
  }

  drawWebGL(method: number, { gl }: ProgramInfo): void {
    if (this.totalHoverCount === 0) return;

    if (!this.isInstanced) {
      gl.drawArrays(method, 0, this.totalHoverCount * this.VERTICES);
    } else {
      gl.drawArraysInstanced(method, 0, this.VERTICES, this.totalHoverCount);
    }
  }

  reallocate(hoverCount: number): void {
    this.totalHoverCount = hoverCount;

    if (hoverCount > this.bufferCapacity) {
      this.bufferCapacity = Math.max(hoverCount, Math.ceil(this.bufferCapacity * 1.5) || 10);
      super.reallocate(this.bufferCapacity);
    }
  }

  abstract getDefinition(): ProgramDefinition<Uniform> | InstancedProgramDefinition<Uniform>;
  abstract setUniforms(params: RenderParams, programInfo: ProgramInfo): void;
}

class _HoverProgramClass<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> implements AbstractHoverProgram<N, E, G>
{
  constructor(_gl: WebGL2RenderingContext, _pickingBuffer: WebGLFramebuffer | null, _renderer: Sigma<N, E, G>) {
    return this;
  }

  kill(): void {
    return undefined;
  }
  reallocate(_capacity: number): void {
    return undefined;
  }
  processHover(_offset: number, _data: HoverDisplayData): void {
    return undefined;
  }
  render(_params: RenderParams): void {
    return undefined;
  }
}

export type HoverProgramType<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = typeof _HoverProgramClass<N, E, G>;
