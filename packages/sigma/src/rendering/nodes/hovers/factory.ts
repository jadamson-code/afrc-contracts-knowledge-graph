/**
 * Sigma.js Hover Program Factory
 * ===============================
 *
 * Factory function that creates a HoverProgram class from an SDF shape definition.
 * The resulting hover program renders the union of an enlarged node shape and a
 * label rectangle, with a soft shadow effect.
 *
 * @module
 */
import { Attributes } from "graphology-types";

import type Sigma from "../../../sigma";
import type { LabelPosition, RenderParams } from "../../../types";
import { POSITION_MODE_MAP } from "../../glsl";
import { InstancedProgramDefinition, ProgramInfo } from "../../utils";
import { LabelOptions, SDFShape } from "../types";
import { HoverDisplayData, HoverProgram, HoverProgramType } from "./base";
import { HoverShaderOptions, generateHoverShaders } from "./generator";

export interface CreateHoverProgramOptions {
  shapes: SDFShape[];
  rotateWithCamera?: boolean;
  label?: LabelOptions;
}

export function createHoverProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: CreateHoverProgramOptions): HoverProgramType<N, E, G> {
  const { rotateWithCamera = false, label: labelOptions = {}, shapes } = options;

  if (shapes.length === 0) {
    throw new Error("createHoverProgram: at least one shape must be provided in 'shapes'");
  }

  const labelPosition: LabelPosition = labelOptions.position ?? "right";
  const labelMargin = labelOptions.margin ?? 1;
  const labelAngle = labelOptions.angle ?? 0;

  const shaderOptions: HoverShaderOptions = { shapes, rotateWithCamera };
  const generatedShaders = generateHoverShaders(shaderOptions);

  type HoverUniform = string;

  return class NodeHoverProgram extends HoverProgram<HoverUniform, N, E, G> {
    static readonly programOptions = options;
    static readonly generatedShaders = generatedShaders;
    static readonly labelPosition = labelPosition;
    static readonly labelMargin = labelMargin;
    static readonly labelAngle = labelAngle;

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      super(gl, pickingBuffer, renderer);
    }

    getDefinition(): InstancedProgramDefinition<HoverUniform> {
      const { FLOAT, TRIANGLE_STRIP } = WebGL2RenderingContext;

      return {
        VERTICES: 4,
        VERTEX_SHADER_SOURCE: generatedShaders.vertexShader,
        FRAGMENT_SHADER_SOURCE: generatedShaders.fragmentShader,
        METHOD: TRIANGLE_STRIP,
        UNIFORMS: generatedShaders.uniforms as HoverUniform[],
        ATTRIBUTES: [
          { name: "a_nodePosition", size: 2, type: FLOAT },
          { name: "a_nodeSize", size: 1, type: FLOAT },
          { name: "a_shapeId", size: 1, type: FLOAT },
          { name: "a_labelWidth", size: 1, type: FLOAT },
          { name: "a_labelHeight", size: 1, type: FLOAT },
          { name: "a_positionMode", size: 1, type: FLOAT },
          // Per-node backdrop style attributes
          { name: "a_backdropColor", size: 4, type: FLOAT },
          { name: "a_backdropShadowColor", size: 4, type: FLOAT },
          { name: "a_backdropShadowBlur", size: 1, type: FLOAT },
          { name: "a_backdropPadding", size: 1, type: FLOAT },
        ],
        CONSTANT_ATTRIBUTES: [{ name: "a_quadCorner", size: 2, type: FLOAT }],
        CONSTANT_DATA: [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ],
      };
    }

    processHover(offset: number, data: HoverDisplayData): void {
      const array = this.array;
      const stride = this.STRIDE;
      let i = offset * stride;

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = data.size;
      array[i++] = data.shapeId;
      array[i++] = data.labelWidth;
      array[i++] = data.labelHeight;
      array[i++] = POSITION_MODE_MAP[data.position];
      // Per-node backdrop style data
      array[i++] = data.backdropColor[0];
      array[i++] = data.backdropColor[1];
      array[i++] = data.backdropColor[2];
      array[i++] = data.backdropColor[3];
      array[i++] = data.backdropShadowColor[0];
      array[i++] = data.backdropShadowColor[1];
      array[i++] = data.backdropShadowColor[2];
      array[i++] = data.backdropShadowColor[3];
      array[i++] = data.backdropShadowBlur;
      array[i++] = data.backdropPadding;
    }

    setUniforms(params: RenderParams, programInfo: ProgramInfo): void {
      const { gl, uniformLocations } = programInfo;

      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
      gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      gl.uniform1f(uniformLocations.u_cameraAngle, params.cameraAngle);
      gl.uniform1f(uniformLocations.u_labelAngle, NodeHoverProgram.labelAngle);
      gl.uniform2f(uniformLocations.u_resolution, params.width * params.pixelRatio, params.height * params.pixelRatio);
      gl.uniform1f(uniformLocations.u_pixelRatio, params.pixelRatio);
      gl.uniform1f(uniformLocations.u_labelMargin, NodeHoverProgram.labelMargin);

      // Shape-specific uniforms (deduplicate across all shapes)
      const seenUniforms = new Set<string>();
      for (const shape of shapes) {
        for (const uniform of shape.uniforms) {
          if (!seenUniforms.has(uniform.name)) {
            seenUniforms.add(uniform.name);
            this.setTypedUniform(uniform, programInfo);
          }
        }
      }
    }
  };
}
