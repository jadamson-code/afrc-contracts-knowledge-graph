import { Attributes } from "graphology-types";
import { ProgramInfo } from "sigma/rendering";
import { RenderParams } from "sigma/types";
import { colorToArray } from "sigma/utils";

import { WebGLLayerDefinition, WebGLLayerProgram, WebGLLayerProgramType } from "../webgl-layer-program";
import getFragmentShader from "./shader-frag";
import { ColorLayerOptions, DEFAULT_COLOR_LAYER_OPTIONS } from "./types";

export * from "./types";
export { default as getColorFragmentShader } from "./shader-frag";

export type ColorLayerProgramType<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = WebGLLayerProgramType<N, E, G> & {
  setColor(color: string): void;
};

export function createColorLayerProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(options?: Partial<ColorLayerOptions>): ColorLayerProgramType<N, E, G> {
  const { color } = {
    ...DEFAULT_COLOR_LAYER_OPTIONS,
    ...(options || {}),
  };

  let [r, g, b, a] = colorToArray(color);

  const ProgramClass = class ColorLayerProgram extends WebGLLayerProgram<N, E, G> {
    getCustomLayerDefinition(): WebGLLayerDefinition {
      return {
        FRAGMENT_SHADER_SOURCE: getFragmentShader(),
        DATA_UNIFORMS: [],
        CAMERA_UNIFORMS: ["u_color"],
      };
    }

    cacheDataUniforms(_programInfo: ProgramInfo): void {
      // No data-dependent uniforms
    }

    setCameraUniforms(_params: RenderParams, { gl, uniformLocations }: ProgramInfo): void {
      gl.uniform4f(uniformLocations.u_color, r / 255, g / 255, b / 255, a / 255);
    }
  } as ColorLayerProgramType<N, E, G>;

  ProgramClass.setColor = (newColor: string) => {
    [r, g, b, a] = colorToArray(newColor);
  };

  return ProgramClass;
}
