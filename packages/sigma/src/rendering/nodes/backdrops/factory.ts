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
import { BackdropOptions } from "../../../primitives/types";
import { colorToArray } from "../../../utils";
import { POSITION_MODE_MAP } from "../../glsl";
import { InstancedProgramDefinition, ProgramInfo } from "../../utils";
import { LabelOptions, SDFShape, isAttributeSource } from "../types";
import { BackdropDisplayData, BackdropProgram, BackdropProgramType } from "./base";
import { BackdropShaderOptions, generateBackdropShaders } from "./generator";

/** Resolved backdrop values for uniform-only mode */
export interface ResolvedBackdropDefaults {
  color: [number, number, number, number];
  shadowColor: [number, number, number, number];
  shadowBlur: number;
  padding: number;
}

/** Check if any backdrop option uses attribute binding */
function hasAttributeBackdrop(backdrop?: BackdropOptions): boolean {
  if (!backdrop) return false;
  return (
    isAttributeSource(backdrop.color) ||
    isAttributeSource(backdrop.shadowColor) ||
    isAttributeSource(backdrop.shadowBlur) ||
    isAttributeSource(backdrop.padding)
  );
}

/** Resolve constant backdrop values to RGBA arrays */
function resolveBackdropDefaults(backdrop?: BackdropOptions): ResolvedBackdropDefaults {
  const colorStr = (!backdrop?.color || isAttributeSource(backdrop.color)) ? "#ffffff" : backdrop.color;
  const shadowStr = (!backdrop?.shadowColor || isAttributeSource(backdrop.shadowColor)) ? "rgba(0,0,0,0.5)" : backdrop.shadowColor;
  const blur = (!backdrop?.shadowBlur || isAttributeSource(backdrop.shadowBlur)) ? 12 : backdrop.shadowBlur;
  const pad = (!backdrop?.padding || isAttributeSource(backdrop.padding)) ? 6 : backdrop.padding;

  const c = colorToArray(colorStr);
  const s = colorToArray(shadowStr);
  return {
    color: [c[0] / 255, c[1] / 255, c[2] / 255, c[3] / 255],
    shadowColor: [s[0] / 255, s[1] / 255, s[2] / 255, s[3] / 255],
    shadowBlur: blur,
    padding: pad,
  };
}

export interface CreateBackdropProgramOptions {
  shapes: SDFShape[];
  rotateWithCamera?: boolean;
  label?: LabelOptions;
  backdrop?: BackdropOptions;
}

export function createBackdropProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options: CreateBackdropProgramOptions): BackdropProgramType<N, E, G> {
  const { rotateWithCamera = false, label: labelOptions = {}, shapes, backdrop } = options;

  if (shapes.length === 0) {
    throw new Error("createBackdropProgram: at least one shape must be provided in 'shapes'");
  }

  const labelPosition: LabelPosition = labelOptions.position ?? "right";
  const labelMargin = labelOptions.margin ?? 1;
  const labelAngle = labelOptions.angle ?? 0;

  // Determine if backdrop needs per-node attributes or can use uniforms only
  const useBackdropAttributes = hasAttributeBackdrop(backdrop);
  const backdropDefaults = resolveBackdropDefaults(backdrop);

  const shaderOptions: BackdropShaderOptions = { shapes, rotateWithCamera, useBackdropAttributes };
  const generatedShaders = generateBackdropShaders(shaderOptions);

  type BackdropUniform = string;

  return class NodeBackdropProgram extends BackdropProgram<BackdropUniform, N, E, G> {
    static readonly programOptions = options;
    static readonly generatedShaders = generatedShaders;
    static readonly labelPosition = labelPosition;
    static readonly labelMargin = labelMargin;
    static readonly labelAngle = labelAngle;
    static readonly useBackdropAttributes = useBackdropAttributes;
    static readonly backdropDefaults = backdropDefaults;

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      super(gl, pickingBuffer, renderer);
    }

    getDefinition(): InstancedProgramDefinition<BackdropUniform> {
      const { FLOAT, TRIANGLE_STRIP } = WebGL2RenderingContext;

      const baseAttributes = [
        { name: "a_nodePosition", size: 2, type: FLOAT },
        { name: "a_nodeSize", size: 1, type: FLOAT },
        { name: "a_shapeId", size: 1, type: FLOAT },
        { name: "a_labelWidth", size: 1, type: FLOAT },
        { name: "a_labelHeight", size: 1, type: FLOAT },
        { name: "a_positionMode", size: 1, type: FLOAT },
      ];

      // Only include backdrop attributes when needed (saves 10 floats per node)
      const backdropAttrs = useBackdropAttributes
        ? [
            { name: "a_backdropColor", size: 4, type: FLOAT },
            { name: "a_backdropShadowColor", size: 4, type: FLOAT },
            { name: "a_backdropShadowBlur", size: 1, type: FLOAT },
            { name: "a_backdropPadding", size: 1, type: FLOAT },
          ]
        : [];

      return {
        VERTICES: 4,
        VERTEX_SHADER_SOURCE: generatedShaders.vertexShader,
        FRAGMENT_SHADER_SOURCE: generatedShaders.fragmentShader,
        METHOD: TRIANGLE_STRIP,
        UNIFORMS: generatedShaders.uniforms as BackdropUniform[],
        ATTRIBUTES: [...baseAttributes, ...backdropAttrs],
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

      // Only write backdrop data when using per-node attributes
      if (useBackdropAttributes) {
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
    }

    setUniforms(params: RenderParams, programInfo: ProgramInfo): void {
      const { gl, uniformLocations } = programInfo;

      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
      gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      gl.uniform1f(uniformLocations.u_cameraAngle, params.cameraAngle);
      gl.uniform1f(uniformLocations.u_labelAngle, NodeBackdropProgram.labelAngle);
      gl.uniform2f(uniformLocations.u_resolution, params.width * params.pixelRatio, params.height * params.pixelRatio);
      gl.uniform1f(uniformLocations.u_pixelRatio, params.pixelRatio);
      gl.uniform1f(uniformLocations.u_labelMargin, NodeBackdropProgram.labelMargin);

      // Backdrop uniforms (always set, shader uses them when no per-node attributes)
      const bd = backdropDefaults;
      gl.uniform4fv(uniformLocations.u_backdropColor, bd.color);
      gl.uniform4fv(uniformLocations.u_shadowColor, bd.shadowColor);
      gl.uniform1f(uniformLocations.u_shadowBlur, bd.shadowBlur);
      gl.uniform1f(uniformLocations.u_padding, bd.padding);

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
