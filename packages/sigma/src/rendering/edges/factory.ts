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
import { ProgramInfo } from "../utils";
import { EdgeProgram as BaseEdgeProgram, EdgeProgramType } from "./base";
import { generateEdgeShaders } from "./generator";
import { type EdgeLabelProgramType, createEdgeLabelProgram } from "./labels";
import {
  computeEdgeAttributeLayout,
  EDGE_ATTRIBUTE_TEXTURE_UNIT,
  EdgeAttributeLayout,
  EdgePathAttributeTexture,
} from "./path-attribute-texture";
import {
  EdgeLifecycleContext,
  EdgeLifecycleHooks,
  EdgeProgramOptions,
  GeneratedEdgeShaders,
  normalizeEdgeProgramOptions,
} from "./types";

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
 * // Multi-path mode: one program supports multiple path types
 * const MultiEdgeProgram = createEdgeProgram({
 *   paths: [pathLine(), pathCurved(), pathStep()],
 *   heads: [extremityNone(), extremityArrow()],
 *   tails: [extremityNone()],
 *   filling: fillingPlain(),
 * });
 *
 * const sigma = new Sigma(graph, container, {
 *   edgeProgramClasses: {
 *     line: EdgeLineProgram,
 *     arrow: EdgeArrowProgram,
 *     multi: MultiEdgeProgram, // Edges can select path via "path" attribute
 *   },
 * });
 * ```
 */
export function createEdgeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: EdgeProgramOptions): EdgeProgramType<N, E, G> {
  const { paths, heads, tails, path, head, tail, filling, isMultiMode } = normalizeEdgeProgramOptions(options);

  // Build name-to-index mappings for multi-path mode
  const pathNameToIndex: Record<string, number> = {};
  const headNameToIndex: Record<string, number> = {};
  const tailNameToIndex: Record<string, number> = {};

  paths.forEach((p, i) => (pathNameToIndex[p.name] = i));
  heads.forEach((h, i) => (headNameToIndex[h.name] = i));
  tails.forEach((t, i) => (tailNameToIndex[t.name] = i));

  // Shaders are generated lazily on first instantiation.
  // This ensures all node shapes are registered before edge shaders are compiled,
  // since generateShapeSelectorGLSL() reads from the shape registry.
  let generated: GeneratedEdgeShaders | null = null;

  // Compute attribute layout once for this program configuration
  const attributeLayout: EdgeAttributeLayout = computeEdgeAttributeLayout(isMultiMode ? paths : [path], filling);

  // Create the edge program class
  const EdgeProgramClass = class extends BaseEdgeProgram<string, N, E, G> {
    static readonly programOptions = options;
    // Multi-path mappings (for sigma to look up indices from names)
    static readonly pathNameToIndex = pathNameToIndex;
    static readonly headNameToIndex = headNameToIndex;
    static readonly tailNameToIndex = tailNameToIndex;
    static readonly isMultiMode = isMultiMode;

    static get generatedShaders() {
      if (!generated) {
        generated = isMultiMode
          ? generateEdgeShaders({ paths, heads, tails, filling })
          : generateEdgeShaders({ path, head, tail, filling });
      }
      return generated;
    }

    // Lifecycle hooks storage
    private fillingLifecycle: EdgeLifecycleHooks | null = null;
    private needsShaderRegeneration = false;
    private _pickingBuffer: WebGLFramebuffer | null;

    // Edge path attribute texture for storing path/filling attributes
    private edgeAttributeTexture: EdgePathAttributeTexture | null = null;
    private packedAttributeData: Float32Array;
    private readonly layout: EdgeAttributeLayout = attributeLayout;

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      // Generate shaders on first instantiation (after node shapes are registered)
      if (!generated) {
        generated = isMultiMode
          ? generateEdgeShaders({ paths, heads, tails, filling })
          : generateEdgeShaders({ path, head, tail, filling });
      }

      super(gl, pickingBuffer, renderer);
      this._pickingBuffer = pickingBuffer;

      // Create edge attribute texture for path/filling attributes
      this.edgeAttributeTexture = new EdgePathAttributeTexture(gl, this.layout);
      this.packedAttributeData = new Float32Array(this.layout.floatsPerEdge);

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
      generated = isMultiMode
        ? generateEdgeShaders({ paths, heads, tails, filling: newFilling })
        : generateEdgeShaders({ path, head, tail, filling: newFilling });

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

      // Pack path/filling attributes into the edge attribute texture
      const packed = this.packedAttributeData;
      packed.fill(0);

      const layout = this.layout;

      // Process path attributes
      const pathsToProcess = isMultiMode ? paths : [path];
      pathsToProcess.forEach((p) => {
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

      // Process filling attributes
      filling.attributes.forEach((attr) => {
        // Get attribute name without prefix
        const name = attr.name.replace(/^a_/, "");
        const offset = layout.offsets[name];
        if (offset === undefined) return; // Not in layout

        const sourceName = attr.source || name;

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
          // Color value - pack as float
          packed[offset] = typeof value === "string" ? floatColor(value) : floatColor(data.color);
        } else if (attr.size === 1) {
          packed[offset] = typeof value === "number" ? value : (attr.defaultValue as number) || 0;
        } else {
          const arr = Array.isArray(value) ? value : [];
          for (let i = 0; i < attr.size; i++) {
            packed[offset + i] = arr[i] ?? 0;
          }
        }
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
      if (this.edgeAttributeTexture && this.layout.floatsPerEdge > 0) {
        this.edgeAttributeTexture.bind(EDGE_ATTRIBUTE_TEXTURE_UNIT);

        if (uniformLocations.u_edgeAttributeTexture) {
          gl.uniform1i(uniformLocations.u_edgeAttributeTexture, EDGE_ATTRIBUTE_TEXTURE_UNIT);
        }
        if (uniformLocations.u_edgeAttributeTextureWidth) {
          gl.uniform1i(uniformLocations.u_edgeAttributeTextureWidth, this.edgeAttributeTexture.getTextureWidth());
        }
        if (uniformLocations.u_edgeAttributeTexelsPerEdge) {
          gl.uniform1i(uniformLocations.u_edgeAttributeTexelsPerEdge, this.edgeAttributeTexture.getTexelsPerEdge());
        }
      }

      // Track which uniforms we've already set to avoid duplicates
      const processedUniforms = new Set<string>();

      // Path-specific uniforms - in multi-mode, iterate all paths
      const pathsToProcess = isMultiMode ? paths : [path];
      pathsToProcess.forEach((p) => {
        p.uniforms.forEach((uniform) => {
          if (processedUniforms.has(uniform.name)) return;
          processedUniforms.add(uniform.name);
          this.setTypedUniform(uniform, programInfo);
        });
      });

      // Extremity uniforms - in multi-mode, iterate all heads and tails
      const extremitiesToProcess = isMultiMode ? [...heads, ...tails] : [head, tail];
      extremitiesToProcess.forEach((extremity) => {
        extremity.uniforms.forEach((uniform) => {
          if (processedUniforms.has(uniform.name)) return;
          processedUniforms.add(uniform.name);
          this.setTypedUniform(uniform, programInfo);
        });
      });

      // Filling uniforms
      filling.uniforms.forEach((uniform) => {
        if (processedUniforms.has(uniform.name)) return;
        processedUniforms.add(uniform.name);
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

      // Clean up attribute texture
      if (this.edgeAttributeTexture) {
        this.edgeAttributeTexture.kill();
        this.edgeAttributeTexture = null;
      }

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
