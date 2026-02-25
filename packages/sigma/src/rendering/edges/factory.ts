/**
 * Sigma.js Edge Program Factory
 * ==============================
 *
 * Factory function that creates an EdgeProgram from paths, extremities, and layers.
 * The resulting program renders edges as composable components with single-pass WebGL.
 *
 * @module
 */
import { Attributes } from "graphology-types";

import Sigma from "../../sigma";
import { EdgeDisplayData, NodeDisplayData, RenderParams } from "../../types";
import { colorToArray, floatColor } from "../../utils";
import { isAttributeSource } from "../nodes";
import { ProgramInfo } from "../utils";
import { EdgeProgram as BaseEdgeProgram, EdgeProgramType } from "./base";
import { generateEdgeShaders } from "./generator";
import { type EdgeLabelProgramType, createEdgeLabelProgram } from "./labels";
import { AttributeLayout, ItemAttributeTexture, computeAttributeLayout } from "../data-texture";
import { EDGE_ATTRIBUTE_TEXTURE_UNIT } from "./path-attribute-texture";
import {
  EdgeExtremity,
  EdgeLifecycleContext,
  EdgeLifecycleHooks,
  EdgeProgramOptions,
  GeneratedEdgeShaders,
  normalizeEdgeProgramOptions,
} from "./types";

/**
 * Internal "none" extremity - no decoration at edge endpoint.
 * This is always implicitly available in all edge programs.
 */
function extremityNone(): EdgeExtremity {
  // language=GLSL
  const glsl = /*glsl*/ `
// No extremity - always returns positive (outside)
float extremity_none(vec2 uv, float lengthRatio, float widthRatio) {
  return 1.0;
}
`;

  return {
    name: "none",
    glsl,
    length: 0,
    widthFactor: 1.0,
    margin: 0,
    uniforms: [],
    attributes: [],
  };
}

/**
 * Creates an edge program from paths, extremities, and layers.
 *
 * @param options - Configuration for the edge program
 * @returns An EdgeProgram class that can be used with Sigma
 *
 * @example
 * ```typescript
 * import { createEdgeProgram, pathLine, pathCurved, extremityArrow, layerPlain } from "sigma/rendering";
 *
 * // Simple line (no extremities needed - "none" is implicit)
 * const EdgeLineProgram = createEdgeProgram({
 *   paths: [pathLine()],
 *   layers: [layerPlain()],
 * });
 *
 * // Arrow at head
 * const EdgeArrowProgram = createEdgeProgram({
 *   paths: [pathLine()],
 *   extremities: [extremityArrow()],
 *   layers: [layerPlain()],
 *   defaultHead: "arrow",
 * });
 *
 * // Multi-path: edges select path/extremity via attributes
 * const MultiEdgeProgram = createEdgeProgram({
 *   paths: [pathLine(), pathCurved()],
 *   extremities: [extremityArrow()],
 *   layers: [layerPlain()],
 * });
 * // Edges select via: { path: "curved", head: "arrow", tail: "none" }
 * ```
 */
export function createEdgeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: EdgeProgramOptions): EdgeProgramType<N, E, G> {
  const normalized = normalizeEdgeProgramOptions(options);
  const { paths, layers, defaultHead, defaultTail } = normalized;

  // Always prepend extremityNone() so "none" is always available at index 0
  const extremities = [extremityNone(), ...normalized.extremities];

  // Build name-to-index mappings
  const pathNameToIndex: Record<string, number> = {};
  const extremityNameToIndex: Record<string, number> = {};

  paths.forEach((p, i) => (pathNameToIndex[p.name] = i));
  extremities.forEach((e, i) => (extremityNameToIndex[e.name] = i));

  // Resolve default indices from names
  const defaultHeadIndex = extremityNameToIndex[defaultHead] ?? 0;
  const defaultTailIndex = extremityNameToIndex[defaultTail] ?? 0;

  // Shaders are generated lazily on first instantiation.
  // This ensures all node shapes are registered before edge shaders are compiled,
  // since generateShapeSelectorGLSL() reads from the shape registry.
  let generated: GeneratedEdgeShaders | null = null;

  // Compute attribute layout once for this program configuration (all layers)
  const attributeLayout: AttributeLayout = computeAttributeLayout([...paths, ...layers]);

  // Create the edge program class
  const EdgeProgramClass = class extends BaseEdgeProgram<string, N, E, G> {
    // Store options with the prepended extremities array (for sigma to look up length ratios)
    static readonly programOptions = { ...options, extremities };
    // Name-to-index mappings (for sigma to look up indices from names)
    static readonly pathNameToIndex = pathNameToIndex;
    static readonly extremityNameToIndex = extremityNameToIndex;
    // Default indices for head/tail when edge doesn't specify
    static readonly defaultHeadIndex = defaultHeadIndex;
    static readonly defaultTailIndex = defaultTailIndex;

    static get generatedShaders() {
      if (!generated) {
        generated = generateEdgeShaders({ paths, extremities, layers });
      }
      return generated;
    }

    // Lifecycle hooks storage for all layers
    private layerLifecycles: Map<number, EdgeLifecycleHooks> = new Map();
    private needsShaderRegeneration = false;
    private _pickingBuffer: WebGLFramebuffer | null;

    // Edge path attribute texture for storing path/layer attributes
    private edgeAttributeTexture: ItemAttributeTexture | null = null;
    private packedAttributeData: Float32Array;
    private readonly layout: AttributeLayout = attributeLayout;

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      // Generate shaders on first instantiation (after node shapes are registered)
      if (!generated) {
        generated = generateEdgeShaders({ paths, extremities, layers });
      }

      super(gl, pickingBuffer, renderer);
      this._pickingBuffer = pickingBuffer;

      // Create edge attribute texture for path/layer attributes
      this.edgeAttributeTexture = new ItemAttributeTexture(gl, this.layout);
      this.packedAttributeData = new Float32Array(this.layout.floatsPerItem);

      // Initialize layer lifecycles for all layers
      layers.forEach((layer, index) => {
        if (layer.lifecycle) {
          const context: EdgeLifecycleContext = {
            gl,
            renderer: { refresh: () => renderer.refresh() },
            getUniformLocation: (name: string) => {
              return gl.getUniformLocation(this.normalProgram.program, name);
            },
            requestShaderRegeneration: () => {
              this.needsShaderRegeneration = true;
            },
            requestRefresh: () => {
              renderer.refresh();
            },
          };
          this.layerLifecycles.set(index, layer.lifecycle(context));
        }
      });

      // Call init hook for all layers
      this.layerLifecycles.forEach((hooks) => hooks.init?.());
    }

    getDefinition() {
      const { TRIANGLE_STRIP } = WebGL2RenderingContext;

      // All edges use TRIANGLE_STRIP with zone-based geometry
      const method = TRIANGLE_STRIP;

      // generated is guaranteed to be set by constructor before getDefinition is called
      const shaders = generated!;

      return {
        VERTICES: shaders.verticesPerEdge,
        VERTEX_SHADER_SOURCE: shaders.vertexShader,
        FRAGMENT_SHADER_SOURCE: shaders.fragmentShader,
        METHOD: method,
        UNIFORMS: shaders.uniforms,
        ATTRIBUTES: shaders.attributes,
        CONSTANT_ATTRIBUTES: shaders.constantAttributes,
        CONSTANT_DATA: shaders.constantData,
      };
    }

    /**
     * Regenerate shaders if any layer requested it.
     */
    private maybeRegenerateShaders(): void {
      if (!this.needsShaderRegeneration) return;

      this.needsShaderRegeneration = false;

      // Regenerate layers that have regenerate hooks
      const newLayers = layers.map((layer, index) => {
        const hooks = this.layerLifecycles.get(index);
        if (hooks?.regenerate) {
          return hooks.regenerate();
        }
        return layer;
      });

      // Regenerate shaders with potentially updated layers
      generated = generateEdgeShaders({ paths, extremities, layers: newLayers });

      // Rebuild WebGL program
      const gl = this.normalProgram.gl;
      const { program, buffer, vertexShader, fragmentShader } = this.normalProgram;

      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      // Recreate program
      this.normalProgram = this.getProgramInfo(
        "normal",
        gl,
        generated.vertexShader,
        generated.fragmentShader,
        this._pickingBuffer,
      );
    }

    processVisibleItem(
      edgeIndex: number,
      startIndex: number,
      _sourceData: NodeDisplayData,
      _targetData: NodeDisplayData,
      data: EdgeDisplayData,
      edgeTextureIndex: number,
    ) {
      const array = this.array;

      // Core attributes go into vertex buffer
      // Edge data (node indices, thickness, extremity ratios) fetched from edge data texture via edgeIndex
      array[startIndex++] = edgeTextureIndex;
      array[startIndex++] = floatColor(data.color);
      array[startIndex++] = edgeIndex;

      // Pack path/layer attributes into the edge attribute texture
      const packed = this.packedAttributeData;
      packed.fill(0);

      const layout = this.layout;

      // Process path attributes
      paths.forEach((p) => {
        p.attributes.forEach((attr) => {
          // Get attribute name without prefix
          const name = attr.name.replace(/^a_/, "");
          const offset = layout.offsets[name];
          if (offset === undefined) return; // Not in layout

          const sourceName = attr.source || name;
          const value = (data as unknown as Record<string, unknown>)[sourceName];

          if (attr.size === 1) {
            packed[offset] = typeof value === "number" ? value : (attr.defaultValue as number) || 0;
          } else {
            const arr = Array.isArray(value) ? value : [];
            for (let i = 0; i < attr.size; i++) {
              packed[offset + i] = arr[i] ?? 0;
            }
          }
        });
      });

      // Process attributes from all layers
      layers.forEach((layer, layerIndex) => {
        const layerHooks = this.layerLifecycles.get(layerIndex);

        layer.attributes.forEach(
          (attr: { name: string; source?: string; size: number; normalized?: boolean; defaultValue?: unknown }) => {
            // Get attribute name without prefix
            const name = attr.name.replace(/^a_/, "");
            const offset = layout.offsets[name];
            if (offset === undefined) return; // Not in layout

            const sourceName = attr.source || name;

            // Check if lifecycle provides the data
            let value: unknown = null;
            if (layerHooks?.getAttributeData) {
              value = layerHooks.getAttributeData(data as unknown as Record<string, unknown>, sourceName);
            }

            // Fall back to edge data
            if (value === null) {
              value = (data as unknown as Record<string, unknown>)[sourceName];
            }

            if (attr.size === 4 && attr.normalized) {
              // Color attribute - convert from CSS color string to RGBA floats [0,1]
              const defaultColor = typeof attr.defaultValue === "string" ? attr.defaultValue : data.color;
              const colorStr = typeof value === "string" ? value : defaultColor;
              const [r, g, b, a] = colorToArray(colorStr);
              packed[offset] = r / 255;
              packed[offset + 1] = g / 255;
              packed[offset + 2] = b / 255;
              packed[offset + 3] = a / 255;
            } else if (attr.size === 1) {
              packed[offset] = typeof value === "number" ? value : (attr.defaultValue as number) || 0;
            } else {
              const arr = Array.isArray(value) ? value : [];
              for (let i = 0; i < attr.size; i++) {
                packed[offset + i] = arr[i] ?? 0;
              }
            }
          },
        );
      });

      // Update the texture with packed attributes
      // Use edgeTextureIndex as the key for consistent allocation
      const edgeKey = `edge_${edgeTextureIndex}`;
      this.edgeAttributeTexture!.updateAllAttributes(edgeKey, packed);
    }

    setUniforms(params: RenderParams, programInfo: ProgramInfo): void {
      const { gl, uniformLocations } = programInfo;

      // Standard uniforms
      if (uniformLocations.u_matrix) {
        gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
      }
      if (uniformLocations.u_sizeRatio) {
        gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      }
      if (uniformLocations.u_correctionRatio) {
        gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      }
      if (uniformLocations.u_zoomRatio) {
        gl.uniform1f(uniformLocations.u_zoomRatio, params.zoomRatio);
      }
      if (uniformLocations.u_pixelRatio) {
        gl.uniform1f(uniformLocations.u_pixelRatio, params.pixelRatio);
      }
      if (uniformLocations.u_cameraAngle) {
        gl.uniform1f(uniformLocations.u_cameraAngle, params.cameraAngle);
      }
      if (uniformLocations.u_feather) {
        gl.uniform1f(uniformLocations.u_feather, params.antiAliasingFeather);
      }
      if (uniformLocations.u_minEdgeThickness) {
        gl.uniform1f(uniformLocations.u_minEdgeThickness, params.minEdgeThickness);
      }
      if (uniformLocations.u_nodeDataTexture) {
        gl.uniform1i(uniformLocations.u_nodeDataTexture, params.nodeDataTextureUnit);
      }
      if (uniformLocations.u_nodeDataTextureWidth) {
        gl.uniform1i(uniformLocations.u_nodeDataTextureWidth, params.nodeDataTextureWidth);
      }
      if (uniformLocations.u_edgeDataTexture) {
        gl.uniform1i(uniformLocations.u_edgeDataTexture, params.edgeDataTextureUnit);
      }
      if (uniformLocations.u_edgeDataTextureWidth) {
        gl.uniform1i(uniformLocations.u_edgeDataTextureWidth, params.edgeDataTextureWidth);
      }

      // Edge path attribute texture
      if (this.edgeAttributeTexture && this.layout.floatsPerItem > 0) {
        this.edgeAttributeTexture.bind(EDGE_ATTRIBUTE_TEXTURE_UNIT);

        if (uniformLocations.u_edgeAttributeTexture) {
          gl.uniform1i(uniformLocations.u_edgeAttributeTexture, EDGE_ATTRIBUTE_TEXTURE_UNIT);
        }
        if (uniformLocations.u_edgeAttributeTextureWidth) {
          gl.uniform1i(uniformLocations.u_edgeAttributeTextureWidth, this.edgeAttributeTexture.getTextureWidth());
        }
        if (uniformLocations.u_edgeAttributeTexelsPerEdge) {
          gl.uniform1i(uniformLocations.u_edgeAttributeTexelsPerEdge, this.edgeAttributeTexture.getTexelsPerItem());
        }
      }

      // Track which uniforms we've already set to avoid duplicates
      const processedUniforms = new Set<string>();

      // Path-specific uniforms
      paths.forEach((p) => {
        p.uniforms.forEach((uniform) => {
          if (processedUniforms.has(uniform.name)) return;
          processedUniforms.add(uniform.name);
          this.setTypedUniform(uniform, programInfo);
        });
      });

      // Extremity uniforms
      extremities.forEach((ext) => {
        ext.uniforms.forEach((uniform) => {
          if (processedUniforms.has(uniform.name)) return;
          processedUniforms.add(uniform.name);
          this.setTypedUniform(uniform, programInfo);
        });
      });

      // Layer uniforms (from all layers)
      layers.forEach((layer) => {
        layer.uniforms.forEach((uniform) => {
          if (processedUniforms.has(uniform.name)) return;
          processedUniforms.add(uniform.name);
          this.setTypedUniform(uniform, programInfo);
        });
      });
    }

    protected renderProgram(params: RenderParams, programInfo: ProgramInfo): void {
      // Check for shader regeneration
      this.maybeRegenerateShaders();

      // Call beforeRender hook for all layers
      this.layerLifecycles.forEach((hooks) => hooks.beforeRender?.());

      super.renderProgram(params, programInfo);
    }

    /**
     * Uploads the edge path attribute texture to the GPU.
     * Called by sigma before rendering to ensure texture data is current.
     */
    uploadAttributeTexture(): void {
      if (this.edgeAttributeTexture && this.layout.floatsPerItem > 0) {
        this.edgeAttributeTexture.upload();
      }
    }

    getAttributeTextureStats() {
      return this.edgeAttributeTexture?.getMemoryStats() ?? null;
    }

    getAttributeTextureWriteStats() {
      return this.edgeAttributeTexture?.getWriteStats() ?? null;
    }

    resetAttributeTextureWriteStats() {
      this.edgeAttributeTexture?.resetWriteStats();
    }

    kill(): void {
      // Call kill hook for all layers
      this.layerLifecycles.forEach((hooks) => hooks.kill?.());

      // Clean up attribute texture
      if (this.edgeAttributeTexture) {
        this.edgeAttributeTexture.kill();
        this.edgeAttributeTexture = null;
      }

      super.kill();
    }
  };

  // Create and attach the label program for this edge type
  // This allows WebGL edge label rendering that follows all path types
  const defaultHeadExtremity = extremities[defaultHeadIndex];
  const defaultTailExtremity = extremities[defaultTailIndex];
  const LabelProgramClass = createEdgeLabelProgram({
    paths, // Pass all paths for multi-path support
    // Pass extremity length ratios so labels know where the edge body starts/ends
    headLengthRatio: !isAttributeSource(defaultHeadExtremity.length) ? defaultHeadExtremity.length : 0,
    tailLengthRatio: !isAttributeSource(defaultTailExtremity.length) ? defaultTailExtremity.length : 0,
    // Pass label styling options from EdgeProgramOptions (spread since interfaces match)
    ...options.label,
  });
  (EdgeProgramClass as unknown as { LabelProgram: EdgeLabelProgramType }).LabelProgram = LabelProgramClass;

  return EdgeProgramClass as unknown as EdgeProgramType<N, E, G>;
}
