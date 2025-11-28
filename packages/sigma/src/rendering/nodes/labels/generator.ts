/**
 * Sigma.js Label Shader Generator
 * ================================
 *
 * Generates GLSL shaders for label programs that use the node shape's SDF
 * for accurate label positioning relative to any node shape.
 *
 * ## Architecture Overview
 *
 * The composed label system allows labels to be positioned accurately next to
 * nodes of any shape (circle, square, triangle, etc.) by embedding the shape's
 * SDF function directly into the label vertex shader.
 *
 * ### Key Concepts:
 *
 * 1. **Shape-aware positioning**: Instead of assuming all nodes are circles,
 *    the shader uses the actual SDF to find where the node edge is in any direction.
 *
 * 2. **Binary search for edge detection**: The `findEdgeDistance()` function
 *    performs a binary search along a ray from the node center to find the exact
 *    point where the SDF crosses zero (the shape boundary).
 *
 * 3. **Camera rotation handling**: When `rotateWithCamera` is false (default),
 *    labels stay screen-aligned but must account for camera rotation when
 *    computing the shape edge direction.
 *
 * @module
 */
import { SDFShape } from "../types";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of shader generation containing all code and metadata.
 */
export interface GeneratedLabelShaders {
  /** Complete vertex shader GLSL source code */
  vertexShader: string;
  /** Complete fragment shader GLSL source code */
  fragmentShader: string;
  /** List of uniform names required by the shader */
  uniforms: string[];
}

/**
 * Options for label shader generation.
 */
export interface LabelShaderOptions {
  /** The SDF shape definition (must match the node's shape) */
  shape: SDFShape;
  /** Whether nodes rotate with the camera (affects edge direction computation) */
  rotateWithCamera?: boolean;
}

// ============================================================================
// Vertex Shader Generation
// ============================================================================

/**
 * Generates the vertex shader for shape-aware label positioning.
 *
 * ## Coordinate Systems
 *
 * The shader works with multiple coordinate systems:
 *
 * 1. **Graph space**: Original node positions (a_anchorPosition)
 * 2. **Clip space**: After transformation by u_matrix, range [-1, 1]
 * 3. **Screen pixels**: Actual pixel positions on screen
 * 4. **Normalized SDF space**: Shape fits in [-1, 1], used for edge detection
 *
 * ## Vertex Attributes
 *
 * Per-character (instanced):
 * - `a_anchorPosition`: Node center in graph coordinates
 * - `a_charOffset`: Character offset from label origin in pixels
 * - `a_charSize`: Character glyph dimensions in pixels
 * - `a_texCoords`: Glyph position and size in atlas texture
 * - `a_color`: Text color (packed RGBA)
 * - `a_nodeSize`: Node size in graph coordinates
 * - `a_margin`: Gap between node edge and label in pixels
 * - `a_positionMode`: Label position (0=right, 1=left, 2=above, 3=below, 4=over)
 *
 * Per-vertex (constant):
 * - `a_quadCorner`: Quad corner position [-1,-1], [1,-1], [-1,1], [1,1]
 */
export function generateLabelVertexShader(options: LabelShaderOptions): string {
  const { shape, rotateWithCamera = false } = options;

  // Build shape function name and call expression
  const shapeFunctionName = `sdf_${shape.name}`;
  const shapeUniformDeclarations = shape.uniforms.map((u) => `uniform ${u.type} ${u.name};`).join("\n");
  const shapeUniformParams = shape.uniforms.map((u) => u.name).join(", ");
  const shapeCall = shapeUniformParams
    ? `${shapeFunctionName}(uv, size, ${shapeUniformParams})`
    : `${shapeFunctionName}(uv, size)`;

  // Generate camera rotation handling code
  // The SDF is always in shape-local space, so we always need to counter-rotate
  // the screen-space direction to query the SDF correctly
  const labelDirectionCode = `  // Counter-rotate to convert screen direction to shape-local direction
  float c = cos(cameraAngle);
  float s = sin(cameraAngle);
  return mat2(c, -s, s, c) * dir;`;

  const positionOffsetRotationCode = rotateWithCamera
    ? `  // Nodes rotate with camera: position offset stays in shape space`
    : `  // Counter-rotate position offset back to screen space
  float c = cos(u_cameraAngle);
  float s = sin(u_cameraAngle);
  positionOffset = mat2(c, s, -s, c) * positionOffset;`;

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

// ============================================================================
// Per-character attributes (instanced rendering - one instance per character)
// ============================================================================
in vec2 a_anchorPosition;    // Node center position in graph space
in vec2 a_charOffset;        // Character offset from label origin (pixels)
in vec2 a_charSize;          // Character glyph dimensions (pixels)
in vec4 a_texCoords;         // Atlas texture coords: (x, y, width, height) in pixels
in vec4 a_color;             // Text color (packed RGBA as single float)
in float a_nodeSize;         // Node size in graph coordinates
in float a_margin;           // Gap between node boundary and label (pixels)
in float a_positionMode;     // Label position: 0=right, 1=left, 2=above, 3=below, 4=over

// ============================================================================
// Per-vertex attributes (constant - defines the character quad)
// ============================================================================
in vec2 a_quadCorner;        // Quad corner: [-1,-1], [1,-1], [-1,1], [1,1]

// ============================================================================
// Uniforms
// ============================================================================

// Transform uniforms
uniform mat3 u_matrix;           // Graph-to-clip-space transformation matrix
uniform float u_sizeRatio;       // Camera zoom ratio
uniform float u_correctionRatio; // Size correction for consistent appearance
uniform float u_cameraAngle;     // Camera rotation angle in radians

// Label rendering uniforms
uniform vec2 u_resolution;       // Viewport dimensions in pixels
uniform vec2 u_atlasSize;        // Glyph atlas texture dimensions in pixels

// Shape-specific uniforms (for SDF edge detection)
${shapeUniformDeclarations}

// ============================================================================
// Varyings (passed to fragment shader)
// ============================================================================
out vec2 v_texCoord;             // Texture coordinate for glyph sampling
out vec4 v_color;                // Text color

// ============================================================================
// Constants
// ============================================================================
const float bias = 255.0 / 254.0;  // Color bias to avoid precision issues

// ============================================================================
// Shape SDF Function (embedded from shape definition)
// ============================================================================
${shape.glsl}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find the distance from node center to shape edge along a given direction.
 *
 * Uses binary search to find where the SDF equals zero (the shape boundary).
 * The search starts at the center (definitely inside) and extends outward
 * until it finds the edge.
 *
 * @param direction Unit vector indicating the search direction
 * @param size Shape size in normalized space (typically 1.0)
 * @return Distance from center to edge along the direction
 */
float findEdgeDistance(vec2 direction, float size) {
  float lo = 0.0;           // Start: definitely inside the shape
  float hi = size * 1.5;    // End: definitely outside the shape

  // Binary search: 10 iterations gives ~1000x precision improvement
  for (int i = 0; i < 10; i++) {
    float mid = (lo + hi) * 0.5;
    vec2 uv = direction * mid;
    float d = ${shapeCall};

    if (d < 0.0) {
      lo = mid;  // Point is inside shape, search further out
    } else {
      hi = mid;  // Point is outside shape, search closer in
    }
  }

  return (lo + hi) * 0.5;
}

/**
 * Get the direction vector for label positioning based on position mode.
 *
 * @param positionMode Label position (0=right, 1=left, 2=above, 3=below, 4=over)
 * @param cameraAngle Current camera rotation angle
 * @return Unit vector pointing from node center toward label position
 */
vec2 getLabelDirection(float positionMode, float cameraAngle) {
  vec2 dir;

  // Determine base direction based on position mode
  if (positionMode < 0.5) {
    dir = vec2(1.0, 0.0);   // Right
  } else if (positionMode < 1.5) {
    dir = vec2(-1.0, 0.0);  // Left
  } else if (positionMode < 2.5) {
    dir = vec2(0.0, 1.0);   // Above (positive Y in graph space)
  } else if (positionMode < 3.5) {
    dir = vec2(0.0, -1.0);  // Below (negative Y in graph space)
  } else {
    return vec2(0.0);       // Over: centered on node, no direction needed
  }

${labelDirectionCode}
}

// ============================================================================
// Main Vertex Shader
// ============================================================================
void main() {
  // -------------------------------------------------------------------------
  // Step 1: Transform node position to clip space
  // -------------------------------------------------------------------------
  vec3 anchorClip = u_matrix * vec3(a_anchorPosition, 1.0);

  // -------------------------------------------------------------------------
  // Step 2: Convert node size from graph coordinates to screen pixels
  // -------------------------------------------------------------------------
  // The node size formula (a_nodeSize * u_correctionRatio / u_sizeRatio * 2.0)
  // gives a value in graph space that becomes correct NDC after matrix transform.
  // We need to apply the matrix scale to get actual NDC, then convert to pixels.
  //
  // Extract the scale factor from the transformation matrix:
  // For a 2D matrix, the X scale is the length of the first column vector.
  float matrixScaleX = length(vec2(u_matrix[0][0], u_matrix[1][0]));

  // Calculate node radius: graph space -> NDC (via matrix scale) -> pixels
  float nodeRadiusGraphSpace = a_nodeSize * u_correctionRatio / u_sizeRatio * 2.0;
  float nodeRadiusNDC = nodeRadiusGraphSpace * matrixScaleX;
  float nodeRadiusPixels = nodeRadiusNDC * u_resolution.x / 2.0;

  // -------------------------------------------------------------------------
  // Step 3: Calculate position offset using shape SDF
  // -------------------------------------------------------------------------
  vec2 positionOffset = vec2(0.0);

  if (a_positionMode < 4.0) {
    // Get the direction from node center toward label position
    vec2 labelDir = getLabelDirection(a_positionMode, u_cameraAngle);

    // Find exact edge distance using shape SDF (normalized space: size = 1.0)
    float edgeDistNormalized = findEdgeDistance(labelDir, 1.0);

    // Scale to screen pixels and add margin
    float boundaryDistPixels = nodeRadiusPixels * edgeDistNormalized;
    positionOffset = labelDir * (boundaryDistPixels + a_margin);
  }
  // Position mode 4 (over): label is centered on node, no offset needed

${positionOffsetRotationCode}

  // -------------------------------------------------------------------------
  // Step 4: Calculate final vertex position
  // -------------------------------------------------------------------------
  // Map quad corner from [-1,1] to [0,1] for interpolation
  vec2 cornerOffset = (a_quadCorner + 1.0) * 0.5;

  // Compute character position in screen pixels:
  // - positionOffset: distance from node center to label origin
  // - a_charOffset: character position within the label
  // - cornerOffset * a_charSize: position within the character quad
  vec2 charPixelPos = positionOffset + a_charOffset + cornerOffset * a_charSize;

  // Convert pixel offset to NDC offset
  // Note: Y is negated because screen Y increases downward, but clip Y increases upward
  vec2 ndcOffset = vec2(charPixelPos.x, -charPixelPos.y) * 2.0 / u_resolution;

  gl_Position = vec4(anchorClip.xy + ndcOffset, 0.0, 1.0);

  // -------------------------------------------------------------------------
  // Step 5: Calculate texture coordinates for glyph sampling
  // -------------------------------------------------------------------------
  // a_texCoords contains (atlasX, atlasY, glyphWidth, glyphHeight) in pixels
  // cornerOffset interpolates across the glyph in the atlas
  v_texCoord = (a_texCoords.xy + cornerOffset * a_texCoords.zw) / u_atlasSize;

  // -------------------------------------------------------------------------
  // Step 6: Pass color to fragment shader
  // -------------------------------------------------------------------------
  v_color = a_color;
  v_color.a *= bias;  // Apply bias to avoid precision issues with alpha
}
`;

  return glsl;
}

// ============================================================================
// Fragment Shader Generation
// ============================================================================

/**
 * Generates the fragment shader for SDF-based text rendering.
 *
 * ## SDF Text Rendering
 *
 * The glyph atlas contains signed distance field data where:
 * - High values (255) = inside the glyph
 * - Low values (0) = outside the glyph
 * - Edge is at value = (1 - cutoff) * 255
 *
 * The shader converts this to smooth anti-aliased alpha using:
 * 1. Threshold subtraction to find signed distance from edge
 * 2. `fwidth()` for screen-space adaptive anti-aliasing
 * 3. `smoothstep()` for smooth alpha transition
 */
export function generateLabelFragmentShader(): string {
  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es
precision highp float;

// ============================================================================
// Varyings (from vertex shader)
// ============================================================================
in vec2 v_texCoord;   // Texture coordinate for glyph sampling
in vec4 v_color;      // Text color

// ============================================================================
// Uniforms
// ============================================================================
uniform sampler2D u_atlas;   // SDF glyph atlas texture
uniform float u_gamma;       // Edge sharpness control (typically √2 ≈ 1.414)
uniform float u_sdfBuffer;   // SDF buffer/cutoff value (typically 0.25)

// ============================================================================
// Outputs (Multiple Render Targets for picking support)
// ============================================================================
layout(location = 0) out vec4 fragColor;    // Visual output
layout(location = 1) out vec4 fragPicking;  // Picking buffer output

// ============================================================================
// Main Fragment Shader
// ============================================================================
void main() {
  // -------------------------------------------------------------------------
  // Step 1: Sample SDF value from atlas
  // -------------------------------------------------------------------------
  // TinySDF encodes distance in alpha channel:
  //   value = 255 - 255 * (distance / radius + cutoff)
  // So: high value = inside glyph, low value = outside glyph
  float sdfValue = texture(u_atlas, v_texCoord).a;

  // -------------------------------------------------------------------------
  // Step 2: Convert to signed distance where 0 = edge
  // -------------------------------------------------------------------------
  // Edge threshold is (1.0 - cutoff), with small offset for thicker rendering
  float edgeThreshold = 1.0 - u_sdfBuffer - 0.02;
  float signedDist = sdfValue - edgeThreshold;
  // signedDist > 0: inside glyph (render as solid)
  // signedDist < 0: outside glyph (render as transparent)

  // -------------------------------------------------------------------------
  // Step 3: Compute anti-aliased alpha
  // -------------------------------------------------------------------------
  // fwidth() gives screen-space rate of change for adaptive anti-aliasing
  // This ensures smooth edges at any zoom level and angle
  float edgeWidth = fwidth(signedDist) * 0.75;
  edgeWidth = clamp(edgeWidth, 0.01, 0.1);  // Prevent too soft/sharp edges

  float alpha = smoothstep(-edgeWidth, edgeWidth, signedDist);

  // -------------------------------------------------------------------------
  // Step 4: Output final color
  // -------------------------------------------------------------------------
  fragColor = vec4(v_color.rgb, v_color.a * alpha);

  // Picking output uses hard threshold for precise hit detection
  fragPicking = v_color;
}
`;

  return glsl;
}

// ============================================================================
// Uniform Collection
// ============================================================================

/**
 * Collects all uniform names required by the label shader.
 *
 * @param shape The SDF shape (may contribute additional uniforms)
 * @return Array of uniform names
 */
export function collectLabelUniforms(shape: SDFShape): string[] {
  const uniforms = [
    // Transform uniforms
    "u_matrix",
    "u_sizeRatio",
    "u_correctionRatio",
    "u_cameraAngle",
    // Label rendering uniforms
    "u_resolution",
    "u_atlasSize",
    "u_atlas",
    "u_gamma",
    "u_sdfBuffer",
  ];

  // Add shape-specific uniforms (avoiding duplicates)
  for (const uniform of shape.uniforms) {
    if (!uniforms.includes(uniform.name)) {
      uniforms.push(uniform.name);
    }
  }

  return uniforms;
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generates complete label shader code and metadata.
 *
 * @param options Shape and configuration options
 * @return Generated shaders and uniform list
 */
export function generateLabelShaders(options: LabelShaderOptions): GeneratedLabelShaders {
  return {
    vertexShader: generateLabelVertexShader(options),
    fragmentShader: generateLabelFragmentShader(),
    uniforms: collectLabelUniforms(options.shape),
  };
}
