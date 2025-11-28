/**
 * Sigma.js WebGL Abstract Label Program
 * ======================================
 *
 * Base classes for WebGL label programs.
 * @module
 */
import { Attributes } from "graphology-types";

import type Sigma from "../../../sigma";
import type { LabelDisplayData, RenderParams } from "../../../types";
import { AbstractProgram, Program } from "../../program";
import { InstancedProgramDefinition, ProgramDefinition, ProgramInfo } from "../../utils";

/**
 * Abstract base class for label programs.
 *
 * Label programs render text labels using WebGL (SDF-based rendering).
 * Unlike node/edge programs, labels are processed per-character.
 *
 * Visibility is handled by processing only visible labels each frame,
 * rather than maintaining visibility flags for all labels.
 */
export abstract class AbstractLabelProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends AbstractProgram<N, E, G> {
  /**
   * Process a label and write its character data to the GPU buffer.
   *
   * @param labelKey - Unique key for the label
   * @param offset - Starting offset in the buffer
   * @param data - Label display data
   * @returns Number of characters processed (for buffer offset calculation)
   */
  abstract processLabel(labelKey: string, offset: number, data: LabelDisplayData): number;

  /**
   * Get the label at a given screen position (for picking/events).
   *
   * @param x - Screen X coordinate
   * @param y - Screen Y coordinate
   * @returns Label key or null if no label at position
   */
  abstract getLabelAtPosition(x: number, y: number): string | null;

  /**
   * Ensure all glyphs for the given texts are generated and available.
   * Optional method - implementations may provide this for glyph caching.
   *
   * @param texts - Array of text strings to prepare
   * @param fontKey - Optional font key
   */
  ensureGlyphsReady?(texts: string[], fontKey?: string): void;
}

/**
 * Base class for concrete label program implementations.
 *
 * Extends Program with label-specific functionality:
 * - Per-character processing
 * - Screen-space bounds tracking for hit testing
 *
 * Visibility is handled by processing only visible labels each frame
 * (determined by LabelGrid), so all characters in the buffer are rendered.
 */
export abstract class LabelProgram<
    Uniform extends string = string,
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  >
  extends Program<Uniform, N, E, G>
  implements AbstractLabelProgram<N, E, G>
{
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
   * Process a label and write its character data to the GPU buffer.
   */
  processLabel(_labelKey: string, offset: number, data: LabelDisplayData): number {
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
   * @param labelData - Parent label data
   * @param char - The character to process
   * @param charIndex - Index of character within the label text
   */
  protected abstract processCharacter(
    index: number,
    labelData: LabelDisplayData,
    char: string,
    charIndex: number,
  ): void;

  /**
   * Get the label at a given screen position.
   *
   * Uses the cached screen-space bounds for efficient hit testing.
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
   *
   * Called during rendering to keep bounds in sync with camera.
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
   * Since we only process visible labels, all buffered characters should be rendered.
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
   * Only reallocates GPU buffers when capacity is exceeded.
   *
   * @param characterCount - Number of characters to render this frame
   */
  reallocate(characterCount: number): void {
    this.totalCharacterCount = characterCount;

    // Only reallocate GPU buffers if we need more capacity
    if (characterCount > this.bufferCapacity) {
      // Allocate with some headroom to avoid frequent reallocations
      this.bufferCapacity = Math.max(characterCount, Math.ceil(this.bufferCapacity * 1.5) || 1000);
      super.reallocate(this.bufferCapacity);
    }
  }

  abstract getDefinition(): ProgramDefinition<Uniform> | InstancedProgramDefinition<Uniform>;
  abstract setUniforms(params: RenderParams, programInfo: ProgramInfo): void;
}

/**
 * Type for LabelProgram class constructors.
 */
class _LabelProgramClass<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> implements AbstractLabelProgram<N, E, G>
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
  processLabel(_labelKey: string, _offset: number, _data: LabelDisplayData): number {
    return 0;
  }
  getLabelAtPosition(_x: number, _y: number): string | null {
    return null;
  }
  render(_params: RenderParams): void {
    return undefined;
  }
  ensureGlyphsReady(_texts: string[], _fontKey?: string): void {
    return undefined;
  }
}

export type LabelProgramType<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = typeof _LabelProgramClass<N, E, G>;
