/**
 * Sigma.js Edge Label Program Factory
 * ====================================
 *
 * Factory function that creates an EdgeLabelProgram class for rendering
 * edge labels along edge paths using WebGL SDF text rendering.
 *
 * ## Architecture
 *
 * Edge labels are rendered character-by-character along the edge path:
 * 1. CPU writes all characters to the GPU buffer (including glyph metrics)
 * 2. GPU computes edge body bounds (accounting for node shapes and extremities)
 * 3. GPU positions each character at the correct arc distance along the path
 * 4. GPU rotates each character to align with the path tangent
 * 5. GPU truncates characters that don't fit within the body
 *
 * @module
 */
import { Attributes } from "graphology-types";

import { DEFAULT_SDF_ATLAS_OPTIONS, GlyphMetrics, SDFAtlasManager } from "../../../core/sdf-atlas";
import type Sigma from "../../../sigma";
import type { EdgeLabelDisplayData, RenderParams } from "../../../types";
import { floatColor } from "../../../utils";
import { getShapeId } from "../../shapes";
import { InstancedProgramDefinition, ProgramInfo } from "../../utils";
import { EdgePath } from "../types";
import { EdgeLabelProgram } from "./base";
import type { EdgeLabelProgramType } from "./base";
import { generateEdgeLabelShaders, GeneratedEdgeLabelShaders } from "./generator";

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

  /**
   * Head extremity length ratio (length / thickness).
   * Default: 0 (no head extremity)
   */
  headLengthRatio?: number;

  /**
   * Tail extremity length ratio (length / thickness).
   * Default: 0 (no tail extremity)
   */
  tailLengthRatio?: number;
}

/**
 * Cached glyph layout data for a single edge label.
 */
interface EdgeLabelGlyphCache {
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
  const { path, headLengthRatio = 0, tailLengthRatio = 0 } = options;

  // Shaders are generated lazily on first instantiation.
  // This ensures all node shapes are registered before edge label shaders are compiled,
  // since generateShapeSelectorGLSL() reads from the shape registry.
  let generated: GeneratedEdgeLabelShaders | null = null;

  // Uniform type for TypeScript
  type EdgeLabelUniform =
    | "u_matrix"
    | "u_sizeRatio"
    | "u_correctionRatio"
    | "u_pixelRatio"
    | "u_resolution"
    | "u_atlasSize"
    | "u_atlas"
    | "u_gamma"
    | "u_sdfBuffer"
    | string;

  // -------------------------------------------------------------------------
  // Return the EdgeLabelProgram class
  // -------------------------------------------------------------------------
  return class GeneratedEdgeLabelProgram extends EdgeLabelProgram<EdgeLabelUniform, N, E, G> {
    /** Static reference to the options used to create this program */
    static readonly programOptions = options;

    /** Static getter for generated shader code (lazy generation) */
    static get generatedShaders() {
      if (!generated) {
        generated = generateEdgeLabelShaders({ path });
      }
      return generated;
    }

    /** Static reference to extremity ratios */
    static readonly headLengthRatio = headLengthRatio;
    static readonly tailLengthRatio = tailLengthRatio;

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
    private labelGlyphCache: Map<string, EdgeLabelGlyphCache> = new Map();

    /** Default font key */
    private defaultFontKey: string;

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      // Generate shaders on first instantiation (after node shapes are registered)
      if (!generated) {
        generated = generateEdgeLabelShaders({ path });
      }

      super(gl, pickingBuffer, renderer);

      // Initialize SDF atlas manager for glyph generation
      this.atlasManager = new SDFAtlasManager();
      // Gamma controls anti-aliasing sharpness: lower = sharper edges
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

      // Build path-specific attributes
      const pathAttributes = path.attributes.map((attr) => ({
        name: attr.name.startsWith("a_") ? attr.name : `a_${attr.name}`,
        size: attr.size,
        type: attr.type,
      }));

      return {
        VERTICES: 4, // Quad for each character
        VERTEX_SHADER_SOURCE: generated!.vertexShader,
        FRAGMENT_SHADER_SOURCE: generated!.fragmentShader,
        METHOD: TRIANGLE_STRIP,
        UNIFORMS: generated!.uniforms as EdgeLabelUniform[],
        ATTRIBUTES: [
          // Packed edge geometry
          { name: "a_sourceTarget", size: 4, type: FLOAT }, // (sourceX, sourceY, targetX, targetY)
          { name: "a_nodeSizes", size: 4, type: FLOAT }, // (sourceSize, targetSize, sourceShapeId, targetShapeId)
          { name: "a_edgeParams", size: 4, type: FLOAT }, // (thickness, headLengthRatio, tailLengthRatio, baseFontSize)

          // Character metrics (packed)
          { name: "a_charMetrics", size: 4, type: FLOAT }, // (charTextOffset, charAdvance, totalTextWidth, unused)
          { name: "a_charDims", size: 4, type: FLOAT }, // (charSize.x, charSize.y, charOffset.x, charOffset.y)

          // Atlas texture coordinates
          { name: "a_texCoords", size: 4, type: FLOAT },

          // Appearance
          { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },

          // Path-specific attributes
          ...pathAttributes,
        ],
        // Quad corners (same for all characters)
        CONSTANT_ATTRIBUTES: [{ name: "a_quadCorner", size: 2, type: FLOAT }],
        CONSTANT_DATA: [
          [0, 0], // Bottom-left
          [1, 0], // Bottom-right
          [0, 1], // Top-left
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
     *
     * ## Attribute Layout (must match getDefinition)
     *
     * Edge geometry:
     * - a_source (2): Source node position
     * - a_target (2): Target node position
     * - a_sourceSize (1): Source node size
     * - a_targetSize (1): Target node size
     * - a_sourceShapeId (1): Source shape ID
     * - a_targetShapeId (1): Target shape ID
     * - a_thickness (1): Edge thickness
     * - a_headLengthRatio (1): Head extremity length ratio
     * - a_tailLengthRatio (1): Tail extremity length ratio
     *
     * Character metrics:
     * - a_charTextOffset (1): Cumulative advance from label start
     * - a_charAdvance (1): This character's advance width
     * - a_totalTextWidth (1): Total label width
     * - a_charSize (2): Character quad dimensions
     * - a_charOffset (2): Offset from origin to quad corner
     *
     * Atlas:
     * - a_texCoords (4): Texture coordinates
     *
     * Appearance:
     * - a_color (1): Packed RGBA color
     * - a_baseFontSize (1): Font size in pixels
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

      // Get node shape IDs from the shape registry
      const sourceShapeId = getShapeId(labelData.sourceShape);
      const targetShapeId = getShapeId(labelData.targetShape);

      // Use actual edge thickness for extremity length calculations
      const thickness = labelData.edgeSize || 1;

      const color = floatColor(labelData.color);
      let i = startIndex;

      // a_sourceTarget: (sourceX, sourceY, targetX, targetY)
      array[i++] = labelData.sourceX;
      array[i++] = labelData.sourceY;
      array[i++] = labelData.targetX;
      array[i++] = labelData.targetY;

      // a_nodeSizes: (sourceSize, targetSize, sourceShapeId, targetShapeId)
      array[i++] = labelData.sourceSize;
      array[i++] = labelData.targetSize;
      array[i++] = sourceShapeId;
      array[i++] = targetShapeId;

      // a_edgeParams: (thickness, headLengthRatio, tailLengthRatio, baseFontSize)
      array[i++] = thickness;
      array[i++] = GeneratedEdgeLabelProgram.headLengthRatio;
      array[i++] = GeneratedEdgeLabelProgram.tailLengthRatio;
      array[i++] = labelData.size;

      // a_charMetrics: (charTextOffset, charAdvance, totalTextWidth, unused)
      array[i++] = xOffset;
      array[i++] = glyph.advance;
      array[i++] = cache.totalWidth;
      array[i++] = 0; // unused

      // a_charDims: (charSize.x, charSize.y, charOffset.x, charOffset.y)
      array[i++] = glyph.atlasWidth; // includes SDF buffer
      array[i++] = glyph.atlasHeight; // includes SDF buffer
      array[i++] = glyph.bearingX;
      array[i++] = -glyph.bearingY; // flip Y for screen coords

      // a_texCoords: (x, y, width, height)
      array[i++] = glyph.atlasX;
      array[i++] = glyph.atlasY;
      array[i++] = glyph.atlasWidth;
      array[i++] = glyph.atlasHeight;

      // a_color: packed RGBA
      array[i++] = color;

      // Path-specific attributes
      // For now we only handle curvature (used by quadratic/cubic paths)
      for (const attr of path.attributes) {
        const attrName = attr.name.startsWith("a_") ? attr.name.slice(2) : attr.name;
        if (attrName === "curvature") {
          array[i++] = labelData.curvature || 0;
        } else {
          // Unknown attribute - write zeros
          for (let j = 0; j < attr.size; j++) {
            array[i++] = 0;
          }
        }
      }
    }

    /**
     * Processes an edge label by first preparing its glyph cache.
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
      const textures = this.atlasManager.getTextures();
      const atlasSize = textures.length > 0 ? [textures[0].width, textures[0].height] : [1, 1];

      // Transform uniforms
      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);

      // Size uniforms
      gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      gl.uniform1f(uniformLocations.u_pixelRatio, params.pixelRatio);
      gl.uniform1f(uniformLocations.u_cameraAngle, params.cameraAngle);
      gl.uniform1f(uniformLocations.u_sdfBufferPixels, DEFAULT_SDF_ATLAS_OPTIONS.buffer);

      // Resolution
      gl.uniform2f(uniformLocations.u_resolution, params.width, params.height);

      // Atlas uniforms
      gl.uniform2f(uniformLocations.u_atlasSize, atlasSize[0], atlasSize[1]);
      gl.uniform1f(uniformLocations.u_gamma, this.gamma);
      gl.uniform1f(uniformLocations.u_sdfBuffer, this.sdfBuffer);

      // Bind atlas texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
      gl.uniform1i(uniformLocations.u_atlas, 0);
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
