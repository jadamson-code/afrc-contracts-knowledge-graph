/**
 * Sigma.js Node Image Program Factory
 * ====================================
 *
 * Factory function for creating node image programs.
 * Uses the node program system with SDF shapes and layers.
 *
 * @module
 */
import { Attributes } from "graphology-types";
import { NodeProgramType, createNodeProgram } from "sigma/rendering";

import { layerImage } from "./layer";
import { DEFAULT_TEXTURE_MANAGER_OPTIONS, TextureManager } from "./texture";
import { CreateNodeImageProgramOptions, DEFAULT_CREATE_NODE_IMAGE_OPTIONS } from "./types";

/**
 * Creates a node program that renders images inside nodes.
 * Uses the node program system with lifecycle-aware layerImage.
 *
 * @param inputOptions - Image program configuration options
 * @returns A NodeProgram class for rendering nodes with images
 *
 * @example
 * ```typescript
 * // Default: circle with image mode
 * const ImageProgram = createNodeImageProgram();
 *
 * // Pictogram mode (colorized icons)
 * const PictogramProgram = createNodeImageProgram({
 *   size: { mode: "force", value: 256 },
 *   drawingMode: "color",
 *   correctCentering: true,
 * });
 *
 * // Use with Sigma
 * const sigma = new Sigma(graph, container, {
 *   nodeProgramClasses: {
 *     image: ImageProgram,
 *   },
 *   labelProgramClasses: {
 *     image: ImageProgram.LabelProgram,
 *   },
 * });
 * ```
 */
export function createNodeImageProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(inputOptions?: Partial<CreateNodeImageProgramOptions>): NodeProgramType<N, E, G> {
  // Compute effective MAX_TEXTURE_SIZE from the current WebGL context
  const gl = document.createElement("canvas").getContext("webgl2") as WebGL2RenderingContext;
  const defaultMaxTextureSize = Math.min(
    gl.getParameter(gl.MAX_TEXTURE_SIZE),
    DEFAULT_TEXTURE_MANAGER_OPTIONS.maxTextureSize,
  );
  (gl.canvas as HTMLCanvasElement).remove();

  const options: CreateNodeImageProgramOptions = {
    ...DEFAULT_CREATE_NODE_IMAGE_OPTIONS,
    maxTextureSize: defaultMaxTextureSize,
    ...(inputOptions || {}),
  };

  const {
    drawingMode,
    padding,
    colorAttribute,
    imageAttribute,
    shapeFactory,
    backgroundLayerFactory,
    ...textureManagerOptions
  } = options;

  /**
   * This texture manager is shared between all instances of this exact class,
   * returned by this call to createNodeImageProgram. This means that
   * remounting the sigma instance will not reload the images and regenerate
   * the texture.
   */
  const textureManager = new TextureManager(textureManagerOptions);

  // Create the node program with image layer
  const BaseProgram = createNodeProgram<N, E, G>({
    shape: shapeFactory(),
    layers: [
      backgroundLayerFactory(),
      layerImage({
        drawingMode,
        padding,
        colorAttribute,
        imageAttribute,
        textureManager,
      }),
    ],
  });

  return BaseProgram;
}
