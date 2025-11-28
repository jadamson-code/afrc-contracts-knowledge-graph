/**
 * Sigma.js Node Programs - Type Definitions
 * ==========================================
 *
 * Types and interfaces for the node program architecture.
 * This system separates shape definition (using Signed Distance Fields)
 * from fragment coloring layers, enabling single-pass rendering of
 * complex node appearances.
 *
 * @module
 */
import { LabelPosition } from "../../types";

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Mat2 = [...Vec2, ...Vec2];
export type Mat3 = [...Vec3, ...Vec3, ...Vec3];
export type Mat4 = [...Vec4, ...Vec4, ...Vec4, ...Vec4];

/**
 * Specification for a shader uniform with type-safe value.
 */
export type UniformSpecification =
  | {
      name: string;
      type: "float" | "int" | "bool";
      value: number;
    }
  | {
      name: string;
      type: "vec2";
      value: Vec2;
    }
  | {
      name: string;
      type: "vec3";
      value: Vec3;
    }
  | {
      name: string;
      type: "vec4";
      value: Vec4;
    }
  | {
      name: string;
      type: "mat3";
      value: Mat3;
    }
  | {
      name: string;
      type: "mat4";
      value: Mat4;
    }
  | {
      name: string;
      type: "sampler2D";
      value?: never;
    };

/**
 * Specification for a vertex attribute.
 */
export interface AttributeSpecification {
  /**
   * Name of the attribute in the shader (e.g., "a_borderSize").
   */
  name: string;

  /**
   * Number of components (e.g., 1 for float, 2 for vec2, 3 for vec3, 4 for vec4).
   */
  size: 1 | 2 | 3 | 4;

  /**
   * WebGL data type (e.g., FLOAT, UNSIGNED_BYTE).
   */
  type: number;

  /**
   * Whether the attribute should be normalized when passed to the shader.
   */
  normalized?: boolean;

  /**
   * Name of the node attribute to read from in NodeDisplayData.
   * If not specified, defaults to the shader attribute name without 'a_' prefix.
   * For example, if source is "borderColor", the value is read from data.borderColor.
   */
  source?: string;

  /**
   * Default value to use when the source attribute is missing from node data.
   * For size=1: a number
   * For size=4 with normalized: a CSS color string (e.g., "#ff0000")
   */
  defaultValue?: number | string;
}

/**
 * Definition of a Signed Distance Field shape.
 * Shapes provide GLSL code that computes the signed distance from a point
 * to the shape's boundary (negative inside, 0 on boundary, positive outside).
 */
export interface SDFShape {
  /**
   * Unique identifier for this shape (e.g., "circle", "square").
   * Used to generate the GLSL function name: sdf_{name}
   */
  name: string;

  /**
   * GLSL function code that computes the signed distance field.
   * Function signature: float sdf_{name}(vec2 uv, ...)
   * where ... represents the shape-specific uniforms as additional parameters.
   *
   * @param uv - Normalized coordinates in [-1, 1] range, (0, 0) at center
   * @returns Signed distance (negative inside, 0 on boundary, positive outside)
   */
  glsl: string;

  /**
   * Additional uniforms required by this shape (e.g., u_cornerRadius, u_rotation).
   * Each uniform's value is already set when the shape is created.
   */
  uniforms: UniformSpecification[];

  /**
   * Ratio of inradius to circumradius for this shape.
   * This indicates how "deep" the shape goes relative to the bounding circle.
   * - Circle: 1.0 (inradius equals circumradius)
   * - Square: 1.0 (inscribed circle touches all sides)
   * - Triangle: 0.5 (inradius is half the circumradius for equilateral)
   * - Diamond: ~0.707 (√2/2 for a square rotated 45°)
   *
   * Used by layers like border to correctly calculate fill sizes.
   * Defaults to 1.0 if not specified.
   */
  inradiusFactor?: number;
}

/**
 * Context provided to a fragment layer's GLSL code via the global `context` struct.
 * This struct is populated by the generator before calling any layer functions.
 *
 * GLSL definition:
 * ```glsl
 * struct LayerContext {
 *   float sdf;             // Signed distance from shape boundary
 *   vec2 uv;               // UV coordinates [-1, 1]
 *   float shapeSize;       // Effective shape radius in UV space
 *   float aaWidth;         // Anti-aliasing width
 *   float pixelSize;       // Node diameter in screen pixels
 *   float correctionRatio; // Scaling factor for consistent rendering
 *   float pixelToUV;       // Conversion: pixels * pixelToUV = UV units
 * };
 * LayerContext context;  // Global instance
 * ```
 */
export interface LayerContext {
  /**
   * The signed distance field value at this fragment.
   * Negative inside the shape, zero at boundary, positive outside.
   */
  sdf: "float";

  /**
   * Normalized UV coordinates in [-1, 1] range, with (0,0) at center.
   */
  uv: "vec2";

  /**
   * The effective shape size in UV space (1.0 - aaWidth).
   * This is the radius where the solid shape ends, before the AA band.
   */
  shapeSize: "float";

  /**
   * The antialiasing width in UV space.
   * Use this for smooth transitions between internal borders/regions.
   */
  aaWidth: "float";

  /**
   * The node diameter in screen pixels.
   * Useful for pixel-mode border calculations.
   */
  pixelSize: "float";

  /**
   * Scaling factor for consistent rendering across zoom levels.
   * Useful for advanced effects that need to compensate for camera zoom.
   */
  correctionRatio: "float";

  /**
   * Conversion factor from screen pixels to UV units.
   * Multiply a pixel value by this to get the equivalent size in UV space.
   * Use this for pixel-mode border sizes or any pixel-based measurements.
   */
  pixelToUV: "float";
}

/**
 * Specification for how to provide a value to a layer.
 * Can be either a constant value or read from a node attribute.
 */
export type ValueSource<T> =
  | T
  | {
      /**
       * Name of the node attribute to read from (e.g., "borderSize").
       */
      attribute: string;
    };

/**
 * Context provided to layer lifecycle hooks.
 * Gives access to WebGL, renderer, and program capabilities.
 */
export interface LayerLifecycleContext {
  /** WebGL2 rendering context */
  gl: WebGL2RenderingContext;

  /** Sigma renderer instance (for refresh(), etc.) */
  renderer: {
    refresh: () => void;
  };

  /** Get uniform location from the current program */
  getUniformLocation: (name: string) => WebGLUniformLocation | null;

  /** Request shader regeneration for this layer */
  requestShaderRegeneration: () => void;

  /** Request a re-render (calls renderer.refresh()) */
  requestRefresh: () => void;
}

/**
 * Lifecycle hooks for layers that need async resources.
 * Returned by the lifecycle factory function.
 */
export interface LayerLifecycleHooks {
  /**
   * Called after the program is initialized and ready.
   * Use for setting up event listeners, initializing resources, etc.
   */
  init?: () => void;

  /**
   * Called before each render.
   * Use for binding textures, updating dynamic uniforms, etc.
   */
  beforeRender?: () => void;

  /**
   * Called when the layer's shader portion needs regeneration.
   * Should return a new FragmentLayer definition with updated GLSL.
   * If not provided, the original layer definition is reused.
   */
  regenerate?: () => FragmentLayer;

  /**
   * Called when the program is destroyed.
   * Use for cleanup: removing listeners, releasing resources, etc.
   */
  kill?: () => void;

  /**
   * Returns data for special attribute sources.
   * Used by layers that need to inject per-node data from external sources
   * (like texture coordinates from an atlas).
   *
   * @param data - The node's display data
   * @param attributeSource - The source name from the attribute specification
   * @returns The value(s) for the attribute, or null to fall back to node data
   */
  getAttributeData?: (data: Record<string, unknown>, attributeSource: string) => number | number[] | null;
}

/**
 * Definition of a fragment layer that can be composed with a shape.
 * Layers output a color that is blended with previous layers by the generator.
 */
export interface FragmentLayer {
  /**
   * Unique identifier for this layer (e.g., "fill", "border").
   */
  name: string;

  /**
   * Additional uniforms required by this layer beyond standard node uniforms.
   */
  uniforms: UniformSpecification[];

  /**
   * Additional per-node attributes required by this layer beyond standard attributes
   * (position, size, color, id, zIndex).
   */
  attributes: AttributeSpecification[];

  /**
   * GLSL function code that applies this layer's effect.
   *
   * Function signature:
   *   vec4 layer_{name}(...layerParams)
   *
   * where layerParams are: attributes (as v_* varyings), then uniforms.
   *
   * Available globals:
   * - context.sdf: Signed distance field value (negative inside, 0 at boundary, positive outside)
   * - context.uv: Normalized coordinates in [-1, 1] range
   * - context.shapeSize: Effective shape radius in UV space (1.0 - context.aaWidth)
   * - context.aaWidth: Antialiasing width in UV space for smooth internal transitions
   * - context.pixelSize: Node diameter in screen pixels (for pixel-mode calculations)
   * - context.correctionRatio: Scaling factor for consistent rendering across zoom levels
   * - context.pixelToUV: Conversion factor from screen pixels to UV units
   * - v_color: Node's base color (standard varying)
   *
   * The function should return a vec4 color for this layer's contribution.
   * Transparent areas (alpha < 1) let previous layers show through.
   * The generator handles blending via "over" compositing.
   */
  glsl: string;

  /**
   * Optional lifecycle factory for layers that need async resources (like textures).
   * Called once per program instance with the lifecycle context.
   * Returns lifecycle hooks for this layer instance.
   *
   * Layers without this property work as before (purely declarative).
   */
  lifecycle?: (context: LayerLifecycleContext) => LayerLifecycleHooks;
}

/**
 * Configuration for a specific layer instance, including its options.
 */
export interface LayerConfig<Options = Record<string, unknown>> {
  /**
   * The layer definition.
   */
  layer: FragmentLayer;

  /**
   * Options/parameters for this layer instance.
   */
  options: Options;
}

/**
 * Font configuration for label rendering.
 */
export interface LabelFontOptions {
  /**
   * Font family name (e.g., "Arial", "sans-serif").
   */
  family?: string;

  /**
   * Font weight (e.g., "normal", "bold", "400", "700").
   */
  weight?: string;

  /**
   * Font style (e.g., "normal", "italic").
   */
  style?: string;

  /**
   * Font size in pixels.
   */
  size?: number;
}

/**
 * Options for configuring labels rendered by the LabelProgram.
 */
export interface LabelOptions {
  /**
   * Default label position relative to node.
   * Default: "right"
   */
  position?: LabelPosition;

  /**
   * Default margin between node edge and label in pixels.
   * Default: 5
   */
  margin?: number;

  /**
   * Font configuration for labels.
   */
  font?: LabelFontOptions;

  /**
   * Default label color (CSS color string).
   * Default: "#000000"
   */
  color?: string;

  /**
   * Label rotation angle in radians.
   * The label text is rotated around its anchor point (closest to the node).
   * Default: 0
   */
  angle?: number;
}

/**
 * Options for creating a node program via createNodeProgram().
 */
export interface NodeProgramOptions {
  /**
   * The SDF shape definition to use for this program.
   * Shape configuration (uniforms) is already set when the shape is created.
   */
  shape: SDFShape;

  /**
   * Array of fragment layers to apply, in order.
   * Layers are applied sequentially, each receiving the output of the previous layer.
   */
  layers: FragmentLayer[];

  /**
   * Label configuration options.
   * The LabelProgram is automatically generated from the shape and these options.
   */
  label?: LabelOptions;

  /**
   * Whether nodes should rotate with the camera.
   * - false (default): Nodes stay upright regardless of camera rotation
   * - true: Nodes rotate along with the camera
   */
  rotateWithCamera?: boolean;
}
