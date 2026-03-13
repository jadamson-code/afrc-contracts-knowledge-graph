import { Attributes } from "graphology-types";
import Sigma from "sigma";
import { loadFragmentShader, loadProgram, loadVertexShader, ProgramInfo } from "sigma/rendering";
import { RenderParams } from "sigma/types";
import { colorToArray } from "sigma/utils";

import { QUAD_VERTICES, WebGLLayerDefinition, WebGLLayerProgram, WebGLLayerProgramType } from "../webgl-layer-program";
import getFragmentShader from "./shader-frag";
import getSplatFragmentShader from "./shader-splat-frag";
import getSplatVertexShader from "./shader-splat-vert";
import { ContoursOptions, DEFAULT_CONTOURS_OPTIONS } from "./types";

export * from "./types";
export { default as getContoursFragmentShader } from "./shader-frag";

const QUAD_VERTICES_F32 = new Float32Array(QUAD_VERTICES);

export function createContoursProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(nodes: string[], options?: Partial<ContoursOptions>): WebGLLayerProgramType<N, E, G> {
  const { levels, radius, zoomToRadiusRatioFunction, border, feather } = {
    ...DEFAULT_CONTOURS_OPTIONS,
    ...(options || {}),
  };

  return class ContoursProgramClass<
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  > extends WebGLLayerProgram<N, E, G> {
    // Node data texture (RG32F, positions)
    nodesTexture: WebGLTexture;
    nodesPositionArray = new Float32Array(nodes.length * 2);
    nodeCount = 0;

    // Splat pass resources
    splatProgram: WebGLProgram;
    splatBuffer: WebGLBuffer;
    splatPositionLocation: number;
    splatUniforms: Record<string, WebGLUniformLocation>;

    // Intermediate density framebuffer
    densityFBO: WebGLFramebuffer;
    densityTexture: WebGLTexture;
    densityWidth = 0;
    densityHeight = 0;

    constructor(
      gl: WebGL2RenderingContext,
      pickingBuffer: WebGLFramebuffer | null,
      renderer: Sigma<N, E, G>,
    ) {
      super(gl, pickingBuffer, renderer);

      // R32F render target requires this extension
      if (!gl.getExtension("EXT_color_buffer_float")) {
        throw new Error("createContoursProgram: EXT_color_buffer_float extension is required but not available");
      }

      // All texture operations use unit 0 to avoid corrupting sigma's data texture bindings
      gl.activeTexture(gl.TEXTURE0);

      // Node positions texture
      this.nodesTexture = gl.createTexture() as WebGLTexture;
      gl.bindTexture(gl.TEXTURE_2D, this.nodesTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      // Splat program (density accumulation pass)
      const splatVS = loadVertexShader(gl, getSplatVertexShader());
      const splatFS = loadFragmentShader(gl, getSplatFragmentShader());
      this.splatProgram = loadProgram(gl, [splatVS, splatFS]);
      gl.deleteShader(splatVS);
      gl.deleteShader(splatFS);

      this.splatPositionLocation = gl.getAttribLocation(this.splatProgram, "a_position");
      this.splatUniforms = {
        u_nodesTexture: gl.getUniformLocation(this.splatProgram, "u_nodesTexture")!,
        u_matrix: gl.getUniformLocation(this.splatProgram, "u_matrix")!,
        u_radius: gl.getUniformLocation(this.splatProgram, "u_radius")!,
        u_correctionRatio: gl.getUniformLocation(this.splatProgram, "u_correctionRatio")!,
        u_zoomModifier: gl.getUniformLocation(this.splatProgram, "u_zoomModifier")!,
      };

      // Splat quad vertex buffer
      this.splatBuffer = gl.createBuffer() as WebGLBuffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.splatBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES_F32, gl.STATIC_DRAW);

      // Set constant sampler uniform
      gl.useProgram(this.splatProgram);
      gl.uniform1i(this.splatUniforms.u_nodesTexture, 0);

      // Density framebuffer + texture
      this.densityFBO = gl.createFramebuffer() as WebGLFramebuffer;
      this.densityTexture = gl.createTexture() as WebGLTexture;
      gl.bindTexture(gl.TEXTURE_2D, this.densityTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    private updateNodesPositionData(): void {
      let count = 0;
      for (const n of nodes) {
        const pos = this.renderer.getNodeDisplayData(n);
        if (!pos) {
          console.warn(`createContoursProgram: Node "${n}" not found, skipping`);
          continue;
        }
        this.nodesPositionArray[count * 2] = pos.x;
        this.nodesPositionArray[count * 2 + 1] = pos.y;
        count++;
      }
      this.nodeCount = count;
    }

    private ensureDensityTextureSize(width: number, height: number) {
      if (this.densityWidth === width && this.densityHeight === height) return;

      const gl = this.normalProgram.gl;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.densityTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.densityFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.densityTexture, 0);

      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`createContoursProgram: density framebuffer incomplete (status 0x${status.toString(16)})`);
      }

      this.densityWidth = width;
      this.densityHeight = height;
    }

    // Offscreen density splatting — called by sigma before the depth loop.
    // Sigma restores framebuffer, viewport, and blend state after all preRender calls.
    preRender(params: RenderParams): void {
      if (this.nodeCount === 0) return;

      const gl = this.normalProgram.gl;
      const canvas = gl.canvas as HTMLCanvasElement;

      this.ensureDensityTextureSize(canvas.width, canvas.height);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.densityFBO);
      gl.viewport(0, 0, this.densityWidth, this.densityHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      gl.useProgram(this.splatProgram);

      gl.uniformMatrix3fv(this.splatUniforms.u_matrix, false, params.matrix);
      gl.uniform1f(this.splatUniforms.u_correctionRatio, params.correctionRatio);
      gl.uniform1f(this.splatUniforms.u_zoomModifier, 1 / zoomToRadiusRatioFunction(params.zoomRatio));

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.nodesTexture);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.splatBuffer);
      gl.enableVertexAttribArray(this.splatPositionLocation);
      gl.vertexAttribPointer(this.splatPositionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodeCount);

      gl.disableVertexAttribArray(this.splatPositionLocation);
    }

    // On-screen contour coloring — called at the right depth position in the loop
    render(params: RenderParams): void {
      const gl = this.normalProgram.gl;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.densityTexture);

      this.bindProgram(this.normalProgram);
      this.renderProgram(params, this.normalProgram);
      this.unbindProgram(this.normalProgram);
    }

    getCustomLayerDefinition(): WebGLLayerDefinition {
      return {
        FRAGMENT_SHADER_SOURCE: getFragmentShader({ levels, border, feather }),
        DATA_UNIFORMS: [
          "u_densityTexture",
          ...levels.map((_, i) => `u_levelColor_${i + 1}`),
          ...(border ? ["u_borderColor"] : []),
        ],
        CAMERA_UNIFORMS: [],
      };
    }

    setCameraUniforms() {
      // No camera uniforms needed for the contour pass — density is already in screen space
    }

    cacheDataUniforms({ gl, uniformLocations }: ProgramInfo) {
      // Contour program: density sampler + level colors
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
    }

    cacheData(): void {
      // Set contour program uniforms (density sampler + level colors)
      super.cacheData();

      // Set splat program uniforms (radius + node positions)
      const gl = this.normalProgram.gl;
      gl.useProgram(this.splatProgram);
      gl.uniform1f(this.splatUniforms.u_radius, radius);

      this.updateNodesPositionData();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.nodesTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        WebGL2RenderingContext.RG32F,
        this.nodeCount,
        1,
        0,
        WebGL2RenderingContext.RG,
        gl.FLOAT,
        this.nodesPositionArray.subarray(0, this.nodeCount * 2),
      );

      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    kill() {
      const gl = this.normalProgram.gl;
      gl.deleteProgram(this.splatProgram);
      gl.deleteBuffer(this.splatBuffer);
      gl.deleteTexture(this.densityTexture);
      gl.deleteFramebuffer(this.densityFBO);
      gl.deleteTexture(this.nodesTexture);
      super.kill();
    }
  };
}
