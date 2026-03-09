/**
 * Sigma.js WebGL Abstract Backdrop Program
 * =========================================
 *
 * Base classes for WebGL backdrop programs.
 * Backdrop programs render the background shape (node + label union) with shadow
 * for highlighted/hovered nodes.
 * @module
 */
import { Attributes } from "graphology-types";

import type Sigma from "../../../sigma";
import type { LabelPosition, RenderParams } from "../../../types";
import { Program } from "../../program";
import { InstancedProgramDefinition, ProgramDefinition, ProgramInfo } from "../../utils";

export interface BackdropDisplayData {
  key: string;
  x: number;
  y: number;
  size: number;
  label: string | null;
  labelWidth: number;
  labelHeight: number;
  type: string;
  shapeId: number;
  position: LabelPosition;
  labelAngle: number;
  // Per-node backdrop style data
  backdropColor: [number, number, number, number]; // RGBA floats 0-1
  backdropShadowColor: [number, number, number, number]; // RGBA floats 0-1
  backdropShadowBlur: number;
  backdropPadding: number;
  backdropBorderColor: [number, number, number, number]; // RGBA floats 0-1
  backdropBorderWidth: number;
  backdropCornerRadius: number;
  backdropLabelPadding: number; // Already resolved (fallback applied)
  backdropArea: number; // 0=both, 1=node, 2=label
  labelBoxOffset: [number, number]; // Shifts label box center (e.g., to cover attachment below)
}

export abstract class BackdropProgram<
  Uniform extends string = string,
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends Program<Uniform, N, E, G> {
  protected totalBackdropCount = 0;
  protected bufferCapacity = 0;

  abstract processBackdrop(offset: number, data: BackdropDisplayData): void;

  hasNothingToRender(): boolean {
    return this.totalBackdropCount === 0;
  }

  drawWebGL(method: number, { gl }: ProgramInfo): void {
    if (this.totalBackdropCount === 0) return;

    if (!this.isInstanced) {
      gl.drawArrays(method, 0, this.totalBackdropCount * this.VERTICES);
    } else {
      gl.drawArraysInstanced(method, 0, this.VERTICES, this.totalBackdropCount);
    }
  }

  reallocate(backdropCount: number): void {
    this.totalBackdropCount = backdropCount;

    if (backdropCount > this.bufferCapacity) {
      this.bufferCapacity = Math.max(backdropCount, Math.ceil(this.bufferCapacity * 1.5) || 10);
      super.reallocate(this.bufferCapacity);
    }
  }

  abstract getDefinition(): ProgramDefinition<Uniform> | InstancedProgramDefinition<Uniform>;
  abstract setUniforms(params: RenderParams, programInfo: ProgramInfo): void;
}

export type BackdropProgramType<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = new (
  gl: WebGL2RenderingContext,
  pickingBuffer: WebGLFramebuffer | null,
  renderer: Sigma<N, E, G>,
) => BackdropProgram<string, N, E, G>;
