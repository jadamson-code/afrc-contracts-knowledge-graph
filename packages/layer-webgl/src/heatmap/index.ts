import { Attributes } from "graphology-types";
import { colorToArray } from "sigma/utils";

import { createDensitySplatProgram } from "../density-splat-program";
import { WebGLLayerProgramType } from "../webgl-layer-program";
import getFragmentShader from "./shader-frag";
import { DEFAULT_HEATMAP_OPTIONS, HeatmapOptions } from "./types";

export * from "./types";

export function createHeatmapProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(nodes: string[], options?: Partial<HeatmapOptions>): WebGLLayerProgramType<N, E, G> {
  const { colorStops, radius, zoomToRadiusRatioFunction, shading, getWeight } = {
    ...DEFAULT_HEATMAP_OPTIONS,
    ...(options || {}),
  };

  const sortedStops = [...colorStops].sort((a, b) => a.value - b.value);

  const baseAngleRad = shading ? ((shading.lightAngle ?? 315) * Math.PI) / 180 : 0;

  function computeLightDir(angleRad: number): [number, number, number] {
    const lx = Math.sin(angleRad);
    const ly = Math.cos(angleRad);
    const lz = 1.0;
    const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
    return [lx / len, ly / len, lz / len];
  }

  return createDensitySplatProgram<N, E, G>(
    nodes,
    { radius, zoomToRadiusRatioFunction, getWeight },
    {
      definition: {
        FRAGMENT_SHADER_SOURCE: getFragmentShader({ colorStops: sortedStops, shading }),
        DATA_UNIFORMS: [
          "u_densityTexture",
          ...sortedStops.map((_, i) => `u_stopColor_${i}`),
          ...(shading ? ["u_shadingIntensity", "u_specular", "u_shininess", "u_smoothing"] : []),
        ],
        CAMERA_UNIFORMS: shading ? ["u_lightDir"] : [],
      },
      cacheUniforms: ({ gl, uniformLocations }) => {
        gl.uniform1i(uniformLocations.u_densityTexture, 0);

        sortedStops.forEach(({ color }, i) => {
          const [r, g, b, a] = colorToArray(color);
          gl.uniform4f(uniformLocations[`u_stopColor_${i}`], r / 255, g / 255, b / 255, a / 255);
        });

        if (shading) {
          gl.uniform1f(uniformLocations.u_shadingIntensity, shading.intensity ?? 0.5);
          gl.uniform1f(uniformLocations.u_specular, shading.specular ?? 0.2);
          gl.uniform1f(uniformLocations.u_shininess, shading.shininess ?? 16);
          gl.uniform1f(uniformLocations.u_smoothing, shading.smoothing ?? 3);
        }
      },
      setCameraUniforms: shading
        ? (params, { gl, uniformLocations }) => {
            const angle = (shading.rotateWithCamera ?? true) ? baseAngleRad : baseAngleRad + params.cameraAngle;
            const dir = computeLightDir(angle);
            gl.uniform3f(uniformLocations.u_lightDir, dir[0], dir[1], dir[2]);
          }
        : undefined,
    },
  );
}
