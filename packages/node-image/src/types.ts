/**
 * Sigma.js Node Image Types
 * =========================
 *
 * Type definitions for the node image layer and program.
 *
 * @module
 */
import { FragmentLayer, SDFShape, layerFill, sdfCircle } from "sigma/rendering";
import { enumProp, FactoryOptionsFromSchema, ResolvedOptionsFromSchema, numberProp, stringProp } from "sigma/primitives";

import { DEFAULT_TEXTURE_MANAGER_OPTIONS, TextureManager, TextureManagerOptions } from "./texture";

/**
 * Drawing mode for images.
 * - "image": Image is rendered as-is (transparent pixels show through)
 * - "color": Image pixels are colorized with the node color (for pictograms)
 */
export type DrawingMode = "image" | "color";

/**
 * Schema for the image layer.
 *
 * Properties:
 * - name: Unique name for this layer instance
 * - drawingMode: How to render the image ("image" or "color")
 * - padding: Padding around the image (0-1 percentage)
 * - colorAttribute: Attribute to read color from (for "color" mode)
 * - imageAttribute: Attribute to read image URL from
 */
export const imageSchema = {
  name: stringProp("image"),
  drawingMode: enumProp(["image", "color"] as const, "image"),
  padding: numberProp(0),
  colorAttribute: stringProp("color"),
  imageAttribute: stringProp("image"),
} as const;

/**
 * Schema-derived options for the layerImage() function (input).
 * All schema properties are optional.
 */
type SchemaOptions = FactoryOptionsFromSchema<typeof imageSchema>;

/**
 * Resolved schema options after defaults are applied.
 * All schema properties are required.
 */
export type ResolvedSchemaOptions = ResolvedOptionsFromSchema<typeof imageSchema>;

/**
 * Options for the layerImage() function.
 * Extends schema options with programmatic-only options.
 */
export interface LayerImageOptions extends SchemaOptions {
  /**
   * Optional TextureManager instance to use.
   * If not provided, a new one will be created internally.
   * Pass an existing TextureManager to share textures across multiple layer instances.
   */
  textureManager?: TextureManager;

  /**
   * Options for creating the internal TextureManager.
   * Only used if textureManager is not provided.
   */
  textureManagerOptions?: Partial<TextureManagerOptions>;
}

/**
 * Options for the createNodeImageProgram() function.
 * Maintains backward compatibility with the original API.
 */
export interface CreateNodeImageProgramOptions extends TextureManagerOptions {
  /**
   * Drawing mode:
   * - "image": Image is rendered as-is (transparent pixels show through)
   * - "color": Image pixels are colorized with the node color (for pictograms)
   * @default "image"
   */
  drawingMode: DrawingMode;

  /**
   * A function that generates an SDF shape
   * @default sdfCircle
   */
  shapeFactory: () => SDFShape;

  /**
   * A function that generates the layer to put "behind" the image layer:
   * @default layerFill
   */
  backgroundLayerFactory: () => FragmentLayer;

  /**
   * Padding around the image, expressed as a [0, 1] percentage.
   * A padding of 0.05 will always be 5% of the diameter of the node.
   * @default 0
   */
  padding: number;

  /**
   * Name of the node attribute to read the color from.
   * Used in "color" drawing mode to colorize image pixels.
   * @default "color"
   */
  colorAttribute: string;

  /**
   * Name of the node attribute to read the image URL from.
   * @default "image"
   */
  imageAttribute: string;
}

/**
 * Default layer options.
 */
export const DEFAULT_LAYER_IMAGE_OPTIONS: LayerImageOptions = {
  name: "image",
  drawingMode: "image",
  padding: 0,
  colorAttribute: "color",
  imageAttribute: "image",
};

/**
 * Default options for createNodeImageProgram.
 */
export const DEFAULT_CREATE_NODE_IMAGE_OPTIONS: CreateNodeImageProgramOptions = {
  ...DEFAULT_TEXTURE_MANAGER_OPTIONS,
  drawingMode: "image",
  shapeFactory: sdfCircle,
  backgroundLayerFactory: layerFill,
  padding: 0,
  colorAttribute: "color",
  imageAttribute: "image",
};
