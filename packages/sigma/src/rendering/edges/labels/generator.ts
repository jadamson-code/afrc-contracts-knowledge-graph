/**
 * Sigma.js Edge Label Shader Generator
 * =====================================
 *
 * Generates GLSL shaders for edge label rendering.
 * Labels are positioned along the edge path (midpoint for straight edges,
 * curve-following for curved edges).
 *
 * @module
 */
import { EdgePath } from "../types";

// ============================================================================
// Types
// ============================================================================

export interface GeneratedEdgeLabelShaders {
  vertexShader: string;
  fragmentShader: string;
  uniforms: string[];
}

export interface EdgeLabelShaderOptions {
  /** The path type for positioning labels along the edge */
  path: EdgePath;
}

// ============================================================================
// Vertex Shader Generation
// ============================================================================

/**
 * Generates the vertex shader for edge label rendering.
 *
 * TODO: Implement vertex shader that:
 * 1. Computes the character's position along the path (using arc distance)
 * 2. Gets the tangent at that point for rotation
 * 3. Positions the character quad accordingly
 */
export function generateEdgeLabelVertexShader(_options: EdgeLabelShaderOptions): string {
  // TODO: Implement vertex shader
  // language=GLSL
  return /*glsl*/ `#version 300 es
void main() {
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
`;
}

// ============================================================================
// Fragment Shader Generation
// ============================================================================

/**
 * Generates the fragment shader for SDF-based text rendering.
 *
 * TODO: Implement fragment shader for SDF text rendering
 */
export function generateEdgeLabelFragmentShader(): string {
  // TODO: Implement fragment shader
  // language=GLSL
  return /*glsl*/ `#version 300 es
precision highp float;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPicking;

void main() {
  discard;
}
`;
}

// ============================================================================
// Uniform Collection
// ============================================================================

export function collectEdgeLabelUniforms(): string[] {
  // TODO: Define proper uniforms
  return ["u_matrix"];
}

// ============================================================================
// Main Generator Function
// ============================================================================

export function generateEdgeLabelShaders(options: EdgeLabelShaderOptions): GeneratedEdgeLabelShaders {
  return {
    vertexShader: generateEdgeLabelVertexShader(options),
    fragmentShader: generateEdgeLabelFragmentShader(),
    uniforms: collectEdgeLabelUniforms(),
  };
}
