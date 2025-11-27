/**
 * Sigma.js Node Image Layer
 * =========================
 *
 * Fragment layer for rendering images inside nodes.
 * Works with any SDF shape from the composable node program system.
 *
 * Now supports lifecycle management for automatic texture handling when used
 * with createComposedNodeProgram().
 *
 * @module
 */
import {
  AttributeSpecification,
  FragmentLayer,
  LayerLifecycleContext,
  LayerLifecycleHooks,
  UniformSpecification,
  numberToGLSLFloat,
} from "sigma/rendering";

import { Atlas, DEFAULT_TEXTURE_MANAGER_OPTIONS, TextureManager } from "./texture";
import { DEFAULT_LAYER_IMAGE_OPTIONS, LayerImageOptions } from "./types";

/**
 * Generates the GLSL code for the image layer function.
 * Uses the global `context` struct for context (sdf, uv, etc.).
 *
 * Note: The u_atlas uniform is declared directly in the GLSL code because
 * the shader generator doesn't support sampler2D array uniforms properly.
 */
function generateImageGLSL(
  options: Omit<LayerImageOptions, "textureManager" | "textureManagerOptions">,
  texturesCount: number,
): string {
  const { drawingMode, padding } = options;
  const paddingRatio = numberToGLSLFloat(1.0 + 2.0 * padding);
  const effectiveTexturesCount = Math.max(1, texturesCount);

  // Generate texture sampling code
  const textureSampling = [...new Array(effectiveTexturesCount)].map(
    (_, i) =>
      `if (index == ${i}) texel = texture(u_atlas_image[${i}], (v_texture.xy + coordinateInTexture * v_texture.zw), -1.0);`,
  ).join(`
    else `);

  const fallbackSampling = `else {
      texel = texture(u_atlas_image[0], (v_texture.xy + coordinateInTexture * v_texture.zw), -1.0);
      noTextureFound = true;
    }`;

  // language=GLSL
  const glsl = /*glsl*/ `
// Texture atlas uniform - declared here because generator doesn't support sampler2D arrays
uniform sampler2D u_atlas_image[${effectiveTexturesCount}];

vec4 layer_image(vec4 v_texture, float v_textureIndex) {
  const float bias = 255.0 / 254.0;
  const float paddingRatio = ${paddingRatio};

  vec4 color = vec4(0.0);

  // Calculate coordinate within the texture
  // The UV is in [-1, 1] range, convert to [0, 1] for texture sampling
  // Note: Camera rotation is handled at the program level (vertex shader)
  vec2 coordinateInTexture = context.uv * vec2(paddingRatio, -paddingRatio) * 0.5 + vec2(0.5, 0.5);
  int index = int(v_textureIndex + 0.5); // +0.5 to avoid rounding errors

  bool noTextureFound = false;
  vec4 texel = vec4(0.0);

  // No image to display - return transparent
  if (v_texture.w <= 0.0) {
    // Return transparent when no image
  }
  // Image loaded into the texture
  else {
    ${textureSampling}
    ${fallbackSampling}

    if (!noTextureFound) {
      ${
        drawingMode === "color"
          ? `// Colorize all visible image pixels with node color
      color = mix(vec4(0.0), v_color, texel.a);`
          : `// Image mode: render image pixels as-is
      color = texel;`
      }

      // Erase pixels "in the padding"
      // context.uv is in [-1, 1], so we check against 1.0 / paddingRatio
      float maxUV = 1.0 / paddingRatio;
      if (abs(context.uv.x) > maxUV || abs(context.uv.y) > maxUV) {
        color = vec4(0.0);
      }
    }
  }

  color.a *= bias;
  return color;
}
`;

  return glsl;
}

/**
 * Creates the static layer definition (uniforms, attributes, glsl).
 */
function createLayerDefinition(
  options: Omit<LayerImageOptions, "textureManager" | "textureManagerOptions">,
  texturesCount: number,
): Omit<FragmentLayer, "lifecycle"> {
  const { FLOAT } = WebGL2RenderingContext;

  // Ensure minimum of 1 texture
  const effectiveTexturesCount = Math.max(1, texturesCount);

  // Uniforms for the image layer
  // Note: We don't declare u_atlas here as it requires special handling
  // (array syntax that the generator doesn't support). The lifecycle
  // handles this uniform manually.
  const uniforms: UniformSpecification[] = [];

  // Attributes for the image layer
  const attributes: AttributeSpecification[] = [
    // Texture coordinates in atlas (x, y, width, height)
    {
      name: "texture",
      size: 4 as const,
      type: FLOAT,
      source: "__texture__", // Special marker - handled by lifecycle
    },
    // Texture atlas index
    {
      name: "textureIndex",
      size: 1 as const,
      type: FLOAT,
      source: "__textureIndex__", // Special marker - handled by lifecycle
    },
  ];

  return {
    name: "image",
    uniforms,
    attributes,
    glsl: generateImageGLSL(options, effectiveTexturesCount),
  };
}

/**
 * Creates an image layer that renders images inside nodes.
 *
 * This layer now includes lifecycle management for automatic texture handling.
 * When used with createComposedNodeProgram(), the layer will:
 * - Create/use a TextureManager to load and manage images
 * - Automatically bind textures before rendering
 * - Regenerate shaders when texture count changes
 * - Trigger re-renders when images finish loading
 *
 * @param inputOptions - Image layer configuration options
 * @returns FragmentLayer definition with lifecycle
 *
 * @example
 * ```typescript
 * // Simple usage - TextureManager created automatically
 * const Program = createComposedNodeProgram({
 *   shape: sdfCircle(),
 *   layers: [layerImage({ drawingMode: "image", padding: 0.1 })],
 * });
 *
 * // Shared TextureManager across multiple programs
 * const sharedTM = new TextureManager();
 * const Program1 = createComposedNodeProgram({
 *   shape: sdfCircle(),
 *   layers: [layerImage({ textureManager: sharedTM })],
 * });
 * ```
 */
export function layerImage(inputOptions?: Partial<LayerImageOptions>): FragmentLayer {
  const options: LayerImageOptions = {
    ...DEFAULT_LAYER_IMAGE_OPTIONS,
    ...(inputOptions || {}),
  };

  const { textureManager: providedTextureManager, textureManagerOptions, ...layerOptions } = options;

  // Initial texture count (will be updated dynamically)
  let currentTexturesCount = 1;

  // Create initial layer definition
  const initialDefinition = createLayerDefinition(layerOptions, currentTexturesCount);

  return {
    ...initialDefinition,

    lifecycle: (context: LayerLifecycleContext): LayerLifecycleHooks => {
      const { gl, requestShaderRegeneration, requestRefresh } = context;

      // Create or use provided TextureManager
      const textureManager =
        providedTextureManager ??
        new TextureManager({
          ...DEFAULT_TEXTURE_MANAGER_OPTIONS,
          ...textureManagerOptions,
        });

      // WebGL textures
      let textures: WebGLTexture[] = [];
      let textureImages: ImageData[] = [];
      let atlas: Atlas = {};

      /**
       * Bind texture data to WebGL.
       */
      const bindTextures = () => {
        // Ensure we have enough WebGL texture objects
        while (textures.length < textureImages.length) {
          const texture = gl.createTexture();
          if (texture) textures.push(texture);
        }

        // Upload texture data
        for (let i = 0; i < textureImages.length; i++) {
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, textures[i]);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureImages[i]);
          gl.generateMipmap(gl.TEXTURE_2D);
        }
      };

      /**
       * Handler for when new textures are available.
       */
      const onNewTexture = ({
        atlas: newAtlas,
        textures: newTextureImages,
      }: {
        atlas: Atlas;
        textures: ImageData[];
      }) => {
        const shouldUpgradeShaders = newTextureImages.length !== textureImages.length;

        atlas = newAtlas;
        textureImages = newTextureImages;

        if (shouldUpgradeShaders) {
          currentTexturesCount = newTextureImages.length || 1;
          requestShaderRegeneration();
        }

        bindTextures();
        requestRefresh();
      };

      return {
        init: () => {
          // Listen for texture updates
          textureManager.on(TextureManager.NEW_TEXTURE_EVENT, onNewTexture);

          // Initialize with current state
          atlas = textureManager.getAtlas();
          textureImages = textureManager.getTextures();
          if (textureImages.length > 0) {
            textures = textureImages.map(() => gl.createTexture() as WebGLTexture);
            bindTextures();
          }
        },

        beforeRender: () => {
          // Rebind textures before each render
          for (let i = 0; i < textureImages.length; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, textures[i]);
          }

          // Set texture atlas uniform
          const atlasLocation = context.getUniformLocation("u_atlas_image");
          if (atlasLocation) {
            gl.uniform1iv(
              atlasLocation,
              [...new Array(textureImages.length || 1)].map((_, i) => i),
            );
          }
        },

        regenerate: (): FragmentLayer => {
          // Return new layer definition with updated texture count
          // Don't include lifecycle - the factory preserves it from the original
          return createLayerDefinition(layerOptions, currentTexturesCount);
        },

        getAttributeData: (data: Record<string, unknown>, attributeSource: string): number | number[] | null => {
          const imageSource = data[layerOptions.imageAttribute] as string | undefined;

          if (attributeSource === "__texture__") {
            const imagePosition = imageSource ? atlas[imageSource] : undefined;
            if (imagePosition && typeof imagePosition.textureIndex === "number") {
              const { width, height } = textureImages[imagePosition.textureIndex];
              return [
                imagePosition.x / width,
                imagePosition.y / height,
                imagePosition.size / width,
                imagePosition.size / height,
              ];
            }
            return [0, 0, 0, 0];
          }

          if (attributeSource === "__textureIndex__") {
            // Register image if not already in atlas
            if (typeof imageSource === "string" && !atlas[imageSource]) {
              textureManager.registerImage(imageSource);
            }
            const imagePosition = imageSource ? atlas[imageSource] : undefined;
            return imagePosition?.textureIndex ?? 0;
          }

          return null;
        },

        kill: () => {
          // Remove listener
          textureManager.off(TextureManager.NEW_TEXTURE_EVENT, onNewTexture);

          // Delete WebGL textures
          for (const texture of textures) {
            gl.deleteTexture(texture);
          }
          textures = [];
        },
      };
    },
  };
}
