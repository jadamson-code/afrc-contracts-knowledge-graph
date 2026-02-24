/**
 * Unit tests for the primitives parser module.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseNodeShape,
  parseNodeLayer,
  parseEdgePath,
  parseEdgeLayer,
  parseEdgeExtremity,
  parseNodePrimitives,
  parseEdgePrimitives,
  clearFactoryRegistry,
  registerFactory,
} from "sigma/primitives";
import type { SDFShape, FragmentLayer, EdgePath, EdgeLayer, EdgeExtremity } from "sigma/rendering";

// =============================================================================
// MOCK FACTORIES
// =============================================================================

// Mock node shape factories
const mockCircleFactory = (): SDFShape => ({
  name: "circle",
  glsl: "float sdf_circle(vec2 uv, float size) { return length(uv) - size; }",
  uniforms: [],
});

const mockSquareFactory = (options?: { cornerRadius?: number }): SDFShape => ({
  name: "square",
  glsl: `float sdf_square(vec2 uv, float size) { /* cornerRadius: ${options?.cornerRadius ?? 0} */ return 0.0; }`,
  uniforms: [],
});

// Mock node layer factories
const mockFillFactory = (options?: { color?: { attribute: string } | string }): FragmentLayer => ({
  name: "fill",
  glsl: "vec4 layer_fill() { return v_color; }",
  uniforms: [],
  attributes: options?.color && typeof options.color === "object" && "attribute" in options.color
    ? [{ name: "fillColor", size: 4, type: WebGL2RenderingContext.UNSIGNED_BYTE, normalized: true, source: options.color.attribute }]
    : [],
});

const mockBorderFactory = (options?: { size?: number | { attribute: string }; color?: string | { attribute: string } }): FragmentLayer => ({
  name: "border",
  glsl: "vec4 layer_border() { return vec4(1.0); }",
  uniforms: [],
  attributes: [],
});

// Mock edge path factories
const mockLineFactory = (): EdgePath => ({
  name: "line",
  glsl: "vec2 path_line_position(float t, vec2 source, vec2 target) { return mix(source, target, t); }",
  segments: 1,
  uniforms: [],
  attributes: [],
});

const mockCurvedFactory = (options?: { curvature?: number | { attribute: string } }): EdgePath => ({
  name: "curved",
  glsl: "vec2 path_curved_position(float t, vec2 source, vec2 target) { return mix(source, target, t); }",
  segments: 10,
  uniforms: [],
  attributes: options?.curvature && typeof options.curvature === "object" && "attribute" in options.curvature
    ? [{ name: "curvature", size: 1, type: WebGL2RenderingContext.FLOAT, source: options.curvature.attribute }]
    : [],
});

// Mock edge layer factories
const mockPlainFactory = (options?: { color?: string | { attribute: string } }): EdgeLayer => ({
  name: "plain",
  glsl: "vec4 layer_plain() { return v_color; }",
  uniforms: [],
  attributes: [],
});

// Mock edge extremity factories
const mockArrowFactory = (options?: { lengthRatio?: number; widthRatio?: number }): EdgeExtremity => ({
  name: "arrow",
  glsl: "float extremity_arrow(vec2 uv, float lengthRatio, float widthRatio) { return 0.0; }",
  length: options?.lengthRatio ?? 5,
  widthFactor: options?.widthRatio ?? 4,
  margin: 0,
  uniforms: [],
  attributes: [],
});

// =============================================================================
// TEST SETUP
// =============================================================================

describe("Primitives Parser", () => {
  beforeEach(() => {
    // Register mock factories before each test
    registerFactory("nodeShape", "circle", mockCircleFactory);
    registerFactory("nodeShape", "square", mockSquareFactory);
    registerFactory("nodeLayer", "fill", mockFillFactory);
    registerFactory("nodeLayer", "border", mockBorderFactory);
    registerFactory("edgePath", "straight", mockLineFactory); // "straight" is the default edge path
    registerFactory("edgePath", "curved", mockCurvedFactory);
    registerFactory("edgeLayer", "plain", mockPlainFactory);
    registerFactory("edgeExtremity", "arrow", mockArrowFactory);
  });

  afterEach(() => {
    // Clear registry after each test
    clearFactoryRegistry();
  });

  // ===========================================================================
  // NODE SHAPE PARSING
  // ===========================================================================

  describe("parseNodeShape", () => {
    it("should parse string form (shorthand)", () => {
      const shape = parseNodeShape("circle");
      expect(shape.name).toBe("circle");
      expect(shape.glsl).toContain("sdf_circle");
    });

    it("should parse declarative form", () => {
      const shape = parseNodeShape({ type: "square", cornerRadius: 5 });
      expect(shape.name).toBe("square");
      expect(shape.glsl).toContain("cornerRadius: 5");
    });

    it("should parse custom form", () => {
      const customShape = parseNodeShape({
        name: "custom",
        glsl: "float sdf_custom(vec2 uv, float size) { return 1.0; }",
        inradiusFactor: 0.8,
      });
      expect(customShape.name).toBe("custom");
      expect(customShape.glsl).toContain("sdf_custom");
      expect(customShape.inradiusFactor).toBe(0.8);
    });

    it("should throw for unknown shape", () => {
      expect(() => parseNodeShape("unknown")).toThrow('Unknown node shape: "unknown"');
    });
  });

  // ===========================================================================
  // NODE LAYER PARSING
  // ===========================================================================

  describe("parseNodeLayer", () => {
    it("should parse string form (shorthand)", () => {
      const layer = parseNodeLayer("fill");
      expect(layer.name).toBe("fill");
    });

    it("should parse declarative form with literal value", () => {
      const layer = parseNodeLayer({ type: "border", size: 2 });
      expect(layer.name).toBe("border");
    });

    it("should parse declarative form with explicit attribute source", () => {
      const layer = parseNodeLayer({ type: "fill", color: { attribute: "myColorVar" } });
      expect(layer.name).toBe("fill");
      expect(layer.attributes.length).toBe(1);
      expect(layer.attributes[0].source).toBe("myColorVar");
    });

    it("should parse custom form", () => {
      const customLayer = parseNodeLayer({
        name: "customLayer",
        glsl: "vec4 layer_custom() { return vec4(1.0); }",
        graphicVariables: [],
      });
      expect(customLayer.name).toBe("customLayer");
    });

    it("should throw for unknown layer", () => {
      expect(() => parseNodeLayer("unknown")).toThrow('Unknown node layer: "unknown"');
    });
  });

  // ===========================================================================
  // EDGE PATH PARSING
  // ===========================================================================

  describe("parseEdgePath", () => {
    it("should parse string form (shorthand)", () => {
      const path = parseEdgePath("straight");
      expect(path.name).toBe("line"); // Factory returns { name: "line" }
      expect(path.segments).toBe(1);
    });

    it("should parse declarative form with explicit attribute source", () => {
      const path = parseEdgePath({ type: "curved", curvature: { attribute: "myCurvatureVar" } });
      expect(path.name).toBe("curved");
      expect(path.attributes.length).toBe(1);
      expect(path.attributes[0].source).toBe("myCurvatureVar");
    });

    it("should parse custom form", () => {
      const customPath = parseEdgePath({
        name: "customPath",
        glsl: "vec2 path_custom_position(float t, vec2 s, vec2 e) { return mix(s, e, t); }",
        segments: 5,
      });
      expect(customPath.name).toBe("customPath");
      expect(customPath.segments).toBe(5);
    });

    it("should throw for unknown path", () => {
      expect(() => parseEdgePath("unknown")).toThrow('Unknown edge path: "unknown"');
    });
  });

  // ===========================================================================
  // EDGE LAYER PARSING
  // ===========================================================================

  describe("parseEdgeLayer", () => {
    it("should parse string form (shorthand)", () => {
      const layer = parseEdgeLayer("plain");
      expect(layer.name).toBe("plain");
    });

    it("should parse declarative form", () => {
      const layer = parseEdgeLayer({ type: "plain", color: "#ff0000" });
      expect(layer.name).toBe("plain");
    });

    it("should parse custom form", () => {
      const customLayer = parseEdgeLayer({
        name: "customEdgeLayer",
        glsl: "vec4 layer_custom() { return vec4(1.0); }",
        graphicVariables: [],
      });
      expect(customLayer.name).toBe("customEdgeLayer");
    });

    it("should throw for unknown layer", () => {
      expect(() => parseEdgeLayer("unknown")).toThrow('Unknown edge layer: "unknown"');
    });
  });

  // ===========================================================================
  // EDGE EXTREMITY PARSING
  // ===========================================================================

  describe("parseEdgeExtremity", () => {
    it("should parse string form (shorthand)", () => {
      const extremity = parseEdgeExtremity("arrow");
      expect(extremity).not.toBeNull();
      expect(extremity!.name).toBe("arrow");
      expect(extremity!.length).toBe(5);
      expect(extremity!.widthFactor).toBe(4);
    });

    it("should return null for 'none'", () => {
      const extremity = parseEdgeExtremity("none");
      expect(extremity).toBeNull();
    });

    it("should parse custom form", () => {
      const customExtremity = parseEdgeExtremity({
        name: "customArrow",
        glsl: "float extremity_custom(vec2 uv, float l, float w) { return 0.0; }",
        length: 3,
        widthFactor: 2,
      });
      expect(customExtremity).not.toBeNull();
      expect(customExtremity!.name).toBe("customArrow");
      expect(customExtremity!.length).toBe(3);
      expect(customExtremity!.widthFactor).toBe(2);
    });

    it("should throw for unknown extremity", () => {
      expect(() => parseEdgeExtremity("unknown")).toThrow('Unknown edge extremity: "unknown"');
    });
  });

  // ===========================================================================
  // FULL PRIMITIVES PARSING
  // ===========================================================================

  describe("parseNodePrimitives", () => {
    it("should parse node primitives with shapes and layers", () => {
      const result = parseNodePrimitives({
        shapes: ["circle", "square"],
        layers: ["fill"],
      });

      expect(result.shapes).toHaveLength(2);
      expect(result.shapes[0].name).toBe("circle");
      expect(result.shapes[1].name).toBe("square");
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe("fill");
    });

    it("should use default primitives when undefined", () => {
      const result = parseNodePrimitives(undefined);
      // Defaults are "circle" and "fill"
      expect(result.shapes).toHaveLength(1);
      expect(result.shapes[0].name).toBe("circle");
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe("fill");
    });

    it("should handle mixed spec types", () => {
      const result = parseNodePrimitives({
        shapes: [
          "circle",
          { type: "square", cornerRadius: 3 },
        ],
        layers: [
          "fill",
          { type: "border", size: 2 },
        ],
      });

      expect(result.shapes).toHaveLength(2);
      expect(result.layers).toHaveLength(2);
    });
  });

  describe("parseEdgePrimitives", () => {
    it("should parse edge primitives with paths, extremities, and layers", () => {
      const result = parseEdgePrimitives({
        paths: ["straight", "curved"],
        extremities: ["arrow"],
        layers: ["plain"],
      });

      expect(result.paths).toHaveLength(2);
      expect(result.paths[0].name).toBe("line");
      expect(result.paths[1].name).toBe("curved");
      expect(result.extremities).toHaveLength(1);
      expect(result.extremities[0].name).toBe("arrow");
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe("plain");
    });

    it("should use default primitives when undefined", () => {
      const result = parseEdgePrimitives(undefined);
      // Defaults are "straight", "none" (filtered out), and "plain"
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0].name).toBe("line");
      expect(result.extremities).toHaveLength(0); // "none" is filtered
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe("plain");
    });

    it("should filter out 'none' extremities", () => {
      const result = parseEdgePrimitives({
        paths: ["straight"],
        extremities: ["none", "arrow", "none"],
        layers: ["plain"],
      });

      expect(result.extremities).toHaveLength(1);
      expect(result.extremities[0].name).toBe("arrow");
    });
  });

  // ===========================================================================
  // VARIABLE REFERENCE RESOLUTION
  // ===========================================================================

  describe("Explicit attribute source passing", () => {
    it("should pass attribute sources through to node layer factories", () => {
      const layer = parseNodeLayer({ type: "fill", color: { attribute: "colorAttribute" } });
      expect(layer.attributes[0].source).toBe("colorAttribute");
    });

    it("should pass attribute sources through to edge path factories", () => {
      const path = parseEdgePath({ type: "curved", curvature: { attribute: "curvatureAttribute" } });
      expect(path.attributes[0].source).toBe("curvatureAttribute");
    });

    it("should preserve literal values", () => {
      // When a literal value is passed, the factory receives the literal
      // Our mock factory for border doesn't create attributes for literal values
      const layer = parseNodeLayer({ type: "border", size: 2, color: "#ff0000" });
      // No attributes created for literal values
      expect(layer.attributes).toHaveLength(0);
    });
  });
});
