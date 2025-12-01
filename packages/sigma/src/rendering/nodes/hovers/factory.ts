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
import { colorToArray } from "../../../utils";
import { POSITION_MODE_MAP } from "../../glsl";
import { InstancedProgramDefinition, ProgramInfo } from "../../utils";
import { LabelOptions, SDFShape } from "../types";
import { HoverDisplayData, HoverProgram, HoverProgramType } from "./base";
import { HoverShaderOptions, generateHoverShaders } from "./generator";

export interface HoverStyleOptions {
  backgroundColor?: string;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOpacity?: number;
  padding?: number;
}

export interface CreateHoverProgramOptions {
  shape: SDFShape;
  rotateWithCamera?: boolean;
  label?: LabelOptions;
  hover?: HoverStyleOptions;
}

export function createHoverProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: CreateHoverProgramOptions): HoverProgramType<N, E, G> {
  const { shape, rotateWithCamera = false, label: labelOptions = {}, hover: hoverOptions = {} } = options;

  const labelPosition: LabelPosition = labelOptions.position ?? "right";
  const labelMargin = labelOptions.margin ?? 1;
  const labelAngle = labelOptions.angle ?? 0;

  const backgroundColor = hoverOptions.backgroundColor ?? "#ffffff";
  const shadowColor = hoverOptions.shadowColor ?? "#000000";
  const shadowBlur = hoverOptions.shadowBlur ?? 8;
  const shadowOpacity = hoverOptions.shadowOpacity ?? 0.5;
  const padding = hoverOptions.padding ?? 2;

  const bgColorRGBA = colorToArray(backgroundColor);
  const shadowColorRGBA = colorToArray(shadowColor);

  const shaderOptions: HoverShaderOptions = { shape, rotateWithCamera };
  const generatedShaders = generateHoverShaders(shaderOptions);

  type HoverUniform = string;

  return class NodeHoverProgram extends HoverProgram<HoverUniform, N, E, G> {
    static readonly programOptions = options;
    static readonly generatedShaders = generatedShaders;
    static readonly labelPosition = labelPosition;
    static readonly labelMargin = labelMargin;
    static readonly labelAngle = labelAngle;
    static readonly padding = padding;
    static readonly shadowBlur = shadowBlur;

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
          { name: "a_labelWidth", size: 1, type: FLOAT },
          { name: "a_labelHeight", size: 1, type: FLOAT },
          { name: "a_positionMode", size: 1, type: FLOAT },
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
      array[i++] = data.labelWidth;
      array[i++] = data.labelHeight;
      array[i++] = POSITION_MODE_MAP[NodeHoverProgram.labelPosition];
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

      gl.uniform4fv(uniformLocations.u_backgroundColor, bgColorRGBA);
      gl.uniform4fv(uniformLocations.u_shadowColor, shadowColorRGBA);
      gl.uniform1f(uniformLocations.u_shadowOpacity, shadowOpacity);
      gl.uniform1f(uniformLocations.u_labelMargin, NodeHoverProgram.labelMargin);
      gl.uniform1f(uniformLocations.u_padding, NodeHoverProgram.padding);
      gl.uniform1f(uniformLocations.u_shadowBlur, NodeHoverProgram.shadowBlur);

      for (const uniform of shape.uniforms) {
        this.setTypedUniform(uniform, programInfo);
      }
    }
  };
}
