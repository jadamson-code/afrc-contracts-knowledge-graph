/**
 * Sigma.js Edge Label Program Factory
 * ====================================
 *
 * Factory function that creates an EdgeLabelProgram class for rendering
 * edge labels along edge paths using WebGL SDF text rendering.
 *
 * @module
 */
import { Attributes } from "graphology-types";

import { DEFAULT_SDF_ATLAS_OPTIONS, GlyphMetrics, SDFAtlasManager } from "../../../core/sdf-atlas";
import type Sigma from "../../../sigma";
import type { EdgeLabelDisplayData, RenderParams } from "../../../types";
import { floatColor } from "../../../utils";
import { InstancedProgramDefinition, ProgramInfo } from "../../utils";
import { EdgePath } from "../types";
import { EdgeLabelProgram } from "./base";
import type { EdgeLabelProgramType } from "./base";
import { generateEdgeLabelShaders } from "./generator";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating an edge label program.
 */
export interface CreateEdgeLabelProgramOptions {
  /**
   * The path type for positioning labels along edges.
   * Must match the path used by the corresponding edge program.
   */
  path: EdgePath;
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
// Factory Function
// ============================================================================

/**
 * Creates an edge label program for a specific path type.
 *
 * The resulting program renders text labels along edge paths using SDF
 * (Signed Distance Field) atlas for crisp text at any zoom level.
 *
 * @param options Configuration for the edge label program
 * @returns An EdgeLabelProgram class constructor
 *
 * @example
 * ```typescript
 * const StraightEdgeLabelProgram = createEdgeLabelProgram({
 *   path: pathStraight(),
 * });
 *
 * // Attach to edge program
 * ComposedEdgeLineProgram.LabelProgram = StraightEdgeLabelProgram;
 * ```
 */
export function createEdgeLabelProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: CreateEdgeLabelProgramOptions): EdgeLabelProgramType<N, E, G> {
  const { path } = options;

  // Generate shaders at factory creation time
  const generatedShaders = generateEdgeLabelShaders({ path });

  // Uniform type for TypeScript
  type EdgeLabelUniform =
    | "u_matrix"
    | "u_sizeRatio"
    | "u_correctionRatio"
    | "u_zoomRatio"
    | "u_resolution"
    | "u_atlasSize"
    | "u_atlas"
    | "u_gamma"
    | "u_sdfBuffer"
    | "u_pixelRatio"
    | string;

  // -------------------------------------------------------------------------
  // Return the EdgeLabelProgram class
  // -------------------------------------------------------------------------
  return class GeneratedEdgeLabelProgram extends EdgeLabelProgram<EdgeLabelUniform, N, E, G> {
    /** Static reference to the options used to create this program */
    static readonly programOptions = options;

    /** Static reference to the generated shader code */
    static readonly generatedShaders = generatedShaders;

    // -----------------------------------------------------------------------
    // Instance Properties
    // -----------------------------------------------------------------------

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

    /** Default font key */
    private defaultFontKey: string;

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      super(gl, pickingBuffer, renderer);

      // Initialize SDF atlas manager for glyph generation
      this.atlasManager = new SDFAtlasManager();
      this.gamma = 0.08;
      this.sdfBuffer = DEFAULT_SDF_ATLAS_OPTIONS.cutoff;

      // Create and configure WebGL texture for glyph atlas
      this.atlasTexture = gl.createTexture();
      if (!this.atlasTexture) {
        throw new Error("EdgeLabelProgram: failed to create atlas texture");
      }

      gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, null);

      // Subscribe to atlas updates
      this.atlasManager.on(SDFAtlasManager.ATLAS_UPDATED_EVENT, () => {
        this.atlasNeedsUpdate = true;
      });

      // Register the default font
      const fontConfig = {
        family: this.renderer.getSetting("edgeLabelFont") || this.renderer.getSetting("labelFont"),
        weight: this.renderer.getSetting("edgeLabelWeight") || this.renderer.getSetting("labelWeight"),
        style: "normal",
      };
      this.defaultFontKey = this.atlasManager.registerFont(fontConfig);
    }

    // -----------------------------------------------------------------------
    // Program Definition
    // -----------------------------------------------------------------------

    getDefinition(): InstancedProgramDefinition<EdgeLabelUniform> {
      const { FLOAT, UNSIGNED_BYTE, TRIANGLE_STRIP } = WebGL2RenderingContext;

      return {
        VERTICES: 4, // Quad for each character
        VERTEX_SHADER_SOURCE: generatedShaders.vertexShader,
        FRAGMENT_SHADER_SOURCE: generatedShaders.fragmentShader,
        METHOD: TRIANGLE_STRIP,
        UNIFORMS: generatedShaders.uniforms as EdgeLabelUniform[],
        ATTRIBUTES: [
          // Per-character instance data
          { name: "a_source", size: 2, type: FLOAT },
          { name: "a_target", size: 2, type: FLOAT },
          { name: "a_curvature", size: 1, type: FLOAT },
          { name: "a_charOffset", size: 2, type: FLOAT },
          { name: "a_charSize", size: 2, type: FLOAT },
          { name: "a_texCoords", size: 4, type: FLOAT },
          { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
          { name: "a_fontSize", size: 1, type: FLOAT },
          { name: "a_labelOffset", size: 1, type: FLOAT },
          { name: "a_labelWidth", size: 1, type: FLOAT },
          { name: "a_charIndex", size: 1, type: FLOAT },
          { name: "a_totalChars", size: 1, type: FLOAT },
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

    // -----------------------------------------------------------------------
    // Glyph Preparation
    // -----------------------------------------------------------------------

    /**
     * Pre-computes glyph layout data for a label and caches it.
     */
    private prepareLabelGlyphs(labelKey: string, data: EdgeLabelDisplayData): void {
      if (data.hidden || !data.text) {
        this.labelGlyphCache.delete(labelKey);
        return;
      }

      const text = data.text;
      const fontKey = data.fontKey || this.defaultFontKey;

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

    // -----------------------------------------------------------------------
    // Character Processing
    // -----------------------------------------------------------------------

    /**
     * Processes a single character and writes its vertex data to the buffer.
     */
    protected processCharacter(
      index: number,
      labelData: EdgeLabelDisplayData,
      _char: string,
      charIndex: number,
    ): void {
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

      // Get color
      const color = floatColor(labelData.color);
      let i = startIndex;

      // a_source: Edge source position
      array[i++] = labelData.sourceX;
      array[i++] = labelData.sourceY;

      // a_target: Edge target position
      array[i++] = labelData.targetX;
      array[i++] = labelData.targetY;

      // a_curvature: Path curvature (0 for straight)
      array[i++] = labelData.curvature;

      // a_charOffset: Character position relative to label start (pixels)
      // X: horizontal position along the label (advance-based, no bearing adjustment here)
      // Y: vertical baseline adjustment (bearingY positions the glyph relative to baseline)
      array[i++] = (xOffset + glyph.atlasWidth * 0.5) * scale;
      array[i++] = (glyph.bearingY - glyph.atlasHeight * 0.5) * scale;

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

      // a_fontSize: Font size in pixels
      array[i++] = labelData.size;

      // a_labelOffset: Perpendicular offset from path (pixels)
      array[i++] = labelData.offset;

      // a_labelWidth: Total label width in pixels
      array[i++] = cache.totalWidth * scale;

      // a_charIndex: Index of this character
      array[i++] = charIndex;

      // a_totalChars: Total characters in label
      array[i++] = cache.glyphs.length;
    }

    /**
     * Processes a label by first preparing its glyph cache.
     */
    processEdgeLabel(labelKey: string, offset: number, data: EdgeLabelDisplayData): number {
      this.prepareLabelGlyphs(labelKey, data);
      return super.processEdgeLabel(labelKey, offset, data);
    }

    // -----------------------------------------------------------------------
    // Atlas Texture Management
    // -----------------------------------------------------------------------

    /**
     * Uploads the atlas texture to the GPU if it has changed.
     */
    private updateAtlasTexture(): void {
      if (!this.atlasNeedsUpdate) return;

      const gl = this.normalProgram.gl;
      const textures = this.atlasManager.getTextures();

      if (textures.length === 0) return;

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

    // -----------------------------------------------------------------------
    // Uniform Setting
    // -----------------------------------------------------------------------

    /**
     * Sets all uniforms for the edge label shader.
     */
    setUniforms(params: RenderParams, programInfo: ProgramInfo): void {
      const { gl, uniformLocations } = programInfo;

      // Transform uniforms
      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
      gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      gl.uniform1f(uniformLocations.u_zoomRatio, params.zoomRatio);

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
      gl.uniform1f(uniformLocations.u_pixelRatio, params.pixelRatio);
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Registers a font for use in edge labels.
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
     */
    ensureGlyphsReady(texts: string[], fontKey?: string): void {
      const actualFontKey = fontKey || this.defaultFontKey;

      for (const text of texts) {
        this.atlasManager.ensureGlyphs(text, actualFontKey);
      }

      this.atlasManager.flush();
    }

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------

    kill(): void {
      const gl = this.normalProgram.gl;

      if (this.atlasTexture) {
        gl.deleteTexture(this.atlasTexture);
        this.atlasTexture = null;
      }

      this.atlasManager.destroy();
      this.labelGlyphCache.clear();

      super.kill();
    }
  };
}
