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

import { SDFAtlasManager } from "../../../core/sdf-atlas";
import type Sigma from "../../../sigma";
import type { EdgeLabelDisplayData, RenderParams } from "../../../types";
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
  // TODO: Update this list when shaders are implemented
  type EdgeLabelUniform = "u_matrix" | string;

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

    /** Flag indicating the atlas texture needs to be uploaded to GPU */
    private atlasNeedsUpdate = false;

    /** Default font key */
    private defaultFontKey: string;

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      super(gl, pickingBuffer, renderer);

      // Initialize SDF atlas manager for glyph generation
      this.atlasManager = new SDFAtlasManager();

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
      const { TRIANGLE_STRIP } = WebGL2RenderingContext;

      // TODO: Define proper attributes when shaders are implemented
      // Note: CONSTANT_DATA must have VERTICES items (one per vertex), even if empty
      return {
        VERTICES: 4, // Quad for each character
        VERTEX_SHADER_SOURCE: generatedShaders.vertexShader,
        FRAGMENT_SHADER_SOURCE: generatedShaders.fragmentShader,
        METHOD: TRIANGLE_STRIP,
        UNIFORMS: generatedShaders.uniforms as EdgeLabelUniform[],
        ATTRIBUTES: [],
        CONSTANT_ATTRIBUTES: [],
        CONSTANT_DATA: [[], [], [], []], // 4 empty vertices
      };
    }

    // -----------------------------------------------------------------------
    // Character Processing
    // -----------------------------------------------------------------------

    /**
     * Processes a single character and writes its vertex data to the buffer.
     *
     * TODO: Implement attribute writing when shaders are ready
     */
    protected processCharacter(
      _index: number,
      _labelData: EdgeLabelDisplayData,
      _char: string,
      _charIndex: number,
    ): void {
      // TODO: Implement character processing
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
     *
     * TODO: Set proper uniforms when shaders are implemented
     */
    setUniforms(params: RenderParams, programInfo: ProgramInfo): void {
      const { gl, uniformLocations } = programInfo;

      // Transform uniforms
      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
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

      super.kill();
    }
  };
}
