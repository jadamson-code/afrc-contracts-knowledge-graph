/**
 * Sigma.js SDF Hover Label Program
 * =================================
 *
 * WebGL program for rendering hover label backgrounds with node halos.
 *
 * ## What This Program Renders
 *
 * 1. **Rounded rectangle background** - A filled rectangle behind the label text
 * 2. **Node halo** - A ring around the hovered node for visual emphasis
 *
 * The actual text is rendered by SDFTextLabelProgram on top of this background.
 *
 * ## Architecture
 *
 * Unlike SDFTextLabelProgram which uses per-character instancing, this program
 * renders one instance per hover label (since backgrounds are single quads).
 * The fragment shader uses SDF functions to render both the rounded rectangle
 * and the node halo with anti-aliased edges.
 *
 * ## Usage
 *
 * This program is typically used as the `hoverLabelProgram` option in Sigma:
 *
 * ```typescript
 * const sigma = new Sigma(graph, container, {
 *   hoverLabelProgram: SDFHoverLabelProgram,
 * });
 * ```
 *
 * @module
 */
import { Attributes } from "graphology-types";

import type Sigma from "../../sigma";
import type { LabelDisplayData, RenderParams } from "../../types";
import { floatColor } from "../../utils";
import { LabelProgram } from "../label";
import { InstancedProgramDefinition, ProgramInfo } from "../utils";
import VERTEX_SHADER_SOURCE from "./sdf-hover.vert.glsl";
import FRAGMENT_SHADER_SOURCE from "./sdf-hover.frag.glsl";

// ============================================================================
// Types
// ============================================================================

/**
 * Uniforms for the SDF hover label program.
 */
type SDFHoverUniform = "u_matrix" | "u_sizeRatio" | "u_correctionRatio" | "u_cameraAngle" | "u_resolution";

/**
 * Options for SDFHoverLabelProgram.
 */
export interface SDFHoverLabelProgramOptions {
  /**
   * Background color for the label (default: "#ffffff").
   */
  backgroundColor?: string;

  /**
   * Halo color around the node (default: "#ffffff").
   */
  haloColor?: string;

  /**
   * Halo ring width in pixels (default: 4).
   */
  haloSize?: number;

  /**
   * Corner radius for the rounded rectangle background (default: 4).
   */
  cornerRadius?: number;

  /**
   * Padding around the text inside the background (default: 4).
   */
  padding?: number;
}

/**
 * Default hover label program options.
 */
export const DEFAULT_SDF_HOVER_OPTIONS: Required<SDFHoverLabelProgramOptions> = {
  backgroundColor: "#ffffff",
  haloColor: "#ffffff",
  haloSize: 4,
  cornerRadius: 4,
  padding: 4,
};

/**
 * Extended label data for hover labels that includes text measurements.
 *
 * Hover labels need to know the text dimensions to size the background
 * rectangle appropriately.
 */
export interface HoverLabelData extends LabelDisplayData {
  /**
   * Measured text width in pixels.
   */
  textWidth: number;

  /**
   * Measured text height in pixels.
   */
  textHeight: number;
}

// ============================================================================
// Program Class
// ============================================================================

/**
 * SDF Hover Label Program.
 *
 * Renders hover label backgrounds (rounded rectangles) and node halos using
 * SDF for smooth anti-aliased rendering. This program is designed to work
 * in conjunction with SDFTextLabelProgram, which renders the actual text
 * on top of the background.
 */
export class SDFHoverLabelProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends LabelProgram<SDFHoverUniform, N, E, G> {
  // --------------------------------------------------------------------------
  // Instance Properties
  // --------------------------------------------------------------------------

  /** Resolved options with defaults applied */
  private options: Required<SDFHoverLabelProgramOptions>;

  /** Pre-packed background color for GPU upload */
  private packedBackgroundColor: number;

  /** Pre-packed halo color for GPU upload */
  private packedHaloColor: number;

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  constructor(
    gl: WebGL2RenderingContext,
    pickingBuffer: WebGLFramebuffer | null,
    renderer: Sigma<N, E, G>,
    options: SDFHoverLabelProgramOptions = {},
  ) {
    super(gl, pickingBuffer, renderer);

    // Merge provided options with defaults
    this.options = { ...DEFAULT_SDF_HOVER_OPTIONS, ...options };

    // Pre-pack colors for efficient GPU upload
    this.packedBackgroundColor = floatColor(this.options.backgroundColor);
    this.packedHaloColor = floatColor(this.options.haloColor);
  }

  // --------------------------------------------------------------------------
  // Program Definition
  // --------------------------------------------------------------------------

  getDefinition(): InstancedProgramDefinition<SDFHoverUniform> {
    const { FLOAT, UNSIGNED_BYTE, TRIANGLE_STRIP } = WebGL2RenderingContext;

    return {
      VERTICES: 4,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      METHOD: TRIANGLE_STRIP,
      UNIFORMS: ["u_matrix", "u_sizeRatio", "u_correctionRatio", "u_cameraAngle", "u_resolution"] as const,
      ATTRIBUTES: [
        // Node position and size
        { name: "a_nodePosition", size: 2, type: FLOAT },
        { name: "a_nodeSize", size: 1, type: FLOAT },
        // Label bounding box (x, y, width, height) relative to node center
        { name: "a_labelBounds", size: 4, type: FLOAT },
        // Colors (packed as normalized bytes)
        { name: "a_backgroundColor", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_haloColor", size: 4, type: UNSIGNED_BYTE, normalized: true },
        // Styling parameters
        { name: "a_haloSize", size: 1, type: FLOAT },
        { name: "a_cornerRadius", size: 1, type: FLOAT },
        { name: "a_padding", size: 1, type: FLOAT },
      ],
      CONSTANT_ATTRIBUTES: [{ name: "a_quadCorner", size: 2, type: FLOAT }],
      CONSTANT_DATA: [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ],
    };
  }

  // --------------------------------------------------------------------------
  // Label Processing
  // --------------------------------------------------------------------------

  /**
   * Process a hover label.
   *
   * Unlike regular text labels which create one instance per character,
   * hover labels create a single instance for the entire background/halo
   * rendering.
   */
  processLabel(labelKey: string, offset: number, data: LabelDisplayData): number {
    if (data.hidden || !data.text) {
      this.labelCharacterOffsets.delete(labelKey);
      return 0;
    }

    // Hover labels are single instances (not per-character)
    this.labelCharacterOffsets.set(labelKey, { start: offset, count: 1 });

    // Write instance data to the array
    this.processHoverInstance(offset, data as HoverLabelData);

    return 1;
  }

  /**
   * Write a single hover label instance to the data array.
   *
   * Calculates the label bounds based on position mode and writes all
   * instance attributes to the GPU buffer.
   */
  private processHoverInstance(index: number, data: HoverLabelData): void {
    const array = this.array;
    const stride = this.STRIDE;
    const startIndex = index * stride;

    // Calculate text dimensions (estimate if not provided)
    const textWidth = data.textWidth || data.size * data.text.length * 0.6;
    const textHeight = data.textHeight || data.size;

    // Calculate label bounds relative to node center based on position mode.
    // This assumes circular nodes (inradiusFactor = 1.0) for hover labels.
    const labelBounds = this.calculateLabelBounds(data.position, data.nodeSize, data.margin, textWidth, textHeight);

    // Write instance data to array
    let i = startIndex;

    // a_nodePosition (vec2): Node center in graph space
    array[i++] = data.x;
    array[i++] = data.y;

    // a_nodeSize (float): Node size for halo calculation
    array[i++] = data.nodeSize;

    // a_labelBounds (vec4): Bounding box (x, y, width, height)
    array[i++] = labelBounds.x;
    array[i++] = labelBounds.y;
    array[i++] = labelBounds.width;
    array[i++] = labelBounds.height;

    // a_backgroundColor (packed float)
    array[i++] = this.packedBackgroundColor;

    // a_haloColor (packed float)
    array[i++] = this.packedHaloColor;

    // a_haloSize (float)
    array[i++] = this.options.haloSize;

    // a_cornerRadius (float)
    array[i++] = this.options.cornerRadius;

    // a_padding (float)
    array[i++] = this.options.padding;
  }

  /**
   * Calculate label bounding box based on position mode.
   *
   * Returns the (x, y) offset from node center to the label's top-left corner,
   * along with the label dimensions.
   */
  private calculateLabelBounds(
    position: LabelDisplayData["position"],
    nodeSize: number,
    margin: number,
    textWidth: number,
    textHeight: number,
  ): { x: number; y: number; width: number; height: number } {
    // Assume circular node shape (nodeSize = diameter, radius = nodeSize)
    const nodeRadius = nodeSize;
    let x = 0;
    let y = 0;

    switch (position) {
      case "right":
        x = nodeRadius + margin;
        y = -textHeight / 2;
        break;
      case "left":
        x = -(nodeRadius + margin + textWidth);
        y = -textHeight / 2;
        break;
      case "above":
        x = -textWidth / 2;
        y = nodeRadius + margin;
        break;
      case "below":
        x = -textWidth / 2;
        y = -(nodeRadius + margin + textHeight);
        break;
      case "over":
        x = -textWidth / 2;
        y = -textHeight / 2;
        break;
    }

    return { x, y, width: textWidth, height: textHeight };
  }

  /**
   * Not used for hover labels.
   *
   * Hover labels don't process individual characters - they render a single
   * background quad per label.
   */
  protected processCharacter(): void {
    // No-op: hover labels don't process individual characters
  }

  // --------------------------------------------------------------------------
  // Uniform Setting
  // --------------------------------------------------------------------------

  setUniforms(params: RenderParams, programInfo: ProgramInfo): void {
    const { gl, uniformLocations } = programInfo;

    gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
    gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
    gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
    gl.uniform1f(uniformLocations.u_cameraAngle, params.cameraAngle);
    gl.uniform2f(uniformLocations.u_resolution, params.width * params.pixelRatio, params.height * params.pixelRatio);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Update program options at runtime.
   *
   * Allows changing colors and styling without recreating the program.
   * Note: Changes take effect on the next render cycle.
   */
  setOptions(options: Partial<SDFHoverLabelProgramOptions>): void {
    if (options.backgroundColor !== undefined) {
      this.options.backgroundColor = options.backgroundColor;
      this.packedBackgroundColor = floatColor(options.backgroundColor);
    }
    if (options.haloColor !== undefined) {
      this.options.haloColor = options.haloColor;
      this.packedHaloColor = floatColor(options.haloColor);
    }
    if (options.haloSize !== undefined) {
      this.options.haloSize = options.haloSize;
    }
    if (options.cornerRadius !== undefined) {
      this.options.cornerRadius = options.cornerRadius;
    }
    if (options.padding !== undefined) {
      this.options.padding = options.padding;
    }
  }
}

export default SDFHoverLabelProgram;
