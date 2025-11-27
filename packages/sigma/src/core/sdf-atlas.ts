/**
 * Sigma.js SDF Atlas Manager
 * ===========================
 *
 * Manages SDF (Signed Distance Field) glyph generation and atlas packing
 * for WebGL text rendering. Supports multiple fonts in the same atlas.
 *
 * @module
 */
import TinySDF from "@mapbox/tiny-sdf";
import { EventEmitter } from "events";

/**
 * Metrics for a single glyph in the atlas.
 */
export interface GlyphMetrics {
  /** Character code (Unicode code point) */
  charCode: number;
  /** Glyph width in pixels (at base font size) */
  width: number;
  /** Glyph height in pixels (at base font size) */
  height: number;
  /** Horizontal bearing (offset from origin to left edge) */
  bearingX: number;
  /** Vertical bearing (offset from baseline to top edge) */
  bearingY: number;
  /** Horizontal advance (distance to next character origin) */
  advance: number;
  /** X position in atlas texture (pixels) */
  atlasX: number;
  /** Y position in atlas texture (pixels) */
  atlasY: number;
  /** Width in atlas texture (pixels, includes SDF buffer) */
  atlasWidth: number;
  /** Height in atlas texture (pixels, includes SDF buffer) */
  atlasHeight: number;
  /** Index of the atlas texture (for multiple texture support) */
  atlasIndex: number;
}

/**
 * Font identifier string, e.g., "Arial-normal-normal" or "Roboto-bold-italic"
 */
export type FontKey = string;

/**
 * Describes a font for SDF generation.
 */
export interface FontDescriptor {
  /** Font family name, e.g., "Arial", "Roboto" */
  family: string;
  /** Font weight, e.g., "normal", "bold", "600" */
  weight: string;
  /** Font style, e.g., "normal", "italic" */
  style: string;
}

/**
 * Options for the SDF atlas manager.
 */
export interface SDFAtlasOptions {
  /** Base font size for SDF generation (default: 24) */
  fontSize: number;
  /** SDF buffer size in pixels (default: 3) */
  buffer: number;
  /** Radius for SDF calculation (default: 8) */
  radius: number;
  /** Cutoff for SDF values (default: 0.25) */
  cutoff: number;
  /** Maximum texture size in pixels (default: 2048) */
  maxTextureSize: number;
  /** Debounce timeout for texture generation in ms (default: 100) */
  debounceTimeout: number | null;
}

/**
 * Default options for SDFAtlasManager.
 */
export const DEFAULT_SDF_ATLAS_OPTIONS: SDFAtlasOptions = {
  fontSize: 24,
  buffer: 3,
  radius: 8,
  cutoff: 0.25,
  maxTextureSize: 2048,
  debounceTimeout: 100,
};

/**
 * Margin between glyphs in the atlas to prevent texture filtering bleeding.
 * Must be at least 2 to avoid LINEAR filtering sampling from adjacent glyphs.
 */
const GLYPH_MARGIN = 2;

/**
 * Internal state for a registered font.
 */
interface FontState {
  descriptor: FontDescriptor;
  tinySDF: TinySDF;
  glyphs: Map<number, GlyphMetrics>;
}

/**
 * Cursor for tracking position when packing glyphs into atlas.
 */
interface AtlasCursor {
  x: number;
  y: number;
  rowHeight: number;
  atlasIndex: number;
}

/**
 * Manages SDF glyph generation and atlas packing for WebGL text rendering.
 *
 * Features:
 * - Multi-font support: Register multiple fonts, all packed into shared atlas(es)
 * - On-demand glyph generation: Glyphs are generated as needed
 * - Debounced texture updates: Batch glyph additions for performance
 * - Event-based updates: Emits events when atlas changes
 *
 * @example
 * ```typescript
 * const atlas = new SDFAtlasManager();
 * const fontKey = atlas.registerFont({ family: "Arial", weight: "normal", style: "normal" });
 * atlas.ensureGlyphs("Hello World", fontKey);
 * const textures = atlas.getTextures();
 * ```
 */
export class SDFAtlasManager extends EventEmitter {
  /** Event emitted when atlas textures are updated */
  static ATLAS_UPDATED_EVENT = "atlasUpdated";

  private options: SDFAtlasOptions;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private measureCanvas: HTMLCanvasElement;
  private measureCtx: CanvasRenderingContext2D;

  private fonts: Map<FontKey, FontState> = new Map();
  private textures: ImageData[] = [];
  private cursor: AtlasCursor = { x: 0, y: 0, rowHeight: 0, atlasIndex: 0 };
  private pendingGlyphs: Array<{ fontKey: FontKey; charCode: number }> = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Reserved for future use (incremental update tracking)
  // private dirty = false;

  constructor(options: Partial<SDFAtlasOptions> = {}) {
    super();
    this.options = { ...DEFAULT_SDF_ATLAS_OPTIONS, ...options };

    // Create canvas for atlas texture generation
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.options.maxTextureSize;
    this.canvas.height = this.options.maxTextureSize;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

    // Create canvas for text measurement
    this.measureCanvas = document.createElement("canvas");
    this.measureCtx = this.measureCanvas.getContext("2d") as CanvasRenderingContext2D;

    // Initialize with empty first texture
    this.textures.push(this.ctx.getImageData(0, 0, 1, 1));
  }

  /**
   * Creates a unique font key from a font descriptor.
   */
  getFontKey(font: FontDescriptor): FontKey {
    return `${font.family}-${font.weight}-${font.style}`;
  }

  /**
   * Registers a font for SDF generation.
   *
   * @param font - Font descriptor
   * @returns Font key for referencing this font
   */
  registerFont(font: FontDescriptor): FontKey {
    const key = this.getFontKey(font);

    if (this.fonts.has(key)) {
      return key;
    }

    const tinySDF = new TinySDF({
      fontSize: this.options.fontSize,
      fontFamily: font.family,
      fontWeight: font.weight,
      fontStyle: font.style,
      buffer: this.options.buffer,
      radius: this.options.radius,
      cutoff: this.options.cutoff,
    });

    this.fonts.set(key, {
      descriptor: font,
      tinySDF,
      glyphs: new Map(),
    });

    return key;
  }

  /**
   * Ensures all characters in a string have glyphs in the atlas.
   *
   * @param text - Text to ensure glyphs for
   * @param fontKey - Font to use (must be registered first)
   */
  ensureGlyphs(text: string, fontKey: FontKey): void {
    const fontState = this.fonts.get(fontKey);
    if (!fontState) {
      throw new Error(`Font "${fontKey}" is not registered. Call registerFont() first.`);
    }

    let hasNewGlyphs = false;
    let newGlyphCount = 0;

    for (const char of text) {
      const charCode = char.codePointAt(0);
      if (charCode === undefined) continue;

      if (!fontState.glyphs.has(charCode)) {
        this.pendingGlyphs.push({ fontKey, charCode });
        hasNewGlyphs = true;
        newGlyphCount++;
      }
    }

    if (hasNewGlyphs) {
      this.scheduleTextureGeneration();
    }
  }

  /**
   * Measures the width of a text string.
   *
   * @param text - Text to measure
   * @param fontKey - Font to use
   * @returns Width in pixels at base font size
   */
  measureText(text: string, fontKey: FontKey): number {
    const fontState = this.fonts.get(fontKey);
    if (!fontState) {
      throw new Error(`Font "${fontKey}" is not registered.`);
    }

    // Use canvas measureText for accurate measurement
    const { family, weight, style } = fontState.descriptor;
    this.measureCtx.font = `${style} ${weight} ${this.options.fontSize}px ${family}`;

    return this.measureCtx.measureText(text).width;
  }

  /**
   * Gets glyph metrics for a character.
   *
   * @param charCode - Unicode code point
   * @param fontKey - Font key
   * @returns Glyph metrics or undefined if not in atlas
   */
  getGlyph(charCode: number, fontKey: FontKey): GlyphMetrics | undefined {
    const fontState = this.fonts.get(fontKey);
    if (!fontState) return undefined;
    return fontState.glyphs.get(charCode);
  }

  /**
   * Gets all atlas textures.
   *
   * @returns Array of ImageData for each atlas texture
   */
  getTextures(): ImageData[] {
    return this.textures;
  }

  /**
   * Gets the number of registered fonts.
   */
  getFontCount(): number {
    return this.fonts.size;
  }

  /**
   * Gets the total number of glyphs in the atlas.
   */
  getGlyphCount(): number {
    let count = 0;
    for (const fontState of this.fonts.values()) {
      count += fontState.glyphs.size;
    }
    return count;
  }

  /**
   * Checks if there are pending glyphs to be rendered.
   */
  hasPendingGlyphs(): boolean {
    return this.pendingGlyphs.length > 0;
  }

  /**
   * Forces immediate texture generation (bypasses debounce).
   */
  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.generateTextures();
  }

  /**
   * Destroys the atlas manager and releases resources.
   */
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.fonts.clear();
    this.textures = [];
    this.pendingGlyphs = [];
    this.removeAllListeners();
  }

  /**
   * Schedules texture generation with debouncing.
   */
  private scheduleTextureGeneration(): void {
    if (this.debounceTimer !== null) return;

    if (this.options.debounceTimeout === null) {
      this.generateTextures();
    } else {
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.generateTextures();
      }, this.options.debounceTimeout);
    }
  }

  /**
   * Generates textures for all pending glyphs.
   */
  private generateTextures(): void {
    if (this.pendingGlyphs.length === 0) return;

    const { maxTextureSize } = this.options;

    // Process each pending glyph
    for (const { fontKey, charCode } of this.pendingGlyphs) {
      const fontState = this.fonts.get(fontKey);
      if (!fontState || fontState.glyphs.has(charCode)) continue;

      // Generate SDF for this glyph
      const char = String.fromCodePoint(charCode);
      const glyph = fontState.tinySDF.draw(char);

      const glyphWidth = glyph.width;
      const glyphHeight = glyph.height;

      // Check if glyph fits in current row
      if (this.cursor.x + glyphWidth + GLYPH_MARGIN > maxTextureSize) {
        // Move to next row
        this.cursor.x = 0;
        this.cursor.y += this.cursor.rowHeight + GLYPH_MARGIN;
        this.cursor.rowHeight = 0;
      }

      // Check if we need a new texture
      if (this.cursor.y + glyphHeight + GLYPH_MARGIN > maxTextureSize) {
        // Finalize current texture and start new one
        this.finalizeCurrentTexture();
        this.cursor = { x: 0, y: 0, rowHeight: 0, atlasIndex: this.cursor.atlasIndex + 1 };
        this.ctx.clearRect(0, 0, maxTextureSize, maxTextureSize);
      }

      // Draw glyph to canvas
      // tiny-sdf returns single-channel (grayscale) data, we need to convert to RGBA
      const sdfData = glyph.data;
      const rgbaData = new Uint8ClampedArray(glyphWidth * glyphHeight * 4);
      for (let i = 0; i < sdfData.length; i++) {
        const sdfValue = sdfData[i];
        const rgbaIndex = i * 4;
        // Store SDF value in all channels (R, G, B, A)
        // The alpha channel contains the SDF value for the shader
        rgbaData[rgbaIndex] = 255; // R
        rgbaData[rgbaIndex + 1] = 255; // G
        rgbaData[rgbaIndex + 2] = 255; // B
        rgbaData[rgbaIndex + 3] = sdfValue; // A = SDF value
      }
      const imageData = new ImageData(rgbaData, glyphWidth, glyphHeight);
      this.ctx.putImageData(imageData, this.cursor.x, this.cursor.y);

      // Store glyph metrics
      const metrics: GlyphMetrics = {
        charCode,
        width: glyph.glyphWidth,
        height: glyph.glyphHeight,
        bearingX: glyph.glyphLeft,
        bearingY: glyph.glyphTop,
        advance: glyph.glyphAdvance,
        atlasX: this.cursor.x,
        atlasY: this.cursor.y,
        atlasWidth: glyphWidth,
        atlasHeight: glyphHeight,
        atlasIndex: this.cursor.atlasIndex,
      };

      fontState.glyphs.set(charCode, metrics);

      // Update cursor
      this.cursor.x += glyphWidth + GLYPH_MARGIN;
      this.cursor.rowHeight = Math.max(this.cursor.rowHeight, glyphHeight);
    }

    // Update current texture
    this.finalizeCurrentTexture();

    // Clear pending glyphs
    this.pendingGlyphs = [];
    // this.dirty = true;

    // Emit update event
    this.emit(SDFAtlasManager.ATLAS_UPDATED_EVENT, {
      textures: this.textures,
      glyphCount: this.getGlyphCount(),
    });
  }

  /**
   * Finalizes the current texture by capturing it as ImageData.
   */
  private finalizeCurrentTexture(): void {
    const { maxTextureSize } = this.options;

    // Calculate effective dimensions (crop to used area)
    const effectiveWidth = Math.min(
      maxTextureSize,
      Math.max(this.cursor.x, this.cursor.rowHeight > 0 ? maxTextureSize : 1),
    );
    const effectiveHeight = Math.min(maxTextureSize, this.cursor.y + this.cursor.rowHeight + GLYPH_MARGIN);

    // Capture texture data
    // The SDF values are already in the alpha channel from generateTextures()
    const textureData = this.ctx.getImageData(0, 0, effectiveWidth, effectiveHeight);

    // Store or update texture
    if (this.cursor.atlasIndex >= this.textures.length) {
      this.textures.push(textureData);
    } else {
      this.textures[this.cursor.atlasIndex] = textureData;
    }
  }
}
