/**
 * Sigma.js Node Image Types
 * =========================
 *
 * Type definitions for the node image layer and program.
 *
 * @module
 */
import { Attributes } from "graphology-types";
import {
  FragmentLayer,
  NodeHoverDrawingFunction,
  NodeLabelDrawingFunction,
  SDFShape,
  layerFill,
  sdfCircle,
} from "sigma/rendering";

import { DEFAULT_TEXTURE_MANAGER_OPTIONS, TextureManagerOptions } from "./texture";

/**
 * Drawing mode for images.
 * - "image": Image is rendered as-is (transparent pixels show through)
 * - "color": Image pixels are colorized with the node color (for pictograms)
 */
export type DrawingMode = "image" | "color";

/**
 * Options for the layerImage() function.
 */
export interface LayerImageOptions {
  /**
   * Drawing mode:
   * - "image": Image is rendered as-is (transparent pixels show through)
   * - "color": Image pixels are colorized with the node color (for pictograms)
   * @default "image"
   */
  drawingMode: DrawingMode;

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

  /**
   * Optional TextureManager instance to use.
   * If not provided, a new one will be created internally.
   * Pass an existing TextureManager to share textures across multiple layer instances.
   */
  textureManager?: import("./texture").TextureManager;

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
export interface CreateNodeImageProgramOptions<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends TextureManagerOptions {
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
   * Custom label drawing function.
   */
  drawLabel: NodeLabelDrawingFunction<N, E, G> | undefined;

  /**
   * Custom hover drawing function.
   */
  drawHover: NodeHoverDrawingFunction<N, E, G> | undefined;

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
  drawingMode: "image",
  padding: 0,
  colorAttribute: "color",
  imageAttribute: "image",
};

/**
 * Default options for createNodeImageProgram.
 */
export const DEFAULT_CREATE_NODE_IMAGE_OPTIONS: CreateNodeImageProgramOptions<Attributes, Attributes, Attributes> = {
  ...DEFAULT_TEXTURE_MANAGER_OPTIONS,
  drawingMode: "image",
  shapeFactory: sdfCircle,
  backgroundLayerFactory: layerFill,
  drawLabel: undefined,
  drawHover: undefined,
  padding: 0,
  colorAttribute: "color",
  imageAttribute: "image",
};
