/**
 * Sigma.js WebGL Abstract Edge Label Program
 * ==========================================
 *
 * Base classes for WebGL edge label programs.
 * @module
 */
import { Attributes } from "graphology-types";

import type Sigma from "../../../sigma";
import type { EdgeLabelDisplayData, RenderParams } from "../../../types";
import { Program } from "../../program";
import { InstancedProgramDefinition, ProgramDefinition, ProgramInfo } from "../../utils";

/**
 * Base class for edge label program implementations.
 *
 * Edge label programs render text labels along edge paths using WebGL (SDF-based rendering).
 * Labels are processed per-character, with each character positioned along the edge path.
 */
export abstract class EdgeLabelProgram<
    Uniform extends string = string,
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  >
  extends Program<Uniform, N, E, G>
{
  /**
   * Ensure all glyphs for the given texts are generated and available.
   */
  ensureGlyphsReady?(texts: string[], fontKey?: string): void;

  /**
   * Screen-space bounds for each label (for hit testing).
   */
  protected labelBounds: Map<string, { x: number; y: number; width: number; height: number }> = new Map();

  /**
   * Total number of characters currently in the buffer.
   */
  protected totalCharacterCount = 0;

  /**
   * Buffer capacity (in characters) - only reallocate when exceeded.
   */
  protected bufferCapacity = 0;

  kill(): void {
    this.labelBounds.clear();
    super.kill();
  }

  /**
   * Process an edge label and write its character data to the GPU buffer.
   */
  processEdgeLabel(_labelKey: string, offset: number, data: EdgeLabelDisplayData): number {
    if (data.hidden || !data.text) {
      return 0;
    }

    const text = data.text;
    const charCount = text.length;

    // Process each character
    for (let i = 0; i < charCount; i++) {
      const char = text[i];
      this.processCharacter(offset + i, data, char, i);
    }

    return charCount;
  }

  /**
   * Process a single character. Override in subclasses.
   *
   * @param index - Character index in the buffer
   * @param labelData - Parent edge label data
   * @param char - The character to process
   * @param charIndex - Index of character within the label text
   */
  protected abstract processCharacter(
    index: number,
    labelData: EdgeLabelDisplayData,
    char: string,
    charIndex: number,
  ): void;

  /**
   * Get the label at a given screen position.
   */
  getLabelAtPosition(x: number, y: number): string | null {
    for (const [labelKey, bounds] of this.labelBounds) {
      if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
        return labelKey;
      }
    }
    return null;
  }

  /**
   * Update screen-space bounds for a label.
   */
  protected updateLabelBounds(
    labelKey: string,
    screenX: number,
    screenY: number,
    width: number,
    height: number,
  ): void {
    this.labelBounds.set(labelKey, { x: screenX, y: screenY, width, height });
  }

  /**
   * Check if there's nothing to render.
   */
  hasNothingToRender(): boolean {
    return this.totalCharacterCount === 0;
  }

  /**
   * Render all characters in the buffer.
   */
  drawWebGL(method: number, { gl }: ProgramInfo): void {
    if (this.totalCharacterCount === 0) return;

    if (!this.isInstanced) {
      gl.drawArrays(method, 0, this.totalCharacterCount * this.VERTICES);
    } else {
      gl.drawArraysInstanced(method, 0, this.VERTICES, this.totalCharacterCount);
    }
  }

  /**
   * Reallocate buffers if needed and set the character count for this frame.
   */
  reallocate(characterCount: number): void {
    this.totalCharacterCount = characterCount;

    if (characterCount > this.bufferCapacity) {
      this.bufferCapacity = Math.max(characterCount, Math.ceil(this.bufferCapacity * 1.5) || 1000);
      super.reallocate(this.bufferCapacity);
    }
  }

  abstract getDefinition(): ProgramDefinition<Uniform> | InstancedProgramDefinition<Uniform>;
  abstract setUniforms(params: RenderParams, programInfo: ProgramInfo): void;
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
