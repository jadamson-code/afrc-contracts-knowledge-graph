/**
 * Sigma.js Composed Node Program Factory
 * =======================================
 *
 * Factory function that creates a NodeProgram from composed shapes and layers.
 * Also provides a unified factory that creates both NodeProgram and LabelProgram
 * sharing the same SDF shape for accurate label positioning.
 *
 * @module
 */
import { Attributes } from "graphology-types";

import Sigma from "../../sigma";
import { NodeDisplayData, RenderParams } from "../../types";
import { floatColor } from "../../utils";
import { LabelProgramType } from "../label";
import { NodeProgram } from "../node";
import type { NodeProgramType } from "../node";
import { ProgramInfo } from "../utils";
import { generateShaders } from "./generator";
import { createComposedLabelProgram } from "./label-factory";
import {
  ComposedProgramOptions,
  FragmentLayer,
  LayerLifecycleContext,
  LayerLifecycleHooks,
  UniformSpecification,
} from "./types";

/**
 * Creates a composed node program from an SDF shape and fragment layers.
 * The resulting program renders nodes as quads with the specified shape and layers.
 *
 * @param options - Configuration for the composed program
 * @returns A NodeProgram class that can be used with Sigma
 *
 * @example
 * ```typescript
 * import { createComposedNodeProgram, sdfCircle, layerFill } from "sigma/rendering";
 *
 * const CircleProgram = createComposedNodeProgram({
 *   shape: sdfCircle(),
 *   layers: [layerFill()],
 * });
 *
 * const sigma = new Sigma(graph, container, {
 *   renderNodes: CircleProgram,
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Complex example with multiple layers
 * const FancyProgram = createComposedNodeProgram({
 *   shape: sdfSquare({ cornerRadius: 0.2 }),
 *   layers: [
 *     layerFill(),
 *     layerImage({ drawingMode: "background", padding: 2 }),
 *     layerBorder({ size: 2, color: "#000000" }),
 *   ],
 * });
 * ```
 */
export function createComposedNodeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: ComposedProgramOptions): NodeProgramType<N, E, G> {
  const { shape, rotateWithCamera = false } = options;

  // Mutable layers array - can be regenerated
  let layers = [...options.layers];

  // Generate shaders and collect metadata
  let generated = generateShaders({ shape, layers, rotateWithCamera });

  return class ComposedNodeProgram extends NodeProgram<string, N, E, G> {
    static readonly programOptions = options;
    // Note: generatedShaders is now a getter to always return current shaders
    static get generatedShaders() {
      return generated;
    }

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

    processVisibleItem(nodeIndex: number, startIndex: number, data: NodeDisplayData) {
      const array = this.array;
      const color = floatColor(data.color);

      // Standard attributes that all node programs have
      array[startIndex++] = data.x; // a_position.x
      array[startIndex++] = data.y; // a_position.y
      array[startIndex++] = data.size; // a_size
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

    setUniform(uniform: UniformSpecification, { gl, uniformLocations }: ProgramInfo): void {
      const location = uniformLocations[uniform.name];
      if (!location) return;

      // Skip sampler2D uniforms (they don't have values)
      if (uniform.type === "sampler2D") return;

      switch (uniform.type) {
        case "float":
          gl.uniform1f(location, uniform.value);
          break;
        case "int":
        case "bool":
          gl.uniform1i(location, uniform.value);
          break;
        case "vec2":
          gl.uniform2fv(location, uniform.value);
          break;
        case "vec3":
          gl.uniform3fv(location, uniform.value);
          break;
        case "vec4":
          gl.uniform4fv(location, uniform.value);
          break;
        case "mat3":
          gl.uniformMatrix3fv(location, false, uniform.value);
          break;
        case "mat4":
          gl.uniformMatrix4fv(location, false, uniform.value);
          break;
      }
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

      // Set shape-specific uniforms
      shape.uniforms.forEach((uniform) => {
        this.setUniform(uniform, programInfo);
      });

      // Set layer-specific uniforms
      layers.forEach((layer) => {
        layer.uniforms.forEach((uniform) => {
          this.setUniform(uniform, programInfo);
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
}

/**
 * Result of createComposedPrograms - contains both node and label program classes.
 */
export interface ComposedPrograms<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> {
  /** Node program class for rendering nodes */
  NodeProgram: NodeProgramType<N, E, G>;
  /** Label program class for rendering labels with shape-aware positioning */
  LabelProgram: LabelProgramType<N, E, G>;
}

/**
 * Creates both node and label programs from an SDF shape and fragment layers.
 * The label program uses the same shape's SDF to compute accurate edge positions
 * for label placement.
 *
 * This is the recommended way to create programs when you want labels to be
 * positioned correctly relative to the node shape.
 *
 * @param options - Configuration for the composed programs
 * @returns Object containing both NodeProgram and LabelProgram classes
 *
 * @example
 * ```typescript
 * import { createComposedPrograms, sdfSquare, layerFill } from "sigma/rendering";
 *
 * const { NodeProgram, LabelProgram } = createComposedPrograms({
 *   shape: sdfSquare({ cornerRadius: 0.1 }),
 *   layers: [layerFill()],
 * });
 *
 * const sigma = new Sigma(graph, container, {
 *   nodeProgramClasses: { default: NodeProgram },
 *   labelProgramClasses: { default: LabelProgram },
 * });
 * ```
 */
export function createComposedPrograms<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: ComposedProgramOptions): ComposedPrograms<N, E, G> {
  const { shape, rotateWithCamera = false } = options;

  // Create the node program
  const NodeProgram = createComposedNodeProgram<N, E, G>(options);

  // Create the label program with the same shape
  const LabelProgram = createComposedLabelProgram<N, E, G>({
    shape,
    rotateWithCamera,
  });

  return { NodeProgram, LabelProgram };
}
