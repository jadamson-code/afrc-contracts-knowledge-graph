import { Attributes } from "graphology-types";
import { ProgramInfo } from "sigma/rendering";
import { colorToArray } from "sigma/utils";

import { createDensitySplatProgram } from "../density-splat-program";
import { WebGLLayerProgramType } from "../webgl-layer-program";
import getFragmentShader from "./shader-frag";
import { ContoursOptions, DEFAULT_CONTOURS_OPTIONS } from "./types";

export * from "./types";
export { default as getContoursFragmentShader } from "./shader-frag";

export function createContoursProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(nodes: string[], options?: Partial<ContoursOptions>): WebGLLayerProgramType<N, E, G> {
  const { levels, radius, zoomToRadiusRatioFunction, border, feather, getWeight } = {
    ...DEFAULT_CONTOURS_OPTIONS,
    ...(options || {}),
  };

  return createDensitySplatProgram<N, E, G>(
    nodes,
    { radius, zoomToRadiusRatioFunction, getWeight },
    {
      definition: {
        FRAGMENT_SHADER_SOURCE: getFragmentShader({ levels, border, feather }),
        DATA_UNIFORMS: [
          "u_densityTexture",
          ...levels.map((_, i) => `u_levelColor_${i + 1}`),
          ...(border ? ["u_borderColor"] : []),
        ],
        CAMERA_UNIFORMS: [],
      },
      cacheUniforms: ({ gl, uniformLocations }: ProgramInfo) => {
        gl.uniform1i(uniformLocations.u_densityTexture, 0);

        levels.forEach(({ color }, i) => {
          const location = uniformLocations[`u_levelColor_${i + 1}`];
          const [r, g, b, a] = colorToArray(color || "#0000");
          gl.uniform4f(location, r / 255, g / 255, b / 255, a / 255);
        });

        if (border) {
          const [r, g, b, a] = colorToArray(border.color);
          gl.uniform4f(uniformLocations.u_borderColor, r / 255, g / 255, b / 255, a / 255);
        }
      },
    },
  );
}
