import { Attributes } from "graphology-types";
import Sigma from "sigma";
import { Program, ProgramDefinition, type ProgramInfo } from "sigma/rendering";
import { RenderParams } from "sigma/types";

import getVertexShader from "./shader-vert";

export const QUAD_VERTICES = [-1, 1, 1, 1, -1, -1, 1, -1];
const QUAD_VERTICES_F32 = new Float32Array(QUAD_VERTICES);

export type WebGLLayerDefinition = {
  FRAGMENT_SHADER_SOURCE: string;
  DATA_UNIFORMS: string[];
  CAMERA_UNIFORMS: string[];
};

/**
 * Base class for fullscreen-quad WebGL layer programs.
 *
 * Subclasses implement:
 * - `getCustomLayerDefinition()` — fragment shader + uniform declarations
 * - `setCameraUniforms()` — per-frame camera/view uniforms
 * - `cacheDataUniforms()` — data-dependent uniforms (called when the graph changes)
 */
export abstract class WebGLLayerProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends Program<string, N, E, G> {
  // Methods to implement:
  abstract cacheDataUniforms(programInfo: ProgramInfo): void;
  abstract setCameraUniforms(params: RenderParams, programInfo: ProgramInfo): void;
  abstract getCustomLayerDefinition(): WebGLLayerDefinition;

  constructor(gl: WebGL2RenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: Sigma<N, E, G>) {
    super(gl, pickingBuffer, renderer);
    this.verticesCount = QUAD_VERTICES.length / 2;

    // Upload quad vertices once (they never change)
    const { buffer } = this.normalProgram;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES_F32, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  // Internal rendering management overrides:
  getDefinition(): ProgramDefinition<string> {
    const { FRAGMENT_SHADER_SOURCE, CAMERA_UNIFORMS, DATA_UNIFORMS } = this.getCustomLayerDefinition();

    return {
      UNIFORMS: [...CAMERA_UNIFORMS, ...DATA_UNIFORMS],
      FRAGMENT_SHADER_SOURCE,
      VERTEX_SHADER_SOURCE: getVertexShader(),
      VERTICES: 4,
      METHOD: WebGL2RenderingContext.TRIANGLE_STRIP,
      ATTRIBUTES: [{ name: "a_position", size: 2, type: WebGL2RenderingContext.FLOAT }],
    };
  }
  hasNothingToRender() {
    return false;
  }
  setUniforms(params: RenderParams, programInfo: ProgramInfo) {
    this.setCameraUniforms(params, programInfo);
  }

  // Called by sigma when graph data changes. Binds the normal program, delegates to cacheDataUniforms.
  // Subclasses with additional programs (e.g. splat pass) can override this to set their own uniforms.
  cacheData(): void {
    const { gl } = this.normalProgram;
    gl.useProgram(this.normalProgram.program);
    this.cacheDataUniforms(this.normalProgram);
  }

  render(params: RenderParams): void {
    this.bindProgram(this.normalProgram);
    this.renderProgram(params, this.normalProgram);
    this.unbindProgram(this.normalProgram);
  }
  drawWebGL(method: number, { gl }: ProgramInfo): void {
    gl.drawArrays(method, 0, QUAD_VERTICES.length / 2);
  }
  protected bindProgram(program: ProgramInfo): void {
    const { gl, buffer } = program;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    let offset = 0;
    this.ATTRIBUTES.forEach((attr) => (offset += this.bindAttribute(attr, program, offset)));
  }
}

export type WebGLLayerProgramType<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = new (
  gl: WebGL2RenderingContext,
  pickingBuffer: WebGLFramebuffer | null,
  renderer: Sigma<N, E, G>,
) => WebGLLayerProgram<N, E, G>;
