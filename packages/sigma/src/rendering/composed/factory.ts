/**
 * Sigma.js Composed Node Program Factory
 * =======================================
 *
 * Factory function that creates a NodeProgram from composed shapes and layers.
 *
 * @module
 */
import { Attributes } from "graphology-types";

import { NodeDisplayData, RenderParams } from "../../types";
import { floatColor } from "../../utils";
import { NodeProgram } from "../node";
import type { NodeProgramType } from "../node";
import { ProgramInfo } from "../utils";
import { generateShaders } from "./generator";
import { ComposedProgramOptions, UniformSpecification } from "./types";

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
  const { shape, layers } = options;

  // Generate shaders and collect metadata
  const generated = generateShaders(options);

  return class ComposedNodeProgram extends NodeProgram<string, N, E, G> {
    static readonly programOptions = options;
    static readonly generatedShaders = generated;

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
      layers.forEach((layer) => {
        layer.attributes.forEach((attr) => {
          // Get the source property name (defaults to attribute name without 'a_' prefix)
          const sourceName = attr.source || attr.name.replace(/^a_/, "");
          const value = (data as Record<string, unknown>)[sourceName];

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
  };
}
