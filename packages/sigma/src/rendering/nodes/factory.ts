/**
 * Sigma.js Node Program Factory
 * ==============================
 *
 * Factory function that creates a NodeProgram from SDF shapes and fragment layers.
 * The resulting program includes an automatically generated LabelProgram that uses
 * the same shape for accurate label positioning.
 *
 * @module
 */
import { Attributes } from "graphology-types";

import Sigma from "../../sigma";
import { NodeDisplayData, RenderParams } from "../../types";
import { floatColor } from "../../utils";
import { registerShape } from "../shapes";
import { ProgramInfo } from "../utils";
import { NodeProgram, NodeProgramType } from "./base";
import { generateShaders } from "./generator";
import { createHoverProgram } from "./hovers";
import { createLabelProgram } from "./labels";
import { FragmentLayer, LayerLifecycleContext, LayerLifecycleHooks, NodeProgramOptions } from "./types";

/**
 * Creates a node program from an SDF shape and fragment layers.
 * The resulting program renders nodes as quads with the specified shape and layers.
 * It also includes a static `LabelProgram` property for rendering shape-aware labels.
 *
 * @param options - Configuration for the node program
 * @returns A NodeProgram class that can be used with Sigma
 *
 * @example
 * ```typescript
 * import { createNodeProgram, sdfCircle, layerFill } from "sigma/rendering";
 *
 * const CircleProgram = createNodeProgram({
 *   shape: sdfCircle(),
 *   layers: [layerFill()],
 * });
 *
 * const sigma = new Sigma(graph, container, {
 *   nodeProgramClasses: { circle: CircleProgram },
 *   labelProgramClasses: { circle: CircleProgram.LabelProgram },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Complex example with multiple layers and label options
 * const FancyProgram = createNodeProgram({
 *   shape: sdfSquare({ cornerRadius: 0.2 }),
 *   layers: [
 *     layerFill(),
 *     layerImage({ drawingMode: "background", padding: 2 }),
 *     layerBorder({ size: 2, color: "#000000" }),
 *   ],
 *   label: {
 *     position: "right",
 *     margin: 5,
 *     font: { family: "Arial", weight: "bold" },
 *     color: "#333333",
 *   },
 * });
 * ```
 */
export function createNodeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: NodeProgramOptions): NodeProgramType<N, E, G> {
  const { shape, rotateWithCamera = false, label: labelOptions = {} } = options;

  // Register the shape variant in the global registry for edge programs to use.
  // Returns a slug that uniquely identifies this shape variant (including params and rwc).
  const shapeSlug = registerShape(shape, rotateWithCamera);

  // Mutable layers array - can be regenerated
  let layers = [...options.layers];

  // Generate shaders and collect metadata
  let generated = generateShaders({ shape, layers, rotateWithCamera });

  // Create the label program class with the same shape
  const LabelProgramClass = createLabelProgram({
    shape,
    rotateWithCamera,
    label: labelOptions,
  });

  // Create the hover program class with the same shape and label options
  const HoverProgramClass = createHoverProgram({
    shape,
    rotateWithCamera,
    label: labelOptions,
  });

  // Create the node program class
  const NodeProgramClass = class extends NodeProgram<string, N, E, G> {
    // Store program options with the computed shapeSlug for Sigma to access
    static readonly programOptions = { ...options, shapeSlug };

    // Note: generatedShaders is now a getter to always return current shaders
    static get generatedShaders() {
      return generated;
    }

    // Static reference to the associated LabelProgram
    static LabelProgram = LabelProgramClass;

    // Static reference to the associated HoverProgram
    static HoverProgram = HoverProgramClass;

    // Lifecycle hooks storage (keyed by layer index for uniqueness)
    private layerLifecycles: Map<number, LayerLifecycleHooks> = new Map();
    private layersNeedingRegeneration: Set<number> = new Set();
    private _pickingBuffer: WebGLFramebuffer | null;

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      super(gl, pickingBuffer, renderer);
      this._pickingBuffer = pickingBuffer;

      // Initialize lifecycle hooks for each layer that has them
      layers.forEach((layer, index) => {
        if (layer.lifecycle) {
          const context: LayerLifecycleContext = {
            gl,
            renderer: { refresh: () => renderer.refresh() },
            getUniformLocation: (name: string) => {
              return gl.getUniformLocation(this.normalProgram.program, name);
            },
            requestShaderRegeneration: () => {
              this.layersNeedingRegeneration.add(index);
            },
            requestRefresh: () => {
              renderer.refresh();
            },
          };
          const hooks = layer.lifecycle(context);
          this.layerLifecycles.set(index, hooks);
        }
      });

      // Call init hooks after everything is set up
      this.layerLifecycles.forEach((hooks) => {
        hooks.init?.();
      });
    }

    getDefinition() {
      const { FLOAT, TRIANGLE_STRIP } = WebGL2RenderingContext;

      return {
        // Instanced rendering: 4 vertices for quad, one instance per node
        VERTICES: 4,
        VERTEX_SHADER_SOURCE: generated.vertexShader,
        FRAGMENT_SHADER_SOURCE: generated.fragmentShader,
        METHOD: TRIANGLE_STRIP,
        UNIFORMS: generated.uniforms,
        ATTRIBUTES: generated.attributes,
        // Constant attributes define the quad corners
        CONSTANT_ATTRIBUTES: [{ name: "a_quadCorner", size: 2, type: FLOAT }],
        CONSTANT_DATA: [
          [-1, -1], // Bottom-left
          [1, -1], // Bottom-right
          [-1, 1], // Top-left
          [1, 1], // Top-right
        ],
      };
    }

    /**
     * Regenerate shaders if any layers requested it.
     * This handles dynamic changes like texture count updates.
     */
    private maybeRegenerateShaders(): void {
      if (this.layersNeedingRegeneration.size === 0) return;

      // Regenerate layers that requested it
      layers = layers.map((layer, index): FragmentLayer => {
        if (this.layersNeedingRegeneration.has(index)) {
          const hooks = this.layerLifecycles.get(index);
          if (hooks?.regenerate) {
            const newLayer = hooks.regenerate();
            // Preserve the lifecycle from the original layer
            return { ...newLayer, lifecycle: layer.lifecycle };
          }
        }
        return layer;
      });

      this.layersNeedingRegeneration.clear();

      // Regenerate shaders with updated layers
      generated = generateShaders({ shape, layers, rotateWithCamera });

      // Rebuild WebGL program
      const gl = this.normalProgram.gl;
      const { program, buffer, vertexShader, fragmentShader } = this.normalProgram;

      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      // Recreate program with new shaders
      this.normalProgram = this.getProgramInfo(
        "normal",
        gl,
        generated.vertexShader,
        generated.fragmentShader,
        this._pickingBuffer,
      );
    }

    processVisibleItem(nodeIndex: number, startIndex: number, data: NodeDisplayData, textureIndex: number) {
      const array = this.array;
      const color = floatColor(data.color);

      // Standard attributes that all node programs have
      // Position and size are now fetched from texture via nodeIndex
      array[startIndex++] = textureIndex; // a_nodeIndex (index into node data texture)
      array[startIndex++] = color; // a_color
      array[startIndex++] = nodeIndex; // a_id

      // Layer-specific attributes:
      // Each layer can define additional attributes to read from NodeDisplayData.
      // The 'source' field on the attribute specifies which node property to read from.
      layers.forEach((layer, layerIndex) => {
        const hooks = this.layerLifecycles.get(layerIndex);

        layer.attributes.forEach((attr) => {
          // Get the source property name (defaults to attribute name without 'a_' prefix)
          const sourceName = attr.source || attr.name.replace(/^a_/, "");

          // First, check if lifecycle provides data for this source
          let value: unknown = null;
          if (hooks?.getAttributeData) {
            value = hooks.getAttributeData(data as unknown as Record<string, unknown>, sourceName);
          }

          // Fall back to node data if lifecycle didn't provide a value
          if (value === null) {
            value = (data as unknown as Record<string, unknown>)[sourceName];
          }

          if (attr.size === 4 && attr.normalized) {
            // Color attribute - convert from CSS color string to packed float
            // Use defaultValue if specified and value is missing, otherwise fall back to node color
            const defaultColor = typeof attr.defaultValue === "string" ? attr.defaultValue : data.color;
            const colorValue = typeof value === "string" ? floatColor(value) : floatColor(defaultColor);
            array[startIndex++] = colorValue;
          } else if (attr.size === 1) {
            // Single float value - use defaultValue if specified
            const defaultNum = typeof attr.defaultValue === "number" ? attr.defaultValue : 0;
            array[startIndex++] = typeof value === "number" ? value : defaultNum;
          } else {
            // Multi-component value (vec2, vec3, vec4)
            const arr = Array.isArray(value) ? value : [];
            for (let i = 0; i < attr.size; i++) {
              array[startIndex++] = arr[i] ?? 0;
            }
          }
        });
      });

      return;
    }

    setUniforms(params: RenderParams, programInfo: ProgramInfo): void {
      const { gl, uniformLocations } = programInfo;

      // Set standard uniforms
      if (uniformLocations.u_matrix) {
        gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
      }
      if (uniformLocations.u_sizeRatio) {
        gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      }
      if (uniformLocations.u_correctionRatio) {
        gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      }
      if (uniformLocations.u_cameraAngle) {
        gl.uniform1f(uniformLocations.u_cameraAngle, params.cameraAngle);
      }
      if (uniformLocations.u_nodeDataTexture) {
        gl.uniform1i(uniformLocations.u_nodeDataTexture, params.nodeDataTextureUnit);
      }
      if (uniformLocations.u_nodeDataTextureWidth) {
        gl.uniform1i(uniformLocations.u_nodeDataTextureWidth, params.nodeDataTextureWidth);
      }

      // Set shape-specific uniforms
      shape.uniforms.forEach((uniform) => {
        this.setTypedUniform(uniform, programInfo);
      });

      // Set layer-specific uniforms
      layers.forEach((layer) => {
        layer.uniforms.forEach((uniform) => {
          this.setTypedUniform(uniform, programInfo);
        });
      });
    }

    protected renderProgram(params: RenderParams, programInfo: ProgramInfo): void {
      // Check for shader regeneration before rendering
      this.maybeRegenerateShaders();

      // Call beforeRender hooks (for texture binding, etc.)
      this.layerLifecycles.forEach((hooks) => {
        hooks.beforeRender?.();
      });

      super.renderProgram(params, programInfo);
    }

    kill(): void {
      // Call kill hooks for cleanup
      this.layerLifecycles.forEach((hooks) => {
        hooks.kill?.();
      });
      this.layerLifecycles.clear();

      super.kill();
    }
  };

  return NodeProgramClass as unknown as NodeProgramType<N, E, G>;
}
