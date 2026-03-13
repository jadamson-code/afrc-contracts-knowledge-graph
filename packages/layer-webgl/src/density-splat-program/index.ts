import { Attributes } from "graphology-types";
import Sigma from "sigma";
import { ProgramInfo, loadFragmentShader, loadProgram, loadVertexShader } from "sigma/rendering";
import { RenderParams } from "sigma/types";

import { QUAD_VERTICES, WebGLLayerDefinition, WebGLLayerProgram, WebGLLayerProgramType } from "../webgl-layer-program";
import getSplatFragmentShader from "./shader-splat-frag";
import getSplatVertexShader from "./shader-splat-vert";

const QUAD_VERTICES_F32 = new Float32Array(QUAD_VERTICES);

/**
 * Factory that creates a WebGL layer program class with built-in density splatting.
 *
 * The splat pass renders each node as a smooth gaussian-like circle into an offscreen
 * R32F texture using additive blending, producing a density field. The coloring pass
 * then reads this density texture and maps it to colors via the provided fragment shader.
 *
 * Subclasses (contours, heatmap, etc.) only need to provide the coloring strategy:
 * a fragment shader that reads `u_densityTexture` and the uniforms to set.
 */
export function createDensitySplatProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(
  nodes: string[],
  options: {
    radius: number;
    zoomToRadiusRatioFunction: (ratio: number) => number;
    getWeight?: (node: string) => number;
  },
  coloring: {
    definition: WebGLLayerDefinition;
    cacheUniforms: (programInfo: ProgramInfo) => void;
    setCameraUniforms?: (params: RenderParams, programInfo: ProgramInfo) => void;
  },
): WebGLLayerProgramType<N, E, G> {
  const { radius, zoomToRadiusRatioFunction, getWeight } = options;

  return class DensitySplatProgramClass<
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  > extends WebGLLayerProgram<N, E, G> {
    // Node data texture (RGB32F: x, y, weight), laid out in rows of nodesTextureWidth
    nodesTexture: WebGLTexture;
    nodesTextureWidth: number;
    nodesDataArray: Float32Array;
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

    constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
      super(gl, pickingBuffer, renderer);

      // R32F render target requires this extension
      if (!gl.getExtension("EXT_color_buffer_float")) {
        throw new Error("createDensitySplatProgram: EXT_color_buffer_float extension is required");
      }

      // All texture operations use unit 0 to avoid corrupting sigma's data texture bindings
      gl.activeTexture(gl.TEXTURE0);

      // Node data texture (positions + weights), packed into rows to respect MAX_TEXTURE_SIZE
      this.nodesTextureWidth = Math.min(nodes.length || 1, gl.getParameter(gl.MAX_TEXTURE_SIZE));
      this.nodesDataArray = new Float32Array(nodes.length * 3);
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
        u_nodesTextureWidth: gl.getUniformLocation(this.splatProgram, "u_nodesTextureWidth")!,
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

    private updateNodesData(): void {
      let count = 0;
      for (const n of nodes) {
        const pos = this.renderer.getNodeDisplayData(n);
        if (!pos) continue;
        this.nodesDataArray[count * 3] = pos.x;
        this.nodesDataArray[count * 3 + 1] = pos.y;
        this.nodesDataArray[count * 3 + 2] = getWeight ? getWeight(n) : 1;
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
        throw new Error(`Density framebuffer incomplete (status 0x${status.toString(16)})`);
      }

      this.densityWidth = width;
      this.densityHeight = height;
    }

    getCustomLayerDefinition(): WebGLLayerDefinition {
      return coloring.definition;
    }

    setCameraUniforms(params: RenderParams, programInfo: ProgramInfo) {
      if (coloring.setCameraUniforms) coloring.setCameraUniforms(params, programInfo);
    }

    cacheDataUniforms(programInfo: ProgramInfo) {
      coloring.cacheUniforms(programInfo);
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

    render(params: RenderParams): void {
      const gl = this.normalProgram.gl;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.densityTexture);

      this.bindProgram(this.normalProgram);
      this.renderProgram(params, this.normalProgram);
      this.unbindProgram(this.normalProgram);
    }

    cacheData(): void {
      super.cacheData();

      const gl = this.normalProgram.gl;
      gl.useProgram(this.splatProgram);
      gl.uniform1f(this.splatUniforms.u_radius, radius);
      gl.uniform1i(this.splatUniforms.u_nodesTextureWidth, this.nodesTextureWidth);

      this.updateNodesData();

      // Pack node data into a 2D texture with rows of nodesTextureWidth
      const w = this.nodesTextureWidth;
      const h = Math.ceil(this.nodeCount / w) || 1;
      const texData = this.nodesDataArray.subarray(0, this.nodeCount * 3);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.nodesTexture);

      // Pad to full rows if needed (texImage2D requires width×height pixels)
      const fullSize = w * h * 3;
      if (this.nodeCount * 3 < fullSize) {
        const padded = new Float32Array(fullSize);
        padded.set(texData);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, w, h, 0, gl.RGB, gl.FLOAT, padded);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, w, h, 0, gl.RGB, gl.FLOAT, texData);
      }

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
