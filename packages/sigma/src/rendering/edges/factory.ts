/**
 * Sigma.js Edge Program Factory
 * ==============================
 *
 * Factory function that creates an EdgeProgram from path, extremities, and filling.
 * The resulting program renders edges as composable components with single-pass WebGL.
 *
 * @module
 */
import { Attributes } from "graphology-types";

import Sigma from "../../sigma";
import { EdgeDisplayData, NodeDisplayData, RenderParams } from "../../types";
import { floatColor } from "../../utils";
import { getShapeId } from "../shapes";
import { ProgramInfo } from "../utils";
import { EdgeProgram as BaseEdgeProgram, EdgeProgramType } from "./base";
import { generateEdgeShaders } from "./generator";
import { type EdgeLabelProgramType, createEdgeLabelProgram } from "./labels";
import { EdgeLifecycleContext, EdgeLifecycleHooks, EdgeProgramOptions, GeneratedEdgeShaders } from "./types";

/**
 * Creates an edge program from path, extremities, and filling components.
 *
 * @param options - Configuration for the edge program
 * @returns An EdgeProgram class that can be used with Sigma
 *
 * @example
 * ```typescript
 * import { createEdgeProgram, pathLine, extremityNone, extremityArrow, fillingPlain } from "sigma/rendering";
 *
 * const EdgeLineProgram = createEdgeProgram({
 *   path: pathLine(),
 *   head: extremityNone(),
 *   tail: extremityNone(),
 *   filling: fillingPlain(),
 * });
 *
 * const EdgeArrowProgram = createEdgeProgram({
 *   path: pathLine(),
 *   head: extremityArrow(),
 *   tail: extremityNone(),
 *   filling: fillingPlain(),
 * });
 *
 * const sigma = new Sigma(graph, container, {
 *   edgeProgramClasses: {
 *     line: EdgeLineProgram,
 *     arrow: EdgeArrowProgram,
 *   },
 * });
 * ```
 */
export function createEdgeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: EdgeProgramOptions): EdgeProgramType<N, E, G> {
  const { path, head, tail, filling } = options;

  // Shaders are generated lazily on first instantiation.
  // This ensures all node shapes are registered before edge shaders are compiled,
  // since generateShapeSelectorGLSL() reads from the shape registry.
  let generated: GeneratedEdgeShaders | null = null;

  // Create the edge program class
  const EdgeProgramClass = class extends BaseEdgeProgram<string, N, E, G> {
    static readonly programOptions = options;

    static get generatedShaders() {
      if (!generated) {
        generated = generateEdgeShaders({ path, head, tail, filling });
      }
      return generated;
    }

    // Lifecycle hooks storage
    private fillingLifecycle: EdgeLifecycleHooks | null = null;
    private needsShaderRegeneration = false;
    private _pickingBuffer: WebGLFramebuffer | null;

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      // Generate shaders on first instantiation (after node shapes are registered)
      if (!generated) {
        generated = generateEdgeShaders({ path, head, tail, filling });
      }

      super(gl, pickingBuffer, renderer);
      this._pickingBuffer = pickingBuffer;

      // Initialize filling lifecycle if present
      if (filling.lifecycle) {
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
        this.fillingLifecycle = filling.lifecycle(context);
      }

      // Call init hook
      this.fillingLifecycle?.init?.();
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
     * Regenerate shaders if filling requested it.
     */
    private maybeRegenerateShaders(): void {
      if (!this.needsShaderRegeneration) return;

      this.needsShaderRegeneration = false;

      // If filling has regenerate hook, get new filling definition
      let newFilling = filling;
      if (this.fillingLifecycle?.regenerate) {
        newFilling = this.fillingLifecycle.regenerate();
      }

      // Regenerate shaders
      generated = generateEdgeShaders({ path, head, tail, filling: newFilling });

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
      sourceData: NodeDisplayData,
      targetData: NodeDisplayData,
      data: EdgeDisplayData,
    ) {
      const array = this.array;

      // Get node shape IDs from registry
      // Node shape info is populated in node data by Sigma from the node program's shape
      const sourceShapeId = getShapeId(sourceData.shape || "circle");
      const targetShapeId = getShapeId(targetData.shape || "circle");

      // Standard attributes
      array[startIndex++] = sourceData.x;
      array[startIndex++] = sourceData.y;
      array[startIndex++] = targetData.x;
      array[startIndex++] = targetData.y;
      array[startIndex++] = sourceData.size || 1;
      array[startIndex++] = targetData.size || 1;
      array[startIndex++] = sourceShapeId;
      array[startIndex++] = targetShapeId;
      array[startIndex++] = data.size || 1;
      array[startIndex++] = floatColor(data.color);
      array[startIndex++] = edgeIndex;

      // Path-specific attributes
      path.attributes.forEach((attr) => {
        const sourceName = attr.source || attr.name.replace(/^a_/, "");
        const value = (data as unknown as Record<string, unknown>)[sourceName];
        if (attr.size === 1) {
          array[startIndex++] = typeof value === "number" ? value : (attr.defaultValue as number) || 0;
        } else {
          const arr = Array.isArray(value) ? value : [];
          for (let i = 0; i < attr.size; i++) {
            array[startIndex++] = arr[i] ?? 0;
          }
        }
      });

      // Extremity-specific attributes
      [head, tail].forEach((extremity) => {
        extremity.attributes.forEach((attr) => {
          const sourceName = attr.source || attr.name.replace(/^a_/, "");
          const value = (data as unknown as Record<string, unknown>)[sourceName];
          if (attr.size === 1) {
            array[startIndex++] = typeof value === "number" ? value : (attr.defaultValue as number) || 0;
          } else {
            const arr = Array.isArray(value) ? value : [];
            for (let i = 0; i < attr.size; i++) {
              array[startIndex++] = arr[i] ?? 0;
            }
          }
        });
      });

      // Filling-specific attributes
      filling.attributes.forEach((attr) => {
        const sourceName = attr.source || attr.name.replace(/^a_/, "");

        // Check if lifecycle provides the data
        let value: unknown = null;
        if (this.fillingLifecycle?.getAttributeData) {
          value = this.fillingLifecycle.getAttributeData(data as unknown as Record<string, unknown>, sourceName);
        }

        // Fall back to edge data
        if (value === null) {
          value = (data as unknown as Record<string, unknown>)[sourceName];
        }

        if (attr.size === 4 && attr.normalized) {
          const colorValue = typeof value === "string" ? floatColor(value) : floatColor(data.color);
          array[startIndex++] = colorValue;
        } else if (attr.size === 1) {
          array[startIndex++] = typeof value === "number" ? value : (attr.defaultValue as number) || 0;
        } else {
          const arr = Array.isArray(value) ? value : [];
          for (let i = 0; i < attr.size; i++) {
            array[startIndex++] = arr[i] ?? 0;
          }
        }
      });
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

      // Path-specific uniforms
      path.uniforms.forEach((uniform) => {
        this.setTypedUniform(uniform, programInfo);
      });

      // Extremity uniforms
      head.uniforms.forEach((uniform) => {
        this.setTypedUniform(uniform, programInfo);
      });
      tail.uniforms.forEach((uniform) => {
        this.setTypedUniform(uniform, programInfo);
      });

      // Filling uniforms
      filling.uniforms.forEach((uniform) => {
        this.setTypedUniform(uniform, programInfo);
      });
    }

    protected renderProgram(params: RenderParams, programInfo: ProgramInfo): void {
      // Check for shader regeneration
      this.maybeRegenerateShaders();

      // Call beforeRender hook
      this.fillingLifecycle?.beforeRender?.();

      super.renderProgram(params, programInfo);
    }

    kill(): void {
      // Call kill hook
      this.fillingLifecycle?.kill?.();

      super.kill();
    }
  };

  // Create and attach the label program for this edge type
  // This allows WebGL edge label rendering that follows the same path
  const LabelProgramClass = createEdgeLabelProgram({
    path,
    // Pass extremity length ratios so labels know where the edge body starts/ends
    headLengthRatio: typeof head.length === "number" ? head.length : 0,
    tailLengthRatio: typeof tail.length === "number" ? tail.length : 0,
    // Pass label styling options from EdgeProgramOptions (spread since interfaces match)
    ...options.label,
  });
  (EdgeProgramClass as unknown as { LabelProgram: EdgeLabelProgramType }).LabelProgram = LabelProgramClass;

  return EdgeProgramClass as unknown as EdgeProgramType<N, E, G>;
}
