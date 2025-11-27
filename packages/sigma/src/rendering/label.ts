/**
 * Sigma.js WebGL Abstract Label Program
 * ======================================
 *
 * Base classes for WebGL label programs.
 * @module
 */
import { Attributes } from "graphology-types";

import type Sigma from "../sigma";
import type { LabelDisplayData, RenderParams } from "../types";
import { AbstractProgram, Program } from "./program";
import { InstancedProgramDefinition, ProgramDefinition, ProgramInfo } from "./utils";

/**
 * Abstract base class for label programs.
 *
 * Label programs render text labels using WebGL (SDF-based rendering).
 * Unlike node/edge programs, labels are processed per-character.
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
   * Update the visibility of labels (controls which labels are rendered).
   *
   * This uses an index buffer approach for efficiency: all character data
   * stays in GPU memory, only the index buffer is updated.
   *
   * @param visibleLabels - Set of label keys that should be visible
   */
  abstract updateVisibility(visibleLabels: Set<string>): void;

  /**
   * Get the total number of characters for a label.
   *
   * @param labelKey - Label key
   * @returns Number of characters, or 0 if label not found
   */
  abstract getLabelCharacterCount(labelKey: string): number;

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
 * - Index buffer for visibility management
 * - Screen-space bounds tracking for hit testing
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
   * Index buffer for visibility management.
   * Only visible labels have their indices included.
   */
  protected indexBuffer: WebGLBuffer | null = null;

  /**
   * Current visible character indices.
   */
  protected visibleIndices: Uint32Array = new Uint32Array(0);

  /**
   * Number of visible characters to render.
   */
  protected visibleCount = 0;

  /**
   * Maps label keys to their character ranges in the buffer.
   */
  protected labelCharacterOffsets: Map<string, { start: number; count: number }> = new Map();

  /**
   * Screen-space bounds for each label (for hit testing).
   */
  protected labelBounds: Map<string, { x: number; y: number; width: number; height: number }> = new Map();

  /**
   * Total number of characters across all labels.
   */
  protected totalCharacterCount = 0;

  constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
    super(gl, pickingBuffer, renderer);

    // Create index buffer
    this.indexBuffer = gl.createBuffer();
    if (!this.indexBuffer) {
      throw new Error("LabelProgram: failed to create index buffer");
    }
  }

  kill(): void {
    const gl = this.normalProgram.gl;
    if (this.indexBuffer) {
      gl.deleteBuffer(this.indexBuffer);
      this.indexBuffer = null;
    }
    this.labelCharacterOffsets.clear();
    this.labelBounds.clear();
    super.kill();
  }

  /**
   * Process a label and write its character data to the GPU buffer.
   */
  processLabel(labelKey: string, offset: number, data: LabelDisplayData): number {
    if (data.hidden || !data.text) {
      this.labelCharacterOffsets.delete(labelKey);
      return 0;
    }

    const text = data.text;
    const charCount = text.length;

    // Track character offset for this label
    this.labelCharacterOffsets.set(labelKey, { start: offset, count: charCount });

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
   * Update the visibility of labels.
   *
   * Builds an index buffer containing only the character indices
   * for visible labels. This avoids rebuilding the full vertex buffer.
   */
  updateVisibility(visibleLabels: Set<string>): void {
    // Count visible characters
    let visibleCharCount = 0;
    for (const labelKey of visibleLabels) {
      const range = this.labelCharacterOffsets.get(labelKey);
      if (range) {
        visibleCharCount += range.count;
      }
    }

    // Reallocate index array if needed
    if (this.visibleIndices.length < visibleCharCount) {
      this.visibleIndices = new Uint32Array(visibleCharCount);
    }

    // Build index array
    let indexOffset = 0;
    for (const labelKey of visibleLabels) {
      const range = this.labelCharacterOffsets.get(labelKey);
      if (range) {
        for (let i = 0; i < range.count; i++) {
          this.visibleIndices[indexOffset++] = range.start + i;
        }
      }
    }

    this.visibleCount = visibleCharCount;

    // Upload index buffer
    const gl = this.normalProgram.gl;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.visibleIndices.subarray(0, this.visibleCount), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  /**
   * Get the character count for a label.
   */
  getLabelCharacterCount(labelKey: string): number {
    return this.labelCharacterOffsets.get(labelKey)?.count ?? 0;
  }

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
   * Override to render all characters.
   * TODO: Implement visibility filtering using a visibility attribute
   * or by reordering buffer data for visible labels.
   */
  drawWebGL(method: number, { gl }: ProgramInfo): void {
    if (this.totalCharacterCount === 0) return;

    // For now, render all characters (visibility filtering to be implemented)
    // This works for initial testing; optimization can use visibility attributes
    if (!this.isInstanced) {
      gl.drawArrays(method, 0, this.totalCharacterCount * this.VERTICES);
    } else {
      gl.drawArraysInstanced(method, 0, this.VERTICES, this.totalCharacterCount);
    }
  }

  /**
   * Override reallocate to track total character count.
   * For label programs, capacity represents character count (not item count).
   */
  reallocate(capacity: number): void {
    this.totalCharacterCount = capacity;
    super.reallocate(capacity);
  }

  /**
   * Reallocate buffers for a given total character capacity.
   * @deprecated Use reallocate() directly - capacity is character count for label programs.
   */
  reallocateForCharacters(characterCapacity: number): void {
    this.reallocate(characterCapacity);
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
  updateVisibility(_visibleLabels: Set<string>): void {
    return undefined;
  }
  getLabelCharacterCount(_labelKey: string): number {
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
