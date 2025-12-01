/**
 * Sigma.js Shader Generator
 * ==========================
 *
 * Generates optimized GLSL shaders from SDF shapes and fragment layers.
 *
 * @module
 */
import { numberToGLSLFloat } from "../utils";
import { AttributeSpecification, FragmentLayer, SDFShape } from "./types";

export interface GeneratedShaders {
  vertexShader: string;
  fragmentShader: string;
  uniforms: string[];
  attributes: AttributeSpecification[];
}

export interface ShaderGenerationOptions {
  shape: SDFShape;
  layers: FragmentLayer[];
  rotateWithCamera?: boolean;
}

/**
 * Generates vertex shader for a quad with UV coordinates.
 * Always renders a single quad (4 vertices) per node using instanced rendering.
 *
 * @param shape - The SDF shape definition
 * @param layers - Array of fragment layers
 * @param rotateWithCamera - Whether nodes should rotate with the camera (default: false)
 */
export function generateVertexShader(shape: SDFShape, layers: FragmentLayer[], rotateWithCamera = false): string {
  // Standard uniforms that are always declared (to avoid redefinition)
  const standardUniforms = new Set(["u_matrix", "u_sizeRatio", "u_correctionRatio", "u_cameraAngle"]);

  // Collect all uniforms from shape and layers, excluding standard ones and with deduplication
  const seenUniforms = new Set<string>();
  const shapeUniforms = shape.uniforms
    .filter((u) => !standardUniforms.has(u.name) && !seenUniforms.has(u.name))
    .map((u) => {
      seenUniforms.add(u.name);
      return `uniform ${u.type} ${u.name};`;
    })
    .join("\n");
  const layerUniforms = layers
    .flatMap((layer) => layer.uniforms)
    .filter((u) => !standardUniforms.has(u.name) && !seenUniforms.has(u.name))
    .map((u) => {
      seenUniforms.add(u.name);
      return `uniform ${u.type} ${u.name};`;
    })
    .join("\n");

  // Collect all layer attributes as inputs
  const layerAttributes = layers
    .flatMap((layer) => layer.attributes)
    .map((a) => {
      const glslType = a.size === 1 ? "float" : `vec${a.size}`;
      const attrName = a.name.startsWith("a_") ? a.name : `a_${a.name}`;
      return `in ${glslType} ${attrName};`;
    })
    .join("\n");

  // Collect all layer varyings as outputs
  const layerVaryings = layers
    .flatMap((layer) => layer.attributes)
    .map((a) => {
      const glslType = a.size === 1 ? "float" : `vec${a.size}`;
      return `out ${glslType} v_${a.name};`;
    })
    .join("\n");

  // Generate code to pass layer attributes to varyings
  const layerVaryingAssignments = layers
    .flatMap((layer) => layer.attributes)
    .map((a) => {
      const attrName = a.name.startsWith("a_") ? a.name : `a_${a.name}`;
      return `  v_${a.name} = ${attrName};`;
    })
    .join("\n");

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es

// Standard node attributes (per instance)
in vec2 a_position;    // Node center position in graph space
in float a_size;       // Node size
in vec4 a_color;       // Node color
in vec4 a_id;          // Node ID for picking

// Constant attributes (per vertex, same for all instances)
in vec2 a_quadCorner;  // (-1,-1), (1,-1), (1,1), (-1,1) for quad corners

// Layer attributes (per instance)
${layerAttributes}

// Standard uniforms
uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_cameraAngle;

${shapeUniforms}
${layerUniforms}

// Standard varyings
out vec2 v_uv;                    // Normalized coordinates [-1, 1]
out vec4 v_color;
out vec4 v_id;
out float v_antialiasingWidth;    // Width for antialiasing in UV space
out float v_pixelSize;            // Node size in pixels (for pixel-mode borders)
out float v_pixelToUV;            // Conversion factor: multiply by this to convert screen pixels to UV units

// Layer varyings
${layerVaryings}

const float bias = 255.0 / 254.0;

void main() {
  // Calculate the actual size in pixels
  float size = a_size * u_correctionRatio / u_sizeRatio * 2.0;

  // Calculate vertex position (center + offset for quad corner)
  vec2 offset = a_quadCorner * size;
${
  rotateWithCamera
    ? ""
    : `  // Counter-rotate the quad offset so nodes stay upright when camera rotates
  float c = cos(u_cameraAngle);
  float s = sin(u_cameraAngle);
  offset = mat2(c, s, -s, c) * offset;
`
}  vec2 position = a_position + offset;

  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  // Pass UV coordinates (already in [-1, 1] range from a_quadCorner)
  v_uv = a_quadCorner;

  // Pass color and ID to fragment shader
  v_color = a_color;
  v_color.a *= bias;
  v_id = a_id;

  // Pass pixel size for layers that need pixel-mode calculations
  // Multiply by 2 because 'size' is half-width (offset from center), not full diameter
  v_pixelSize = size * 2.0;

  // Conversion factor from screen pixels to UV units
  // Same derivation as v_antialiasingWidth which represents ~1 pixel in UV space
  // P pixels in UV space = P * u_correctionRatio / size
  v_pixelToUV = u_correctionRatio / size;

  // We use an antialiasing width of 1px (so v_pixelToUV)
  v_antialiasingWidth = v_pixelToUV;

  // Pass layer attributes to fragment shader
${layerVaryingAssignments}
}
`;

  return glsl;
}

/**
 * Generates fragment shader that applies SDF shape and layers.
 */
export function generateFragmentShader(shape: SDFShape, layers: FragmentLayer[]): string {
  // Extract shape function name from GLSL code
  const shapeFunctionName = `sdf_${shape.name}`;
  const shapeParams = shape.uniforms.map((u) => u.name).join(", ");

  // Generate layer function calls with "over" compositing
  const layerCalls = layers
    .map((layer, index) => {
      const layerFunctionName = `layer_${layer.name}`;
      // Collect only layer-specific parameters (attributes + uniforms)
      const layerParams = [...layer.attributes.map((a) => `v_${a.name}`), ...layer.uniforms.map((u) => u.name)].join(
        ", ",
      );

      // Layer signature: vec4 layer_name(...layerParams) - context accessed via global ctx
      return `  // Layer ${index + 1}: ${layer.name}
  color = blendOver(color, ${layerFunctionName}(${layerParams}));`;
    })
    .join("\n\n");

  // Standard uniforms that are already declared in the fragment shader
  const standardFragmentUniforms = new Set(["u_correctionRatio"]);

  // Collect all uniforms from shape and layers, with deduplication
  const seenUniforms = new Set<string>();
  const shapeUniforms = shape.uniforms
    .filter((u) => !standardFragmentUniforms.has(u.name) && !seenUniforms.has(u.name))
    .map((u) => {
      seenUniforms.add(u.name);
      return `uniform ${u.type} ${u.name};`;
    })
    .join("\n");
  const layerUniforms = layers
    .flatMap((layer) => layer.uniforms)
    .filter((u) => !standardFragmentUniforms.has(u.name) && !seenUniforms.has(u.name))
    .map((u) => {
      seenUniforms.add(u.name);
      return `uniform ${u.type} ${u.name};`;
    })
    .join("\n");

  // Collect all varyings from layers
  const layerVaryings = layers
    .flatMap((layer) => layer.attributes)
    .map((a) => {
      const glslType = a.size === 1 ? "float" : `vec${a.size}`;
      return `in ${glslType} v_${a.name};`;
    })
    .join("\n");

  // language=GLSL
  const glsl = /*glsl*/ `#version 300 es
precision highp float;

// Standard varyings
in vec2 v_uv;
in vec4 v_color;
in vec4 v_id;
in float v_antialiasingWidth;
in float v_pixelSize;
in float v_pixelToUV;

// Standard uniforms (needed for some layer calculations like pixel-mode borders)
uniform float u_correctionRatio;

// Shape uniforms
${shapeUniforms}

// Layer uniforms
${layerUniforms}

// Layer varyings
${layerVaryings}

// Multiple Render Targets outputs
layout(location = 0) out vec4 fragColor;   // Visual rendering
layout(location = 1) out vec4 fragPicking; // Picking

const float bias = 255.0 / 254.0;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

// LayerContext struct - provides rendering context to all layers
struct LayerContext {
  float sdf;             // Signed distance from shape boundary (negative inside)
  vec2 uv;               // UV coordinates [-1, 1], center at (0,0)
  float shapeSize;       // Effective shape size (~diameter) in UV space (1.0 - aaWidth)
  float shapeHalfSize;   // Effective shape half size (~radius) in UV space
  float pixelSize;       // Node full size (~diameter) in screen pixels
  float aaWidth;         // Anti-aliasing width for smooth transitions
  float correctionRatio; // Scaling factor for consistent rendering across zoom levels
  float pixelToUV;       // Conversion factor: multiply screen pixels by this to get UV units
  float inradiusFactor;  // Ratio of inradius to circumradius (shape depth factor)
};

LayerContext context;  // Global instance, populated before layer calls

// Alpha "over" compositing for layer blending
vec4 blendOver(vec4 bg, vec4 fg) {
  float a = fg.a;
  return vec4(mix(bg.rgb, fg.rgb, a), bg.a + a * (1.0 - bg.a));
}

// SDF shape function
${shape.glsl}

// Layer functions
${layers.map((layer) => layer.glsl).join("\n\n")}

void main() {
  // 1. Setup LayerContext (available to all layer functions)
  context.shapeSize = 1.0 - v_antialiasingWidth;
  context.shapeHalfSize = context.shapeSize * 0.5;
  context.pixelSize = v_pixelSize;
  context.sdf = ${shapeFunctionName}(v_uv, context.shapeSize${shapeParams ? ", " + shapeParams : ""});
  context.uv = v_uv;
  context.aaWidth = v_antialiasingWidth;
  context.correctionRatio = u_correctionRatio;
  context.pixelToUV = v_pixelToUV;
  context.inradiusFactor = ${numberToGLSLFloat(shape.inradiusFactor ?? 1.0)};

  // 2. Early discard for pixels fully outside the shape (with AA margin)
  if (context.sdf > context.aaWidth) {
    discard;
  }

  // 3. Apply layers sequentially with "over" compositing
  vec4 color = vec4(0.0);

${layerCalls}

  // 4. Apply antialiasing at shape boundary
  // smoothstep provides smooth transition from opaque to transparent
  float alpha = smoothstep(context.aaWidth, -context.aaWidth, context.sdf);
  // Mix with transparent to fade both color AND alpha together (avoids bright halo)
  color = mix(vec4(0.0), color, alpha);

  // 5. Output to both render targets
  // Output 0: Visual rendering with antialiasing
  fragColor = color;

  // Output 1: Picking (with hard cutoff, no antialiasing)
  if (context.sdf > 0.0) {
    fragPicking = transparent;
  } else {
    fragPicking = v_id;
    fragPicking.a *= bias;
  }
}
`;

  return glsl;
}

/**
 * Collects all uniforms from shape and layers, with deduplication.
 */
export function collectUniforms(shape: SDFShape, layers: FragmentLayer[]): string[] {
  const uniformNames = new Set<string>();

  // Standard uniforms (always present)
  uniformNames.add("u_matrix");
  uniformNames.add("u_sizeRatio");
  uniformNames.add("u_correctionRatio");
  uniformNames.add("u_cameraAngle");

  // Shape uniforms
  shape.uniforms.forEach((u) => uniformNames.add(u.name));

  // Layer uniforms
  layers.forEach((layer) => {
    layer.uniforms.forEach((u) => uniformNames.add(u.name));
  });

  return Array.from(uniformNames);
}

/**
 * Collects all attributes from layers, with deduplication.
 */
export function collectAttributes(layers: FragmentLayer[]): AttributeSpecification[] {
  const attributeMap = new Map<string, AttributeSpecification>();

  // Standard node attributes (always present)
  const { UNSIGNED_BYTE, FLOAT } = WebGL2RenderingContext;

  attributeMap.set("a_position", { name: "a_position", size: 2, type: FLOAT });
  attributeMap.set("a_size", { name: "a_size", size: 1, type: FLOAT });
  attributeMap.set("a_color", { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true });
  attributeMap.set("a_id", { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true });

  // Layer-specific attributes
  layers.forEach((layer) => {
    layer.attributes.forEach((attr) => {
      // Prefix with 'a_' if not already present
      const attrName = attr.name.startsWith("a_") ? attr.name : `a_${attr.name}`;
      if (!attributeMap.has(attrName)) {
        attributeMap.set(attrName, { ...attr, name: attrName });
      }
    });
  });

  return Array.from(attributeMap.values());
}

/**
 * Main generator function that produces complete shader code and metadata.
 */
export function generateShaders(options: ShaderGenerationOptions): GeneratedShaders {
  const { shape, layers, rotateWithCamera = false } = options;

  return {
    vertexShader: generateVertexShader(shape, layers, rotateWithCamera),
    fragmentShader: generateFragmentShader(shape, layers),
    uniforms: collectUniforms(shape, layers),
    attributes: collectAttributes(layers),
  };
}
