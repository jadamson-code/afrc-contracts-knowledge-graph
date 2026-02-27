/**
 * Sigma.js Backdrop Program Factory
 * ==================================
 *
 * Factory function that creates a BackdropProgram class from an SDF shape definition.
 * The resulting backdrop program renders the union of an enlarged node shape and a
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
import { BackdropDisplayData, BackdropProgram, BackdropProgramType } from "./base";
import { BackdropShaderOptions, generateBackdropShaders } from "./generator";

export interface CreateBackdropProgramOptions {
  shapes: SDFShape[];
  rotateWithCamera?: boolean;
  label?: LabelOptions;
  /** Maps local shape index to global shape ID (for multi-shape programs). */
  shapeGlobalIds?: number[];
}

export function createBackdropProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: CreateBackdropProgramOptions): BackdropProgramType<N, E, G> {
  const { rotateWithCamera = false, label: labelOptions = {}, shapes, shapeGlobalIds } = options;

  if (shapes.length === 0) {
    throw new Error("createBackdropProgram: at least one shape must be provided in 'shapes'");
  }

  const labelPosition: LabelPosition = labelOptions.position ?? "right";
  const labelMargin = labelOptions.margin ?? 5;
  const zoomToLabelSizeRatioFunction = labelOptions.zoomToLabelSizeRatioFunction ?? (() => 1);

  const shaderOptions: BackdropShaderOptions = { shapes, rotateWithCamera, shapeGlobalIds };
  const generatedShaders = generateBackdropShaders(shaderOptions);

  type BackdropUniform = string;

  return class NodeBackdropProgram extends BackdropProgram<BackdropUniform, N, E, G> {
    static readonly programOptions = options;
    static readonly generatedShaders = generatedShaders;
    static readonly labelPosition = labelPosition;
    static readonly labelMargin = labelMargin;

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      super(gl, pickingBuffer, renderer);
    }

    getDefinition(): InstancedProgramDefinition<BackdropUniform> {
      const { FLOAT, TRIANGLE_STRIP } = WebGL2RenderingContext;

      return {
        VERTICES: 4,
        VERTEX_SHADER_SOURCE: generatedShaders.vertexShader,
        FRAGMENT_SHADER_SOURCE: generatedShaders.fragmentShader,
        METHOD: TRIANGLE_STRIP,
        UNIFORMS: generatedShaders.uniforms as BackdropUniform[],
        ATTRIBUTES: [
          { name: "a_nodePosition", size: 2, type: FLOAT },
          { name: "a_nodeSize", size: 1, type: FLOAT },
          { name: "a_shapeId", size: 1, type: FLOAT },
          { name: "a_labelWidth", size: 1, type: FLOAT },
          { name: "a_labelHeight", size: 1, type: FLOAT },
          { name: "a_positionMode", size: 1, type: FLOAT },
          { name: "a_labelAngle", size: 1, type: FLOAT },
          { name: "a_backdropColor", size: 4, type: FLOAT },
          { name: "a_backdropShadowColor", size: 4, type: FLOAT },
          { name: "a_backdropShadowBlur", size: 1, type: FLOAT },
          { name: "a_backdropPadding", size: 1, type: FLOAT },
          { name: "a_backdropBorderColor", size: 4, type: FLOAT },
          // Packed: [borderWidth, cornerRadius, labelPadding, area]
          { name: "a_backdropExtra", size: 4, type: FLOAT },
        ],
        CONSTANT_ATTRIBUTES: [{ name: "a_quadCorner", size: 2, type: FLOAT }],
        CONSTANT_DATA: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      };
    }

    processBackdrop(offset: number, data: BackdropDisplayData): void {
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
      array[i++] = data.labelAngle;
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
      array[i++] = data.backdropBorderColor[0];
      array[i++] = data.backdropBorderColor[1];
      array[i++] = data.backdropBorderColor[2];
      array[i++] = data.backdropBorderColor[3];
      // Packed vec4: [borderWidth, cornerRadius, labelPadding, area]
      array[i++] = data.backdropBorderWidth;
      array[i++] = data.backdropCornerRadius;
      array[i++] = data.backdropLabelPadding;
      array[i++] = data.backdropArea;
    }

    setUniforms(params: RenderParams, programInfo: ProgramInfo): void {
      const { gl, uniformLocations } = programInfo;

      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
      gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      gl.uniform1f(uniformLocations.u_cameraAngle, params.cameraAngle);
      gl.uniform2f(uniformLocations.u_resolution, params.width * params.pixelRatio, params.height * params.pixelRatio);
      gl.uniform1f(uniformLocations.u_pixelRatio, params.pixelRatio);
      gl.uniform1f(uniformLocations.u_labelMargin, NodeBackdropProgram.labelMargin);

      // Zoom-dependent label size ratio
      gl.uniform1f(
        uniformLocations.u_zoomLabelSizeRatio,
        1 / zoomToLabelSizeRatioFunction(params.zoomRatio),
      );

      // Shape-specific uniforms
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
