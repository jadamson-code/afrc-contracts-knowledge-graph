/**
 * Sigma.js SDF Text Label Program
 * ================================
 *
 * WebGL program for rendering text labels using Signed Distance Fields (SDF).
 * This is the default/fallback label program that assumes circular nodes.
 *
 * ## Overview
 *
 * This program renders text labels with:
 * - Per-character instanced rendering for efficient GPU usage
 * - SDF-based anti-aliasing for crisp text at any zoom level
 * - Multi-font support via SDFAtlasManager
 * - Configurable label placement (right, left, above, below, over)
 *
 * ## When to Use
 *
 * Use this program when:
 * - Nodes are circular (default behavior)
 * - You don't need shape-aware label positioning
 * - You want the simplest setup
 *
 * For shape-aware positioning with non-circular nodes, use `createComposedPrograms()`
 * which generates label programs that use the actual node shape SDF.
 *
 * @module
 */
import { Attributes } from "graphology-types";

import { DEFAULT_SDF_ATLAS_OPTIONS, GlyphMetrics, SDFAtlasManager } from "../../core/sdf-atlas";
import type Sigma from "../../sigma";
import type { LabelDisplayData, LabelPosition, RenderParams } from "../../types";
import { floatColor } from "../../utils";
import { LabelProgram } from "../label";
import { InstancedProgramDefinition, ProgramInfo } from "../utils";
import FRAGMENT_SHADER_SOURCE from "./sdf-text.frag.glsl";
import VERTEX_SHADER_SOURCE from "./sdf-text.vert.glsl";

// ============================================================================
// Constants
// ============================================================================

/**
 * Maps label position names to numeric values for the vertex shader.
 * The shader uses these to determine the direction of label offset from the node.
 */
const POSITION_MODE_MAP: Record<LabelPosition, number> = {
  right: 0,
  left: 1,
  above: 2,
  below: 3,
  over: 4,
};

// ============================================================================
// Types
// ============================================================================

/**
 * Uniform names for the SDF text shader.
 */
type SDFTextUniform =
  | "u_matrix"
  | "u_sizeRatio"
  | "u_correctionRatio"
  | "u_cameraAngle"
  | "u_resolution"
  | "u_atlasSize"
  | "u_atlas"
  | "u_gamma"
  | "u_sdfBuffer";

/**
 * Options for configuring SDFTextLabelProgram.
 */
export interface SDFTextLabelProgramOptions {
  /**
   * Gamma value for text edge sharpness.
   * Default: √2 ≈ 1.414
   * Higher values = softer edges, lower = sharper.
   */
  gamma?: number;

  /**
   * Custom SDF atlas options (font size, buffer, etc.).
   */
  atlasOptions?: Partial<typeof DEFAULT_SDF_ATLAS_OPTIONS>;
}

/**
 * Cached glyph layout data for a single label.
 */
interface LabelGlyphCache {
  /** Glyph metrics for each character (undefined if glyph not found) */
  glyphs: (GlyphMetrics | undefined)[];
  /** Cumulative X offset for each character (in atlas font size pixels) */
  xOffsets: number[];
  /** Total label width (in atlas font size pixels) */
  totalWidth: number;
}

// ============================================================================
// Program Class
// ============================================================================

/**
 * SDF Text Label Program.
 *
 * Renders text labels using Signed Distance Fields for crisp, scalable text
 * at any zoom level. This is the default label program used by Sigma.
 *
 * ## Features
 *
 * - **Per-character instanced rendering**: Each character is a separate quad
 * - **Multi-font support**: Register multiple fonts via `registerFont()`
 * - **Configurable placement**: right, left, above, below, or centered on node
 * - **Efficient updates**: Glyph caching avoids recomputation
 *
 * ## Limitations
 *
 * - Assumes circular nodes for edge detection
 * - For non-circular nodes, use `createComposedPrograms()` instead
 *
 * @example
 * ```typescript
 * // Using the default label program (automatically configured)
 * const sigma = new Sigma(graph, container);
 *
 * // Or explicitly setting it
 * const sigma = new Sigma(graph, container, {
 *   labelProgramClasses: { default: SDFTextLabelProgram },
 * });
 * ```
 */
export class SDFTextLabelProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends LabelProgram<SDFTextUniform, N, E, G> {
  // -------------------------------------------------------------------------
  // Instance Properties
  // -------------------------------------------------------------------------

  /** Manages SDF glyph generation and atlas packing */
  private atlasManager: SDFAtlasManager;

  /** WebGL texture containing the glyph atlas */
  private atlasTexture: WebGLTexture | null = null;

  /** Gamma value for SDF edge sharpness */
  private gamma: number;

  /** SDF buffer/cutoff value from atlas options */
  private sdfBuffer: number;

  /** Flag indicating the atlas texture needs to be uploaded to GPU */
  private atlasNeedsUpdate = false;

  /** Cache of pre-computed glyph layout data per label */
  private labelGlyphCache: Map<string, LabelGlyphCache> = new Map();

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
    super(gl, pickingBuffer, renderer);

    // Initialize SDF atlas manager for glyph generation
    this.atlasManager = new SDFAtlasManager();
    this.gamma = Math.SQRT2;
    this.sdfBuffer = DEFAULT_SDF_ATLAS_OPTIONS.cutoff;

    // Create and configure WebGL texture for glyph atlas
    this.atlasTexture = gl.createTexture();
    if (!this.atlasTexture) {
      throw new Error("SDFTextLabelProgram: failed to create atlas texture");
    }

    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Subscribe to atlas updates to know when to re-upload texture
    this.atlasManager.on(SDFAtlasManager.ATLAS_UPDATED_EVENT, () => {
      this.atlasNeedsUpdate = true;
    });

    // Register the default font
    this.atlasManager.registerFont({
      family: "sans-serif",
      weight: "normal",
      style: "normal",
    });
  }

  // -------------------------------------------------------------------------
  // Program Definition
  // -------------------------------------------------------------------------

  getDefinition(): InstancedProgramDefinition<SDFTextUniform> {
    const { FLOAT, UNSIGNED_BYTE, TRIANGLE_STRIP } = WebGL2RenderingContext;

    return {
      VERTICES: 4, // Quad for each character
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      METHOD: TRIANGLE_STRIP,
      UNIFORMS: [
        "u_matrix",
        "u_sizeRatio",
        "u_correctionRatio",
        "u_cameraAngle",
        "u_resolution",
        "u_atlasSize",
        "u_atlas",
        "u_gamma",
        "u_sdfBuffer",
      ] as const,
      ATTRIBUTES: [
        // Per-character instance data
        { name: "a_anchorPosition", size: 2, type: FLOAT },
        { name: "a_charOffset", size: 2, type: FLOAT },
        { name: "a_charSize", size: 2, type: FLOAT },
        { name: "a_texCoords", size: 4, type: FLOAT },
        { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_nodeSize", size: 1, type: FLOAT },
        { name: "a_margin", size: 1, type: FLOAT },
        { name: "a_positionMode", size: 1, type: FLOAT },
      ],
      // Quad corners (same for all characters)
      CONSTANT_ATTRIBUTES: [{ name: "a_quadCorner", size: 2, type: FLOAT }],
      CONSTANT_DATA: [
        [-1, -1], // Bottom-left
        [1, -1], // Bottom-right
        [-1, 1], // Top-left
        [1, 1], // Top-right
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Glyph Preparation
  // -------------------------------------------------------------------------

  /**
   * Pre-computes glyph layout data for a label and caches it.
   *
   * This method:
   * 1. Ensures all glyphs are in the atlas
   * 2. Computes cumulative X offsets for each character
   * 3. Caches the data for use during character processing
   *
   * @param labelKey Unique identifier for this label
   * @param data Label display data
   */
  private prepareLabelGlyphs(labelKey: string, data: LabelDisplayData): void {
    if (data.hidden || !data.text) {
      this.labelGlyphCache.delete(labelKey);
      return;
    }

    const text = data.text;
    const fontKey =
      data.fontKey ||
      this.atlasManager.getFontKey({
        family: "sans-serif",
        weight: "normal",
        style: "normal",
      });

    // Ensure all glyphs exist in the atlas
    this.atlasManager.ensureGlyphs(text, fontKey);

    // Build glyph metrics and offset arrays
    const glyphs: (GlyphMetrics | undefined)[] = [];
    const xOffsets: number[] = [];
    let xOffset = 0;

    for (const char of text) {
      const charCode = char.codePointAt(0);
      if (charCode === undefined) {
        glyphs.push(undefined);
        xOffsets.push(xOffset);
        continue;
      }

      const glyph = this.atlasManager.getGlyph(charCode, fontKey);
      glyphs.push(glyph);
      xOffsets.push(xOffset);

      if (glyph) {
        xOffset += glyph.advance;
      }
    }

    this.labelGlyphCache.set(labelKey, {
      glyphs,
      xOffsets,
      totalWidth: xOffset,
    });
  }

  // -------------------------------------------------------------------------
  // Character Processing
  // -------------------------------------------------------------------------

  /**
   * Processes a single character and writes its vertex data to the buffer.
   *
   * ## Character Positioning
   *
   * Each character's position is computed as:
   * 1. Start from the label's anchor position (node center)
   * 2. Add position offset (computed in shader assuming circular node)
   * 3. Add character offset within the label
   * 4. Add glyph bearing for proper alignment
   *
   * ## Coordinate System
   *
   * - `charOffsetX/Y`: Offset from label origin to character's top-left corner
   * - Positive X = rightward, Positive Y = downward (screen coordinates)
   * - The shader will convert to clip space and flip Y
   *
   * @param index Buffer index for this character
   * @param labelData Label display data from sigma
   * @param _char The character (unused, we use charIndex)
   * @param charIndex Index of this character within the label text
   */
  protected processCharacter(index: number, labelData: LabelDisplayData, _char: string, charIndex: number): void {
    const array = this.array;
    const stride = this.STRIDE;
    const startIndex = index * stride;

    // Retrieve cached glyph data
    const cache = this.labelGlyphCache.get(labelData.parentKey);

    if (!cache || !cache.glyphs[charIndex]) {
      // No glyph data available - write zeros to skip this character
      for (let i = 0; i < stride; i++) {
        array[startIndex + i] = 0;
      }
      return;
    }

    const glyph = cache.glyphs[charIndex]!;
    const xOffset = cache.xOffsets[charIndex];

    // Scale factor: atlas glyphs are rendered at a fixed size, scale to requested size
    const scale = labelData.size / DEFAULT_SDF_ATLAS_OPTIONS.fontSize;

    // -----------------------------------------------------------------------
    // Compute character offset within the label
    // -----------------------------------------------------------------------

    let charOffsetX = xOffset * scale;
    let charOffsetY = 0;

    // Adjust X offset based on label position
    const position = labelData.position;
    if (position === "left") {
      // For left-positioned labels, characters flow right-to-left from the node
      charOffsetX = -(cache.totalWidth * scale - charOffsetX);
    } else if (position === "above" || position === "below" || position === "over") {
      // Center horizontally for vertical positions
      charOffsetX -= (cache.totalWidth * scale) / 2;
    }
    // For "right" position, charOffsetX is already correct (starts at 0)

    // Vertical centering: offset so glyph's visual center aligns with Y=0
    // bearingY is the distance from baseline to top of glyph
    charOffsetY = (glyph.atlasHeight / 2 - glyph.bearingY) * scale;

    // -----------------------------------------------------------------------
    // Write vertex attributes to buffer
    // -----------------------------------------------------------------------

    const color = floatColor(labelData.color);
    let i = startIndex;

    // a_anchorPosition: Node center in graph space
    array[i++] = labelData.x;
    array[i++] = labelData.y;

    // a_charOffset: Character position relative to label origin (pixels)
    array[i++] = charOffsetX;
    array[i++] = charOffsetY;

    // a_charSize: Character quad dimensions (pixels)
    array[i++] = glyph.atlasWidth * scale;
    array[i++] = glyph.atlasHeight * scale;

    // a_texCoords: Glyph location in atlas texture (pixels)
    array[i++] = glyph.atlasX;
    array[i++] = glyph.atlasY;
    array[i++] = glyph.atlasWidth;
    array[i++] = glyph.atlasHeight;

    // a_color: Packed RGBA color
    array[i++] = color;

    // a_nodeSize: Node size in graph coordinates (for edge detection)
    array[i++] = labelData.nodeSize;

    // a_margin: Gap between node edge and label (pixels)
    array[i++] = labelData.margin;

    // a_positionMode: Label position mode for shader
    array[i++] = POSITION_MODE_MAP[labelData.position];
  }

  /**
   * Processes a label by first preparing its glyph cache.
   */
  processLabel(labelKey: string, offset: number, data: LabelDisplayData): number {
    this.prepareLabelGlyphs(labelKey, data);
    return super.processLabel(labelKey, offset, data);
  }

  // -------------------------------------------------------------------------
  // Atlas Texture Management
  // -------------------------------------------------------------------------

  /**
   * Uploads the atlas texture to the GPU if it has changed.
   */
  private updateAtlasTexture(): void {
    if (!this.atlasNeedsUpdate) return;

    const gl = this.normalProgram.gl;
    const textures = this.atlasManager.getTextures();

    if (textures.length === 0) return;

    // Currently only support single atlas texture
    const imageData = textures[0];

    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      imageData.width,
      imageData.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      imageData.data,
    );
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.atlasNeedsUpdate = false;
  }

  // -------------------------------------------------------------------------
  // Uniform Setting
  // -------------------------------------------------------------------------

  /**
   * Sets all uniforms for the label shader.
   */
  setUniforms(params: RenderParams, programInfo: ProgramInfo): void {
    const { gl, uniformLocations } = programInfo;

    // Transform uniforms
    gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
    gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
    gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
    gl.uniform1f(uniformLocations.u_cameraAngle, params.cameraAngle);

    // Viewport size in physical pixels
    gl.uniform2f(uniformLocations.u_resolution, params.width * params.pixelRatio, params.height * params.pixelRatio);

    // Atlas texture size
    const textures = this.atlasManager.getTextures();
    if (textures.length > 0) {
      gl.uniform2f(uniformLocations.u_atlasSize, textures[0].width, textures[0].height);
    } else {
      gl.uniform2f(uniformLocations.u_atlasSize, 1, 1);
    }

    // Bind atlas texture to texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.uniform1i(uniformLocations.u_atlas, 0);

    // SDF rendering parameters
    gl.uniform1f(uniformLocations.u_gamma, this.gamma);
    gl.uniform1f(uniformLocations.u_sdfBuffer, this.sdfBuffer);
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  protected renderProgram(params: RenderParams, programInfo: ProgramInfo): void {
    // Ensure atlas texture is uploaded
    this.updateAtlasTexture();

    // Flush any pending glyph generation
    if (this.atlasManager.hasPendingGlyphs()) {
      this.atlasManager.flush();
      this.updateAtlasTexture();
    }

    super.renderProgram(params, programInfo);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Registers a font for use in labels.
   *
   * @param family Font family name (e.g., "Arial", "sans-serif")
   * @param weight Font weight (e.g., "normal", "bold")
   * @param style Font style (e.g., "normal", "italic")
   * @returns Font key for use in label data
   */
  registerFont(family: string, weight = "normal", style = "normal"): string {
    return this.atlasManager.registerFont({ family, weight, style });
  }

  /**
   * Returns the SDFAtlasManager for advanced use cases.
   */
  getAtlasManager(): SDFAtlasManager {
    return this.atlasManager;
  }

  /**
   * Pre-generates glyphs for the given texts.
   * Call this before rendering to avoid generation during animation.
   *
   * @param texts Array of text strings to prepare
   * @param fontKey Optional font key (defaults to sans-serif)
   */
  ensureGlyphsReady(texts: string[], fontKey?: string): void {
    const actualFontKey =
      fontKey ||
      this.atlasManager.getFontKey({
        family: "sans-serif",
        weight: "normal",
        style: "normal",
      });

    // Queue all glyph requests
    for (const text of texts) {
      this.atlasManager.ensureGlyphs(text, actualFontKey);
    }

    // Flush immediately to generate all glyphs synchronously
    this.atlasManager.flush();
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  kill(): void {
    const gl = this.normalProgram.gl;

    // Delete WebGL texture
    if (this.atlasTexture) {
      gl.deleteTexture(this.atlasTexture);
      this.atlasTexture = null;
    }

    // Clean up atlas manager
    this.atlasManager.destroy();

    // Clear caches
    this.labelGlyphCache.clear();

    super.kill();
  }
}

export default SDFTextLabelProgram;
